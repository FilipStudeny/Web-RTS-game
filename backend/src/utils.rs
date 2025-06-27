use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use prost::Message;

pub fn protobuf_response<T: Message>(message: &T) -> Result<impl IntoResponse, (StatusCode, String)> {
    let mut buffer = Vec::new();
    message.encode(&mut buffer).map_err(|_| {
        (StatusCode::INTERNAL_SERVER_ERROR, "Protobuf encoding failed".to_string())
    })?;

    let mut headers = HeaderMap::new();
    headers.insert("Content-Type", "application/protobuf".parse().unwrap());
    Ok((headers, buffer))
}
