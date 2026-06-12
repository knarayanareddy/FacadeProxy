//#region src/injected/injected.ts
(() => {
	const global = window;
	if (global.__facadeProxyInjected) return;
	global.__facadeProxyInjected = true;
	try {
		document.documentElement?.setAttribute("data-facadeproxy-main-ready", "1");
	} catch {}
	const saved = [];
	const maskedNativeSources = /* @__PURE__ */ new WeakMap();
	let activePersona = null;
	const PERSONA_KEY = "facadeproxy.activePersona";
	const PROXY_BASE_KEY = "facadeproxy.proxyBaseUrl";
	const DEFAULT_PROXY_BASE = "http://127.0.0.1:7878";
	function remember(target, property) {
		if (saved.some((entry) => entry.target === target && entry.property === property)) return;
		saved.push({
			target,
			property,
			descriptor: Object.getOwnPropertyDescriptor(target, property)
		});
	}
	function safeDefine(target, property, descriptor) {
		try {
			remember(target, property);
			Object.defineProperty(target, property, {
				configurable: true,
				...descriptor
			});
		} catch {}
	}
	function asNative(fn, label) {
		maskedNativeSources.set(fn, `function ${label}() { [native code] }`);
		return fn;
	}
	function installFunctionToStringMask() {
		const original = Function.prototype.toString;
		if (maskedNativeSources.has(original)) return;
		const patched = function toString() {
			return maskedNativeSources.get(this) ?? original.call(this);
		};
		asNative(patched, "toString");
		safeDefine(Function.prototype, "toString", {
			value: patched,
			writable: true
		});
	}
	function restoreOriginals() {
		for (let i = saved.length - 1; i >= 0; i -= 1) {
			const entry = saved[i];
			try {
				if (entry.descriptor) Object.defineProperty(entry.target, entry.property, entry.descriptor);
				else Reflect.deleteProperty(entry.target, entry.property);
			} catch {}
		}
		saved.length = 0;
		activePersona = null;
	}
	function loadSynchronousPersona() {
		const proxyPersona = readProxyPersonaSynchronously();
		if (proxyPersona.reachable) {
			if (proxyPersona.persona) {
				writeStoredPersona(proxyPersona.persona);
				return proxyPersona.persona;
			}
			clearStoredPersona();
			return null;
		}
		clearStoredPersona();
		return null;
	}
	function readProxyPersonaSynchronously() {
		const base = readProxyBaseUrl();
		try {
			const xhr = new XMLHttpRequest();
			xhr.open("GET", `${base}/persona/current`, false);
			xhr.setRequestHeader("cache-control", "no-store");
			xhr.send(null);
			if (xhr.status >= 200 && xhr.status < 300) return {
				reachable: true,
				persona: JSON.parse(xhr.responseText).persona ?? null
			};
			return {
				reachable: false,
				persona: null
			};
		} catch {
			return {
				reachable: false,
				persona: null
			};
		}
	}
	function readProxyBaseUrl() {
		try {
			const value = window.sessionStorage?.getItem(PROXY_BASE_KEY);
			return value && /^http:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(value) ? value : DEFAULT_PROXY_BASE;
		} catch {
			return DEFAULT_PROXY_BASE;
		}
	}
	function writeStoredPersona(persona) {
		try {
			window.sessionStorage?.setItem(PERSONA_KEY, JSON.stringify(persona));
		} catch {}
	}
	function clearStoredPersona() {
		try {
			window.sessionStorage?.removeItem(PERSONA_KEY);
		} catch {}
	}
	function primaryLocale(acceptLang) {
		return acceptLang.split(",")[0]?.split(";")[0]?.trim() || "en-US";
	}
	function languages(acceptLang) {
		const parsed = acceptLang.split(",").map((part) => part.split(";")[0]?.trim()).filter(Boolean);
		return parsed.length > 0 ? parsed : [primaryLocale(acceptLang)];
	}
	function timezoneOffset(persona) {
		if (typeof persona.timezone_offset_minutes === "number") return persona.timezone_offset_minutes;
		switch (persona.timezone) {
			case "Europe/Amsterdam":
			case "Europe/Berlin":
			case "Europe/Paris":
			case "Europe/Madrid":
			case "Europe/Rome": return -120;
			case "Europe/London": return -60;
			case "America/New_York":
			case "America/Toronto": return 240;
			case "America/Chicago": return 300;
			case "America/Denver": return 360;
			case "America/Los_Angeles":
			case "America/Vancouver": return 420;
			case "Pacific/Honolulu": return 600;
			case "Asia/Tokyo": return -540;
			case "Asia/Kolkata": return -330;
			case "Australia/Sydney":
			case "Australia/Melbourne": return -600;
			default: return (/* @__PURE__ */ new Date()).getTimezoneOffset();
		}
	}
	function applyNavigator(persona) {
		const navProto = Navigator.prototype;
		const lang = primaryLocale(persona.accept_lang);
		const langList = languages(persona.accept_lang);
		safeDefine(navProto, "language", { get: asNative(() => lang, "get language") });
		safeDefine(navProto, "languages", { get: asNative(() => langList.slice(), "get languages") });
		safeDefine(navProto, "userAgent", { get: asNative(() => persona.user_agent, "get userAgent") });
		safeDefine(navProto, "appVersion", { get: asNative(() => persona.user_agent.replace(/^Mozilla\//, ""), "get appVersion") });
		safeDefine(navProto, "platform", { get: asNative(() => persona.platform, "get platform") });
		safeDefine(navProto, "vendor", { get: asNative(() => persona.vendor ?? (persona.user_agent.includes("Chrome") ? "Google Inc." : ""), "get vendor") });
		safeDefine(navProto, "hardwareConcurrency", { get: asNative(() => persona.hardware_concurrency ?? 8, "get hardwareConcurrency") });
		safeDefine(navProto, "deviceMemory", { get: asNative(() => persona.device_memory ?? 8, "get deviceMemory") });
		safeDefine(navProto, "maxTouchPoints", { get: asNative(() => persona.max_touch_points ?? 0, "get maxTouchPoints") });
		safeDefine(navProto, "webdriver", { get: asNative(() => false, "get webdriver") });
	}
	function applyScreen(persona) {
		const screenProto = Screen.prototype;
		safeDefine(screenProto, "width", { get: asNative(() => persona.screen_width, "get width") });
		safeDefine(screenProto, "height", { get: asNative(() => persona.screen_height, "get height") });
		safeDefine(screenProto, "availWidth", { get: asNative(() => persona.screen_width, "get availWidth") });
		safeDefine(screenProto, "availHeight", { get: asNative(() => Math.max(1, persona.screen_height - 40), "get availHeight") });
		safeDefine(screenProto, "colorDepth", { get: asNative(() => persona.color_depth, "get colorDepth") });
		safeDefine(screenProto, "pixelDepth", { get: asNative(() => persona.color_depth, "get pixelDepth") });
	}
	function applyIntl(persona) {
		const proto = Intl.DateTimeFormat.prototype;
		const original = Object.getOwnPropertyDescriptor(proto, "resolvedOptions")?.value;
		if (typeof original !== "function") return;
		safeDefine(proto, "resolvedOptions", {
			value: asNative(function resolvedOptions() {
				return {
					...original.call(this),
					timeZone: persona.timezone
				};
			}, "resolvedOptions"),
			writable: true
		});
	}
	function applyDate(persona) {
		const offset = timezoneOffset(persona);
		safeDefine(Date.prototype, "getTimezoneOffset", {
			value: asNative(function getTimezoneOffset() {
				return offset;
			}, "getTimezoneOffset"),
			writable: true
		});
	}
	function applyPlugins() {
		const makeArrayLike = (items) => {
			const arr = items.slice();
			Object.defineProperty(arr, "item", {
				value: (index) => arr[index] ?? null,
				enumerable: false
			});
			Object.defineProperty(arr, "namedItem", {
				value: (name) => arr.find((item) => item.name === name || item.type === name) ?? null,
				enumerable: false
			});
			Object.defineProperty(arr, "refresh", {
				value: () => void 0,
				enumerable: false
			});
			return Object.freeze(arr);
		};
		const pdfPlugin = Object.freeze({
			name: "PDF Viewer",
			filename: "internal-pdf-viewer",
			description: "Portable Document Format"
		});
		const plugins = makeArrayLike([pdfPlugin]);
		const mimeTypes = makeArrayLike([Object.freeze({
			type: "application/pdf",
			suffixes: "pdf",
			description: "Portable Document Format",
			enabledPlugin: pdfPlugin
		})]);
		safeDefine(Navigator.prototype, "plugins", { get: asNative(() => plugins, "get plugins") });
		safeDefine(Navigator.prototype, "mimeTypes", { get: asNative(() => mimeTypes, "get mimeTypes") });
	}
	function applyCanvasNoise(persona) {
		const seed = hashPersona(persona);
		const canvasProto = HTMLCanvasElement.prototype;
		const canvasToDataURL = canvasProto.toDataURL;
		const canvasToBlob = canvasProto.toBlob;
		const ctxProto = typeof CanvasRenderingContext2D !== "undefined" ? CanvasRenderingContext2D.prototype : null;
		const getImageData = ctxProto?.getImageData;
		if (typeof getImageData === "function") safeDefine(ctxProto, "getImageData", {
			value: asNative(function getImageDataPatched(...args) {
				const imageData = getImageData.apply(this, args);
				perturbPixels(imageData?.data, seed);
				return imageData;
			}, "getImageData"),
			writable: true
		});
		if (typeof canvasToDataURL === "function") safeDefine(canvasProto, "toDataURL", {
			value: asNative(function toDataURLPatched(...args) {
				return withCanvasPerturbation(this, seed, () => canvasToDataURL.apply(this, args));
			}, "toDataURL"),
			writable: true
		});
		if (typeof canvasToBlob === "function") safeDefine(canvasProto, "toBlob", {
			value: asNative(function toBlobPatched(...args) {
				return withCanvasPerturbation(this, seed, () => canvasToBlob.apply(this, args));
			}, "toBlob"),
			writable: true
		});
	}
	function applyWebGL(persona) {
		const patch = (proto) => {
			if (!proto || typeof proto.getParameter !== "function") return;
			const original = proto.getParameter;
			safeDefine(proto, "getParameter", {
				value: asNative(function getParameter(parameter) {
					if (parameter === 7936 || parameter === 37445) return persona.vendor ?? (persona.user_agent.includes("Chrome") ? "Google Inc." : "");
					if (parameter === 7937 || parameter === 37446) return webglRenderer(persona);
					return original.call(this, parameter);
				}, "getParameter"),
				writable: true
			});
		};
		patch(typeof WebGLRenderingContext !== "undefined" ? WebGLRenderingContext.prototype : null);
		patch(typeof WebGL2RenderingContext !== "undefined" ? WebGL2RenderingContext.prototype : null);
	}
	function applyAudioNoise(persona) {
		if (typeof AudioBuffer === "undefined") return;
		const proto = AudioBuffer.prototype;
		const original = proto.getChannelData;
		if (typeof original !== "function") return;
		const seed = hashPersona(persona) % 97;
		safeDefine(proto, "getChannelData", {
			value: asNative(function getChannelData(channel) {
				const data = original.call(this, channel);
				for (let i = seed; i < data.length; i += 997) data[i] += 1e-7;
				return data;
			}, "getChannelData"),
			writable: true
		});
	}
	function withCanvasPerturbation(canvas, seed, fn) {
		const ctx = canvas.getContext("2d");
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
	function perturbPixels(data, seed) {
		if (!data || data.length < 4) return;
		for (let i = seed % 13; i < data.length; i += 401) data[i] = data[i] ^ 1;
	}
	function hashPersona(persona) {
		const input = `${persona.id}|${persona.user_agent}|${persona.platform}|${persona.screen_width}x${persona.screen_height}`;
		let hash = 2166136261;
		for (let i = 0; i < input.length; i += 1) {
			hash ^= input.charCodeAt(i);
			hash = Math.imul(hash, 16777619);
		}
		return hash >>> 0;
	}
	function webglRenderer(persona) {
		if (persona.platform.toLowerCase().includes("win")) return "ANGLE (Intel, Intel(R) UHD Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)";
		if (persona.platform.toLowerCase().includes("mac")) return "Apple GPU";
		return "Mesa Intel(R) UHD Graphics 620 (KBL GT2)";
	}
	function applyPersona(persona) {
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
			console.debug("[facadeproxy] persona apply failed", error);
		}
	}
	const synchronousPersona = loadSynchronousPersona();
	if (synchronousPersona) applyPersona(synchronousPersona);
	window.addEventListener("message", (event) => {
		if (event.source !== window) return;
		const data = event.data;
		if (!data || data.source !== "facadeproxy") return;
		if (data.type === "APPLY_PERSONA" && data.persona) applyPersona(data.persona);
		else if (data.type === "CLEAR_PERSONA") restoreOriginals();
	});
	try {
		Object.defineProperty(window, "FacadeProxy", {
			configurable: true,
			enumerable: false,
			value: Object.freeze({
				version: "0.1.0",
				status: () => ({ activePersonaId: activePersona?.id ?? null }),
				restore: restoreOriginals
			}),
			writable: false
		});
	} catch {}
})();
//#endregion

//# sourceMappingURL=injected.js.map