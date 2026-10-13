# AGENT-4 指导文档：集成、部署与验收（可访问、可实际操作的 Web URL）

> **你的角色**：把引擎、前端和上线数据集成成一个纯静态站点，部署到公网，保证评审（大概率在中国大陆）随时能打开并完整操作，并对照题目要求做最终验收。
> **怎么读这份文档**：第一部分是项目背景和边界；第二部分是你的任务；附录 A、B 用来核对数据和行为是否正确。
> **最重要的三条**：
> 1. URL 在中国大陆能稳定打开；
> 2. 页面上没有任何外部请求；
> 3. 验收清单逐项打勾，结果写进 `docs/deploy-and-smoke.md`。

---

# 第一部分　项目背景与边界（所有 agent 共用，内容一致）

## 1.1 项目是什么

- **工作名**：EventTrace · 投资事件证据时间线（名称可改，改动需同步所有文档）
- **来源**：某企业秋招 AI 产品测评题「投资事件情报与证据时间线」。这是一个**面试前的能力测试 demo**，不是正式产品。
- **题目原文要点**：
  - 同一投资事件会以公告、新闻、研报观点、市场传闻等形式持续演化。产品要帮用户看清：事件最初来源、事实变化、证据冲突、当前状态，以及与关注标的的关系。
  - 提交要求 1：可运行的主链路，覆盖「同一事件」的识别、合并与版本演化；区分事实、观点、推测、传闻，并给出证据权重。
  - 提交要求 2：处理事件发生时间、披露时间、抓取时间、更新时间；更新、否认、更正、过期发生时，改变结论并通知用户。
  - 提交要求 3：可访问、可实际操作的 Web 产品 URL，源代码仓库和 README。README 要说明目标用户、核心设计、AI 角色、数据使用、已知边界与未做事项。
  - 提交要求 4：60–180 秒演示视频、AI 使用与验证记录、测试说明（覆盖主链路、数据/接口异常、合规边界）。**关键数字与结论必须可追溯。**
  - 可用数据：扶摇（行情、财务、估值，可用于验证事件影响）；iFinD MCP（公告、新闻、研报、互动、行业资讯）。不足的部分可以引入公开权威材料，并标明来源。
- **一句话目标**：对关注标的的任何事件，用户在任何时刻都能回答五个问题：从哪来（最初来源）、到哪了（当前状态）、凭什么（证据和权重）、变了什么（版本差异）、和我有什么关系（关注标的和行情反应）。
- **目标用户**：主要是跟踪一批自选股的研究员或投顾，其次是进阶个人投资者。
- **核心原则**：**AI 负责理解，规则负责裁决，人工负责兜底。**
  - AI：抽取主张、判断性质、判断是否同一事件。这部分在开发阶段预处理完成。
  - 规则：计算权重、判定状态、生成版本和通知。这部分在浏览器里实时计算。
  - 人工：复核低置信度或与规则冲突的结果。复核在浏览器里可以真实操作。
- **产品形态**：纯静态 Web demo，部署在公网 URL，评审直接在浏览器里操作。

## 1.2 硬约定（最高优先级，任何 agent 都不得违反）

1. **运行时不用 AI，不请求外部服务**：不调用任何 AI 或大模型，不提供搜索，不请求任何外部接口或 CDN。页面只读取同源的静态 JSON（`./data/*.json`）。
2. **AI 能力是提前准备好的，不是取消了**：开发阶段基于真实材料，真实调用 AI 生成结果，经人工校验后存成数据。README 里声明不提供在线 AI 的原因：避免密钥泄露和费用风险、保证演示稳定可复现、考察重点在 AI 环节的设计。
3. **会影响后续 AI 生成的人工介入只做界面**：包括「补充说明（对话）」「调整来源信任等级」「改归属到其他事件」。可以输入，提交后提示「能力建设中：需要在线 AI 重新生成，当前不生效」，**不改变任何数据或结论**。
4. **不编造**：材料、数字、AI 输出、AI 错误都必须真实。模拟字段（抓取时间）必须标注「模拟」。开发样例数据只用虚构公司名，**不得上线**。
5. **只做 P0**：P1/P2 只写进 README 的「未做事项」。**不要过度设计**。不确定的地方选最简单的实现，并在交付说明里写清楚。
6. **不给投资建议**：任何文案都不能出现买入、卖出、推荐、目标价之类的引导。行情只展示观察到的价格变化，不做因果归因。

## 1.3 P0 范围（定稿）

**页面：2 个，外加全局元素**
- **全局元素**：
  - 顶栏：产品名、演示时钟（标注「模拟」）、时间控件（上一步、下一步、到最新、重置）、通知中心（未读数）、复核待办数。
  - 页脚：免责声明、「运行时不调用 AI，数据为预处理结果」、版本号和构建时间。
  - 首次打开时的操作引导。
- **首页**：关注标的（可以增删），事件列表（显示状态、置信度、最后变化时间、未解决冲突数、待复核数）。
- **事件详情**：结论卡、证据冲突、证据时间线（含四个时间和行情反应）、主张列表（性质、权重、AI 来源信息）、版本历史、复核面板、溯源抽屉。

**功能：9 项**

| # | 功能 | 实现方式 |
|---|---|---|
| F1 | 证据标准化与四个时间 | 读取数据，规则计算 |
| F2 | 主张与性质（事实、观点、推测、传闻） | 读取 AI 预处理结果 |
| F3 | 同一事件合并（含 1 个不合并的反例） | 读取 AI 预处理结果 |
| F4 | 证据权重 = 来源分 × 性质系数 × 时效衰减 | 规则 |
| F5 | 结论汇总与冲突识别 | 规则 |
| F6 | 状态机与版本（按顺序判定，说明文字用模板生成） | 规则 |
| F7 | 通知（只推关注标的的实质变化） | 规则 |
| F8 | 人工复核：确认、改性质、标噪声，理由必填。另外 3 个入口只做界面 | 前端操作，规则重算 |
| F9 | 溯源与合规标签 | 前端 |

**演示案例**：4 个，都基于真实 A 股材料，每个 3–15 条材料，共约 25–35 条。

| 案例 | 演化路径 | 主要展示 |
|---|---|---|
| A | 传闻 → 公司澄清 | 否认、可信来源的处理、噪声和转载、冲突已解决 |
| B | 业绩预告 → 快报 → 修正公告（或其他「更新 → 更正」链） | 更新、更正、版本差异 |
| C | 公司表态的预期（如互动易「预计 X 月投产」）到期未兑现 | 过期 |
| D | 与 A 或 B 同一公司、同一时期的另一件事 | 不误合并（反例） |

A 或 B 中至少要有 1 条**真实**的低置信度结果或规则冲突，用来演示人工复核。

## 1.4 明确不做（只写进 README「未做事项」）

- **P1**：
  - 在线 AI 实时抽取（包括让对话说明、来源分级、改归属真正生效）；
  - AI 生成自然语言摘要；
  - AI 语义冲突检测；
  - K 线图；
  - 旧闻新发识别；
  - AI 处理日志页面。
- **P2**：
  - 实时抓取与搜索；
  - 数据库与多用户、登录；
  - 邮件或 App 推送；
  - 全市场覆盖；
  - 规则编辑界面。

## 1.5 术语表

| 术语 | 定义 |
|---|---|
| 材料（Document） | 一份原始来源文本的摘录，比如一条公告、一篇新闻、一份研报、一条互动问答 |
| 主张（Claim） | 从材料中抽出的一条断言。**性质按主张判断，不按整篇材料判断** |
| 事件（Event） | 多份材料指向的同一件事。每个事件有一条**核心主张**，比如「A 公司拟收购 B 公司」 |
| 事实 fact | 已经发生、可以核验的陈述，通常由信息主体或监管机构正式披露 |
| 观点 opinion | 有明确署名的评价或预测，包括研报观点、公司对未来的预计 |
| 推测 speculation | 非官方、基于线索的推断，比如「据悉」「或将」「接近公司人士称」 |
| 传闻 rumor | 来源不明或匿名，无法核验，比如「网传」或匿名爆料 |
| 立场 stance | 主张对核心主张的态度：支持 support、反对 oppose、无关 neutral |
| 修订 revision | 主张对更早主张的替换：更新 update（新信息替换旧值）、更正 correct（正式更正） |
| 来源等级 | S：交易所或监管机构公告；A：公司官方渠道（互动易、官网、官方回复）；B：主流财经媒体；C：研报或行业媒体；D：自媒体、论坛、匿名来源 |
| 四个时间 | 发生时间（事情本身发生的时间）、披露时间（来源发布的时间）、抓取时间（系统获取的时间，**本 demo 中是模拟值**）、更新时间（分为来源更新时间和结论更新时间） |
| 状态 | 待证实、部分证实、已确认、已否认、已更正、已过期 |
| 演示时钟 T | 回放的「当前时刻」。只有抓取时间 ≤ T 的材料对系统可见 |
| 实质变化 | 状态改变、关键要素改变、出现新的未解决冲突、发现新事件。只有实质变化才生成版本和通知 |

## 1.6 目录结构与分工

```
/
├─ README.md                      提交用 README（已写好，由 AGENT-5 填写占位符）
├─ docs/                          提交材料（AGENT-5）
│  ├─ test-plan.md                测试说明
│  ├─ ai-usage-and-validation.md  AI 使用与验证记录
│  ├─ demo-video-script.md        演示视频脚本
│  └─ deploy-and-smoke.md         部署与冒烟测试记录（AGENT-4）
├─ prompts/                       AI 预处理提示词（AGENT-1）
├─ scripts/                       预处理、评估、校验脚本（AGENT-1），不参与构建
├─ data/                          不上线的数据（AGENT-1）
│  ├─ cases.md                    案例方案（需要人工确认）
│  ├─ ai_runs_raw/                AI 原始返回的完整记录
│  ├─ labels/                     人工标注集、评估结果、防注入测试样本
│  └─ dev/                        开发样例（AGENT-2 编写，虚构数据）
├─ public/data/                   上线数据 D1–D7、D10（AGENT-1），页面运行时读取
├─ src/
│  ├─ types.ts                    数据契约类型（AGENT-2 按附录 A 编写，其他人只读）
│  ├─ engine/                     规则引擎、数据校验、模板文案和单元测试（AGENT-2）
│  ├─ ui/                         页面和组件（AGENT-3）
│  └─ main.tsx                    入口（AGENT-3）
└─ 构建与部署配置                    （AGENT-4）
```

| Agent | 职责 | 可以修改的范围 |
|---|---|---|
| AGENT-1 数据准备 | 真实材料、AI 预处理、人工校验、标注集、行情数据 | `prompts/`、`scripts/`、`data/`（不含 `data/dev/`）、`public/data/` |
| AGENT-2 规则引擎 | `types.ts`、开发样例、引擎、校验、模板、单元测试 | `src/types.ts`、`src/engine/`、`data/dev/` |
| AGENT-3 前端 | 页面、交互、本地状态 | `src/ui/`、`src/main.tsx`、样式 |
| AGENT-4 集成部署 | 集成、构建、托管、可访问性、冒烟测试与验收 | 构建和部署配置、`docs/deploy-and-smoke.md`、README 中的 URL |
| AGENT-5 提交材料 | 测试说明、AI 记录、视频脚本、README 定稿 | `docs/`（不含部署记录）、`README.md` |

**协作顺序**：
1. AGENT-2 先交付 `src/types.ts` 和 `data/dev/` 样例（半天内）。
2. AGENT-1、AGENT-2、AGENT-3 并行工作。
3. AGENT-4 负责集成和部署。
4. AGENT-5 整理提交材料。

**规则**：
- 附录 A（数据契约）和附录 B（规则规格）是唯一标准。发现问题时提出来，不要各自私改。
- 需要人本人完成的事项，标注为【需人工】：iFinD 和扶摇取数、案例确认、AI 结果的人工校验、标注集、录视频、国内网络实测。

## 1.7 通用完成标准

- TypeScript 严格模式下类型检查通过，没有 lint 错误。
- 不新增运行时依赖；确实需要时，先在交付说明里写清楚理由。只用本地打包的依赖，**不用任何 CDN 或在线字体**。
- 交付时附一段简短说明：做了什么、怎么验证的、哪些没做以及原因、给其他 agent 的提醒。
---

# 第二部分　你的任务（AGENT-4 集成、部署与验收）

## 2.1 交付物

| 交付物 | 位置 | 说明 |
|---|---|---|
| 构建配置 | `vite.config.ts`、`package.json` 中的 scripts | `npm run build` 输出纯静态的 `dist/` |
| 构建前检查 | `scripts/prebuild-check.ts`，在 build 前自动执行 | 检查失败就阻止构建，见 2.2 节 |
| 部署配置 | 托管平台需要的配置文件 | 主站和备用站 |
| 部署与冒烟测试记录 | `docs/deploy-and-smoke.md` | 访问地址、托管平台、实测结果、验收清单 |
| README 中的 URL | `README.md` 的「在线体验」部分 | 只填 URL 和访问说明，README 其他内容由 AGENT-5 负责 |

## 2.2 构建要求

- 静态资源用**相对路径**（Vite 设置 `base: './'`），这样部署在子路径下也能打开。
- 路由用 hash 路由（由 AGENT-3 实现）。你要确认：直接打开 `/#/event/evt_A` 并刷新，页面都正常。
- `public/data/*.json` 原样复制到 `dist/data/`。`data/dev/`、`data/ai_runs_raw/`、`data/labels/`、`prompts/`、`scripts/` **都不能出现在** `dist/` 里。
- **构建前检查**（`prebuild-check`），任何一项失败就退出：
  1. 用 `validate({ production: true })` 检查 `public/data/`，不能有 error；
  2. 上线数据里不能出现 `is_dev_sample`；
  3. 源码和数据中不能出现疑似密钥（比如 `sk-`、`api_key`、`Authorization` 等模式）；
  4. 源码中不能出现外部 URL 资源引用（`http(s)://` 开头的 script、link、字体、图片）。数据里的原文链接除外。
- 构建时把版本号（`package.json` 的 version）和构建时间注入为 `import.meta.env.VITE_APP_VERSION`、`VITE_BUILD_TIME`，页脚会显示。
- 字体只用系统字体栈，比如 `-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`。**不用 Google Fonts，也不用任何在线字体。**
- 产物体积参考：总共小于 2MB。

## 2.3 托管与可访问性：采用 Vercel（已定）【需人工配合】

### 2.3.1 平台与套餐
- **托管平台：Vercel 免费版（Hobby）。** 主要额度：200 个项目、每天 100 次部署、每月 100 GB 流量。本 demo 产物不到 2MB，额度完全够用。超出额度时网站会被暂停，不会扣费。
- **使用条件**：
  - 免费版只能用于**非商业的个人用途**。本项目是个人面试作品，没有收款、广告或接单，符合要求。页面上**不得**加入任何广告、收款或推广链接。
  - **仓库必须放在个人 GitHub 账号下**。免费版不能连接 GitHub 组织名下的仓库。
  - 只用一个 Vercel 账号，不注册多个账号来绕过限额。

### 2.3.2 部署步骤
1. 【需人工】在**个人 GitHub 账号**下建立公开仓库，推送代码。
2. 【需人工】用 GitHub 账号登录 Vercel，选择 Add New → Project，导入这个仓库。
3. 构建配置：
   - Framework Preset 选 **Vite**；
   - Build Command 填 `npm run build`（会自动先执行 prebuild-check）；
   - Output Directory 填 `dist`；
   - Node 版本用 LTS。
   - **不配置任何环境变量**：本项目没有密钥。版本号和构建时间在构建时自动注入。
4. 部署成功后，会得到默认地址 `<项目名>.vercel.app`。以后每次推送到 main 分支都会自动重新部署。
5. **准备评审版本**：
   - 提交前确认最终版本已经部署到生产环境；
   - 在 Vercel 中**不要开启** Deployment Protection（密码保护或 Vercel 登录验证），否则评审打不开；
   - 提交后**不再推送**可能破坏页面的改动。需要修改时，先在 Preview 部署上验证，再合并到 main。

### 2.3.3 中国大陆可访问性（必须完成）
- **背景**：Vercel 官方说明，`.vercel.app` 子域名在中国大陆可能被阻断或限速，Vercel 在大陆没有节点、不保证可用性，并建议使用自定义域名。
- **主站：Vercel + 自定义域名**
  - 【需人工】购买一个域名，比如 `demo.<你的域名>`。海外注册商不需要实名认证；国内注册商需要实名认证，要预留时间。
  - 在 Vercel 项目的 Settings → Domains 中添加这个域名，按 Vercel 给出的提示配置 DNS（CNAME 或 A 记录）。
  - 如果大陆访问不稳定，可以尝试 Vercel 面向中国的 DNS 配置（比如把 CNAME 指向 `cname-china.vercel-dns.com`）。**这类配置以 Vercel 当前文档和实测结果为准。**
  - 海外节点不需要 ICP 备案。
- **备用站**：使用 Vercel 的默认地址 `<项目名>.vercel.app`。
- **实测**：主站和备用站都要测。
  - 用大陆网络在无痕窗口打开：家庭宽带和手机 4G/5G 各测一次；
  - 用 itdog、17ce 等国内多地拨测工具测一次；
  - 记录：时间、网络、地区、能否打开、首屏耗时。
- **兜底条件**：如果**主站在实测中仍然不稳定**（比如多地拨测中超过两成失败，或者首屏超过 5 秒），报告给人，由人决定是否另外部署一个非 Vercel 的备用站。这时不要擅自更换平台。
- 在 `deploy-and-smoke.md` 中写明：主站 URL、备用站 URL、DNS 配置、实测记录。
- **代码仓库**：GitHub 公开仓库（个人账号下）。提供 Gitee 镜像是可选的。

## 2.4 冒烟测试（每次部署后都在**线上地址**执行，结果写入记录）

| # | 检查项 | 通过标准 |
|---|---|---|
| D1 | 首屏 | 无痕窗口打开，3 秒内显示引导，没有控制台错误 |
| D2 | 外部请求 | 开发者工具网络面板中，所有请求都是同源的 |
| D3 | 刷新和深链接 | 直接打开 `#/event/<id>` 并刷新，页面正常 |
| D4 | 主链路 | 从「开始演示」一直点到「到最新」，4 个案例都按 `data/cases.md` 预期的状态序列变化 |
| D5 | 通知 | 关注标的出现实质变化时有通知；转载到达时没有通知；点击通知能跳到对应版本 |
| D6 | 人工复核 | 处理一条复核后结论重算，并出现「人工修正」版本；理由为空时不能提交 |
| D7 | 建设中入口 | 3 个入口都只显示提示，状态不变 |
| D8 | 回退和重置 | 上一步回退的结果正确；重置后完全恢复 |
| D9 | 溯源 | 要素、首发来源、引用都能打开溯源抽屉，原文链接可以访问 |
| D10 | 本地存储不可用 | 在 Safari 隐私模式或禁用存储的情况下，页面仍然可以完整操作 |
| D11 | 数据异常 | 本地构建一个故意损坏的数据包，能看到错误页或数据提示。**不部署到线上** |
| D12 | 兼容性 | 最新版 Chrome、Edge、Safari 可用；平板宽度可用；手机能浏览 |
| D13 | 版本 | 页脚显示的版本号和构建时间与本次部署一致 |

## 2.5 最终验收清单（对照题目要求，全部打勾才能提交）

| 题目要求 | 验收方式 | 证据 |
|---|---|---|
| 最初来源 | 案例 A 的首发来源显示正确 | 截图 |
| 事实变化 | 版本历史中有要素变化 | 截图 |
| 证据冲突 | 至少 1 个已解决冲突和 1 个未解决冲突 | 截图 |
| 当前状态 | 6 种状态中至少出现 5 种 | 截图 |
| 与关注标的的关系 | 关联股票、关系、行情反应都有显示 | 截图 |
| 同一事件的识别、合并与版本演化 | 有合并、有反例、有版本 | D4 |
| 事实、观点、推测、传闻的区分与证据权重 | 四种性质都出现；权重可以展开 | 截图 |
| 四个时间 | 四个时间都显示；抓取时间标注模拟 | 截图 |
| 更新、否认、更正、过期改变结论并通知 | 4 种变化都能演示 | D4、D5 |
| 可访问、可实际操作的 URL | 主站和备用站在大陆实测都能打开 | 实测记录 |
| 源代码仓库和 README | 仓库公开；README 中的 URL 可以访问 | 链接 |
| 关键数字可追溯 | 随机抽查 5 个数字，都能找到出处 | 抽查记录 |
| 合规 | 免责声明、传闻标签、模拟标注、不归因声明都在 | 截图 |

## 2.6 禁止事项

- 不在部署产物、Vercel 项目配置或环境变量里放任何密钥。
- 不在页面中加入广告、收款或推广内容，以免违反 Vercel 免费版的非商用条款。
- 不开启 Vercel 的 Deployment Protection，避免评审无法访问。
- 不加统计、埋点或第三方脚本。
- 不为了部署修改业务逻辑。发现问题时，提给对应的 agent。
---

# 附录 A　数据契约（所有 agent 共用，唯一标准）

## A.1 通用约定

- **时间格式**：ISO 8601，带时区，统一东八区，例如 `2025-03-12T09:30:00+08:00`。页面按 Asia/Shanghai 时区显示。
- **ID 规则**：

| 数据 | 格式 | 示例 |
|---|---|---|
| 来源 | `src_` + 英文短名 | `src_szse` |
| 材料 | `doc_` + 案例字母 + 两位序号 | `doc_A01` |
| 主张 | 材料 ID + `_c` + 序号 | `doc_A01_c1` |
| 事件 | `evt_` + 案例字母 | `evt_A` |
| AI 运行记录 | `run_` + 阶段 + 材料号 | `run_ai2_A01` |

- **金额**：统一换算成「元」存为数字，另外提供 `display` 字段用于展示（比如「1.38 亿元」）。
- **摘录长度**：材料摘录不超过 200 字，必须**逐字摘自原文**。主张引用必须是摘录的**子串**。
- **上线数据文件**都放在 `public/data/`，页面通过相对路径 `./data/xxx.json` 读取。

| 编号 | 文件 | 内容 |
|---|---|---|
| D1 | `sources.json` | 来源注册表 |
| D2 | `documents.json` | 材料（含同一事件判定） |
| D3 | `ai_runs.json` | AI 运行记录（精简版，完整原文放在 `data/ai_runs_raw/`） |
| D4 | `claims.json` | 主张 |
| D5 | `events.json` | 事件 |
| D6 | `rules.json` | 规则参数 |
| D7 | `watchlist.seed.json` | 默认关注列表 |
| D10 | `market.json` | 扶摇行情 |
| D8、D9 | 浏览器 localStorage | 复核记录、演示状态 |

## A.2 类型定义（`src/types.ts`，按这里原样实现）

```ts
// ===== 枚举 =====
export type SourceTier = 'S' | 'A' | 'B' | 'C' | 'D';
export type SourceType =
  | 'exchange'        // 交易所或监管机构公告
  | 'company'         // 公司官方：互动易、官网、官方回复
  | 'media'           // 主流财经媒体
  | 'research'        // 研报、行业媒体
  | 'social';         // 自媒体、论坛、匿名来源
export type Nature = 'fact' | 'opinion' | 'speculation' | 'rumor';
export type Stance = 'support' | 'oppose' | 'neutral';
export type RevisionType = 'update' | 'correct';
export type EventStatus =
  | 'unverified' | 'partially_confirmed' | 'confirmed'
  | 'denied' | 'corrected' | 'expired';
export type TimePrecision = 'datetime' | 'day' | 'month' | 'quarter' | 'range' | 'unknown';
export type MatchDecision = 'new' | 'same' | 'related' | 'unrelated';
export type DataOrigin = 'ifind' | 'cninfo' | 'sse' | 'szse' | 'irm' | 'company_site' | 'media_site' | 'other';
export type PrepCheckStatus = 'passed' | 'corrected' | 'unreviewed';

// 预处理阶段的人工校验记录（不是运行时复核）
export interface PrepCheck {
  status: PrepCheckStatus;
  note?: string;            // 校验说明。status 为 corrected 时必填，写明「原为…改为…，理由…」
  original?: unknown;       // 修正前 AI 给出的原值
}

// AI 输出的元信息，挂在主张和同一事件判定上
export interface AiMeta {
  run_id: string;           // 指向 D3
  confidence: number;       // 0–1
  reason: string;           // AI 给出的理由，一两句话
}

// ===== D1 来源 =====
export interface Source {
  id: string;
  name: string;             // 例如「深圳证券交易所」「财联社」
  type: SourceType;
  tier: SourceTier;
  tier_reason: string;      // 为什么定为这个等级
}

// ===== D2 材料 =====
export interface Document {
  id: string;
  source_id: string;
  title: string;
  url: string;              // 原文链接
  excerpt: string;          // ≤200 字，逐字摘录
  data_origin: DataOrigin;  // 从哪个渠道获取的
  published_at: string;     // 披露时间（来源上显示的发布时间）
  fetched_at: string;       // 抓取时间（模拟值）
  fetched_at_simulated: true;
  source_updated_at: string | null;  // 来源修订时间，没有修订就是 null
  repost_of: string | null;          // 如果是转载，填被转载材料的 ID
  stocks: string[];         // 材料涉及的股票代码，例如 ["000001.SZ"]
  match: {                  // 同一事件判定（AI-3）
    decision: MatchDecision;     // new 新建事件 / same 并入 / related 相关但另建事件 / unrelated 无关（噪声）
    event_id: string | null;     // 所属事件；unrelated 时为 null
    candidate_event_ids: string[];  // 参与比较的候选事件
    ai: AiMeta;
    prep_check: PrepCheck;
  };
  is_dev_sample?: boolean;  // 开发样例标记，上线数据中不得出现
}

// ===== D3 AI 运行记录 =====
export interface AiRun {
  id: string;
  stage: 'AI-1' | 'AI-2' | 'AI-3';   // AI-1 材料理解 / AI-2 主张抽取 / AI-3 同一事件判定
  document_id: string;
  model: string;            // 实际使用的模型名
  prompt_file: string;      // 例如 "prompts/ai2-claims.md"
  prompt_version: string;   // 例如 "v1.2"
  run_at: string;           // 真实运行时间
  status: 'ok' | 'retried_ok' | 'failed' | 'invalid_output';
  attempts: number;
  output_excerpt: string;   // 原始返回的前 500 字左右，完整内容在 data/ai_runs_raw/<id>.json
  error?: string;
}

// ===== D4 主张 =====
export interface FieldValue {
  value: number | string;   // 规范化后的值：金额换算成元；区间写成 "120000000-150000000"
  display: string;          // 展示用文字，例如「1.2–1.5 亿元」
}
export interface Claim {
  id: string;
  document_id: string;
  event_id: string;
  text: string;             // 主张的简述，一句话
  quote: string;            // 原文引用，必须是所属材料摘录的子串
  nature: Nature;
  stance: Stance;
  revision?: { type: RevisionType; targets: string[] };  // 替换哪些更早的主张
  fields?: Record<string, FieldValue>;   // 字段名必须在所属事件的 fields 里定义过
  occurred_at: string | null;            // 发生时间
  occurred_precision: TimePrecision;
  occurred_range?: [string, string];     // 精度为 range 时填写
  valid_until: string | null;            // 有效期。预期类主张必须填，例如承诺的投产月份月末
  ai: AiMeta;
  prep_check: PrepCheck;
}

// ===== D5 事件 =====
export interface EventDef {
  id: string;
  title: string;            // 例如「X 公司拟收购 Y 公司」
  type: 'mna' | 'earnings' | 'project' | 'other';
  core_proposition: string; // 核心主张，主张的立场都针对它
  stocks: { code: string; name: string; relation: 'subject' | 'counterparty' | 'related' }[];
  fields: { key: string; label: string }[];  // 关键要素，例如 [{key:"price",label:"交易对价"}]
  is_counter_example?: boolean;              // 反例事件
  related_event_ids?: string[];              // 相关但没有合并的事件
}

// ===== D6 规则参数 =====
export interface Rules {
  version: string;
  tier_score: Record<SourceTier, number>;    // 默认 S 1.0 / A 0.8 / B 0.6 / C 0.4 / D 0.2
  nature_coef: Record<Nature, number>;       // 默认 fact 1.0 / opinion 0.6 / speculation 0.4 / rumor 0.2
  decay: { half_life_days: number; floor: number };    // 默认 30 天 / 0.2
  partial_confirm: { min_support_weight: number; min_independent_sources: number };  // 默认 0.4 / 2
  review: { confidence_threshold: number; fact_low_tiers: SourceTier[] };  // 默认 0.7 / ["C","D"]
}

// ===== D7 默认关注列表 =====
export interface WatchlistSeed { stocks: { code: string; name: string }[] }

// ===== D10 行情（扶摇） =====
export interface MarketData {
  source: string;           // "扶摇"
  fetched_at: string;       // 真实取数时间
  adjust: string;           // 复权方式，例如 "前复权"
  benchmark: { code: string; name: string };
  series: Record<string, { name: string; bars: { date: string; close: number; pct_chg: number }[] }>;
  // date 格式 "YYYY-MM-DD"；pct_chg 是百分比数值，例如 3.21 表示 +3.21%；series 中必须包含 benchmark
}

// ===== D8 复核记录（localStorage） =====
export type ReviewAction = 'confirm' | 'change_nature' | 'mark_noise';
export interface ReviewEntry {
  id: string;               // "rv_" + 时间戳
  target: { kind: 'claim' | 'document'; id: string };
  action: ReviewAction;
  from?: string;            // change_nature 时填原性质
  to?: string;              // change_nature 时填新性质
  reason: string;           // 必填，至少 5 个字
  demo_time: string;        // 提交时的演示时钟 T
  created_at: string;       // 真实提交时间
}

// ===== D9 演示状态（localStorage） =====
export interface DemoState {
  clock: string | null;     // null 表示演示尚未开始
  read_notification_ids: string[];
  onboarding_dismissed: boolean;
  watchlist: string[];      // 当前关注的股票代码；首次使用时取 D7
}
```

**localStorage 键名**：`eventtrace.v1.reviews`（D8）、`eventtrace.v1.demo`（D9）。所有读写都要包在 try/catch 里；localStorage 不可用时，退回内存状态继续运行。

## A.3 引擎输出类型（派生数据，由引擎生成，前端只读）

```ts
export interface EngineInput {
  sources: Source[]; documents: Document[]; aiRuns: AiRun[]; claims: Claim[];
  events: EventDef[]; rules: Rules; market: MarketData | null;
  reviews: ReviewEntry[];   // D8
  clock: string | null;     // T
  watchlist?: string[];     // 关注的股票代码；传入时 notifications 只保留与它有交集的事件，不传时返回全部
}

export type ExcludedReason = 'not_released' | 'repost' | 'noise' | 'superseded' | 'expired';

export interface ClaimView extends Claim {
  effective_nature: Nature;           // 人工改性质后的结果
  released: boolean;                  // 所属材料的抓取时间 ≤ T
  excluded_reason: ExcludedReason | null;  // 为 null 表示有效
  weight: number;                     // 无效时为 0
  weight_breakdown: { tier_score: number; nature_coef: number; decay: number };
  source: Source;
}

export interface MarketReaction {
  code: string; name: string; reaction_date: string;
  day_pct: number | null; three_day_pct: number | null;
  bench_day_pct: number | null; bench_three_day_pct: number | null;
  source: string; fetched_at: string;
}

export interface DocumentView extends Document {
  source: Source;
  released: boolean;
  is_first_source: boolean;           // 是否为首发来源
  info_lag_hours: number | null;      // 信息时差 = 披露时间 − 发生时间（取该材料中最早的发生时间）
  market_reaction: MarketReaction | null;  // 只在关键节点上计算
  claims: ClaimView[];
}

export interface Conflict {
  id: string;
  kind: 'stance' | 'field';
  field_key?: string;
  side_a: string[]; side_b: string[]; // 主张 ID
  resolved: boolean;
  winner: 'a' | 'b' | null;
  rule_text: string;                  // 裁决依据，由模板生成
}

export interface FieldChange { key: string; label: string; before: string | null; after: string | null; claim_id: string }

export interface Version {
  id: string;                         // `${event_id}_v${no}`
  event_id: string; no: number;
  at: string;                         // 演示时间
  trigger: { kind: 'document' | 'expiry' | 'review' | 'decay'; ref_id: string };  // decay 时 ref_id 为事件 ID
  status_before: EventStatus | null; status_after: EventStatus;
  field_changes: FieldChange[];
  new_conflict_ids: string[];
  is_human_correction: boolean;
  text: string;                       // 模板生成的说明
}

export interface ReviewItem {
  id: string;                         // `rq_${target.id}`
  event_id: string;
  target: { kind: 'claim' | 'document'; id: string };
  reason_code: 'low_confidence' | 'fact_low_tier' | 'low_match_confidence';
  reason_text: string;
  ai_suggestion: string;              // AI 当时的判断，例如「性质：事实（置信度 0.62）」
  resolved_by: string | null;         // 处理它的 ReviewEntry ID
}

export interface EventView {
  event: EventDef;
  status: EventStatus;
  conclusion_text: string;            // 模板生成的一句话结论
  confidence: number | null;          // 支持权重 ÷ (支持权重 + 反对权重)；两者都为 0 时为 null
  support_weight: number; oppose_weight: number;
  independent_sources: number;
  current_fields: Record<string, { display: string; claim_id: string } | null>;
  first_source_doc_id: string | null;
  last_changed_at: string | null;     // 结论更新时间 = 最新版本的时间
  documents: DocumentView[];          // 已释放的材料，按披露时间升序排列；包括被判为无关的材料
  conflicts: Conflict[];
  versions: Version[];                // 按版本号升序
  review_items: ReviewItem[];         // 只包括已释放且尚未处理的复核条目
}

export interface Notification {
  id: string;                         // 等于版本 ID
  event_id: string; at: string; text: string; stocks: string[];
}

export interface DataIssue { level: 'error' | 'warning'; file: string; record_id?: string; message: string }

export interface DeriveOutput {
  clock: string | null;
  checkpoints: string[];              // 所有可以停靠的时刻，升序
  events: EventView[];                // 只包括已有已释放材料的事件
  notifications: Notification[];     // 按 watchlist 过滤（见 EngineInput），按时间倒序
  review_queue: ReviewItem[];
  issues: DataIssue[];
}
```

## A.4 数据校验与降级（由 AGENT-2 的 `validate()` 实现）

| 情况 | 处理 |
|---|---|
| 文件加载失败或 JSON 解析失败 | 停止渲染，页面显示错误和「重试」按钮 |
| 记录缺少必填字段，或时间格式非法 | 丢弃该记录，记为 error |
| 引用了不存在的 ID（来源、材料、事件、主张） | 丢弃该记录，记为 error |
| 主张的 `quote` 不是摘录的子串 | 保留记录，记为 warning |
| `occurred_at` 缺失或非法 | 精度改为 unknown，排序时退回用披露时间，记为 warning |
| 上线数据中出现 `is_dev_sample: true` | 记为 error，并在构建检查中阻止上线 |
| 行情数据缺失，或某只股票没有数据 | 行情反应为 null，页面隐藏行情信息，不报错 |
| localStorage 不可用 | 使用内存状态，页面给出轻提示 |

页面右下角的「数据提示 N」入口列出所有 issues。
---

# 附录 B　规则规格（所有 agent 共用，唯一标准；由 AGENT-2 实现）

引擎是**纯函数**：同样的输入一定得到同样的输出。引擎内部不读取系统当前时间，不读写 localStorage，不发网络请求。

## B.1 对外接口

```ts
derive(input: EngineInput): DeriveOutput
validate(raw: Record<string, unknown>, opts: { production: boolean }): { data: Omit<EngineInput,'reviews'|'clock'|'watchlist'>; issues: DataIssue[] }
nextCheckpoint(checkpoints: string[], clock: string | null): string | null
prevCheckpoint(checkpoints: string[], clock: string | null): string | null   // 已在最早时刻时返回 null，表示回到「未开始」
eventCheckpoints(input: EngineInput, eventId: string): string[]             // 只走本事件时使用
labels: { status: Record<EventStatus,string>; nature: Record<Nature,string>; stance: Record<Stance,string>; tier: (t: SourceTier) => string }
```

## B.2 四个时间的规则

| 时间 | 用途 |
|---|---|
| 抓取时间 `fetched_at` | 只有 `fetched_at ≤ T` 的材料算「已释放」，对系统可见。版本时间、通知时间都用它 |
| 披露时间 `published_at` | 判定**首发来源**：同一事件已释放、未被标为噪声、不是转载的材料中，披露时间最早的那一条；时效衰减从它开始算；时间线按它排序 |
| 发生时间 `occurred_at` | 显示在时间线上；用来计算信息时差（披露时间 − 该材料中最早的发生时间，单位小时；发生时间未知时为 null） |
| 来源更新时间 `source_updated_at` | 不为 null 时，在材料上标注「来源已修订」 |
| 结论更新时间 | 等于该事件最新版本的时间 `last_changed_at` |
| 有效期 `valid_until` | `T ≥ valid_until` 时，这条主张过期 |

如果一份材料披露更早、但抓取更晚，它释放后首发来源会自然改写。这种情况不需要专门处理。

**检查点**（时间控件可以停靠的时刻）：所有材料的 `fetched_at` 加上所有非空的 `valid_until`，去重后升序排列。`clock = null` 表示演示尚未开始，此时什么都不可见。

## B.3 主张是否有效

在时刻 T，按下面的顺序判断一条主张是否有效，命中第一条就给出排除原因：

1. 所属材料还没释放 → `not_released`
2. 所属材料是转载（`repost_of` 不为 null）→ `repost`。转载只展示，权重为 0，也不算独立来源
3. 所属材料或主张本身被人工标为噪声（存在 `demo_time ≤ T` 的 `mark_noise` 记录）→ `noise`
4. 存在一条通过第 1–3 步的主张（已释放、非转载、未标噪声），其 `revision.targets` 包含本主张 → `superseded`（被替换）。注意：替换方只需通过第 1–3 步，不要求它自身有效，避免「快报被更正后，预告重新生效」
5. 本主张的 `valid_until ≤ T` → `expired`
6. 都不满足 → 有效（`excluded_reason = null`）

**性质以人工改判为准**：如果存在 `demo_time ≤ T` 的 `change_nature` 记录，`effective_nature` 取最后一次改判的 `to` 值。

被判为无关（`match.decision = 'unrelated'`）的材料没有主张，只在它候选事件的时间线里折叠展示为「已判为无关」。

## B.4 证据权重

```
weight = tier_score[来源等级] × nature_coef[effective_nature] × decay
decay  = max(floor, 0.5 ^ (距今天数 / half_life_days))
距今天数 = (T − published_at) / 1 天
```

无效主张的权重为 0。`weight_breakdown` 要给出三个因子，供界面展开显示。

## B.5 结论汇总与状态判定

**汇总指标**：
- 支持权重 = 所有有效的支持主张的权重之和；反对权重同理。
- 置信度 = 支持权重 ÷ (支持权重 + 反对权重)。两者都为 0 时为 null，界面显示「证据不足」。
- **独立来源数** = 有效的支持主张来自多少个不同的来源（转载已在 B.3 排除）。

**状态判定**：按顺序检查，**命中第一条就停止**。「官方」指来源等级为 S 或 A。

| 顺序 | 条件 | 状态 |
|---|---|---|
| 1 | 存在有效的「官方 + 事实 + 反对」主张 | 已否认 `denied` |
| 2 | 存在有效的「官方 + 修订类型为更正」主张 | 已更正 `corrected` |
| 3 | 存在有效的「官方 + 事实 + 支持」主张 | 已确认 `confirmed` |
| 4 | 没有有效的支持主张，并且存在已释放、未标噪声、因过期失效的支持主张 | 已过期 `expired` |
| 5 | 支持权重 ≥ `min_support_weight`，并且独立来源数 ≥ `min_independent_sources` | 部分证实 `partially_confirmed` |
| 6 | 其他情况 | 待证实 `unverified` |

AI 的判断本身不能直接把状态推到终态：终态只能由官方来源的事实或更正触发，人工改判也只是改变规则的输入。

**当前要素值**：对事件定义的每个要素，在有效且带有该要素的主张中按优先级取一个：官方 > 非官方；事实 > 其他性质；披露时间更晚 > 更早；权重更高 > 更低。没有就为 null。

## B.6 冲突识别

只识别两类冲突，并且只在**有效主张**之间识别：

1. **立场冲突**：同时存在有效的支持主张（A 方）和有效的反对主张（B 方）。整个事件最多只有 1 个这种冲突。
2. **要素冲突**：同一个要素在有效主张中出现了不同的 `value`（严格相等比较）。持有当前要素值的主张是 A 方；每一个不同的值单独算一个 B 方，各成一个冲突。

**裁决**：
- 只有一方包含「官方 + 事实」主张时，标为已解决，这一方胜出；
- 否则标为未解决，`winner = null`。

冲突 ID 要稳定，比如 `${event_id}_stance`、`${event_id}_field_${key}_${value}`。这样版本比较时能识别出「新出现的冲突」。

被替换（superseded）的主张不参与冲突识别。所以预告被快报更新、快报被更正，都**不算冲突**。

## B.7 版本与通知

**快照** = { 状态, 各要素的展示值, 未解决冲突 ID 的集合 }。置信度和权重**不进快照**，避免每走一步都产生版本。

**生成版本**：对每个事件，依次遍历 ≤ T 的检查点 c。在每个 c 先后计算两步：
1. **pre**：材料、有效期按 c 计算，复核记录只取 `demo_time < c` 的。
2. **post**：依次加入 `demo_time = c` 的复核记录，按 `created_at` 排序，每加入一条重新计算一次。

只要与上一份快照不同，就生成一个版本：
- 事件第一次有已释放材料时，生成第 1 个版本，`status_before = null`，说明文字为「发现新事件」。
- pre 阶段的触发来源：c 时刻释放的本事件材料（触发类型 document，取第一条）；如果没有，就是在 c 时刻到期的主张（触发类型 expiry）。
- post 阶段的触发来源是那条复核记录（触发类型 review），版本标记 `is_human_correction = true`。
- 如果状态变化既不是材料释放、也不是到期或复核引起的，而只是时效衰减导致权重变化，触发类型记为 decay，`ref_id` 为事件 ID。
- 引擎按「不晚于时钟 T 的最后一个检查点」计算，所以两个检查点之间不会出现没有版本的状态变化。

**通知**：每个版本对应一条通知；传入 `watchlist` 时，只保留事件的 `stocks` 与关注列表有交集的。通知 ID 等于版本 ID，按时间倒序排列。

**按这个规则，转载到达、置信度小幅变化都不会产生版本，也不会产生通知。**

## B.8 复核队列

已释放的对象满足以下任一条件时，进入复核队列：

| 原因代码 | 条件 | 显示文案 |
|---|---|---|
| `low_confidence` | 主张的 `ai.confidence` 低于阈值（转载除外） | 「AI 置信度低（0.62），请确认性质」 |
| `fact_low_tier` | AI 把主张判为事实，但来源等级在 `fact_low_tiers` 中 | 「低等级来源被判为事实，与规则冲突」 |
| `low_match_confidence` | 材料的同一事件判定置信度低于阈值 | 「同一事件判定置信度低，请确认归属」 |

同一个对象只要有任何一条 `demo_time ≤ T` 的复核记录，就算已处理，不再出现在队列里。材料被标为噪声后，它下面所有主张的复核条目也算已处理。同一个对象同时命中多个原因时，只生成一条复核条目，按 low_confidence → fact_low_tier → low_match_confidence 的顺序取第一个原因。

**可以真实执行的复核动作**：
- 主张：确认、改性质、标为噪声；
- 材料：确认归属、标为噪声。

## B.9 行情反应

**关键节点**：首发材料，以及触发了状态变化的材料。只为这些节点计算行情反应，计算对象是事件中 `relation = subject` 的股票。

**计算方法**：
1. 取披露时间对应的日期；如果披露时间在 15:00 及以后，日期后移一天。
2. 反应日 = 该股票行情中第一个日期 ≥ 上一步日期的交易日。
3. 当日涨跌幅 = 反应日的 `pct_chg`。
4. 3 日累计 = (1+r1)(1+r2)(1+r3) − 1，r1 到 r3 是反应日及其后 2 个交易日的涨跌幅。
5. 基准指数用同样的方法计算。

缺少数据时返回 null。

**已知边界**：行情反应不按演示时钟截断，会用到时钟之后的日线，这样演示时能直接看到完整的 3 日涨跌。README 的已知边界里要写明这一点。

## B.10 模板文案（固定写法，前端只负责显示）

**标签**：
- 状态：待证实、部分证实、已确认、已否认、已更正、已过期
- 性质：事实、观点、推测、传闻
- 立场：支持、反对、无关
- 等级：「S 级」等

**一句话结论 `conclusion_text`**（`{core}` 是核心主张；来源取触发该状态的主张中披露最晚的那一条）：

| 状态 | 文案 |
|---|---|
| 待证实 | 「{core}」尚待证实：目前有效证据 {n} 条，最高来源等级为 {tier} 级。 |
| 部分证实 | 「{core}」部分证实：{k} 个独立来源支持，但尚无交易所或公司官方的事实确认。 |
| 已确认 | 「{core}」已由{来源}（{tier} 级）于 {日期} 确认。 |
| 已否认 | 「{core}」已被{来源}（{tier} 级）于 {日期} 否认。 |
| 已更正 | 「{core}」的披露内容已由{来源}于 {日期} 更正，当前要素以更正后为准。 |
| 已过期 | 「{core}」中的预期已于 {日期} 到期，截至当前未见兑现证据。 |

**版本说明 `text`**：由下面几种片段组合，片段之间用「；」连接。

| 情况 | 片段 |
|---|---|
| 新事件 | 发现新事件：{来源}（{tier} 级）发布「{标题}」 |
| 状态变化（材料触发） | 状态 {旧} → {新}（触发：{来源}「{标题}」） |
| 状态变化（过期触发） | 状态 {旧} → 已过期（主张「{主张简述}」有效期 {日期} 已到） |
| 要素变化 | {要素名}：{旧值或「无」} → {新值} |
| 新冲突 | 出现未解决冲突：{立场冲突 / 要素「{要素名}」取值不一致} |
| 人工修正 | 加前缀「人工修正（{动作}，理由：{理由}）：」 |

**冲突裁决依据 `rule_text`**：
- 已解决：「以{胜出方最高等级来源}（{tier} 级事实）为准」
- 未解决：「双方均无交易所或公司官方的事实证据，冲突待解决」

**通知文字**：「【{事件标题}】{版本说明}」。

**合规要求**：模板的固定部分不得包含「买入、卖出、增持、减持、推荐、目标价、建议」等词。单元测试要覆盖这一点（只检查模板固定部分，不检查来自数据的标题）。

## B.11 开发样例数据（`data/dev/`，AGENT-2 编写，虚构数据，不上线）

所有记录都加上 `is_dev_sample: true`，公司名和代码都是虚构的。**下面没有特别说明的 AI 置信度一律设为 0.90**，抓取时间默认比披露时间晚 20 分钟。

**基础数据**：
- 公司：示例科技 DEV001.SZ、样本材料 DEV002.SZ、演示新能源 DEV003.SH；基准指数为示例指数 DEVIDX。
- 来源：
  - `src_dev_exchange`（S 级）
  - `src_dev_irm`（A 级，互动平台）
  - `src_dev_media1`、`src_dev_media2`、`src_dev_media3`（都是 B 级）
  - `src_dev_social`、`src_dev_social2`（都是 D 级）
- 默认关注：DEV001、DEV002、DEV003。
- 行情：为三只股票和基准指数编写覆盖各事件日期的虚构日线。

### evt_A「示例科技拟收购样本材料」（并购）
- 核心主张：示例科技拟收购样本材料控股权
- 关联股票：DEV001（主体）、DEV002（交易对手）
- 要素：price「交易对价」

| 材料 | 来源 | 披露 → 抓取 | 内容与预期 |
|---|---|---|---|
| A01 | social（D） | 2025-03-03 20:10 → 22:10 | 「网传示例科技将收购样本材料」，传闻，支持，AI 置信度 0.90 |
| A02 | media1（B） | 2025-03-04 08:00 → 08:20 | 「据悉…正洽谈收购…对价约 10 亿元」，推测，支持，price = 1000000000，置信度 0.85 |
| A03 | media2（B） | 2025-03-04 09:00 → 09:30 | **A02 的转载**，推测，支持 |
| A04 | media3（B） | 2025-03-04 14:00 → 14:30 | 「接近公司人士称对价或为 8 亿元」，推测，支持，price = 800000000，**置信度 0.62** |
| A05 | exchange（S） | 2025-03-05 19:30 → 19:40 | 澄清公告「目前不存在应披露未披露的重大收购事项」，事实，**反对** |
| A06 | social2（D） | 2025-03-04 10:00 → 11:00 | 「示例科技董事长出席行业论坛」，判定为无关，候选事件 evt_A，置信度 0.88，没有主张 |

### evt_B「样本材料 2024 年度业绩」（业绩）
- 核心主张：样本材料 2024 年归母净利润
- 关联股票：DEV002（主体）
- 要素：profit「归母净利润」

| 材料 | 来源 | 披露时间 | 内容 |
|---|---|---|---|
| B01 | S 级 | 2025-01-20 18:00 | 业绩预告，事实，支持，profit = "120000000-150000000"，展示为「1.2–1.5 亿元」 |
| B02 | S 级 | 2025-02-25 18:00 | 业绩快报，事实，支持，profit = 138000000，修订：**更新** B01_c1 |
| B03 | S 级 | 2025-03-10 18:00 | 更正公告，事实，支持，profit = 132000000，修订：**更正** B02_c1 |

### evt_C「演示新能源二期项目投产」（项目）
- 核心主张：演示新能源二期项目于 2025 年 6 月投产
- 关联股票：DEV003（主体）

| 材料 | 来源 | 披露时间 | 内容 |
|---|---|---|---|
| C01 | irm（A 级） | 2025-02-10 15:00 | 「公司预计二期项目 6 月投产」，观点，支持，有效期 2025-06-30T23:59:59+08:00 |
| C02 | media1（B 级） | 2025-04-02 09:00 | 「据悉二期项目进展顺利，有望如期投产」，推测，支持，有效期同上 |

### evt_D「示例科技发布新产品」（其他，**反例**）
- 关联股票：DEV001（主体）；`related_event_ids` 为 [evt_A]
- D01：social（D 级），2025-03-04 12:00，「示例科技已完成新一代产品发布」。AI 判为**事实**，支持，置信度 0.75，用来触发 `fact_low_tier`。同一事件判定为 related，候选事件 evt_A，理由是「同公司同期，但事项为产品发布而非收购」。

## B.12 单元测试用例（Vitest，基于开发样例；权重数值以实际计算为准，断言状态和结构）

| ID | 场景 | 时钟 T 和操作 | 期望 |
|---|---|---|---|
| M1 | 首发来源按披露时间判定 | A02 的抓取时间 | 首发来源是 A01；evt_A 待证实 |
| M2 | 按抓取时间释放 | A02 的抓取时间 | A04、A05 不可见 |
| M3 | 转载不产生版本 | A03 的抓取时间 | A03 的主张排除原因为 repost，权重为 0；没有新增版本和通知 |
| M4 | 多来源推测 → 部分证实，并出现要素冲突 | A04 的抓取时间 | 部分证实；price 冲突未解决；A04_c1 进入复核队列（low_confidence） |
| M5 | 官方否认 | A05 的抓取时间 | 已否认；立场冲突已解决，反对方胜出；生成新版本和通知 |
| M6 | 人工改性质后重算 | T 在 A04 的抓取时间，把 A04_c1 改为传闻 | 回到待证实；该版本 `is_human_correction = true`；复核条目从队列中消失 |
| M7 | 更新 | B02 的抓取时间 | 已确认；profit 从「1.2–1.5 亿元」变为「1.38 亿元」；没有要素冲突 |
| M8 | 更正 | B03 的抓取时间 | 已更正；profit 变为「1.32 亿元」 |
| M9 | 过期 | T = 2025-06-30T23:59:59+08:00 | evt_C 已过期；之前一个检查点时是待证实（受时效衰减影响，支持权重低于阈值）；生成过期类型的版本 |
| M10 | 反例不合并 | 最新时刻 | evt_A 中没有 D01；evt_D 独立存在；D01 进入复核队列（fact_low_tier） |
| M11 | 噪声 | 最新时刻 | A06 出现在 evt_A 的材料中，标记为无关，不影响状态 |
| M12 | 回退不使用未来证据 | 从 A05 回退到 A02 | 输出与直接把 T 设为 A02 时完全一致 |
| M13 | 纯函数 | 同一输入调用两次 | 输出深度相等 |
| C1 | 合规词 | 所有模板 | 固定部分不包含禁用词 |
| V1 | 数据校验 | 缺少必填字段、引用不存在、引用不是摘录子串、生产模式下出现开发样例 | 分别得到 error、error、warning、error |
