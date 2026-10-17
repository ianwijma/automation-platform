fn main() {
    println!(
        "cargo:rustc-env=AP_TARGET={}",
        std::env::var("TARGET").unwrap()
    );
    tauri_build::build()
}
