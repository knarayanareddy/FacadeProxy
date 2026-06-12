//#region src/content/content.ts
var PERSONA_KEY = "facadeproxy.activePersona";
var PROXY_BASE_KEY = "facadeproxy.proxyBaseUrl";
injectMainWorldScript();
publishActivePersona();
chrome.runtime.onMessage.addListener((message) => {
	if (message?.type === "FACADEPROXY_PERSONA_CHANGED") {
		persistPersonaForSynchronousBootstrap(message.persona, message.proxyBaseUrl);
		postPersonaToPage(message.persona);
	}
});
function injectMainWorldScript() {
	try {
		if (document.documentElement?.getAttribute("data-facadeproxy-main-ready") === "1") return;
		const script = document.createElement("script");
		script.src = chrome.runtime.getURL("assets/injected.js");
		script.async = false;
		script.dataset.facadeproxy = "injected";
		script.onload = () => script.remove();
		const root = document.documentElement || document.head || document.body;
		if (root) root.prepend(script);
		else document.addEventListener("DOMContentLoaded", () => {
			(document.documentElement || document.head || document.body)?.prepend(script);
		}, { once: true });
	} catch (error) {
		console.debug("[facadeproxy] failed to inject MAIN-world script", error);
	}
}
async function publishActivePersona() {
	try {
		const [personaResponse, stateResponse] = await Promise.all([chrome.runtime.sendMessage({ type: "FACADEPROXY_GET_ACTIVE_PERSONA" }), chrome.runtime.sendMessage({ type: "FACADEPROXY_GET_STATE" })]);
		const persona = personaResponse?.ok ? personaResponse.persona ?? null : null;
		const settings = stateResponse?.ok ? stateResponse.state?.settings : void 0;
		persistPersonaForSynchronousBootstrap(persona, settings ? `http://${settings.proxyHost}:${settings.proxyPort}` : void 0);
		postPersonaToPage(persona);
	} catch (error) {
		clearSynchronousBootstrapPersona();
		postPersonaToPage(null);
		console.debug("[facadeproxy] failed to read active persona", error);
	}
}
function persistPersonaForSynchronousBootstrap(persona, proxyBaseUrl) {
	try {
		if (proxyBaseUrl) sessionStorage.setItem(PROXY_BASE_KEY, proxyBaseUrl);
		if (persona) sessionStorage.setItem(PERSONA_KEY, JSON.stringify(persona));
		else sessionStorage.removeItem(PERSONA_KEY);
	} catch (error) {
		console.debug("[facadeproxy] failed to persist persona bootstrap", error);
	}
}
function clearSynchronousBootstrapPersona() {
	try {
		sessionStorage.removeItem(PERSONA_KEY);
	} catch {}
}
function postPersonaToPage(persona) {
	try {
		window.postMessage({
			source: "facadeproxy",
			type: persona ? "APPLY_PERSONA" : "CLEAR_PERSONA",
			persona
		}, "*");
	} catch (error) {
		console.debug("[facadeproxy] failed to post persona to page", error);
	}
}
//#endregion

//# sourceMappingURL=content.js.map