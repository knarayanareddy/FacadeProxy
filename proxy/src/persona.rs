use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Persona {
    pub id: String,
    pub display_name: String,
    pub user_agent: String,
    pub accept_lang: String,
    pub timezone: String,
    pub geo_region: String,
    pub screen_width: u32,
    pub screen_height: u32,
    pub color_depth: u8,
    pub platform: String,
    #[serde(default)]
    pub timezone_offset_minutes: Option<i32>,
    #[serde(default)]
    pub hardware_concurrency: Option<u8>,
    #[serde(default)]
    pub device_memory: Option<u8>,
    #[serde(default)]
    pub max_touch_points: Option<u8>,
    #[serde(default)]
    pub vendor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationResult {
    pub valid: bool,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}

impl ValidationResult {
    fn new() -> Self {
        Self {
            valid: true,
            errors: Vec::new(),
            warnings: Vec::new(),
        }
    }

    fn error(&mut self, msg: impl Into<String>) {
        self.valid = false;
        self.errors.push(msg.into());
    }

    fn warn_or_error(&mut self, strict: bool, msg: impl Into<String>) {
        let msg = msg.into();
        if strict {
            self.error(msg);
        } else {
            self.warnings.push(msg);
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersonaFile {
    pub persona: HashMap<String, Persona>,
}

pub fn load_personas(path: &Path) -> anyhow::Result<HashMap<String, Persona>> {
    let contents = fs::read_to_string(path)?;
    let file: PersonaFile = toml::from_str(&contents)?;
    Ok(file.persona)
}

pub fn save_personas(path: &Path, personas: &HashMap<String, Persona>) -> anyhow::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let file = PersonaFile {
        persona: personas.clone(),
    };
    let contents = toml::to_string_pretty(&file)?;
    fs::write(path, contents)?;
    restrict_file_permissions(path)?;
    Ok(())
}

#[cfg(unix)]
fn restrict_file_permissions(path: &Path) -> anyhow::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o600))?;
    Ok(())
}

#[cfg(not(unix))]
fn restrict_file_permissions(_path: &Path) -> anyhow::Result<()> {
    Ok(())
}

pub fn validate_persona(persona: &Persona, strict: bool) -> ValidationResult {
    let mut result = ValidationResult::new();

    validate_required(persona, &mut result);
    validate_timezone(persona, &mut result);
    validate_language(persona, strict, &mut result);
    validate_platform(persona, &mut result);
    validate_resolution(persona, strict, &mut result);

    result
}

fn validate_required(persona: &Persona, result: &mut ValidationResult) {
    if persona.id.trim().is_empty() {
        result.error("persona.id must not be empty");
    }
    if persona.user_agent.trim().is_empty() {
        result.error("persona.user_agent must not be empty");
    }
    if persona.accept_lang.trim().is_empty() {
        result.error("persona.accept_lang must not be empty");
    }
    if persona.timezone.trim().is_empty() {
        result.error("persona.timezone must not be empty");
    }
    if persona.geo_region.trim().is_empty() {
        result.error("persona.geo_region must not be empty");
    }
    if persona.screen_width == 0 || persona.screen_height == 0 {
        result.error("screen dimensions must be non-zero");
    }
}

fn validate_timezone(persona: &Persona, result: &mut ValidationResult) {
    let geo = persona.geo_region.to_ascii_uppercase();
    let allowed = allowed_timezones(&geo);
    if allowed.is_empty() {
        result.warnings.push(format!(
            "CR-01: unknown geo_region {}; cannot verify timezone {}",
            persona.geo_region, persona.timezone
        ));
        return;
    }

    if !allowed.contains(&persona.timezone.as_str()) {
        result.error(format!(
            "CR-01: timezone {} is not coherent with geo_region {} (allowed: {})",
            persona.timezone,
            persona.geo_region,
            allowed.join(", ")
        ));
    }
}

fn validate_language(persona: &Persona, strict: bool, result: &mut ValidationResult) {
    let geo = persona.geo_region.to_ascii_uppercase();
    let expected = expected_languages(&geo);
    if expected.is_empty() {
        result.warnings.push(format!(
            "CR-02: unknown geo_region {}; cannot verify accept_lang {}",
            persona.geo_region, persona.accept_lang
        ));
        return;
    }

    let primary = primary_language(&persona.accept_lang);
    if !expected.contains(&primary.as_str()) {
        result.warn_or_error(
            strict,
            format!(
                "CR-02: accept_lang primary language '{}' is not typical for geo_region {} (expected one of: {})",
                primary,
                persona.geo_region,
                expected.join(", ")
            ),
        );
    }
}

fn validate_platform(persona: &Persona, result: &mut ValidationResult) {
    let platform = persona.platform.to_ascii_lowercase();
    let ua = persona.user_agent.to_ascii_lowercase();

    let coherent = if platform.contains("linux") {
        ua.contains("linux") || ua.contains("x11")
    } else if platform.contains("win") {
        ua.contains("windows")
    } else if platform.contains("mac") || platform.contains("darwin") {
        ua.contains("macintosh") || ua.contains("mac os")
    } else if platform.contains("android") {
        ua.contains("android")
    } else {
        result.warnings.push(format!(
            "CR-03: unknown platform {}; cannot verify user_agent platform token",
            persona.platform
        ));
        true
    };

    if !coherent {
        result.error(format!(
            "CR-03: user_agent platform token is not coherent with platform '{}'",
            persona.platform
        ));
    }
}

fn validate_resolution(persona: &Persona, strict: bool, result: &mut ValidationResult) {
    if persona.screen_width < 800
        || persona.screen_height < 600
        || persona.screen_width > 8000
        || persona.screen_height > 5000
    {
        result.warn_or_error(
            strict,
            format!(
                "CR-04: resolution {}x{} is outside expected desktop ranges",
                persona.screen_width, persona.screen_height
            ),
        );
        return;
    }

    let known = known_resolutions();
    if !known.contains(&(persona.screen_width, persona.screen_height)) {
        result.warn_or_error(
            strict,
            format!(
                "CR-04: resolution {}x{} is not in the known-common resolution set",
                persona.screen_width, persona.screen_height
            ),
        );
    }
}

pub fn primary_locale(accept_lang: &str) -> String {
    accept_lang
        .split(',')
        .next()
        .unwrap_or("en-US")
        .split(';')
        .next()
        .unwrap_or("en-US")
        .trim()
        .to_string()
}

pub fn primary_language(accept_lang: &str) -> String {
    primary_locale(accept_lang)
        .split('-')
        .next()
        .unwrap_or("en")
        .to_ascii_lowercase()
}

fn allowed_timezones(geo: &str) -> Vec<&'static str> {
    match geo {
        "NL" => vec!["Europe/Amsterdam"],
        "DE" => vec!["Europe/Berlin"],
        "FR" => vec!["Europe/Paris"],
        "ES" => vec!["Europe/Madrid"],
        "IT" => vec!["Europe/Rome"],
        "GB" | "UK" => vec!["Europe/London"],
        "US" => vec![
            "America/New_York",
            "America/Chicago",
            "America/Denver",
            "America/Phoenix",
            "America/Los_Angeles",
            "America/Anchorage",
            "Pacific/Honolulu",
        ],
        "CA" => vec![
            "America/Toronto",
            "America/Vancouver",
            "America/Edmonton",
            "America/Halifax",
        ],
        "JP" => vec!["Asia/Tokyo"],
        "IN" => vec!["Asia/Kolkata"],
        "BR" => vec!["America/Sao_Paulo"],
        "AU" => vec![
            "Australia/Sydney",
            "Australia/Melbourne",
            "Australia/Perth",
            "Australia/Brisbane",
        ],
        _ => Vec::new(),
    }
}

fn expected_languages(geo: &str) -> Vec<&'static str> {
    match geo {
        "NL" => vec!["nl"],
        "DE" => vec!["de"],
        "FR" => vec!["fr"],
        "ES" => vec!["es"],
        "IT" => vec!["it"],
        "GB" | "UK" | "US" | "CA" | "AU" => vec!["en"],
        "JP" => vec!["ja"],
        "IN" => vec!["hi", "en"],
        "BR" => vec!["pt"],
        _ => Vec::new(),
    }
}

fn known_resolutions() -> Vec<(u32, u32)> {
    vec![
        (1024, 768),
        (1280, 720),
        (1280, 800),
        (1366, 768),
        (1440, 900),
        (1536, 864),
        (1600, 900),
        (1680, 1050),
        (1920, 1080),
        (1920, 1200),
        (2560, 1440),
        (3840, 2160),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_nl() -> Persona {
        Persona {
            id: "nl".into(),
            display_name: "NL".into(),
            user_agent:
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"
                    .into(),
            accept_lang: "nl-NL,nl;q=0.9,en;q=0.8".into(),
            timezone: "Europe/Amsterdam".into(),
            geo_region: "NL".into(),
            screen_width: 1920,
            screen_height: 1080,
            color_depth: 24,
            platform: "Linux x86_64".into(),
            timezone_offset_minutes: Some(-120),
            hardware_concurrency: Some(8),
            device_memory: Some(8),
            max_touch_points: Some(0),
            vendor: Some("Google Inc.".into()),
        }
    }

    #[test]
    fn valid_persona_passes() {
        let result = validate_persona(&valid_nl(), false);
        assert!(result.valid, "{:?}", result);
    }

    #[test]
    fn timezone_mismatch_fails() {
        let mut persona = valid_nl();
        persona.timezone = "America/New_York".into();
        let result = validate_persona(&persona, false);
        assert!(!result.valid);
        assert!(result.errors.iter().any(|e| e.contains("CR-01")));
    }

    #[test]
    fn language_mismatch_warns_or_errors() {
        let mut persona = valid_nl();
        persona.accept_lang = "en-US,en;q=0.9".into();
        let non_strict = validate_persona(&persona, false);
        assert!(non_strict.valid);
        assert!(non_strict.warnings.iter().any(|w| w.contains("CR-02")));

        let strict = validate_persona(&persona, true);
        assert!(!strict.valid);
    }

    #[test]
    fn platform_mismatch_fails() {
        let mut persona = valid_nl();
        persona.platform = "Win32".into();
        let result = validate_persona(&persona, false);
        assert!(!result.valid);
        assert!(result.errors.iter().any(|e| e.contains("CR-03")));
    }

    #[test]
    fn primary_locale_parsing() {
        assert_eq!(primary_locale("nl-NL,nl;q=0.9,en;q=0.8"), "nl-NL");
        assert_eq!(primary_language("nl-NL,nl;q=0.9,en;q=0.8"), "nl");
    }
}
