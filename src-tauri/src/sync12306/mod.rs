use serde_json::{json, Value};
use std::sync::mpsc::sync_channel;
use std::time::{Duration, Instant};
use tauri::ipc::Channel;
use tauri::{Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

const WINDOW_LABEL: &str = "login-12306";
const LOGIN_URL: &str = "https://kyfw.12306.cn/otn/resources/login.html";
const USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15";
const BRIDGE: &str = include_str!("bridge.js");

fn ensure_window(app: &tauri::AppHandle) -> Result<WebviewWindow, String> {
    if let Some(existing) = app.get_webview_window(WINDOW_LABEL) {
        let _ = existing.show();
        let _ = existing.unminimize();
        let _ = existing.set_focus();
        return Ok(existing);
    }

    let (tx, rx) = sync_channel(1);
    let handle = app.clone();
    app.run_on_main_thread(move || {
        let result: Result<(), String> = (|| {
            let url = LOGIN_URL
                .parse()
                .map_err(|err: url::ParseError| err.to_string())?;
            WebviewWindowBuilder::new(&handle, WINDOW_LABEL, WebviewUrl::External(url))
                .title("登录 12306 — 火车记")
                .inner_size(1100.0, 780.0)
                .center()
                .user_agent(USER_AGENT)
                .initialization_script(BRIDGE)
                .build()
                .map_err(|err| err.to_string())?;
            Ok(())
        })();
        let _ = tx.send(result);
    })
    .map_err(|err| err.to_string())?;
    rx.recv().map_err(|_| "无法打开 12306 窗口".to_string())??;
    app.get_webview_window(WINDOW_LABEL)
        .ok_or_else(|| "无法打开 12306 窗口".to_string())
}

fn eval_json(window: &WebviewWindow, js: &str, timeout: Duration) -> Result<Value, String> {
    let (tx, rx) = sync_channel(1);
    window
        .eval_with_callback(js, move |payload| {
            let _ = tx.send(payload);
        })
        .map_err(|err| err.to_string())?;
    let raw = rx
        .recv_timeout(timeout)
        .map_err(|_| "读取 12306 页面超时".to_string())?;
    if raw.is_empty() || raw == "undefined" {
        return Ok(Value::Null);
    }
    serde_json::from_str(&raw).map_err(|err| format!("页面脚本返回无法解析：{err}（{raw}）"))
}

fn window_alive(app: &tauri::AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window(WINDOW_LABEL)
        .ok_or_else(|| "已取消：12306 登录窗口已关闭".to_string())
}

fn sleep_ms(ms: u64) {
    std::thread::sleep(Duration::from_millis(ms));
}

fn text_field<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    value.get(key).and_then(Value::as_str)
}

/// 打开（或复用）12306 窗口，等用户自行登录后在该窗口同源请求订单接口。
#[tauri::command]
pub async fn sync_12306_orders(
    app: tauri::AppHandle,
    on_status: Channel<String>,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _ = on_status.send("正在打开 12306 登录窗口…".to_string());
        let window = ensure_window(&app)?;
        // 登录页若在 www 域，cookie 不会带到 kyfw，强制回到 kyfw。
        let _ = window.eval(
            "if (location.hostname && location.hostname !== 'kyfw.12306.cn') { location.href = 'https://kyfw.12306.cn/otn/resources/login.html'; }",
        );
        sleep_ms(600);
        let _ = window.eval(BRIDGE);

        let _ = on_status.send("请在弹出的窗口中登录 12306（账号不会保存到火车记）".to_string());
        let login_deadline = Instant::now() + Duration::from_secs(10 * 60);
        loop {
            let window = window_alive(&app)?;
            if Instant::now() > login_deadline {
                return Err("等待登录超时。登录完成后请再点一次同步。".into());
            }
            let _ = window.eval(BRIDGE);
            let started = eval_json(
                &window,
                "window.__rfBridge ? window.__rfBridge.startLoginCheck() : {state:'missing'}",
                Duration::from_secs(8),
            )?;
            if text_field(&started, "state") == Some("missing") {
                sleep_ms(700);
                continue;
            }
            loop {
                sleep_ms(400);
                let window = window_alive(&app)?;
                let status = eval_json(
                    &window,
                    "window.__rfBridge ? window.__rfBridge.loginStatus() : {state:'missing'}",
                    Duration::from_secs(8),
                )?;
                match text_field(&status, "state") {
                    Some("done") => break,
                    Some("missing") | Some("idle") => break,
                    _ => continue,
                }
            }
            let window = window_alive(&app)?;
            let confirm = eval_json(
                &window,
                "window.__rfBridge ? window.__rfBridge.loginStatus() : {state:'missing'}",
                Duration::from_secs(8),
            )?;
            if confirm.get("loggedIn").and_then(Value::as_bool) == Some(true) {
                break;
            }
            sleep_ms(1200);
        }

        let window = window_alive(&app)?;
        let _ = on_status.send("已登录，正在读取订单…".to_string());
        let _ = window.eval(BRIDGE);
        let started = eval_json(
            &window,
            "window.__rfBridge ? window.__rfBridge.startCollect() : {state:'missing'}",
            Duration::from_secs(8),
        )?;
        if text_field(&started, "state") == Some("missing") {
            return Err("无法在 12306 页面注入读取脚本，请关闭窗口后重试".into());
        }

        let collect_deadline = Instant::now() + Duration::from_secs(5 * 60);
        loop {
            if Instant::now() > collect_deadline {
                return Err("读取订单超时，请稍后重试".into());
            }
            sleep_ms(500);
            let window = window_alive(&app)?;
            let status = eval_json(
                &window,
                "window.__rfBridge ? window.__rfBridge.collectStatus() : {state:'missing'}",
                Duration::from_secs(8),
            )?;
            if let Some(progress) = text_field(&status, "progress") {
                if !progress.is_empty() {
                    let _ = on_status.send(progress.to_string());
                }
            }
            match text_field(&status, "state") {
                Some("done") => {
                    let result = status.get("result").cloned().unwrap_or(Value::Null);
                    if result.get("ok").and_then(Value::as_bool) == Some(true) {
                        let tickets = result.get("tickets").cloned().unwrap_or_else(|| json!([]));
                        let count = tickets.as_array().map(Vec::len).unwrap_or(0);
                        let _ = on_status.send(format!("已从 12306 读取 {count} 条车票"));
                        return Ok(tickets);
                    }
                    let error = result
                        .get("error")
                        .and_then(Value::as_str)
                        .unwrap_or("读取订单失败");
                    return Err(error.to_string());
                }
                Some("missing") => return Err("12306 页面已跳转，读取中断，请再点一次同步".into()),
                _ => continue,
            }
        }
    })
    .await
    .map_err(|err| err.to_string())?
}
