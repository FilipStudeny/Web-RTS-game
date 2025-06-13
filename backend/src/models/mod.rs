use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub mod proto {
    include!(concat!(env!("OUT_DIR"), "/models.rs"));
    include!(concat!(env!("OUT_DIR"), "/area_models.rs"));
}
#[derive(serde::Deserialize)]
pub struct RawUnitType {
    #[serde(rename = "type")]
    pub type_: String,
    pub name: String,
    pub description: String,
    pub icon: String,
    pub health: u32,
    pub accuracy: f32,
    #[serde(rename = "sightRange")]
    pub sight_range: f32,
    #[serde(rename = "movementSpeed")]
    pub movement_speed: f32,
}

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

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(tag = "type", content = "payload")]
pub enum SocketMessageType {
    Welcome,
    Ping,
    ChatMessage,
    UnitUpdate,
    GameCommand,
    UnitListRequest,
    UnitListResponse,
    Disconnect,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct SocketMessage {
    pub msg_type: SocketMessageType,
    pub payload: serde_json::Value,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct UnitType {
    pub id: u8,
    pub name: String,
    pub description: String,
}
