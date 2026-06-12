//#region \0vite/modulepreload-polyfill.js
(function polyfill() {
	const relList = document.createElement("link").relList;
	if (relList && relList.supports && relList.supports("modulepreload")) return;
	for (const link of document.querySelectorAll("link[rel=\"modulepreload\"]")) processPreload(link);
	new MutationObserver((mutations) => {
		for (const mutation of mutations) {
			if (mutation.type !== "childList") continue;
			for (const node of mutation.addedNodes) if (node.tagName === "LINK" && node.rel === "modulepreload") processPreload(node);
		}
	}).observe(document, {
		childList: true,
		subtree: true
	});
	function getFetchOpts(link) {
		const fetchOpts = {};
		if (link.integrity) fetchOpts.integrity = link.integrity;
		if (link.referrerPolicy) fetchOpts.referrerPolicy = link.referrerPolicy;
		if (link.crossOrigin === "use-credentials") fetchOpts.credentials = "include";
		else if (link.crossOrigin === "anonymous") fetchOpts.credentials = "omit";
		else fetchOpts.credentials = "same-origin";
		return fetchOpts;
	}
	function processPreload(link) {
		if (link.ep) return;
		link.ep = true;
		const fetchOpts = getFetchOpts(link);
		fetch(link.href, fetchOpts);
	}
})();
//#endregion
//#region src/popup/popup.ts
var statusPill = byId("status-pill");
var personaSelect = byId("persona-select");
var applyButton = byId("apply-button");
var clearButton = byId("clear-button");
var validation = byId("validation");
var tokenInput = byId("token-input");
var saveTokenButton = byId("save-token-button");
var proxyStatus = byId("proxy-status");
var proxyPort = byId("proxy-port");
var activePersona = byId("active-persona");
var metrics = byId("metrics");
refresh();
applyButton.addEventListener("click", async () => {
	applyButton.disabled = true;
	try {
		const personaId = personaSelect.value;
		const response = await sendMessage({
			type: "FACADEPROXY_SET_PERSONA",
			personaId
		});
		if (!response.ok) {
			validation.textContent = response.error;
			validation.className = "validation error";
		}
		await refresh("state" in response ? response.state : void 0);
	} finally {
		applyButton.disabled = false;
	}
});
clearButton.addEventListener("click", async () => {
	clearButton.disabled = true;
	try {
		const response = await sendMessage({ type: "FACADEPROXY_CLEAR_PERSONA" });
		if (response.ok && "state" in response) renderState(response.state);
		await refresh("state" in response ? response.state : void 0);
	} finally {
		clearButton.disabled = false;
	}
});
saveTokenButton.addEventListener("click", async () => {
	saveTokenButton.disabled = true;
	try {
		const state = await getState();
		await chrome.storage.local.set({ settings: {
			...state.settings,
			controlToken: tokenInput.value.trim()
		} });
		validation.textContent = "Token saved locally. Re-apply persona to use it.";
		validation.className = "validation";
		await refresh();
	} finally {
		saveTokenButton.disabled = false;
	}
});
async function refresh(existingState) {
	try {
		renderState(existingState ?? await getState());
		const metricsResponse = await sendMessage({ type: "FACADEPROXY_GET_METRICS" });
		if (metricsResponse.ok && "metrics" in metricsResponse) renderMetrics(metricsResponse.metrics);
	} catch (error) {
		validation.textContent = error instanceof Error ? error.message : String(error);
		validation.className = "validation error";
	}
}
async function getState() {
	const response = await sendMessage({ type: "FACADEPROXY_GET_STATE" });
	if (!response.ok || !("state" in response)) throw new Error(response.ok ? "State unavailable" : response.error);
	return response.state;
}
function renderState(state) {
	statusPill.textContent = state.state;
	statusPill.className = `pill ${state.state.toLowerCase()}`;
	personaSelect.replaceChildren(...state.personas.map((persona) => {
		const option = document.createElement("option");
		option.value = persona.id;
		option.textContent = persona.display_name;
		return option;
	}));
	if (state.desiredPersonaId || state.activePersonaId) personaSelect.value = state.desiredPersonaId ?? state.activePersonaId ?? personaSelect.value;
	tokenInput.value = state.settings.controlToken ?? "";
	proxyStatus.textContent = state.networkReady ? "ready" : state.proxyReachable ? "reachable" : "unreachable";
	proxyPort.textContent = String(state.settings.proxyPort);
	activePersona.textContent = state.activePersonaId ?? (state.desiredPersonaId ? `${state.desiredPersonaId} pending` : "unset");
	renderValidation(state);
}
function renderValidation(state) {
	const result = state.validation;
	validation.className = "validation";
	if (state.lastError) {
		validation.textContent = state.lastError;
		validation.classList.add("error");
		return;
	}
	if (!result) {
		validation.textContent = state.state === "DEGRADED" ? "Persona is not applied because full network+JS coherence is unavailable." : "";
		if (state.state === "DEGRADED") validation.classList.add("warn");
		return;
	}
	if (!result.valid) {
		validation.textContent = result.errors.join("; ");
		validation.classList.add("error");
	} else if (result.warnings.length > 0) {
		validation.textContent = result.warnings.join("; ");
		validation.classList.add("warn");
	} else if (state.state === "ACTIVE") validation.textContent = "Persona coherent and active across proxy, DNR, and page JS.";
	else if (state.state === "DEGRADED") {
		validation.textContent = "Persona validated but is NOT applied; full network+JS coherence is unavailable.";
		validation.classList.add("warn");
	} else validation.textContent = "";
}
function renderMetrics(value) {
	if (!value) {
		metrics.textContent = "Proxy metrics unavailable.";
		return;
	}
	const compact = {
		active_persona: value.active_persona,
		uptime_seconds: value.uptime_seconds,
		requests_total: value.requests_total,
		requests_mutated: value.requests_mutated,
		requests_passthrough: value.requests_passthrough,
		requests_timeout: value.requests_timeout,
		health_polls_received: value.health_polls_received
	};
	metrics.textContent = JSON.stringify(compact, null, 2);
}
async function sendMessage(message) {
	return chrome.runtime.sendMessage(message);
}
function byId(id) {
	const element = document.getElementById(id);
	if (!element) throw new Error(`Missing element #${id}`);
	return element;
}
//#endregion

//# sourceMappingURL=popup.js.map