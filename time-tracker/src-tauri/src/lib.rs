mod db;
mod commands;

use commands::AppState;
use rusqlite::Connection;
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let db_path = db::get_db_path();
    let conn = Connection::open(&db_path)
        .expect("Failed to open database");
    db::init_db(&conn).expect("Failed to initialize database");

    tauri::Builder::default()
        .manage(AppState {
            db: Mutex::new(conn),
        })
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }

                    let s = shortcut.to_string();
                    let Some(window) = app.get_webview_window("main") else {
                        return;
                    };

                    if s == "shift+control+KeyH" || s == "control+shift+KeyH" {
                        let is_visible = window.is_visible().unwrap_or(true);
                        if is_visible {
                            let _ = window.hide();
                        } else {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    } else if s == "shift+control+KeyT" || s == "control+shift+KeyT" {
                        let is_on_top = window.is_always_on_top().unwrap_or(false);
                        let _ = window.set_always_on_top(!is_on_top);
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            use tauri_plugin_global_shortcut::Shortcut;

            app.autolaunch().enable()?;

            let hide_shortcut: Shortcut = "ctrl+shift+KeyH".parse().unwrap();
            let toggle_top_shortcut: Shortcut = "ctrl+shift+KeyT".parse().unwrap();

            app.global_shortcut().register(hide_shortcut)?;
            app.global_shortcut().register(toggle_top_shortcut)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_categories,
            commands::add_category,
            commands::remove_category,
            commands::update_category,
            commands::start_timer,
            commands::stop_timer,
            commands::get_running_timer,
            commands::get_stats,
            commands::get_today_log,
            commands::get_weekly_bars,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
