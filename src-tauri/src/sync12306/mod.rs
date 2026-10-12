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

/// 页面跳转时脚本可能还没返回。超时或空结果记为 None，由外层继续等。
fn try_eval_json(
    window: &WebviewWindow,
    js: &str,
    timeout: Duration,
) -> Result<Option<Value>, String> {
    let (tx, rx) = sync_channel(1);
    window
        .eval_with_callback(js, move |payload| {
            let _ = tx.send(payload);
        })
        .map_err(|err| err.to_string())?;
    let raw = match rx.recv_timeout(timeout) {
        Ok(raw) => raw,
        Err(_) => return Ok(None),
    };
    if raw.is_empty() || raw == "undefined" || raw == "null" {
        return Ok(None);
    }
    Ok(serde_json::from_str(&raw).ok())
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

const LOGIN_EXPR: &str =
    "window.__rfBridge ? window.__rfBridge.loginStatus() : {state:'missing'}";
const START_LOGIN_EXPR: &str =
    "window.__rfBridge ? window.__rfBridge.startLoginCheck() : {state:'missing'}";
const COLLECT_EXPR: &str =
    "window.__rfBridge ? window.__rfBridge.collectStatus() : {state:'missing'}";
const START_COLLECT_EXPR: &str =
    "window.__rfBridge ? window.__rfBridge.startCollect() : {state:'missing'}";
const PAGE_EXPR: &str = "({ready:document.readyState,path:location.pathname,host:location.hostname})";
const ORDER_PAGE: &str = "https://kyfw.12306.cn/otn/view/train_order.html";

fn inject_bridge(window: &WebviewWindow) {
    let _ = window.eval(BRIDGE);
}

fn wait_for_login(app: &tauri::AppHandle, on_status: &Channel<String>) -> Result<(), String> {
    let _ = on_status.send("请在弹出的窗口中登录 12306（账号不会保存到火车记）".to_string());
    let deadline = Instant::now() + Duration::from_secs(10 * 60);
    let mut checking = false;
    loop {
        if Instant::now() > deadline {
            return Err("等待登录超时。登录完成后请再点一次同步。".into());
        }
        let window = window_alive(app)?;
        inject_bridge(&window);
        if !checking {
            let started = try_eval_json(&window, START_LOGIN_EXPR, Duration::from_secs(4))?;
            match started.as_ref().and_then(|value| text_field(value, "state")) {
                Some("missing") | None => {
                    sleep_ms(700);
                    continue;
                }
                _ => checking = true,
            }
        }
        sleep_ms(400);
        let window = window_alive(app)?;
        let status = try_eval_json(&window, LOGIN_EXPR, Duration::from_secs(4))?;
        match status.as_ref().and_then(|value| text_field(value, "state")) {
            Some("done") => {
                if status
                    .as_ref()
                    .and_then(|value| value.get("loggedIn"))
                    .and_then(Value::as_bool)
                    == Some(true)
                {
                    return Ok(());
                }
                checking = false;
                sleep_ms(1000);
            }
            Some("running") => {}
            _ => checking = false,
        }
    }
}

fn open_order_page(app: &tauri::AppHandle, on_status: &Channel<String>) -> Result<(), String> {
    let _ = on_status.send("已登录，正在打开订单页…".to_string());
    let window = window_alive(app)?;
    let _ = window.eval(&format!(
        "if (location.pathname.indexOf('train_order') === -1) {{ location.href = '{ORDER_PAGE}'; }}"
    ));
    let deadline = Instant::now() + Duration::from_secs(60);
    loop {
        if Instant::now() > deadline {
            return Err("打开订单页超时，请再点一次同步".into());
        }
        sleep_ms(400);
        let window = window_alive(app)?;
        let Some(page) = try_eval_json(&window, PAGE_EXPR, Duration::from_secs(3))? else {
            continue;
        };
        let host = text_field(&page, "host").unwrap_or("");
        let path = text_field(&page, "path").unwrap_or("");
        let ready = text_field(&page, "ready").unwrap_or("");
        if host == "www.12306.cn" {
            let _ = window.eval(&format!("location.href = '{ORDER_PAGE}';"));
            sleep_ms(800);
            continue;
        }
        if host == "kyfw.12306.cn" && path.contains("train_order") && ready == "complete" {
            // 等订单页自己的脚本把会话用起来，再发查询。
            sleep_ms(600);
            return Ok(());
        }
    }
}

fn collect_tickets(app: &tauri::AppHandle, on_status: &Channel<String>) -> Result<Value, String> {
    let _ = on_status.send("已登录，正在读取订单…".to_string());
    let deadline = Instant::now() + Duration::from_secs(5 * 60);
    let mut started = false;
    let mut last_progress = String::new();
    loop {
        if Instant::now() > deadline {
            return Err("读取订单超时，请稍后重试".into());
        }
        let window = window_alive(app)?;
        inject_bridge(&window);
        if !started {
            let start = try_eval_json(&window, START_COLLECT_EXPR, Duration::from_secs(4))?;
            match start.as_ref().and_then(|value| text_field(value, "state")) {
                Some("missing") | None => {
                    sleep_ms(500);
                    continue;
                }
                _ => started = true,
            }
        }
        sleep_ms(500);
        let window = window_alive(app)?;
        let Some(status) = try_eval_json(&window, COLLECT_EXPR, Duration::from_secs(8))? else {
            continue;
        };
        if let Some(progress) = text_field(&status, "progress") {
            if !progress.is_empty() && progress != last_progress {
                last_progress = progress.to_string();
                let _ = on_status.send(last_progress.clone());
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
            Some("missing") | Some("idle") => started = false,
            _ => {}
        }
    }
}

/// 打开（或复用）12306 窗口，等用户自行登录后打开订单页并同源拉取行程。
#[tauri::command]
pub async fn sync_12306_orders(
    app: tauri::AppHandle,
    on_status: Channel<String>,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _ = on_status.send("正在打开 12306 登录窗口…".to_string());
        let window = ensure_window(&app)?;
        // 停在 www 时 cookie 到不了 kyfw 的订单接口，拉回登录页，已登录会被 12306 自己转走。
        let _ = window.eval(
            "if (location.hostname && location.hostname !== 'kyfw.12306.cn') { location.href = 'https://kyfw.12306.cn/otn/resources/login.html'; }",
        );
        sleep_ms(600);
        inject_bridge(&window);
        wait_for_login(&app, &on_status)?;
        open_order_page(&app, &on_status)?;
        collect_tickets(&app, &on_status)
    })
    .await
    .map_err(|err| err.to_string())?
}
