use prost_build::Config;
use std::{fs, path::PathBuf};

fn main() {
    let proto_dir = "../shared/proto";

    // Collect all `.proto` files in the directory
    let protos: Vec<PathBuf> = fs::read_dir(proto_dir)
        .expect("Failed to read proto directory")
        .filter_map(|entry| {
            let path = entry.ok()?.path();
            if path.extension()? == "proto" {
                Some(path)
            } else {
                None
            }
        })
        .collect();

    let mut config = Config::new();

    // Add #[derive(Deserialize, Serialize)] to all messages/enums
    config.type_attribute(".", "#[derive(serde::Serialize, serde::Deserialize)]");

    // enable serde for enums
    config
        .type_attribute(".", "#[serde(rename_all = \"SCREAMING_SNAKE_CASE\")]");

    // Compile with serde support
    config.compile_protos(&protos, &[proto_dir])
        .expect("Failed to compile proto files");
}
