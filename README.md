# dsh-today

[English](./README.en.md) | 简体中文

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node.js Version](https://img.shields.io/badge/Node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org/)
[![DSH Compatibility](https://img.shields.io/badge/DSH-Compatible-blueviolet.svg)](https://github.com/deepseek-ai)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS-lightgrey.svg)](https://github.com/your-username/dsh-today)

`dsh-today` 是针对 DeepSeek Harness (DSH) 开发的本地模型连接器插件。

该插件允许用户将本机已安装并登录的 Today AI（支持国内版 Today CN 与国际版 Today Global）桌面客户端作为 Provider 接入 DSH 生态。它自动复用本地已授权会话，提供完整的模型发现、双轨思考流解析、长任务自驱动执行及实时配额感知能力。

---

## 工作原理

1. **凭证加载与解密**
   - 自动探测系统用户目录下的 Today 客户端数据（Windows 下位于 `%APPDATA%\Today CN` 或 `%APPDATA%\Today`，macOS 下位于对应 Application Support 目录）。
   - 通过系统标准安全接口（Windows DPAPI `CryptUnprotectData` / macOS Keychain）在本地内存中完成解密。凭证仅在运行内存中流转，不向磁盘写入明文，不回传任何第三方服务器。
2. **协议转发与会话生命周期**
   - 建立与 Today 云端接口的端到端 HTTPS / WebSocket 连接。
   - 将 DSH 的标准 LLM 调度请求按上游协议进行封装，支持按 Turn 缓存与会话复用，避免每次工具调用时全量重传上下文。
3. **双轨思考流处理 (Dual-Track Thinking)**
   - 捕获上游 WebSocket 思考事件及响应内容中的 `<think>...</think>` 推理标签。
   - 向 DSH 宿主分发标准的折叠思考气泡（Reasoning Stream），思考结束后平滑过渡为正文输出。
4. **自主执行推进 (Auto-Pump)**
   - 针对长任务与代码解包场景，自动识别解包生成的中间工件路径（如临时提取的文本、报表文件）。
   - 当检测到模型因上下文未直接载入文本而产生停顿或询问时，插件在底层自动触发读入指令，协助模型完成整套任务交付，减少不必要的人工介入。

---

## 支持模型与配额说明

插件通过读取上游接口实时同步可用模型池。调用时会按官方公布的倍率如实扣除使用者自身账号的可用额度：

| 模型 ID | 模型显示名称 | 计费倍率 | 上下文长度 | 适用场景 |
| :--- | :--- | :---: | :---: | :--- |
| `model.deepseek-v4.1-flash` | DeepSeek V4.1 Flash | 1x | 1,000,000 Tokens | 推荐主力模型。代码生成与逻辑推理能力强，支持原生折叠思考流。 |
| `model.minimax-m31-flash` | MiniMax M3.1 Flash | 1x (限时) | 1,000,000 Tokens | 通用文本理解、总结与问答。 |
| `model.glm-5.3` | GLM 5.3 | 4x | 1,000,000 Tokens | 复杂长文与多步骤分析（消耗倍率较高，按需选用）。 |

---

## 安装方法

### 方式一：单文件自动化安装（适合终端用户）

1. 从 [Releases 页面](https://github.com/your-username/dsh-today/releases) 下载 `dsh-today-setup.bat`；
2. 双击运行该脚本。脚本将自动完成环境检测、依赖解包、`cordis.yml` 注入与自检测试；
3. 重启 DSH 客户端即可在 Provider 列表中看到 `Today CN`。

### 方式二：离线压缩包手动安装

1. 从 [Releases 页面](https://github.com/your-username/dsh-today/releases) 下载最新版本的 `dsh-today-1.2.1.tgz`；
2. 使用 Windows 自带的 `tar` 工具将其解压至 DSH 运行目录：
   ```powershell
   mkdir "$HOME\.dsh\profiles\desktop\node_modules\dsh-today" -Force
   tar -xzf dsh-today-1.2.1.tgz -C "$HOME\.dsh\profiles\desktop\node_modules\dsh-today" --strip-components=1
   ```
3. 编辑 `~/.dsh/profiles/desktop/cordis.yml`，在文件末尾追加：
   ```yaml
   dsh-today:
     region: cn
     enableNativeDeviceTools: true
     responseTimeoutMs: 120000
   ```
4. 重启 DSH。

### 方式三：从源码构建

适合需要二次开发或进行代码审查的用户：

```bash
git clone https://github.com/your-username/dsh-today.git
cd dsh-today
npm install
npm run check
npm run build
```

---

## CLI 工具说明

插件内置了命令行工具，可用于环境排错、查询配额或开启独立服务：

```bash
# 1. 运行环境与本地凭据自检（完全脱敏，不输出密钥）
npx dsh-today doctor

# 2. 查询当前账号套餐状态与实时配额使用情况
npx dsh-today status

# 3. 启动本地 127.0.0.1 OpenAI 兼容代理服务器（默认端口 18421）
npx dsh-today serve 18421
```

启动本地代理后，可供 Cursor、Cline 等第三方工具通过 `http://127.0.0.1:18421/v1` 进行接入。

---

## 隐私与安全边界

- **完全本地运行**：认证信息与模型流式通信仅在本地宿主机内存与环回地址（`127.0.0.1`）之间传输。
- **无外部数据收集**：代码内不包含任何遥测（Telemetry）、埋点统计或外部中继服务。
- **正规凭据调用**：不包含密码暴力破解、动态加签逆向或伪造设备特征等破坏性逻辑，纯粹复用使用者通过官方客户端合法登录生成的本地凭据。

---

## 免责声明

1. **非官方工具**：本项目为独立的开源互操作性适配工具，与 Today AI、其母公司或 DeepSeek 官方无任何隶属、合作或授权关系。
2. **正规扣费说明**：使用本插件发起的调用将按照上游服务商标准真实扣除使用者账号的额度或时长。本工具不提供任何形式的提权、免计费或增加额外额度的功能。
3. **服务协议风险**：调用非官方接口可能违反上游平台的服务协议（ToS）。使用者需自行承担因使用本工具可能导致的账号受限、风控或封禁风险。
4. **即时下架政策**：项目维护者充分尊重各方知识产权。若相关权利方认为本项目存在合规争议，请提交 Issue 反馈，维护者将在核实后 24 至 48 小时内配合修改或下架。

详细内容请参阅 [DISCLAIMER.md](./DISCLAIMER.md)。

---

## 开源协议

本项目基于 [MIT License](./LICENSE) 分发。
项目中涉及的第三方协议规范与技术参考请参见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。
