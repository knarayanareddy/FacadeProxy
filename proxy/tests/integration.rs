use facadeproxy::config::Config;
use facadeproxy::persona::{load_personas, validate_persona};
use std::path::PathBuf;

#[test]
fn default_personas_load_and_validate() {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let path = manifest_dir.join("../personas/defaults/personas.toml");
    let personas = load_personas(&path).expect("default personas should parse");
    assert!(personas.contains_key("nl_chrome_linux"));
    for persona in personas.values() {
        let result = validate_persona(persona, false);
        assert!(result.valid, "{} failed: {:?}", persona.id, result);
    }
}

#[test]
fn default_config_binds_localhost() {
    let cfg = Config::default();
    assert_eq!(cfg.socket_addr().unwrap().ip().to_string(), "127.0.0.1");
}
