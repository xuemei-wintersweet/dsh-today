# 免责声明与合规声明 / Disclaimer & Regulatory Notice

**请在使用、分发或贡献本项目前仔细阅读以下条款。使用本项目即表示您已充分理解并同意本声明的所有条款。**

---

### 一、 项目性质与非官方声明 (No Official Affiliation)
1. **独立开源研究**：`dsh-today` 是一个基于开源协议发布的**第三方互操作性与协议兼容性桥接工具**，旨在为个人开发者研究本地客户端互操作性、探索 DeepSeek Harness (DSH) 插件生态提供参考。
2. **非官方关系**：本项目**绝非** Today AI、其母公司、DeepSeek 或任何相关商业实体的官方产品，未获得上述实体的赞助、授权、关联或官方认可。所有商标、服务标志和商业名称均为其各自所有者的财产。

---

### 二、 零破解与反规避技术声明 (Anti-Circumvention & No Cracking)
1. **完全基于本地合法授权凭证**：
   - 本项目**不包含任何对官方二进制文件的破解、反编译、脱壳或内存注入操作**。
   - 本项目**严禁且不包含任何逆向破解出的服务端动态加签算法（如私有 Header 动态 Hash、Nonce 校验私钥）或伪造设备指纹算法**。
   - 本项目仅通过 Windows 操作系统标准安全接口（Data Protection API, DPAPI - `CryptUnprotectData`），在本地内存中读取**使用者本人在官方客户端上正常完成登录**后所生成的授权信息。
2. **遵守计算机软件保护法规**：
   - 本项目不规避、不破坏《计算机软件保护条例》及相关法律法规所规定的任何技术保护措施。
   - 本项目代码中绝不包含任何硬编码凭据、内嵌测试账户或未经授权的访问密钥。

---

### 三、 额度真实消耗与无经济损害 (Authentic Quota & Non-Commercial Use)
1. **正规扣费与额度消耗**：
   - 本项目发起的每一次模型请求均如实发往上游服务提供商的公开接口，**严格、真实地消耗使用者自身账户已有的合法额度、点数或订阅权益**。
   - 本项目**从不修改、无法修改亦没有任何能力篡改上游账号计费状态**，不具备任何刷取免费额度、规避商业付费或提权的功能。
2. **非商业用途**：
   - 本项目完全免费开源，严禁任何人将本项目或其衍生版本用于商业牟利、打包转售或搭建代充/代刷算力的黑灰产服务。

---

### 四、 本地隐私与数据零回传保证 (Zero-Telemetry & Local Security)
1. **纯本机内存流转**：
   - 用户的所有认证凭据（Token / Bearer）仅在宿主机本地内存中解密与暂存，**绝不写入未加密的明文磁盘文件**。
   - 本地 OpenAI-Compatible 代理服务（Shim）默认仅监听本地环回地址（`127.0.0.1`），不向公网暴露任何未授权端口。
2. **零数据遥测**：
   - 本项目代码完全透明，**无任何埋点、统计探针、第三方上报或网络遥测逻辑**。
   - 您的提示词（Prompts）、补全内容及代码上下文仅在您本机与官方服务器之间直接传输，不经由任何第三方中继。

---

### 五、 服务条款合规与风险自担提示 (ToS Compliance & User Risk)
1. **服务协议约束**：
   - 上游服务提供商的用户服务协议（ToS）可能包含禁止使用第三方自动化工具或非官方客户端调用其服务的限制性条款。
   - 使用第三方桥接器可能触发上游平台的自动化风控机制，导致包括但不限于频率限制（Rate Limit）、账号警告、甚至临时或永久封禁。
2. **免责范围**：
   - **用户应自行评估并承担使用非官方接入工具的所有潜在风险。**
   - 项目开发者及贡献者不对因使用本项目导致的任何直接或间接后果（包括账号封禁、额度损失、服务中断、商业损失或数据损坏等）承担任何法律责任。

---

### 六、 知识产权保护与即时下架承诺 (Takedown Policy & Contact)
1. **尊重知识产权**：
   - 项目维护者高度尊重各平台与知识产权所有者的合法权益。
2. **24 小时下架承诺**：
   - 若任何权利方认为本项目涉及其商标、商业秘密或技术保护措施争议，请通过 GitHub Issue 或相关联络方式向维护者发送书面说明。
   - 维护者将在核实后的 **24 至 48 小时内** 主动配合修改、下架争议代码或关闭相关公开仓库。

---

### English Summary
- **No Official Affiliation**: `dsh-today` is an independent, community-driven interoperability connector for personal research and educational workflows. It is not affiliated with, endorsed by, or sponsored by Today AI or DeepSeek.
- **No Cracking / Anti-Circumvention**: This project does not reverse-engineer dynamic signature algorithms, crack access controls, or tamper with binaries. It reads locally authorized DPAPI session data already owned by the user on their own machine.
- **Authentic Billing**: All requests legitimately deduct the user's authentic account quota on the upstream provider at standard rates. Zero capability to bypass billing or generate free tokens.
- **100% Local & Privacy-Preserving**: Runs strictly on `127.0.0.1` and local memory. Zero telemetry, zero analytics, zero external relays.
- **Use at Own Risk**: Non-official API calls may violate third-party Terms of Service and could risk account rate limits or suspensions. Users assume all responsibility.
- **Takedown Policy**: Rights holders may contact the maintainers with concerns; compliant adjustments or removals will be processed within 24–48 hours.
