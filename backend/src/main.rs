mod models;

use std::{fs, net::SocketAddr, path::Path as FsPath, sync::Arc};

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

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_target(false)
        .compact()
        .init();

    let db_client = Client::with_uri_str("mongodb://localhost:27017")
        .await
        .expect("Failed to connect to MongoDB");
    let db = Arc::new(db_client.database("simulation"));

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
        .with_state(db.clone())
        .layer(cors);

    let listener = TcpListener::bind("0.0.0.0:9999").await.unwrap();
    info!("Server running at:");
    info!("- WebSocket: ws://localhost:9999/ws");
    info!("- REST API: http://localhost:9999/api/scenario.pb");

    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await
    .unwrap();
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
) -> impl IntoResponse {
    info!("Client connected: {}", addr.ip());
    ws.on_upgrade(move |socket| handle_socket(socket, addr))
}

async fn handle_socket(mut socket: WebSocket, addr: SocketAddr) {
    let user_id = Uuid::new_v4();

    if socket
        .send(Message::Text(user_id.to_string().into()))
        .await
        .is_err()
    {
        error!("Failed to send welcome message to {}", addr);
        return;
    }

    info!(
        "Assigned ID: {} to connected user at address: {}",
        user_id,
        addr.ip()
    );

    while let Some(Ok(msg)) = socket.recv().await {
        match msg {
            Message::Text(text) => info!("Received from {}: {}", user_id, text),
            Message::Close(_) => {
                info!("{} disconnected", user_id);
                break;
            }
            _ => {}
        }
    }
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
    State(db): State<Arc<Database>>,
    body: Bytes,
) -> impl IntoResponse {
    match Scenario::decode(body) {
        Ok(scenario) => {
            info!("Received scenario: {}", scenario.name);
            match to_bson(&scenario) {
                Ok(bson) => {
                    let doc = bson.as_document().unwrap().clone();
                    let collection = db.collection("scenarios");

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
    State(db): State<Arc<Database>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let obj_id = match ObjectId::parse_str(&id) {
        Ok(id) => id,
        Err(_) => {
            return (StatusCode::BAD_REQUEST, format!("Invalid ObjectId: {}", id)).into_response();
        }
    };

    let collection = db.collection::<Document>("scenarios");

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
    State(db): State<Arc<Database>>,
) -> impl IntoResponse {
    let collection = db.collection::<Document>("scenarios");

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
