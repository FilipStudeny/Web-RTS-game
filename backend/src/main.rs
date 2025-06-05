use axum::{
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    extract::ConnectInfo,
    response::IntoResponse,
    routing::get,
    Router,
};
use std::{net::SocketAddr};
use axum::extract::ws::Utf8Bytes;
use tokio::net::TcpListener;
use uuid::Uuid;
use tracing_subscriber::fmt::init;

#[tokio::main]
async fn main() {
    init(); // Start logging

    let app = Router::new().route("/ws", get(ws_handler));

    let listener = TcpListener::bind("0.0.0.0:9999").await.unwrap();
    println!("WebSocket server running on ws://localhost:9999/ws");

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
    let user_id = Uuid::new_v4().to_string();

    // Send the user ID on connect
    if socket.send(Message::Text(Utf8Bytes::from(user_id.clone()))).await.is_err() {
        println!("Failed to send ID");
        return;
    }

    println!("Assigned ID: {0} to connected user at address: {1}", user_id, addr.ip());

    // Keep the socket alive (optional, handle pings/messages/etc.)
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
