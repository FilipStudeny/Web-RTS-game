use axum::body::Bytes;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use mongodb::bson::to_bson;
use tracing::{error, info};
use uuid::Uuid;

use crate::AppState;
use prost::Message;
use crate::models::proto::{CreateScenarioRequest, CreateScenarioResponse};

pub async fn create_scenario(
    State(state): State<AppState>,
    body: Bytes,
) -> impl IntoResponse {
    let req = match CreateScenarioRequest::decode(&*body) {
        Ok(req) => req,
        Err(e) => {
            error!("❌ Failed to decode CreateScenarioRequest: {}", e);
            return (
                StatusCode::BAD_REQUEST,
                format!("Invalid Protobuf: {}", e),
            )
                .into_response();
        }
    };

    let mut scenario = match req.scenario {
        Some(s) => s,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                "Missing scenario in request".to_string(),
            )
                .into_response();
        }
    };

    // 🔑 Assign unique IDs
    for o in &mut scenario.objectives {
        o.id = Option::from(Uuid::new_v4().to_string());
    }
    for u in &mut scenario.units {
        u.id = Option::from(Uuid::new_v4().to_string());
    }
    for a in &mut scenario.areas {
        a.id = Option::from(Uuid::new_v4().to_string());
    }

    // 🧱 Serialize to BSON
    let bson = match to_bson(&scenario) {
        Ok(bson) => bson,
        Err(e) => {
            error!("❌ BSON serialization error: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Serialization error: {}", e),
            )
                .into_response();
        }
    };

    let doc = match bson.as_document() {
        Some(d) => d.clone(),
        None => {
            error!("❌ BSON was not a document");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Invalid BSON structure".to_string(),
            )
                .into_response();
        }
    };

    // 📦 Insert into MongoDB
    let collection = state.db.collection("scenarios");
    match collection.insert_one(doc).await {
        Ok(result) => {
            let scenario_id = result
                .inserted_id
                .as_object_id()
                .map(|oid| oid.to_hex())
                .unwrap_or_default();

            let response = CreateScenarioResponse { scenario_id };
            let mut buf = Vec::new();
            if response.encode(&mut buf).is_err() {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Failed to encode response".to_string(),
                )
                    .into_response();
            }

            let mut headers = HeaderMap::new();
            headers.insert("Content-Type", "application/protobuf".parse().unwrap());
            (headers, buf).into_response()
        }
        Err(e) => {
            error!("❌ MongoDB insert error: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Database error: {}", e),
            )
                .into_response()
        }
    }
}
