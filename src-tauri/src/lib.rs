use axum::{
  extract::{DefaultBodyLimit, State as AxumState},
  response::Html,
  routing::get,
  routing::post,
  Json, Router,
};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::{Manager, State};
use tower_http::cors::CorsLayer;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TimelineEvent {
  pub id: i64,
  pub person_id: i64,
  pub event_date: String,
  pub title: String,
  pub description: String,
  pub image_url: String,
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
      "SELECT id, person_id, event_date, title, description, image_url FROM events WHERE person_id = ?1 ORDER BY event_date ASC",
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

// AXUM HANDLERS

async fn api_create_account(
  AxumState(state): AxumState<AxumStateData>,
  Json(payload): Json<CreateAccountRequest>,
) -> Result<Json<i64>, String> {
  let db = state.db.lock().map_err(|e| e.to_string())?;
  db.execute(
    "INSERT INTO accounts (email, birthdate, password) VALUES (?1, ?2, ?3)",
    rusqlite::params![payload.email, payload.birthdate, payload.password],
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
    "INSERT INTO events (person_id, event_date, title, description, image_url) VALUES (?1, ?2, ?3, ?4, ?5)",
    rusqlite::params![
      payload.person_id,
      payload.event_date,
      payload.title,
      payload.description,
      payload.image_url
    ],
  )
  .map_err(|e| e.to_string())?;

  Ok(Json(db.last_insert_rowid()))
}

async fn serve_uploader() -> Html<&'static str> {
  Html(include_str!("uploader.html"))
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
          join_code TEXT
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
          event_date TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          image_url TEXT NOT NULL
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

      let shared_db = Arc::new(Mutex::new(conn));
      let active_person = Arc::new(Mutex::new(None));
      let server_status = Arc::new(Mutex::new("Starting...".to_string()));

      // Tauri App State
      app.manage(AppState {
        db: shared_db.clone(),
        active_person_id: active_person.clone(),
        server_status: server_status.clone(),
      });

      // Spawn the Axum server
      let axum_state = AxumStateData {
        db: shared_db,
        active_person_id: active_person,
      };

      tauri::async_runtime::spawn(async move {
        *server_status.lock().unwrap() = "Step 1: Building router...".to_string();

        let axum_app = Router::new()
          .route("/", get(serve_uploader))
          .route("/api/accounts", post(api_create_account))
          .route("/api/login", post(api_login))
          .route("/api/people", post(api_create_person))
          .route("/api/my-people/:account_id", get(api_get_my_people))
          .route("/api/join", post(api_join_timeline))
          .route("/api/switch", post(api_switch_active))
          .route("/api/events", post(api_add_memory)) // The new memory endpoint
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
      close_app
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
