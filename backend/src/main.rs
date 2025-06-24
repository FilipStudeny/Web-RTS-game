use redis::TypedCommands;
mod models;
mod routes;

use std::{fs, net::SocketAddr, path::Path as FsPath, sync::Arc};
use std::collections::{HashMap, HashSet};
use axum::{
    Router,
    body::Bytes,
    extract::{
        ConnectInfo, Path, State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    http::{HeaderMap, Method, StatusCode},
    response::IntoResponse,
    routing::{get, post},
};
use axum::extract::ws::Utf8Bytes;
use futures::{SinkExt, StreamExt};
use models::proto::{
    Area as PbArea, AreaList as PbAreaList, Scenario, ScenarioList, ScenarioSummary,
    UnitType as PbUnitType, UnitTypeKey, UnitTypeList as PbUnitTypeList,
};
use mongodb::{
    Client, Database, bson,
    bson::{Document, doc, oid::ObjectId, to_bson},
};
use prost::Message as ProstMessage;
use serde::de::DeserializeOwned;
use tokio::net::TcpListener;
use tower_http::cors::{Any, CorsLayer};
use tracing::{error, info};
use tracing_subscriber;
use uuid::Uuid;
use redis::{AsyncCommands, Client as RedisClient, Connection};
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;
use tracing::log::warn;
use routes::get_unit_types::get_unit_types;
use crate::models::proto::{ws_server_message, GameEndedEvent, GameStartedEvent, JoinSessionRequest, JoinSessionResponse, SessionList, SessionReadyEvent, StartSessionRequest, StartSessionResponse, WsServerMessage};

#[derive(Deserialize)]
struct StartSessionInput {
    scenario_id: String,
    user_id: String,
}

#[derive(Deserialize)]
struct JoinSessionInput {
    session_id: String,
    user_id: String,
}

#[derive(Serialize)]
struct SessionSummary {
    session_id: String,
    scenario_id: String,
    state: String,
    player1: String,
    player2: Option<String>,
}
#[derive(Deserialize)]
struct StartGameInput {
    session_id: String,
}
type Tx = tokio::sync::mpsc::UnboundedSender<Message>;

#[derive(Clone)]
struct AppState {
    db: Arc<Database>,
    redis: Arc<Mutex<Connection>>,
    sockets: Arc<Mutex<HashMap<String, Tx>>>,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt().with_target(false).compact().init();

    let db_client = Client::with_uri_str("mongodb://localhost:27017")
        .await
        .expect("Failed to connect to MongoDB");
    let db = Arc::new(db_client.database("simulation"));

    let redis_client = RedisClient::open("redis://127.0.0.1/").expect("Failed to create Redis client");
    let redis_conn = redis_client.get_connection().expect("Failed to connect to Redis");

    let state = AppState {
        db,
        redis: Arc::new(Mutex::new(redis_conn)),
        sockets: Arc::new(Mutex::new(HashMap::new())),
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST])
        .allow_headers(Any);

    let app = Router::new()
        .route("/ws", get(ws_handler))
        .route("/api/unit-types.pb", get(get_unit_types))
        .route("/api/area-types.pb", get(routes::get_area_types::list_area_types_protobuf))
        .route("/api/scenario.pb", post(routes::create_scenario::create_scenario))
        .route("/api/scenario/{id}/pb", get(routes::get_scenario_by_id::get_scenario_by_id_protobuf))
        .route("/api/scenario-list.pb", get(routes::get_scenarios::get_scenarios))
        .route("/api/session/join", post(join_session))
        .route("/api/session/start", post(start_session))
        .route("/api/session/close/{session_id}", post(close_session))
        .route("/api/session/{session_id}", get(get_session_by_id))

        .route("/api/session-list", get(list_sessions))
        .route("/api/session/start-game", post(start_game))
        .route("/api/session/disconnect/{user_id}", post(disconnect_user))
        .with_state(state.clone())
        .layer(cors);

    let listener = TcpListener::bind("0.0.0.0:9999").await.unwrap();

    info!("Server running at:");
    info!("- WebSocket: ws://localhost:9999/ws");
    info!("- REST API: http://localhost:9999/api/scenario.pb");

    axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>()).await.unwrap();

}

async fn ws_handler(ws: WebSocketUpgrade, ConnectInfo(addr): ConnectInfo<SocketAddr>, State(state): State<AppState>) -> impl IntoResponse {
    info!("Client connected: {}", addr.ip());
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: AppState) {
    let user_id = Uuid::new_v4().to_string();
    let (mut sender, mut receiver) = socket.split();
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<Message>();

    // Store socket sender in memory
    state.sockets.lock().await.insert(user_id.clone(), tx.clone());

    // Store online status in Redis without expiration
    {
        let mut redis = state.redis.lock().await;
        if let Err(e) = redis.set(format!("online:{}", user_id), "1") {
            warn!("❌ Failed to set online status for {}: {}", user_id, e);
        }
    }

    // Spawn background task to forward messages from rx to WebSocket
    tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if sender.send(msg).await.is_err() {
                break;
            }
        }
    });

    // Send the user_id as the first message
    let _ = tx.send(Message::Text(Utf8Bytes::from(user_id.clone())));

    info!("Assigned ID: {}", user_id);

    // Handle incoming messages (e.g., pings)
    while let Some(Ok(msg)) = receiver.next().await {
        match msg {
            Message::Text(_) => {
                // No TTL update needed
            }
            Message::Ping(_) | Message::Pong(_) => {
                //  pings/pongs
            }
            Message::Close(_) => {
                break;
            }
            _ => {}
        }
    }

    // Cleanup on disconnect
    state.sockets.lock().await.remove(&user_id);

    {
        let mut redis = state.redis.lock().await;

        if let Err(e) = redis.del(format!("online:{}", user_id)) {
            warn!("❌ Failed to delete online status for {}: {}", user_id, e);
        }

        cleanup_user_sessions(&user_id, &mut *redis, &state.sockets).await;
    }

    info!("{} disconnected", user_id);
}

pub fn load_configs_from_file<T: DeserializeOwned>(path: &FsPath) -> Result<Vec<T>, String> {
    let content =
        fs::read_to_string(path).map_err(|e| format!("Failed to read file {:?}: {}", path, e))?;
    serde_json::from_str(&content).map_err(|e| format!("Failed to parse JSON in {:?}: {}", path, e))
}

pub fn load_configs_from_dir<T: DeserializeOwned>(dir: &FsPath) -> Result<Vec<T>, String> {
    let mut result = Vec::new();
    for entry in fs::read_dir(dir).map_err(|e| format!("Failed to read dir: {}", e))? {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) == Some("json") {
            let content = fs::read_to_string(&path)
                .map_err(|e| format!("Failed to read file {:?}: {}", path, e))?;
            let mut data: Vec<T> = serde_json::from_str(&content)
                .map_err(|e| format!("Failed to parse {:?}: {}", path, e))?;
            result.append(&mut data);
        }
    }
    Ok(result)
}


#[derive(serde::Deserialize)]
struct RawArea {
    pub name: String,
    pub description: String,
    pub color: String,
    pub movement_speed_modifier: f32,
    pub accuracy_modifier: f32,
    pub enemy_miss_chance: f32,
}

// Session creation
async fn start_session(State(state): State<AppState>, body: Bytes) -> impl IntoResponse {
    info!("📨 Received POST /api/session/start ({} bytes)", body.len());

    let request = match StartSessionRequest::decode(&*body) {
        Ok(r) => {
            info!(
                "✅ Decoded StartSessionRequest: user_id={}, scenario_id={}",
                r.user_id, r.scenario_id
            );
            r
        }
        Err(e) => {
            warn!("❌ Failed to decode StartSessionRequest: {}", e);
            return (StatusCode::BAD_REQUEST, format!("Protobuf decode error: {}", e)).into_response();
        }
    };

    let scenario_obj_id = match ObjectId::parse_str(&request.scenario_id) {
        Ok(id) => id,
        Err(_) => {
            warn!("❌ Invalid scenario_id: {}", request.scenario_id);
            return (StatusCode::BAD_REQUEST, String::from("Invalid scenario_id")).into_response();
        }
    };

    let scenario_doc = match state
        .db
        .collection::<Document>("scenarios")
        .find_one(doc! { "_id": scenario_obj_id })
        .await
    {
        Ok(Some(doc)) => doc,
        Ok(None) => {
            warn!("❌ Scenario not found in DB: {}", request.scenario_id);
            return (StatusCode::NOT_FOUND, String::from("Scenario not found")).into_response();
        }
        Err(e) => {
            error!("❌ MongoDB error: {}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, String::from("DB error")).into_response();
        }
    };

    let scenario_name = match scenario_doc.get_str("NAME") {
        Ok(name) => name.to_string(),
        Err(_) => {
            warn!("❌ Scenario missing 'NAME' field");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                String::from("Scenario missing NAME"),
            )
                .into_response();
        }
    };

    let session_id = Uuid::new_v4().to_string();
    let key = format!("session:{}", session_id);
    let user_set_key = format!("session_users:{}", session_id);

    let mut redis = state.redis.lock().await;

    // 🔐 Store session data
    if let Err(e) = redis.hset_multiple(
        &key,
        &[
            ("scenario_id", request.scenario_id.as_str()),
            ("scenario_name", scenario_name.as_str()),
            ("state", "idle"),
            ("player1", request.user_id.as_str()),
        ],
    ) {
        error!("❌ Redis hset_multiple failed: {}", e);
        return (StatusCode::INTERNAL_SERVER_ERROR, "Redis error").into_response();
    }

    // 🧱 Remove TTL to persist the key
    if let Err(e) = redis.persist(&key) {
        warn!("⚠️ Failed to persist session {}: {}", key, e);
    }

    // 👤 Add user to session user set
    if let Err(e) = redis.sadd::<_, _>(&user_set_key, &request.user_id) {
        warn!("⚠️ Redis sadd failed: {}", e);
    }

    // 🧱 Ensure user set key is persistent
    if let Err(e) = redis.persist(&user_set_key) {
        warn!("⚠️ Failed to persist session user set {}: {}", user_set_key, e);
    }

    // 🎁 Respond
    let response = StartSessionResponse {
        session_id: session_id.clone(),
    };
    let mut buf = Vec::new();
    if response.encode(&mut buf).is_err() {
        error!("❌ Failed to encode StartSessionResponse");
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to encode protobuf",
        )
            .into_response();
    }

    info!("✅ Session '{}' successfully created", session_id);

    let mut headers = HeaderMap::new();
    headers.insert("Content-Type", "application/protobuf".parse().unwrap());

    (headers, buf).into_response()
}


async fn join_session(State(state): State<AppState>, body: Bytes) -> impl IntoResponse {
    info!("📨 Received POST /api/session/join ({} bytes)", body.len());

    let request = match JoinSessionRequest::decode(&*body) {
        Ok(r) => {
            info!("✅ Decoded JoinSessionRequest: session_id={}, user_id={}", r.session_id, r.user_id);
            r
        },
        Err(e) => {
            warn!("❌ Failed to decode JoinSessionRequest: {}", e);
            return (StatusCode::BAD_REQUEST, format!("Protobuf decode error: {}", e)).into_response();
        }
    };

    let key = format!("session:{}", request.session_id);
    let mut redis = state.redis.lock().await;

    // 🚫 Check if the session exists
    if !redis.exists::<_>(&key).unwrap_or(false) {
        warn!("🚫 Session '{}' does not exist", request.session_id);
        return (StatusCode::NOT_FOUND, "Session does not exist").into_response();
    }

    // 🔍 Fetch session data
    let session_data: HashMap<String, String> = redis.hgetall(&key).unwrap_or_default();

    let state_value = session_data.get("state").cloned().unwrap_or_else(|| "unknown".to_string());
    let player1_opt = session_data.get("player1").cloned();
    let player2_opt = session_data.get("player2").cloned();

    info!("🔍 Session state: {}, player1: {:?}, player2: {:?}", state_value, player1_opt, player2_opt);

    // 🚫 Reject if both player1 and player2 are filled
    if player1_opt.is_some() && player2_opt.is_some() {
        warn!("❌ Session '{}' already has two players", request.session_id);
        return (StatusCode::CONFLICT, "Session is full").into_response();
    }

    // 🚫 Reject if already progressing
    if state_value != "idle" {
        warn!("❌ Session '{}' is not idle (state={})", request.session_id, state_value);
        return (StatusCode::CONFLICT, "Session already in progress").into_response();
    }

    // ✅ Proceed with joining
    let result = redis.hset_multiple(&key, &[
        ("player2", request.user_id.as_str()),
        ("state", "progressing"),
    ]);

    match result {
        Ok(_) => info!("✅ Added player2 '{}' and updated session state", request.user_id),
        Err(e) => {
            error!("❌ Failed to update session in Redis: {}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to join session").into_response();
        }
    }

    match redis.sadd::<_, _>(format!("session_users:{}", request.session_id), &request.user_id) {
        Ok(_) => info!("👥 Added player2 '{}' to session user set", request.user_id),
        Err(e) => warn!("⚠️ Redis sadd failed for player2: {}", e),
    }

    // Notify player1 via WebSocket
    if let Some(player1_id) = player1_opt {
        if let Some(tx) = state.sockets.lock().await.get(&player1_id) {
            let message = WsServerMessage {
                payload: Some(ws_server_message::Payload::SessionReady(SessionReadyEvent {
                    session_id: request.session_id.clone(),
                    player2: request.user_id.clone(),
                })),
            };
            let mut buf = Vec::new();
            if message.encode(&mut buf).is_ok() {
                let _ = tx.send(Message::Binary(Bytes::from(buf)));
                info!("📢 Sent SessionReadyEvent to player1 '{}'", player1_id);
            }
        }
    }

    // Return response
    let mut buf = Vec::new();
    let _ = JoinSessionResponse {}.encode(&mut buf);

    let mut headers = HeaderMap::new();
    headers.insert("Content-Type", "application/protobuf".parse().unwrap());

    info!("✅ join_session response ready for user {}", request.user_id);
    (headers, buf).into_response()
}

// Disconnect user and clean up session if empty
async fn disconnect_user(State(state): State<AppState>, Path(user_id): Path<String>) -> impl IntoResponse {
    info!("POST /api/session/disconnect/{}", user_id);
    let mut redis = state.redis.lock().await;

    cleanup_user_sessions(&user_id, &mut *redis, &state.sockets).await;
    
    if let Err(e) = redis.del(format!("online:{}", user_id)) {
        warn!("❌ Failed to delete online status for {}: {}", user_id, e);
    }

    info!("✅ User {} disconnected and sessions cleaned up", user_id);
    (StatusCode::OK, "User disconnected").into_response()
}


// List all sessions using Protobuf
async fn list_sessions(State(state): State<AppState>) -> impl IntoResponse {
    info!("GET /api/session-list");
    let mut redis = state.redis.lock().await;
    let keys: Vec<String> = redis.keys("session:*").unwrap_or_default();
    let mut summaries: Vec<models::proto::SessionSummary> = vec![];

    for key in keys {
        let session_id = key.strip_prefix("session:").unwrap_or("").to_string();
        if let Ok(data) = redis.hgetall::<_>(&key) {
            summaries.push(models::proto::SessionSummary {
                session_id,
                scenario_id: data.get("scenario_id").cloned().unwrap_or_default(),
                state: data.get("state").cloned().unwrap_or_default(),
                player1: data.get("player1").cloned().unwrap_or_default(),
                player2: data.get("player2").cloned().unwrap_or_default(),
                scenario_name: data.get("scenario_name").cloned().unwrap_or_default(),
            });
        }
    }

    let response = SessionList { sessions: summaries };
    let mut buf = Vec::new();
    if response.encode(&mut buf).is_err() {
        error!("Failed to encode SessionList");
        return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to encode protobuf").into_response();
    }

    info!("Session list returned successfully");

    let mut headers = HeaderMap::new();
    headers.insert("Content-Type", "application/protobuf".parse().unwrap());
    (headers, buf).into_response()
}

async fn start_game(State(state): State<AppState>, body: Bytes) -> impl IntoResponse {
    let input = match serde_json::from_slice::<StartGameInput>(&body) {
        Ok(data) => data,
        Err(e) => {
            return (StatusCode::BAD_REQUEST, format!("Invalid input: {}", e)).into_response();
        }
    };

    info!("🎮 Starting game for session: {}", input.session_id);

    let mut redis = state.redis.lock().await;
    let user_set_key = format!("session_users:{}", input.session_id);
    let users: HashSet<String> = match redis.smembers(&user_set_key) {
        Ok(set) => set,
        Err(e) => {
            error!("Failed to get session users: {}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to get session users").into_response();
        }
    };

    let message = WsServerMessage {
        payload: Some(ws_server_message::Payload::GameStarted(GameStartedEvent {
            session_id: input.session_id.clone(),
        })),
    };

    let mut buf = Vec::new();
    if message.encode(&mut buf).is_err() {
        return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to encode GameStartedEvent").into_response();
    }

    let txs = state.sockets.lock().await;
    let count = users.iter().filter(|uid| {
        if let Some(tx) = txs.get(*uid) {
            let _ = tx.send(Message::Binary(buf.clone().into()));
            true
        } else {
            false
        }
    }).count();

    info!("✅ Notified {} players about game start", count);

    (StatusCode::OK, "Game started").into_response()
}


// Helper to clean up user from sessions and remove empty sessions
async fn cleanup_user_sessions(user_id: &str, redis: &mut impl TypedCommands, sockets: &Arc<Mutex<HashMap<String, Tx>>>) {
    let keys: Vec<String> = redis.keys("session_users:*").unwrap_or_default();

    for key in keys {
        if redis.sismember(&key, user_id).unwrap_or(false) {
            info!("Removing user {} from set {}", user_id, key);
            let _ = redis.srem::<_, _>(&key, user_id);

            let session_id = key.strip_prefix("session_users:").unwrap_or("").to_string();

            // Get session info
            let session_key = format!("session:{}", session_id);
            let session_data = redis.hgetall::<_>(&session_key).unwrap_or_default();

            let maybe_opponent = if session_data.get("player1") == Some(&user_id.to_string()) {
                session_data.get("player2").cloned()
            } else if session_data.get("player2") == Some(&user_id.to_string()) {
                session_data.get("player1").cloned()
            } else {
                None
            };

            if let Some(opponent_id) = maybe_opponent {
                info!("User {} disconnected, notifying opponent {}", user_id, opponent_id);

                let msg = WsServerMessage {
                    payload: Some(ws_server_message::Payload::GameEnded(GameEndedEvent {
                        session_id: session_id.clone(),
                        winner_id: opponent_id.clone(),
                        reason: format!("Player {} disconnected", user_id),
                    })),
                };

                let mut buf = Vec::new();
                if msg.encode(&mut buf).is_ok() {
                    if let Some(tx) = sockets.lock().await.get(&opponent_id) {
                        let _ = tx.send(Message::Binary(Bytes::from(buf)));
                        info!("✅ Notified {} about win due to opponent disconnect", opponent_id);
                    } else {
                        warn!("⚠️ Socket for opponent {} not found", opponent_id);
                    }
                } else {
                    error!("❌ Failed to encode GameEndedEvent");
                }
            }

            // Clean up the session if empty
            if redis.scard::<_>(&key).unwrap_or(1) == 0 {
                info!("Session {} is empty. Cleaning up.", session_id);
                let _ = redis.del(&session_key);
                let _ = redis.del(&key);
            }
        }
    }
}

async fn close_session(State(state): State<AppState>, Path(session_id): Path<String>) -> impl IntoResponse {
    info!("🗑️ Closing session: {}", session_id);

    let mut redis = state.redis.lock().await;

    let session_key = format!("session:{}", session_id);
    let user_set_key = format!("session_users:{}", session_id);

    // Get users in the session before deletion
    let users: HashSet<String> = redis.smembers(&user_set_key).unwrap_or_default();

    // Clean up Redis keys
    let _ = redis.del(&session_key);
    let _ = redis.del(&user_set_key);

    // Notify all users still connected
    let sockets = state.sockets.lock().await;

    let msg = WsServerMessage {
        payload: Some(ws_server_message::Payload::GameEnded(GameEndedEvent {
            session_id: session_id.clone(),
            winner_id: "".to_string(),
            reason: "Session closed by host".to_string(),
        })),
    };

    let mut buf = Vec::new();
    if msg.encode(&mut buf).is_ok() {
        for user_id in users {
            if let Some(tx) = sockets.get(&user_id) {
                let _ = tx.send(Message::Binary(Bytes::from(buf.clone())));
                info!("📢 Notified {} about session closure", user_id);
            }
        }
    }

    (StatusCode::OK, "Session closed").into_response()
}

async fn get_session_by_id(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
) -> impl IntoResponse {
    let key = format!("session:{}", session_id);
    let mut redis = state.redis.lock().await;

    let exists = match redis.exists::<_>(&key) {
        Ok(true) => true,
        Ok(false) => return (StatusCode::NOT_FOUND, "Session not found").into_response(),
        Err(e) => {
            error!("Redis error: {}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, "Redis error").into_response();
        }
    };

    let data: HashMap<String, String> = match redis.hgetall(&key) {
        Ok(map) => map,
        Err(e) => {
            error!("Redis fetch error: {}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, "Redis error").into_response();
        }
    };

    let summary = models::proto::SessionSummary {
        session_id: session_id.clone(),
        scenario_id: data.get("scenario_id").cloned().unwrap_or_default(),
        scenario_name: data.get("scenario_name").cloned().unwrap_or_default(),
        state: data.get("state").cloned().unwrap_or_else(|| "unknown".into()),
        player1: data.get("player1").cloned().unwrap_or_default(),
        player2: data.get("player2").cloned().unwrap_or_default(),
    };

    let mut buf = Vec::new();
    if summary.encode(&mut buf).is_err() {
        return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to encode protobuf").into_response();
    }

    let mut headers = HeaderMap::new();
    headers.insert("Content-Type", "application/protobuf".parse().unwrap());
    (headers, Bytes::from(buf)).into_response()
}