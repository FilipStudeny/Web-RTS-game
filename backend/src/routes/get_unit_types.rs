use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use crate::load_configs_from_file;
use crate::models::proto::UnitTypeKey;
use std::{path::Path};
use prost::Message;

pub async fn get_unit_types() -> impl IntoResponse {
    let config_file = Path::new("../shared/configs/units-config.json");

    let raw_units: Vec<serde_json::Value> = match load_configs_from_file(config_file) {
        Ok(units) => units,
        Err(err) => return (StatusCode::INTERNAL_SERVER_ERROR, err).into_response(),
    };

    let proto_units: Vec<crate::models::proto::UnitType> = raw_units
        .into_iter()
        .filter_map(|val| {
            let type_str = val.get("type")?.as_str()?.to_ascii_uppercase();
            let key = UnitTypeKey::from_str_name(&type_str)? as i32;
            Some(crate::models::proto::UnitType {
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

    let unit_list = crate::models::proto::UnitTypeList {
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