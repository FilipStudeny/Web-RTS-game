use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use mongodb::bson::{doc, Document};
use prost::Message;
use crate::AppState;
use crate::models::proto::{ScenarioList, ScenarioSummary};

pub async fn get_scenarios(
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

                summaries.push(ScenarioSummary { scenario_id: id, name });
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
