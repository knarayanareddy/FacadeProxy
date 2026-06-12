(() => {
  const global = window as Window & { __facadeProxyInjected?: boolean };
  if (global.__facadeProxyInjected) return;
  global.__facadeProxyInjected = true;
  try {
    document.documentElement?.setAttribute('data-facadeproxy-main-ready', '1');
  } catch {
    // Ignore marker failures.
  }

  interface Persona {
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

  type SavedDescriptor = {
    target: object;
    property: PropertyKey;
    descriptor: PropertyDescriptor | undefined;
  };

  const saved: SavedDescriptor[] = [];
  const maskedNativeSources = new WeakMap<Function, string>();
  let activePersona: Persona | null = null;
  const PERSONA_KEY = 'facadeproxy.activePersona';
  const PROXY_BASE_KEY = 'facadeproxy.proxyBaseUrl';
  const DEFAULT_PROXY_BASE = 'http://127.0.0.1:7878';

  function remember(target: object, property: PropertyKey): void {
    if (saved.some((entry) => entry.target === target && entry.property === property)) return;
    saved.push({ target, property, descriptor: Object.getOwnPropertyDescriptor(target, property) });
  }

  function safeDefine(target: object, property: PropertyKey, descriptor: PropertyDescriptor): void {
    try {
      remember(target, property);
      Object.defineProperty(target, property, { configurable: true, ...descriptor });
    } catch {
      // Non-configurable native descriptors must not break page load.
    }
  }

  function asNative<T extends Function>(fn: T, label: string): T {
    maskedNativeSources.set(fn, `function ${label}() { [native code] }`);
    return fn;
  }

  function installFunctionToStringMask(): void {
    const original = Function.prototype.toString;
    if (maskedNativeSources.has(original)) return;
    const patched = function toString(this: Function) {
      return maskedNativeSources.get(this) ?? original.call(this);
    };
    asNative(patched, 'toString');
    safeDefine(Function.prototype, 'toString', { value: patched, writable: true });
  }

  function restoreOriginals(): void {
    for (let i = saved.length - 1; i >= 0; i -= 1) {
      const entry = saved[i];
      try {
        if (entry.descriptor) {
          Object.defineProperty(entry.target, entry.property, entry.descriptor);
        } else {
          Reflect.deleteProperty(entry.target, entry.property);
        }
      } catch {
        // Keep restoring the rest.
      }
    }
    saved.length = 0;
    activePersona = null;
  }


  function loadSynchronousPersona(): Persona | null {
    // Authoritative coherence check: if the proxy is reachable, use its active
    // persona. If it reports unset, clear any stale page sessionStorage. This
    // prevents spoofed JS after a proxy restart loses in-memory persona state.
    const proxyPersona = readProxyPersonaSynchronously();
    if (proxyPersona.reachable) {
      if (proxyPersona.persona) {
        writeStoredPersona(proxyPersona.persona);
        return proxyPersona.persona;
      }
      clearStoredPersona();
      return null;
    }

    // Fail-safe: do not apply stale JS-only persona when the proxy cannot be
    // synchronously verified. The async content script may apply later only
    // after background has re-established full network readiness.
    clearStoredPersona();
    return null;
  }

  function readProxyPersonaSynchronously(): { reachable: boolean; persona: Persona | null } {
    const base = readProxyBaseUrl();
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', `${base}/persona/current`, false);
      xhr.setRequestHeader('cache-control', 'no-store');
      xhr.send(null);
      if (xhr.status >= 200 && xhr.status < 300) {
        const payload = JSON.parse(xhr.responseText) as { persona?: Persona | null };
        return { reachable: true, persona: payload.persona ?? null };
      }
      return { reachable: false, persona: null };
    } catch {
      return { reachable: false, persona: null };
    }
  }

  function readProxyBaseUrl(): string {
    try {
      const value = window.sessionStorage?.getItem(PROXY_BASE_KEY);
      return value && /^http:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(value) ? value : DEFAULT_PROXY_BASE;
    } catch {
      return DEFAULT_PROXY_BASE;
    }
  }

  function writeStoredPersona(persona: Persona): void {
    try {
      window.sessionStorage?.setItem(PERSONA_KEY, JSON.stringify(persona));
    } catch {
      // Ignore storage failures.
    }
  }

  function clearStoredPersona(): void {
    try {
      window.sessionStorage?.removeItem(PERSONA_KEY);
    } catch {
      // Ignore storage failures.
    }
  }

  function primaryLocale(acceptLang: string): string {
    return acceptLang.split(',')[0]?.split(';')[0]?.trim() || 'en-US';
  }

  function languages(acceptLang: string): string[] {
    const parsed = acceptLang
      .split(',')
      .map((part) => part.split(';')[0]?.trim())
      .filter(Boolean) as string[];
    return parsed.length > 0 ? parsed : [primaryLocale(acceptLang)];
  }

  function timezoneOffset(persona: Persona): number {
    if (typeof persona.timezone_offset_minutes === 'number') return persona.timezone_offset_minutes;
    switch (persona.timezone) {
      case 'Europe/Amsterdam':
      case 'Europe/Berlin':
      case 'Europe/Paris':
      case 'Europe/Madrid':
      case 'Europe/Rome':
        return -120;
      case 'Europe/London':
        return -60;
      case 'America/New_York':
      case 'America/Toronto':
        return 240;
      case 'America/Chicago':
        return 300;
      case 'America/Denver':
        return 360;
      case 'America/Los_Angeles':
      case 'America/Vancouver':
        return 420;
      case 'Pacific/Honolulu':
        return 600;
      case 'Asia/Tokyo':
        return -540;
      case 'Asia/Kolkata':
        return -330;
      case 'Australia/Sydney':
      case 'Australia/Melbourne':
        return -600;
      default:
        return new Date().getTimezoneOffset();
    }
  }

  function applyNavigator(persona: Persona): void {
    const navProto = Navigator.prototype;
    const lang = primaryLocale(persona.accept_lang);
    const langList = languages(persona.accept_lang);

    safeDefine(navProto, 'language', { get: asNative(() => lang, 'get language') });
    safeDefine(navProto, 'languages', { get: asNative(() => langList.slice(), 'get languages') });
    safeDefine(navProto, 'userAgent', { get: asNative(() => persona.user_agent, 'get userAgent') });
    safeDefine(navProto, 'appVersion', { get: asNative(() => persona.user_agent.replace(/^Mozilla\//, ''), 'get appVersion') });
    safeDefine(navProto, 'platform', { get: asNative(() => persona.platform, 'get platform') });
    safeDefine(navProto, 'vendor', { get: asNative(() => persona.vendor ?? (persona.user_agent.includes('Chrome') ? 'Google Inc.' : ''), 'get vendor') });
    safeDefine(navProto, 'hardwareConcurrency', { get: asNative(() => persona.hardware_concurrency ?? 8, 'get hardwareConcurrency') });
    safeDefine(navProto, 'deviceMemory', { get: asNative(() => persona.device_memory ?? 8, 'get deviceMemory') });
    safeDefine(navProto, 'maxTouchPoints', { get: asNative(() => persona.max_touch_points ?? 0, 'get maxTouchPoints') });
    safeDefine(navProto, 'webdriver', { get: asNative(() => false, 'get webdriver') });
  }

  function applyScreen(persona: Persona): void {
    const screenProto = Screen.prototype;
    safeDefine(screenProto, 'width', { get: asNative(() => persona.screen_width, 'get width') });
    safeDefine(screenProto, 'height', { get: asNative(() => persona.screen_height, 'get height') });
    safeDefine(screenProto, 'availWidth', { get: asNative(() => persona.screen_width, 'get availWidth') });
    safeDefine(screenProto, 'availHeight', { get: asNative(() => Math.max(1, persona.screen_height - 40), 'get availHeight') });
    safeDefine(screenProto, 'colorDepth', { get: asNative(() => persona.color_depth, 'get colorDepth') });
    safeDefine(screenProto, 'pixelDepth', { get: asNative(() => persona.color_depth, 'get pixelDepth') });
  }

  function applyIntl(persona: Persona): void {
    const proto = Intl.DateTimeFormat.prototype;
    const original = Object.getOwnPropertyDescriptor(proto, 'resolvedOptions')?.value;
    if (typeof original !== 'function') return;

    const patched = function resolvedOptions(this: Intl.DateTimeFormat) {
      const options = original.call(this);
      return { ...options, timeZone: persona.timezone };
    };
    safeDefine(proto, 'resolvedOptions', {
      value: asNative(patched, 'resolvedOptions'),
      writable: true
    });
  }

  function applyDate(persona: Persona): void {
    const offset = timezoneOffset(persona);
    const patched = function getTimezoneOffset() {
      return offset;
    };
    safeDefine(Date.prototype, 'getTimezoneOffset', {
      value: asNative(patched, 'getTimezoneOffset'),
      writable: true
    });
  }


  function applyPlugins(): void {
    const makeArrayLike = (items: Array<Record<string, unknown>>) => {
      const arr = items.slice() as Array<Record<string, unknown>> & {
        item: (index: number) => Record<string, unknown> | null;
        namedItem: (name: string) => Record<string, unknown> | null;
        refresh?: () => void;
      };
      Object.defineProperty(arr, 'item', { value: (index: number) => arr[index] ?? null, enumerable: false });
      Object.defineProperty(arr, 'namedItem', {
        value: (name: string) => arr.find((item) => item.name === name || item.type === name) ?? null,
        enumerable: false
      });
      Object.defineProperty(arr, 'refresh', { value: () => undefined, enumerable: false });
      return Object.freeze(arr);
    };

    const pdfPlugin = Object.freeze({ name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' });
    const plugins = makeArrayLike([pdfPlugin]);
    const mimeTypes = makeArrayLike([
      Object.freeze({ type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format', enabledPlugin: pdfPlugin })
    ]);
    safeDefine(Navigator.prototype, 'plugins', { get: asNative(() => plugins, 'get plugins') });
    safeDefine(Navigator.prototype, 'mimeTypes', { get: asNative(() => mimeTypes, 'get mimeTypes') });
  }

  function applyCanvasNoise(persona: Persona): void {
    const seed = hashPersona(persona);
    const canvasProto = HTMLCanvasElement.prototype as any;
    const canvasToDataURL = canvasProto.toDataURL;
    const canvasToBlob = canvasProto.toBlob;
    const ctxProto = typeof CanvasRenderingContext2D !== 'undefined' ? CanvasRenderingContext2D.prototype as any : null;
    const getImageData = ctxProto?.getImageData;

    if (typeof getImageData === 'function') {
      safeDefine(ctxProto, 'getImageData', {
        value: asNative(function getImageDataPatched(this: CanvasRenderingContext2D, ...args: unknown[]) {
          const imageData = getImageData.apply(this, args);
          perturbPixels(imageData?.data, seed);
          return imageData;
        }, 'getImageData'),
        writable: true
      });
    }

    if (typeof canvasToDataURL === 'function') {
      safeDefine(canvasProto, 'toDataURL', {
        value: asNative(function toDataURLPatched(this: HTMLCanvasElement, ...args: unknown[]) {
          return withCanvasPerturbation(this, seed, () => canvasToDataURL.apply(this, args));
        }, 'toDataURL'),
        writable: true
      });
    }

    if (typeof canvasToBlob === 'function') {
      safeDefine(canvasProto, 'toBlob', {
        value: asNative(function toBlobPatched(this: HTMLCanvasElement, ...args: unknown[]) {
          return withCanvasPerturbation(this, seed, () => canvasToBlob.apply(this, args));
        }, 'toBlob'),
        writable: true
      });
    }
  }

  function applyWebGL(persona: Persona): void {
    const patch = (proto: any): void => {
      if (!proto || typeof proto.getParameter !== 'function') return;
      const original = proto.getParameter;
      safeDefine(proto, 'getParameter', {
        value: asNative(function getParameter(this: WebGLRenderingContext, parameter: number) {
          if (parameter === 0x1f00 || parameter === 0x9245) return persona.vendor ?? (persona.user_agent.includes('Chrome') ? 'Google Inc.' : '');
          if (parameter === 0x1f01 || parameter === 0x9246) return webglRenderer(persona);
          return original.call(this, parameter);
        }, 'getParameter'),
        writable: true
      });
    };
    patch(typeof WebGLRenderingContext !== 'undefined' ? WebGLRenderingContext.prototype : null);
    patch(typeof WebGL2RenderingContext !== 'undefined' ? WebGL2RenderingContext.prototype : null);
  }

  function applyAudioNoise(persona: Persona): void {
    if (typeof AudioBuffer === 'undefined') return;
    const proto = AudioBuffer.prototype as any;
    const original = proto.getChannelData;
    if (typeof original !== 'function') return;
    const seed = hashPersona(persona) % 97;
    safeDefine(proto, 'getChannelData', {
      value: asNative(function getChannelData(this: AudioBuffer, channel: number) {
        const data = original.call(this, channel);
        for (let i = seed; i < data.length; i += 997) data[i] += 1e-7;
        return data;
      }, 'getChannelData'),
      writable: true
    });
  }

  function withCanvasPerturbation<T>(canvas: HTMLCanvasElement, seed: number, fn: () => T): T {
    const ctx = canvas.getContext('2d');
    if (!ctx || canvas.width === 0 || canvas.height === 0) return fn();
    try {
      const x = seed % canvas.width;
      const y = Math.floor(seed / 7) % canvas.height;
      const pixel = ctx.getImageData(x, y, 1, 1);
      const original = new Uint8ClampedArray(pixel.data);
      pixel.data[0] = pixel.data[0] ^ 1;
      ctx.putImageData(pixel, x, y);
      const result = fn();
      pixel.data.set(original);
      ctx.putImageData(pixel, x, y);
      return result;
    } catch {
      return fn();
    }
  }

  function perturbPixels(data: Uint8ClampedArray | undefined, seed: number): void {
    if (!data || data.length < 4) return;
    for (let i = seed % 13; i < data.length; i += 401) data[i] = data[i] ^ 1;
  }

  function hashPersona(persona: Persona): number {
    const input = `${persona.id}|${persona.user_agent}|${persona.platform}|${persona.screen_width}x${persona.screen_height}`;
    let hash = 2166136261;
    for (let i = 0; i < input.length; i += 1) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function webglRenderer(persona: Persona): string {
    if (persona.platform.toLowerCase().includes('win')) return 'ANGLE (Intel, Intel(R) UHD Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)';
    if (persona.platform.toLowerCase().includes('mac')) return 'Apple GPU';
    return 'Mesa Intel(R) UHD Graphics 620 (KBL GT2)';
  }

  function applyPersona(persona: Persona): void {
    try {
      restoreOriginals();
      installFunctionToStringMask();
      activePersona = persona;
      applyNavigator(persona);
      applyPlugins();
      applyScreen(persona);
      applyIntl(persona);
      applyDate(persona);
      applyCanvasNoise(persona);
      applyWebGL(persona);
      applyAudioNoise(persona);
    } catch (error) {
      restoreOriginals();
      // INV-1: do not break the page. Keep error local to DevTools only.
      console.debug('[facadeproxy] persona apply failed', error);
    }
  }

  const synchronousPersona = loadSynchronousPersona();
  if (synchronousPersona) applyPersona(synchronousPersona);

  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window) return;
    const data = event.data as { source?: string; type?: string; persona?: Persona | null } | null;
    if (!data || data.source !== 'facadeproxy') return;

    if (data.type === 'APPLY_PERSONA' && data.persona) {
      applyPersona(data.persona);
    } else if (data.type === 'CLEAR_PERSONA') {
      restoreOriginals();
    }
  });

  try {
    Object.defineProperty(window, 'FacadeProxy', {
      configurable: true,
      enumerable: false,
      value: Object.freeze({
        version: '0.1.0',
        status: () => ({ activePersonaId: activePersona?.id ?? null }),
        restore: restoreOriginals
      }),
      writable: false
    });
  } catch {
    // Do not risk page breakage for a debug convenience API.
  }
})();
