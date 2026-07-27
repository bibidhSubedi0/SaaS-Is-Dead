use chrono::{Datelike, Duration, Local, NaiveDate, SecondsFormat, TimeZone};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::time::{Duration as StdDuration, Instant};
use tauri::Manager;
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tokio::sync::RwLock;

// ---------- Shared auth helpers ----------

#[derive(Debug, Deserialize, Serialize, Clone)]
struct TokenExport {
    access_token: String,
    expiry: Option<String>,
    refresh_token: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CredentialsFile {
    installed: CredentialsInstalled,
}

#[derive(Debug, Deserialize)]
struct CredentialsInstalled {
    client_id: String,
    client_secret: String,
    token_uri: String,
}

fn find_file(filename: &str) -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = vec![
        PathBuf::from(filename),
        PathBuf::from("..").join(filename),
        PathBuf::from("../..").join(filename),
    ];

    // Also look next to the installed executable
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            candidates.push(exe_dir.join(filename));
        }
    }

    candidates.into_iter().find(|p| p.exists())
}

fn exe_dir() -> Option<PathBuf> {
    std::env::current_exe().ok()?.parent().map(|p| p.to_path_buf())
}

fn find_token_file() -> Option<PathBuf> {
    find_file("token_export.json")
}

fn find_credentials_file() -> Option<PathBuf> {
    find_file("credentials.json")
}

fn token_file_path() -> PathBuf {
    find_token_file().unwrap_or_else(|| {
        exe_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("token_export.json")
    })
}

fn read_token_export() -> Result<(PathBuf, TokenExport), String> {
    let path = token_file_path();
    let content =
        fs::read_to_string(&path).map_err(|e| format!("Failed to read {:?}: {}", path, e))?;
    let token: TokenExport =
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse token JSON: {}", e))?;
    Ok((path, token))
}

fn read_credentials() -> Result<CredentialsInstalled, String> {
    let path = find_credentials_file()
        .ok_or_else(|| "credentials.json not found (checked ., .., ../.., and next to the installed exe)".to_string())?;
    let content =
        fs::read_to_string(&path).map_err(|e| format!("Failed to read {:?}: {}", path, e))?;
    let creds: CredentialsFile = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse credentials JSON: {}", e))?;
    Ok(creds.installed)
}

fn is_expired_or_near(expiry: &Option<String>) -> bool {
    let Some(expiry_str) = expiry else {
        return true; // no expiry info, assume we need to refresh
    };
    let Ok(expiry_dt) = chrono::DateTime::parse_from_rfc3339(expiry_str).or_else(|_| {
        // handle naive datetime strings (no offset) as local time
        chrono::NaiveDateTime::parse_from_str(expiry_str, "%Y-%m-%dT%H:%M:%S%.f")
            .map(|ndt| Local.from_local_datetime(&ndt).unwrap().fixed_offset())
    }) else {
        return true;
    };
    let now = chrono::Utc::now().fixed_offset();
    // refresh if expiring within the next 2 minutes
    expiry_dt <= now + Duration::minutes(2)
}

#[derive(Debug, Deserialize)]
struct RefreshResponse {
    access_token: String,
    expires_in: i64,
}

async fn refresh_access_token(
    client: &reqwest::Client,
    refresh_token: &str,
) -> Result<TokenExport, String> {
    let creds = read_credentials()?;

    let params = [
        ("client_id", creds.client_id.as_str()),
        ("client_secret", creds.client_secret.as_str()),
        ("refresh_token", refresh_token),
        ("grant_type", "refresh_token"),
    ];

    let resp = client
        .post(&creds.token_uri)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Token refresh request failed: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Token refresh returned {}: {}", status, body));
    }

    let refreshed: RefreshResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse refresh response: {}", e))?;

    let new_expiry = Local::now() + Duration::seconds(refreshed.expires_in);

    Ok(TokenExport {
        access_token: refreshed.access_token,
        expiry: Some(new_expiry.to_rfc3339_opts(SecondsFormat::Secs, true)),
        refresh_token: Some(refresh_token.to_string()),
    })
}

async fn load_access_token() -> Result<String, String> {
    let (path, mut token) = read_token_export()?;

    if is_expired_or_near(&token.expiry) {
        let refresh_token = token
            .refresh_token
            .clone()
            .ok_or_else(|| "No refresh_token available to refresh with".to_string())?;

        let client = reqwest::Client::new();
        let refreshed = refresh_access_token(&client, &refresh_token).await?;

        let content = serde_json::to_string_pretty(&refreshed)
            .map_err(|e| format!("Failed to serialize refreshed token: {}", e))?;
        fs::write(&path, content)
            .map_err(|e| format!("Failed to write refreshed token to {:?}: {}", path, e))?;

        token = refreshed;
    }

    Ok(token.access_token)
}

// ---------- Shared calendar/event types ----------

#[derive(Debug, Deserialize, Clone)]
struct CalendarListEntry {
    id: String,
    summary: String,
    #[serde(rename = "accessRole")]
    access_role: String,
}

#[derive(Debug, Deserialize)]
struct CalendarListResponse {
    items: Vec<CalendarListEntry>,
}

// ---------- Calendar list cache ----------

const CALENDAR_CACHE_TTL_SECS: u64 = 1800; // 30 minutes

struct CalendarCache {
    calendars: Vec<CalendarListEntry>,
    fetched_at: Instant,
}

struct AppState {
    calendar_cache: RwLock<Option<CalendarCache>>,
}

impl AppState {
    fn new() -> Self {
        Self {
            calendar_cache: RwLock::new(None),
        }
    }
}

async fn get_cached_calendars(
    state: &tauri::State<'_, AppState>,
    client: &reqwest::Client,
    token: &str,
) -> Result<Vec<CalendarListEntry>, String> {
    // Check cache
    {
        let cache = state.calendar_cache.read().await;
        if let Some(ref c) = *cache {
            if c.fetched_at.elapsed() < StdDuration::from_secs(CALENDAR_CACHE_TTL_SECS) {
                return Ok(c.calendars.clone());
            }
        }
    }

    // Cache miss or expired — fetch fresh
    let calendars = get_calendar_list(client, token).await?;
    {
        let mut cache = state.calendar_cache.write().await;
        *cache = Some(CalendarCache {
            calendars: calendars.clone(),
            fetched_at: Instant::now(),
        });
    }
    Ok(calendars)
}

#[derive(Debug, Deserialize)]
struct EventTime {
    #[serde(rename = "dateTime")]
    date_time: Option<String>,
    date: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CalendarEvent {
    id: String,
    #[serde(default)]
    summary: String,
    start: Option<EventTime>,
    end: Option<EventTime>,
}

#[derive(Debug, Deserialize)]
struct EventsListResponse {
    #[serde(default)]
    items: Vec<CalendarEvent>,
}

async fn get_calendar_list(
    client: &reqwest::Client,
    token: &str,
) -> Result<Vec<CalendarListEntry>, String> {
    let resp = client
        .get("https://www.googleapis.com/calendar/v3/users/me/calendarList")
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| format!("calendarList request failed: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("calendarList returned {}: {}", status, body));
    }

    let parsed: CalendarListResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse calendarList JSON: {}", e))?;

    Ok(parsed.items)
}

async fn list_events(
    client: &reqwest::Client,
    token: &str,
    calendar_id: &str,
    time_min: &str,
    time_max: &str,
) -> Result<Vec<CalendarEvent>, String> {
    let url = format!(
        "https://www.googleapis.com/calendar/v3/calendars/{}/events",
        urlencoding::encode(calendar_id)
    );

    let resp = client
        .get(&url)
        .bearer_auth(token)
        .query(&[
            ("timeMin", time_min),
            ("timeMax", time_max),
            ("singleEvents", "true"),
            ("orderBy", "startTime"),
        ])
        .send()
        .await
        .map_err(|e| format!("events.list request failed: {}", e))?;

    if !resp.status().is_success() {
        return Ok(vec![]); // skip calendars we can't read rather than failing everything
    }

    let parsed: EventsListResponse = match resp.json().await {
        Ok(e) => e,
        Err(_) => return Ok(vec![]),
    };

    Ok(parsed.items)
}

fn day_bounds_rfc3339(date: chrono::NaiveDate) -> (String, String) {
    let start = date.and_hms_opt(0, 0, 0).unwrap();
    let end = start + Duration::days(1);
    let start_str = Local
        .from_local_datetime(&start)
        .unwrap()
        .to_rfc3339_opts(SecondsFormat::Secs, true);
    let end_str = Local
        .from_local_datetime(&end)
        .unwrap()
        .to_rfc3339_opts(SecondsFormat::Secs, true);
    (start_str, end_str)
}

fn event_matches_date(ev: &CalendarEvent, target: NaiveDate) -> bool {
    if let Some(start) = &ev.start {
        if let Some(date_str) = &start.date {
            return NaiveDate::parse_from_str(date_str, "%Y-%m-%d")
                .map(|d| d == target)
                .unwrap_or(false);
        }
        if let Some(dt_str) = &start.date_time {
            if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(dt_str) {
                let local_date = dt.with_timezone(&Local).date_naive();
                return local_date == target;
            }
        }
    }
    false
}

/// For events on past dates with no status, treat as MISS
fn effective_status<'a>(status: &'a str, ev_date: NaiveDate, today: NaiveDate) -> &'a str {
    if status == "" && ev_date < today {
        "MISS"
    } else {
        status
    }
}

/// Swap the [STATUS] bracket in a title string
fn swap_title_status(title: &str, new_status: &str) -> String {
    let tag_re = Regex::new(r"^\[(DONE|MISS|PART)?\](\[(DO|EXPLORE|FIXED|ADHOC)\])").unwrap();
    if let Some(caps) = tag_re.captures(title) {
        let type_bracket = caps.get(2).unwrap().as_str();
        let rest = &title[caps.get(0).unwrap().end()..];
        format!("[{}]{}{}", new_status, type_bracket, rest)
    } else {
        title.to_string()
    }
}

// ---------- get_today_events ----------

#[derive(Debug, Serialize)]
struct EventOut {
    id: String,
    calendar_id: String,
    calendar_name: String,
    title: String,
    start: String,
    end: String,
}

async fn fetch_events_for_date(
    state: &tauri::State<'_, AppState>,
    client: &reqwest::Client,
    token: &str,
    date: NaiveDate,
) -> Result<Vec<EventOut>, String> {
    let calendars = get_cached_calendars(state, client, token).await?;
    let owned: Vec<&CalendarListEntry> = calendars
        .iter()
        .filter(|c| c.access_role == "owner")
        .collect();

    let (time_min, time_max) = day_bounds_rfc3339(date);

    let mut all_events: Vec<EventOut> = Vec::new();

    let today = Local::now().date_naive();
    let tag_re = Regex::new(r"^\[(DONE|MISS|PART)?\]\[(DO|EXPLORE|FIXED|ADHOC)\]").unwrap();

    for cal in owned {
        let events = list_events(client, token, &cal.id, &time_min, &time_max).await?;
        for ev in events.into_iter().filter(|e| event_matches_date(e, date)) {
            let start_str = ev
                .start
                .as_ref()
                .and_then(|s| s.date_time.clone().or_else(|| s.date.clone()))
                .unwrap_or_default();
            let end_str = ev
                .end
                .as_ref()
                .and_then(|s| s.date_time.clone().or_else(|| s.date.clone()))
                .unwrap_or_default();

            // Apply effective status: past pending → MISS
            let title = if let Some(caps) = tag_re.captures(&ev.summary) {
                let orig_status = caps.get(1).map(|m| m.as_str()).unwrap_or("");
                let eff = effective_status(orig_status, date, today);
                if eff != orig_status {
                    swap_title_status(&ev.summary, eff)
                } else {
                    ev.summary.clone()
                }
            } else {
                ev.summary.clone()
            };

            all_events.push(EventOut {
                id: ev.id,
                calendar_id: cal.id.clone(),
                calendar_name: cal.summary.clone(),
                title,
                start: start_str,
                end: end_str,
            });
        }
    }

    all_events.sort_by(|a, b| a.start.cmp(&b.start));
    Ok(all_events)
}

#[tauri::command]
async fn get_today_events(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<EventOut>, String> {
    let token = load_access_token().await?;
    let client = reqwest::Client::new();
    fetch_events_for_date(&state, &client, &token, Local::now().date_naive()).await
}

#[tauri::command]
async fn get_day_events(
    state: tauri::State<'_, AppState>,
    date: String,
) -> Result<Vec<EventOut>, String> {
    let parsed = NaiveDate::parse_from_str(&date, "%Y-%m-%d")
        .map_err(|e| format!("Invalid date '{}': {}", date, e))?;
    let token = load_access_token().await?;
    let client = reqwest::Client::new();
    fetch_events_for_date(&state, &client, &token, parsed).await
}

// ---------- get_today_note ----------

#[tauri::command]
async fn get_today_note(
    state: tauri::State<'_, AppState>,
) -> Result<Option<String>, String> {
    let token = load_access_token().await?;
    let client = reqwest::Client::new();

    let calendars = get_cached_calendars(&state, &client, &token).await?;
    let day_notes_cal = calendars.iter().find(|c| c.summary == "Day Notes");

    let day_notes_cal = match day_notes_cal {
        Some(c) => c,
        None => return Ok(None), // no such calendar, nothing to show
    };

    let today = Local::now().date_naive();
    let (time_min, time_max) = day_bounds_rfc3339(today);

    let events = list_events(&client, &token, &day_notes_cal.id, &time_min, &time_max).await?;

    Ok(events
        .into_iter()
        .find(|e| event_matches_date(e, today))
        .map(|e| e.summary))
}

// ---------- get_week_stats ----------

#[derive(Debug, Serialize, Default, Clone)]
struct WeekStats {
    total: u32,
    done: u32,
    missed: u32,
    partial: u32,
    pending: u32,
    by_calendar: HashMap<String, WeekStatsByCalendar>,
}

#[derive(Debug, Serialize, Default, Clone)]
struct WeekStatsByCalendar {
    total: u32,
    done: u32,
    missed: u32,
    partial: u32,
    pending: u32,
}

#[tauri::command]
async fn get_week_stats(
    state: tauri::State<'_, AppState>,
) -> Result<WeekStats, String> {
    let token = load_access_token().await?;
    let client = reqwest::Client::new();

    let calendars = get_cached_calendars(&state, &client, &token).await?;
    let owned: Vec<&CalendarListEntry> = calendars
        .iter()
        .filter(|c| c.access_role == "owner")
        .collect();

    let today = Local::now().date_naive();
    // Sunday-start week
    let days_since_sunday = today.weekday().num_days_from_sunday();
    let week_start = today - Duration::days(days_since_sunday as i64);
    let week_end = week_start + Duration::days(7);

    let start_str = Local
        .from_local_datetime(&week_start.and_hms_opt(0, 0, 0).unwrap())
        .unwrap()
        .to_rfc3339_opts(SecondsFormat::Secs, true);
    let end_str = Local
        .from_local_datetime(&week_end.and_hms_opt(0, 0, 0).unwrap())
        .unwrap()
        .to_rfc3339_opts(SecondsFormat::Secs, true);

    // ^\[(DONE|MISS|PART)?\]\[(DO|EXPLORE|FIXED|ADHOC)\]
    let tag_re = Regex::new(r"^\[(DONE|MISS|PART)?\]\[(DO|EXPLORE|FIXED|ADHOC)\]")
        .map_err(|e| format!("regex error: {}", e))?;

    let mut stats = WeekStats::default();

    for cal in owned {
        let events = list_events(&client, &token, &cal.id, &start_str, &end_str).await?;
        let mut cal_stats = WeekStatsByCalendar::default();

        for ev in &events {
            if let Some(caps) = tag_re.captures(&ev.summary) {
                let status = caps.get(1).map(|m| m.as_str()).unwrap_or("");

                // Extract event date for effective status
                let ev_date = ev.start.as_ref().and_then(|s| {
                    if let Some(d) = &s.date {
                        NaiveDate::parse_from_str(d, "%Y-%m-%d").ok()
                    } else if let Some(dt) = &s.date_time {
                        chrono::DateTime::parse_from_rfc3339(dt)
                            .ok()
                            .map(|d| d.with_timezone(&Local).date_naive())
                    } else {
                        None
                    }
                });

                let eff = match ev_date {
                    Some(d) => effective_status(status, d, today),
                    None => status,
                };

                stats.total += 1;
                cal_stats.total += 1;

                match eff {
                    "DONE" => {
                        stats.done += 1;
                        cal_stats.done += 1;
                    }
                    "MISS" => {
                        stats.missed += 1;
                        cal_stats.missed += 1;
                    }
                    "PART" => {
                        stats.partial += 1;
                        cal_stats.partial += 1;
                    }
                    _ => {
                        stats.pending += 1;
                        cal_stats.pending += 1;
                    }
                }
            }
        }

        if cal_stats.total > 0 {
            stats.by_calendar.insert(cal.summary.clone(), cal_stats);
        }
    }

    Ok(stats)
}

#[derive(Debug, Serialize, Default, Clone)]
struct DayStats {
    date: String,
    done: u32,
    missed: u32,
    partial: u32,
    pending: u32,
}

#[tauri::command]
async fn get_week_daily_stats(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<DayStats>, String> {
    let token = load_access_token().await?;
    let client = reqwest::Client::new();

    let calendars = get_cached_calendars(&state, &client, &token).await?;
    let owned: Vec<&CalendarListEntry> = calendars
        .iter()
        .filter(|c| c.access_role == "owner")
        .collect();

    let today = Local::now().date_naive();
    let days_since_sunday = today.weekday().num_days_from_sunday();
    let week_start = today - Duration::days(days_since_sunday as i64);

    let tag_re = Regex::new(r"^\[(DONE|MISS|PART)?\]\[(DO|EXPLORE|FIXED|ADHOC)\]")
        .map_err(|e| format!("regex error: {}", e))?;

    let mut days: Vec<DayStats> = (0..7)
        .map(|i| DayStats {
            date: (week_start + Duration::days(i))
                .format("%Y-%m-%d")
                .to_string(),
            ..Default::default()
        })
        .collect();

    for cal in &owned {
        let week_end = week_start + Duration::days(7);
        let start_str = Local
            .from_local_datetime(&week_start.and_hms_opt(0, 0, 0).unwrap())
            .unwrap()
            .to_rfc3339_opts(SecondsFormat::Secs, true);
        let end_str = Local
            .from_local_datetime(&week_end.and_hms_opt(0, 0, 0).unwrap())
            .unwrap()
            .to_rfc3339_opts(SecondsFormat::Secs, true);

        let events = list_events(&client, &token, &cal.id, &start_str, &end_str).await?;

        for ev in &events {
            let Some(caps) = tag_re.captures(&ev.summary) else {
                continue;
            };
            let status = caps.get(1).map(|m| m.as_str()).unwrap_or("");

            // figure out which day this event belongs to
            let ev_date = ev.start.as_ref().and_then(|s| {
                if let Some(d) = &s.date {
                    NaiveDate::parse_from_str(d, "%Y-%m-%d").ok()
                } else if let Some(dt) = &s.date_time {
                    chrono::DateTime::parse_from_rfc3339(dt)
                        .ok()
                        .map(|d| d.with_timezone(&Local).date_naive())
                } else {
                    None
                }
            });

            let Some(ev_date) = ev_date else { continue };
            let Some(day) = days
                .iter_mut()
                .find(|d| d.date == ev_date.format("%Y-%m-%d").to_string())
            else {
                continue;
            };

            let eff = effective_status(status, ev_date, today);
            match eff {
                "DONE" => day.done += 1,
                "MISS" => day.missed += 1,
                "PART" => day.partial += 1,
                _ => day.pending += 1,
            }
        }
    }

    Ok(days)
}

// ---------- get_week_bundle (single-fetch endpoint) ----------

#[derive(Debug, Serialize)]
struct WeekBundle {
    stats: WeekStats,
    daily_stats: Vec<DayStats>,
    days: HashMap<String, Vec<EventOut>>,
    note: Option<String>,
}

#[tauri::command]
async fn get_week_bundle(
    state: tauri::State<'_, AppState>,
) -> Result<WeekBundle, String> {
    let token = load_access_token().await?;
    let client = reqwest::Client::new();

    let calendars = get_cached_calendars(&state, &client, &token).await?;
    let owned: Vec<&CalendarListEntry> = calendars
        .iter()
        .filter(|c| c.access_role == "owner")
        .collect();

    let today = Local::now().date_naive();
    let days_since_sunday = today.weekday().num_days_from_sunday();
    let week_start = today - Duration::days(days_since_sunday as i64);
    let week_end = week_start + Duration::days(7);

    let (start_str, end_str) = {
        let s = Local
            .from_local_datetime(&week_start.and_hms_opt(0, 0, 0).unwrap())
            .unwrap()
            .to_rfc3339_opts(SecondsFormat::Secs, true);
        let e = Local
            .from_local_datetime(&week_end.and_hms_opt(0, 0, 0).unwrap())
            .unwrap()
            .to_rfc3339_opts(SecondsFormat::Secs, true);
        (s, e)
    };

    let tag_re = Regex::new(r"^\[(DONE|MISS|PART)?\]\[(DO|EXPLORE|FIXED|ADHOC)\]")
        .map_err(|e| format!("regex error: {}", e))?;

    // Pre-build day date strings
    let day_dates: Vec<String> = (0..7)
        .map(|i| (week_start + Duration::days(i)).format("%Y-%m-%d").to_string())
        .collect();

    let mut stats = WeekStats::default();
    let mut daily_stats: Vec<DayStats> = day_dates
        .iter()
        .map(|d| DayStats {
            date: d.clone(),
            ..Default::default()
        })
        .collect();
    let mut days: HashMap<String, Vec<EventOut>> = day_dates
        .iter()
        .map(|d| (d.clone(), Vec::new()))
        .collect();

    // Single fetch per calendar for the entire week
    for cal in &owned {
        let events = list_events(&client, &token, &cal.id, &start_str, &end_str).await?;
        let mut cal_stats = WeekStatsByCalendar::default();

        for ev in &events {
            // Determine which day this event belongs to
            let ev_date = ev.start.as_ref().and_then(|s| {
                if let Some(d) = &s.date {
                    NaiveDate::parse_from_str(d, "%Y-%m-%d").ok()
                } else if let Some(dt) = &s.date_time {
                    chrono::DateTime::parse_from_rfc3339(dt)
                        .ok()
                        .map(|d| d.with_timezone(&Local).date_naive())
                } else {
                    None
                }
            });

            let Some(ev_date) = ev_date else { continue };
            let date_key = ev_date.format("%Y-%m-%d").to_string();

            // Build EventOut for this event
            let start_str_ev = ev
                .start
                .as_ref()
                .and_then(|s| s.date_time.clone().or_else(|| s.date.clone()))
                .unwrap_or_default();
            let end_str_ev = ev
                .end
                .as_ref()
                .and_then(|s| s.date_time.clone().or_else(|| s.date.clone()))
                .unwrap_or_default();

            let event_out = EventOut {
                id: ev.id.clone(),
                calendar_id: cal.id.clone(),
                calendar_name: cal.summary.clone(),
                title: if let Some(caps) = tag_re.captures(&ev.summary) {
                    let orig_status = caps.get(1).map(|m| m.as_str()).unwrap_or("");
                    let eff = effective_status(orig_status, ev_date, today);
                    if eff != orig_status {
                        swap_title_status(&ev.summary, eff)
                    } else {
                        ev.summary.clone()
                    }
                } else {
                    ev.summary.clone()
                },
                start: start_str_ev,
                end: end_str_ev,
            };

            if let Some(day_events) = days.get_mut(&date_key) {
                day_events.push(event_out);
            }

            // Compute stats from tagged events
            if let Some(caps) = tag_re.captures(&ev.summary) {
                let status = caps.get(1).map(|m| m.as_str()).unwrap_or("");
                let eff = effective_status(status, ev_date, today);

                stats.total += 1;
                cal_stats.total += 1;

                match eff {
                    "DONE" => {
                        stats.done += 1;
                        cal_stats.done += 1;
                    }
                    "MISS" => {
                        stats.missed += 1;
                        cal_stats.missed += 1;
                    }
                    "PART" => {
                        stats.partial += 1;
                        cal_stats.partial += 1;
                    }
                    _ => {
                        stats.pending += 1;
                        cal_stats.pending += 1;
                    }
                }

                if let Some(day) = daily_stats.iter_mut().find(|d| d.date == date_key) {
                    match eff {
                        "DONE" => day.done += 1,
                        "MISS" => day.missed += 1,
                        "PART" => day.partial += 1,
                        _ => day.pending += 1,
                    }
                }
            }
        }

        if cal_stats.total > 0 {
            stats.by_calendar.insert(cal.summary.clone(), cal_stats);
        }
    }

    // Sort events within each day by start time
    for events in days.values_mut() {
        events.sort_by(|a, b| a.start.cmp(&b.start));
    }

    // Fetch today's note (Day Notes calendar)
    let note = {
        let day_notes_cal = calendars.iter().find(|c| c.summary == "Day Notes");
        if let Some(cal) = day_notes_cal {
            let (note_min, note_max) = day_bounds_rfc3339(today);
            let events = list_events(&client, &token, &cal.id, &note_min, &note_max).await?;
            events
                .into_iter()
                .find(|e| event_matches_date(e, today))
                .map(|e| e.summary)
        } else {
            None
        }
    };

    Ok(WeekBundle {
        stats,
        daily_stats,
        days,
        note,
    })
}

// ---------- mark_event_status ----------

#[derive(Debug, Serialize)]
struct EventPatchBody {
    summary: String,
}

#[tauri::command]
async fn mark_event_status(
    state: tauri::State<'_, AppState>,
    event_id: String,
    calendar_id: String,
    status: String,
) -> Result<Vec<EventOut>, String> {
    let allowed = ["DONE", "MISS", "PART", ""];
    if !allowed.contains(&status.as_str()) {
        return Err(format!("Invalid status: {}", status));
    }

    let token = load_access_token().await?;
    let client = reqwest::Client::new();

    // 1. Fetch the event to get its current title
    let get_url = format!(
        "https://www.googleapis.com/calendar/v3/calendars/{}/events/{}",
        urlencoding::encode(&calendar_id),
        urlencoding::encode(&event_id)
    );

    let resp = client
        .get(&get_url)
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch event: {}", e))?;

    if !resp.status().is_success() {
        let status_code = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Fetch event returned {}: {}", status_code, body));
    }

    let event: CalendarEvent = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse event JSON: {}", e))?;

    // 2. Replace/insert the status bracket
    let tag_re = Regex::new(r"^\[(DONE|MISS|PART)?\](\[(DO|EXPLORE|FIXED|ADHOC)\])")
        .map_err(|e| format!("regex error: {}", e))?;

    let new_title = if let Some(caps) = tag_re.captures(&event.summary) {
        let type_bracket = caps.get(2).unwrap().as_str();
        let rest = &event.summary[caps.get(0).unwrap().end()..];
        format!("[{}]{}{}", status, type_bracket, rest)
    } else {
        return Err(format!(
            "Event title doesn't match expected [STATUS][TYPE] pattern: {}",
            event.summary
        ));
    };

    // 3. Patch the event
    let patch_url = get_url.clone();
    let patch_body = EventPatchBody { summary: new_title };

    let patch_resp = client
        .patch(&patch_url)
        .bearer_auth(&token)
        .json(&patch_body)
        .send()
        .await
        .map_err(|e| format!("Failed to patch event: {}", e))?;

    if !patch_resp.status().is_success() {
        let status_code = patch_resp.status();
        let body = patch_resp.text().await.unwrap_or_default();
        return Err(format!("Patch returned {}: {}", status_code, body));
    }

    // 4. Return updated today's events so the frontend can re-render without another call
    fetch_events_for_date(&state, &client, &token, Local::now().date_naive()).await
}

// ---------- app entry ----------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::new())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }

                    let shortcut_str = shortcut.to_string();
                    println!("Global shortcut fired: {:?}", shortcut_str);
                    let Some(window) = app.get_webview_window("main") else {
                        return;
                    };

                    if shortcut_str == "control+alt+KeyH" {
                        let is_visible = window.is_visible().unwrap_or(true);
                        if is_visible {
                            let _ = window.hide();
                        } else {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    } else if shortcut_str == "control+alt+KeyT" {
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

            let hide_shortcut: Shortcut = "ctrl+alt+KeyH".parse().unwrap();
            let toggle_top_shortcut: Shortcut = "ctrl+alt+KeyT".parse().unwrap();

            app.global_shortcut().register(hide_shortcut)?;
            app.global_shortcut().register(toggle_top_shortcut)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_today_events,
            get_day_events,
            get_today_note,
            get_week_stats,
            get_week_daily_stats,
            get_week_bundle,
            mark_event_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
