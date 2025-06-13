use prost_build::compile_protos;
use std::fs;
use std::path::PathBuf;

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

    compile_protos(&protos, &[proto_dir])
        .expect("Failed to compile proto files");
}
