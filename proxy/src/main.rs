use clap::Parser;
use facadeproxy::config::{default_config_path, default_personas_path, Config};
use facadeproxy::logging::{default_debug_log_path, RotatingMakeWriter};
use facadeproxy::persona::{load_personas, validate_persona, Persona};
use facadeproxy::proxy::{run, AppState};
use std::path::PathBuf;
use tracing::{info, warn};
use tracing_subscriber::EnvFilter;

#[derive(Debug, Parser)]
#[command(name = "facadeproxy")]
#[command(about = "Localhost persona-aware HTTP proxy for FacadeProxy", long_about = None)]
struct Cli {
    /// Path to config.toml. Defaults to ~/.facadeproxy/config.toml when it exists.
    #[arg(long)]
    config: Option<PathBuf>,

    /// Path to personas TOML file.
    #[arg(long)]
    personas: Option<PathBuf>,

    /// Initial active persona id loaded from --personas. The extension can change this via POST /persona.
    #[arg(long)]
    persona: Option<String>,

    /// Override bind address. Must be loopback.
    #[arg(long)]
    bind: Option<String>,

    /// Override listen port.
    #[arg(long)]
    port: Option<u16>,

    /// Shared secret required for /persona POST/DELETE. Can also be set with FACADEPROXY_AUTH_TOKEN.
    #[arg(long, env = "FACADEPROXY_AUTH_TOKEN")]
    auth_token: Option<String>,

    /// Enable debug-level structured logging and in-memory recent request metrics.
    #[arg(long)]
    debug: bool,

    /// Write debug logs to a rotating local file. Defaults to ~/.facadeproxy/debug.log when --debug is set.
    #[arg(long)]
    log_file: Option<PathBuf>,

    /// Treat warning-level coherence rule failures as hard errors.
    #[arg(long)]
    strict: bool,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();

    let config_path = cli.config.clone().or_else(default_config_path);
    let mut config = Config::load(config_path.as_deref())?;

    if let Some(bind) = cli.bind {
        config.proxy.bind_address = bind;
    }
    if let Some(port) = cli.port {
        config.proxy.port = port;
    }
    if let Some(auth_token) = cli.auth_token {
        config.proxy.auth_token = Some(auth_token);
    }
    if cli.debug {
        config.proxy.log_level = "debug".to_string();
    }
    if cli.strict {
        config.persona_defaults.coherence_strict = true;
    }

    let log_file = cli
        .log_file
        .clone()
        .or_else(|| cli.debug.then(default_debug_log_path).flatten());
    init_logging(&config.proxy.log_level, cli.debug, log_file)?;

    let personas_path = cli.personas.clone().or_else(default_personas_path);
    let initial_persona = load_initial_persona(
        personas_path.clone(),
        cli.persona,
        config.persona_defaults.coherence_strict,
    )?;

    if config.proxy.auth_token.as_deref().unwrap_or("").is_empty() {
        warn!("/persona control API authentication is disabled; this is acceptable for local development only");
    }

    let addr = config.socket_addr()?;
    let state = AppState::new(config, initial_persona, cli.debug, personas_path);
    run(addr, state).await
}

fn init_logging(level: &str, debug: bool, log_file: Option<PathBuf>) -> anyhow::Result<()> {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new(level));
    match (debug, log_file) {
        (true, Some(path)) => {
            let writer = RotatingMakeWriter::new(path)?;
            tracing_subscriber::fmt()
                .with_env_filter(filter)
                .json()
                .with_writer(writer)
                .try_init()
                .map_err(|err| anyhow::anyhow!(err.to_string()))?;
        }
        (true, None) => {
            tracing_subscriber::fmt()
                .with_env_filter(filter)
                .json()
                .try_init()
                .map_err(|err| anyhow::anyhow!(err.to_string()))?;
        }
        (false, _) => {
            tracing_subscriber::fmt()
                .with_env_filter(filter)
                .compact()
                .try_init()
                .map_err(|err| anyhow::anyhow!(err.to_string()))?;
        }
    }
    Ok(())
}

fn load_initial_persona(
    personas_path: Option<PathBuf>,
    persona_id: Option<String>,
    strict: bool,
) -> anyhow::Result<Option<Persona>> {
    let Some(persona_id) = persona_id else {
        return Ok(None);
    };

    let Some(path) = personas_path else {
        anyhow::bail!("--persona was provided but no personas TOML path was found");
    };

    if !path.exists() {
        anyhow::bail!("personas file does not exist: {}", path.display());
    }

    let personas = load_personas(&path)?;
    let persona = personas.get(&persona_id).cloned().ok_or_else(|| {
        anyhow::anyhow!("persona '{}' not found in {}", persona_id, path.display())
    })?;

    let validation = validate_persona(&persona, strict);
    if !validation.valid {
        anyhow::bail!(
            "persona '{}' failed validation: {:?}",
            persona_id,
            validation.errors
        );
    }

    if !validation.warnings.is_empty() {
        warn!(persona = %persona_id, warnings = ?validation.warnings, "persona loaded with coherence warnings");
    }
    info!(persona = %persona_id, "loaded initial persona");
    Ok(Some(persona))
}
