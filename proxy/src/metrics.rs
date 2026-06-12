use serde::Serialize;
use std::collections::VecDeque;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Instant;

#[derive(Debug)]
pub struct ProxyMetrics {
    start: Instant,
    pub requests_total: AtomicU64,
    pub requests_mutated: AtomicU64,
    pub requests_passthrough: AtomicU64,
    pub requests_timeout: AtomicU64,
    pub persona_validations_passed: AtomicU64,
    pub persona_validations_failed: AtomicU64,
    pub health_polls_received: AtomicU64,
    pub degraded_transitions: AtomicU64,
    debug_ring: Mutex<VecDeque<RequestLogEntry>>,
    debug_enabled: bool,
}

impl ProxyMetrics {
    pub fn new(debug_enabled: bool) -> Self {
        Self {
            start: Instant::now(),
            requests_total: AtomicU64::new(0),
            requests_mutated: AtomicU64::new(0),
            requests_passthrough: AtomicU64::new(0),
            requests_timeout: AtomicU64::new(0),
            persona_validations_passed: AtomicU64::new(0),
            persona_validations_failed: AtomicU64::new(0),
            health_polls_received: AtomicU64::new(0),
            degraded_transitions: AtomicU64::new(0),
            debug_ring: Mutex::new(VecDeque::with_capacity(100)),
            debug_enabled,
        }
    }

    pub fn snapshot(&self, active_persona: String) -> MetricsSnapshot {
        MetricsSnapshot {
            requests_total: self.requests_total.load(Ordering::Relaxed),
            requests_mutated: self.requests_mutated.load(Ordering::Relaxed),
            requests_passthrough: self.requests_passthrough.load(Ordering::Relaxed),
            requests_timeout: self.requests_timeout.load(Ordering::Relaxed),
            persona_validations_passed: self.persona_validations_passed.load(Ordering::Relaxed),
            persona_validations_failed: self.persona_validations_failed.load(Ordering::Relaxed),
            health_polls_received: self.health_polls_received.load(Ordering::Relaxed),
            degraded_transitions: self.degraded_transitions.load(Ordering::Relaxed),
            uptime_seconds: self.start.elapsed().as_secs(),
            active_persona,
            recent_requests: if self.debug_enabled {
                self.debug_ring
                    .lock()
                    .map(|ring| ring.iter().cloned().collect())
                    .unwrap_or_default()
            } else {
                Vec::new()
            },
        }
    }

    pub fn record_request(&self, method: &str, authority: &str, mutated: bool) {
        self.requests_total.fetch_add(1, Ordering::Relaxed);
        if mutated {
            self.requests_mutated.fetch_add(1, Ordering::Relaxed);
        } else {
            self.requests_passthrough.fetch_add(1, Ordering::Relaxed);
        }

        if self.debug_enabled {
            if let Ok(mut ring) = self.debug_ring.lock() {
                if ring.len() == 100 {
                    ring.pop_front();
                }
                ring.push_back(RequestLogEntry {
                    method: method.to_string(),
                    authority: authority.to_string(),
                    mutated,
                });
            }
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct RequestLogEntry {
    pub method: String,
    /// Host/authority only. URL paths and query strings are deliberately not stored.
    pub authority: String,
    pub mutated: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct MetricsSnapshot {
    pub requests_total: u64,
    pub requests_mutated: u64,
    pub requests_passthrough: u64,
    pub requests_timeout: u64,
    pub persona_validations_passed: u64,
    pub persona_validations_failed: u64,
    pub health_polls_received: u64,
    pub degraded_transitions: u64,
    pub uptime_seconds: u64,
    pub active_persona: String,
    pub recent_requests: Vec<RequestLogEntry>,
}
