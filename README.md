<h1 align="center">dsh-today</h1>

<p align="center"><b>把本机登录的 Today AI 模型（DeepSeek V4.1 Flash / MiniMax M3.1 Flash / GLM 5.3 等）接入 DeepSeek Harness —— 支持原生双轨思考过程呈现、自驱动 Auto-Pump 任务交付引擎与本地安全 DPAPI 凭据解密。</b></p>

<p align="center">
  <a href="README.en.md">English</a> ·
  <a href="#安装指南">安装指南</a> ·
  <a href="#核心功能特性">核心特性</a> ·
  <a href="#工作原理与架构">工作原理</a> ·
  <a href="#受支持的宿主与环境">宿主适配</a> ·
  <a href="#常见问题与排错手册">排错手册</a> ·
  <a href="#免责声明">免责声明</a>
</p>

<p align="center">
  <a href="https://github.com/xuemei-wintersweet/dsh-today/releases"><img src="https://img.shields.io/github/v/release/xuemei-wintersweet/dsh-today?style=flat-square&label=release" alt="latest release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/xuemei-wintersweet/dsh-today?style=flat-square" alt="MIT license"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-%3E%3D20.0.0-blue?style=flat-square" alt="node version"></a>
  <img src="https://img.shields.io/badge/dsh--plugin-compatible-green?style=flat-square" alt="dsh-plugin">
  <img src="https://img.shields.io/badge/tests-35%20passed-brightgreen?style=flat-square" alt="tests passed">
</p>

---

## 风险提示与使用边界

> **重要说明：本插件为独立的开源互操作性适配工具。使用前请仔细阅读文末[「免责声明」](#免责声明)，自行评估使用风险。**

1. **避免双端切换**：本插件的核心目标在于打通已在本地登录的 Today AI 官方桌面客户端会话，将其云端模型配额作为标准模型提供方接入 DeepSeek Harness (DSH)，免去在独立客户端与开发环境之间复制粘贴的流程。
2. **合法正规扣减**：插件不提供任何账号破解、绕过付费或伪造额度的功能。每一次模型对话均按照上游服务商既定规则如实计费并扣除您个人账号的可用额度或时长。
3. **接口依从性**：插件依赖 Today 桌面端本地会话协议与数据流传输机制，若官方上游调整接口结构，插件将跟进发布适配补丁。

---

## 安装指南

### 方式一：DSH 插件市场安装（推荐，置顶）

本插件符合 DSH 官方插件规范（`dsh-plugin`）。已在 DSH 环境中配置对应注册表或发布后，直接在终端执行标准添加命令：

```sh
dsh plugin --profile desktop add dsh-today
```

若您已下载本仓库提供的离线归档包 `dsh-today-1.2.1.tgz`，可直接通过本地路径进行离线安装：

```sh
dsh plugin --profile desktop add ./dsh-today-1.2.1.tgz
```

执行后重启 DSH NEXT 客户端即可生效。

---

### 方式二：Windows 独立单文件一键安装（全离线，免命令行）

适用于断网机器、无 NPM 环境或希望一键自动部署的用户：

1. 在 Release 页面下载 `dsh-today-setup.bat`（或直接使用本仓库根目录下的批处理程序）；
2. 双击运行 `dsh-today-setup.bat`；
3. 脚本将自动完成：
   - 本地 Node.js 运行时环境校验；
   - 自动定位当前系统的 DSH profile 路径（`~/.dsh/profiles/desktop/`）；
   - 从内嵌数据流中解包全量预编译运行时文件；
   - 自动在 `package.json` 注册依赖并安全追加 `cordis.yml` 注入配置（自带带时间戳的防损备份）；
   - 自动调用 `bin.js doctor` 完成本地凭据与客户端状态自检。
4. 重启 DSH NEXT，在模型列表中选择 `Today CN / DeepSeek V4.1 Flash` 即可。

---

### 方式三：从源码构建与二次开发

适合需要进行代码审查、逻辑修改或二次打包的开发者：

```sh
# 1. 克隆代码仓库
git clone https://github.com/xuemei-wintersweet/dsh-today.git
cd dsh-today

# 2. 安装开发依赖并执行完整测试套件
npm install
npm run check   # 包含 typecheck、35 项单元测试与生产构建

# 3. 本地打包为标准 tgz
npm pack
```

---

## 受支持的宿主与环境

DSH NEXT 的插件依赖门禁机制会在加载阶段逐项校验依赖声明。声明范围不匹配时，宿主会静默跳过组合包加载。

### 1. DSH 宿主版本适配矩阵

| 宿主版本 | 兼容状态 | 说明 |
| :--- | :--- | :--- |
| **0.1.7-rc.1 ~ 0.1.7-rc.2** | 完全兼容 | 官方首批开放 Bundle 接入架构的标准基线 |
| **0.2.x 正式版** (0.2.0, 0.2.1 ...) | 完全兼容 | 经真实宿主测试验证，API 契约无缝衔接 |
| **0.2.x 预发布版** (rc/alpha) | 兼容 | 支持通过 `tgz` 离线包或目录直接加载 |
| **>= 0.3.0-0** | 暂未验证 | 遵循 `<0.3.0-0` 上界安全隔离原则，待新宿主正式版发布后跟进 |
| **<= 0.1.6** | 不受支持 | 旧宿主缺少必要的一致性模型 Provider 接口 |

### 2. 操作系统与运行时平台

| 平台 | 适配等级 | 凭据存储与探测机制 |
| :--- | :--- | :--- |
| **Windows** | **一等公民 (Tier 1)** | 经真实 Windows 11 环境完整验证。基于 Windows DPAPI (`CryptUnprotectData`) 进行本地只读解密；路径优先探测 `%APPDATA%\Today CN` 与 `%LOCALAPPDATA%\Programs\Today CN` |
| **macOS** | 支持 | 读取 `~/Library/Application Support/Today CN`，支持 Keychain 互操作与非加密会话提取 |
| **Linux** | 支持 | 读取 `$XDG_CONFIG_HOME/Today CN`，支持无桌面环境下基于环境变量映射的凭据挂载 |

**Node.js 运行时要求**：`>= 20.0.0`（开发与构建已在 Node.js v24.22.1 上通过全部 35 项测试）。

---

## 核心功能特性

- **原生双轨思考过程呈现 (Dual-Track Thinking)**：
  深度解析上游推理协议中的思考帧，精确捕获 `<think>...</think>` 标签与动作执行信号，确保 DSH 原生折叠气泡完整点亮。思考过程中实时展示中间推理逻辑，思考完成后平滑收敛为最终交付文本。
- **自驱动 Auto-Pump 任务交付引擎 (Autonomous Task Engine)**：
  针对长链路编码任务中模型容易因阶段性输出而“半途停滞、推辞停工”的问题，内置交付状态感知逻辑。自动感知磁盘新生成的中间物料（如脚本输出、解包文档），自动驱动模型完成下一步闭环，实现一次性完整交付。
- **100% 本地安全 DPAPI 凭据解密**：
  直接复用本机官方客户端生成的登录态文件。在 Windows 上通过操作系统级 DPAPI 在进程内存中完成解密，绝不落地明文 Token，绝不向任何第三方或云端网络上报凭据。
- **多模型挡位与实时配额读取**：
  支持直连 Today CN（国内版）与 Today Global（国际版），自动按上游配置读取当前可用模型目录与倍率规则。
- **断网离线韧性保障**：
  安装包与更新程序采用静态自包含架构，在任何局域网、国内代理或完全断网环境下均可直接安装部署，零外部运行时拉取。

---

## 工作原理与架构

```text
DSH NEXT (Cordis 架构)
  │
  ├── [PiAiAdapter] (模型提供者路由适配层)
  │      │
  │      ▼ (HTTP 127.0.0.1 环回通信)
  ├── [Today Local Loopback Shim] (端口动态分配 + 内存随机密钥校验)
  │      │
  │      ▼
  ├── [TodayUpstreamClient] (SSE 流式协议转换与双轨提取)
  │      │
  │      ├── [CredentialStore] ──► 内存调用 Windows DPAPI (CryptUnprotectData)
  │      │                         读取 %APPDATA%/Today CN 本地会话
  │      ▼
  └── 上游 Today AI 云端推理网关 (api.todayai.cn)
         │
         ▼ (SSE Stream: reasoning_content + content)
      DSH 折叠思考气泡与回答气泡一次性呈现
```

### 关键代码原理说明

1. **双轨思考状态机 (`src/shim.ts`)**：
   上游网关混合输出思考事件与正文块时，适配器利用状态机将内容拆解为 `reasoning_content`（进入 DSH 思考气泡）与 `content`（进入正文区）。即使模型偶尔缺少显式闭合标签，适配器也会在首个输出字符或工具调用到达时安全闭合思考气泡，防止思考内容污染用户正文。
2. **凭据安全载入 (`src/credentials.ts`)**：
   桌面客户端将会话存储于 SQLite 或 JSON 加密槽（`slotA`/`slotB`）。插件读取 `head.state`，校验 `generation` 版本，并利用 Node.js `addon` 或 Windows 本地 API 提取解密会话，全程保留在内存变量中，进程退出后即刻销毁。
3. **Auto-Pump 驱动机制 (`src/auto-pump.ts`)**：
   当会话处于多轮工具调用状态时，若模型返回了阶段性总结但未完成代码文件写入，Auto-Pump 监听器会自动补发状态心跳，督促模型继续推进，直至所有指定文件写入完成。

---

## 模型目录与配额倍率

插件根据官方上游目录提供主要模型选项：

| 模型标识 | 对应基座 | 计费倍率 | 上下文窗口 | 典型适用场景 |
| :--- | :--- | :---: | :---: | :--- |
| `model.deepseek-v4.1-flash` | DeepSeek V4.1 | **1.0×** | 1,000,000 | **主力推荐**：超长代码审查、项目级重构、复杂算法推理 |
| `model.minimax-m31-flash` | MiniMax M3.1 | **0.0× ~ 0.5×** | 1,000,000 | **日常首选**：通用问答、代码语法速查、中短文本生成 |
| `model.glm-5.3` | GLM-4 / 5 系列 | **4.0×** | 200,000 | 深度逻辑证明、特定多步专业领域推理 |

---

## 命令行诊断与自检工具

插件自带完整的 CLI 工具，支持脱机环境诊断与本地 OpenAI 兼容服务：

```powershell
# 1. 运行环境与本地客户端登录态自检（完全脱敏，不输出密码或 Token）
npx dsh-today doctor

# 2. 查询当前已登录账号的可用配额与详细套餐信息
npx dsh-today status

# 3. 列出当前云端网关注册的所有可用模型 ID
npx dsh-today models

# 4. 启动本地 127.0.0.1 OpenAI 兼容代理服务器（默认端口 18421）
npx dsh-today serve 18421
```

启动本地代理后，第三方 IDE（如 Cursor、VS Code 扩展等）可通过 `http://127.0.0.1:18421/v1` 直接接入本机 Today 模型。

---

## 常见问题与排错手册

### Q1: 在 DSH 模型选择器下拉框中未看到 Today 模型？
1. 检查 `~/.dsh/profiles/desktop/cordis.yml` 文件末尾是否已包含 `dsh-today` 配置段：
   ```yaml
   dsh-today:
     region: cn
     enableNativeDeviceTools: true
     responseTimeoutMs: 120000
   ```
2. 确保在修改配置文件或执行安装后，**完全退出并重新启动了 DSH NEXT 客户端**。

### Q2: 运行 `doctor` 提示 `Auth State: missing`？
- 本插件不设单独的网页登录弹窗，直接复用您在电脑上已安装并登录的 Today AI 桌面客户端；
- 请先启动 Today AI 桌面客户端，确认已登录您的账号，然后再重新运行自检。

### Q3: 为什么思考折叠气泡不显示或没有折叠？
- DSH NEXT 界面对于思考气泡有特定的协议字段要求。若使用的是自定义或旧版 DSH profile，请确保 DSH 核心包版本在 `0.1.7-rc.1` 及以上；
- 如果会话历史中混合了其他不支持思考特性的模型，建议新开一个对话窗口进行测试。

### Q4: 提示 HTTP 429 限流或请求被拒绝？
- 429 通常代表触发了上游平台的分钟级频次限制或月度额度耗尽；
- 可通过终端执行 `npx dsh-today status` 查看当前账号的实时剩余额度；若为短时频控，稍等 1 至 2 分钟即可自动恢复。

### Q5: 长文本对话提示上下文超限？
- 尽管 `deepseek-v4.1-flash` 支持长达 100 万 Token 的上下文，但部分网关在单次输入超过 200K 时可能会拉长推理响应时间；
- 建议在进行大型项目重构时，善用 `/compact` 指令或及时开启新的对话主题以保证响应速度。

### Q6: DSH 启动时弹出“恢复模式 (Recovery Mode)”或 JSON 解析错误？
- **原因**：早期手动编辑时，部分 Windows 编辑器（或 PowerShell 5.1 默认的 `Set-Content`）会在 `package.json` 首部写入 UTF-8 BOM 字符（`0xEF 0xBB 0xBF`），导致 Node.js 无法解析；
- **解决**：本插件自带安装器已全量采用 `.NET UTF8Encoding($false)` 无 BOM 写入。重新运行一次 `dsh-today-setup.bat` 即可自动修复并还原标准 JSON 格式。

---

## 免责声明

1. **非官方工具**：本项目为独立的第三方开源适配项目，与 Today AI、DeepSeek AI 或其关联公司无任何商业隶属、官方合作或技术授权关系。
2. **正规扣费**：本工具仅提供网络协议转换与本地凭据桥接功能，使用过程中产生的一切调用消耗均按官方既定费率真实扣除使用者账号的配额。
3. **服务协议风险**：调用非官方接口可能违反上游平台的使用条款，使用者应自行承担因使用本插件可能导致的账号受限或服务中断风险。
4. **即时响应与下架**：项目维护者尊重各方的知识产权。若权利方对本项目提出合理合规异议，请通过 GitHub Issue 联系，维护者将在 24 至 48 小时内配合修改或下架代码。

详细法律合规说明请参阅 [DISCLAIMER.md](./DISCLAIMER.md)。

---

## 许可证与致谢

- 本项目采用 [MIT 许可证](./LICENSE) 开源发布。
- 致谢 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) 团队提供的现代化 Agentic 宿主生态。
- 特别鸣谢 `dingminhua/dsh-connect-workbuddy` 项目在 DSH 插件规范、架构设计与开源工程化方面提供的宝贵参考与实践经验。
