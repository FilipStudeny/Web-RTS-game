mod models;

use axum::{
    extract::ConnectInfo,
    extract::ws::{Message, WebSocket, WebSocketUpgrade, Utf8Bytes},
    http::{HeaderMap, StatusCode, Method},
    response::IntoResponse,
    routing::get,
    Router,
};
use models::{
    proto::{
        UnitType as PbUnitType,
        UnitTypeList as PbUnitTypeList,
        Area as PbArea,
        AreaList as PbAreaList,
        UnitTypeKey,
    },
};
use prost::Message as ProstMessage;
use std::{fs, net::SocketAddr, path::Path};
use axum::body::Bytes;
use axum::routing::post;
use tokio::net::TcpListener;
use tracing_subscriber::fmt::init;
use uuid::Uuid;
use tower_http::cors::{Any, CorsLayer};
use serde::de::DeserializeOwned;
use crate::models::proto::Scenario;

#[tokio::main]
async fn main() {
    init();

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET])
        .allow_headers(Any);

    let app = Router::new()
        .route("/ws", get(ws_handler))
        .route("/api/unit-types.pb", get(list_unit_types_protobuf))
        .route("/api/area-types.pb", get(list_area_types_protobuf))
        .route("/api/scenario.pb", post(receive_scenario_protobuf))
        .layer(cors);

    let listener = TcpListener::bind("0.0.0.0:9999").await.unwrap();
    println!("Server running at:");
    println!("- WebSocket: ws://localhost:9999/ws");
    println!("- REST API (protobuf): http://localhost:9999/api/unit-types.pb");
    println!("- REST API (protobuf): http://localhost:9999/api/area-types.pb");

    axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>())
        .await
        .unwrap();
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
) -> impl IntoResponse {
    println!("Client connected: {}", addr.ip());
    ws.on_upgrade(move |socket| handle_socket(socket, addr))
}

async fn handle_socket(mut socket: WebSocket, addr: SocketAddr) {
    let user_id = Uuid::new_v4();

    if socket
        .send(Message::Text(Utf8Bytes::from(user_id.to_string())))
        .await
        .is_err()
    {
        println!("Failed to send welcome message to {}", addr);
        return;
    }

    println!("Assigned ID: {} to connected user at address: {}", user_id, addr.ip());

    while let Some(Ok(msg)) = socket.recv().await {
        match msg {
            Message::Text(text) => println!("Received from {}: {}", user_id, text),
            Message::Close(_) => {
                println!("{} disconnected", user_id);
                break;
            }
            _ => {}
        }
    }
}

// Load Vec<T> from a JSON array in a file
pub fn load_configs_from_file<T: DeserializeOwned>(path: &Path) -> Result<Vec<T>, String> {
    let content = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read file {:?}: {}", path, e))?;
    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse JSON in {:?}: {}", path, e))
}

// Load Vec<T> from all .json files in a directory
pub fn load_configs_from_dir<T: DeserializeOwned>(dir: &Path) -> Result<Vec<T>, String> {
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
    let config_file = Path::new("../shared/configs/units-config.json");

    let mut raw_units: Vec<serde_json::Value> = match load_configs_from_file(config_file) {
        Ok(units) => units,
        Err(err) => return (StatusCode::INTERNAL_SERVER_ERROR, err).into_response(),
    };

    let proto_units: Vec<PbUnitType> = raw_units
        .drain(..)
        .filter_map(|mut val| {
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
        return (StatusCode::INTERNAL_SERVER_ERROR, "Protobuf encoding failed").into_response();
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
    let config_file = Path::new("../shared/configs/areas-config.json");

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

    let area_list = PbAreaList {
        areas: proto_areas,
    };

    let mut buffer = Vec::new();
    if area_list.encode(&mut buffer).is_err() {
        return (StatusCode::INTERNAL_SERVER_ERROR, "Protobuf encoding failed").into_response();
    }

    let mut headers = HeaderMap::new();
    headers.insert("Content-Type", "application/protobuf".parse().unwrap());

    (headers, buffer).into_response()
}
pub async fn receive_scenario_protobuf(body: Bytes) -> impl IntoResponse {
    match Scenario::decode(body) {
        Ok(scenario) => {
            println!("Received scenario:");
            println!("Name: {}", scenario.name);
            println!("Units: {:#?}", scenario.units);
            println!("Objectives: {:#?}", scenario.objectives);
            println!("Areas: {:#?}", scenario.areas);
            
            (StatusCode::OK, "Scenario received").into_response()
        }
        Err(e) => {
            eprintln!("Failed to decode scenario: {}", e);
            (
                StatusCode::BAD_REQUEST,
                format!("Invalid Protobuf data: {}", e),
            )
                .into_response()
        }
    }
}
