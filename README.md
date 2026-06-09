🎭 FacadeProxy: Comprehensive Engineering Reference & User Guide
========================================================================
> **A User-Owned, Local-First Identity Obfuscation System Composed of a Manifest V3 Browser Extension and a High-Performance Local HTTP/HTTPS Mutation Proxy.**
---
## 1. Executive Summary & Vision
Modern tracking infrastructure operates by building persistent, high-entropy models of individual users across sessions, devices, and domains. These models rely on compiling data from multiple layers: browser fingerprints (Canvas, WebGL, Audio), behavioral telemetry (mouse curves, typing cadence), geolocation, network-layer signals (headers, client hints), and cross-site cookies. 
The conventional response—outright blocking—has significant drawbacks. It is easily detectable by anti-adblock scripts, often triggers paywalls or CAPTCHAs, and degrades site functionality.
**FacadeProxy** takes a different approach: **obfuscate and contaminate**. 
By injecting carefully calibrated, coherent noise across all signal layers simultaneously, it reduces the reliability of tracking models without causing UX breakage. Instead of blocking scripts, FacadeProxy feeds them high-entropy, realistic, but completely false data. Over time, this contaminates the tracking database, making the user's profile useless for targeted advertising and identity correlation.
FacadeProxy runs entirely on the user's machine. **No cloud services. No remote telemetry. Zero external data leaks.**
---
## 2. Architectural Design & Traffic Flow
FacadeProxy operates as a two-layer shield working in perfect coordination:
```
┌──────────────────────────────────────────────────────────────────────┐
│ USER'S MACHINE                                                       │
│                                                                      │
│    ┌───────────────┐      ┌────────────────────────────────────────┐ │
│    │               │      │ FACADEPROXY BROWSER EXTENSION          │ │
│    │   Browser     │      │                                        │ │
│    │  (Chrome /    │      │ ┌──────────────┐    ┌────────────────┐ │ │
│    │   Firefox)    │◄────►│ │ Content      │    │ Background     │ │ │
│    │               │      │ │ Script       │◄──►│ Service Worker │ │ │
│    │               │      │ │ (MAIN World) │    │ (MV3 Alarms)   │ │ │
│    └───────┬───────┘      │ └──────┬───────┘    └────────┬───────┘ │ │
│            │              └────────┼─────────────────────┼─────────┘ │
│            │                       │                     │           │
│            │               Canvas/WebGL/Audio    Hourly Background   │
│            │               Navigator/Geo Hooks   Interest Poisoning  │
│            │                       │                     │           │
│   (If Proxy Configured)            ▼                     ▼           │
│            ▼              ┌────────────────────────────────────────┐ │
│    ┌───────────────┐      │ Intercepted API Calls                  │ │
│    │  LOCAL RUST   │      │ Returns Coherent, Seeded Noise         │ │
│    │     PROXY     │      └────────────────────────────────────────┘ │
│    │(127.0.0.1:8888)      │                                          │
│    │               │      │   * Dynamic Canvas Perturbation          │
│    │ ┌───────────┐ │      │   * WebGL GPU Shim (Apple Coherence)     │
│    │ │ Header    │ │      │   * Microscopic Audio Buffer Phase Shift │
│    │ │ Mutator   │ │      │   * Geolocation Metropolitan Jitter      │
│    │ └───────────┘ │      │                                          │
│    │ ┌───────────┐ │                                                 │
│    │ │ Cookie    │ │                                                 │
│    │ │ Poisoner  │ │                                                 │
│    │ └───────────┘ │                                                 │
│    └───────┬───────┘                                                 │
└────────────┼─────────────────────────────────────────────────────────┘
             │
      Forwarded Safe
      Outbound Traffic
             ▼
        INTERNET
```
### Step-by-Step Traffic Lifecycle:
1.  **Document Start Injection**: When a user navigates to any web page, the extension's Isolated World content script (`content/injector.js`) immediately bootstraps and programmatically injects `content/main_world_injector.js` into the page's **MAIN Execution World** before any page-level scripts can run.
2.  **API Hooking**: The injected script overrides native prototype methods for Canvas 2D (`getImageData`, `toDataURL`, `toBlob`), WebGL (`getParameter`), AudioContext (`getChannelData`, `copyFromChannel`), Geolocation (`getCurrentPosition`, `watchPosition`), and Navigator/Screen dimensions.
3.  **Seeded Persona Spoofing**: When tracking scripts query these APIs, they receive realistic, coherent dummy values that are deterministically generated from a session seed. This ensures that your fingerprint remains consistent across a single browsing session, evading "incoherence alarms."
4.  **Behavioral Noise Generation**: In the background, the simulator generates human-like Bezier mouse splines, scroll events, and typing timing jitters (+/- 15ms) to scramble biometric analytics, automatically bypassing sensitive form fields (credit cards, passwords) via the DOM boundary safety filter.
5.  **Interest Poisoning**: The background service worker fires hourly alarms, opening tracking-heavy sites in inactive, discarded background tabs. This loads advertiser cookies with contradictory browsing signals (Finance + Gardening + Cooking) before automatically closing them after 5 seconds.
6.  **Network Layer Sanitation**: If configured, outbound HTTP requests pass through the local Rust proxy (`127.0.0.1:8888`). The proxy:
    *   Rotates the `User-Agent` and `Accept-Language` to match the active persona.
    *   Deletes tracking headers (like Google's `X-Client-Data`, Client Hints, and `DNT`).
    *   Strips tracking query parameters (UTM campaigns, `fbclid`, `gclid`).
    *   Scrambles the values of targeted tracker cookies (like `_ga`, `_gid`, `_fbp`) with high-entropy alphanumeric noise while leaving functional session cookies untouched.
---
## 3. Core Modules Deep Dive
### 3.1 Fingerprint Spoofing Engine
*   **Canvas 2D Perturbation**: Instead of returning blank pixels or raising a security error, FacadeProxy reads the canvas image data and introduces a microscopic, imperceptible color shift (max `+/- 1` unit on RGB channels) to a fraction of the pixels. This keeps maps, games, and layout drawings looking 100% perfect, but completely alters the cryptographic hash (SHA-256) trackers use for cross-site identification.
*   **WebGL GPU Coherence**: Trackers query WebGL parameters to identify your graphics card. FacadeProxy overrides `UNMASKED_VENDOR_WEBGL` and `UNMASKED_RENDERER_WEBGL`. To prevent detection, it enforces strict **inter-surface coherence** (e.g., it will *only* report an Apple M1/M2/M3 GPU if the operating system platform claims to be `MacIntel`).
*   **Audio DSP Perturbation**: Overrides the `AudioBuffer` channels to inject a microscopic decimal phase/frequency drift (`1e-6` scale). This randomizes the mathematical frequency sum (DFT/FFT) used to profile your sound card's digital signal processor while remaining entirely inaudible to human ears.
*   **Navigator & Screen Shims**: Overrides properties like `navigator.platform`, `hardwareConcurrency`, `deviceMemory`, `languages`, and `screen.width`/`screen.height` to match the active persona. It also overrides `window.innerWidth`/`innerHeight` to maintain physical aspect ratios.
### 3.2 Geolocation Rotation Module
Overrides `navigator.geolocation.getCurrentPosition` and `watchPosition`. Instead of returning your physical GPS coordinates, it selects a metropolitan city from a pool of 10 global hubs (Paris, New York, Tokyo, London, Singapore, Sydney, Berlin, Reykjavik, Rio, Cape Town). 
To make it look natural, it adds a seeded **sub-kilometer coordinate jitter** (`+/- 0.015°` latitude/longitude drift) and introduces a natural network-like delay (100ms - 250ms) before returning the callback, simulating a real GPS lock.
### 3.3 Behavioral Noise Simulator
*   **Human Mouse Splines**: Standard bot generators move the cursor in suspicious, mathematically perfect straight lines. FacadeProxy generates human-like mouse splines using cubic Bezier curves with natural muscle acceleration/deceleration profiles and sub-pixel micro-jitter.
*   **Keystroke Biometric Jitter**: Scrambles typing cadence profiling by adding a randomized timing jitter (+/- 15ms) to keyboard event dwell times (key held down) and flight times (delay between keys).
*   **DOM Input Safety Filter**: To prevent any destructive operations, the behavior simulator scans the DOM using a strict exclusion regex. It completely disables event simulation when the user is focused on checkout forms, credit card fields, password fields, or login inputs.
### 3.4 Interest Profile Poisoner
Operating as a background service worker process, this module contaminates the user's demographic profile in ad networks. It schedules hourly alarms to open selected, high-traffic domains (e.g., Bloomberg, ESPN, Serious Eats, Gardeners) in inactive background tabs. Because the tabs are loaded in a discarded, unfocused state, they do not disrupt the user's active browsing. After 5 seconds—allowing tracking scripts to execute and cookies to set—the worker automatically closes the tabs, introducing high-entropy noise into the tracking database.
### 3.5 Local Rust Proxy (Network Layer)
Written in high-performance, asynchronous Rust using `Tokio` and `Hyper`:
*   **User-Agent & Language Rotation**: Rewrites outbound headers to match the active persona.
*   **Tracking Cookie Poisoning**: Parses the `Cookie` header. It identifies high-entropy tracker cookies (e.g., Google Analytics' `_ga`/`_gid`, Facebook's `_fbp`, Microsoft's `_uetsid`) and scrambles their alphanumeric values with random characters of the exact same length and structure. This corrupts the tracker's database linkage while keeping functional login and shopping cart cookies fully intact.
*   **Query Parameter Stripper**: Cleanses outbound URIs by removing tracking hooks (`utm_source`, `fbclid`, `gclid`, `msclkid`, etc.).
---
## 4. Directory Structure
```
facadeproxy/
├── extension/                       # Manifest V3 Browser Extension
│   ├── manifest.json                # Extension entry point & permissions
│   ├── background/
│   │   └── service_worker.ts        # Alarms, stats, interest poisoning lifecycle
│   ├── content/
│   │   ├── injector.ts              # ISOLATED world document_start bootstrapper
│   │   └── main_world_injector.ts   # MAIN execution world API shims (Canvas, WebGL, Audio)
│   ├── popup/
│   │   ├── popup.html               # Extension action popup layout
│   │   └── popup.ts                 # Popup controller & state rotation triggers
│   └── vite.config.ts               # Vite configuration with @crxjs/vite-plugin
│
├── proxy/                           # Local Rust Mutation Tunnel
│   ├── Cargo.toml                   # Rust crate dependencies
│   ├── src/
│   │   ├── main.rs                  # Core hyper/tokio server & stats JSON API
│   │   ├── header_mutator.rs        # User-Agent rotation, header stripping, UTM cleaner
│   │   └── cookie_poisoner.rs       # Targeted tracking cookie scrambler
│   └── config.toml                  # Local proxy bind settings
│
└── src/                             # Dashboard Overview & Live Simulator (React)
    ├── App.tsx                      # Dashboard wrapper, theme toggle & background ticker
    ├── index.css                    # Custom CSS, audio wave animations, thin scrollbars
    ├── main.tsx                     # React entry mount
    ├── components/
    │   ├── DashboardOverview.tsx    # Live telemetry cards, status logs console
    │   ├── FingerprintObfuscator.tsx# Interactive Canvas/WebGL/Audio sandbox shims
    │   ├── BehaviorSimulatorView.tsx# Mouse Bezier path simulator, keystroke jitter, DOM safety
    │   ├── GeoInterestView.tsx      # SVG world map city pool, GPS jitter, Chaos Index
    │   ├── ProxyPlayground.tsx      # HTTP request editor & mutation pipeline comparisons
    │   ├── PersonaWorkshop.tsx      # Seed generator & Apple Coherence Auditor
    │   ├── TestSandbox.tsx          # Target browser checkout shell & Fingerprint scan E2E
    │   └── CodeExporter.tsx         # Apple IDE style file explorer & downloader
    └── utils/
        ├── cn.ts                    # Tailwind styling merger
        ├── personaEngine.ts         # Seeded PRNG, Bezier curves, and canvas noise math
        └── sourceCode.ts            # Entire extension & proxy codebase repository
```
---
## 5. Coherence & Anti-Detection Matrix
Sophisticated anti-fraud systems (like Cloudflare, Akamai, and DoubleClick) detect basic fingerprint spoofing by looking for contradictions. FacadeProxy enforces a strict **Coherence Matrix** to ensure your profile looks 100% natural:
| Profile Surface | macOS Persona (`MacIntel`) | Windows Persona (`Win32`) | Alignment Constraint |
| :--- | :--- | :--- | :--- |
| **navigator.platform** | `MacIntel` | `Win32` | Must match User-Agent exactly. |
| **WebGL Vendor** | `Apple Inc.` | `Google Inc. (NVIDIA)` | Apple vendor is forced on MacIntel. |
| **WebGL Renderer** | `Apple M2` / `Apple M3` | `ANGLE (NVIDIA GeForce RTX)` | Discrepancies (e.g. RTX GPU on Mac) raise immediate bot flags. |
| **Screen Ratio** | `16:10` / `3:2` (e.g. 1728x1117) | `16:9` (e.g. 1920x1080) | Headless bot default aspect ratios are avoided. |
| **Linguistic Pool** | `en-US`, `en` | `en-US`, `en` | Matches Geolocation country bounds. |
| **Timezone** | Resolved to rotated city | Resolved to rotated city | Geolocation lat/lon must match the system timezone. |
---
## 6. Installation & Setup Guide
### 6.1 Building and Installing the Extension
To build and load the Manifest V3 extension in your browser:
1.  **Build the Extension assets**:
    Navigate to the extension directory, install dependencies, and compile:
    ```bash
    cd extension
    npm install
    npm run build
    ```
    This outputs the compiled extension assets into `dist/extension/`.
2.  **Load in Chrome/Chromium**:
    *   Open Chrome and navigate to `chrome://extensions/`.
    *   Enable **Developer mode** in the top-right corner.
    *   Click **Load unpacked** in the top-left corner.
    *   Select the `dist/extension/` directory.
3.  **Load in Firefox**:
    *   Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
    *   Click **Load Temporary Add-on...**.
    *   Select the `manifest.json` file inside the extension source directory.
---
### 6.2 Compiling and Running the Rust Proxy
The Rust proxy intercepts your network-level headers and scrambles tracking cookies.
1.  **Prerequisites**:
    Ensure you have the Rust toolchain installed (Rust $\ge$ 1.78). If not, install via:
    ```bash
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
    ```
2.  **Compile the Proxy**:
    Navigate to the proxy directory and compile a release build:
    ```bash
    cd proxy
    cargo build --release
    ```
    The compiled binary will be located at `proxy/target/release/facadeproxy`.
3.  **Run the Proxy**:
    Execute the binary. By default, it binds the HTTP tunnel to port `8888` and the telemetry API to port `8889`:
    ```bash
    ./proxy/target/release/facadeproxy
    ```
    Output logs:
    ```text
    🎭 FacadeProxy Local Engine started!
    🚀 HTTP Mutation Tunnel: http://127.0.0.1:8888
    📊 Real-time Stats API:  http://127.0.0.1:8889
    ```
4.  **Configure Your Browser to Use the Proxy**:
    *   **Chrome**: Start Chrome from the terminal with the proxy flag:
        ```bash
        google-chrome --proxy-server="http://127.0.0.1:8888"
        ```
    *   **Firefox**: Go to *Settings* $\rightarrow$ *Network Settings* $\rightarrow$ *Manual proxy configuration*. Set the **HTTP Proxy** to `127.0.0.1` and **Port** to `8888`. Check the box *"Also use this proxy for HTTPS"* (HTTPS requests will pass through via opaque CONNECT tunneling to preserve TLS security).
---
## 7. Performance Targets & Specifications
FacadeProxy is engineered for speed, ensuring that identity protection does not degrade page load times or system performance:
*   **Content Script Latency**: `< 2.0ms`. Hook installation executes at `document_start` using synchronous prototype wrapping before any page scripts can execute.
*   **Persona Generation Overhead**: `< 0.5ms`. Calculated using a high-speed, seeded JSF32 pseudo-random number generator (PRNG).
*   **Canvas Pixel Perturbation**: `< 0.1ms` per call. Uses a strided loop (stride of 64 pixels) to apply noise, ensuring instantaneous renders even on large canvas elements.
*   **Proxy Request Processing Latency**: `< 1.0ms` (P99). Written using asynchronous, non-blocking I/O with Tokio and Hyper, operating strictly on stack-allocated headers.
*   **Proxy Memory Footprint**: `< 10.0 MB`. Optimized Rust binary utilizing minimal allocations and a single-thread loopback binding.
*   **Extension Memory Footprint**: `< 5.0 MB`. Standard vanilla TypeScript with zero runtime dependencies.
---
## 8. Compliance, Ethics & Safety Boundaries
FacadeProxy is designed strictly for personal privacy research, tracking defense, and user-controlled identity noise injection. It adheres to strict safety boundaries:
*   **No Cloud Telemetry**: All data remains local. No logs, stats, seeds, or browsing habits ever leave the user's machine.
*   **Opaque HTTPS CONNECT Tunneling**: FacadeProxy does **NOT** perform Man-in-the-Middle (MITM) SSL/TLS decryption on the proxy level. This preserves your browser's native cryptographic handshake with secure servers, keeping passwords, bank credentials, and session tokens 100% secure.
*   **Safe DOM Inputs**: The behavioral noise simulator is strictly prohibited from dispatching events onto password fields, credit card forms, checkout blocks, or billing addresses, eliminating the risk of accidental transactions or account locks.
*   **Non-Destructive Obfuscation**: The system never alters structural layout arrays or deletes functional cookie keys, ensuring that website layouts remain visually perfect and users stay logged into their accounts.
========================================================================
