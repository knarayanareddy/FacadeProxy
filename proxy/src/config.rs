use serde::Deserialize;
use std::fs;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Default, Deserialize)]
pub struct Config {
    #[serde(default)]
    pub proxy: ProxyConfig,
    #[serde(default)]
    pub persona_defaults: PersonaDefaults,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ProxyConfig {
    #[serde(default = "default_bind_address")]
    pub bind_address: String,
    #[serde(default = "default_port")]
    pub port: u16,
    #[serde(default = "default_request_timeout_ms")]
    pub request_timeout_ms: u64,
    #[serde(default = "default_max_connections")]
    pub max_connections: usize,
    #[serde(default = "default_log_level")]
    pub log_level: String,
    /// Optional shared secret required on /persona mutations. Set through
    /// config.toml, --auth-token, or FACADEPROXY_AUTH_TOKEN in production.
    #[serde(default)]
    pub auth_token: Option<String>,
}

impl Default for ProxyConfig {
    fn default() -> Self {
        Self {
            bind_address: default_bind_address(),
            port: default_port(),
            request_timeout_ms: default_request_timeout_ms(),
            max_connections: default_max_connections(),
            log_level: default_log_level(),
            auth_token: None,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct PersonaDefaults {
    #[serde(default = "default_true")]
    pub passthrough_on_failure: bool,
    #[serde(default)]
    pub coherence_strict: bool,
}

impl Default for PersonaDefaults {
    fn default() -> Self {
        Self {
            passthrough_on_failure: true,
            coherence_strict: false,
        }
    }
}

fn default_bind_address() -> String {
    "127.0.0.1".to_string()
}

fn default_port() -> u16 {
    7878
}

fn default_request_timeout_ms() -> u64 {
    5_000
}

fn default_max_connections() -> usize {
    100
}

fn default_log_level() -> String {
    "warn".to_string()
}

fn default_true() -> bool {
    true
}

impl Config {
    pub fn load(path: Option<&Path>) -> anyhow::Result<Self> {
        let Some(path) = path else {
            return Ok(Self::default());
        };

        if !path.exists() {
            return Ok(Self::default());
        }

        let contents = fs::read_to_string(path)?;
        let cfg: Config = toml::from_str(&contents)?;
        Ok(cfg)
    }

    pub fn socket_addr(&self) -> anyhow::Result<SocketAddr> {
        let ip: IpAddr = self.proxy.bind_address.parse()?;
        if !is_loopback_ip(ip) {
            anyhow::bail!(
                "FacadeProxy refuses to bind to non-loopback address {}",
                self.proxy.bind_address
            );
        }
        Ok(SocketAddr::new(ip, self.proxy.port))
    }
}

pub fn default_config_path() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("APPDATA")
            .map(|base| PathBuf::from(base).join("FacadeProxy").join("config.toml"))
    }

    #[cfg(not(target_os = "windows"))]
    {
        std::env::var_os("HOME")
            .map(|home| PathBuf::from(home).join(".facadeproxy").join("config.toml"))
    }
}

pub fn default_personas_path() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("APPDATA").map(|base| {
            PathBuf::from(base)
                .join("FacadeProxy")
                .join("personas.toml")
        })
    }

    #[cfg(not(target_os = "windows"))]
    {
        std::env::var_os("HOME").map(|home| {
            PathBuf::from(home)
                .join(".facadeproxy")
                .join("personas.toml")
        })
    }
}

pub fn is_loopback_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => v4 == Ipv4Addr::LOCALHOST,
        IpAddr::V6(v6) => v6.is_loopback(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_non_loopback() {
        let mut cfg = Config::default();
        cfg.proxy.bind_address = "0.0.0.0".to_string();
        assert!(cfg.socket_addr().is_err());
    }

    #[test]
    fn accepts_localhost() {
        let cfg = Config::default();
        assert_eq!(cfg.socket_addr().unwrap().to_string(), "127.0.0.1:7878");
    }
}
