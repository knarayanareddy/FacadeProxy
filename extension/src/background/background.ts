import { DEFAULT_PERSONAS } from '../shared/defaultPersonas';
import { validatePersona } from '../shared/persona';
import { sessionArea, STORAGE_KEYS, storageGet, storageRemove, storageSet } from '../shared/storage';
import type {
  FacadeProxyMessage,
  FacadeProxyMessageResponse,
  Persona,
  PersonaState,
  ProxyHealth,
  ProxyMetrics,
  RuntimeState,
  Settings,
  ValidationResult
} from '../shared/types';

const MIN_PROXY_VERSION = '0.1.0';
const MAX_PROXY_VERSION = '0.1.x';
const HEALTH_POLL_MS = 5_000;
const LOCALHOST_RULE_IDS = [10_001];

const DEFAULT_SETTINGS: Settings = {
  proxyHost: '127.0.0.1',
  proxyPort: 7878,
  proxyEnabled: true,
  debug: false,
  coherenceStrict: true,
  controlToken: ''
};

let lastProxyReachable = false;
let lastProxyHealth: ProxyHealth | null = null;
let lastNetworkReady = false;
let lastValidation: ValidationResult | undefined;
let lastError: string | undefined;
let initialized = false;
let activationInFlight: Promise<boolean> | null = null;

void initialize();
setInterval(() => void refreshHealthAndState(), HEALTH_POLL_MS);

chrome.runtime.onInstalled.addListener(() => {
  void initialize();
});

chrome.runtime.onStartup.addListener(() => {
  void initialize();
});

chrome.proxy?.onProxyError?.addListener?.((details) => {
  lastError = `Proxy error: ${details.error}`;
  lastProxyReachable = false;
  lastNetworkReady = false;
  void deactivatePersonaRuntime('DEGRADED');
});

chrome.runtime.onMessage.addListener((message: FacadeProxyMessage, _sender, sendResponse) => {
  handleMessage(message)
    .then(sendResponse)
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      lastError = message;
      sendResponse({ ok: false, error: message } satisfies FacadeProxyMessageResponse);
    });
  return true;
});

async function initialize(): Promise<void> {
  if (initialized) return;
  initialized = true;
  await ensureDefaults();
  await refreshHealthAndState();
}

async function ensureDefaults(): Promise<void> {
  const local = await storageGet<{ personas?: Persona[]; settings?: Partial<Settings> }>(chrome.storage.local, [
    STORAGE_KEYS.personas,
    STORAGE_KEYS.settings
  ]);

  if (!Array.isArray(local.personas) || local.personas.length === 0) {
    await storageSet(chrome.storage.local, { [STORAGE_KEYS.personas]: DEFAULT_PERSONAS });
  }

  const settings = { ...DEFAULT_SETTINGS, ...(local.settings ?? {}) };
  await storageSet(chrome.storage.local, { [STORAGE_KEYS.settings]: settings });
}

async function handleMessage(message: FacadeProxyMessage): Promise<FacadeProxyMessageResponse> {
  await ensureDefaults();

  switch (message.type) {
    case 'FACADEPROXY_GET_STATE':
    case 'FACADEPROXY_CONTENT_READY':
      return { ok: true, state: await getRuntimeState() };

    case 'FACADEPROXY_GET_ACTIVE_PERSONA':
      // Only a fully network-ready persona is exposed to the page injector.
      return { ok: true, persona: await getActivePersona() };

    case 'FACADEPROXY_SET_PERSONA':
      return setPersona(message.personaId);

    case 'FACADEPROXY_CLEAR_PERSONA':
      return clearPersona();

    case 'FACADEPROXY_GET_METRICS':
      return { ok: true, metrics: await fetchMetrics() };

    default:
      return { ok: false, error: `Unknown message type ${(message as { type?: string }).type}` };
  }
}

async function setPersona(personaId: string): Promise<FacadeProxyMessageResponse> {
  const personas = await getPersonas();
  const settings = await getSettings();
  const persona = personas.find((candidate) => candidate.id === personaId);
  if (!persona) {
    lastError = `Persona not found: ${personaId}`;
    return { ok: false, error: lastError, state: await getRuntimeState() };
  }

  await storageSet(sessionArea(), { [STORAGE_KEYS.desiredPersonaId]: persona.id });
  await deactivatePersonaRuntime('PENDING');

  lastValidation = validatePersona(persona, settings.coherenceStrict);
  await storageSet(chrome.storage.local, { [STORAGE_KEYS.lastValidation]: lastValidation });

  if (!lastValidation.valid) {
    lastNetworkReady = false;
    await updateBadge('INVALID');
    const error = lastValidation.errors.join('; ');
    lastError = error;
    return { ok: false, error, state: await getRuntimeState('INVALID') };
  }

  const activated = await activatePersonaStrict(persona, settings);
  const state = await getRuntimeState(activated ? 'ACTIVE' : 'DEGRADED');
  await updateBadge(state.state);

  if (!activated) {
    return {
      ok: false,
      error: lastError ?? 'Persona could not be activated coherently across network and JS layers',
      state
    };
  }

  return { ok: true, state };
}

async function activatePersonaStrict(persona: Persona, settings: Settings): Promise<boolean> {
  if (activationInFlight) return activationInFlight;

  activationInFlight = (async () => {
    try {
      lastError = undefined;
      lastNetworkReady = false;

      if (!settings.proxyEnabled) {
        throw new Error('Proxy routing is disabled; refusing partial JS-only persona');
      }

      lastProxyHealth = await fetchProxyHealth(settings);
      lastProxyReachable = Boolean(lastProxyHealth);
      if (!lastProxyReachable) {
        throw new Error('Local proxy is unreachable; refusing partial JS-only persona');
      }

      const postedToProxy = await postPersonaToProxy(persona, settings);
      if (!postedToProxy) {
        throw new Error('Proxy did not accept persona');
      }
      await syncPersonasToProxy(await getPersonas(), settings).catch((error) => {
        console.warn('[facadeproxy] persona TOML mirror sync failed', error);
      });

      lastProxyHealth = await fetchProxyHealth(settings);
      if (!lastProxyHealth || lastProxyHealth.persona !== persona.id) {
        throw new Error(`Proxy persona sync failed; expected ${persona.id}, got ${lastProxyHealth?.persona ?? 'unreachable'}`);
      }

      await configureProxy(settings);
      await updateDynamicRulesStrict(persona);
      await verifyDynamicRulesStrict();

      await storageSet(sessionArea(), { [STORAGE_KEYS.activePersonaId]: persona.id });
      lastNetworkReady = true;
      await broadcastPersona(persona);
      return true;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      lastNetworkReady = false;
      await rollbackNetworkPersona(settings);
      await broadcastPersona(null);
      return false;
    } finally {
      activationInFlight = null;
    }
  })();

  return activationInFlight;
}

async function clearPersona(): Promise<FacadeProxyMessageResponse> {
  const settings = await getSettings();
  await storageRemove(sessionArea(), [STORAGE_KEYS.activePersonaId, STORAGE_KEYS.desiredPersonaId]);
  lastValidation = undefined;
  lastError = undefined;
  lastNetworkReady = false;
  await clearDynamicRules();
  await clearProxySettings();
  await deletePersonaFromProxy(settings).catch(() => undefined);
  await broadcastPersona(null);
  const state = await getRuntimeState('UNSET');
  await updateBadge('UNSET');
  return { ok: true, state };
}

async function refreshHealthAndState(): Promise<void> {
  await ensureDefaults();
  const settings = await getSettings();
  const desiredPersona = await getDesiredPersona();
  const activePersona = await getActivePersona();
  const wasReachable = lastProxyReachable;

  lastProxyHealth = await fetchProxyHealth(settings);
  lastProxyReachable = Boolean(lastProxyHealth);

  if (wasReachable && !lastProxyReachable) {
    console.debug('[facadeproxy] proxy transitioned to degraded mode');
  }

  if (activePersona && !lastProxyReachable) {
    await deactivatePersonaRuntime('DEGRADED');
  } else if (activePersona && lastProxyHealth?.persona !== activePersona.id) {
    // Critical coherence guard: proxy restarts lose in-memory persona. Re-sync
    // immediately or roll back JS/DNR/PAC state. Never leave spoofed JS with
    // unmodified network headers.
    try {
      await postPersonaToProxy(activePersona, settings);
      const synced = await fetchProxyHealth(settings);
      if (!synced || synced.persona !== activePersona.id) {
        throw new Error(`expected ${activePersona.id}, got ${synced?.persona ?? 'unreachable'}`);
      }
      lastProxyHealth = synced;
      lastProxyReachable = true;
      lastNetworkReady = true;
      await broadcastPersona(activePersona);
    } catch (error) {
      lastError = `Proxy persona desynchronized and re-sync failed: ${error instanceof Error ? error.message : String(error)}`;
      await deactivatePersonaRuntime('DEGRADED');
    }
  } else if (!activePersona && desiredPersona && lastProxyReachable) {
    await activatePersonaStrict(desiredPersona, settings);
  } else if (!desiredPersona) {
    await deactivatePersonaRuntime('UNSET');
  }

  const state = await getRuntimeState();
  await updateBadge(state.state);
}

async function deactivatePersonaRuntime(_reason: PersonaState): Promise<void> {
  const settings = await getSettings();
  await storageRemove(sessionArea(), STORAGE_KEYS.activePersonaId);
  lastNetworkReady = false;
  await rollbackNetworkPersona(settings);
  await broadcastPersona(null);
}

async function rollbackNetworkPersona(settings: Settings): Promise<void> {
  await clearDynamicRules().catch(() => undefined);
  await clearProxySettings().catch(() => undefined);
  await deletePersonaFromProxy(settings).catch(() => undefined);
}

async function getRuntimeState(forcedState?: PersonaState): Promise<RuntimeState> {
  const [settings, personas, activePersona, desiredPersona] = await Promise.all([
    getSettings(),
    getPersonas(),
    getActivePersona(),
    getDesiredPersona()
  ]);
  const storedValidation = await storageGet<{ lastValidation?: ValidationResult }>(chrome.storage.local, STORAGE_KEYS.lastValidation);
  const validation = lastValidation ?? storedValidation.lastValidation;

  let state: PersonaState = 'UNSET';
  if (forcedState) {
    state = forcedState;
  } else if (activePersona && lastNetworkReady && lastProxyReachable) {
    const currentValidation = validation ?? validatePersona(activePersona, settings.coherenceStrict);
    if (!currentValidation.valid) state = 'INVALID';
    else state = 'ACTIVE';
  } else if (desiredPersona) {
    const currentValidation = validation ?? validatePersona(desiredPersona, settings.coherenceStrict);
    state = currentValidation.valid ? 'DEGRADED' : 'INVALID';
  }

  return {
    state,
    activePersonaId: activePersona?.id ?? null,
    desiredPersonaId: desiredPersona?.id ?? null,
    proxyReachable: lastProxyReachable,
    networkReady: lastNetworkReady && Boolean(activePersona) && lastProxyReachable,
    settings,
    personas,
    validation,
    lastError
  };
}

async function getSettings(): Promise<Settings> {
  const result = await storageGet<{ settings?: Partial<Settings> }>(chrome.storage.local, STORAGE_KEYS.settings);
  return { ...DEFAULT_SETTINGS, ...(result.settings ?? {}) };
}

async function getPersonas(): Promise<Persona[]> {
  const result = await storageGet<{ personas?: Persona[] }>(chrome.storage.local, STORAGE_KEYS.personas);
  return Array.isArray(result.personas) && result.personas.length > 0 ? result.personas : DEFAULT_PERSONAS;
}

async function getActivePersona(): Promise<Persona | null> {
  const [personas, session] = await Promise.all([
    getPersonas(),
    storageGet<{ activePersonaId?: string }>(sessionArea(), STORAGE_KEYS.activePersonaId)
  ]);
  if (!session.activePersonaId || !lastNetworkReady) return null;
  return personas.find((persona) => persona.id === session.activePersonaId) ?? null;
}

async function getDesiredPersona(): Promise<Persona | null> {
  const [personas, session] = await Promise.all([
    getPersonas(),
    storageGet<{ desiredPersonaId?: string }>(sessionArea(), STORAGE_KEYS.desiredPersonaId)
  ]);
  if (!session.desiredPersonaId) return null;
  return personas.find((persona) => persona.id === session.desiredPersonaId) ?? null;
}

async function fetchProxyHealth(settings: Settings): Promise<ProxyHealth | null> {
  try {
    const response = await fetchWithTimeout(`${proxyBaseUrl(settings)}/health`, { method: 'GET', cache: 'no-store' }, 1_500);
    if (!response.ok) return null;
    const health = (await response.json()) as ProxyHealth;
    if (!isProxyVersionCompatible(health.version)) {
      lastError = `Proxy version ${health.version} outside supported range ${MIN_PROXY_VERSION}..${MAX_PROXY_VERSION}`;
    } else if (health.auth_required && !settings.controlToken) {
      lastError = 'Proxy requires X-FacadeProxy-Token; add the matching token in extension settings before applying a persona.';
    }
    return health.status === 'ok' ? health : null;
  } catch {
    return null;
  }
}

async function postPersonaToProxy(persona: Persona, settings: Settings): Promise<boolean> {
  const response = await fetchWithTimeout(
    `${proxyBaseUrl(settings)}/persona`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: controlHeaders(settings),
      body: JSON.stringify(persona)
    },
    2_000
  );

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Proxy rejected persona (${response.status}): ${body.slice(0, 240)}`);
  }
  return true;
}

async function deletePersonaFromProxy(settings: Settings): Promise<void> {
  await fetchWithTimeout(
    `${proxyBaseUrl(settings)}/persona`,
    { method: 'DELETE', cache: 'no-store', headers: controlHeaders(settings, false) },
    1_500
  );
}

async function syncPersonasToProxy(personas: Persona[], settings: Settings): Promise<void> {
  const response = await fetchWithTimeout(
    `${proxyBaseUrl(settings)}/personas`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: controlHeaders(settings),
      body: JSON.stringify({ personas })
    },
    2_000
  );
  if (!response.ok && response.status !== 412) {
    const body = await response.text().catch(() => '');
    throw new Error(`Proxy rejected personas sync (${response.status}): ${body.slice(0, 240)}`);
  }
}

async function fetchMetrics(): Promise<ProxyMetrics | null> {
  const settings = await getSettings();
  try {
    const response = await fetchWithTimeout(`${proxyBaseUrl(settings)}/metrics`, { method: 'GET', cache: 'no-store' }, 1_500);
    if (!response.ok) return null;
    return (await response.json()) as ProxyMetrics;
  } catch {
    return null;
  }
}

async function configureProxy(settings: Settings): Promise<void> {
  if (!settings.proxyEnabled) {
    throw new Error('Proxy routing is disabled');
  }

  const pacScript = `
function FindProxyForURL(url, host) {
  if (host === "127.0.0.1" || host === "localhost" || host === "::1" || shExpMatch(host, "*.local")) return "DIRECT";
  if (isPlainHostName(host)) return "DIRECT";
  if (url.substring(0, 5) === "http:" || url.substring(0, 6) === "https:") {
    return "PROXY ${settings.proxyHost}:${settings.proxyPort}; DIRECT";
  }
  return "DIRECT";
}`.trim();

  await new Promise<void>((resolve, reject) => {
    chrome.proxy.settings.set(
      {
        value: {
          mode: 'pac_script',
          pacScript: { data: pacScript }
        },
        scope: 'regular'
      },
      () => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve();
      }
    );
  });
}

async function clearProxySettings(): Promise<void> {
  await new Promise<void>((resolve) => {
    if (!chrome.proxy?.settings) {
      resolve();
      return;
    }
    chrome.proxy.settings.clear({ scope: 'regular' }, () => resolve());
  });
}

async function updateDynamicRulesStrict(persona: Persona): Promise<void> {
  await clearDynamicRules();
  await applyDynamicRules([buildHeaderRule(persona)]);
}

function buildHeaderRule(persona: Persona): chrome.declarativeNetRequest.Rule {
  const requestHeaders: chrome.declarativeNetRequest.ModifyHeaderInfo[] = [
    {
      header: 'User-Agent',
      operation: chrome.declarativeNetRequest.HeaderOperation.SET,
      value: persona.user_agent
    },
    {
      header: 'Accept-Language',
      operation: chrome.declarativeNetRequest.HeaderOperation.SET,
      value: persona.accept_lang
    },
    {
      header: 'Sec-CH-UA-Platform',
      operation: chrome.declarativeNetRequest.HeaderOperation.SET,
      value: `"${clientHintPlatform(persona.platform)}"`
    }
  ];

  return {
    id: LOCALHOST_RULE_IDS[0],
    priority: 1,
    action: {
      type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
      requestHeaders
    },
    condition: {
      regexFilter: '^https?://',
      resourceTypes: [
        chrome.declarativeNetRequest.ResourceType.MAIN_FRAME,
        chrome.declarativeNetRequest.ResourceType.SUB_FRAME,
        chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST,
        chrome.declarativeNetRequest.ResourceType.SCRIPT,
        chrome.declarativeNetRequest.ResourceType.IMAGE,
        chrome.declarativeNetRequest.ResourceType.STYLESHEET,
        chrome.declarativeNetRequest.ResourceType.FONT,
        chrome.declarativeNetRequest.ResourceType.MEDIA,
        chrome.declarativeNetRequest.ResourceType.OTHER
      ]
    }
  };
}

async function applyDynamicRules(addRules: chrome.declarativeNetRequest.Rule[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    chrome.declarativeNetRequest.updateDynamicRules(
      {
        removeRuleIds: LOCALHOST_RULE_IDS,
        addRules
      },
      () => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve();
      }
    );
  });
}

async function verifyDynamicRulesStrict(): Promise<void> {
  const rules = await new Promise<chrome.declarativeNetRequest.Rule[]>((resolve, reject) => {
    chrome.declarativeNetRequest.getDynamicRules((rules) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(rules);
    });
  });
  const rule = rules.find((candidate) => candidate.id === LOCALHOST_RULE_IDS[0]);
  const headers = rule?.action.requestHeaders?.map((header) => header.header.toLowerCase()) ?? [];
  if (!rule || !headers.includes('user-agent') || !headers.includes('accept-language')) {
    throw new Error('DNR header rules were not installed completely; refusing partial persona');
  }
}

async function clearDynamicRules(): Promise<void> {
  await new Promise<void>((resolve) => {
    chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: LOCALHOST_RULE_IDS }, () => resolve());
  });
}

async function broadcastPersona(persona: Persona | null): Promise<void> {
  const settings = await getSettings();
  const tabs = await new Promise<chrome.tabs.Tab[]>((resolve) => {
    chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] }, (tabs) => resolve(tabs));
  });

  await Promise.all(
    tabs.map(
      (tab) =>
        new Promise<void>((resolve) => {
          if (!tab.id) {
            resolve();
            return;
          }
          chrome.tabs.sendMessage(tab.id, { type: 'FACADEPROXY_PERSONA_CHANGED', persona, proxyBaseUrl: proxyBaseUrl(settings) }, () => resolve());
        })
    )
  );
}

async function updateBadge(state: PersonaState): Promise<void> {
  const textByState: Record<PersonaState, string> = {
    UNSET: '',
    PENDING: '…',
    ACTIVE: 'ON',
    DEGRADED: '!',
    INVALID: 'ERR'
  };
  const colorByState: Record<PersonaState, string> = {
    UNSET: '#6b7280',
    PENDING: '#64748b',
    ACTIVE: '#16a34a',
    DEGRADED: '#f59e0b',
    INVALID: '#dc2626'
  };

  await chrome.action.setBadgeText({ text: textByState[state] });
  await chrome.action.setBadgeBackgroundColor({ color: colorByState[state] });
}

function controlHeaders(settings: Settings, includeContentType = true): HeadersInit {
  const headers: Record<string, string> = {};
  if (includeContentType) headers['content-type'] = 'application/json';
  if (settings.controlToken.trim()) headers['x-facadeproxy-token'] = settings.controlToken.trim();
  return headers;
}

function proxyBaseUrl(settings: Settings): string {
  return `http://${settings.proxyHost}:${settings.proxyPort}`;
}

function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function isProxyVersionCompatible(version: string): boolean {
  return version.startsWith('0.1.');
}

function clientHintPlatform(platform: string): string {
  const lower = platform.toLowerCase();
  if (lower.includes('win')) return 'Windows';
  if (lower.includes('mac') || lower.includes('darwin')) return 'macOS';
  if (lower.includes('android')) return 'Android';
  if (lower.includes('linux')) return 'Linux';
  return 'Unknown';
}
