use axum::{
  extract::{DefaultBodyLimit, State as AxumState},
  http::StatusCode,
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
fn get_first_person_id(state: State<AppState>) -> Result<Option<i64>, String> {
  let db = state.db.lock().map_err(|e| e.to_string())?;
  let mut stmt = db
    .prepare("SELECT id FROM people LIMIT 1")
    .map_err(|e| e.to_string())?;
  let id: Option<i64> = stmt
    .query_row([], |row| row.get(0))
    .optional()
    .map_err(|e| e.to_string())?;
  Ok(id)
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

#[tauri::command]
fn close_app() {
  std::process::exit(0);
}

// AXUM HANDLERS

async fn api_create_account(
  AxumState(state): AxumState<AxumStateData>,
  Json(payload): Json<CreateAccountRequest>,
) -> Result<Json<i64>, (StatusCode, String)> {
  let db = state.db.lock().map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Mutex error: {}", e)))?;
  db.execute(
    "INSERT INTO accounts (email, birthdate, password) VALUES (?1, ?2, ?3)",
    rusqlite::params![payload.email, payload.birthdate, payload.password],
  )
  .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("DB error: {}", e)))?;

  Ok(Json(db.last_insert_rowid()))
}

async fn api_create_person(
  AxumState(state): AxumState<AxumStateData>,
  Json(payload): Json<CreatePersonRequest>,
) -> Result<Json<i64>, (StatusCode, String)> {
  let db = state.db.lock().map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Mutex error: {}", e)))?;
  db.execute(
    "INSERT INTO people (account_id, name, birth_date, dead_date) VALUES (?1, ?2, ?3, ?4)",
    rusqlite::params![
      payload.account_id,
      payload.name,
      payload.birth_date,
      payload.dead_date
    ],
  )
  .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("DB error: {}", e)))?;

  let person_id = db.last_insert_rowid();
  if let Ok(mut active_person) = state.active_person_id.lock() {
      *active_person = Some(person_id);
  }
  Ok(Json(person_id))
}

async fn api_add_memory(
  AxumState(state): AxumState<AxumStateData>,
  Json(payload): Json<AddMemoryRequest>,
) -> Result<Json<i64>, (StatusCode, String)> {
  let db = state.db.lock().map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Mutex error: {}", e)))?;
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
  .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("DB error: {}", e)))?;

  Ok(Json(db.last_insert_rowid()))
}

async fn serve_uploader() -> Html<&'static str> {
  Html(include_str!("uploader.html"))
}

async fn serve_heic2any() -> impl axum::response::IntoResponse {
  (
    [(axum::http::header::CONTENT_TYPE, "application/javascript")],
    include_str!("heic2any.min.js"),
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
          email TEXT NOT NULL,
          birthdate TEXT NOT NULL,
          password TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS people (
          id INTEGER PRIMARY KEY,
          account_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          birth_date TEXT NOT NULL,
          dead_date TEXT NOT NULL
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

      // Attempt to lazily add person_id if coming from an older version of the schema
      let _ = conn.execute(
        "ALTER TABLE events ADD COLUMN person_id INTEGER NOT NULL DEFAULT 1",
        [],
      );

      let shared_db = Arc::new(Mutex::new(conn));
      let active_person = Arc::new(Mutex::new(None));

      // Tauri App State
      app.manage(AppState {
        db: shared_db.clone(),
        active_person_id: active_person.clone(),
      });

      // Spawn the Axum server
      let axum_state = AxumStateData {
        db: shared_db,
        active_person_id: active_person,
      };

      tauri::async_runtime::spawn(async move {
        let axum_app = Router::new()
          .route("/", get(serve_uploader))
          .route("/heic2any.min.js", get(serve_heic2any))
          .route("/api/accounts", post(api_create_account))
          .route("/api/people", post(api_create_person))
          .route("/api/events", post(api_add_memory)) // The new memory endpoint
          .layer(DefaultBodyLimit::max(50 * 1024 * 1024))
          .with_state(axum_state)
          .layer(CorsLayer::permissive());

        let listener = tokio::net::TcpListener::bind("0.0.0.0:8080").await.unwrap();
        println!("🚀 Local Kiosk Server listening on http://0.0.0.0:8080");
        axum::serve(listener, axum_app).await.unwrap();
      });

      Ok(())
    })
    .plugin(tauri_plugin_opener::init())
    .invoke_handler(tauri::generate_handler![
      get_events,
      get_kiosk_url,
      get_current_display_state,
      get_first_person_id,
      delete_event,
      close_app
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
