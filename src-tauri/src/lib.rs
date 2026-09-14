mod commands;
mod sync12306;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::load_archive,
            commands::save_archive,
            commands::backup_archive,
            commands::write_text_file,
            commands::write_binary_file,
            commands::read_text_file,
            commands::ocr_images,
            commands::list_images,
            sync12306::sync_12306_orders,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
