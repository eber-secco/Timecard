use axum::{
  extract::{DefaultBodyLimit, Path, Query, State as AxumState},
  response::Html,
  routing::get,
  routing::post,
  routing::put,
  Json, Router,
};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager, State};
use tower_http::cors::CorsLayer;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TimelineEvent {
  pub id: i64,
  pub person_id: i64,
  pub event_date: String,
  pub title: String,
  pub description: String,
  pub image_url: String,
  pub uploader_name: Option<String>,
  pub audio_url: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Person {
  pub id: i64,
  pub name: String,
  pub birth_date: String,
  pub dead_date: String,
  pub join_code: Option<String>,
}

#[derive(Deserialize)]
pub struct LoginRequest {
  pub email: String,
  pub password: String,
}

#[derive(Deserialize)]
pub struct JoinRequest {
  pub account_id: i64,
  pub join_code: String,
}

#[derive(Deserialize)]
pub struct SwitchActiveRequest {
  pub person_id: i64,
}

#[derive(Deserialize)]
pub struct CreateAccountRequest {
  pub name: String,
  pub email: String,
  pub birthdate: String,
  pub password: String,
}

#[derive(Deserialize)]
pub struct CreatePersonRequest {
  pub account_id: i64,
  pub name: String,
  pub birth_date: String,
  pub dead_date: String,
}

#[derive(Deserialize)]
pub struct AddMemoryRequest {
  pub person_id: i64,
  pub event_date: String,
  pub title: String,
  pub description: String,
  pub image_url: String,
  pub audio_url: Option<String>,
  pub uploaded_by_account_id: i64,
}

struct AppState {
  db: Arc<Mutex<Connection>>,
  active_person_id: Arc<Mutex<Option<i64>>>,
  server_status: Arc<Mutex<String>>,
}

#[tauri::command]
fn get_server_status(state: State<AppState>) -> String {
  state.server_status.lock().unwrap().clone()
}

#[derive(Clone)]
struct AxumStateData {
  db: Arc<Mutex<Connection>>,
  active_person_id: Arc<Mutex<Option<i64>>>,
  app_handle: tauri::AppHandle,
}

#[tauri::command]
fn get_current_display_state(state: State<AppState>) -> Result<Option<Person>, String> {
  let active_id = *state.active_person_id.lock().unwrap();
  if let Some(id) = active_id {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
      .prepare("SELECT id, name, birth_date, dead_date FROM people WHERE id = ?1")
      .map_err(|e| e.to_string())?;

    let person = stmt
      .query_row(rusqlite::params![id], |row| {
        Ok(Person {
          id: row.get(0)?,
          name: row.get(1)?,
          birth_date: row.get(2)?,
          dead_date: row.get(3)?,
          join_code: row.get(4).ok(),
        })
      })
      .ok();
    Ok(person)
  } else {
    Ok(None)
  }
}

#[tauri::command]
fn get_events(state: State<AppState>, person_id: i64) -> Result<Vec<TimelineEvent>, String> {
  let db = state.db.lock().map_err(|e| e.to_string())?;

  let mut stmt = db
    .prepare(
      "SELECT e.id, e.person_id, e.event_date, e.title, e.description, e.image_url, COALESCE(NULLIF(a.name, ''), a.email) 
       FROM events e 
       LEFT JOIN accounts a ON e.uploaded_by_account_id = a.id
       WHERE e.person_id = ?1 ORDER BY e.event_date ASC",
    )
    .map_err(|e| e.to_string())?;

  let event_iter = stmt
    .query_map(rusqlite::params![person_id], |row| {
      Ok(TimelineEvent {
        id: row.get(0)?,
        person_id: row.get(1)?,
        event_date: row.get(2)?,
        title: row.get(3)?,
        description: row.get(4)?,
        image_url: row.get(5)?,
        uploader_name: row.get(6).unwrap_or(None),
        audio_url: row.get(7).unwrap_or(None),
      })
    })
    .map_err(|e| e.to_string())?;

  let mut events = Vec::new();
  for event in event_iter {
    events.push(event.map_err(|e| e.to_string())?);
  }

  Ok(events)
}

#[tauri::command]
fn get_kiosk_url() -> String {
  let host = hostname::get().unwrap_or_else(|_| std::ffi::OsString::from("timecard"));
  format!("http://{}.local:8080", host.to_string_lossy())
}

#[tauri::command]
fn close_app() {
  std::process::exit(0);
}

#[tauri::command]
fn delete_event(state: State<AppState>, event_id: i64) -> Result<(), String> {
  let db = state.db.lock().map_err(|e| e.to_string())?;
  db.execute(
    "DELETE FROM events WHERE id = ?1",
    rusqlite::params![event_id],
  )
  .map_err(|e| e.to_string())?;
  Ok(())
}

// AXUM HANDLERS

async fn api_create_account(
  AxumState(state): AxumState<AxumStateData>,
  Json(payload): Json<CreateAccountRequest>,
) -> Result<Json<i64>, String> {
  let db = state.db.lock().map_err(|e| e.to_string())?;
  db.execute(
    "INSERT INTO accounts (name, email, birthdate, password) VALUES (?1, ?2, ?3, ?4)",
    rusqlite::params![
      payload.name,
      payload.email,
      payload.birthdate,
      payload.password
    ],
  )
  .map_err(|e| e.to_string())?;

  let account_id = db.last_insert_rowid();
  Ok(Json(account_id))
}

async fn api_login(
  AxumState(state): AxumState<AxumStateData>,
  Json(payload): Json<LoginRequest>,
) -> Result<Json<i64>, String> {
  let db = state.db.lock().map_err(|e| e.to_string())?;
  let id: i64 = db
    .query_row(
      "SELECT id FROM accounts WHERE email = ?1 AND password = ?2",
      rusqlite::params![payload.email, payload.password],
      |row| row.get(0),
    )
    .map_err(|_| "Invalid email or password".to_string())?;

  Ok(Json(id))
}

async fn api_create_person(
  AxumState(state): AxumState<AxumStateData>,
  Json(payload): Json<CreatePersonRequest>,
) -> Result<Json<i64>, String> {
  let db = state.db.lock().map_err(|e| e.to_string())?;

  // Generate a random 6-character Join Code
  let join_code: String = (0..6)
    .map(|_| {
      let idx = rand::random::<usize>() % 36;
      if idx < 10 {
        (b'0' + idx as u8) as char
      } else {
        (b'A' + (idx - 10) as u8) as char
      }
    })
    .collect();

  db.execute(
    "INSERT INTO people (account_id, name, birth_date, dead_date, join_code) VALUES (?1, ?2, ?3, ?4, ?5)",
    rusqlite::params![
      payload.account_id,
      payload.name,
      payload.birth_date,
      payload.dead_date,
      join_code
    ],
  )
  .map_err(|e| e.to_string())?;

  let person_id = db.last_insert_rowid();

  // Create initial access for the owner
  db.execute(
    "INSERT INTO people_access (account_id, person_id, role) VALUES (?1, ?2, 'owner')",
    rusqlite::params![payload.account_id, person_id],
  )
  .map_err(|e| e.to_string())?;

  *state.active_person_id.lock().unwrap() = Some(person_id);
  Ok(Json(person_id))
}

async fn api_join_timeline(
  AxumState(state): AxumState<AxumStateData>,
  Json(payload): Json<JoinRequest>,
) -> Result<Json<i64>, String> {
  let db = state.db.lock().map_err(|e| e.to_string())?;

  // Find person by join code
  let person_id: i64 = db
    .query_row(
      "SELECT id FROM people WHERE join_code = ?1",
      rusqlite::params![payload.join_code.to_uppercase()],
      |row| row.get(0),
    )
    .map_err(|_| "Invalid Join Code".to_string())?;

  // Check if access already exists
  let count: i64 = db
    .query_row(
      "SELECT COUNT(*) FROM people_access WHERE account_id = ?1 AND person_id = ?2",
      rusqlite::params![payload.account_id, person_id],
      |row| row.get(0),
    )
    .unwrap_or(0);

  if count == 0 {
    db.execute(
      "INSERT INTO people_access (account_id, person_id, role) VALUES (?1, ?2, 'contributor')",
      rusqlite::params![payload.account_id, person_id],
    )
    .map_err(|e| e.to_string())?;
  }

  Ok(Json(person_id))
}

async fn api_get_my_people(
  AxumState(state): AxumState<AxumStateData>,
  axum::extract::Path(account_id): axum::extract::Path<i64>,
) -> Result<Json<Vec<Person>>, String> {
  let db = state.db.lock().map_err(|e| e.to_string())?;
  let mut stmt = db
    .prepare(
      "SELECT p.id, p.name, p.birth_date, p.dead_date, p.join_code 
       FROM people p 
       JOIN people_access pa ON p.id = pa.person_id 
       WHERE pa.account_id = ?1",
    )
    .map_err(|e| e.to_string())?;

  let person_iter = stmt
    .query_map(rusqlite::params![account_id], |row| {
      Ok(Person {
        id: row.get(0)?,
        name: row.get(1)?,
        birth_date: row.get(2)?,
        dead_date: row.get(3)?,
        join_code: row.get(4).ok(),
      })
    })
    .map_err(|e| e.to_string())?;

  let mut people = Vec::new();
  for p in person_iter {
    people.push(p.map_err(|e| e.to_string())?);
  }
  Ok(Json(people))
}

async fn api_switch_active(
  AxumState(state): AxumState<AxumStateData>,
  Json(payload): Json<SwitchActiveRequest>,
) -> Result<Json<bool>, String> {
  *state.active_person_id.lock().unwrap() = Some(payload.person_id);
  Ok(Json(true))
}

async fn api_add_memory(
  AxumState(state): AxumState<AxumStateData>,
  Json(payload): Json<AddMemoryRequest>,
) -> Result<Json<i64>, String> {
  let db = state.db.lock().map_err(|e| e.to_string())?;
  db.execute(
    "INSERT INTO events (person_id, event_date, title, description, image_url, audio_url, uploaded_by_account_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
    rusqlite::params![
      payload.person_id,
      payload.event_date,
      payload.title,
      payload.description,
      payload.image_url,
      payload.audio_url.unwrap_or_default(),
      payload.uploaded_by_account_id
    ],
  )
  .map_err(|e| e.to_string())?;

  Ok(Json(db.last_insert_rowid()))
}

async fn api_get_timeline_access(
  AxumState(state): AxumState<AxumStateData>,
  axum::extract::Path(person_id): axum::extract::Path<i64>,
) -> Result<Json<Vec<String>>, String> {
  let db = state.db.lock().map_err(|e| e.to_string())?;
  let mut stmt = db
    .prepare(
      "SELECT COALESCE(NULLIF(a.name, ''), a.email) as display_name 
       FROM people_access pa 
       JOIN accounts a ON pa.account_id = a.id 
       WHERE pa.person_id = ?1",
    )
    .map_err(|e| e.to_string())?;

  let names_iter = stmt
    .query_map(rusqlite::params![person_id], |row| row.get(0))
    .map_err(|e| e.to_string())?;

  let mut names = Vec::new();
  for name in names_iter {
    names.push(name.map_err(|e| e.to_string())?);
  }
  Ok(Json(names))
}

#[derive(Deserialize)]
pub struct ChangePasswordRequest {
  pub account_id: i64,
  pub old_password: String,
  pub new_password: String,
}

async fn api_change_password(
  AxumState(state): AxumState<AxumStateData>,
  Json(payload): Json<ChangePasswordRequest>,
) -> Result<Json<bool>, String> {
  let db = state.db.lock().map_err(|e| e.to_string())?;

  // Verify old password
  let count: i64 = db
    .query_row(
      "SELECT COUNT(*) FROM accounts WHERE id = ?1 AND password = ?2",
      rusqlite::params![payload.account_id, payload.old_password],
      |row| row.get(0),
    )
    .unwrap_or(0);

  if count == 0 {
    return Err("Incorrect current password".to_string());
  }

  db.execute(
    "UPDATE accounts SET password = ?1 WHERE id = ?2",
    rusqlite::params![payload.new_password, payload.account_id],
  )
  .map_err(|e| e.to_string())?;

  Ok(Json(true))
}
#[derive(serde::Serialize)]
pub struct AccountProfile {
  pub id: i64,
  pub name: String,
  pub email: String,
}

async fn api_get_account_profile(
  AxumState(state): AxumState<AxumStateData>,
  axum::extract::Path(account_id): axum::extract::Path<i64>,
) -> Result<Json<AccountProfile>, String> {
  let db = state.db.lock().map_err(|e| e.to_string())?;

  let mut stmt = db
    .prepare("SELECT id, name, email FROM accounts WHERE id = ?1")
    .map_err(|e| e.to_string())?;

  let account = stmt
    .query_row([account_id], |row| {
      Ok(AccountProfile {
        id: row.get(0)?,
        name: row.get(1)?,
        email: row.get(2)?,
      })
    })
    .map_err(|e| e.to_string())?;

  Ok(Json(account))
}

#[derive(Deserialize)]
pub struct EventsQuery {
  pub account_id: i64,
}

async fn api_get_all_events(
  AxumState(state): AxumState<AxumStateData>,
  Query(query): Query<EventsQuery>,
) -> Result<Json<Vec<TimelineEvent>>, String> {
  let db = state.db.lock().map_err(|e| e.to_string())?;

  let mut person_stmt = db
    .prepare("SELECT person_id FROM account_people WHERE account_id = ?1")
    .map_err(|e| e.to_string())?;
  
  let person_iter = person_stmt
    .query_map([query.account_id], |row| row.get::<_, i64>(0))
    .map_err(|e| e.to_string())?;
    
  let mut all_events = Vec::new();

  for person_res in person_iter {
    if let Ok(person_id) = person_res {
      let mut stmt = db
        .prepare("SELECT id, person_id, event_date, title, description, image_url, uploader_name, audio_url FROM events WHERE person_id = ?1 ORDER BY event_date ASC")
        .map_err(|e| e.to_string())?;

      let event_iter = stmt
        .query_map([person_id], |row| {
          Ok(TimelineEvent {
            id: row.get(0)?,
            person_id: row.get(1)?,
            event_date: row.get(2)?,
            title: row.get(3)?,
            description: row.get(4)?,
            image_url: row.get(5)?,
            uploader_name: row.get(6).unwrap_or(None),
            audio_url: row.get(7).unwrap_or(None),
          })
        })
        .map_err(|e| e.to_string())?;

      for event in event_iter {
        if let Ok(evt) = event {
          all_events.push(evt);
        }
      }
    }
  }

  Ok(Json(all_events))
}

async fn api_update_event(
  AxumState(state): AxumState<AxumStateData>,
  Path(event_id): Path<i64>,
  Json(payload): Json<TimelineEvent>,
) -> Result<Json<bool>, String> {
  let db = state.db.lock().map_err(|e| e.to_string())?;
  db.execute(
    "UPDATE events SET title = ?1, description = ?2, image_url = ?3, uploader_name = ?4, audio_url = ?5 WHERE id = ?6",
    rusqlite::params![
      payload.title,
      payload.description,
      payload.image_url,
      payload.uploader_name,
      payload.audio_url,
      event_id
    ],
  )
  .map_err(|e| e.to_string())?;

  Ok(Json(true))
}

#[derive(Deserialize)]
pub struct KioskFocusPayload {
  pub event_id: i64,
  pub account_id: i64,
}

async fn api_kiosk_focus(
  AxumState(state): AxumState<AxumStateData>,
  Json(payload): Json<KioskFocusPayload>,
) -> Result<Json<bool>, String> {
  // Emit event to frontend
  state.app_handle.emit("kiosk-focus", payload.event_id).map_err(|e| e.to_string())?;
  Ok(Json(true))
}

#[derive(Deserialize)]
pub struct SetupWifiRequest {
  pub ssid: String,
  pub password: String,
}

async fn api_setup_wifi(Json(payload): Json<SetupWifiRequest>) -> Result<Json<bool>, String> {
  let ssid = payload.ssid.clone();
  let password = payload.password.clone();

  std::thread::spawn(move || {
    // Wait a couple of seconds to allow the HTTP response to return successfully
    std::thread::sleep(std::time::Duration::from_secs(2));

    // Turn down the hotspot
    let _ = std::process::Command::new("nmcli")
      .args(["con", "down", "Timecard-Kiosk"])
      .output();

    // Connect to new network
    let _ = std::process::Command::new("nmcli")
      .args(["dev", "wifi", "connect", &ssid, "password", &password])
      .output();
  });

  Ok(Json(true))
}

async fn serve_uploader() -> Html<&'static str> {
  Html(include_str!("uploader.html"))
}

async fn serve_uploader_css() -> impl axum::response::IntoResponse {
  (
    [(axum::http::header::CONTENT_TYPE, "text/css")],
    include_str!("uploader.css"),
  )
}

async fn serve_flatpickr_css() -> impl axum::response::IntoResponse {
  (
    [(axum::http::header::CONTENT_TYPE, "text/css")],
    include_str!("flatpickr.min.css"),
  )
}

async fn serve_flatpickr_js() -> impl axum::response::IntoResponse {
  (
    [(axum::http::header::CONTENT_TYPE, "application/javascript")],
    include_str!("flatpickr.min.js"),
  )
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      let app_data_dir = app
        .path()
        .app_data_dir()
        .expect("Failed to get app data dir");
      std::fs::create_dir_all(&app_data_dir).expect("Failed to create app data dir");
      let db_path = app_data_dir.join("timeline.db");

      let conn = Connection::open(db_path).expect("Failed to open local database");

      // Setup schema
      conn
        .execute_batch(
          "
        CREATE TABLE IF NOT EXISTS accounts (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL DEFAULT '',
          email TEXT NOT NULL,
          birthdate TEXT NOT NULL,
          password TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS people (
          id INTEGER PRIMARY KEY,
          account_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          birth_date TEXT NOT NULL,
          dead_date TEXT NOT NULL,
          join_code TEXT,
          audio_url TEXT
        );
        CREATE TABLE IF NOT EXISTS people_access (
          id INTEGER PRIMARY KEY,
          account_id INTEGER NOT NULL,
          person_id INTEGER NOT NULL,
          role TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS events (
          id INTEGER PRIMARY KEY,
          person_id INTEGER NOT NULL DEFAULT 1,
          uploaded_by_account_id INTEGER,
          event_date TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          image_url TEXT NOT NULL,
          audio_url TEXT
        );
        ",
        )
        .expect("Failed to create tables");

      // Migration for join_code support
      let _ = conn.execute("ALTER TABLE people ADD COLUMN join_code TEXT", []);

      let _ = conn.execute(
        "CREATE TABLE IF NOT EXISTS people_access (
          id INTEGER PRIMARY KEY,
          account_id INTEGER NOT NULL,
          person_id INTEGER NOT NULL,
          role TEXT NOT NULL
        )",
        [],
      );

      // Attempt to lazily add person_id if coming from an older version of the schema
      let _ = conn.execute(
        "ALTER TABLE events ADD COLUMN person_id INTEGER NOT NULL DEFAULT 1",
        [],
      );

      // Lazily add new schema fields for phase 2
      let _ = conn.execute(
        "ALTER TABLE accounts ADD COLUMN name TEXT NOT NULL DEFAULT ''",
        [],
      );
      let _ = conn.execute(
        "ALTER TABLE events ADD COLUMN uploaded_by_account_id INTEGER",
        [],
      );
      let _ = conn.execute("ALTER TABLE people ADD COLUMN audio_url TEXT", []);
      let _ = conn.execute("ALTER TABLE events ADD COLUMN audio_url TEXT", []);

      let shared_db = Arc::new(Mutex::new(conn));
      let active_person = Arc::new(Mutex::new(None));
      let server_status = Arc::new(Mutex::new("Starting...".to_string()));

      // Tauri App State
      app.manage(AppState {
        db: shared_db.clone(),
        active_person_id: active_person.clone(),
        server_status: server_status.clone(),
      });

      let app_handle = app.handle().clone();

      // Spawn the Axum server
      let axum_state = AxumStateData {
        db: shared_db,
        active_person_id: active_person,
        app_handle,
      };

      tauri::async_runtime::spawn(async move {
        *server_status.lock().unwrap() = "Step 1: Building router...".to_string();

        let axum_app = Router::new()
          .route("/", get(serve_uploader))
          .route("/api/accounts", post(api_create_account))
          .route("/api/login", post(api_login))
          .route("/api/people", post(api_create_person))
          .route("/api/my-people/{account_id}", get(api_get_my_people))
          .route("/api/join", post(api_join_timeline))
          .route("/api/switch", post(api_switch_active))
          .route("/api/events", post(api_add_memory)) // The new memory endpoint
          .route("/api/events", get(api_get_all_events))
          .route("/api/events/{event_id}", put(api_update_event))
          .route("/api/kiosk/focus", post(api_kiosk_focus))
          .route(
            "/api/timeline-access/{person_id}",
            get(api_get_timeline_access),
          )
          .route("/api/change-password", post(api_change_password))
          .route("/api/accounts/{account_id}", get(api_get_account_profile))
          .route("/api/setup-wifi", post(api_setup_wifi))
          .route("/uploader.css", get(serve_uploader_css))
          .route("/flatpickr.min.css", get(serve_flatpickr_css))
          .route("/flatpickr.min.js", get(serve_flatpickr_js))
          .layer(DefaultBodyLimit::max(50 * 1024 * 1024))
          .with_state(axum_state)
          .layer(CorsLayer::permissive());

        *server_status.lock().unwrap() = "Step 2: Binding port 8080...".to_string();

        // Add a small 2-second delay to ensure the OS has released the port from previous crashes
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;

        match tokio::net::TcpListener::bind("0.0.0.0:8080").await {
          Ok(listener) => {
            *server_status.lock().unwrap() = "Running".to_string();
            println!("🚀 Local Kiosk Server listening on http://0.0.0.0:8080");
            if let Err(e) = axum::serve(listener, axum_app).await {
              *server_status.lock().unwrap() = format!("Server Error: {}", e);
            }
          }
          Err(e) => {
            *server_status.lock().unwrap() = format!("Network Error: {}", e);
          }
        }
      });

      Ok(())
    })
    .plugin(tauri_plugin_opener::init())
    .invoke_handler(tauri::generate_handler![
      get_events,
      get_kiosk_url,
      get_current_display_state,
      get_server_status,
      close_app,
      delete_event
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
