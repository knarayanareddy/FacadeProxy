use crate::config::Config;
use crate::headers::mutate_request_headers;
use crate::metrics::ProxyMetrics;
use crate::persona::{save_personas, validate_persona, Persona, ValidationResult};
use crate::VERSION;
use http::header::{HeaderName, HeaderValue, CONTENT_TYPE};
use http::{Method, StatusCode, Uri};
use hyper::client::HttpConnector;
use hyper::service::{make_service_fn, service_fn};
use hyper::{Body, Client, Request, Response, Server};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::convert::Infallible;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Duration;
use tokio::net::TcpStream;
use tokio::sync::{OwnedSemaphorePermit, RwLock, Semaphore};
use tokio::time::timeout;
use tracing::{debug, error, info, warn};

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    client: Client<HttpConnector, Body>,
    active_persona: Arc<RwLock<Option<Persona>>>,
    pub metrics: Arc<ProxyMetrics>,
    semaphore: Arc<Semaphore>,
    personas_path: Option<PathBuf>,
}

impl AppState {
    pub fn new(
        config: Config,
        active_persona: Option<Persona>,
        debug_enabled: bool,
        personas_path: Option<PathBuf>,
    ) -> Self {
        let mut connector = HttpConnector::new();
        connector.enforce_http(false);
        let client = Client::builder().build(connector);
        let max_connections = config.proxy.max_connections.max(1);
        Self {
            config,
            client,
            active_persona: Arc::new(RwLock::new(active_persona)),
            metrics: Arc::new(ProxyMetrics::new(debug_enabled)),
            semaphore: Arc::new(Semaphore::new(max_connections)),
            personas_path,
        }
    }

    pub async fn active_persona_id(&self) -> String {
        self.active_persona
            .read()
            .await
            .as_ref()
            .map(|p| p.id.clone())
            .unwrap_or_else(|| "unset".to_string())
    }
}

pub async fn run(addr: SocketAddr, state: AppState) -> anyhow::Result<()> {
    info!(%addr, "starting FacadeProxy");

    let make_service = make_service_fn(move |_conn| {
        let state = state.clone();
        async move {
            Ok::<_, Infallible>(service_fn(move |req| {
                let state = state.clone();
                async move { handle_request(req, state).await }
            }))
        }
    });

    Server::try_bind(&addr)?.serve(make_service).await?;
    Ok(())
}

async fn handle_request(req: Request<Body>, state: AppState) -> Result<Response<Body>, Infallible> {
    let response = match route_request(req, state).await {
        Ok(response) => response,
        Err(err) => {
            error!(error = %err, "request handling failed");
            text_response(StatusCode::BAD_GATEWAY, "FacadeProxy upstream error")
        }
    };

    Ok(response)
}

async fn route_request(req: Request<Body>, state: AppState) -> anyhow::Result<Response<Body>> {
    if is_control_path(req.uri(), "/health") && req.method() == Method::GET {
        return Ok(handle_health(req, state).await);
    }

    if is_control_path(req.uri(), "/metrics") && req.method() == Method::GET {
        return Ok(handle_metrics(req, state).await);
    }

    if is_control_path(req.uri(), "/persona/current") && req.method() == Method::GET {
        return Ok(handle_persona_current(state).await);
    }

    if is_control_path(req.uri(), "/personas") && req.method() == Method::OPTIONS {
        return Ok(cors_preflight_response(req.headers()));
    }

    if is_control_path(req.uri(), "/personas") && req.method() == Method::POST {
        return Ok(handle_personas_sync(req, state).await);
    }

    if is_control_path(req.uri(), "/persona") && req.method() == Method::OPTIONS {
        return Ok(cors_preflight_response(req.headers()));
    }

    if is_control_path(req.uri(), "/persona") && req.method() == Method::POST {
        return Ok(handle_persona_post(req, state).await);
    }

    if is_control_path(req.uri(), "/persona") && req.method() == Method::DELETE {
        return Ok(handle_persona_delete(req, state).await);
    }

    if req.method() == Method::CONNECT {
        return handle_connect(req, state).await;
    }

    forward_http_request(req, state).await
}

fn is_control_path(uri: &Uri, path: &str) -> bool {
    uri.path() == path
        && match uri.authority() {
            None => true,
            Some(authority) => {
                let host = authority.host().to_ascii_lowercase();
                host == "127.0.0.1" || host == "localhost" || host == "[::1]" || host == "::1"
            }
        }
}

async fn handle_health(req: Request<Body>, state: AppState) -> Response<Body> {
    let cors_origin = allowed_cors_origin(req.headers());
    state
        .metrics
        .health_polls_received
        .fetch_add(1, Ordering::Relaxed);
    let body = HealthResponse {
        status: "ok".to_string(),
        version: VERSION.to_string(),
        persona: state.active_persona_id().await,
        uptime_seconds: state.metrics.snapshot("unset".to_string()).uptime_seconds,
        auth_required: auth_required(&state),
    };
    json_response(StatusCode::OK, &body, cors_origin.as_deref())
}

async fn handle_metrics(req: Request<Body>, state: AppState) -> Response<Body> {
    let cors_origin = allowed_cors_origin(req.headers());
    let active = state.active_persona_id().await;
    let snapshot = state.metrics.snapshot(active);
    json_response(StatusCode::OK, &snapshot, cors_origin.as_deref())
}

async fn handle_persona_current(state: AppState) -> Response<Body> {
    // This read-only endpoint is intentionally CORS-readable so the MAIN-world
    // bootstrap can synchronously verify proxy/persona coherence before page
    // scripts run. It returns only the active fake persona, never user history
    // or secrets. Mutation endpoints remain origin+token protected.
    let persona = state.active_persona.read().await.clone();
    json_response(
        StatusCode::OK,
        &CurrentPersonaResponse {
            status: "ok".to_string(),
            persona,
        },
        Some("*"),
    )
}

async fn handle_personas_sync(req: Request<Body>, state: AppState) -> Response<Body> {
    let cors_origin = allowed_cors_origin(req.headers());
    if !origin_allowed(req.headers()) {
        return json_response(
            StatusCode::FORBIDDEN,
            &ErrorResponse::new("forbidden_origin", "Origin is not allowed for /personas"),
            None,
        );
    }
    if !control_auth_allowed(req.headers(), &state) {
        return json_response(
            StatusCode::UNAUTHORIZED,
            &ErrorResponse::new("unauthorized", "Missing or invalid X-FacadeProxy-Token"),
            cors_origin.as_deref(),
        );
    }
    let Some(path) = state.personas_path.clone() else {
        return json_response(
            StatusCode::PRECONDITION_FAILED,
            &ErrorResponse::new(
                "personas_path_unset",
                "Proxy was started without a personas TOML path",
            ),
            cors_origin.as_deref(),
        );
    };
    let body_bytes = match hyper::body::to_bytes(req.into_body()).await {
        Ok(bytes) => bytes,
        Err(err) => {
            return json_response(
                StatusCode::BAD_REQUEST,
                &ErrorResponse::new("bad_body", format!("Failed to read body: {err}")),
                cors_origin.as_deref(),
            )
        }
    };
    let payload: PersonasSyncPayload = match serde_json::from_slice(&body_bytes) {
        Ok(payload) => payload,
        Err(err) => {
            return json_response(
                StatusCode::BAD_REQUEST,
                &ErrorResponse::new("bad_json", format!("Invalid personas JSON: {err}")),
                cors_origin.as_deref(),
            )
        }
    };
    let mut map = HashMap::new();
    let mut warnings = Vec::new();
    for persona in payload.personas {
        let validation = validate_persona(&persona, state.config.persona_defaults.coherence_strict);
        if !validation.valid {
            return json_response(
                StatusCode::UNPROCESSABLE_ENTITY,
                &ErrorResponse::new(
                    "invalid_persona",
                    format!("{}: {}", persona.id, validation.errors.join("; ")),
                ),
                cors_origin.as_deref(),
            );
        }
        warnings.extend(
            validation
                .warnings
                .into_iter()
                .map(|warning| format!("{}: {warning}", persona.id)),
        );
        map.insert(persona.id.clone(), persona);
    }
    if let Err(err) = save_personas(&path, &map) {
        return json_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            &ErrorResponse::new(
                "write_failed",
                format!("Failed to write personas TOML: {err}"),
            ),
            cors_origin.as_deref(),
        );
    }
    json_response(
        StatusCode::OK,
        &serde_json::json!({ "accepted": true, "count": map.len(), "warnings": warnings }),
        cors_origin.as_deref(),
    )
}

async fn handle_persona_post(req: Request<Body>, state: AppState) -> Response<Body> {
    let cors_origin = allowed_cors_origin(req.headers());
    if !origin_allowed(req.headers()) {
        return json_response(
            StatusCode::FORBIDDEN,
            &ErrorResponse::new("forbidden_origin", "Origin is not allowed for /persona"),
            None,
        );
    }

    if !control_auth_allowed(req.headers(), &state) {
        return json_response(
            StatusCode::UNAUTHORIZED,
            &ErrorResponse::new("unauthorized", "Missing or invalid X-FacadeProxy-Token"),
            cors_origin.as_deref(),
        );
    }

    let body_bytes = match hyper::body::to_bytes(req.into_body()).await {
        Ok(bytes) => bytes,
        Err(err) => {
            return json_response(
                StatusCode::BAD_REQUEST,
                &ErrorResponse::new("bad_body", format!("Failed to read body: {err}")),
                cors_origin.as_deref(),
            )
        }
    };

    let payload: PersonaPayload = match serde_json::from_slice(&body_bytes) {
        Ok(payload) => payload,
        Err(err) => {
            return json_response(
                StatusCode::BAD_REQUEST,
                &ErrorResponse::new("bad_json", format!("Invalid persona JSON: {err}")),
                cors_origin.as_deref(),
            )
        }
    };

    let persona = payload.into_persona();
    let validation = validate_persona(&persona, state.config.persona_defaults.coherence_strict);
    if !validation.valid {
        state
            .metrics
            .persona_validations_failed
            .fetch_add(1, Ordering::Relaxed);
        return json_response(
            StatusCode::UNPROCESSABLE_ENTITY,
            &PersonaPostResponse {
                accepted: false,
                persona: persona.id,
                validation,
            },
            cors_origin.as_deref(),
        );
    }

    state
        .metrics
        .persona_validations_passed
        .fetch_add(1, Ordering::Relaxed);
    {
        let mut active = state.active_persona.write().await;
        *active = Some(persona.clone());
    }

    json_response(
        StatusCode::OK,
        &PersonaPostResponse {
            accepted: true,
            persona: persona.id,
            validation,
        },
        cors_origin.as_deref(),
    )
}

async fn handle_persona_delete(req: Request<Body>, state: AppState) -> Response<Body> {
    let cors_origin = allowed_cors_origin(req.headers());
    if !origin_allowed(req.headers()) {
        return json_response(
            StatusCode::FORBIDDEN,
            &ErrorResponse::new("forbidden_origin", "Origin is not allowed for /persona"),
            None,
        );
    }

    if !control_auth_allowed(req.headers(), &state) {
        return json_response(
            StatusCode::UNAUTHORIZED,
            &ErrorResponse::new("unauthorized", "Missing or invalid X-FacadeProxy-Token"),
            cors_origin.as_deref(),
        );
    }

    let mut active = state.active_persona.write().await;
    *active = None;
    json_response(
        StatusCode::OK,
        &serde_json::json!({ "accepted": true, "persona": "unset" }),
        cors_origin.as_deref(),
    )
}

async fn handle_connect(req: Request<Body>, state: AppState) -> anyhow::Result<Response<Body>> {
    let authority =
        connect_authority(req.uri()).ok_or_else(|| anyhow::anyhow!("CONNECT missing authority"))?;
    state.metrics.record_request("CONNECT", &authority, false);

    let permit = match state.semaphore.clone().try_acquire_owned() {
        Ok(permit) => permit,
        Err(_) => {
            return Ok(text_response(
                StatusCode::SERVICE_UNAVAILABLE,
                "Too many proxy connections",
            ))
        }
    };

    let request_timeout = Duration::from_millis(state.config.proxy.request_timeout_ms);
    let server = match timeout(request_timeout, TcpStream::connect(&authority)).await {
        Ok(Ok(server)) => server,
        Ok(Err(err)) => {
            warn!(%authority, error = %err, "CONNECT upstream TCP connection failed");
            return Ok(text_response(
                StatusCode::BAD_GATEWAY,
                "CONNECT upstream failed",
            ));
        }
        Err(_) => {
            state
                .metrics
                .requests_timeout
                .fetch_add(1, Ordering::Relaxed);
            warn!(%authority, "CONNECT upstream TCP connection timed out");
            return Ok(text_response(
                StatusCode::GATEWAY_TIMEOUT,
                "CONNECT upstream timeout",
            ));
        }
    };

    tokio::spawn(async move {
        if let Err(err) = tunnel(req, server, permit).await {
            debug!(%authority, error = %err, "CONNECT tunnel ended with error");
        }
    });

    Ok(Response::builder()
        .status(StatusCode::OK)
        .body(Body::empty())
        .expect("valid CONNECT response"))
}

async fn tunnel(
    req: Request<Body>,
    mut server: TcpStream,
    _permit: OwnedSemaphorePermit,
) -> anyhow::Result<()> {
    let mut upgraded = hyper::upgrade::on(req).await?;
    let _ = tokio::io::copy_bidirectional(&mut upgraded, &mut server).await?;
    Ok(())
}

async fn forward_http_request(
    req: Request<Body>,
    state: AppState,
) -> anyhow::Result<Response<Body>> {
    let _permit = match state.semaphore.clone().try_acquire_owned() {
        Ok(permit) => permit,
        Err(_) => {
            return Ok(text_response(
                StatusCode::SERVICE_UNAVAILABLE,
                "Too many proxy connections",
            ))
        }
    };

    let method = req.method().clone();
    let authority_for_metrics = authority_for_metrics(&req);
    let target_uri = absolute_target_uri(req.uri(), req.headers())?;

    let (mut parts, body) = req.into_parts();
    parts.uri = target_uri;
    strip_hop_by_hop_headers(&mut parts.headers);

    let mut mutated = false;
    if let Some(persona) = state.active_persona.read().await.clone() {
        match mutate_request_headers(&mut parts.headers, &persona) {
            Ok(()) => {
                mutated = true;
            }
            Err(err) => {
                warn!(error = %err, "header mutation failed; forwarding request unmodified");
            }
        }
    }

    let out_req = Request::from_parts(parts, body);
    state
        .metrics
        .record_request(method.as_str(), &authority_for_metrics, mutated);

    let request_timeout = Duration::from_millis(state.config.proxy.request_timeout_ms);
    match timeout(request_timeout, state.client.request(out_req)).await {
        Ok(Ok(response)) => Ok(response),
        Ok(Err(err)) => Err(err.into()),
        Err(_) => {
            state
                .metrics
                .requests_timeout
                .fetch_add(1, Ordering::Relaxed);
            Ok(text_response(
                StatusCode::GATEWAY_TIMEOUT,
                "FacadeProxy upstream timeout",
            ))
        }
    }
}

fn absolute_target_uri(uri: &Uri, headers: &hyper::HeaderMap) -> anyhow::Result<Uri> {
    if uri.scheme().is_some() && uri.authority().is_some() {
        return Ok(uri.clone());
    }

    let host = headers
        .get(http::header::HOST)
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| anyhow::anyhow!("origin-form request missing Host header"))?;
    let path_and_query = uri.path_and_query().map(|pq| pq.as_str()).unwrap_or("/");
    let candidate = format!("http://{}{}", host, path_and_query);
    Ok(candidate.parse()?)
}

fn authority_for_metrics(req: &Request<Body>) -> String {
    if let Some(authority) = req.uri().authority() {
        return authority.to_string();
    }
    req.headers()
        .get(http::header::HOST)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("unknown")
        .to_string()
}

fn connect_authority(uri: &Uri) -> Option<String> {
    let authority = uri.authority()?.as_str();
    if authority.contains(':') {
        Some(authority.to_string())
    } else {
        Some(format!("{}:443", authority))
    }
}

fn strip_hop_by_hop_headers(headers: &mut hyper::HeaderMap) {
    static HOP_HEADERS: &[&str] = &[
        "connection",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "proxy-connection",
        "te",
        "trailer",
        "transfer-encoding",
        "upgrade",
    ];

    for name in HOP_HEADERS {
        headers.remove(*name);
    }
}

fn origin_allowed(headers: &hyper::HeaderMap) -> bool {
    allowed_cors_origin(headers).is_some() || headers.get("origin").is_none()
}

fn allowed_cors_origin(headers: &hyper::HeaderMap) -> Option<String> {
    let origin = headers.get("origin").and_then(|v| v.to_str().ok())?;
    let lower = origin.to_ascii_lowercase();
    let allowed = lower.starts_with("chrome-extension://")
        || lower.starts_with("moz-extension://")
        || lower.starts_with("http://127.0.0.1")
        || lower.starts_with("https://127.0.0.1")
        || lower.starts_with("http://localhost")
        || lower.starts_with("https://localhost")
        || lower.starts_with("http://[::1]")
        || lower.starts_with("https://[::1]");
    if allowed {
        Some(origin.to_string())
    } else {
        None
    }
}

fn auth_required(state: &AppState) -> bool {
    state
        .config
        .proxy
        .auth_token
        .as_deref()
        .map(|token| !token.is_empty())
        .unwrap_or(false)
}

fn control_auth_allowed(headers: &hyper::HeaderMap, state: &AppState) -> bool {
    let Some(expected) = state
        .config
        .proxy
        .auth_token
        .as_deref()
        .filter(|token| !token.is_empty())
    else {
        return true;
    };
    let Some(actual) = headers
        .get("x-facadeproxy-token")
        .and_then(|value| value.to_str().ok())
    else {
        return false;
    };
    constant_time_eq(actual.as_bytes(), expected.as_bytes())
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (left, right) in a.iter().zip(b.iter()) {
        diff |= left ^ right;
    }
    diff == 0
}

fn json_response<T: Serialize>(
    status: StatusCode,
    value: &T,
    cors_origin: Option<&str>,
) -> Response<Body> {
    let body = match serde_json::to_vec_pretty(value) {
        Ok(body) => body,
        Err(err) => format!(
            "{{\"error\":\"serialization_failed\",\"message\":\"{}\"}}",
            err
        )
        .into_bytes(),
    };

    let mut response = Response::builder()
        .status(status)
        .header(CONTENT_TYPE, "application/json; charset=utf-8")
        .body(Body::from(body))
        .expect("valid JSON response");
    add_control_headers(response.headers_mut(), cors_origin);
    response
}

fn text_response(status: StatusCode, text: &str) -> Response<Body> {
    let mut response = Response::builder()
        .status(status)
        .header(CONTENT_TYPE, "text/plain; charset=utf-8")
        .body(Body::from(text.to_string()))
        .expect("valid text response");
    response.headers_mut().insert(
        HeaderName::from_static("cache-control"),
        HeaderValue::from_static("no-store"),
    );
    response
}

fn cors_preflight_response(headers: &hyper::HeaderMap) -> Response<Body> {
    if !origin_allowed(headers) {
        return text_response(StatusCode::FORBIDDEN, "Origin is not allowed");
    }
    let cors_origin = allowed_cors_origin(headers);
    let mut response = Response::builder()
        .status(StatusCode::NO_CONTENT)
        .body(Body::empty())
        .expect("valid preflight response");
    add_control_headers(response.headers_mut(), cors_origin.as_deref());
    response
}

fn add_control_headers(headers: &mut hyper::HeaderMap, cors_origin: Option<&str>) {
    if let Some(origin) = cors_origin.and_then(|origin| HeaderValue::from_str(origin).ok()) {
        headers.insert(
            HeaderName::from_static("access-control-allow-origin"),
            origin,
        );
        headers.insert(
            HeaderName::from_static("vary"),
            HeaderValue::from_static("Origin"),
        );
    }
    headers.insert(
        HeaderName::from_static("access-control-allow-methods"),
        HeaderValue::from_static("GET,POST,DELETE,OPTIONS"),
    );
    headers.insert(
        HeaderName::from_static("access-control-allow-headers"),
        HeaderValue::from_static("content-type,x-facadeproxy-token"),
    );
    headers.insert(
        HeaderName::from_static("cache-control"),
        HeaderValue::from_static("no-store"),
    );
}

#[derive(Debug, Serialize)]
struct CurrentPersonaResponse {
    status: String,
    persona: Option<Persona>,
}

#[derive(Debug, Serialize)]
struct HealthResponse {
    status: String,
    version: String,
    persona: String,
    uptime_seconds: u64,
    auth_required: bool,
}

#[derive(Debug, Serialize)]
struct PersonaPostResponse {
    accepted: bool,
    persona: String,
    validation: ValidationResult,
}

#[derive(Debug, Serialize)]
struct ErrorResponse {
    error: String,
    message: String,
}

impl ErrorResponse {
    fn new(error: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            error: error.into(),
            message: message.into(),
        }
    }
}

#[derive(Debug, Deserialize)]
struct PersonasSyncPayload {
    personas: Vec<Persona>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum PersonaPayload {
    Direct(Persona),
    Wrapped { persona: Persona },
}

impl PersonaPayload {
    fn into_persona(self) -> Persona {
        match self {
            PersonaPayload::Direct(persona) => persona,
            PersonaPayload::Wrapped { persona } => persona,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use http::HeaderMap;

    #[test]
    fn origin_validation_allows_extension_and_localhost() {
        let mut headers = HeaderMap::new();
        assert!(origin_allowed(&headers));
        headers.insert("origin", HeaderValue::from_static("chrome-extension://abc"));
        assert!(origin_allowed(&headers));
        headers.insert("origin", HeaderValue::from_static("http://127.0.0.1:3000"));
        assert!(origin_allowed(&headers));
        headers.insert("origin", HeaderValue::from_static("https://evil.example"));
        assert!(!origin_allowed(&headers));
    }

    #[test]
    fn control_auth_requires_matching_token() {
        let mut cfg = crate::config::Config::default();
        cfg.proxy.auth_token = Some("secret-token".to_string());
        let state = AppState::new(cfg, None, false, None);
        let mut headers = HeaderMap::new();
        assert!(!control_auth_allowed(&headers, &state));
        headers.insert(
            "x-facadeproxy-token",
            HeaderValue::from_static("wrong-token"),
        );
        assert!(!control_auth_allowed(&headers, &state));
        headers.insert(
            "x-facadeproxy-token",
            HeaderValue::from_static("secret-token"),
        );
        assert!(control_auth_allowed(&headers, &state));
    }

    #[test]
    fn constant_time_equality_checks_length_and_bytes() {
        assert!(constant_time_eq(b"abc", b"abc"));
        assert!(!constant_time_eq(b"abc", b"abcd"));
        assert!(!constant_time_eq(b"abc", b"abd"));
    }

    #[test]
    fn absolute_uri_from_origin_form() {
        let uri: Uri = "/path?q=1".parse().unwrap();
        let mut headers = HeaderMap::new();
        headers.insert(http::header::HOST, HeaderValue::from_static("example.com"));
        assert_eq!(
            absolute_target_uri(&uri, &headers).unwrap().to_string(),
            "http://example.com/path?q=1"
        );
    }

    #[test]
    fn connect_authority_defaults_to_443() {
        let uri: Uri = "example.com".parse().unwrap();
        assert_eq!(connect_authority(&uri).unwrap(), "example.com:443");
    }
}
