use axum::{
    extract::{Query, State},
    http::{HeaderValue, Method},
    routing::get,
    Json, Router,
};
use chrono::{Duration, Local};
use rusqlite::Connection;
use serde::Deserialize;
use std::sync::{Arc, Mutex};
use tower_http::cors::CorsLayer;
use crate::db::{Category, TimeEntry, RunningTimer};

pub type Db = Arc<Mutex<Connection>>;

#[derive(Deserialize)]
struct EntriesQuery {
    days: Option<i64>,
}

async fn get_categories(State(db): State<Db>) -> Json<Vec<Category>> {
    let conn = db.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT id, name, color, sort_order, daily_goal_secs FROM categories ORDER BY sort_order")
        .unwrap();
    let rows = stmt
        .query_map([], |r| {
            Ok(Category {
                id: r.get(0)?,
                name: r.get(1)?,
                color: r.get(2)?,
                sort_order: r.get(3)?,
                daily_goal_secs: r.get(4)?,
            })
        })
        .unwrap();
    Json(rows.filter_map(Result::ok).collect())
}

async fn get_entries(State(db): State<Db>, Query(q): Query<EntriesQuery>) -> Json<Vec<TimeEntry>> {
    let days = q.days.unwrap_or(90).max(1);
    let since = (Local::now() - Duration::days(days))
        .format("%Y-%m-%dT00:00:00")
        .to_string();

    let conn = db.lock().unwrap();
    let mut stmt = conn
        .prepare(
            "SELECT te.id, te.category_id, c.name, c.color, te.start_time, te.end_time, te.duration_secs
             FROM time_entries te
             JOIN categories c ON c.id = te.category_id
             WHERE te.start_time >= ?1
             ORDER BY te.start_time DESC",
        )
        .unwrap();
    let rows = stmt
        .query_map([since], |r| {
            Ok(TimeEntry {
                id: r.get(0)?,
                category_id: r.get(1)?,
                category_name: r.get(2)?,
                category_color: r.get(3)?,
                start_time: r.get(4)?,
                end_time: r.get(5)?,
                duration_secs: r.get(6)?,
            })
        })
        .unwrap();
    Json(rows.filter_map(Result::ok).collect())
}

async fn get_running_timer(State(db): State<Db>) -> Json<Option<RunningTimer>> {
    let conn = db.lock().unwrap();
    let result = conn.query_row(
        "SELECT e.id, e.category_id, c.name, c.color, e.start_time, e.end_time, e.duration_secs
         FROM time_entries e
         JOIN categories c ON c.id = e.category_id
         WHERE e.end_time IS NULL
         ORDER BY e.id DESC LIMIT 1",
        [],
        |r| {
            Ok(RunningTimer {
                entry: TimeEntry {
                    id: r.get(0)?,
                    category_id: r.get(1)?,
                    category_name: r.get(2)?,
                    category_color: r.get(3)?,
                    start_time: r.get(4)?,
                    end_time: r.get(5)?,
                    duration_secs: r.get(6)?,
                },
                category: Category {
                    id: r.get(1)?,
                    name: r.get(2)?,
                    color: r.get(3)?,
                    sort_order: 0,
                    daily_goal_secs: 0,
                },
            })
        },
    );
    Json(result.ok())
}

pub fn build_router(db: Db) -> Router {
    let cors = CorsLayer::new()
        .allow_origin([
            "http://localhost:5173".parse::<HeaderValue>().unwrap(),
            "http://localhost:4173".parse::<HeaderValue>().unwrap(),
        ])
        .allow_methods([Method::GET]);

    Router::new()
        .route("/api/categories", get(get_categories))
        .route("/api/entries", get(get_entries))
        .route("/api/running-timer", get(get_running_timer))
        .layer(cors)
        .with_state(db)
}

pub fn spawn(db: Db) {
    tauri::async_runtime::spawn(async move {
        let app = build_router(db);
        let listener = tokio::net::TcpListener::bind("127.0.0.1:9876")
            .await
            .expect("failed to bind dashboard server to 127.0.0.1:9876");
        axum::serve(listener, app).await.unwrap();
    });
}
