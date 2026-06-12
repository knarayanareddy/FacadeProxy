use crate::persona::Persona;
use http::header::{ACCEPT_LANGUAGE, REFERER, USER_AGENT};
use http::{HeaderMap, HeaderValue};
use url::Url;

pub fn mutate_request_headers(headers: &mut HeaderMap, persona: &Persona) -> anyhow::Result<()> {
    set_header(headers, USER_AGENT.as_str(), &persona.user_agent)?;
    set_header(headers, ACCEPT_LANGUAGE.as_str(), &persona.accept_lang)?;

    if let Some(referer) = sanitize_referer(headers.get(REFERER).and_then(|v| v.to_str().ok())) {
        set_header(headers, REFERER.as_str(), &referer)?;
    }

    // Client hints are intentionally conservative. If the browser already sends
    // Sec-CH-UA-Platform, keep it coherent with the JS-facing platform value.
    if headers.contains_key("sec-ch-ua-platform") {
        let platform = client_hint_platform(&persona.platform);
        set_header(headers, "sec-ch-ua-platform", &format!("\"{}\"", platform))?;
    }

    Ok(())
}

pub fn client_hint_platform(platform: &str) -> &'static str {
    let lower = platform.to_ascii_lowercase();
    if lower.contains("win") {
        "Windows"
    } else if lower.contains("mac") || lower.contains("darwin") {
        "macOS"
    } else if lower.contains("android") {
        "Android"
    } else if lower.contains("linux") {
        "Linux"
    } else {
        "Unknown"
    }
}

fn set_header(headers: &mut HeaderMap, name: &str, value: &str) -> anyhow::Result<()> {
    let header_value = HeaderValue::from_str(value)?;
    headers.insert(
        http::header::HeaderName::from_bytes(name.as_bytes())?,
        header_value,
    );
    Ok(())
}

fn sanitize_referer(value: Option<&str>) -> Option<String> {
    let value = value?;
    let parsed = Url::parse(value).ok()?;
    let host = parsed.host_str()?;
    let mut origin = format!("{}://{}", parsed.scheme(), host);
    if let Some(port) = parsed.port() {
        origin.push(':');
        origin.push_str(&port.to_string());
    }
    origin.push('/');
    Some(origin)
}

#[cfg(test)]
mod tests {
    use super::*;
    use http::HeaderMap;

    fn persona() -> Persona {
        Persona {
            id: "nl".into(),
            display_name: "NL".into(),
            user_agent: "UA".into(),
            accept_lang: "nl-NL,nl;q=0.9".into(),
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
    fn mutates_ua_and_accept_language() {
        let mut headers = HeaderMap::new();
        mutate_request_headers(&mut headers, &persona()).unwrap();
        assert_eq!(headers.get(USER_AGENT).unwrap(), "UA");
        assert_eq!(headers.get(ACCEPT_LANGUAGE).unwrap(), "nl-NL,nl;q=0.9");
    }

    #[test]
    fn referer_is_reduced_to_origin() {
        let mut headers = HeaderMap::new();
        headers.insert(
            REFERER,
            HeaderValue::from_static("https://example.com/path?q=1#frag"),
        );
        mutate_request_headers(&mut headers, &persona()).unwrap();
        assert_eq!(headers.get(REFERER).unwrap(), "https://example.com/");
    }

    #[test]
    fn client_hint_platform_maps() {
        assert_eq!(client_hint_platform("Win32"), "Windows");
        assert_eq!(client_hint_platform("Linux x86_64"), "Linux");
    }
}
