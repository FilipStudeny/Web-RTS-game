use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use mongodb::bson::{doc, Document};
use mongodb::{bson, Database};
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

pub fn interpolate(start: f64, end: f64, t: f64) -> f64 {
    start + (end - start) * t
}

pub fn haversine_distance(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    let to_rad = |deg: f64| deg.to_radians();
    let r = 6371.0; // Earth radius in km

    let dlat = to_rad(lat2 - lat1);
    let dlon = to_rad(lon2 - lon1);
    let a = (dlat / 2.0).sin().powi(2)
        + lat1.to_radians().cos()
        * lat2.to_radians().cos()
        * (dlon / 2.0).sin().powi(2);
    let c = 2.0 * a.sqrt().atan2((1.0 - a).sqrt());
    r * c
}

pub async fn get_unit_position_from_mongo(
    db: &Database,
    unit_id: &str,
) -> Option<(f64, f64)> {
    let scenario_doc = db
        .collection::<Document>("scenarios")
        .find_one(doc! { "UNITS.ID": unit_id })
        .await
        .ok()
        .flatten()?;

    let units = scenario_doc.get_array("UNITS").ok()?;

    for unit in units {
        if let bson::Bson::Document(unit_doc) = unit {
            if unit_doc.get_str("ID").ok()? == unit_id {
                let pos = unit_doc.get_document("POSITION").ok()?;
                let lat = pos.get_f64("LAT").ok()?;
                let lon = pos.get_f64("LON").ok()?;
                return Some((lat, lon));
            }
        }
    }

    None
}
