mod models;

use axum::{
    extract::ConnectInfo,
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use models::proto::{UnitType as PbUnitType, UnitTypeList as PbUnitTypeList};
use prost::Message as ProstMessage;
use serde::Deserialize;
use std::{fs, net::SocketAddr, path::Path};
use tokio::net::TcpListener;
use tracing_subscriber::fmt::init;
use uuid::Uuid;

use axum::extract::ws::Utf8Bytes;

use tower_http::cors::{Any, CorsLayer};
use axum::http::Method;

#[tokio::main]
async fn main() {
    init();

    let cors = CorsLayer::new()
        .allow_origin(Any) // ← nebo upřesni na konkrétní původ, např. "http://localhost:5173"
        .allow_methods([Method::GET])
        .allow_headers(Any);

    let app = Router::new()
        .route("/ws", get(ws_handler))
        .route("/api/unit-types.pb", get(list_unit_types_protobuf))
        .layer(cors);

    let listener = TcpListener::bind("0.0.0.0:9999").await.unwrap();
    println!("Server running at:");
    println!("- WebSocket: ws://localhost:9999/ws");
    println!("- REST API (protobuf): http://localhost:9999/api/unit-types.pb");

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

    println!(
        "Assigned ID: {} to connected user at address: {}",
        user_id,
        addr.ip()
    );

    while let Some(Ok(msg)) = socket.recv().await {
        match msg {
            Message::Text(text) => {
                println!("Received from {}: {}", user_id, text);
            }
            Message::Close(_) => {
                println!("{} disconnected", user_id);
                break;
            }
            _ => {}
        }
    }
}

#[derive(Deserialize)]
struct RawUnitType {
    #[serde(rename = "type")]
    type_: String,
    name: String,
    description: String,
    icon: String,
    health: u32,
    accuracy: f32,
    #[serde(rename = "sightRange")]
    sight_range: f32,
    #[serde(rename = "movementSpeed")]
    movement_speed: f32,
}

async fn list_unit_types_protobuf() -> impl IntoResponse {
    println!("Current directory: {:?}", std::env::current_dir());
    let json_path = Path::new("../shared/units-config.json");

    let json_data = match fs::read_to_string(json_path) {
        Ok(data) => data,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Could not read unit_types.json").into_response(),
    };

    let raw_units: Vec<RawUnitType> = match serde_json::from_str(&json_data) {
        Ok(units) => units,
        Err(_) => return (StatusCode::BAD_REQUEST, "Invalid JSON format").into_response(),
    };

    let proto_units: Vec<PbUnitType> = raw_units
        .into_iter()
        .map(|u| PbUnitType {
            r#type: u.type_,
            name: u.name,
            description: u.description,
            icon: u.icon,
            health: u.health,
            accuracy: u.accuracy,
            sight_range: u.sight_range,
            movement_speed: u.movement_speed,
        })
        .collect();

    let unit_list = PbUnitTypeList {
        unit_types: proto_units,
    };

    let mut buffer = Vec::new();
    if ProstMessage::encode(&unit_list, &mut buffer).is_err() {
        return (StatusCode::INTERNAL_SERVER_ERROR, "Protobuf encoding failed").into_response();
    }

    let mut headers = HeaderMap::new();
    headers.insert("Content-Type", "application/protobuf".parse().unwrap());

    (headers, buffer).into_response()
}
