//#region src/shared/defaultPersonas.ts
var DEFAULT_PERSONAS = [
	{
		id: "nl_chrome_linux",
		display_name: "Netherlands / Chrome on Linux",
		user_agent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
		accept_lang: "nl-NL,nl;q=0.9,en;q=0.8",
		timezone: "Europe/Amsterdam",
		geo_region: "NL",
		screen_width: 1920,
		screen_height: 1080,
		color_depth: 24,
		platform: "Linux x86_64",
		timezone_offset_minutes: -120,
		hardware_concurrency: 8,
		device_memory: 8,
		max_touch_points: 0,
		vendor: "Google Inc."
	},
	{
		id: "us_chrome_windows",
		display_name: "US East / Chrome on Windows",
		user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
		accept_lang: "en-US,en;q=0.9",
		timezone: "America/New_York",
		geo_region: "US",
		screen_width: 1366,
		screen_height: 768,
		color_depth: 24,
		platform: "Win32",
		timezone_offset_minutes: 240,
		hardware_concurrency: 8,
		device_memory: 8,
		max_touch_points: 0,
		vendor: "Google Inc."
	},
	{
		id: "de_firefox_windows",
		display_name: "Germany / Firefox on Windows",
		user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
		accept_lang: "de-DE,de;q=0.9,en;q=0.8",
		timezone: "Europe/Berlin",
		geo_region: "DE",
		screen_width: 1536,
		screen_height: 864,
		color_depth: 24,
		platform: "Win32",
		timezone_offset_minutes: -120,
		hardware_concurrency: 8,
		device_memory: 8,
		max_touch_points: 0,
		vendor: ""
	}
];
//#endregion
//#region src/shared/persona.ts
var TIMEZONES_BY_GEO = {
	NL: ["Europe/Amsterdam"],
	DE: ["Europe/Berlin"],
	FR: ["Europe/Paris"],
	ES: ["Europe/Madrid"],
	IT: ["Europe/Rome"],
	GB: ["Europe/London"],
	UK: ["Europe/London"],
	US: [
		"America/New_York",
		"America/Chicago",
		"America/Denver",
		"America/Phoenix",
		"America/Los_Angeles",
		"America/Anchorage",
		"Pacific/Honolulu"
	],
	CA: [
		"America/Toronto",
		"America/Vancouver",
		"America/Edmonton",
		"America/Halifax"
	],
	JP: ["Asia/Tokyo"],
	IN: ["Asia/Kolkata"],
	BR: ["America/Sao_Paulo"],
	AU: [
		"Australia/Sydney",
		"Australia/Melbourne",
		"Australia/Perth",
		"Australia/Brisbane"
	]
};
var LANGS_BY_GEO = {
	NL: ["nl"],
	DE: ["de"],
	FR: ["fr"],
	ES: ["es"],
	IT: ["it"],
	GB: ["en"],
	UK: ["en"],
	US: ["en"],
	CA: ["en"],
	AU: ["en"],
	JP: ["ja"],
	IN: ["hi", "en"],
	BR: ["pt"]
};
var COMMON_RESOLUTIONS = new Set([
	"1024x768",
	"1280x720",
	"1280x800",
	"1366x768",
	"1440x900",
	"1536x864",
	"1600x900",
	"1680x1050",
	"1920x1080",
	"1920x1200",
	"2560x1440",
	"3840x2160"
]);
function validatePersona(persona, strict = false) {
	const errors = [];
	const warnings = [];
	const warnOrError = (message) => {
		if (strict) errors.push(message);
		else warnings.push(message);
	};
	if (!persona.id?.trim()) errors.push("persona.id must not be empty");
	if (!persona.user_agent?.trim()) errors.push("persona.user_agent must not be empty");
	if (!persona.accept_lang?.trim()) errors.push("persona.accept_lang must not be empty");
	if (!persona.timezone?.trim()) errors.push("persona.timezone must not be empty");
	if (!persona.geo_region?.trim()) errors.push("persona.geo_region must not be empty");
	if (!persona.screen_width || !persona.screen_height) errors.push("screen dimensions must be non-zero");
	const geo = persona.geo_region.toUpperCase();
	const allowedZones = TIMEZONES_BY_GEO[geo] ?? [];
	if (allowedZones.length === 0) warnings.push(`CR-01: unknown geo_region ${persona.geo_region}; cannot verify timezone ${persona.timezone}`);
	else if (!allowedZones.includes(persona.timezone)) errors.push(`CR-01: timezone ${persona.timezone} is not coherent with geo_region ${persona.geo_region}`);
	const expectedLangs = LANGS_BY_GEO[geo] ?? [];
	const primary = primaryLanguage(persona.accept_lang);
	if (expectedLangs.length === 0) warnings.push(`CR-02: unknown geo_region ${persona.geo_region}; cannot verify accept_lang ${persona.accept_lang}`);
	else if (!expectedLangs.includes(primary)) warnOrError(`CR-02: accept_lang primary language '${primary}' is not typical for geo_region ${persona.geo_region}`);
	if (!platformMatchesUserAgent(persona.platform, persona.user_agent)) errors.push(`CR-03: user_agent platform token is not coherent with platform '${persona.platform}'`);
	const resolution = `${persona.screen_width}x${persona.screen_height}`;
	if (persona.screen_width < 800 || persona.screen_height < 600 || persona.screen_width > 8e3 || persona.screen_height > 5e3) warnOrError(`CR-04: resolution ${resolution} is outside expected desktop ranges`);
	else if (!COMMON_RESOLUTIONS.has(resolution)) warnOrError(`CR-04: resolution ${resolution} is not in the known-common resolution set`);
	return {
		valid: errors.length === 0,
		errors,
		warnings
	};
}
function primaryLocale(acceptLang) {
	return acceptLang.split(",")[0]?.split(";")[0]?.trim() || "en-US";
}
function primaryLanguage(acceptLang) {
	return primaryLocale(acceptLang).split("-")[0]?.toLowerCase() || "en";
}
function platformMatchesUserAgent(platform, userAgent) {
	const p = platform.toLowerCase();
	const ua = userAgent.toLowerCase();
	if (p.includes("linux")) return ua.includes("linux") || ua.includes("x11");
	if (p.includes("win")) return ua.includes("windows");
	if (p.includes("mac") || p.includes("darwin")) return ua.includes("macintosh") || ua.includes("mac os");
	if (p.includes("android")) return ua.includes("android");
	return true;
}
//#endregion
//#region src/shared/storage.ts
var STORAGE_KEYS = {
	personas: "personas",
	settings: "settings",
	activePersonaId: "activePersonaId",
	desiredPersonaId: "desiredPersonaId",
	lastValidation: "lastValidation"
};
function storageGet(area, keys) {
	return new Promise((resolve, reject) => {
		area.get(keys ?? null, (items) => {
			const error = chrome.runtime.lastError;
			if (error) reject(new Error(error.message));
			else resolve(items);
		});
	});
}
function storageSet(area, items) {
	return new Promise((resolve, reject) => {
		area.set(items, () => {
			const error = chrome.runtime.lastError;
			if (error) reject(new Error(error.message));
			else resolve();
		});
	});
}
function storageRemove(area, keys) {
	return new Promise((resolve, reject) => {
		area.remove(keys, () => {
			const error = chrome.runtime.lastError;
			if (error) reject(new Error(error.message));
			else resolve();
		});
	});
}
function sessionArea() {
	return chrome.storage.session ?? chrome.storage.local;
}
//#endregion
//#region src/background/background.ts
var MIN_PROXY_VERSION = "0.1.0";
var MAX_PROXY_VERSION = "0.1.x";
var HEALTH_POLL_MS = 5e3;
var LOCALHOST_RULE_IDS = [10001];
var DEFAULT_SETTINGS = {
	proxyHost: "127.0.0.1",
	proxyPort: 7878,
	proxyEnabled: true,
	debug: false,
	coherenceStrict: true,
	controlToken: ""
};
var lastProxyReachable = false;
var lastProxyHealth = null;
var lastNetworkReady = false;
var lastValidation;
var lastError;
var initialized = false;
var activationInFlight = null;
initialize();
setInterval(() => void refreshHealthAndState(), HEALTH_POLL_MS);
chrome.runtime.onInstalled.addListener(() => {
	initialize();
});
chrome.runtime.onStartup.addListener(() => {
	initialize();
});
chrome.proxy?.onProxyError?.addListener?.((details) => {
	lastError = `Proxy error: ${details.error}`;
	lastProxyReachable = false;
	lastNetworkReady = false;
	deactivatePersonaRuntime("DEGRADED");
});
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	handleMessage(message).then(sendResponse).catch((error) => {
		const message = error instanceof Error ? error.message : String(error);
		lastError = message;
		sendResponse({
			ok: false,
			error: message
		});
	});
	return true;
});
async function initialize() {
	if (initialized) return;
	initialized = true;
	await ensureDefaults();
	await refreshHealthAndState();
}
async function ensureDefaults() {
	const local = await storageGet(chrome.storage.local, [STORAGE_KEYS.personas, STORAGE_KEYS.settings]);
	if (!Array.isArray(local.personas) || local.personas.length === 0) await storageSet(chrome.storage.local, { [STORAGE_KEYS.personas]: DEFAULT_PERSONAS });
	const settings = {
		...DEFAULT_SETTINGS,
		...local.settings ?? {}
	};
	await storageSet(chrome.storage.local, { [STORAGE_KEYS.settings]: settings });
}
async function handleMessage(message) {
	await ensureDefaults();
	switch (message.type) {
		case "FACADEPROXY_GET_STATE":
		case "FACADEPROXY_CONTENT_READY": return {
			ok: true,
			state: await getRuntimeState()
		};
		case "FACADEPROXY_GET_ACTIVE_PERSONA": return {
			ok: true,
			persona: await getActivePersona()
		};
		case "FACADEPROXY_SET_PERSONA": return setPersona(message.personaId);
		case "FACADEPROXY_CLEAR_PERSONA": return clearPersona();
		case "FACADEPROXY_GET_METRICS": return {
			ok: true,
			metrics: await fetchMetrics()
		};
		default: return {
			ok: false,
			error: `Unknown message type ${message.type}`
		};
	}
}
async function setPersona(personaId) {
	const personas = await getPersonas();
	const settings = await getSettings();
	const persona = personas.find((candidate) => candidate.id === personaId);
	if (!persona) {
		lastError = `Persona not found: ${personaId}`;
		return {
			ok: false,
			error: lastError,
			state: await getRuntimeState()
		};
	}
	await storageSet(sessionArea(), { [STORAGE_KEYS.desiredPersonaId]: persona.id });
	await deactivatePersonaRuntime("PENDING");
	lastValidation = validatePersona(persona, settings.coherenceStrict);
	await storageSet(chrome.storage.local, { [STORAGE_KEYS.lastValidation]: lastValidation });
	if (!lastValidation.valid) {
		lastNetworkReady = false;
		await updateBadge("INVALID");
		const error = lastValidation.errors.join("; ");
		lastError = error;
		return {
			ok: false,
			error,
			state: await getRuntimeState("INVALID")
		};
	}
	const activated = await activatePersonaStrict(persona, settings);
	const state = await getRuntimeState(activated ? "ACTIVE" : "DEGRADED");
	await updateBadge(state.state);
	if (!activated) return {
		ok: false,
		error: lastError ?? "Persona could not be activated coherently across network and JS layers",
		state
	};
	return {
		ok: true,
		state
	};
}
async function activatePersonaStrict(persona, settings) {
	if (activationInFlight) return activationInFlight;
	activationInFlight = (async () => {
		try {
			lastError = void 0;
			lastNetworkReady = false;
			if (!settings.proxyEnabled) throw new Error("Proxy routing is disabled; refusing partial JS-only persona");
			lastProxyHealth = await fetchProxyHealth(settings);
			lastProxyReachable = Boolean(lastProxyHealth);
			if (!lastProxyReachable) throw new Error("Local proxy is unreachable; refusing partial JS-only persona");
			if (!await postPersonaToProxy(persona, settings)) throw new Error("Proxy did not accept persona");
			await syncPersonasToProxy(await getPersonas(), settings).catch((error) => {
				console.warn("[facadeproxy] persona TOML mirror sync failed", error);
			});
			lastProxyHealth = await fetchProxyHealth(settings);
			if (!lastProxyHealth || lastProxyHealth.persona !== persona.id) throw new Error(`Proxy persona sync failed; expected ${persona.id}, got ${lastProxyHealth?.persona ?? "unreachable"}`);
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
async function clearPersona() {
	const settings = await getSettings();
	await storageRemove(sessionArea(), [STORAGE_KEYS.activePersonaId, STORAGE_KEYS.desiredPersonaId]);
	lastValidation = void 0;
	lastError = void 0;
	lastNetworkReady = false;
	await clearDynamicRules();
	await clearProxySettings();
	await deletePersonaFromProxy(settings).catch(() => void 0);
	await broadcastPersona(null);
	const state = await getRuntimeState("UNSET");
	await updateBadge("UNSET");
	return {
		ok: true,
		state
	};
}
async function refreshHealthAndState() {
	await ensureDefaults();
	const settings = await getSettings();
	const desiredPersona = await getDesiredPersona();
	const activePersona = await getActivePersona();
	const wasReachable = lastProxyReachable;
	lastProxyHealth = await fetchProxyHealth(settings);
	lastProxyReachable = Boolean(lastProxyHealth);
	if (wasReachable && !lastProxyReachable) console.debug("[facadeproxy] proxy transitioned to degraded mode");
	if (activePersona && !lastProxyReachable) await deactivatePersonaRuntime("DEGRADED");
	else if (activePersona && lastProxyHealth?.persona !== activePersona.id) try {
		await postPersonaToProxy(activePersona, settings);
		const synced = await fetchProxyHealth(settings);
		if (!synced || synced.persona !== activePersona.id) throw new Error(`expected ${activePersona.id}, got ${synced?.persona ?? "unreachable"}`);
		lastProxyHealth = synced;
		lastProxyReachable = true;
		lastNetworkReady = true;
		await broadcastPersona(activePersona);
	} catch (error) {
		lastError = `Proxy persona desynchronized and re-sync failed: ${error instanceof Error ? error.message : String(error)}`;
		await deactivatePersonaRuntime("DEGRADED");
	}
	else if (!activePersona && desiredPersona && lastProxyReachable) await activatePersonaStrict(desiredPersona, settings);
	else if (!desiredPersona) await deactivatePersonaRuntime("UNSET");
	await updateBadge((await getRuntimeState()).state);
}
async function deactivatePersonaRuntime(_reason) {
	const settings = await getSettings();
	await storageRemove(sessionArea(), STORAGE_KEYS.activePersonaId);
	lastNetworkReady = false;
	await rollbackNetworkPersona(settings);
	await broadcastPersona(null);
}
async function rollbackNetworkPersona(settings) {
	await clearDynamicRules().catch(() => void 0);
	await clearProxySettings().catch(() => void 0);
	await deletePersonaFromProxy(settings).catch(() => void 0);
}
async function getRuntimeState(forcedState) {
	const [settings, personas, activePersona, desiredPersona] = await Promise.all([
		getSettings(),
		getPersonas(),
		getActivePersona(),
		getDesiredPersona()
	]);
	const storedValidation = await storageGet(chrome.storage.local, STORAGE_KEYS.lastValidation);
	const validation = lastValidation ?? storedValidation.lastValidation;
	let state = "UNSET";
	if (forcedState) state = forcedState;
	else if (activePersona && lastNetworkReady && lastProxyReachable) if (!(validation ?? validatePersona(activePersona, settings.coherenceStrict)).valid) state = "INVALID";
	else state = "ACTIVE";
	else if (desiredPersona) state = (validation ?? validatePersona(desiredPersona, settings.coherenceStrict)).valid ? "DEGRADED" : "INVALID";
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
async function getSettings() {
	const result = await storageGet(chrome.storage.local, STORAGE_KEYS.settings);
	return {
		...DEFAULT_SETTINGS,
		...result.settings ?? {}
	};
}
async function getPersonas() {
	const result = await storageGet(chrome.storage.local, STORAGE_KEYS.personas);
	return Array.isArray(result.personas) && result.personas.length > 0 ? result.personas : DEFAULT_PERSONAS;
}
async function getActivePersona() {
	const [personas, session] = await Promise.all([getPersonas(), storageGet(sessionArea(), STORAGE_KEYS.activePersonaId)]);
	if (!session.activePersonaId || !lastNetworkReady) return null;
	return personas.find((persona) => persona.id === session.activePersonaId) ?? null;
}
async function getDesiredPersona() {
	const [personas, session] = await Promise.all([getPersonas(), storageGet(sessionArea(), STORAGE_KEYS.desiredPersonaId)]);
	if (!session.desiredPersonaId) return null;
	return personas.find((persona) => persona.id === session.desiredPersonaId) ?? null;
}
async function fetchProxyHealth(settings) {
	try {
		const response = await fetchWithTimeout(`${proxyBaseUrl(settings)}/health`, {
			method: "GET",
			cache: "no-store"
		}, 1500);
		if (!response.ok) return null;
		const health = await response.json();
		if (!isProxyVersionCompatible(health.version)) lastError = `Proxy version ${health.version} outside supported range ${MIN_PROXY_VERSION}..${MAX_PROXY_VERSION}`;
		else if (health.auth_required && !settings.controlToken) lastError = "Proxy requires X-FacadeProxy-Token; add the matching token in extension settings before applying a persona.";
		return health.status === "ok" ? health : null;
	} catch {
		return null;
	}
}
async function postPersonaToProxy(persona, settings) {
	const response = await fetchWithTimeout(`${proxyBaseUrl(settings)}/persona`, {
		method: "POST",
		cache: "no-store",
		headers: controlHeaders(settings),
		body: JSON.stringify(persona)
	}, 2e3);
	if (!response.ok) {
		const body = await response.text().catch(() => "");
		throw new Error(`Proxy rejected persona (${response.status}): ${body.slice(0, 240)}`);
	}
	return true;
}
async function deletePersonaFromProxy(settings) {
	await fetchWithTimeout(`${proxyBaseUrl(settings)}/persona`, {
		method: "DELETE",
		cache: "no-store",
		headers: controlHeaders(settings, false)
	}, 1500);
}
async function syncPersonasToProxy(personas, settings) {
	const response = await fetchWithTimeout(`${proxyBaseUrl(settings)}/personas`, {
		method: "POST",
		cache: "no-store",
		headers: controlHeaders(settings),
		body: JSON.stringify({ personas })
	}, 2e3);
	if (!response.ok && response.status !== 412) {
		const body = await response.text().catch(() => "");
		throw new Error(`Proxy rejected personas sync (${response.status}): ${body.slice(0, 240)}`);
	}
}
async function fetchMetrics() {
	const settings = await getSettings();
	try {
		const response = await fetchWithTimeout(`${proxyBaseUrl(settings)}/metrics`, {
			method: "GET",
			cache: "no-store"
		}, 1500);
		if (!response.ok) return null;
		return await response.json();
	} catch {
		return null;
	}
}
async function configureProxy(settings) {
	if (!settings.proxyEnabled) throw new Error("Proxy routing is disabled");
	const pacScript = `
function FindProxyForURL(url, host) {
  if (host === "127.0.0.1" || host === "localhost" || host === "::1" || shExpMatch(host, "*.local")) return "DIRECT";
  if (isPlainHostName(host)) return "DIRECT";
  if (url.substring(0, 5) === "http:" || url.substring(0, 6) === "https:") {
    return "PROXY ${settings.proxyHost}:${settings.proxyPort}; DIRECT";
  }
  return "DIRECT";
}`.trim();
	await new Promise((resolve, reject) => {
		chrome.proxy.settings.set({
			value: {
				mode: "pac_script",
				pacScript: { data: pacScript }
			},
			scope: "regular"
		}, () => {
			const error = chrome.runtime.lastError;
			if (error) reject(new Error(error.message));
			else resolve();
		});
	});
}
async function clearProxySettings() {
	await new Promise((resolve) => {
		if (!chrome.proxy?.settings) {
			resolve();
			return;
		}
		chrome.proxy.settings.clear({ scope: "regular" }, () => resolve());
	});
}
async function updateDynamicRulesStrict(persona) {
	await clearDynamicRules();
	await applyDynamicRules([buildHeaderRule(persona)]);
}
function buildHeaderRule(persona) {
	const requestHeaders = [
		{
			header: "User-Agent",
			operation: chrome.declarativeNetRequest.HeaderOperation.SET,
			value: persona.user_agent
		},
		{
			header: "Accept-Language",
			operation: chrome.declarativeNetRequest.HeaderOperation.SET,
			value: persona.accept_lang
		},
		{
			header: "Sec-CH-UA-Platform",
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
			regexFilter: "^https?://",
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
async function applyDynamicRules(addRules) {
	await new Promise((resolve, reject) => {
		chrome.declarativeNetRequest.updateDynamicRules({
			removeRuleIds: LOCALHOST_RULE_IDS,
			addRules
		}, () => {
			const error = chrome.runtime.lastError;
			if (error) reject(new Error(error.message));
			else resolve();
		});
	});
}
async function verifyDynamicRulesStrict() {
	const rule = (await new Promise((resolve, reject) => {
		chrome.declarativeNetRequest.getDynamicRules((rules) => {
			const error = chrome.runtime.lastError;
			if (error) reject(new Error(error.message));
			else resolve(rules);
		});
	})).find((candidate) => candidate.id === LOCALHOST_RULE_IDS[0]);
	const headers = rule?.action.requestHeaders?.map((header) => header.header.toLowerCase()) ?? [];
	if (!rule || !headers.includes("user-agent") || !headers.includes("accept-language")) throw new Error("DNR header rules were not installed completely; refusing partial persona");
}
async function clearDynamicRules() {
	await new Promise((resolve) => {
		chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: LOCALHOST_RULE_IDS }, () => resolve());
	});
}
async function broadcastPersona(persona) {
	const settings = await getSettings();
	const tabs = await new Promise((resolve) => {
		chrome.tabs.query({ url: ["http://*/*", "https://*/*"] }, (tabs) => resolve(tabs));
	});
	await Promise.all(tabs.map((tab) => new Promise((resolve) => {
		if (!tab.id) {
			resolve();
			return;
		}
		chrome.tabs.sendMessage(tab.id, {
			type: "FACADEPROXY_PERSONA_CHANGED",
			persona,
			proxyBaseUrl: proxyBaseUrl(settings)
		}, () => resolve());
	})));
}
async function updateBadge(state) {
	const textByState = {
		UNSET: "",
		PENDING: "…",
		ACTIVE: "ON",
		DEGRADED: "!",
		INVALID: "ERR"
	};
	const colorByState = {
		UNSET: "#6b7280",
		PENDING: "#64748b",
		ACTIVE: "#16a34a",
		DEGRADED: "#f59e0b",
		INVALID: "#dc2626"
	};
	await chrome.action.setBadgeText({ text: textByState[state] });
	await chrome.action.setBadgeBackgroundColor({ color: colorByState[state] });
}
function controlHeaders(settings, includeContentType = true) {
	const headers = {};
	if (includeContentType) headers["content-type"] = "application/json";
	if (settings.controlToken.trim()) headers["x-facadeproxy-token"] = settings.controlToken.trim();
	return headers;
}
function proxyBaseUrl(settings) {
	return `http://${settings.proxyHost}:${settings.proxyPort}`;
}
function fetchWithTimeout(input, init, timeoutMs) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	return fetch(input, {
		...init,
		signal: controller.signal
	}).finally(() => clearTimeout(timer));
}
function isProxyVersionCompatible(version) {
	return version.startsWith("0.1.");
}
function clientHintPlatform(platform) {
	const lower = platform.toLowerCase();
	if (lower.includes("win")) return "Windows";
	if (lower.includes("mac") || lower.includes("darwin")) return "macOS";
	if (lower.includes("android")) return "Android";
	if (lower.includes("linux")) return "Linux";
	return "Unknown";
}
//#endregion

//# sourceMappingURL=background.js.map