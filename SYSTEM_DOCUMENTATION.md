# AI Gateway 系统完整技术与运行说明文档

本文档旨在全面、系统地介绍 **AI Gateway（AI 统一管理与代理网关）** 的整体架构、功能模块、运行逻辑、接口调用方法、配置参数以及数据存储规则。

---

## 一、 系统概述

**AI Gateway** 是一套基于 TypeScript + Hono 框架构建的高性能、高可用的 AI API 统一代理与分发网关。它将分散在不同 AI 服务提供商（如 OpenAI、Anthropic、DeepSeek、Qwen、OpenCode 等）的接口进行聚合，对外提供统一的 OpenAI 兼容标准接口 (`/v1/*`)。

### 核心亮点与设计目标
1. **统一接口协议**：将所有上游模型映射为标准 `/v1/chat/completions` 与 `/v1/models` 格式，支持常规文本生成、SSE 流式响应（Streaming）、工具/函数调用（Tool Calls）及思维链（Thinking）参数自动清洗。
2. **多 Key 健康轮询与故障转移**：每个提供商支持配置多个 API Key。系统具备健康度检测与随机洗牌均衡算法，当遇到 Key 失效、越权或异常时，自动无感切换至下一个 Key 或下一个提供商。
3. **双梯队智能自动路由 (`auto/auto`)**：首创第一梯队（Tier 1，上限 9 席）与第二梯队（Tier 2，备用池）双层模型池架构，结合真实业务延迟与会话粘性，实现智能化低延迟调度。
4. **全自动熔断与冷却机制**：实时监测探测与业务请求的错误类型（如欠费、模型下架、网络超时等），自动将异常模型进行冷却隔离或永久失效标记，确保高可用性。
5. **高性能双层存储**：采用“内存二级缓存 + KV 持久化”架构，具备防抖合并落盘与调试模式实时落盘功能，兼顾极速读取与极低写入消耗。

---

## 二、 核心功能模块

系统功能主要划分为以下 5 个核心模块：

### 1. API 统一代理转发模块 (`src/proxy.ts`)
* **标准 OpenAI 协议解析**：接收并解析 `/v1/chat/completions` 请求，提取 `model`、`messages`、`stream`、`session_id` 等参数。
* **兼容性参数清洗**：自动剥离客户端（如听书软件、特定 WebUI）自动附带但部分上游模型不支持的非标属性（例如 `thinking` 字段），防止上游返回 400 格式错误。
* **多 Key 负载均衡与健康筛选**：
  * **健康组 (Healthy)**：最近调用正常，使用 Fisher-Yates 算法随机洗牌，实现流量均匀分摊。
  * **不健康组 (Unhealthy)**：出现过临时异常，优先级降低。
  * **试用组 (Probation)**：连续失败达到阈值后进入冷却，冷却期满后给予试用机会。
  * **降权组 (Demoted)**：仍在冷却期内，暂停分发流量。
* **OpenCode 专用代理逻辑 (`src/opencode.ts`)**：
  * 支持 OpenCode 官方 API 与多个镜像站点的随机轮询与自动回退。
  * 自动注入随机生成的 Request ID (`msg_*`) 与 Session ID (`ses_*`)，模拟 CLI 规范请求头。
  * 支持检查并拦截上游空内容 (`choices[0].message.content` 为空) 并自动触发重试。

### 2. 双梯队智能路由模块 (`src/tiers.ts`)
* **第一梯队 (Tier 1)**：最大名额限制为 9 个，存放系统当前响应最快、可用性最高的核心推荐模型。
* **第二梯队 (Tier 2)**：候选池，存放所有已配置且未处于永久失效状态的备用模型。
* **`auto/auto` 智能路由调度**：
  * **长文本自动识别**：当请求的 `messages` 字符数超过 4000 字时，自动标识为长文本请求，优先在第一梯队【文本】分类模型中筛选具备长上下文能力（如 `128k`, `200k`, `claude`, `gemini` 等）的模型。
  * **会话粘性 (Session Affinity)**：支持提取请求头或请求体中的 `session_id` / `conversation_id` / `user`，优先复用该会话上一次成功调用的模型，提升多轮对话上下文的一致性。
  * **业务延迟优先**：在第一梯队候选集中，优先按【用户真实业务延迟】（滑动平均）升序排列并选择最佳模型。
* **动态淘汰规则**：
  * **规则一（超时淘汰）**：当第一梯队有效模型数 ≥ 2 时，若某模型单次真实业务延迟超过第一梯队平均业务延迟的 5 倍，自动将其移出第一梯队，标黄并冷却 10 分钟。
  * **规则二（失败淘汰）**：第一梯队模型发生 1 次业务请求失败，立即移出第一梯队并冷却 10 分钟。
  * **规则三（保底机制）**：若第一梯队仅剩 1 个有效模型，暂停延迟淘汰逻辑，仅保留失败淘汰，优先保证服务可用。
* **自动海选补位 (`backfillTier1FromTier2`)**：
  * 当第一梯队出现空缺（< 9 席）时，自动触发海选。
  * 具备并发互斥锁（`isProbeRunning`），防止并发请求重复触发探测。
  * 优先选拔标记为【文本】分类的模型；按提供商轮询交叉测试（Cross-Probe）。
  * **游标持久化**：在 KV 中记录上一次探测结束时的提供商游标 (`lastCursorProviderId`)，下一次海选从上一次结束的位置继续，避免每次都从第一个提供商开始，保证公平性。

### 3. 模型健康监测与熔断/冷却模块 (`src/models.ts`)
* **模型智能自动分类**：在导入或添加模型时，通过正则表达式与关键词识别自动标记分类：
  * **绘图**：`dall-e`, `midjourney`, `stable-diffusion`, `flux`, `imagen`, `draw` 等。
  * **多模态**：`vision`, `vl`, `omni`, `4o`, `gemini-1.5`, `claude-3`, `audio` 等。
  * **文本**：`gpt`, `deepseek`, `qwen`, `claude`, `llama`, `chat`, `coder`, `r1` 等。
  * **其他**：未匹配到上述特征的模型。
* **故障与熔断机制**：
  * **冷却隔离 (Cooldown)**：模型探测或调用失败 1 次，进入 5 分钟（或业务失败 10 分钟）的冷却倒计时，期间该模型脱离所有梯队调度。
  * **永久失效 (Permanently Disabled)**：
    * 探测或调用累计失败达到 3 次。
    * 上游返回明确的永久失效错误码（如 HTTP 402 余额不足、`insufficient_quota`、`model_not_found` 模型已下架、`deprecated` 等）。
  * **400 传参异常豁免**：HTTP 400 通常为客户端发送了上游不支持的参数，系统会自动判定为“客户端传参问题”，不计入模型的失败次数，也不触发冷却。

### 4. 管理后台与可视化面板 (`src/pages.ts`, `src/admin.ts`)
* **系统概览面板**：可视化展示提供商数量、转发 Key 数量、模型总数以及第一/第二梯队的实时分布情况。
* **提供商与模型管理**：
  * 支持配置提供商名称、BaseURL、API 类型（`openai` 或 `anthropic`）、多 API Key 列表。
  * 提供“一键拉取上游模型”功能：发起 `/models` 请求自动读取并过滤重复模型，智能分类后一键导入。
  * 模型列表采用双行卡片式布局，清晰呈现模型 ID、智能分类下拉框、状态标签（正常/警告/冷却中/永久失效）、延迟显示、重置/解封按钮及独立测试按键。
* **转发 Key 管理**：支持创建带有自定义名称与过期时间（30天/90天/180天/1年/永久）的网关访问 Key，可随时开启或禁用。
* **全局控制**：
  * **一键轮询探测**：手动触发全量模型的轻量级联通性与延迟测试。
  * **一键重置冷却**：手动将所有处于 5/10 分钟冷却倒计时中的模型即时恢复至正常状态。
  * **调试模式 (Debug Mode)**：一键开关调试模式。开启后，每条日志与状态变更将即时写入 KV 存储，方便排查故障。
  * **统一保存配置**：前端改动支持在本地暂存，点击“统一保存配置”后一次性原子落盘。

### 5. 安全与认证模块 (`src/auth.ts`)
* **管理员 Session 认证**：管理后台接口 (`/admin/api/*`) 使用基于 Cookie (`session_id`) 或 Bearer Token 的 Session 校验，默认有效期 7 天。密码采用 SHA-256 哈希加密比对。
* **转发 Key 认证**：网关代理接口 (`/v1/*`) 使用 Bearer Key 校验（格式为 `Bearer sk_cf_*`），校验 Key 是否存在、是否处于启用状态以及是否已过期。

---

## 三、 系统运行与调度逻辑

### 1. 客户端请求处理全流程

```
[客户端请求 /v1/chat/completions]
         │
         ▼
[验证 Authorization: Bearer sk_cf_*] ──(无效/过期)──> [返回 401 错误]
         │ (有效)
         ▼
[解析 请求体 model 参数]
         │
         ├── model == "auto" 或 "auto/auto"
         │      │
         │      ▼
         │   [自动路由逻辑 selectAutoModel]
         │   1. 检查是否长文本 (>= 4000 字) ➔ 优先选择文本/长上下文模型
         │   2. 检查会话 ID ➔ 优先复用该会话历史成功模型
         │   3. 根据用户真实业务延迟升序排序 ➔ 选出最优模型
         │
         └── model == "特定提供商/特定模型"
                │
                ▼
             [直接匹配对应提供商与模型]
         │
         ▼
[检查模型与提供商状态]
 ├── 提供商/模型被禁用或永久失效 ➔ auto 请求自动切换下一个，固定请求返回 403
 └── 模型处于冷却期 ➔ auto 请求自动切换下一个，固定请求返回 530
         │
         ▼
[获取上游 API Key 列表]
 ├── 按健康度分组 & 对健康 Key 洗牌 (Fisher-Yates)
 └── 依次尝试调用上游 BaseURL
         │
         ├── [上游响应 200 OK 且 内容非空]
         │      ├─ 重置该 Key 失败计数
         │      ├─ 记录真实业务延迟 (仅针对 auto 请求更新滑动平均值)
         │      └─ 返回上游响应数据 / SSE 流给客户端
         │
         └── [上游响应 401/403/5xx/空内容]
                ├─ 记录 Key 失败/降权
                ├─ 记录模型失败/进入冷却或永久失效
                └─ 自动 Failover 尝试下一个 Key 或下一个提供商模型
```

### 2. 双梯队自动化生命周期

```
                 [系统启动 / 跨日第一次请求]
                             │
                             ▼
               [检查是否存在历史梯队数据 (KV)]
                             │
            ┌────────────────┴────────────────┐
            ▼                                 ▼
      [无历史梯队数据]                 [存在历史梯队数据]
            │                                 │
            ▼                                 ▼
   [启动交叉轮询初始化海选]         [对历史第一梯队运行轻量探测]
   各提供商轮流抽选模型探测          剔除故障/失效模型，保留有效模型
   胜者填满第一梯队 9 席                       │
            │                                 ▼
            │                   [检查第一梯队席位是否满 9 席]
            │                                 │
            └────────────────┬────────────────┘
                             │
                             ▼
                 [第一梯队席位不满 9 席?]
                             │ (是)
                             ▼
                [启动海选补位 backfillTier1]
              1. 检查探测互斥锁 isProbeRunning
              2. 优先遍历第二梯队【文本】分类模型
              3. 按游标 lastCursorProviderId 轮流探测
              4. 胜者按延迟由低到高晋升进入第一梯队
```

---

## 四、 接口调用方法与 API 规范

### 1. 客户端代理接口（供 AI 应用/客户端调用）

网关所有代理接口均要求在 Header 中携带 API Key：
`Authorization: Bearer sk_cf_xxxxxxxxxxxx`

#### ① 获取可调用的模型列表
* **请求路径**：`GET /v1/models`
* **响应示例**：
```json
{
  "object": "list",
  "data": [
    {
      "id": "auto/auto",
      "provider": "auto",
      "provider_name": "第一梯队智能路由",
      "object": "model",
      "created": 1720000000,
      "owned_by": "gateway"
    },
    {
      "id": "opencode/deepseek-v4-flash-free",
      "provider": "opencode",
      "provider_name": "OpenCode",
      "object": "model",
      "created": 1720000000,
      "owned_by": "opencode"
    }
  ]
}
```

#### ② 发起对话/补全请求
* **请求路径**：`POST /v1/chat/completions`
* **请求 Header**：
  * `Content-Type: application/json`
  * `Authorization: Bearer sk_cf_YourProxyKey`
  * `x-session-id: session_123` *(可选，用于指定会话粘性)*
* **请求 Body 示例（使用智能路由）**：
```json
{
  "model": "auto/auto",
  "messages": [
    { "role": "user", "content": "你好，请介绍一下你自己。" }
  ],
  "stream": false
}
```
* **请求 Body 示例（指定固定提供商与模型）**：
```json
{
  "model": "opencode/deepseek-v4-flash-free",
  "messages": [
    { "role": "user", "content": "用 Python 写一个快速排序算法" }
  ],
  "stream": true
}
```

---

### 2. 管理后台 API 接口（仅限管理员面板使用）

| 请求方法 | 接口路径 | 功能说明 |
| :--- | :--- | :--- |
| `POST` | `/admin/login` | 管理员登录，成功后返回 `session_id` Cookie 及 Token |
| `GET` | `/admin/logout` | 退出管理员登录，清除 Cookie |
| `GET` | `/admin/api/status` | 获取系统状态概览（提供商数、Key 数、模型数、梯队情况） |
| `GET` | `/admin/api/providers` | 获取所有已配置的提供商及其模型列表 |
| `POST` | `/admin/api/providers` | 创建新的 API 提供商 |
| `PUT` | `/admin/api/providers/:id` | 更新特定提供商的配置（BaseURL、Keys、Models） |
| `DELETE` | `/admin/api/providers/:id` | 删除特定提供商 |
| `POST` | `/admin/api/providers/:id/fetch-models` | 请求上游 `/models` 接口自动获取模型清单 |
| `POST` | `/admin/api/providers/:id/import-models` | 将解析后的模型列表批量导入到提供商中 |
| `DELETE` | `/admin/api/providers/:id/models` | 清空指定提供商下的所有模型 |
| `PATCH` | `/admin/api/providers/:id/models/:modelId` | 修改指定模型的启用状态、解锁恢复冷却或清零失败计数 |
| `POST` | `/admin/api/providers/:id/test-model` | 单独对某个模型测试网络连通性与延迟 |
| `GET` | `/admin/api/proxy-keys` | 获取所有转发 Key 列表 |
| `POST` | `/admin/api/proxy-keys` | 创建新的转发 Key（支持设置有效期） |
| `DELETE` | `/admin/api/proxy-keys/:id` | 删除指定的转发 Key |
| `PATCH` | `/admin/api/proxy-keys/:id` | 修改转发 Key 的启用/禁用状态 |
| `GET` | `/admin/api/tiers` | 获取当前第一梯队、第二梯队模型详情及监控指标 |
| `POST` | `/admin/api/probe` | 手动一键启动全量模型轮询交叉测试 |
| `POST` | `/admin/api/reset-cooldowns` | 一键清空所有模型的冷却状态（恢复调度） |
| `GET` | `/admin/api/logs` | 获取网关最近 100 条请求日志 |
| `DELETE` | `/admin/api/logs` | 清空所有网关请求日志 |
| `GET` | `/admin/api/debug-mode` | 查询当前系统的调试模式 (Debug Mode) 状态 |
| `POST` | `/admin/api/debug-mode` | 开启或关闭调试模式 |
| `POST` | `/admin/api/save-all` | 前端修改统一批量保存落盘 |

---

## 五、 配置项与环境变量说明

### 1. 环境变量配置 (`.env` 或系统环境变量)

| 变量名 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `PORT` | `3000` | HTTP 服务监听的网络端口 |
| `ADMIN_USERNAME` | `admin` | 管理员登录账号 |
| `ADMIN_PASSWORD` | `admin123` | 管理员登录密码 |
| `MODE` 或 `DEBUG` | 非调试模式 | 设为 `debug` 或 `true` 可开启实时落盘调试模式 |
| `OPENCODE_MIRRORS_URL` | 空 | OpenCode 备用镜像站 URL 列表（多地址用逗号或换行分隔） |

### 2. 系统核心常量 (`src/config.ts`)

```typescript
// 管理员 Session 在 Cookie/KV 中的有效期 (7天)
export const SESSION_TTL = 7 * 24 * 60 * 60

// 自动生成的转发 API Key 的统一前缀
export const PROXY_KEY_PREFIX = 'sk_cf_'

// 上游 API Key 连续失败降权后的冷却恢复时长 (5分钟)
export const KEY_HEALTH_COOLDOWN_MS = 5 * 60 * 1000

// 上游 API Key 最大允许连续失败次数 (达到 5 次即触发降权)
export const KEY_HEALTH_MAX_FAILURES = 5

// 日志内存队列批量落盘阈值 (达到 10 条自动写入 KV)
export const LOG_BATCH_SIZE = 10

// 日志内存队列最长落盘间隔时间 (30秒)
export const LOG_FLUSH_INTERVAL_MS = 30000

// 第一梯队模型席位最大容量限制
export const TIER_1_MAX_SLOTS = 9
```

---

## 六、 存储规则与持久化机制

### 1. 双层存储架构 (`src/storage.ts`)

为了在边缘节点或 Serverless 环境下获得极致的读取性能，并严格控制云存储（如 Cloudflare KV）的写入频率与额度，系统设计了**双层存储架构**：

```
                    ┌─────────────────────────┐
                    │    客户端 / 业务请求     │
                    └────────────┬────────────┘
                                 │
                                 ▼
                     ┌──────────────────────┐
                     │ 内存二级缓存 (Map)    │ ──(击中缓存)──> 即时返回
                     └───────────┬──────────┘
                                 │ (未击中)
                                 ▼
                     ┌──────────────────────┐
                     │  KV 持久化存储引擎    │
                     └──────────────────────┘
```

* **读取规则 (`kvGet`)**：优先查内存缓存 `memoryCache`。若存在且未过期直接返回；若未击中则读取底层 KV 存储，并将结果回填至内存缓存。
* **写入规则 (`kvPut` / `kvDelete`)**：
  * **正式模式 (Production Mode)**：变更首先更新内存缓存，同时放入待落盘队列 `pendingWrites`，触发 1 秒防抖定时器，合并多次写入操作后批量统一写入 KV 存储。
  * **调试模式 (Debug Mode)**：跳过待落盘队列与合并防抖，所有数据（包括配置修改、日志新增、健康状态更新）**即时同步写入 KV**，确保跨节点或重启后数据零延迟一致。

### 2. KV 存储 Key 命名空间

| 键名 (KV Key) | 存取数据结构 | 用途说明 |
| :--- | :--- | :--- |
| `providers` | `Provider[]` (JSON) | 保存所有 API 提供商及其绑定的 API Key 和模型配置 |
| `proxy:keys` | `ProxyKey[]` (JSON) | 保存所有对外分发的网关转发 Key 列表 |
| `admin:session:<sessionId>` | `Session` (JSON) | 保存已登录管理员的 Session 信息及过期时间戳 |
| `key:health:<providerId>` | `HealthMap` (JSON) | 记录特定提供商下各个 API Key 的连续失败次数与降权倒计时 |
| `gateway:request_logs` | `RequestLog[]` (JSON) | 保存网关最近 100 条请求日志（时间、模型、耗时、状态码、错误） |
| `gateway:tier_data` | `TierStorage` (JSON) | 保存第一/第二梯队模型列表、探测统计、业务延迟指标及海选游标 |
| `config:debug_mode` | `string` (`"true"`/`"false"`) | 记录当前是否处于调试模式 |
| `auto:session:<sessionId>` | `string` (Model Full ID) | 保存 `auto/auto` 智能路由会话粘性绑定的上一次成功调用的模型 |

### 3. 本地 KV 持久化引擎 (`src/localKv.ts`)

在 Node.js、Cloud Run 或容器化独立部署环境中，系统内置了轻量级本地 KV 仿真引擎：
* 自动判断本地文件系统能力，在项目根目录创建 `.data/kv.json` 持久化数据文件。
* 完美继承 Cloudflare KV 的 API 接口标准（`get`, `put`, `delete`），支持 `expirationTtl` (生存时间/秒) 自动过期清理。
* 若文件系统不可用，自动无缝降级为纯内存存储，确保系统在各种限制环境下均能稳定运行。

---

## 七、 总结

AI Gateway 通过模块化的设计，将复杂的 API 聚合、请求代理、参数适配、健康监测、故障熔断及双梯队智能路由完美整合。无论是作为个人多模型聚合网关，还是作为企业级 AI 服务的统一分发入口，都具备极高的稳定性与扩展性。
