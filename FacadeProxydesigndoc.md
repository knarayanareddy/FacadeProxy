🎭 FACADEPROXY
Comprehensive Engineering Design Document
Version 1.0 | Browser-Side Identity Obfuscation Extension + Local Mutation Proxy
TABLE OF CONTENTS

    Project Overview & Vision
    Goals, Non-Goals & Constraints
    System Architecture
    Module Breakdown
        4.1 Browser Extension Core (Manifest V3)
        4.2 Fingerprint Spoofing Engine
        4.3 Behavioral Noise Simulator
        4.4 Geolocation Rotation Module
        4.5 Interest Profile Poisoner
        4.6 Local Rust Proxy (Header & Cookie Mutation)
        4.7 Popup UI & Stats Dashboard
        4.8 Background Coordinator & Alarm Scheduler
    Data Models & Schemas
    API Specifications
    Directory Structure
    Configuration System
    Certificate & TLS Proxy Considerations
    Fingerprint Spoofing Deep Dive
    Behavioral Noise Deep Dive
    Geolocation Poisoning Deep Dive
    Interest Profile Poisoning Deep Dive
    Rust Proxy Deep Dive
    Execution World Strategy (MAIN vs ISOLATED)
    Privacy & Ethical Boundary Module
    Security Model & Threat Boundaries
    Storage & Persistence
    Logging, Observability & Debugging
    Testing Strategy
    Build, Packaging & Installation
    Platform Support Matrix
    Performance Targets & Benchmarks
    Error Handling Strategy
    Dependency Registry
    Milestone & Phased Rollout Plan
    Open Questions & Future Work

1. Project Overview & Vision
1.1 What is FacadeProxy?

FacadeProxy is a user-owned, local-first identity obfuscation system composed of two cooperating layers:

    A Manifest V3 browser extension that injects noise into browser-exposed fingerprinting surfaces, simulates synthetic behavioral signals, rotates geolocation data, and generates contradictory interest-browsing activity.

    A local Rust proxy (running on 127.0.0.1) that mutates outbound HTTP request headers and poisons known tracking cookies before they reach upstream servers.

Together, these two layers attack the modeling layer of tracking infrastructure. Rather than blocking trackers (which is detectable and results in degraded site functionality), FacadeProxy contaminates the signal quality of behavioral profiles, fingerprint databases, and interest graphs — making them progressively less accurate and less useful.

FacadeProxy runs entirely on the user's machine. No cloud service is involved. No data leaves the device.
1.2 The Problem Being Solved

Modern tracking infrastructure operates by building persistent models of individual users across sessions, devices, and domains. These models rely on several signal categories:

    Browser fingerprints: Canvas rendering, WebGL vendor/renderer, audio processing artifacts, navigator properties, screen dimensions, font enumeration — all combined to produce a stable pseudo-identity.
    Behavioral telemetry: Mouse movement patterns, scroll velocity, dwell time, typing cadence — used by fraud detection and behavioral analytics platforms.
    Geolocation data: JavaScript-exposed coordinates used for geo-targeting, profile enrichment, and session correlation.
    Interest graphs: Inferred from browsing history, used by advertising platforms to serve targeted content and to build long-term user models.
    Network-layer signals: HTTP headers (User-Agent, Accept-Language, Referer, cookie values) used for cross-request identity linkage.

The conventional response to this ecosystem — blocking — has significant drawbacks:

    Blocklists are reactive and lag behind new tracker domains
    Blocking is detectable and often triggers paywalls, CAPTCHAs, or broken functionality
    It does not address first-party tracking or inlined scripts
    Fingerprinting operates entirely in-page and is unaffected by network-layer blocks

FacadeProxy takes a different approach: obfuscate and contaminate rather than block. By injecting carefully calibrated noise across all signal layers simultaneously, it reduces the reliability of tracking models without causing the UX breakage associated with outright blocking.
1.3 Design Philosophy
Principle	Description
Obfuscation over blocking	Inject noise that degrades model quality. Do not simply block — remain invisible to anti-adblock detectors.
Coherent personas	Noise must be internally consistent within a session. Random incoherence is itself a fingerprint.
Layered coverage	Attack fingerprint, behavior, geo, interest, and network layers simultaneously. Single-layer obfuscation is insufficient.
Local-first	All logic runs on the user's machine. No routing through external services, no telemetry.
MAIN world injection	Fingerprint spoofing must execute in the page's JavaScript context (MAIN world) to be visible to tracking scripts.
Non-destructive	Noise should not break site functionality, corrupt form submissions, trigger fraud alerts, or harm third-party systems.
Transparent	All active obfuscation is logged locally and visible in the popup UI.
2. Goals, Non-Goals & Constraints
2.1 Goals (In Scope)

    Browser extension with Manifest V3 compliance
    Canvas, WebGL, and Audio fingerprint surface spoofing
    Navigator property overrides (platform, hardwareConcurrency, deviceMemory, language)
    Screen dimension noise injection
    Synthetic mouse, scroll, and keyboard behavioral noise
    JavaScript geolocation API rotation (configurable city pool + jitter)
    Background interest-category page visits for profile poisoning
    Local Rust HTTP proxy for header mutation and cookie poisoning
    Tracking query parameter stripping (UTM, fbclid, gclid, etc.)
    Popup UI with live stats counters and enable/disable toggle
    Per-session persona generation (consistent noise within session)
    Chrome and Firefox support
    Configuration persistence via chrome.storage.local

2.2 Non-Goals (Explicitly Out of Scope)

    ❌ Network-level tracker blocking (use uBlock Origin for that)
    ❌ HTTPS TLS interception at the proxy layer (see Section 9)
    ❌ Autonomous form submission or account interaction
    ❌ CAPTCHA solving
    ❌ Retaliating against tracking infrastructure (DDoS, resource exhaustion)
    ❌ Cloud sync, remote telemetry, or account registration of any kind
    ❌ Acting as a VPN or traffic anonymizer
    ❌ Breaking site authentication, payment flows, or first-party cookies
    ❌ Overriding isTrusted on synthetic DOM events (not possible by design)
    ❌ Intercepting traffic from apps other than the browser

2.3 Constraints

    Must comply with Chrome's Manifest V3 (service_worker, declarativeNetRequest, no persistent background pages)
    Fingerprint spoofing must operate in the MAIN execution world to be visible to page scripts
    Proxy must bind exclusively to 127.0.0.1 (loopback only — never expose to network)
    Extension must gracefully degrade if the local proxy is not running
    Behavioral noise events must not target form inputs, checkout flows, authentication fields, or content-editable areas within sensitive contexts
    Per-session persona must be deterministic from a seed so it remains consistent across the session
    Interest poisoning visits must use inactive background tabs and close automatically

3. System Architecture
3.1 High-Level Architecture Diagram

text

┌──────────────────────────────────────────────────────────────────────┐
│                          USER'S MACHINE                              │
│                                                                      │
│  ┌───────────────┐    ┌──────────────────────────────────────────┐   │
│  │               │    │        FACADEPROXY EXTENSION             │   │
│  │    Browser    │    │                                          │   │
│  │  (Chrome /    │    │  ┌──────────────┐  ┌──────────────────┐ │   │
│  │   Firefox)    │◄──►│  │  Content     │  │  Background      │ │   │
│  │               │    │  │  Script      │  │  Service Worker  │ │   │
│  │  Every Page   │    │  │  (MAIN world)│  │  (MV3)           │ │   │
│  │               │    │  └──────┬───────┘  └────────┬─────────┘ │   │
│  └───────┬───────┘    │         │                   │           │   │
│          │            │  ┌──────▼───────────────────▼─────────┐ │   │
│          │            │  │           Module Bus                │ │   │
│          │            │  │  (chrome.runtime.sendMessage)       │ │   │
│          │            │  └──┬──────┬──────┬──────┬────────────┘ │   │
│          │            │     │      │      │      │              │   │
│          │            │  ┌──▼──┐ ┌─▼──┐ ┌▼───┐ ┌▼──────────┐  │   │
│          │            │  │Fngr │ │Bhvr│ │Geo │ │Interest   │  │   │
│          │            │  │Spoof│ │Nois│ │Rotr│ │Poisoner   │  │   │
│          │            │  └─────┘ └────┘ └────┘ └───────────┘  │   │
│          │            └──────────────────────────────────────── ┘   │
│          │                                                           │
│          │ (if proxy configured)                                     │
│          ▼                                                           │
│  ┌───────────────────────────────────────┐                          │
│  │     LOCAL RUST PROXY (127.0.0.1:8888) │                          │
│  │                                       │                          │
│  │  ┌──────────────┐  ┌───────────────┐  │                          │
│  │  │ Header       │  │ Cookie        │  │                          │
│  │  │ Mutator      │  │ Poisoner      │  │                          │
│  │  └──────────────┘  └───────────────┘  │                          │
│  │  ┌──────────────┐  ┌───────────────┐  │                          │
│  │  │ UA / Lang    │  │ Tracking      │  │                          │
│  │  │ Rotator      │  │ Param Stripper│  │                          │
│  │  └──────────────┘  └───────────────┘  │                          │
│  └───────────────────┬───────────────────┘                          │
│                      │                                               │
└──────────────────────┼───────────────────────────────────────────────┘
                       │
                ┌──────▼──────┐
                │  INTERNET   │
                └─────────────┘

3.2 Traffic Flow (Step by Step)

text

Step 1:  User navigates to a page. Browser loads extension content script.

Step 2:  Content script (MAIN world) executes at document_start, before
         any page scripts run.

Step 3:  FingerprintSpoofer wraps Canvas, WebGL, Audio, navigator, and
         screen prototype methods with noise-injecting shims.

Step 4:  When page scripts call fingerprint APIs, they receive spoofed
         values consistent with the current session persona seed.

Step 5:  BehaviorSimulator starts timers: dispatches synthetic
         mousemove, scroll, and (safe) typing events at random intervals.

Step 6:  GeolocationRotator overrides navigator.geolocation.getCurrentPosition
         and watchPosition to return rotated coordinates from the city pool.

Step 7:  Background service worker fires hourly chrome.alarms event.

Step 8:  InterestPoisoner opens background tabs to a shuffled subset of
         interest-category URLs, waits ~5 seconds, closes them.

Step 9:  If local Rust proxy is running and browser is configured to use it,
         outbound HTTP requests pass through 127.0.0.1:8888.

Step 10: Rust proxy applies: UA rotation, Accept-Language rotation,
         tracking header stripping, cookie value corruption.

Step 11: Mutated request sent to upstream server.

Step 12: Stats counters incremented in chrome.storage.local.

Step 13: Popup UI reads stats and renders current session state.

3.3 Component Ownership
Component	Language	Owns
Extension Core	TypeScript + MV3	Manifest, lifecycle, permissions
Content Script	TypeScript (MAIN world)	In-page API spoofing
Background Worker	TypeScript (Service Worker)	Alarms, messaging, stats
Fingerprint Spoofer	TypeScript	Canvas/WebGL/Audio/Navigator/Screen hooks
Behavior Simulator	TypeScript	Synthetic event dispatch
Geo Rotator	TypeScript	navigator.geolocation override
Interest Poisoner	TypeScript	Background tab lifecycle
Local Proxy	Rust (Hyper)	HTTP header/cookie mutation
Popup UI	HTML + CSS + TypeScript	Stats display, toggle
Storage	chrome.storage.local	Persona seed, stats, config
4. Module Breakdown
4.1 Browser Extension Core (Manifest V3)
Purpose

The extension core defines the permission surface, injection strategy, and service worker lifecycle. It is the entry point that bootstraps all other modules and connects them to the browser's extension runtime.
Manifest Structure

JSON

// extension/manifest.json
{
  "manifest_version": 3,
  "name": "FacadeProxy",
  "version": "1.0.0",
  "description": "Browser identity obfuscation via fingerprint spoofing, behavioral noise, and geolocation rotation.",
  "permissions": [
    "scripting",
    "storage",
    "alarms",
    "tabs",
    "activeTab",
    "declarativeNetRequest",
    "webRequest",
    "proxy"
  ],
  "host_permissions": [
    "<all_urls>"
  ],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content/injector.js"],
      "run_at": "document_start",
      "all_frames": true,
      "world": "ISOLATED"
    }
  ],
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "web_accessible_resources": [
    {
      "resources": ["content/main_world_injector.js"],
      "matches": ["<all_urls>"]
    }
  ]
}

Critical Design Note: Two-Script Injection Strategy

Because Manifest V3 content scripts run in an ISOLATED world by default (see Section 15 for full treatment), FacadeProxy uses a two-script strategy:

    content/injector.js — runs in ISOLATED world at document_start. Its sole job is to inject main_world_injector.js into the page's MAIN world using chrome.scripting.executeScript with world: "MAIN".
    content/main_world_injector.js — the actual spoofing code. Runs in MAIN world. Has access to page-visible prototype chains.

TypeScript

// extension/content/injector.ts
// Runs in ISOLATED world — only purpose is to bootstrap MAIN world injection

(async () => {
  const isEnabled = await chrome.storage.local.get('enabled');
  if (isEnabled?.enabled === false) return;

  // Inject the main world spoofer via scripting API
  await chrome.scripting.executeScript({
    target: { tabId: chrome.devtools?.inspectedWindow?.tabId ?? 0 },
    files: ['content/main_world_injector.js'],
    world: 'MAIN',
    injectImmediately: true,
  });
})();

    Important: For static content script declarations, world defaults to ISOLATED. The MAIN world injection must be done programmatically via chrome.scripting.executeScript with explicit world: "MAIN" or via a <script> tag injected into the DOM (see Section 15).

Lifecycle Hooks
Hook	World	Responsibility
document_start (content script)	ISOLATED	Bootstrap MAIN world injection
document_start (MAIN injector)	MAIN	Install all prototype shims before page scripts run
chrome.runtime.onInstalled	Service Worker	Initialize storage defaults, generate first persona seed
chrome.alarms.onAlarm	Service Worker	Trigger interest poisoning cycle
chrome.storage.onChanged	Service Worker	React to enable/disable toggle from popup
chrome.tabs.onRemoved	Service Worker	Clean up per-tab state
4.2 Fingerprint Spoofing Engine
Purpose

The Fingerprint Spoofing Engine intercepts browser API calls that fingerprinting scripts use to derive a stable device identity. It wraps the relevant prototype methods with noise-injecting shims that return deterministically-perturbed values consistent with the current session persona.
Fingerprint Surfaces Targeted
Surface	API	Spoofing Strategy
Canvas 2D	HTMLCanvasElement.prototype.toDataURL, CanvasRenderingContext2D.prototype.getImageData	Add per-pixel noise within human imperceptible threshold
Canvas getContext	HTMLCanvasElement.prototype.getContext	Wrap returned context object
WebGL Vendor	WebGLRenderingContext.prototype.getParameter(37445)	Return fake vendor string from persona
WebGL Renderer	WebGLRenderingContext.prototype.getParameter(37446)	Return fake renderer string from persona
WebGL2	WebGL2RenderingContext.prototype.getParameter	Same as WebGL1
Audio	AudioContext.prototype.createOscillator, AnalyserNode.prototype.getFloatFrequencyData	Perturb float values by noise delta
Navigator Platform	navigator.platform	Override via Object.defineProperty
Navigator Concurrency	navigator.hardwareConcurrency	Return persona value (2/4/8)
Navigator Memory	navigator.deviceMemory	Return persona value (2/4/8)
Navigator Language	navigator.language, navigator.languages	Return persona locale array
Screen Dimensions	screen.width, screen.height, screen.availWidth, screen.availHeight, screen.colorDepth	Offset by per-session delta
Implementation

TypeScript

// extension/content/main_world_injector.ts
// RUNS IN MAIN WORLD — has access to page prototype chains

import { PersonaSeed, generatePersona, Persona } from '../core/persona';

declare const __FACADE_SEED__: string; // injected by service worker at injection time

const persona: Persona = generatePersona(__FACADE_SEED__);

class FingerprintSpoofer {
  private persona: Persona;

  constructor(p: Persona) {
    this.persona = p;
    this.hookCanvas();
    this.hookWebGL();
    this.hookAudio();
    this.hookNavigator();
    this.hookScreen();
  }

  // ── Canvas ─────────────────────────────────────────────────────────

  private hookCanvas(): void {
    const self = this;

    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(
      contextType: string,
      ...args: any[]
    ): RenderingContext | null {
      const ctx = originalGetContext.apply(this, [contextType, ...args]);
      if (!ctx) return null;

      if (contextType === '2d') {
        self.wrapCanvasContext2D(ctx as CanvasRenderingContext2D);
      }
      return ctx;
    };

    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function(...args: any[]): string {
      const ctx = this.getContext('2d');
      if (ctx) self.addCanvasNoise(ctx as CanvasRenderingContext2D, this);
      return originalToDataURL.apply(this, args);
    };
  }

  private wrapCanvasContext2D(ctx: CanvasRenderingContext2D): void {
    const self = this;
    const originalGetImageData = ctx.getImageData.bind(ctx);

    ctx.getImageData = function(sx: number, sy: number, sw: number, sh: number): ImageData {
      const imageData = originalGetImageData(sx, sy, sw, sh);
      self.perturbImageData(imageData);
      return imageData;
    };
  }

  private perturbImageData(imageData: ImageData): void {
    const data = imageData.data;
    const noiseLevel = this.persona.canvasNoise; // 1-3 per channel, imperceptible
    for (let i = 0; i < data.length; i += 4) {
      // Perturb R, G, B channels only (leave Alpha intact)
      data[i]     = this.clamp(data[i]     + this.noiseDelta(noiseLevel));
      data[i + 1] = this.clamp(data[i + 1] + this.noiseDelta(noiseLevel));
      data[i + 2] = this.clamp(data[i + 2] + this.noiseDelta(noiseLevel));
    }
  }

  private addCanvasNoise(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    this.perturbImageData(imageData);
    ctx.putImageData(imageData, 0, 0);
  }

  // ── WebGL ──────────────────────────────────────────────────────────

  private hookWebGL(): void {
    const self = this;
    const UNMASKED_VENDOR_WEBGL   = 37445;
    const UNMASKED_RENDERER_WEBGL = 37446;

    const patchGetParameter = (proto: WebGLRenderingContext | WebGL2RenderingContext) => {
      const original = proto.getParameter.bind(proto);
      proto.getParameter = function(pname: number): any {
        if (pname === UNMASKED_VENDOR_WEBGL)   return self.persona.webglVendor;
        if (pname === UNMASKED_RENDERER_WEBGL) return self.persona.webglRenderer;
        return original(pname);
      };
    };

    patchGetParameter(WebGLRenderingContext.prototype);
    if (typeof WebGL2RenderingContext !== 'undefined') {
      patchGetParameter(WebGL2RenderingContext.prototype);
    }
  }

  // ── Audio ──────────────────────────────────────────────────────────

  private hookAudio(): void {
    const self = this;

    const originalCreateOscillator = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function(): OscillatorNode {
      const node = originalCreateOscillator.apply(this);
      const originalGetFloatFrequencyData = node.context.createAnalyser().getFloatFrequencyData;
      // Wrap getFloatFrequencyData to add small float noise
      return node;
    };

    // Wrap OfflineAudioContext as well (common fingerprint path)
    if (typeof OfflineAudioContext !== 'undefined') {
      const originalStart = OfflineAudioContext.prototype.startRendering;
      OfflineAudioContext.prototype.startRendering = function(): Promise<AudioBuffer> {
        return originalStart.apply(this).then((buffer: AudioBuffer) => {
          self.perturbAudioBuffer(buffer);
          return buffer;
        });
      };
    }
  }

  private perturbAudioBuffer(buffer: AudioBuffer): void {
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < data.length; i++) {
        data[i] += this.persona.audioNoiseDelta * (Math.random() - 0.5) * 2;
      }
    }
  }

  // ── Navigator ──────────────────────────────────────────────────────

  private hookNavigator(): void {
    const p = this.persona;

    const override = (prop: string, value: any) => {
      try {
        Object.defineProperty(navigator, prop, {
          get: () => value,
          configurable: true,
        });
      } catch (e) {
        // Some properties may be non-configurable on certain browsers
        console.debug(`[FacadeProxy] Could not override navigator.${prop}`);
      }
    };

    override('platform',             p.platform);
    override('hardwareConcurrency',  p.hardwareConcurrency);
    override('deviceMemory',         p.deviceMemory);
    override('language',             p.language);
    override('languages',            Object.freeze([...p.languages]));
  }

  // ── Screen ─────────────────────────────────────────────────────────

  private hookScreen(): void {
    const p = this.persona;
    const override = (prop: string, value: number) => {
      try {
        Object.defineProperty(screen, prop, { get: () => value, configurable: true });
      } catch (e) {
        console.debug(`[FacadeProxy] Could not override screen.${prop}`);
      }
    };

    override('width',       p.screenWidth);
    override('height',      p.screenHeight);
    override('availWidth',  p.screenWidth  - p.screenAvailDelta);
    override('availHeight', p.screenHeight - p.screenAvailDelta - 40); // taskbar approx
    override('colorDepth',  p.colorDepth);
  }

  // ── Helpers ────────────────────────────────────────────────────────

  private noiseDelta(range: number): number {
    return Math.floor(Math.random() * (range * 2 + 1)) - range;
  }

  private clamp(v: number): number {
    return Math.max(0, Math.min(255, v));
  }
}

// Instantiate immediately before any page script runs
new FingerprintSpoofer(persona);

4.3 Behavioral Noise Simulator
Purpose

The Behavioral Noise Simulator dispatches synthetic DOM events that introduce noise into behavioral analytics pipelines. These events are designed to make per-user behavioral models less accurate by injecting signals that don't correspond to real user intent.
Noise Channels
Channel	Event Type	Target	Frequency	Notes
Mouse	mousemove, mouseenter	Random DOM element	Every 1–4s	Random screen coordinates
Scroll	scroll (window)	window	Every 2–10s	Small random delta
Typing	input, keydown, keyup	Safe text inputs only	Every 30s	Restores original value
Safety Constraints for Behavioral Noise

The typing channel carries the highest risk of user-visible side effects. The following safeguards are mandatory:

    Never target inputs of type: password, email, tel, number, search, file, submit, button
    Never target inputs with autocomplete attributes: cc-number, cc-exp, cc-csc, new-password, current-password
    Never target elements within <form> elements that have action attributes pointing to checkout, payment, or auth endpoints
    Always restore the original input value immediately after the synthetic event
    Suppress if the document's activeElement is a form input (user is actively typing)

Implementation

TypeScript

// extension/content/behavior_simulator.ts

interface BehaviorConfig {
  mouseIntervalMin:  number; // ms
  mouseIntervalMax:  number; // ms
  scrollIntervalMin: number; // ms
  scrollIntervalMax: number; // ms
  typeIntervalMs:    number; // ms
  enabled:           boolean;
}

const SAFE_INPUT_TYPES = new Set(['text', 'textarea', 'search']);

const UNSAFE_AUTOCOMPLETE = new Set([
  'cc-number', 'cc-exp', 'cc-csc', 'cc-name',
  'new-password', 'current-password', 'one-time-code',
]);

class BehaviorSimulator {
  private timers: number[] = [];
  private config: BehaviorConfig;

  constructor(config: BehaviorConfig) {
    this.config = config;
  }

  start(): void {
    if (!this.config.enabled) return;
    this.scheduleMouse();
    this.scheduleScroll();
    this.scheduleTyping();
  }

  stop(): void {
    this.timers.forEach(id => clearTimeout(id));
    this.timers = [];
  }

  // ── Mouse ──────────────────────────────────────────────────────────

  private scheduleMouse(): void {
    const fire = () => {
      this.emitMouseNoise();
      const delay = this.randomBetween(
        this.config.mouseIntervalMin,
        this.config.mouseIntervalMax
      );
      this.timers.push(window.setTimeout(fire, delay));
    };
    this.timers.push(window.setTimeout(fire, this.randomBetween(500, 2000)));
  }

  private emitMouseNoise(): void {
    const target = this.pickRandomElement();
    if (!target) return;

    const x = Math.random() * window.innerWidth;
    const y = Math.random() * window.innerHeight;

    ['mousemove', 'mouseenter'].forEach(type => {
      target.dispatchEvent(new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        // Note: isTrusted will be false — this is a known limitation
        // Some analytics platforms filter on isTrusted
      }));
    });
  }

  // ── Scroll ─────────────────────────────────────────────────────────

  private scheduleScroll(): void {
    const fire = () => {
      window.scrollBy({
        top:      this.randomBetween(-80, 80),
        left:     0,
        behavior: 'smooth',
      });
      const delay = this.randomBetween(
        this.config.scrollIntervalMin,
        this.config.scrollIntervalMax
      );
      this.timers.push(window.setTimeout(fire, delay));
    };
    this.timers.push(window.setTimeout(fire, this.randomBetween(1000, 4000)));
  }

  // ── Typing ─────────────────────────────────────────────────────────

  private scheduleTyping(): void {
    const fire = () => {
      this.emitSafeTypingNoise();
      this.timers.push(window.setTimeout(fire, this.config.typeIntervalMs));
    };
    this.timers.push(window.setTimeout(fire, this.randomBetween(5000, 15000)));
  }

  private emitSafeTypingNoise(): void {
    // Do not fire if user is actively using an input
    if (document.activeElement?.tagName === 'INPUT'
      || document.activeElement?.tagName === 'TEXTAREA') {
      return;
    }

    const inputs = this.getSafeInputs();
    if (inputs.length === 0) return;

    const target = inputs[Math.floor(Math.random() * inputs.length)] as HTMLInputElement;
    const original = target.value;
    const noise    = this.randomChars(5);

    // Type noise
    target.value = original + noise;
    target.dispatchEvent(new Event('input', { bubbles: true }));

    // Immediately restore original value
    requestAnimationFrame(() => {
      target.value = original;
      target.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  private getSafeInputs(): Element[] {
    return Array.from(
      document.querySelectorAll('input, textarea')
    ).filter(el => {
      const input = el as HTMLInputElement;
      if (!SAFE_INPUT_TYPES.has(input.type || 'text')) return false;
      if (input.readOnly || input.disabled) return false;
      const ac = input.getAttribute('autocomplete') || '';
      if (UNSAFE_AUTOCOMPLETE.has(ac)) return false;
      // Skip if inside a payment/checkout/auth form
      const form = input.closest('form');
      if (form) {
        const action = form.getAttribute('action') || '';
        if (/checkout|payment|login|signin|auth|register/i.test(action)) return false;
      }
      return true;
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────

  private pickRandomElement(): Element | null {
    const all = document.querySelectorAll('div, p, span, section, article, header');
    if (all.length === 0) return document.body;
    return all[Math.floor(Math.random() * all.length)];
  }

  private randomBetween(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private randomChars(n: number): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    return Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }
}

export default BehaviorSimulator;

4.4 Geolocation Rotation Module
Purpose

The Geolocation Rotation Module replaces the browser's navigator.geolocation API with an implementation that returns coordinates from a rotating pool of cities, with per-call jitter to prevent exact-match correlation.
City Coordinate Pool

TypeScript

// extension/content/geo_rotator.ts

export interface GeoCoordinate {
  city:      string;
  latitude:  number;
  longitude: number;
  accuracy:  number;
}

export const DEFAULT_CITY_POOL: GeoCoordinate[] = [
  { city: 'London',      latitude:  51.5074,  longitude:  -0.1278, accuracy: 50 },
  { city: 'Paris',       latitude:  48.8566,  longitude:   2.3522, accuracy: 45 },
  { city: 'Tokyo',       latitude:  35.6762,  longitude: 139.6503, accuracy: 60 },
  { city: 'Sydney',      latitude: -33.8688,  longitude: 151.2093, accuracy: 55 },
  { city: 'São Paulo',   latitude: -23.5505,  longitude: -46.6333, accuracy: 65 },
  { city: 'Mexico City', latitude:  19.4326,  longitude: -99.1332, accuracy: 70 },
  { city: 'Moscow',      latitude:  55.7558,  longitude:  37.6176, accuracy: 50 },
  { city: 'Singapore',   latitude:   1.3521,  longitude: 103.8198, accuracy: 40 },
  { city: 'Lagos',       latitude:   6.5244,  longitude:   3.3792, accuracy: 80 },
  { city: 'Toronto',     latitude:  43.6532,  longitude: -79.3832, accuracy: 55 },
];

Implementation

TypeScript

// extension/content/geo_rotator.ts (continued)

class GeolocationRotator {
  private cityPool:     GeoCoordinate[];
  private currentIndex: number;
  private jitterDeg:    number = 0.02; // ~2km radius jitter

  constructor(pool: GeoCoordinate[], startIndex: number = 0) {
    this.cityPool     = pool;
    this.currentIndex = startIndex % pool.length;
  }

  install(): void {
    const self = this;

    const mockGeolocation = {
      getCurrentPosition(
        success: PositionCallback,
        error?: PositionErrorCallback | null,
        _options?: PositionOptions
      ): void {
        const coords = self.nextCoords();
        const position: GeolocationPosition = {
          coords: {
            latitude:         coords.latitude,
            longitude:        coords.longitude,
            accuracy:         coords.accuracy,
            altitude:         null,
            altitudeAccuracy: null,
            heading:          null,
            speed:            null,
            toJSON() { return this; },
          },
          timestamp: Date.now(),
          toJSON() { return this; },
        };
        setTimeout(() => success(position), 100 + Math.random() * 200); // realistic async delay
      },

      watchPosition(
        success: PositionCallback,
        error?: PositionErrorCallback | null,
        _options?: PositionOptions
      ): number {
        const id = window.setInterval(() => {
          const coords = self.nextCoords();
          const position: GeolocationPosition = {
            coords: {
              latitude:         coords.latitude,
              longitude:        coords.longitude,
              accuracy:         coords.accuracy,
              altitude:         null,
              altitudeAccuracy: null,
              heading:          null,
              speed:            null,
              toJSON() { return this; },
            },
            timestamp: Date.now(),
            toJSON() { return this; },
          };
          success(position);
        }, 3000);
        return id;
      },

      clearWatch(id: number): void {
        clearInterval(id);
      },
    };

    try {
      Object.defineProperty(navigator, 'geolocation', {
        get: () => mockGeolocation,
        configurable: true,
      });
    } catch (e) {
      console.debug('[FacadeProxy] Could not override navigator.geolocation');
    }
  }

  private nextCoords(): GeoCoordinate {
    const base = this.cityPool[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.cityPool.length;

    return {
      ...base,
      latitude:  base.latitude  + (Math.random() - 0.5) * this.jitterDeg,
      longitude: base.longitude + (Math.random() - 0.5) * this.jitterDeg,
    };
  }
}

export default GeolocationRotator;

4.5 Interest Profile Poisoner
Purpose

The Interest Profile Poisoner periodically opens background browser tabs to a curated list of interest-category URLs, leaves them open briefly, then closes them. The goal is to introduce contradictory browsing signals into interest graphs maintained by advertising platforms that track visited URLs across sessions.

This approach is philosophically similar to TrackMeNot (which sends randomized search queries) and AdNauseam (which generates background ad clicks) — both of which use signal obfuscation rather than blocking.
Interest Category Pool

TypeScript

// extension/background/interest_poisoner.ts

export const INTEREST_CATEGORIES: InterestTarget[] = [
  // News & Politics
  { url: 'https://www.nytimes.com/section/sports',       category: 'sports'      },
  { url: 'https://www.bbc.com/sport',                    category: 'sports'      },
  { url: 'https://www.espn.com/nfl/',                    category: 'nfl'         },
  // Fashion & Beauty
  { url: 'https://www.vogue.com/beauty',                 category: 'beauty'      },
  { url: 'https://www.elle.com/fashion/',                category: 'fashion'     },
  // Finance
  { url: 'https://www.bloomberg.com/markets',            category: 'finance'     },
  { url: 'https://finance.yahoo.com',                    category: 'finance'     },
  // Technology
  { url: 'https://www.wired.com/category/science/',      category: 'science'     },
  { url: 'https://techcrunch.com',                       category: 'tech'        },
  // Travel
  { url: 'https://www.nationalgeographic.com/travel/',   category: 'travel'      },
  { url: 'https://www.lonelyplanet.com',                 category: 'travel'      },
  // Health
  { url: 'https://www.webmd.com',                        category: 'health'      },
  // Food
  { url: 'https://www.foodnetwork.com',                  category: 'food'        },
  // Automotive
  { url: 'https://www.caranddriver.com',                 category: 'automotive'  },
  // Real Estate
  { url: 'https://www.zillow.com',                       category: 'real_estate' },
];

Implementation

TypeScript

// extension/background/interest_poisoner.ts (continued)

interface InterestTarget {
  url:      string;
  category: string;
}

interface PoisonCycleConfig {
  tabsPerCycle:    number; // How many categories to visit per cycle (default: 4)
  dwellTimeMs:     number; // How long to leave tab open (default: 5000ms)
  cycleIntervalMin: string; // chrome.alarms period (e.g. 'INTEREST_POISON_HOURLY')
}

class InterestPoisoner {
  private config: PoisonCycleConfig;
  private categories: InterestTarget[];

  constructor(config: PoisonCycleConfig, categories: InterestTarget[]) {
    this.config     = config;
    this.categories = categories;
  }

  registerAlarm(): void {
    chrome.alarms.create('INTEREST_POISON_CYCLE', {
      periodInMinutes: 60, // Run hourly
      delayInMinutes:  5,  // First run 5 minutes after install
    });

    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === 'INTEREST_POISON_CYCLE') {
        this.runCycle();
      }
    });
  }

  private async runCycle(): Promise<void> {
    const isEnabled = (await chrome.storage.local.get('enabled'))?.enabled;
    if (!isEnabled) return;

    // Shuffle and pick a subset
    const shuffled = [...this.categories].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, this.config.tabsPerCycle);

    for (const target of selected) {
      await this.visitAndClose(target);
      // Wait between visits to avoid suspicious burst
      await this.sleep(1000 + Math.random() * 2000);
    }

    // Update stats
    const stats = await chrome.storage.local.get('stats');
    const current = stats?.stats ?? {};
    await chrome.storage.local.set({
      stats: {
        ...current,
        interestVisits: (current.interestVisits ?? 0) + selected.length,
      }
    });
  }

  private async visitAndClose(target: InterestTarget): Promise<void> {
    let tab: chrome.tabs.Tab | null = null;
    try {
      tab = await chrome.tabs.create({
        url:    target.url,
        active: false, // Background tab — user does not see it
        pinned: false,
      });

      await this.sleep(this.config.dwellTimeMs);
    } catch (e) {
      console.debug(`[FacadeProxy] Interest visit failed: ${target.url}`, e);
    } finally {
      if (tab?.id !== undefined) {
        try {
          await chrome.tabs.remove(tab.id);
        } catch (e) {
          // Tab may have already been closed
        }
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default InterestPoisoner;

    Ethical note: Background tab visits generate real HTTP traffic to real publisher servers. Users should be clearly informed this is happening. It is enabled by default but can be disabled in the popup. The dwell time and tabs-per-cycle values are configurable (see Section 8).

4.6 Local Rust Proxy (Header & Cookie Mutation)
Purpose

The local Rust proxy intercepts HTTP requests before they leave the machine and applies:

    User-Agent rotation from a curated pool
    Accept-Language rotation
    Tracking header stripping (DNT injection, proxy header removal)
    Cookie value poisoning for known tracker cookie name prefixes
    Tracking query parameter stripping

It is built on the hyper async HTTP library and listens exclusively on 127.0.0.1:8888.
Architecture

text

Browser Request
      │
      ▼ 127.0.0.1:8888
┌─────────────────────────────┐
│      Hyper Listener         │
└────────────┬────────────────┘
             │
             ▼
┌─────────────────────────────┐
│    Request Interceptor      │
│  ┌────────────────────────┐ │
│  │  Header Mutator        │ │   ← UA rotation, Accept-Language, strip X-Forwarded-For
│  └────────────────────────┘ │
│  ┌────────────────────────┐ │
│  │  Cookie Poisoner       │ │   ← Corrupt _ga, _gid, _fbp etc.
│  └────────────────────────┘ │
│  ┌────────────────────────┐ │
│  │  Param Stripper        │ │   ← Remove utm_*, fbclid, gclid
│  └────────────────────────┘ │
└────────────┬────────────────┘
             │ Mutated request
             ▼
      Upstream Server

HTTPS Limitation

    Critical constraint: The Rust proxy operates at the HTTP layer only. Modern HTTPS traffic is TLS-encrypted. The proxy cannot inspect or mutate headers/cookies inside a TLS tunnel without implementing either:

        CONNECT tunneling — passes HTTPS traffic through as an opaque tunnel. Headers inside TLS remain unmodifiable. This is safe and non-intrusive but means HTTP mutation only applies to plaintext HTTP.

        TLS interception (MITM) — proxy generates per-domain certificates signed by a locally-installed CA. This allows header/cookie mutation of HTTPS traffic but requires the user to install a local CA certificate into their OS/browser trust store and accepts the associated security responsibility.

    FacadeProxy v1.0 implements CONNECT tunneling only. Full TLS interception is deferred to v2.0 as an opt-in capability with a full security disclosure and CA management flow. This means cookie and header mutation in v1.0 applies to HTTP traffic only. The extension-layer mutations (fingerprint, behavior, geo) apply to all traffic regardless.

Implementation

Rust

// proxy/src/main.rs

use hyper::{Body, Client, Request, Response, Server};
use hyper::service::{make_service_fn, service_fn};
use std::convert::Infallible;
use std::net::SocketAddr;

mod header_mutator;
mod cookie_poisoner;
mod param_stripper;
mod ua_pool;

use header_mutator::mutate_headers;
use cookie_poisoner::poison_cookies;
use param_stripper::strip_tracking_params;

#[tokio::main]
async fn main() {
    let addr: SocketAddr = "127.0.0.1:8888".parse().expect("Invalid address");

    let make_svc = make_service_fn(|_conn| async {
        Ok::<_, Infallible>(service_fn(handle_request))
    });

    println!("[FacadeProxy] Rust proxy listening on {}", addr);

    Server::bind(&addr)
        .serve(make_svc)
        .await
        .expect("Proxy server failed");
}

async fn handle_request(req: Request<Body>) -> Result<Response<Body>, hyper::Error> {
    // CONNECT method = HTTPS tunnel request
    if req.method() == hyper::Method::CONNECT {
        return handle_connect(req).await;
    }

    // HTTP — apply mutations
    let (mut parts, body) = req.into_parts();

    // 1. Mutate headers (UA, Accept-Language, strip tracking headers)
    mutate_headers(&mut parts.headers);

    // 2. Poison tracker cookies
    poison_cookies(&mut parts.headers);

    // 3. Strip tracking query parameters from URL
    let stripped_uri = strip_tracking_params(&parts.uri);
    parts.uri = stripped_uri;

    let mutated_req = Request::from_parts(parts, body);

    // Forward to upstream
    let client = Client::new();
    client.request(mutated_req).await
}

async fn handle_connect(req: Request<Body>) -> Result<Response<Body>, hyper::Error> {
    // Establish opaque tunnel — do NOT intercept TLS
    // Headers inside the tunnel are encrypted and cannot be mutated in v1.0
    use tokio::net::TcpStream;
    use hyper::upgrade::Upgraded;

    let host = req.uri().authority().map(|a| a.to_string()).unwrap_or_default();

    tokio::task::spawn(async move {
        match hyper::upgrade::on(req).await {
            Ok(upgraded) => {
                if let Ok(mut server_stream) = TcpStream::connect(&host).await {
                    let mut upgraded: Upgraded = upgraded;
                    let _ = tokio::io::copy_bidirectional(&mut upgraded, &mut server_stream).await;
                }
            }
            Err(e) => eprintln!("[FacadeProxy] CONNECT upgrade error: {}", e),
        }
    });

    Ok(Response::new(Body::empty()))
}

Header Mutator

Rust

// proxy/src/header_mutator.rs

use hyper::header::{HeaderMap, HeaderValue, USER_AGENT, ACCEPT_LANGUAGE};
use rand::Rng;
use crate::ua_pool::UA_POOL;

pub fn mutate_headers(headers: &mut HeaderMap) {
    let mut rng = rand::thread_rng();

    // Rotate User-Agent
    let ua = UA_POOL[rng.gen_range(0..UA_POOL.len())];
    headers.insert(USER_AGENT, HeaderValue::from_static(ua));

    // Rotate Accept-Language
    let langs = LANG_POOL[rng.gen_range(0..LANG_POOL.len())];
    headers.insert(ACCEPT_LANGUAGE, HeaderValue::from_static(langs));

    // Strip proxy-identifying headers
    for header in STRIP_HEADERS.iter() {
        headers.remove(*header);
    }

    // Randomly inject DNT
    if rng.gen_bool(0.6) {
        headers.insert("DNT", HeaderValue::from_static("1"));
    }
}

const STRIP_HEADERS: &[&str] = &[
    "x-forwarded-for",
    "x-real-ip",
    "via",
    "forwarded",
    "true-client-ip",
    "cf-connecting-ip",
    "x-client-ip",
];

const LANG_POOL: &[&str] = &[
    "en-US,en;q=0.9",
    "en-GB,en;q=0.9",
    "fr-FR,fr;q=0.9,en;q=0.8",
    "de-DE,de;q=0.9,en;q=0.8",
    "ja-JP,ja;q=0.9",
    "es-ES,es;q=0.9,en;q=0.8",
    "pt-BR,pt;q=0.9,en;q=0.8",
    "zh-CN,zh;q=0.9,en;q=0.8",
];

Cookie Poisoner

Rust

// proxy/src/cookie_poisoner.rs

use hyper::header::{HeaderMap, COOKIE};
use rand::distributions::Alphanumeric;
use rand::Rng;

/// Known tracker cookie name prefixes to poison
const TRACKER_COOKIE_PREFIXES: &[&str] = &[
    "_ga",    // Google Analytics
    "_gid",   // Google Analytics
    "_gat",   // Google Analytics
    "_fbp",   // Facebook Pixel
    "_fbc",   // Facebook Click ID
    "_uetsid",// Microsoft Bing Ads
    "_uetvid", // Microsoft Bing Ads
    "IDE",    // DoubleClick
    "ANID",   // Google Ad ID
    "NID",    // Google
    "SID",    // Google
    "__utma", // Legacy Google Analytics
    "__utmb",
    "__utmz",
    "mbox",   // Adobe Target
    "s_vi",   // Adobe Analytics
    "s_fid",  // Adobe Analytics
];

pub fn poison_cookies(headers: &mut HeaderMap) {
    if let Some(cookie_header) = headers.get(COOKIE).cloned() {
        if let Ok(cookie_str) = cookie_header.to_str() {
            let poisoned = poison_cookie_string(cookie_str);
            if let Ok(val) = poisoned.parse() {
                headers.insert(COOKIE, val);
            }
        }
    }
}

fn poison_cookie_string(cookies: &str) -> String {
    cookies
        .split(';')
        .map(|pair| {
            let trimmed = pair.trim();
            let (name, value) = trimmed.split_once('=').unwrap_or((trimmed, ""));
            let name_trimmed = name.trim();

            if should_poison(name_trimmed) {
                let fake_value = random_alphanum(value.len().max(16).min(64));
                format!("{}={}", name_trimmed, fake_value)
            } else {
                pair.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("; ")
}

fn should_poison(name: &str) -> bool {
    TRACKER_COOKIE_PREFIXES
        .iter()
        .any(|prefix| name.starts_with(prefix))
}

fn random_alphanum(len: usize) -> String {
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(len)
        .map(char::from)
        .collect()
}

Tracking Parameter Stripper

Rust

// proxy/src/param_stripper.rs

use hyper::Uri;

const TRACKING_PARAMS: &[&str] = &[
    // Google
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "gclid", "gclsrc", "dclid",
    // Facebook
    "fbclid", "fb_action_ids", "fb_action_types",
    // Microsoft
    "msclkid",
    // Twitter/X
    "twclid",
    // HubSpot
    "_hsenc", "_hsmi",
    // Mailchimp
    "mc_eid",
    // Marketo
    "mkt_tok",
    // Generic
    "ref", "referrer",
];

pub fn strip_tracking_params(uri: &Uri) -> Uri {
    let query = match uri.query() {
        Some(q) => q,
        None    => return uri.clone(),
    };

    let filtered: Vec<&str> = query
        .split('&')
        .filter(|param| {
            let key = param.split('=').next().unwrap_or("");
            !TRACKING_PARAMS.contains(&key)
        })
        .collect();

    let new_query = filtered.join("&");

    let mut parts = uri.clone().into_parts();
    let path = parts.path_and_query
        .as_ref()
        .map(|pq| pq.path().to_string())
        .unwrap_or_default();

    let new_pq = if new_query.is_empty() {
        path.parse().ok()
    } else {
        format!("{}?{}", path, new_query).parse().ok()
    };

    parts.path_and_query = new_pq;
    Uri::from_parts(parts).unwrap_or_else(|_| uri.clone())
}

4.7 Popup UI & Stats Dashboard
Purpose

The popup is the user's primary control surface. It shows real-time stats counters, the current enable/disable state, and provides quick access to configuration options.
Visual Design

text

┌──────────────────────────────────────────┐
│  🎭  FACADEPROXY          [ ● ACTIVE ]   │
│  Your digital face, always changing.     │
├──────────────────────────────────────────┤
│  SESSION STATS                           │
│                                          │
│  🎨  Fingerprints Spoofed    ██████ 142  │
│  🍪  Cookies Poisoned        ████   89   │
│  📍  Locations Rotated       ██     23   │
│  🔗  Tracking Params Stripped ███   54   │
│  🌐  Interest Visits         █       8   │
│  🧠  Behavioral Events       ████   201  │
├──────────────────────────────────────────┤
│  CURRENT PERSONA                         │
│  Platform: Win32 · GPU: Intel HD 5000   │
│  Screen: 1368×768 · Lang: fr-FR,fr       │
│  Geo: Paris (+jitter)                   │
├──────────────────────────────────────────┤
│  [   Enabled  ●─────────────── ]        │
│  [ Configure ] [ Reset Session ]        │
│  [ Open Full Dashboard ]                │
└──────────────────────────────────────────┘

Implementation

TypeScript

// extension/popup/popup.ts

interface Stats {
  fingerprintsSpoofed:   number;
  cookiesPoisoned:       number;
  locationsRotated:      number;
  trackingParamsStripped:number;
  interestVisits:        number;
  behaviorEvents:        number;
}

interface PopupState {
  enabled: boolean;
  stats:   Stats;
  persona: PersonaSummary;
}

async function initPopup(): Promise<void> {
  const data = await chrome.storage.local.get(['enabled', 'stats', 'persona']);

  const state: PopupState = {
    enabled: data.enabled !== false, // Default: enabled
    stats:   data.stats ?? defaultStats(),
    persona: data.persona ?? {},
  };

  renderStats(state.stats);
  renderPersona(state.persona);
  renderToggle(state.enabled);

  // Toggle handler
  document.getElementById('toggle')?.addEventListener('click', async () => {
    const newEnabled = !state.enabled;
    state.enabled = newEnabled;
    await chrome.storage.local.set({ enabled: newEnabled });
    renderToggle(newEnabled);

    // Notify content scripts
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'SET_ENABLED', enabled: newEnabled });
    }
  });

  // Reset session persona
  document.getElementById('reset-session')?.addEventListener('click', async () => {
    const newSeed = crypto.randomUUID();
    await chrome.storage.local.set({
      personaSeed: newSeed,
      stats: defaultStats(),
    });
    window.location.reload();
  });
}

function renderStats(stats: Stats): void {
  const rows: [string, keyof Stats, string][] = [
    ['🎨 Fingerprints Spoofed',      'fingerprintsSpoofed',    '#4ade80'],
    ['🍪 Cookies Poisoned',          'cookiesPoisoned',         '#fb923c'],
    ['📍 Locations Rotated',         'locationsRotated',        '#60a5fa'],
    ['🔗 Tracking Params Stripped',  'trackingParamsStripped',  '#a78bfa'],
    ['🌐 Interest Visits',           'interestVisits',          '#f472b6'],
    ['🧠 Behavioral Events',         'behaviorEvents',          '#34d399'],
  ];

  const container = document.getElementById('stats-container')!;
  container.innerHTML = rows.map(([label, key, color]) => `
    <div class="stat-row">
      <span class="stat-label">${label}</span>
      <span class="stat-value" style="color: ${color}">${stats[key]}</span>
    </div>
  `).join('');
}

function defaultStats(): Stats {
  return {
    fingerprintsSpoofed:    0,
    cookiesPoisoned:        0,
    locationsRotated:       0,
    trackingParamsStripped: 0,
    interestVisits:         0,
    behaviorEvents:         0,
  };
}

document.addEventListener('DOMContentLoaded', initPopup);

4.8 Background Coordinator & Alarm Scheduler
Purpose

The background service worker (MV3) serves as the orchestration layer. It:

    Initializes storage defaults on first install
    Generates the per-session persona seed
    Schedules and fires the interest poisoning alarm
    Routes messages between content scripts and background state
    Manages stat increment batching (to reduce chrome.storage.local write frequency)

TypeScript

// extension/background/service_worker.ts

import InterestPoisoner from './interest_poisoner';
import { generatePersonaSeed }  from '../core/persona';

const poisoner = new InterestPoisoner(
  { tabsPerCycle: 4, dwellTimeMs: 5000, cycleIntervalMin: 'INTEREST_POISON_CYCLE' },
  INTEREST_CATEGORIES
);

// ── First install initialization ───────────────────────────────────

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get(['enabled', 'personaSeed', 'stats']);

  await chrome.storage.local.set({
    enabled:     existing.enabled     !== undefined ? existing.enabled     : true,
    personaSeed: existing.personaSeed !== undefined ? existing.personaSeed : generatePersonaSeed(),
    stats:       existing.stats       !== undefined ? existing.stats       : defaultStats(),
    config:      existing.config      !== undefined ? existing.config      : defaultConfig(),
  });

  poisoner.registerAlarm();
});

// ── Message routing ────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case 'INCREMENT_STAT':
      incrementStat(message.key, message.delta ?? 1).then(sendResponse);
      return true; // Keep message channel open for async

    case 'GET_PERSONA_SEED':
      chrome.storage.local.get('personaSeed').then(data => {
        sendResponse({ seed: data.personaSeed });
      });
      return true;

    case 'NEW_SESSION':
      chrome.storage.local.set({ personaSeed: generatePersonaSeed() }).then(sendResponse);
      return true;
  }
});

// ── Stat batching ──────────────────────────────────────────────────

const pendingDeltas: Record<string, number> = {};
let flushTimer: ReturnType<typeof setTimeout> | null = null;

async function incrementStat(key: string, delta: number): Promise<void> {
  pendingDeltas[key] = (pendingDeltas[key] ?? 0) + delta;

  if (flushTimer === null) {
    flushTimer = setTimeout(async () => {
      const current = (await chrome.storage.local.get('stats'))?.stats ?? {};
      const updated = { ...current };

      for (const [k, v] of Object.entries(pendingDeltas)) {
        updated[k] = (updated[k] ?? 0) + v;
        delete pendingDeltas[k];
      }

      await chrome.storage.local.set({ stats: updated });
      flushTimer = null;
    }, 2000); // Batch writes every 2 seconds
  }
}

5. Data Models & Schemas
5.1 Persona Model

The persona is the core concept of FacadeProxy — a coherent, internally-consistent synthetic identity generated deterministically from a seed string. Using a seed (rather than pure randomness) ensures that within a session, all spoofed surfaces are mutually consistent.

TypeScript

// extension/core/persona.ts

export interface Persona {
  // Identity seed
  seed:              string;

  // Canvas
  canvasNoise:       number;    // 1–3: pixel perturbation range

  // WebGL
  webglVendor:       string;    // e.g. "Intel Inc."
  webglRenderer:     string;    // e.g. "Intel(R) HD Graphics 5000"

  // Audio
  audioNoiseDelta:   number;    // 0.0001–0.001: float perturbation range

  // Navigator
  platform:          string;    // "Win32" | "MacIntel" | "Linux x86_64"
  hardwareConcurrency: number;  // 2 | 4 | 8
  deviceMemory:      number;    // 2 | 4 | 8
  language:          string;    // "en-US" | "fr-FR" | "de-DE" etc.
  languages:         string[];  // ["en-US", "en"] etc.

  // Screen
  screenWidth:       number;    // e.g. 1366 | 1440 | 1920
  screenHeight:      number;    // e.g. 768  | 900  | 1080
  screenAvailDelta:  number;    // taskbar/dock offset (10–50)
  colorDepth:        number;    // 24 | 30

  // Geolocation
  geoCityIndex:      number;    // Starting city in rotation pool

  // Behavior
  mouseIntervalMin:  number;    // ms between mouse events
  mouseIntervalMax:  number;
  scrollIntervalMin: number;
  scrollIntervalMax: number;
}

const PLATFORM_POOL = [
  { platform: 'Win32',        gpu_vendor: 'Intel Inc.',    gpu_renderer: 'Intel(R) HD Graphics 5000' },
  { platform: 'Win32',        gpu_vendor: 'NVIDIA',        gpu_renderer: 'NVIDIA GeForce GTX 1060'   },
  { platform: 'MacIntel',     gpu_vendor: 'Apple',         gpu_renderer: 'Apple M1'                  },
  { platform: 'MacIntel',     gpu_vendor: 'Intel Inc.',    gpu_renderer: 'Intel Iris Pro Graphics'   },
  { platform: 'Linux x86_64', gpu_vendor: 'Mesa/X.org',   gpu_renderer: 'llvmpipe (LLVM 14)'        },
];

const SCREEN_POOL = [
  { width: 1366, height: 768  },
  { width: 1440, height: 900  },
  { width: 1920, height: 1080 },
  { width: 1280, height: 800  },
  { width: 1600, height: 900  },
];

const LANGUAGE_POOL = [
  { language: 'en-US', languages: ['en-US', 'en']     },
  { language: 'en-GB', languages: ['en-GB', 'en']     },
  { language: 'fr-FR', languages: ['fr-FR', 'fr', 'en'] },
  { language: 'de-DE', languages: ['de-DE', 'de', 'en'] },
  { language: 'ja-JP', languages: ['ja-JP', 'ja']     },
];

// Deterministic pseudo-random number generator from seed
function seededRandom(seed: string, index: number): number {
  let h = 0xdeadbeef ^ index;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 0x9e3779b9);
  }
  h ^= h >>> 16;
  return (h >>> 0) / 0xffffffff;
}

export function generatePersona(seed: string): Persona {
  const r = (i: number) => seededRandom(seed, i);

  const platformEntry = PLATFORM_POOL[Math.floor(r(0) * PLATFORM_POOL.length)];
  const screenEntry   = SCREEN_POOL[Math.floor(r(1)  * SCREEN_POOL.length)];
  const langEntry     = LANGUAGE_POOL[Math.floor(r(2) * LANGUAGE_POOL.length)];

  return {
    seed,
    canvasNoise:         Math.floor(r(3) * 3) + 1,
    webglVendor:         platformEntry.gpu_vendor,
    webglRenderer:       platformEntry.gpu_renderer,
    audioNoiseDelta:     r(4) * 0.0009 + 0.0001,
    platform:            platformEntry.platform,
    hardwareConcurrency: [2, 4, 8][Math.floor(r(5) * 3)],
    deviceMemory:        [2, 4, 8][Math.floor(r(6) * 3)],
    language:            langEntry.language,
    languages:           langEntry.languages,
    screenWidth:         screenEntry.width  + Math.floor(r(7)  * 20) - 10,
    screenHeight:        screenEntry.height + Math.floor(r(8)  * 20) - 10,
    screenAvailDelta:    Math.floor(r(9)  * 40) + 10,
    colorDepth:          r(10) > 0.8 ? 30 : 24,
    geoCityIndex:        Math.floor(r(11) * 10),
    mouseIntervalMin:    Math.floor(r(12) * 2000) + 1000,
    mouseIntervalMax:    Math.floor(r(13) * 3000) + 2000,
    scrollIntervalMin:   Math.floor(r(14) * 4000) + 2000,
    scrollIntervalMax:   Math.floor(r(15) * 6000) + 4000,
  };
}

export function generatePersonaSeed(): string {
  return crypto.randomUUID();
}

5.2 Storage Schema

All persistent state lives in chrome.storage.local:

TypeScript

// extension/core/storage_schema.ts

interface FacadeProxyStorage {
  // Core state
  enabled:     boolean;        // Global enable/disable toggle
  personaSeed: string;         // UUID seed for current session persona

  // Session statistics
  stats: {
    fingerprintsSpoofed:    number;
    cookiesPoisoned:        number;
    locationsRotated:       number;
    trackingParamsStripped: number;
    interestVisits:         number;
    behaviorEvents:         number;
    sessionStartedAt:       string; // ISO timestamp
  };

  // Configuration (user-adjustable)
  config: FacadeProxyConfig;

  // Persona summary (for display in popup — not the full persona object)
  persona: {
    platform:   string;
    webglVendor:string;
    screenRes:  string;
    language:   string;
    geoCity:    string;
  };
}

interface FacadeProxyConfig {
  // Module enables
  fingerprintSpoofing:   boolean;
  behaviorNoise:         boolean;
  geoRotation:           boolean;
  interestPoisoning:     boolean;
  proxyEnabled:          boolean;

  // Proxy settings
  proxyHost: string; // default: "127.0.0.1"
  proxyPort: number; // default: 8888

  // Interest poisoning
  interestTabsPerCycle:  number; // default: 4
  interestDwellTimeMs:   number; // default: 5000

  // Geo rotation
  geoCityPool:           GeoCoordinate[]; // custom pool, overrides default if set

  // Behavior simulator
  behaviorTypingEnabled: boolean; // default: true — disable for users worried about input side effects
}

5.3 Proxy State (Rust)

Rust

// proxy/src/state.rs

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

#[derive(Default)]
pub struct ProxyStats {
    pub requests_mutated:  AtomicU64,
    pub cookies_poisoned:  AtomicU64,
    pub params_stripped:   AtomicU64,
    pub headers_mutated:   AtomicU64,
}

impl ProxyStats {
    pub fn to_json(&self) -> String {
        format!(
            r#"{{"requests_mutated":{},"cookies_poisoned":{},"params_stripped":{},"headers_mutated":{}}}"#,
            self.requests_mutated.load(Ordering::Relaxed),
            self.cookies_poisoned.load(Ordering::Relaxed),
            self.params_stripped.load(Ordering::Relaxed),
            self.headers_mutated.load(Ordering::Relaxed),
        )
    }
}

pub type SharedStats = Arc<ProxyStats>;

6. API Specifications
6.1 Extension → Background Messaging API

All messages pass via chrome.runtime.sendMessage:

TypeScript

// extension/core/messages.ts

type Message =
  | { type: 'INCREMENT_STAT';   key: keyof Stats; delta?: number }
  | { type: 'GET_PERSONA_SEED' }
  | { type: 'NEW_SESSION' }
  | { type: 'SET_ENABLED';      enabled: boolean }
  | { type: 'GET_CONFIG' }
  | { type: 'SET_CONFIG';       config: Partial<FacadeProxyConfig> }
  | { type: 'GET_STATS' }
  | { type: 'RESET_STATS' };

type MessageResponse =
  | { seed: string }
  | { config: FacadeProxyConfig }
  | { stats: Stats }
  | { success: true };

6.2 Rust Proxy Stats API

The proxy exposes a minimal HTTP stats endpoint on 127.0.0.1:8889 (separate from the proxy port):

text

GET  http://127.0.0.1:8889/stats
     Returns: JSON ProxyStats

GET  http://127.0.0.1:8889/health
     Returns: { "status": "ok", "version": "1.0.0" }

POST http://127.0.0.1:8889/reset
     Returns: { "success": true }

The extension's popup polls this endpoint every 5 seconds (when open) to display proxy-side stats alongside extension stats.
6.3 User-Agent Pool

Rust

// proxy/src/ua_pool.rs

pub const UA_POOL: &[&str] = &[
    // Chrome on Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    // Chrome on macOS
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    // Firefox on Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    // Firefox on macOS
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.4; rv:125.0) Gecko/20100101 Firefox/125.0",
    // Edge
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
    // Safari on macOS
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
];

7. Directory Structure

text

facadeproxy/
│
├── extension/                          # Browser extension (TypeScript + MV3)
│   │
│   ├── manifest.json                   # MV3 manifest
│   │
│   ├── core/
│   │   ├── persona.ts                  # Persona model + seeded generation
│   │   ├── storage_schema.ts           # Storage type definitions
│   │   ├── messages.ts                 # Message type definitions
│   │   └── config.ts                   # Default config values
│   │
│   ├── content/
│   │   ├── injector.ts                 # ISOLATED world entry: bootstraps MAIN injection
│   │   ├── main_world_injector.ts      # MAIN world: all fingerprint + behavior hooks
│   │   ├── fingerprint_spoofer.ts      # Canvas/WebGL/Audio/Navigator/Screen hooks
│   │   ├── behavior_simulator.ts       # Synthetic mouse/scroll/typing events
│   │   └── geo_rotator.ts              # navigator.geolocation override
│   │
│   ├── background/
│   │   ├── service_worker.ts           # MV3 service worker: alarms, messaging, stats
│   │   └── interest_poisoner.ts        # Background tab interest poisoning
│   │
│   ├── popup/
│   │   ├── popup.html                  # Popup shell
│   │   ├── popup.ts                    # Popup controller
│   │   ├── popup.css                   # Cyber-green dark theme
│   │   └── components/
│   │       ├── StatRow.ts
│   │       ├── PersonaCard.ts
│   │       └── Toggle.ts
│   │
│   ├── icons/
│   │   ├── icon16.png
│   │   ├── icon48.png
│   │   └── icon128.png
│   │
│   ├── tsconfig.json
│   ├── package.json
│   └── vite.config.ts                  # Vite build config (MV3 compatible)
│
├── proxy/                              # Local Rust proxy
│   │
│   ├── src/
│   │   ├── main.rs                     # Hyper server entry point, CONNECT handling
│   │   ├── header_mutator.rs           # UA rotation, Accept-Language, header strip
│   │   ├── cookie_poisoner.rs          # Tracker cookie value corruption
│   │   ├── param_stripper.rs           # Tracking query parameter removal
│   │   ├── ua_pool.rs                  # User-agent string pool
│   │   ├── stats.rs                    # Shared atomic stats
│   │   ├── stats_api.rs                # Minimal stats HTTP server (port 8889)
│   │   └── config.rs                   # Proxy config (port, toggle flags)
│   │
│   ├── Cargo.toml
│   └── Cargo.lock
│
├── tests/
│   ├── extension/
│   │   ├── persona.test.ts             # Unit: persona generation determinism
│   │   ├── fingerprint_spoofer.test.ts # Unit: API hook behavior
│   │   ├── behavior_simulator.test.ts  # Unit: safe input targeting
│   │   ├── geo_rotator.test.ts         # Unit: coordinate rotation and jitter
│   │   └── param_stripper.test.ts      # Unit: UTM/tracking param removal
│   │
│   ├── proxy/
│   │   ├── cookie_poisoner_test.rs     # Rust unit tests
│   │   ├── param_stripper_test.rs
│   │   └── header_mutator_test.rs
│   │
│   └── e2e/
│       └── obfuscation_e2e.test.ts     # Playwright E2E: verify spoofed values visible to test page
│
├── scripts/
│   ├── build.sh                        # Full build: extension + proxy
│   ├── package.sh                      # Zip extension for CWS submission
│   └── install_proxy.sh                # Install proxy binary to PATH
│
├── docs/
│   ├── INSTALL.md
│   ├── CONFIGURATION.md
│   └── ARCHITECTURE.md
│
├── Makefile
├── README.md
└── .gitignore                          # Ignores: dist/, node_modules/, target/, *.zip

8. Configuration System
8.1 Default Configuration

TypeScript

// extension/core/config.ts

export const DEFAULT_CONFIG: FacadeProxyConfig = {
  // Module enables
  fingerprintSpoofing:   true,
  behaviorNoise:         true,
  geoRotation:           true,
  interestPoisoning:     true,
  proxyEnabled:          false, // Off by default — requires manual browser proxy setup

  // Proxy settings
  proxyHost: '127.0.0.1',
  proxyPort: 8888,

  // Interest poisoning
  interestTabsPerCycle: 4,      // 4 categories per hourly cycle
  interestDwellTimeMs:  5000,   // 5 second dwell per tab

  // Geo rotation
  geoCityPool: [],               // Empty = use DEFAULT_CITY_POOL

  // Behavior simulator
  behaviorTypingEnabled: true,
};

8.2 Config Access Patterns

TypeScript

// extension/core/config_manager.ts

export class ConfigManager {
  static async get(): Promise<FacadeProxyConfig> {
    const data = await chrome.storage.local.get('config');
    return { ...DEFAULT_CONFIG, ...(data.config ?? {}) };
  }

  static async set(partial: Partial<FacadeProxyConfig>): Promise<void> {
    const current = await this.get();
    await chrome.storage.local.set({ config: { ...current, ...partial } });
  }

  static async reset(): Promise<void> {
    await chrome.storage.local.set({ config: DEFAULT_CONFIG });
  }
}

8.3 Rust Proxy Config

toml

# proxy/config.toml

[proxy]
host             = "127.0.0.1"
port             = 8888
stats_port       = 8889

[mutations]
rotate_user_agent     = true
rotate_accept_language = true
strip_tracking_headers = true
poison_cookies         = true
strip_tracking_params  = true
inject_dnt_probability = 0.6   # 0.0–1.0: probability of adding DNT: 1

[logging]
level = "info"   # "debug" | "info" | "warn" | "error"

9. Certificate & TLS Proxy Considerations
9.1 v1.0: CONNECT Tunneling Only

FacadeProxy v1.0's Rust proxy operates in CONNECT tunnel mode for HTTPS. This means:
Traffic Type	Proxy Intercepts?	Headers/Cookies Mutatable?
HTTP	✅ Yes	✅ Yes
HTTPS (CONNECT tunnel)	✅ Tunnels	❌ No (inside TLS)
HTTPS (if TLS intercept added in v2)	✅ Yes	✅ Yes

The extension layer (fingerprint, behavior, geo, interest) applies to all browser traffic regardless of protocol, since it operates inside the browser's JavaScript runtime.
9.2 v2.0: Optional TLS Interception (Planned)

A future opt-in TLS interception mode would require:

    Generating a local CA certificate (similar to Babylon Firewall's model)
    Explicit user action to install it into the OS/browser trust store
    Per-domain leaf certificate generation and caching
    Clear disclosure to the user about the security implications

Platform-specific CA installation:
Platform	Command
macOS	sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ~/.facadeproxy/ca-cert.pem
Windows	certutil -addstore -f "ROOT" %USERPROFILE%\.facadeproxy\ca-cert.pem
Linux (Debian/Ubuntu)	sudo cp ~/.facadeproxy/ca-cert.pem /usr/local/share/ca-certificates/facadeproxy.crt && sudo update-ca-certificates
Firefox	Manual import via Preferences → Privacy & Security → Certificates

This feature is explicitly out of scope for v1.0 and requires a full security review before implementation.
10. Fingerprint Spoofing Deep Dive
10.1 Why MAIN World Is Non-Negotiable

Chrome's content script isolation model creates a fundamental problem for fingerprint spoofing:

    Content scripts run in an isolated world — a separate JavaScript execution environment. Modifications to window, document, or prototype chains in the isolated world are not visible to page scripts, which run in the MAIN world.

This means a naive content script that wraps HTMLCanvasElement.prototype.getImageData would not affect any canvas calls made by the page's own JavaScript — which is exactly what fingerprinting scripts do.

The solution: inject the spoofing code into the MAIN world using:

TypeScript

// Method 1: chrome.scripting.executeScript with world: "MAIN" (preferred, MV3)
await chrome.scripting.executeScript({
  target: { tabId },
  files:  ['content/main_world_injector.js'],
  world:  'MAIN',
  injectImmediately: true,
});

// Method 2: DOM script injection (fallback for cross-browser compatibility)
const script = document.createElement('script');
script.src = chrome.runtime.getURL('content/main_world_injector.js');
script.onload = () => script.remove();
(document.head || document.documentElement).appendChild(script);

Method 1 is preferred for MV3 because it is explicit, auditable, and does not require the script to be listed in web_accessible_resources. Method 2 is listed in web_accessible_resources and remains as a Firefox fallback.
10.2 Coherence Rules

The single most important fingerprint spoofing principle is internal consistency. The following coherence constraints are enforced by the persona generator:
Signal A	Signal B	Constraint
navigator.platform = "Win32"	navigator.languages	Must not contain only "ja-JP" (inconsistent locale)
navigator.platform = "MacIntel"	screen.colorDepth	Should be 30 (Retina) at higher probability
webglVendor = "Apple"	navigator.platform	Must be "MacIntel"
screen.width = 1366	navigator.hardwareConcurrency	Low-end screen → low probability of 16 cores
navigator.language = "fr-FR"	navigator.languages	Must start with ["fr-FR", ...]

These constraints are encoded in the generatePersona function via correlated pool selection (selecting platform, GPU, language, and screen from pools that are internally consistent rather than independently random).
10.3 Known Evasion Limitations
Limitation	Description
isTrusted on events	Synthetic DOM events always have isTrusted = false. Analytics platforms that filter on this will discard behavioral noise signals.
WebRTC IP leak	navigator.geolocation is spoofed but WebRTC STUN/TURN may still leak the real IP. Users requiring full geo obfuscation should use a VPN.
Font enumeration	FacadeProxy does not spoof CSS font metric fingerprinting. This is a future TODO.
Battery API	Not spoofed in v1.0. Low priority as the API has been removed from most browsers.
Permission enumeration	navigator.permissions.query not spoofed.
Timezone	Intl.DateTimeFormat().resolvedOptions().timeZone not spoofed. Must be consistent with spoofed geo/language. Future work.
TLS fingerprint (JA3)	Not addressable from the browser layer. Would require proxy-level TLS interception.
11. Behavioral Noise Deep Dive
11.1 The isTrusted Problem

The W3C spec for UIEvent defines isTrusted as:

    A boolean value indicating whether or not the event was initiated by the browser (after a user click, for instance) or by a script using an event creation method. Events with isTrusted = false are considered synthetic.

Many anti-fraud and behavioral analytics platforms filter out isTrusted = false events. This is a known fundamental limitation of JavaScript-level behavior simulation and cannot be overcome from within the JavaScript execution context.

Implications:

    Behavioral noise will be partially or fully filtered by platforms that check isTrusted
    The noise may still affect simpler analytics stacks that don't perform this check
    The presence of high volumes of isTrusted = false events from a single page load may itself become a fingerprint signal on sophisticated platforms

Mitigation strategy: Keep noise volumes low and randomized, so the pattern is plausibly consistent with a poorly-implemented third-party widget rather than an obvious obfuscation tool.
11.2 Event Rate Calibration

Behavioral event rates are calibrated to fall within the range observed in real user sessions:
Event Type	Real User Range	FacadeProxy Target
mousemove	5–50 events/second (during active movement)	0.3–1 events/second (sparse, plausible)
scroll	0–5 events/second	0.1–0.5 events/second
input (typing)	2–8 events/second (during active typing)	Never during active user typing

The simulator is deliberately sparse rather than high-volume. High-volume synthetic events are detectable outliers. Sparse events blend into normal page interaction noise.
12. Geolocation Poisoning Deep Dive
12.1 Multi-Signal Coherence Problem

Geolocation spoofing in isolation has limited effectiveness against sophisticated cross-signal trackers because location is correlated across multiple independent signals:
Signal	Source	FacadeProxy Addresses?
JavaScript navigator.geolocation	Browser API	✅ Yes
IP geolocation	Server-side IP lookup	❌ No (requires VPN)
Browser timezone (Intl)	JavaScript API	❌ Not in v1.0
Wi-Fi network geolocation	Browser API (NetworkInformation)	❌ Not addressed
Accept-Language locale	HTTP header	✅ Partially (proxy layer)

v1.0 recommendation: Users who require full geolocation obfuscation should pair FacadeProxy with a VPN and also manually adjust their browser timezone. FacadeProxy addresses the JS layer only. Cross-signal coherence (timezone ↔ language ↔ geo ↔ IP) is a v2.0 goal.
12.2 Jitter Design

Jitter prevents exact-match correlation attacks (where a tracker stores a specific lat/lon and later checks for an exact match). The jitter range of ±0.02 degrees translates to approximately ±2.2km, which is realistic for GPS + network triangulation accuracy variation.
13. Interest Profile Poisoning Deep Dive
13.1 Theoretical Basis

Interest poisoning is the application of the obfuscation strategy from information-theoretic privacy: by adding high-entropy false signals to a profile, the signal-to-noise ratio of the true interest signal decreases, making it progressively harder to accurately classify the user.

The effectiveness of this approach depends on:

    Volume of noise vs. real signal: The more real browsing a user does in a specific category, the more noise visits are needed to dilute it
    Platform's noise robustness: Modern advertising platforms use temporal weighting (recent visits count more) and may filter outlier patterns
    Cross-session persistence: If noise visits are never revisited, they may be discounted as one-time anomalies

13.2 Operational Caveats
Concern	Details
Real traffic to real servers	Each interest visit is a real HTTP request to a real publisher. The publisher's analytics will count it as a real page view. Users should be clearly informed of this.
Bot detection	Background tabs opened by extensions can be detected via navigator.webdriver, headless signals, or timing patterns. Some publishers may log or flag these visits.
Bandwidth consumption	Visiting 4 URLs per hour, 5 seconds each, loads the page (potentially including images, scripts, etc.). Configure dwellTimeMs appropriately for users on limited connections.
Disable by default for rate-limited users	Consider making interestPoisoning opt-in rather than opt-out (currently opt-out).
14. Rust Proxy Deep Dive
14.1 Why Rust?
Criterion	Rationale
Performance	Hyper is one of the fastest async HTTP libraries available. Proxy overhead should be imperceptible.
Memory safety	No GC pauses, no memory unsafety. Stable long-running process.
Single binary	Ships as a single static binary with no runtime dependencies.
Async I/O	Tokio runtime handles high concurrency with minimal resources.
14.2 Full Request Pipeline

Rust

// proxy/src/pipeline.rs

pub async fn process_request(req: Request<Body>, stats: SharedStats) -> Request<Body> {
    let (mut parts, body) = req.into_parts();

    // Stage 1: Strip tracking query parameters from URI
    let stripped_uri = strip_tracking_params(&parts.uri);
    if stripped_uri != parts.uri {
        stats.params_stripped.fetch_add(1, Ordering::Relaxed);
        parts.uri = stripped_uri;
    }

    // Stage 2: Mutate headers
    let headers_before = parts.headers.len();
    mutate_headers(&mut parts.headers);
    if parts.headers.len() != headers_before {
        stats.headers_mutated.fetch_add(1, Ordering::Relaxed);
    }

    // Stage 3: Poison tracker cookies
    if parts.headers.contains_key(COOKIE) {
        let poisoned_count = poison_cookies(&mut parts.headers);
        stats.cookies_poisoned.fetch_add(poisoned_count, Ordering::Relaxed);
    }

    stats.requests_mutated.fetch_add(1, Ordering::Relaxed);

    Request::from_parts(parts, body)
}

14.3 Proxy Configuration via Extension

The extension's popup can start/stop the proxy and configure it via the stats API:

TypeScript

// extension/popup/proxy_panel.ts

async function checkProxyHealth(): Promise<boolean> {
  try {
    const resp = await fetch('http://127.0.0.1:8889/health', { signal: AbortSignal.timeout(1000) });
    return resp.ok;
  } catch {
    return false;
  }
}

async function getProxyStats(): Promise<ProxyStats | null> {
  try {
    const resp = await fetch('http://127.0.0.1:8889/stats', { signal: AbortSignal.timeout(1000) });
    return await resp.json();
  } catch {
    return null;
  }
}

15. Execution World Strategy (MAIN vs ISOLATED)

This section is the most technically critical aspect of FacadeProxy's extension implementation.
15.1 The Isolated World Model

Chrome's extension architecture separates JavaScript execution into worlds:
World	Who runs here	Can access page DOM?	Can access page globals/prototypes?	Can use extension APIs?
MAIN	Page scripts, injected scripts with world: "MAIN"	✅ Yes	✅ Yes	❌ No (direct)
ISOLATED	Content scripts (default)	✅ Yes (DOM only)	❌ No	✅ Yes

For fingerprint spoofing to work — i.e., for our HTMLCanvasElement.prototype.getImageData wrapper to intercept calls from page scripts — the wrapper must exist in the MAIN world.
15.2 Communication Between Worlds

Since MAIN world scripts can't use chrome.storage or chrome.runtime directly, FacadeProxy uses a one-way communication pattern:

text

Service Worker                    ISOLATED Content Script              MAIN World Injector
     │                                     │                                  │
     │  Generate personaSeed               │                                  │
     │─────────────────────────────────────►│                                 │
     │                                     │                                  │
     │                                     │  Inject script with seed        │
     │                                     │  embedded as __FACADE_SEED__    │
     │                                     │─────────────────────────────────►│
     │                                     │                                  │
     │                                     │                                  │  Generate persona
     │                                     │                                  │  from seed
     │                                     │                                  │
     │                                     │                                  │  Install all hooks
     │                                     │                                  │
     │                                     │  postMessage stats back          │
     │                                     │◄─────────────────────────────────│
     │  Store stats                        │                                  │
     │◄────────────────────────────────────│                                  │

The persona seed is embedded directly into the injected script string (not passed via window.postMessage which is itself observable):

TypeScript

// extension/content/injector.ts

async function injectMainWorldScript(): Promise<void> {
  const data = await chrome.storage.local.get(['personaSeed', 'enabled', 'config']);

  if (!data.enabled) return;

  // Embed seed directly in the injected script
  const scriptContent = `
    window.__FACADE_SEED__ = ${JSON.stringify(data.personaSeed)};
    window.__FACADE_CONFIG__ = ${JSON.stringify(data.config)};
  `;

  // First inject the seed
  await chrome.scripting.executeScript({
    target: { tabId: (await getCurrentTab()).id! },
    func: (seed: string, config: FacadeProxyConfig) => {
      (window as any).__FACADE_SEED__   = seed;
      (window as any).__FACADE_CONFIG__ = config;
    },
    args:  [data.personaSeed, data.config],
    world: 'MAIN',
    injectImmediately: true,
  });

  // Then inject the full spoofer
  await chrome.scripting.executeScript({
    target: { tabId: (await getCurrentTab()).id! },
    files:  ['content/main_world_injector.js'],
    world:  'MAIN',
    injectImmediately: true,
  });
}

15.3 Firefox Cross-Compatibility

Firefox's implementation of MV3 has partial support for world: "MAIN" in scripting.executeScript. For maximum cross-browser compatibility, FacadeProxy also includes a DOM-injection fallback:

TypeScript

// extension/content/injector.ts (Firefox fallback)

function injectViaDOM(scriptURL: string): void {
  const script = document.createElement('script');
  script.src    = chrome.runtime.getURL(scriptURL);
  script.async  = false; // Must execute synchronously before page scripts
  (document.head ?? document.documentElement).insertBefore(script, null);
  script.addEventListener('load', () => script.remove());
}

This requires main_world_injector.js to be listed in web_accessible_resources in the manifest.
16. Privacy & Ethical Boundary Module
16.1 Design Boundaries

FacadeProxy's obfuscation approach exists in an ethically complex space. The following boundaries are hard-coded and non-configurable:
Boundary	Rationale
Never target auth/payment inputs with typing noise	Corrupting authentication or payment data could cause real financial or security harm.
Never poison first-party cookies	FacadeProxy only poisons cookies matching known third-party tracker prefixes. User session cookies, authentication tokens, and preferences are never touched.
Never open interest poisoning tabs to competitor sites that a user has visited	Interest poisoning uses a fixed predefined list. It does not dynamically target sites based on the user's actual history.
Never rate-limit or DDoS any upstream server	Interest tab dwell time and per-cycle tab count are capped at values far below any meaningful load.
Proxy binds to loopback only	127.0.0.1:8888 only. Never 0.0.0.0. Prevents accidental network exposure.
No data collection of any kind	Extension collects only local session stats (stored in chrome.storage.local). Nothing is transmitted externally.
16.2 The isTrusted Honest Disclosure

The popup UI and README explicitly disclose that:

    Synthetic behavioral events have isTrusted = false
    Sophisticated tracking platforms may filter these out
    Behavioral noise effectiveness is probabilistic and depends on the tracking platform's implementation
    FacadeProxy is a best-effort obfuscation tool, not a guarantee of privacy

16.3 Interest Poisoning Disclosure

Users are shown an explicit disclosure on first enable of the interest poisoning feature:

text

⚠️  Interest Poisoning Notice

When enabled, FacadeProxy will automatically open background
browser tabs to a fixed list of websites (sports, fashion,
finance, etc.) and close them after a few seconds.

This generates real HTTP requests to those websites.

The goal is to add noise to advertising interest profiles.
This feature uses a small amount of bandwidth.

[  Enable Interest Poisoning  ]   [  Keep Disabled  ]

17. Security Model & Threat Boundaries
17.1 Trust Zones

text

┌──────────────────────────────────────────────┐
│  FULLY TRUSTED (extension sandbox)           │
│  - Extension service worker                  │
│  - chrome.storage.local (extension scope)   │
│  - Popup UI                                  │
└────────────────────┬─────────────────────────┘
                     │
┌────────────────────▼─────────────────────────┐
│  SEMI-TRUSTED (MAIN world injection)         │
│  - main_world_injector.js                   │
│  - Communicates back via DOM events only    │
│  - Cannot access chrome.* APIs              │
└────────────────────┬─────────────────────────┘
                     │
┌────────────────────▼─────────────────────────┐
│  SEMI-TRUSTED (localhost proxy)              │
│  - 127.0.0.1:8888 (loopback only)           │
│  - No auth required (trusted by locality)  │
│  - Stats API on :8889 (localhost only)     │
└────────────────────┬─────────────────────────┘
                     │
┌────────────────────▼─────────────────────────┐
│  UNTRUSTED (internet)                        │
│  - All upstream servers                      │
│  - All page scripts                          │
│  - Content from interest poisoning tabs      │
└──────────────────────────────────────────────┘

17.2 Threat Model
Threat	Mitigation
Page script detects hook injection	Hooks are installed before page scripts run (document_start). Adversarial scripts that arrive after injection cannot remove the hooks. Hooks that throw are caught silently.
Proxy port accessible from LAN	Proxy binds exclusively to 127.0.0.1. OS-level networking prevents external access.
Obfuscation fingerprint: the extension is itself detectable	Any browser extension is detectable by sufficiently adversarial page scripts. FacadeProxy minimizes its surface by not injecting obvious global variables and by using the extension's own ID in a non-enumerable way.
Persona incoherence triggers detection	Addressed by persona coherence constraints in generatePersona. All surfaces within a session are derived from the same seed.
Interest poisoning visits trigger bot detection	Tab visits are short-lived (5s default) and use the real browser (not headless). navigator.webdriver is false. No automation signals are present.
Cookie poisoning logs out user	Cookie poisoner only targets prefixes of known analytics/tracking cookies. First-party session cookies are never modified.
17.3 Anti-Detection Hardening

TypeScript

// extension/content/main_world_injector.ts

// Avoid leaving obvious evidence of hook installation
// Don't set named globals that pages can detect

// Bad (detectable):
// window.__facadeproxy_active = true;

// Good: Store state in a WeakMap or closure
const _facadeState = new WeakMap<object, boolean>();

// Wrap errors silently — don't leave extension error traces in console
function safeOverride(target: object, prop: string, descriptor: PropertyDescriptor): void {
  try {
    Object.defineProperty(target, prop, descriptor);
  } catch {
    // Silent failure — better to not spoof than to log an error
    // that reveals the extension's presence
  }
}

18. Storage & Persistence
18.1 chrome.storage.local Capacity

Chrome's chrome.storage.local has a default quota of 10MB (unlimited for extensions with the unlimitedStorage permission). FacadeProxy's storage is minimal:
Key	Typical Size	Description
enabled	4 bytes	Boolean
personaSeed	40 bytes	UUID string
stats	~200 bytes	6 integer counters + timestamp
config	~500 bytes	Full config object
persona	~200 bytes	Display summary
Total	~1KB	Well within quota
18.2 Session vs. Persistent State
State	Scope	Storage
Persona seed	Per session (reset on "New Session")	chrome.storage.local
Stats counters	Per session (reset on "New Session")	chrome.storage.local
Config (enables, ports, etc.)	Persistent across sessions	chrome.storage.local
In-page hook state	Per page load	JS closure (in-memory only)
Proxy stats	Since proxy start	In-process atomic counters
18.3 Data Retention Policy

    Extension stores no browsing history, no URLs visited, no request contents
    Stats counters are aggregate counts only (no per-site breakdown)
    "Reset Session" clears all stats and generates a new persona seed
    Uninstalling the extension removes all chrome.storage.local data automatically
    Proxy stores no logs by default. Debug logging is opt-in via config.toml

19. Logging, Observability & Debugging
19.1 Extension Debug Logging

TypeScript

// extension/core/logger.ts

const DEBUG = false; // Set to true during development builds

export const log = {
  debug: (...args: any[]) => DEBUG && console.debug('[FacadeProxy]', ...args),
  info:  (...args: any[]) => console.info('[FacadeProxy]', ...args),
  warn:  (...args: any[]) => console.warn('[FacadeProxy]', ...args),
  error: (...args: any[]) => console.error('[FacadeProxy]', ...args),
};

In production builds, DEBUG = false removes all debug calls from the output via Vite tree-shaking.
19.2 Proxy Debug Logging

Rust

// proxy/src/main.rs

use tracing::{info, debug, warn};
use tracing_subscriber;

fn init_logging(level: &str) {
    tracing_subscriber::fmt()
        .with_max_level(match level {
            "debug" => tracing::Level::DEBUG,
            "warn"  => tracing::Level::WARN,
            "error" => tracing::Level::ERROR,
            _       => tracing::Level::INFO,
        })
        .with_target(false)
        .init();
}

In debug mode, logs each mutated header and poisoned cookie name (but never the value):

text

[INFO]  FacadeProxy proxy started on 127.0.0.1:8888
[DEBUG] Mutated UA: "Mozilla/5.0 ... Firefox/125.0"
[DEBUG] Poisoned cookie: _ga (value replaced)
[DEBUG] Stripped params: utm_source, fbclid (2 total)

19.3 Test Page for Verification

FacadeProxy includes a static test page that reports what values it reads from the browser APIs — useful for verifying that hooks are active:

HTML

<!-- extension/test_page/index.html -->

<script>
  document.getElementById('canvas-fp').textContent = getCanvasFingerprint();
  document.getElementById('webgl-vendor').textContent = getWebGLVendor();
  document.getElementById('navigator-platform').textContent = navigator.platform;
  document.getElementById('screen-res').textContent = `${screen.width}×${screen.height}`;
  navigator.geolocation.getCurrentPosition(pos => {
    document.getElementById('geo').textContent =
      `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
  });
</script>

20. Testing Strategy
20.1 Test Pyramid

text

                  ┌─────────────┐
                  │   E2E (5%)  │
                  │  Playwright │
                  └──────┬──────┘
            ┌────────────┴────────────┐
            │   Integration (20%)     │
            │  Extension + Proxy      │
            └────────────┬────────────┘
       ┌─────────────────┴─────────────────┐
       │         Unit Tests (75%)          │
       │  Persona, Hooks, Transforms       │
       └───────────────────────────────────┘

20.2 Unit Tests

TypeScript

// tests/extension/persona.test.ts

import { generatePersona } from '../../extension/core/persona';

describe('Persona generation', () => {
  it('is deterministic for the same seed', () => {
    const seed = 'test-seed-12345';
    const p1 = generatePersona(seed);
    const p2 = generatePersona(seed);
    expect(p1).toEqual(p2);
  });

  it('produces different personas for different seeds', () => {
    const p1 = generatePersona('seed-a');
    const p2 = generatePersona('seed-b');
    expect(p1.webglVendor).not.toEqual(p2.webglVendor); // Most of the time
  });

  it('enforces Apple GPU only on MacIntel platform', () => {
    // Run 1000 personas and verify no Apple GPU on Win32
    for (let i = 0; i < 1000; i++) {
      const p = generatePersona(`seed-${i}`);
      if (p.webglVendor === 'Apple') {
        expect(p.platform).toBe('MacIntel');
      }
    }
  });

  it('screen dimensions are within realistic ranges', () => {
    for (let i = 0; i < 100; i++) {
      const p = generatePersona(`seed-${i}`);
      expect(p.screenWidth).toBeGreaterThanOrEqual(1200);
      expect(p.screenWidth).toBeLessThanOrEqual(2000);
    }
  });
});

TypeScript

// tests/extension/behavior_simulator.test.ts

import BehaviorSimulator from '../../extension/content/behavior_simulator';

describe('BehaviorSimulator input safety', () => {
  it('does not target password inputs', () => {
    document.body.innerHTML = '<input type="password" id="pw">';
    const sim = new BehaviorSimulator({ ...defaultConfig(), behaviorTypingEnabled: true });
    const safeInputs = (sim as any).getSafeInputs();
    expect(safeInputs.length).toBe(0);
  });

  it('does not target inputs within checkout forms', () => {
    document.body.innerHTML = `
      <form action="/checkout">
        <input type="text" id="name">
      </form>
    `;
    const sim = new BehaviorSimulator(defaultConfig());
    const safeInputs = (sim as any).getSafeInputs();
    expect(safeInputs.length).toBe(0);
  });

  it('targets safe text inputs', () => {
    document.body.innerHTML = '<input type="text" id="search" placeholder="Search...">';
    const sim = new BehaviorSimulator(defaultConfig());
    const safeInputs = (sim as any).getSafeInputs();
    expect(safeInputs.length).toBe(1);
  });
});

Rust

// proxy/src/cookie_poisoner_test.rs

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn poisons_ga_cookies() {
        let input = "_ga=GA1.2.123456789.1234567890; session_id=abc123; _gid=GA1.2.987654321.1234567890";
        let result = poison_cookie_string(input);

        // _ga and _gid should be replaced, session_id should be untouched
        assert!(result.contains("session_id=abc123"));
        assert!(!result.contains("GA1.2.123456789")); // _ga poisoned
        assert!(!result.contains("GA1.2.987654321")); // _gid poisoned
    }

    #[test]
    fn preserves_non_tracking_cookies() {
        let input = "user_theme=dark; cart_id=xyz789; logged_in=true";
        let result = poison_cookie_string(input);
        assert_eq!(result.replace(" ", ""), input.replace(" ", ""));
    }

    #[test]
    fn strips_utm_params() {
        let uri: Uri = "https://example.com/page?utm_source=google&q=test&fbclid=abc"
            .parse().unwrap();
        let stripped = strip_tracking_params(&uri);
        let query = stripped.query().unwrap_or("");
        assert!(query.contains("q=test"));
        assert!(!query.contains("utm_source"));
        assert!(!query.contains("fbclid"));
    }
}

20.3 E2E Tests

TypeScript

// tests/e2e/obfuscation_e2e.test.ts

import { test, expect, chromium } from '@playwright/test';
import path from 'path';

test.describe('FacadeProxy obfuscation E2E', () => {
  test('Canvas fingerprint differs across sessions', async () => {
    const ext = path.resolve('./dist/extension');

    const ctx1 = await chromium.launchPersistentContext('', {
      headless: false,
      args: [`--load-extension=${ext}`, `--disable-extensions-except=${ext}`],
    });

    const ctx2 = await chromium.launchPersistentContext('', {
      headless: false,
      args: [`--load-extension=${ext}`, `--disable-extensions-except=${ext}`],
    });

    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    await page1.goto('http://localhost:3999/test_page');
    await page2.goto('http://localhost:3999/test_page');

    const fp1 = await page1.textContent('#canvas-fp');
    const fp2 = await page2.textContent('#canvas-fp');

    // Different sessions should produce different fingerprints
    expect(fp1).not.toEqual(fp2);

    await ctx1.close();
    await ctx2.close();
  });

  test('Geolocation returns rotated coordinates', async () => {
    const ctx = await chromium.launchPersistentContext('', { /* ... */ });
    const page = await ctx.newPage();
    await page.goto('http://localhost:3999/test_page');

    const geo = await page.textContent('#geo');
    const [lat, lon] = geo!.split(',').map(s => parseFloat(s.trim()));

    // Should be in one of the city pool locations (within ~100km)
    const inCityPool = DEFAULT_CITY_POOL.some(city =>
      Math.abs(city.latitude - lat) < 1.0 &&
      Math.abs(city.longitude - lon) < 1.0
    );
    expect(inCityPool).toBe(true);

    await ctx.close();
  });
});

21. Build, Packaging & Installation
21.1 Makefile

Makefile

.PHONY: all build build-extension build-proxy test lint clean package

# ── Build targets ──────────────────────────────────────────────────

all: build-extension build-proxy

build-extension:
	cd extension && npm install && npm run build
	@echo "✅ Extension built → dist/extension/"

build-proxy:
	cd proxy && cargo build --release
	@echo "✅ Proxy built → proxy/target/release/facadeproxy"

build: all

# ── Test targets ───────────────────────────────────────────────────

test: test-extension test-proxy

test-extension:
	cd extension && npm run test

test-proxy:
	cd proxy && cargo test

test-e2e:
	cd tests/e2e && npx playwright test

# ── Lint ───────────────────────────────────────────────────────────

lint:
	cd extension && npm run lint
	cd proxy && cargo clippy -- -D warnings

# ── Package for distribution ───────────────────────────────────────

package-extension: build-extension
	cd dist && zip -r facadeproxy-extension-v$(VERSION).zip extension/
	@echo "✅ Packaged → dist/facadeproxy-extension-v$(VERSION).zip"

package-proxy: build-proxy
	cp proxy/target/release/facadeproxy dist/facadeproxy-$(shell uname -s | tr '[:upper:]' '[:lower:]')-$(shell uname -m)
	@echo "✅ Proxy binary → dist/"

package: package-extension package-proxy

# ── Release (cross-platform proxy) ────────────────────────────────

release-proxy:
	cd proxy && \
	  cargo build --release --target x86_64-unknown-linux-gnu && \
	  cargo build --release --target x86_64-apple-darwin      && \
	  cargo build --release --target aarch64-apple-darwin     && \
	  cargo build --release --target x86_64-pc-windows-gnu

# ── Clean ─────────────────────────────────────────────────────────

clean:
	rm -rf dist/ extension/node_modules/ extension/dist/
	cd proxy && cargo clean

21.2 Vite Extension Build Config

TypeScript

// extension/vite.config.ts

import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

export default defineConfig({
  plugins: [
    crx({ manifest }),
  ],
  build: {
    outDir:  '../dist/extension',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup:              'popup/popup.html',
        background:         'background/service_worker.ts',
        injector:           'content/injector.ts',
        main_world_injector:'content/main_world_injector.ts',
      },
    },
  },
});

21.3 Installation Instructions
Extension (Chrome)

    Download or clone the repo
    Run make build-extension
    Open chrome://extensions
    Enable "Developer mode"
    Click "Load unpacked" → select dist/extension/

Extension (Firefox)

    Run make build-extension
    Open about:debugging#/runtime/this-firefox
    Click "Load Temporary Add-on" → select dist/extension/manifest.json

Local Proxy (optional)

Bash

# Build
make build-proxy

# Run (starts on 127.0.0.1:8888)
./proxy/target/release/facadeproxy

# Configure browser to use HTTP proxy:
# Host: 127.0.0.1  Port: 8888

# macOS: System Settings → Network → Proxies → HTTP Proxy
# Chrome: --proxy-server="http://127.0.0.1:8888"
# Firefox: Settings → Network → Manual proxy → HTTP Proxy

22. Platform Support Matrix
Feature	Chrome (Win)	Chrome (Mac)	Chrome (Linux)	Firefox (Win)	Firefox (Mac)	Firefox (Linux)
Canvas Spoofing	✅	✅	✅	✅	✅	✅
WebGL Spoofing	✅	✅	✅	✅	✅	✅
Audio Spoofing	✅	✅	✅	✅	✅	✅
Navigator Override	✅	✅	✅	✅	✅	✅
Geo Rotation	✅	✅	✅	✅	✅	✅
Behavior Noise	✅	✅	✅	✅	✅	✅
Interest Poisoning	✅	✅	✅	✅	✅	✅
MAIN World Injection	✅	✅	✅	⚠️ (MV3 partial)	⚠️	⚠️
Local Proxy (HTTP)	✅	✅	✅	✅	✅	✅
Proxy Stats API	✅	✅	✅	✅	✅	✅

    ⚠️ Firefox MV3 support for scripting.executeScript with world: "MAIN" is partial. FacadeProxy uses the DOM injection fallback on Firefox. Functionality is equivalent; the injection mechanism differs.

23. Performance Targets & Benchmarks
Metric	Target	Notes
Content script injection latency	< 2ms	At document_start, before page scripts
Persona generation time	< 0.5ms	Seeded PRNG, no async operations
Canvas hook overhead per call	< 0.1ms	Pixel perturbation loop on small images
WebGL hook overhead per call	< 0.01ms	Simple parameter switch
Geo override response latency	100–300ms (fake)	Realistic delay injected intentionally
Behavior timer precision	±50ms	Acceptable for event simulation purposes
Interest poisoning tabs/hour	≤ 6	4 default, caps at 8 to avoid bandwidth issues
Proxy request processing time	< 1ms P99	Synchronous string operations on headers
Proxy memory footprint	< 10MB	Tokio async runtime, minimal allocations
Extension memory footprint	< 5MB	TypeScript, no heavy frameworks
24. Error Handling Strategy
24.1 Extension Error Policy

Critical rule: Errors in hook installation must NEVER cause visible page breakage.

TypeScript

// extension/content/main_world_injector.ts

// All hook installations are wrapped in try/catch
// Failure to install a hook is logged silently in debug mode
// Page load continues normally

function safeInstall(label: string, fn: () => void): void {
  try {
    fn();
    log.debug(`Installed hook: ${label}`);
  } catch (e) {
    log.debug(`Failed to install hook: ${label}`, e);
    // Do not rethrow — page must continue loading
  }
}

// Usage:
safeInstall('canvas-2d', () => spoofer.hookCanvas());
safeInstall('webgl',     () => spoofer.hookWebGL());
safeInstall('navigator', () => spoofer.hookNavigator());

24.2 Error Categories
Category	Policy
Hook installation failure	Silent catch, log debug, continue
chrome.storage read failure	Use default values, log warning
Interest tab open/close failure	Silent catch, mark cycle as degraded, continue
Proxy unavailable	Extension continues without proxy layer, show indicator in popup
Geo override failure	Silent catch, browser uses real geo (logged as warning)
Proxy parse error	Pass request through unmodified, increment error counter
24.3 Proxy Error Policy

Rust

// proxy/src/main.rs

async fn handle_request(req: Request<Body>, stats: SharedStats) -> Result<Response<Body>, hyper::Error> {
    // If mutation pipeline panics or errors, pass through unmodified
    // Never drop the user's request due to our processing errors
    let mutated = std::panic::catch_unwind(|| process_request(req, stats.clone()))
        .unwrap_or_else(|_| {
            warn!("Request processing panicked — passing through unmodified");
            // Return original request (requires ownership — refactor to Arc in production)
            Request::default()
        });

    let client = Client::new();
    client.request(mutated).await
}

25. Dependency Registry
25.1 Extension Dependencies

JSON

// extension/package.json

{
  "name": "facadeproxy-extension",
  "version": "1.0.0",
  "private": true,
  "devDependencies": {
    "typescript":              "^5.x",
    "vite":                    "^5.x",
    "@crxjs/vite-plugin":      "^2.x",
    "vitest":                  "^1.x",
    "@playwright/test":        "^1.x",
    "eslint":                  "^8.x",
    "@typescript-eslint/eslint-plugin": "^7.x"
  },
  "dependencies": {}
}

    Note: FacadeProxy's extension has zero runtime dependencies (no React, no lodash, no frameworks). All code is vanilla TypeScript compiled to plain JS. This minimizes extension size and reduces the dependency attack surface.

25.2 Rust Proxy Dependencies

toml

# proxy/Cargo.toml

[package]
name    = "facadeproxy"
version = "1.0.0"
edition = "2021"

[dependencies]
# HTTP
hyper  = { version = "1.x", features = ["full"] }
tokio  = { version = "1.x", features = ["full"] }
hyper-util = "0.x"

# Serialization
serde       = { version = "1.x", features = ["derive"] }
serde_json  = "1.x"

# Randomness
rand = "0.8.x"

# Logging
tracing            = "0.1.x"
tracing-subscriber = { version = "0.3.x", features = ["env-filter"] }

# Config
toml = "0.8.x"

# HTTP types
http = "1.x"
bytes = "1.x"

[dev-dependencies]
tokio-test = "0.4.x"

25.3 External Tools Required
Tool	Version	Required For	Install
Node.js	≥ 20	Extension build	brew install node / apt install nodejs
Rust	≥ 1.78	Proxy build	curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
Git	Any	Source checkout	Pre-installed
Chrome/Chromium	≥ 120	Extension target	Pre-installed
Firefox	≥ 120	Extension target (optional)	Pre-installed
Playwright	Latest	E2E tests	npx playwright install
26. Milestone & Phased Rollout Plan
Phase 1 — Core Extension (Weeks 1–3)

Goal: Working MV3 extension with fingerprint spoofing in MAIN world

    Set up TypeScript + Vite + @crxjs/vite-plugin build pipeline
    Implement manifest.json (MV3, correct permissions)
    Implement two-script injection strategy (ISOLATED → MAIN)
    Implement persona.ts with seeded persona generation
    Implement FingerprintSpoofer: Canvas, WebGL, Navigator, Screen
    Implement GeolocationRotator with 10-city pool
    Implement service worker: storage init, persona seed generation
    Implement popup UI: stats display, toggle
    Unit tests: persona determinism, coherence constraints
    Manual verification: test page shows spoofed values

Deliverable: Extension blocks 5 fingerprint surfaces. Popup shows persona. Toggle works.
Phase 2 — Behavioral Noise & Interest Poisoning (Weeks 4–5)

Goal: Behavioral and interest-layer obfuscation

    Implement BehaviorSimulator: mouse, scroll, typing
    Implement safe input targeting logic + test coverage
    Implement InterestPoisoner: background tab cycle
    Implement chrome.alarms scheduler
    Implement interest poisoning disclosure modal (first run)
    Connect stat increments to popup display
    Batch stat writes to avoid storage thrashing
    Unit tests: safe input detection, alarm registration

Deliverable: Extension generates behavioral noise and runs hourly interest poisoning cycles.
Phase 3 — Audio Spoofing & Coherence Hardening (Week 6)

Goal: Complete fingerprint surface coverage and coherence enforcement

    Implement OfflineAudioContext buffer perturbation
    Implement AudioContext.createOscillator wrapping
    Audit persona coherence: all 1000-seed sweep for constraint violations
    Implement timezone hint in persona (for v2 coherence — display only in v1)
    Anti-detection: remove obvious global variable traces
    Cross-browser test: Firefox MV3 DOM injection fallback
    E2E test: canvas fingerprint differs across sessions

Deliverable: All 5 fingerprint surfaces spoofed. Coherence validated.
Phase 4 — Local Rust Proxy (Weeks 7–9)

Goal: HTTP-layer header/cookie mutation

    Set up Rust + Hyper + Tokio project
    Implement CONNECT tunnel handler
    Implement header mutator: UA pool, Accept-Language, strip headers
    Implement cookie poisoner with prefix matching
    Implement param stripper
    Implement stats API server (port 8889)
    Implement config file loader (config.toml)
    Rust unit tests: all mutators
    Extension: proxy health check poll in popup
    README: browser proxy configuration instructions

Deliverable: Proxy mutates HTTP headers and cookies. Extension popup shows proxy status.
Phase 5 — Polish, Hardening & Distribution (Weeks 10–12)

Goal: Production quality, packaged for distribution

    Full E2E test suite (Playwright)
    Performance benchmarking (proxy latency, extension injection timing)
    Security audit: proxy binding, cookie targeting safety, hook detectability
    Chrome Web Store submission prep (privacy policy, screenshots, description)
    Firefox Add-ons submission prep
    GitHub Releases with cross-platform proxy binaries
    Installation script (install.sh)
    Comprehensive README and CONFIGURATION.md
    Achieve ≥ 80% unit test coverage (extension), ≥ 90% (proxy)

Deliverable: v1.0 public release.
27. Open Questions & Future Work
27.1 Open Technical Questions
Question	Status	Notes
How to handle Permissions-Policy: geolocation=() headers that block JS geo?	Open	If server blocks the API, our override never runs
Should timezone (Intl.DateTimeFormat) be spoofed to match geo city?	Deferred to v2	Cross-signal coherence requires paired geo + timezone + language
Firefox MV3 world: "MAIN" GA when?	Monitoring	Firefox MV3 MR2 rollout — track MDN changelog
Cookie poisoning: should we target SameSite=None cookies only?	Open	Broader targeting = more coverage but higher accidental session breakage risk
How to detect and skip sites where interest poisoning would cause harm (e.g. medical)?	Open	Hardcoded allowlist of categories? User-defined exclusions?
Should persona rotate per-domain instead of per-session?	Debated	Per-domain is harder to correlate cross-site but per-session is simpler to implement
27.2 Potential Future Modules
Module	Description	Priority
Timezone Coherence	Spoof Intl.DateTimeFormat().resolvedOptions().timeZone to match geo persona	High
Font Metric Obfuscation	Intercept CSS font metric APIs used in fingerprinting	High
WebRTC IP Leak Prevention	Override RTCPeerConnection to prevent real IP exposure via STUN	High
TLS Interception (v2)	Optional MITM mode for full HTTPS header/cookie mutation	Medium
Persona Marketplace	Import/export signed persona definitions from community	Low
Per-Domain Persona Assignment	Use different personas for different site categories	Medium
Network Information API Spoof	Override navigator.connection type/speed	Low
Battery API Removal	Override navigator.getBattery() to return null (already removed in most browsers)	Low
Permissions API Spoof	Override navigator.permissions.query() results	Medium
Chrome DevTools Integration	Show active persona in DevTools panel for debugging	Low
27.3 Known Limitations at v1.0

    isTrusted = false: Synthetic DOM events are labeled synthetic by the browser. Sophisticated platforms filter them. Behavioral noise effectiveness varies by platform.

    HTTP-only proxy mutation: Cookie and header poisoning applies only to plaintext HTTP traffic in v1.0. HTTPS traffic is tunneled opaquely.

    No WebRTC protection: RTCPeerConnection STUN/TURN can expose the real IP even if geolocation is spoofed.

    No timezone spoofing: Intl.DateTimeFormat timezone is not spoofed. A Paris geo persona with a US/Eastern timezone is an inconsistency that can be detected.

    Interest poisoning is detectable: Background tabs can be detected by publishers via extension fingerprinting, tab focus signals, or request timing analysis. It is a best-effort signal obfuscator, not a hard privacy guarantee.

    Extension itself is detectable: Any sufficiently motivated adversary can detect the presence of a Chrome extension. FacadeProxy reduces its surface but cannot eliminate its detectability entirely.

End of FacadeProxy Comprehensive Engineering Design Document — v1.0

This document covers the complete obfuscation architecture. The system is designed for personal privacy research and user-controlled identity noise injection. All behavioral automation is non-destructive and contained to the user's own browser session. No third-party infrastructure is harmed. All processing is local.
