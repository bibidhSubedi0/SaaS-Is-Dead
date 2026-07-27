use chrono::{Local, Duration, Datelike, SecondsFormat};
use rusqlite::{Connection, params, Result as SqlResult};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

// ---------- Types ----------

#[derive(Debug, Serialize, Clone, Deserialize)]
pub struct Category {
    pub id: i64,
    pub name: String,
    pub color: String,
    pub sort_order: i32,
}

#[derive(Debug, Serialize, Clone, Deserialize)]
pub struct TimeEntry {
    pub id: i64,
    pub category_id: i64,
    pub category_name: Option<String>,
    pub category_color: Option<String>,
    pub start_time: String,
    pub end_time: Option<String>,
    pub duration_secs: i64,
}

#[derive(Debug, Serialize, Clone)]
pub struct CategoryStats {
    pub category: Category,
    pub today_secs: i64,
    pub week_secs: i64,
    pub all_time_secs: i64,
}

#[derive(Debug, Serialize, Clone)]
pub struct RunningTimer {
    pub entry: TimeEntry,
    pub category: Category,
}

#[derive(Debug, Serialize, Clone)]
pub struct DailyBar {
    pub date: String,
    pub day_label: String,
    pub total_secs: i64,
}

// ---------- DB Path ----------

pub fn get_db_path() -> PathBuf {
    let home = dirs_home().unwrap_or_else(|| PathBuf::from("."));
    let dir = home.join(".time-tracker");
    fs::create_dir_all(&dir).ok();
    dir.join("data.db")
}

fn dirs_home() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        std::env::var("USERPROFILE").ok().map(PathBuf::from)
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::env::var("HOME").ok().map(PathBuf::from)
    }
}

// ---------- Init ----------

pub fn init_db(conn: &Connection) -> SqlResult<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS categories (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL UNIQUE,
            color       TEXT DEFAULT '#e8a85c',
            sort_order  INTEGER DEFAULT 0,
            created_at  TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS time_entries (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            category_id     INTEGER NOT NULL,
            start_time      TEXT NOT NULL,
            end_time        TEXT,
            duration_secs   INTEGER DEFAULT 0,
            created_at      TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_entries_category ON time_entries(category_id);
        CREATE INDEX IF NOT EXISTS idx_entries_start ON time_entries(start_time);
        PRAGMA foreign_keys = ON;"
    )?;

    // Seed default categories if empty
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM categories", [], |r| r.get(0))?;
    if count == 0 {
        let defaults = vec![
            ("Getting Cracked", "#e8a85c"),
            ("Books and Movies", "#7babb0"),
            ("Academics", "#9caf88"),
            ("School Projects", "#d99a6c"),
            ("Other Productive Work", "#c97b7b"),
            ("Video Games", "#a78bfa"),
            ("Guitar", "#f472b6"),
            ("Slagging", "#5a4f4a"),
        ];
        for (i, (name, color)) in defaults.iter().enumerate() {
            conn.execute(
                "INSERT INTO categories (name, color, sort_order) VALUES (?1, ?2, ?3)",
                params![name, color, i as i32],
            )?;
        }
    }

    Ok(())
}

// ---------- Category queries ----------

pub fn fetch_categories(conn: &Connection) -> SqlResult<Vec<Category>> {
    let mut stmt = conn.prepare("SELECT id, name, color, sort_order FROM categories ORDER BY sort_order, id")?;
    let rows = stmt.query_map([], |row| {
        Ok(Category {
            id: row.get(0)?,
            name: row.get(1)?,
            color: row.get(2)?,
            sort_order: row.get(3)?,
        })
    })?;
    rows.collect()
}

pub fn insert_category(conn: &Connection, name: &str, color: &str) -> SqlResult<Category> {
    let max_order: i32 = conn
        .query_row("SELECT COALESCE(MAX(sort_order), -1) FROM categories", [], |r| r.get(0))
        .unwrap_or(-1);
    conn.execute(
        "INSERT INTO categories (name, color, sort_order) VALUES (?1, ?2, ?3)",
        params![name, color, max_order + 1],
    )?;
    let id = conn.last_insert_rowid();
    Ok(Category {
        id,
        name: name.to_string(),
        color: color.to_string(),
        sort_order: max_order + 1,
    })
}

pub fn delete_category(conn: &Connection, id: i64) -> SqlResult<()> {
    conn.execute("DELETE FROM time_entries WHERE category_id = ?1", params![id])?;
    conn.execute("DELETE FROM categories WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn update_category(conn: &Connection, id: i64, name: &str, color: &str) -> SqlResult<Category> {
    conn.execute(
        "UPDATE categories SET name = ?1, color = ?2 WHERE id = ?3",
        params![name, color, id],
    )?;
    Ok(Category {
        id,
        name: name.to_string(),
        color: color.to_string(),
        sort_order: 0,
    })
}

// ---------- Timer queries ----------

pub fn fetch_running_entry(conn: &Connection) -> SqlResult<Option<RunningTimer>> {
    let result = conn.query_row(
        "SELECT e.id, e.category_id, c.name, c.color, e.start_time, e.end_time, e.duration_secs
         FROM time_entries e
         JOIN categories c ON c.id = e.category_id
         WHERE e.end_time IS NULL
         ORDER BY e.id DESC LIMIT 1",
        [],
        |row| {
            Ok(RunningTimer {
                entry: TimeEntry {
                    id: row.get(0)?,
                    category_id: row.get(1)?,
                    category_name: row.get(2)?,
                    category_color: row.get(3)?,
                    start_time: row.get(4)?,
                    end_time: row.get(5)?,
                    duration_secs: row.get(6)?,
                },
                category: Category {
                    id: row.get(1)?,
                    name: row.get(2)?,
                    color: row.get(3)?,
                    sort_order: 0,
                },
            })
        },
    );
    match result {
        Ok(r) => Ok(Some(r)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

pub fn insert_start(conn: &Connection, category_id: i64) -> SqlResult<RunningTimer> {
    let now = Local::now().to_rfc3339_opts(SecondsFormat::Secs, true);
    conn.execute(
        "INSERT INTO time_entries (category_id, start_time) VALUES (?1, ?2)",
        params![category_id, now],
    )?;
    let id = conn.last_insert_rowid();
    let cat: Category = conn.query_row(
        "SELECT id, name, color, sort_order FROM categories WHERE id = ?1",
        params![category_id],
        |row| Ok(Category {
            id: row.get(0)?,
            name: row.get(1)?,
            color: row.get(2)?,
            sort_order: row.get(3)?,
        }),
    )?;
    Ok(RunningTimer {
        entry: TimeEntry {
            id,
            category_id,
            category_name: Some(cat.name.clone()),
            category_color: Some(cat.color.clone()),
            start_time: now,
            end_time: None,
            duration_secs: 0,
        },
        category: cat,
    })
}

pub fn stop_entry(conn: &Connection, entry_id: i64) -> SqlResult<TimeEntry> {
    let now = Local::now().to_rfc3339_opts(SecondsFormat::Secs, true);
    let start: String = conn.query_row(
        "SELECT start_time FROM time_entries WHERE id = ?1",
        params![entry_id],
        |r| r.get(0),
    )?;

    let start_dt = chrono::DateTime::parse_from_rfc3339(&start)
        .map(|dt| dt.with_timezone(&Local))
        .unwrap_or_else(|_| Local::now());
    let elapsed = (Local::now() - start_dt).num_seconds().max(0);

    conn.execute(
        "UPDATE time_entries SET end_time = ?1, duration_secs = ?2 WHERE id = ?3",
        params![now, elapsed, entry_id],
    )?;

    conn.query_row(
        "SELECT e.id, e.category_id, c.name, c.color, e.start_time, e.end_time, e.duration_secs
         FROM time_entries e
         JOIN categories c ON c.id = e.category_id
         WHERE e.id = ?1",
        params![entry_id],
        |row| Ok(TimeEntry {
            id: row.get(0)?,
            category_id: row.get(1)?,
            category_name: row.get(2)?,
            category_color: row.get(3)?,
            start_time: row.get(4)?,
            end_time: row.get(5)?,
            duration_secs: row.get(6)?,
        }),
    )
}

// ---------- Stats queries ----------

pub fn fetch_category_stats(conn: &Connection) -> SqlResult<Vec<CategoryStats>> {
    let categories = fetch_categories(conn)?;
    let today_str = Local::now().date_naive().format("%Y-%m-%d").to_string();

    let week_start = {
        let today = Local::now().date_naive();
        let days_since_sunday = today.weekday().num_days_from_sunday();
        (today - Duration::days(days_since_sunday as i64)).format("%Y-%m-%d").to_string()
    };

    let mut stats = Vec::new();
    for cat in categories {
        let today_secs: i64 = conn.query_row(
            "SELECT COALESCE(SUM(duration_secs), 0) FROM time_entries
             WHERE category_id = ?1 AND start_time >= ?2",
            params![cat.id, today_str],
            |r| r.get(0),
        )?;

        let week_secs: i64 = conn.query_row(
            "SELECT COALESCE(SUM(duration_secs), 0) FROM time_entries
             WHERE category_id = ?1 AND start_time >= ?2",
            params![cat.id, week_start],
            |r| r.get(0),
        )?;

        let all_time_secs: i64 = conn.query_row(
            "SELECT COALESCE(SUM(duration_secs), 0) FROM time_entries
             WHERE category_id = ?1 AND end_time IS NOT NULL",
            params![cat.id],
            |r| r.get(0),
        )?;

        stats.push(CategoryStats {
            category: cat,
            today_secs,
            week_secs,
            all_time_secs,
        });
    }

    Ok(stats)
}

pub fn fetch_today_entries(conn: &Connection) -> SqlResult<Vec<TimeEntry>> {
    let today_str = Local::now().date_naive().format("%Y-%m-%d").to_string();
    let mut stmt = conn.prepare(
        "SELECT e.id, e.category_id, c.name, c.color, e.start_time, e.end_time, e.duration_secs
         FROM time_entries e
         JOIN categories c ON c.id = e.category_id
         WHERE e.start_time >= ?1
         ORDER BY e.start_time DESC"
    )?;
    let rows = stmt.query_map(params![today_str], |row| {
        Ok(TimeEntry {
            id: row.get(0)?,
            category_id: row.get(1)?,
            category_name: row.get(2)?,
            category_color: row.get(3)?,
            start_time: row.get(4)?,
            end_time: row.get(5)?,
            duration_secs: row.get(6)?,
        })
    })?;
    rows.collect()
}

pub fn fetch_weekly_bar_data(conn: &Connection) -> SqlResult<Vec<DailyBar>> {
    let today = Local::now().date_naive();
    let days_since_sunday = today.weekday().num_days_from_sunday();
    let week_start = today - Duration::days(days_since_sunday as i64);

    let day_labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    let mut bars = Vec::new();

    for i in 0..7 {
        let date = week_start + Duration::days(i);
        let date_str = date.format("%Y-%m-%d").to_string();
        let next_date = date + Duration::days(1);
        let next_str = next_date.format("%Y-%m-%d").to_string();

        let total_secs: i64 = conn.query_row(
            "SELECT COALESCE(SUM(duration_secs), 0) FROM time_entries
             WHERE start_time >= ?1 AND start_time < ?2 AND end_time IS NOT NULL",
            params![date_str, next_str],
            |r| r.get(0),
        )?;

        bars.push(DailyBar {
            date: date_str,
            day_label: day_labels[date.weekday().num_days_from_sunday() as usize].to_string(),
            total_secs,
        });
    }

    Ok(bars)
}
