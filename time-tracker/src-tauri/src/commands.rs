use std::sync::Mutex;
use rusqlite::Connection;
use crate::db::{self, Category, TimeEntry, CategoryStats, RunningTimer, DailyBar};

pub struct AppState {
    pub db: Mutex<Connection>,
}

// ---------- Categories ----------

#[tauri::command]
pub fn get_categories(state: tauri::State<'_, AppState>) -> Result<Vec<Category>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db::fetch_categories(&db).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_category(
    state: tauri::State<'_, AppState>,
    name: String,
    color: String,
) -> Result<Category, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db::insert_category(&db, &name, &color).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_category(
    state: tauri::State<'_, AppState>,
    id: i64,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db::delete_category(&db, id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_category(
    state: tauri::State<'_, AppState>,
    id: i64,
    name: String,
    color: String,
) -> Result<Category, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db::update_category(&db, id, &name, &color).map_err(|e| e.to_string())
}

// ---------- Timer ----------

#[tauri::command]
pub fn start_timer(
    state: tauri::State<'_, AppState>,
    category_id: i64,
) -> Result<RunningTimer, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    // Stop any currently running timer first
    if let Ok(Some(running)) = db::fetch_running_entry(&db) {
        db::stop_entry(&db, running.entry.id).map_err(|e| e.to_string())?;
    }

    db::insert_start(&db, category_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn stop_timer(
    state: tauri::State<'_, AppState>,
) -> Result<TimeEntry, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let running = db::fetch_running_entry(&db)
        .map_err(|e| e.to_string())?
        .ok_or("No timer running")?;
    db::stop_entry(&db, running.entry.id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_running_timer(
    state: tauri::State<'_, AppState>,
) -> Result<Option<RunningTimer>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db::fetch_running_entry(&db).map_err(|e| e.to_string())
}

// ---------- Stats ----------

#[tauri::command]
pub fn get_stats(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<CategoryStats>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db::fetch_category_stats(&db).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_today_log(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<TimeEntry>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db::fetch_today_entries(&db).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_weekly_bars(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<DailyBar>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db::fetch_weekly_bar_data(&db).map_err(|e| e.to_string())
}
