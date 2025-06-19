use redis::TypedCommands;
mod models;

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
use crate::models::proto::{ws_server_message, GameStartedEvent, JoinSessionRequest, JoinSessionResponse, SessionList, SessionReadyEvent, StartSessionRequest, StartSessionResponse, WsServerMessage};

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
        .route("/api/unit-types.pb", get(list_unit_types_protobuf))
        .route("/api/area-types.pb", get(list_area_types_protobuf))
        .route("/api/scenario.pb", post(receive_scenario_protobuf))
        .route("/api/scenario/{id}/pb", get(get_scenario_by_id_protobuf))
        .route("/api/scenario-list.pb", get(list_scenario_summaries_protobuf))
        .route("/api/session/join", post(join_session))
        .route("/api/session/start", post(start_session))
        .route("/api/session-list", get(list_sessions))
        .route("/api/session/start-game", post(start_game))
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

    // Save socket sender for later messages (e.g., session-ready)
    state.sockets.lock().await.insert(user_id.clone(), tx.clone());

    // Spawn background task to forward messages from rx to WebSocket
    tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if sender.send(msg).await.is_err() {
                break;
            }
        }
    });

    // Send the user_id as the first message through the tx
    let _ = tx.send(Message::Text(Utf8Bytes::from(user_id.clone())));

    info!("Assigned ID: {}", user_id);

    // Handle incoming pings / TTL refresh
    while let Some(Ok(msg)) = receiver.next().await {
        if let Message::Text(_) = msg {
            let mut redis = state.redis.lock().await;
            let _ = redis.expire(format!("online:{}", user_id), 60);
        }
    }

    state.sockets.lock().await.remove(&user_id);
    let mut redis = state.redis.lock().await;
    let _ = redis.del(format!("online:{}", user_id));
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

pub async fn list_unit_types_protobuf() -> impl IntoResponse {
    let config_file = FsPath::new("../shared/configs/units-config.json");

    let raw_units: Vec<serde_json::Value> = match load_configs_from_file(config_file) {
        Ok(units) => units,
        Err(err) => return (StatusCode::INTERNAL_SERVER_ERROR, err).into_response(),
    };

    let proto_units: Vec<PbUnitType> = raw_units
        .into_iter()
        .filter_map(|val| {
            let type_str = val.get("type")?.as_str()?.to_ascii_uppercase();
            let key = UnitTypeKey::from_str_name(&type_str)? as i32;
            Some(PbUnitType {
                r#type: key,
                name: val.get("name")?.as_str()?.to_string(),
                description: val.get("description")?.as_str()?.to_string(),
                icon: val.get("icon")?.as_str()?.to_string(),
                health: val.get("health")?.as_u64()? as u32,
                accuracy: val.get("accuracy")?.as_f64()? as f32,
                sight_range: val.get("sight_range")?.as_f64()? as f32,
                movement_speed: val.get("movement_speed")?.as_f64()? as f32,
            })
        })
        .collect();

    let unit_list = PbUnitTypeList {
        unit_types: proto_units,
    };

    let mut buffer = Vec::new();
    if unit_list.encode(&mut buffer).is_err() {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Protobuf encoding failed",
        )
            .into_response();
    }

    let mut headers = HeaderMap::new();
    headers.insert("Content-Type", "application/protobuf".parse().unwrap());
    (headers, buffer).into_response()
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

pub async fn list_area_types_protobuf() -> impl IntoResponse {
    let config_file = FsPath::new("../shared/configs/areas-config.json");

    let raw_areas: Vec<RawArea> = match load_configs_from_file(config_file) {
        Ok(data) => data,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    };

    let proto_areas: Vec<PbArea> = raw_areas
        .into_iter()
        .map(|a| PbArea {
            name: a.name,
            description: a.description,
            color: a.color,
            movement_speed_modifier: a.movement_speed_modifier,
            accuracy_modifier: a.accuracy_modifier,
            enemy_miss_chance: a.enemy_miss_chance,
        })
        .collect();

    let area_list = PbAreaList { areas: proto_areas };

    let mut buffer = Vec::new();
    if area_list.encode(&mut buffer).is_err() {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Protobuf encoding failed",
        )
            .into_response();
    }

    let mut headers = HeaderMap::new();
    headers.insert("Content-Type", "application/protobuf".parse().unwrap());
    (headers, buffer).into_response()
}

pub async fn receive_scenario_protobuf(
    State(state): State<AppState>,
    body: Bytes,
) -> impl IntoResponse {
    match Scenario::decode(body) {
        Ok(scenario) => {
            info!("Received scenario: {}", scenario.name);
            match to_bson(&scenario) {
                Ok(bson) => {
                    let doc = bson.as_document().unwrap().clone();
                    let collection = state.db.collection("scenarios");

                    match collection.insert_one(doc).await {
                        Ok(result) => {
                            info!("Scenario saved with id: {}", result.inserted_id);
                            (StatusCode::OK, "Scenario saved").into_response()
                        }
                        Err(e) => {
                            error!("Failed to insert scenario: {}", e);
                            (
                                StatusCode::INTERNAL_SERVER_ERROR,
                                format!("Failed to save scenario: {}", e),
                            )
                                .into_response()
                        }
                    }
                }
                Err(e) => {
                    error!("Failed to convert scenario to BSON: {}", e);
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        format!("Serialization error: {}", e),
                    )
                        .into_response()
                }
            }
        }
        Err(e) => {
            error!("Failed to decode scenario: {}", e);
            (
                StatusCode::BAD_REQUEST,
                format!("Invalid Protobuf data: {}", e),
            )
                .into_response()
        }
    }
}

pub async fn get_scenario_by_id_protobuf(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let obj_id = match ObjectId::parse_str(&id) {
        Ok(id) => id,
        Err(_) => {
            return (StatusCode::BAD_REQUEST, format!("Invalid ObjectId: {}", id)).into_response();
        }
    };

    let collection = state.db.collection::<Document>("scenarios");

    match collection.find_one(doc! { "_id": obj_id }).await {
        Ok(Some(doc)) => match bson::from_document::<Scenario>(doc) {
            Ok(scenario) => {
                let mut buffer = Vec::new();
                if scenario.encode(&mut buffer).is_err() {
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "Protobuf encoding failed".to_string(),
                    )
                        .into_response();
                }

                let mut headers = HeaderMap::new();
                headers.insert("Content-Type", "application/protobuf".parse().unwrap());
                (headers, buffer).into_response()
            }
            Err(e) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to decode BSON into Scenario: {}", e),
            )
                .into_response(),
        },
        Ok(None) => (
            StatusCode::NOT_FOUND,
            format!("Scenario not found with ID {}", id),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Database error: {}", e),
        )
            .into_response(),
    }
}

pub async fn list_scenario_summaries_protobuf(
    State(state): State<AppState>
) -> impl IntoResponse {
    let collection = state.db.collection::<Document>("scenarios");

    let cursor = match collection.find(doc! {}).await {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to query scenarios: {}", e),
            )
                .into_response();
        }
    };

    let mut summaries = Vec::new();

    use futures::StreamExt;
    let mut cursor = cursor;
    while let Some(doc_result) = cursor.next().await {
        match doc_result {
            Ok(doc) => {
                let id = doc
                    .get_object_id("_id")
                    .map(|oid| oid.to_hex())
                    .unwrap_or_default();

                let name = doc
                    .get_str("NAME")
                    .or_else(|_| doc.get_str("name"))
                    .unwrap_or("Unnamed")
                    .to_string();

                summaries.push(ScenarioSummary { id, name });
            }
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Cursor error: {}", e),
                )
                    .into_response();
            }
        }
    }

    let list = ScenarioList {
        scenarios: summaries,
    };

    let mut buffer = Vec::new();
    if list.encode(&mut buffer).is_err() {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Protobuf encoding failed".to_string(),
        )
            .into_response();
    }

    let mut headers = HeaderMap::new();
    headers.insert("Content-Type", "application/protobuf".parse().unwrap());
    (headers, buffer).into_response()
}

// Session creation
async fn start_session(State(state): State<AppState>, body: Bytes) -> impl IntoResponse {
    info!("📨 Received POST /api/session/start ({} bytes)", body.len());

    let request = match StartSessionRequest::decode(&*body) {
        Ok(r) => {
            info!("✅ Decoded StartSessionRequest: user_id={}, scenario_id={}", r.user_id, r.scenario_id);
            r
        },
        Err(e) => {
            warn!("❌ Failed to decode StartSessionRequest: {}", e);
            return (StatusCode::BAD_REQUEST, format!("Protobuf decode error: {}", e)).into_response();
        }
    };

    let session_id = Uuid::new_v4().to_string();
    let key = format!("session:{}", session_id);
    info!("🆕 Creating session with ID: {}", session_id);

    let mut redis = state.redis.lock().await;

    match redis.hset_multiple(&key, &[
        ("scenario_id", request.scenario_id.as_str()),
        ("state", "idle"),
        ("player1", request.user_id.as_str()),
    ]) {
        Ok(_) => info!("✅ Stored session metadata in Redis"),
        Err(e) => {
            error!("❌ Redis hset_multiple failed: {}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, "Redis error").into_response();
        }
    }

    match redis.sadd::<_, _>(format!("session_users:{}", session_id), &request.user_id) {
        Ok(_) => info!("👤 Added player1 '{}' to session user set", request.user_id),
        Err(e) => warn!("⚠️ Redis sadd failed: {}", e),
    }

    let response = StartSessionResponse { session_id: session_id.clone() };
    let mut buf = Vec::new();
    if response.encode(&mut buf).is_err() {
        error!("❌ Failed to encode StartSessionResponse");
        return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to encode protobuf").into_response();
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

    let state_value = redis.hget::<_, Option<String>>(&key, Some("state".to_string())).unwrap_or(None);
    info!("🔍 Fetched session state: {:?}", state_value);

    if state_value.as_deref() != Some("idle") {
        warn!("🚫 Session '{}' already in progress or invalid state", request.session_id);
        return (StatusCode::CONFLICT, "Session already in progress").into_response();
    }

    let player1_opt = redis.hget::<_, Option<String>>(&key, Some("player1".to_string())).unwrap_or(None);
    info!("👤 Fetched player1 for session '{}': {:?}", request.session_id, player1_opt);

    match redis.hset_multiple(&key, &[
        ("player2", request.user_id.as_str()),
        ("state", "progressing"),
    ]) {
        Ok(_) => info!("✅ Set player2 and updated session state to 'progressing'"),
        Err(e) => warn!("⚠️ Failed to update session state/player2: {}", e),
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
            match message.encode(&mut buf) {
                Ok(_) => {
                    let _ = tx.send(Message::Binary(Bytes::from(buf)));
                    info!("📢 Sent SessionReadyEvent to player1 '{}'", player1_id);
                },
                Err(e) => error!("❌ Failed to encode SessionReadyEvent: {}", e),
            }
        } else {
            warn!("⚠️ No socket found for player1 '{}'", player1_id);
        }
    }

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
    let keys: Vec<String> = redis.keys("session_users:*").unwrap_or_default();

    for key in keys {
        if redis.sismember(&key, &user_id).unwrap_or(false) {
            info!("Removing user {} from set {}", user_id, key);
            let _ = redis.srem::<_, _>(&key, &user_id);

            if redis.scard::<_>(&key).unwrap_or(1) == 0 {
                let session_id = key.strip_prefix("session_users:").unwrap_or("");
                info!("Session {} is empty. Cleaning up.", session_id);
                let _ = redis.del::<_>(format!("session:{}", session_id));
                let _ = redis.del::<_>(&key);
            }
        }
    }

    info!("User {} disconnected", user_id);
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