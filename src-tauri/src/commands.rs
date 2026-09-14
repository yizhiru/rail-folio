use serde::Serialize;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::ipc::Channel;
use tauri::Manager;

#[derive(Serialize, Clone)]
pub struct OcrItem {
    pub path: String,
    pub text: String,
    pub error: Option<String>,
}

const ARCHIVE_FILE: &str = "trips.json";
const MAX_IMAGES: usize = 200;
const MAX_DEPTH: u32 = 2;
const IMAGE_EXTS: &[&str] = &[
    "png", "jpg", "jpeg", "webp", "heic", "heif", "tif", "tiff", "bmp",
];

fn archive_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join(ARCHIVE_FILE))
}

/// 先写临时文件并落盘，再 rename 覆盖，保证任何时刻磁盘上都有一份完整的文件。
fn write_atomic(path: &Path, contents: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| format!("非法路径：{}", path.display()))?;
    let tmp = path.with_file_name(format!("{file_name}.tmp"));
    let result = (|| -> std::io::Result<()> {
        let mut file = fs::File::create(&tmp)?;
        file.write_all(contents.as_bytes())?;
        file.sync_all()?;
        fs::rename(&tmp, path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn load_archive(app: tauri::AppHandle) -> Result<String, String> {
    let path = archive_path(&app)?;
    if !path.exists() {
        return Ok(String::new());
    }
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_archive(app: tauri::AppHandle, json: String) -> Result<(), String> {
    let path = archive_path(&app)?;
    write_atomic(&path, &json)
}

/// 档案损坏时把原文件改名保留，返回备份路径；前端随后从空档案开始。
#[tauri::command]
pub async fn backup_archive(app: tauri::AppHandle) -> Result<String, String> {
    let path = archive_path(&app)?;
    if !path.exists() {
        return Ok(String::new());
    }
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let backup = path.with_file_name(format!("trips.corrupt-{stamp}.json"));
    fs::rename(&path, &backup).map_err(|e| e.to_string())?;
    Ok(backup.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn write_text_file(path: String, contents: String) -> Result<(), String> {
    write_atomic(Path::new(&path), &contents)
}

#[tauri::command]
pub async fn write_binary_file(path: String, contents: Vec<u8>) -> Result<(), String> {
    let dest = Path::new(&path);
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(dest, contents).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_images(dir: String) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut out = Vec::new();
        collect_images(Path::new(&dir), 0, &mut out)?;
        out.sort();
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn collect_images(dir: &Path, depth: u32, out: &mut Vec<String>) -> Result<(), String> {
    if depth > MAX_DEPTH || out.len() >= MAX_IMAGES {
        return Ok(());
    }
    let entries = fs::read_dir(dir).map_err(|err| err.to_string())?;
    for entry in entries {
        if out.len() >= MAX_IMAGES {
            break;
        }
        let path = entry.map_err(|err| err.to_string())?.path();
        if path.is_dir() {
            collect_images(&path, depth + 1, out)?;
        } else if is_image(&path) {
            out.push(path.to_string_lossy().into_owned());
        }
    }
    Ok(())
}

fn is_image(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| IMAGE_EXTS.contains(&ext.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

/// 在后台线程池里并行识别，每张完成立即通过 channel 推给前端，不阻塞主线程。
#[tauri::command]
pub async fn ocr_images(paths: Vec<String>, on_item: Channel<OcrItem>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let workers = std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(2)
            .clamp(1, 4)
            .min(paths.len().max(1));
        let queue = Arc::new(Mutex::new(paths.into_iter()));
        std::thread::scope(|scope| {
            for _ in 0..workers {
                let queue = Arc::clone(&queue);
                let on_item = on_item.clone();
                scope.spawn(move || loop {
                    let next = queue.lock().ok().and_then(|mut iter| iter.next());
                    let Some(path) = next else { break };
                    let _ = on_item.send(ocr_one(path));
                });
            }
        });
    })
    .await
    .map_err(|e| e.to_string())
}

fn ocr_one(path: String) -> OcrItem {
    match recognize_text(&path) {
        Ok(text) => OcrItem {
            path,
            text,
            error: None,
        },
        Err(error) => OcrItem {
            path,
            text: String::new(),
            error: Some(error),
        },
    }
}

#[cfg(target_os = "macos")]
fn recognize_text(path: &str) -> Result<String, String> {
    macos_ocr::recognize(path)
}

#[cfg(not(target_os = "macos"))]
fn recognize_text(_path: &str) -> Result<String, String> {
    Err("本机 OCR 目前仅支持 macOS".into())
}

#[cfg(target_os = "macos")]
mod macos_ocr {
    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;
    use objc2::AnyThread;
    use objc2_foundation::{NSArray, NSData, NSDictionary, NSString};
    use objc2_vision::{
        VNImageOption, VNImageRequestHandler, VNRecognizeTextRequest, VNRequest,
        VNRequestTextRecognitionLevel,
    };

    pub fn recognize(path: &str) -> Result<String, String> {
        let bytes = std::fs::read(path).map_err(|err| err.to_string())?;
        let data = NSData::from_vec(bytes);
        let request = VNRecognizeTextRequest::new();
        request.setRecognitionLevel(VNRequestTextRecognitionLevel::Accurate);
        request.setUsesLanguageCorrection(true);
        request.setAutomaticallyDetectsLanguage(true);
        let languages = NSArray::from_retained_slice(&[
            NSString::from_str("zh-Hans"),
            NSString::from_str("zh-Hant"),
            NSString::from_str("en-US"),
        ]);
        request.setRecognitionLanguages(&languages);

        let options: Retained<NSDictionary<VNImageOption, AnyObject>> = NSDictionary::new();
        let handler =
            VNImageRequestHandler::initWithData_options(VNImageRequestHandler::alloc(), &data, &options);

        let requests = NSArray::<VNRequest>::from_slice(&[request.as_ref()]);
        handler
            .performRequests_error(&requests)
            .map_err(|err| err.to_string())?;

        let Some(results) = request.results() else {
            return Ok(String::new());
        };

        let mut lines: Vec<String> = Vec::new();
        for observation in results {
            let candidates = observation.topCandidates(1);
            if let Some(candidate) = candidates.firstObject() {
                lines.push(candidate.string().to_string());
            }
        }
        Ok(lines.join("\n"))
    }
}
