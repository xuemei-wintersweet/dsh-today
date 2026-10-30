# dsh-today

English | [简体中文](./README.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node.js Version](https://img.shields.io/badge/Node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org/)
[![DSH Compatibility](https://img.shields.io/badge/DSH-Compatible-blueviolet.svg)](https://github.com/deepseek-ai)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS-lightgrey.svg)](https://github.com/your-username/dsh-today)

`dsh-today` is a local model provider connector plugin developed for DeepSeek Harness (DSH).

It allows users to bridge their locally installed and authorized Today AI desktop client (supporting both Today CN and Today Global) into the DSH ecosystem as a model provider. It automatically reuses local session authorizations to provide model discovery, dual-track reasoning streams, autonomous execution handling, and real-time quota visibility.

---

## How It Works

1. **Credential Resolution & In-Memory Decryption**
   - Automatically locates Today client installation paths under the user profile directory (`%APPDATA%\Today CN` or `%APPDATA%\Today` on Windows; standard Application Support directories on macOS).
   - Decrypts session records in memory via operating system standard APIs (Windows DPAPI `CryptUnprotectData` / macOS Keychain). Tokens exist only in volatile memory and are never written to disk unencrypted or transmitted to external servers.
2. **Protocol Proxying & Session Lifecycle**
   - Establishes direct HTTPS / WebSocket channels with Today cloud infrastructure.
   - Converts standard DSH model requests into upstream protocol formats, caching session contexts across turns to minimize redundant context re-transmission.
3. **Dual-Track Reasoning Stream (Thinking Process)**
   - Captures upstream WebSocket reasoning events and `<think>...</think>` tokens in model responses.
   - Exposes clean reasoning bubbles directly to DSH, collapsing seamlessly into final response text without residual protocol markers.
4. **Autonomous Forwarding (Auto-Pump)**
   - For complex, multi-step tasks, automatically recognizes unread artifacts generated on disk (e.g. unzipped plain text or reports).
   - If the model stalls due to missing inline text, the adapter triggers targeted reading directives to drive the task forward to completion.

---

## Supported Models & Quota Usage

Available models are synchronized directly from upstream endpoints. Calls deduct account quota at standard platform multipliers:

| Model ID | Display Name | Multiplier | Context Window | Recommended Use |
| :--- | :--- | :---: | :---: | :--- |
| `model.deepseek-v4.1-flash` | DeepSeek V4.1 Flash | 1x | 1,000,000 Tokens | Primary recommended model. Strong code reasoning with native thinking streams. |
| `model.minimax-m31-flash` | MiniMax M3.1 Flash | 1x (Promo) | 1,000,000 Tokens | General text comprehension, summarization, and standard tasks. |
| `model.glm-5.3` | GLM 5.3 | 4x | 1,000,000 Tokens | Analytical reasoning across extensive contexts (higher quota multiplier). |

---

## Installation

### Method 1: Standalone Installer (End Users)

1. Download `dsh-today-setup.bat` from the [Releases page](https://github.com/your-username/dsh-today/releases);
2. Double-click the file to execute. It automatically unpacks components, writes configuration to `cordis.yml`, and verifies local credentials;
3. Restart DSH and select `Today CN` from the provider list.

### Method 2: Manual Offline Archive

1. Download `dsh-today-1.2.1.tgz` from [Releases](https://github.com/your-username/dsh-today/releases);
2. Unpack into your DSH node_modules directory using `tar`:
   ```powershell
   mkdir "$HOME\.dsh\profiles\desktop\node_modules\dsh-today" -Force
   tar -xzf dsh-today-1.2.1.tgz -C "$HOME\.dsh\profiles\desktop\node_modules\dsh-today" --strip-components=1
   ```
3. Append the following block to `~/.dsh/profiles/desktop/cordis.yml`:
   ```yaml
   dsh-today:
     region: cn
     enableNativeDeviceTools: true
     responseTimeoutMs: 120000
   ```
4. Restart DSH.

### Method 3: Build from Source

For development or security audits:

```bash
git clone https://github.com/your-username/dsh-today.git
cd dsh-today
npm install
npm run check
npm run build
```

---

## CLI Utilities

The package includes a built-in command line interface for diagnostics and local proxying:

```bash
# Diagnostic self-check (sanitized, zero credential exposure)
npx dsh-today doctor

# Query account subscription status and usage breakdown
npx dsh-today status

# Start local 127.0.0.1 OpenAI-compatible proxy (default port 18421)
npx dsh-today serve 18421
```

External tools like Cursor or Cline can connect via `http://127.0.0.1:18421/v1`.

---

## Privacy & Security Boundaries

- **Local Execution**: All authentication and streaming remain exclusively between local host memory and loopback interface (`127.0.0.1`).
- **Zero Telemetry**: The codebase contains no telemetry probes, third-party analytics, or external telemetry relays.
- **Authorized Credentials Only**: Contains no binary cracking, dynamic signature reverse engineering, or credential circumvention logic. It strictly reuses credentials authorized through the user's official client sign-in.

---

## Disclaimer

1. **Non-Official Software**: `dsh-today` is an independent interoperability tool. It is not affiliated with, sponsored by, or endorsed by Today AI or DeepSeek.
2. **Quota Deductions**: Invocations consume the user's authentic account quota at upstream published rates. The tool provides no means to bypass billing or alter subscription limits.
3. **Terms of Service**: Non-official API usage may carry risk under third-party Terms of Service. Users assume all responsibility for account compliance.
4. **Takedown Policy**: The maintainers respect intellectual property rights. If a rights holder has concerns regarding this repository, please open an Issue. Action will be taken within 24 to 48 hours.

See [DISCLAIMER.md](./DISCLAIMER.md) for full terms.

---

## License

Distributed under the [MIT License](./LICENSE). Third-party references and notices are detailed in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
