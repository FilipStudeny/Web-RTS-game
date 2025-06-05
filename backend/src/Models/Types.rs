use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Unit {
    pub id: Uuid,
    pub name: String,
    pub health: u32,
    pub accuracy: f32,
    pub sight_range: f32,
    pub movement_speed: f32,
    pub position: (f64, f64),
    pub unit_type: String,
    pub side: UnitSide,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum UnitSide {
    Friendly,
    Enemy,
}
