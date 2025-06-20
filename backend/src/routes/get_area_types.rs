use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use std::{path::Path};
use prost::Message;
use crate::{load_configs_from_file, RawArea};

pub async fn list_area_types_protobuf() -> impl IntoResponse {
    let config_file = Path::new("../shared/configs/areas-config.json");

    let raw_areas: Vec<RawArea> = match load_configs_from_file(config_file) {
        Ok(data) => data,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    };

    let proto_areas: Vec<crate::models::proto::Area> = raw_areas
        .into_iter()
        .map(|a| crate::models::proto::Area {
            name: a.name,
            description: a.description,
            color: a.color,
            movement_speed_modifier: a.movement_speed_modifier,
            accuracy_modifier: a.accuracy_modifier,
            enemy_miss_chance: a.enemy_miss_chance,
        })
        .collect();

    let area_list = crate::models::proto::AreaList { areas: proto_areas };

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
