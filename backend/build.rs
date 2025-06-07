use prost_build::compile_protos;

fn main() {
    compile_protos(
        &["../shared/unit_types.proto"],
        &["../shared"],
    ).expect("Failed to compile proto files");
}
