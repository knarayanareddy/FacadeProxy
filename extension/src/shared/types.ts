export interface Persona {
  id: string;
  display_name: string;
  user_agent: string;
  accept_lang: string;
  timezone: string;
  geo_region: string;
  screen_width: number;
  screen_height: number;
  color_depth: number;
  platform: string;
  timezone_offset_minutes?: number;
  hardware_concurrency?: number;
  device_memory?: number;
  max_touch_points?: number;
  vendor?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export type PersonaState = 'UNSET' | 'PENDING' | 'ACTIVE' | 'DEGRADED' | 'INVALID';

export interface Settings {
  proxyPort: number;
  proxyHost: string;
  proxyEnabled: boolean;
  debug: boolean;
  coherenceStrict: boolean;
  /** Optional shared secret sent as X-FacadeProxy-Token for /persona mutations. */
  controlToken: string;
}

export interface RuntimeState {
  state: PersonaState;
  activePersonaId: string | null;
  desiredPersonaId: string | null;
  proxyReachable: boolean;
  networkReady: boolean;
  settings: Settings;
  personas: Persona[];
  validation?: ValidationResult;
  lastError?: string;
}

export interface ProxyMetrics {
  requests_total: number;
  requests_mutated: number;
  requests_passthrough: number;
  requests_timeout: number;
  persona_validations_passed: number;
  persona_validations_failed: number;
  health_polls_received: number;
  degraded_transitions: number;
  uptime_seconds: number;
  active_persona: string;
  recent_requests?: Array<{ method: string; authority: string; mutated: boolean }>;
}

export interface ProxyHealth {
  status: 'ok';
  version: string;
  persona: string;
  uptime_seconds: number;
  auth_required?: boolean;
}

export type FacadeProxyMessage =
  | { type: 'FACADEPROXY_GET_STATE' }
  | { type: 'FACADEPROXY_GET_ACTIVE_PERSONA' }
  | { type: 'FACADEPROXY_SET_PERSONA'; personaId: string }
  | { type: 'FACADEPROXY_CLEAR_PERSONA' }
  | { type: 'FACADEPROXY_GET_METRICS' }
  | { type: 'FACADEPROXY_CONTENT_READY' };

export type FacadeProxyMessageResponse =
  | { ok: true; state: RuntimeState }
  | { ok: true; persona: Persona | null }
  | { ok: true; metrics: ProxyMetrics | null }
  | { ok: true }
  | { ok: false; error: string; state?: RuntimeState };
