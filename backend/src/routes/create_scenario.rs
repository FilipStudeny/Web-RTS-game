use axum::body::Bytes;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use mongodb::bson::to_bson;
use prost::Message;
use tracing::{error, info};
use crate::AppState;
use crate::models::proto::Scenario;

pub async fn create_scenario(
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
