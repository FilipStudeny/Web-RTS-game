use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use mongodb::bson;
use mongodb::bson::{doc, Document};
use mongodb::bson::oid::ObjectId;
use prost::Message;
use crate::AppState;
use crate::models::proto::Scenario;

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
