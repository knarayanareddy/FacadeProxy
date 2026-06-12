import type { Persona } from '../shared/types';

type PersonaChangedMessage = {
  type: 'FACADEPROXY_PERSONA_CHANGED';
  persona: Persona | null;
  proxyBaseUrl?: string;
};

const PERSONA_KEY = 'facadeproxy.activePersona';
const PROXY_BASE_KEY = 'facadeproxy.proxyBaseUrl';

injectMainWorldScript();
void publishActivePersona();

chrome.runtime.onMessage.addListener((message: PersonaChangedMessage) => {
  if (message?.type === 'FACADEPROXY_PERSONA_CHANGED') {
    persistPersonaForSynchronousBootstrap(message.persona, message.proxyBaseUrl);
    postPersonaToPage(message.persona);
  }
});

function injectMainWorldScript(): void {
  try {
    // Chrome MV3 loads assets/injected.js directly in MAIN world from manifest.json.
    // This script-tag path is a compatibility fallback for browsers that ignore
    // content_scripts.world = MAIN.
    if (document.documentElement?.getAttribute('data-facadeproxy-main-ready') === '1') return;
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('assets/injected.js');
    script.async = false;
    script.dataset.facadeproxy = 'injected';
    script.onload = () => script.remove();

    const root = document.documentElement || document.head || document.body;
    if (root) {
      root.prepend(script);
    } else {
      document.addEventListener(
        'DOMContentLoaded',
        () => {
          (document.documentElement || document.head || document.body)?.prepend(script);
        },
        { once: true }
      );
    }
  } catch (error) {
    // INV-1: never break page load.
    console.debug('[facadeproxy] failed to inject MAIN-world script', error);
  }
}

async function publishActivePersona(): Promise<void> {
  try {
    const [personaResponse, stateResponse] = await Promise.all([
      chrome.runtime.sendMessage({ type: 'FACADEPROXY_GET_ACTIVE_PERSONA' }),
      chrome.runtime.sendMessage({ type: 'FACADEPROXY_GET_STATE' })
    ]);

    const persona = personaResponse?.ok ? personaResponse.persona ?? null : null;
    const settings = stateResponse?.ok ? stateResponse.state?.settings : undefined;
    const proxyBaseUrl = settings ? `http://${settings.proxyHost}:${settings.proxyPort}` : undefined;
    persistPersonaForSynchronousBootstrap(persona, proxyBaseUrl);
    postPersonaToPage(persona);
  } catch (error) {
    clearSynchronousBootstrapPersona();
    postPersonaToPage(null);
    console.debug('[facadeproxy] failed to read active persona', error);
  }
}

function persistPersonaForSynchronousBootstrap(persona: Persona | null, proxyBaseUrl?: string): void {
  try {
    if (proxyBaseUrl) sessionStorage.setItem(PROXY_BASE_KEY, proxyBaseUrl);
    if (persona) {
      sessionStorage.setItem(PERSONA_KEY, JSON.stringify(persona));
    } else {
      sessionStorage.removeItem(PERSONA_KEY);
    }
  } catch (error) {
    console.debug('[facadeproxy] failed to persist persona bootstrap', error);
  }
}

function clearSynchronousBootstrapPersona(): void {
  try {
    sessionStorage.removeItem(PERSONA_KEY);
  } catch {
    // Ignore storage failures.
  }
}

function postPersonaToPage(persona: Persona | null): void {
  try {
    window.postMessage(
      {
        source: 'facadeproxy',
        type: persona ? 'APPLY_PERSONA' : 'CLEAR_PERSONA',
        persona
      },
      '*'
    );
  } catch (error) {
    console.debug('[facadeproxy] failed to post persona to page', error);
  }
}
