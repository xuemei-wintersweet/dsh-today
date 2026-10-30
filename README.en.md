<h1 align="center">dsh-today</h1>

<p align="center"><b>Connect locally authorized Today AI models (DeepSeek V4.1 Flash, MiniMax M3.1 Flash, GLM 5.3) to DeepSeek Harness (DSH) — featuring native Dual-Track Thinking presentation, Autonomous Task Auto-Pump engine, and zero-leak local DPAPI credentials.</b></p>

<p align="center">
  <a href="README.md">中文文档</a> ·
  <a href="#installation-guide">Installation</a> ·
  <a href="#core-features">Features</a> ·
  <a href="#architecture--principles">Architecture</a> ·
  <a href="#supported-hosts--environments">Host Matrix</a> ·
  <a href="#troubleshooting--faq">Troubleshooting</a> ·
  <a href="#disclaimer">Disclaimer</a>
</p>

<p align="center">
  <a href="https://github.com/xuemei-wintersweet/dsh-today/releases"><img src="https://img.shields.io/github/v/release/xuemei-wintersweet/dsh-today?style=flat-square&label=release" alt="latest release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/xuemei-wintersweet/dsh-today?style=flat-square" alt="MIT license"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-%3E%3D20.0.0-blue?style=flat-square" alt="node version"></a>
  <img src="https://img.shields.io/badge/dsh--plugin-compatible-green?style=flat-square" alt="dsh-plugin">
  <img src="https://img.shields.io/badge/tests-35%20passed-brightgreen?style=flat-square" alt="tests passed">
</p>

---

## Risk Disclosure & Usage Scope

> **Important Notice: This project is an independent open-source interoperability tool. Please read the [Disclaimer](#disclaimer) at the bottom before using.**

1. **Avoid Double-Client Switching**: The purpose of this plugin is to eliminate the friction of switching back and forth between the official Today AI desktop application and DeepSeek Harness (DSH) by routing locally authorized sessions directly into DSH's model selector.
2. **Legitimate Billing**: This tool contains no cracking, reverse key forgery, or quota circumvention mechanisms. All inference calls are billed according to standard upstream rates against your own account quota.
3. **Upstream Protocol Alignment**: The plugin relies on the official desktop client's local session formats and protocol frames. Upstream modifications may require plugin updates.

---

## Installation Guide

### Method 1: DSH Plugin Marketplace Installation (Recommended, Pinned)

This plugin fully adheres to the official DSH bundle specifications (`dsh-plugin`). Install directly through the DSH plugin manager CLI:

```sh
dsh plugin --profile desktop add dsh-today
```

If you have downloaded the offline release package `dsh-today-1.2.1.tgz`, install directly using the local path:

```sh
dsh plugin --profile desktop add ./dsh-today-1.2.1.tgz
```

Restart your DSH NEXT client after installation to apply changes.

---

### Method 2: Windows All-in-One Standalone Installer (Fully Offline)

Ideal for air-gapped environments, machines without npm, or users seeking zero-configuration setup:

1. Download `dsh-today-setup.bat` from the GitHub Releases page (or use the one in the project root);
2. Double-click `dsh-today-setup.bat`;
3. The script automatically:
   - Validates the local Node.js environment;
   - Locates the active DSH desktop profile directory (`~/.dsh/profiles/desktop/`);
   - Unpacks precompiled production assets from embedded data;
   - Registers the local source via DSH native `link:` protocol (supports seamless uninstallation and reinstallation via UI without remote npm dependencies);
   - Injects `cordis.yml` configuration (with automatic timestamped backups);
   - Executes `bin.js doctor` self-diagnostics.
4. Restart DSH NEXT and select `Today CN / DeepSeek V4.1 Flash` in the model selector.

---

### Method 3: Build from Source

For developers auditing code, reviewing changes, or customizing behavior:

```sh
git clone https://github.com/xuemei-wintersweet/dsh-today.git
cd dsh-today
npm install
npm run check   # Runs typecheck, 35-suite unit tests, and production build
npm pack
```

---

## Supported Hosts & Environments

DSH NEXT checks peer package declarations upon boot. Mismatched host versions are safely skipped.

### 1. DSH Host Compatibility Matrix

| Host Version | Status | Notes |
| :--- | :--- | :--- |
| **0.1.7-rc.1 ~ 0.1.7-rc.2** | Fully Supported | Baseline for DSH external bundle plug-in architecture |
| **0.2.x Stable** (0.2.0, 0.2.1 ...) | Fully Supported | Verified on live production hosts |
| **0.2.x Prerelease** (rc/alpha) | Supported | Functional via direct `tgz` or directory loading |
| **>= 0.3.0-0** | Not Yet Verified | Bound by `<0.3.0-0` safety isolation rule |
| **<= 0.1.6** | Unsupported | Pre-bundle architecture lacking model provider interfaces |

### 2. Operating System & Platform Support

| Platform | Tier | Credential Store Mechanism |
| :--- | :--- | :--- |
| **Windows** | **Tier 1** | Verified on Windows 11. Decrypts via native Windows DPAPI (`CryptUnprotectData`); probes `%APPDATA%\Today CN` |
| **macOS** | Supported | Reads `~/Library/Application Support/Today CN`, supports Keychain interop |
| **Linux** | Supported | Reads `$XDG_CONFIG_HOME/Today CN` with headless environment variable fallback |

**Node.js Runtime Requirement**: `>= 20.0.0` (tested on Node.js v24.22.1).

---

## Core Features

- **Native Dual-Track Thinking**:
  Decodes reasoning stream chunks and `<think>...</think>` tags to reliably illuminate DSH's native thinking bubbles. Thinking transitions smoothly into the final response bubble upon completion.
- **Autonomous Task Engine (Auto-Pump)**:
  Prevents models from prematurely stopping with excuses during multi-stage tasks. Detects newly created intermediate files (e.g. extracted text, reports) and prompts the model to deliver complete artifacts in a single turn.
- **In-Memory DPAPI Decryption**:
  Reads credentials directly from the official desktop app's session state. Decrypted in process memory using Windows DPAPI, ensuring zero plaintext leakage, zero external telemetry, and zero token uploads.
- **Multi-Region & Model Matrix**:
  Supports Today CN (Domestic) and Today Global, dynamically retrieving model catalogs and billing multipliers.
- **Air-Gapped & Offline Resilience**:
  Packaged with embedded runtime assets, allowing full installation in air-gapped, proxied, or completely offline environments without external network fetches.

---

## Architecture & Principles

```text
DSH NEXT (Cordis Architecture)
  │
  ├── [PiAiAdapter] (Model Provider Routing Layer)
  │      │
  │      ▼ (HTTP 127.0.0.1 Loopback)
  ├── [Today Local Loopback Shim] (Dynamic Port + Random Token Authorization)
  │      │
  │      ▼
  ├── [TodayUpstreamClient] (SSE Protocol Parser & Dual-Track Separation)
  │      │
  │      ├── [CredentialStore] ──► Windows DPAPI (CryptUnprotectData)
  │      │                         Reads %APPDATA%/Today CN Session
  │      ▼
  └── Upstream Today AI Cloud Gateway (api.todayai.cn)
         │
         ▼ (SSE Stream: reasoning_content + content)
      DSH Folded Thinking Bubble + Final Markdown Bubble
```

---

## Model Directory & Multipliers

| Model ID | Foundation Base | Multiplier | Context Window | Recommended Use Case |
| :--- | :--- | :---: | :---: | :--- |
| `model.deepseek-v4.1-flash` | DeepSeek V4.1 | **1.0×** | 1,000,000 | **Primary Recommendation**: Deep code refactoring, full-repo analysis |
| `model.minimax-m31-flash` | MiniMax M3.1 | **0.0× ~ 0.5×** | 1,000,000 | **Fast Routine Work**: General Q&A, syntax checks, concise responses |
| `model.glm-5.3` | GLM-4 / 5 Series | **4.0×** | 200,000 | Multi-step mathematical and domain-specific logic |

---

## CLI Utilities

The package includes CLI tools for out-of-band diagnostics and proxy serving:

```powershell
# 1. Environment and credential diagnostics (scrubbed, zero secrets output)
npx dsh-today doctor

# 2. View current plan details and remaining quota
npx dsh-today status

# 3. List all upstream model IDs registered on Today Cloud
npx dsh-today models

# 4. Start local 127.0.0.1 OpenAI-compatible proxy (default port 18421)
npx dsh-today serve 18421
```

---

## Troubleshooting & FAQ

### Q1: Today models do not appear in DSH model selector?
1. Check that `~/.dsh/profiles/desktop/cordis.yml` contains the `dsh-today` block:
   ```yaml
   dsh-today:
     region: cn
     enableNativeDeviceTools: true
     responseTimeoutMs: 120000
   ```
2. Make sure to restart DSH NEXT completely after editing configurations.

### Q2: `doctor` reports `Auth State: missing`?
- The plugin reuses your existing Today AI desktop client session. Launch Today AI desktop app, sign in to your account, and re-run `doctor`.

### Q3: Thinking bubble disappears or does not fold?
- Ensure your DSH profile core packages are version `0.1.7-rc.1` or higher. If prior conversation history contains models that do not support reasoning streams, start a new chat session.

### Q4: HTTP 429 rate limit or connection refused?
- Run `npx dsh-today status` to verify account quota. If a short-term rate limit was triggered, wait 1–2 minutes before retrying.

### Q5: Long context warning?
- While `deepseek-v4.1-flash` supports up to 1M tokens, single requests over 200K tokens may experience increased latency. Use `/compact` to summarize earlier context when necessary.

### Q6: DSH enters Recovery Mode with JSON parse error?
- Legacy PowerShell 5.1 scripts sometimes prepend a UTF-8 BOM (`0xEF 0xBB 0xBF`) to `package.json`. Run `dsh-today-setup.bat` to automatically restore clean UTF-8 formatting without BOM.

---

## Disclaimer

1. **Unofficial Tool**: This is an independent open-source project and is not affiliated with, endorsed by, or sponsored by Today AI or DeepSeek AI.
2. **Legitimate Billing**: All inference token consumption is billed directly against your authorized account quota per standard upstream terms.
3. **Terms of Service**: Users are responsible for complying with upstream service terms.
4. **Takedown Policy**: Project maintainers respect intellectual property. For compliance notices, please file an issue for immediate review and resolution within 24–48 hours.

Read [DISCLAIMER.md](./DISCLAIMER.md) for complete details.

---

## License & Acknowledgments

- Licensed under the [MIT License](./LICENSE).
- Thanks to the [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) team for their agentic ecosystem.
- Special appreciation to `dingminhua/dsh-connect-workbuddy` for setting high engineering benchmarks in DSH plugin architecture.
