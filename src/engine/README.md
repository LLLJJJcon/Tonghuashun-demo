# 规则引擎（src/engine）

纯函数引擎：同样的输入一定得到同样的输出；不读系统时间、不读写 localStorage、不发请求，每次调用从头计算。规格见附录 A（数据契约）和附录 B（规则）。

## 接口（前端只从 `src/engine/index.ts` 导入）

| 导出 | 说明 |
|---|---|
| `validate(raw, { production })` | 校验原始 JSON，返回 `{ data, issues }`。`raw` 的键：`sources`、`documents`、`aiRuns`（或 `ai_runs`）、`claims`、`events`、`rules`、`market`、`watchlistSeed`，也接受 `xxx.json` 文件名。`data` 不含关注列表种子 |
| `derive({ ...data, reviews, clock, watchlist })` | 输出 `DeriveOutput`：检查点、事件视图、通知（按 watchlist 过滤、时间倒序）、复核队列、引擎运行时 issues（如非法复核记录） |
| `nextCheckpoint(cps, clock)` | `clock = null` 时返回第一个检查点；已在最后时返回 `null`（表示没有下一步，应禁用按钮） |
| `prevCheckpoint(cps, clock)` | 已在最早时刻时返回 `null`（回到「未开始」） |
| `latestCheckpoint(cps)` | 「到最新」 |
| `eventCheckpoints(input, eventId)` | 只走本事件：本事件材料抓取时间、本事件主张有效期，以及候选包含本事件的无关材料 |
| `labels` | `status / nature / stance / tier(t)`，另有 `excluded / revision / match / reviewAction / relation / precision` |
| `formatDateTime / formatDate / formatOccurred / formatPct / formatConfidence` | 固定按 Asia/Shanghai 显示 |
| `DEFAULT_RULES`、`FORBIDDEN_WORDS`、`computeCheckpoints` | 辅助 |

## 模块

| 文件 | 职责 |
|---|---|
| `validate.ts` | 附录 A.4：必填/格式、引用完整性（级联丢弃）、quote 子串、occurred_at 降级、生产模式禁止开发样例、行情缺失降级 |
| `clock.ts` | 检查点（B.2）和时间控件；`effectiveTime` 把时钟落到 ≤ clock 的最后一个检查点 |
| `context.ts` | 建索引；校验、排序复核记录；把复核记录换算成规则输入（噪声、改性质、已处理） |
| `weight.ts` | 主张有效性（B.3）与权重（B.4） |
| `status.ts` | 汇总指标、状态判定（B.5）、当前要素、冲突识别与裁决（B.6）、一句话结论 |
| `version.ts` | 快照、逐检查点 pre / post 两步生成版本（B.7） |
| `review.ts` | 复核队列（B.8） |
| `market.ts` | 行情反应（B.9） |
| `templates.ts` | 所有标签与文案模板（B.10）、日期格式化、禁用词表 |
| `derive.ts` | 组装 `DeriveOutput` |
| `load.ts`、`cli.ts` | 仅 Node 使用：读目录、命令行（浏览器端不要导入） |

## 排序规则

- 时间线材料：披露时间 → 抓取时间 → ID 升序；材料内主张按 ID（自然序）。
- 冲突：立场冲突在前，要素冲突按事件 `fields` 顺序；各方主张按披露时间 → ID。
- 版本：版本号升序；通知：时间倒序 → 事件 ID → 版本号倒序。
- 复核队列：所属材料抓取时间 → 披露时间 → 目标 ID。事件列表：按 `events.json` 顺序（前端自行按 `last_changed_at` 排序）。

## 解释性决定（附录未写明处）

1. 计算时刻取「≤ clock 的最后一个检查点」，所以时钟晚于最后一个检查点时结果不变；复核记录取 `demo_time ≤ 该检查点`。
2. B.3 第 4 步「有效的主张」按「通过第 1–3 步（已释放、非转载、非噪声）」理解，使「预告 ← 快报 ← 更正」链中被更正的快报仍然替换预告，不产生冲突。
3. 同一对象命中多个复核原因时只生成一条（ID `rq_${id}`），按 low_confidence → fact_low_tier → low_match_confidence 取第一个；队列只含未处理条目，所以 `resolved_by` 恒为 `null`。
4. 无关材料的 `low_match_confidence` 条目归到第一个候选事件。
5. 第 1 个版本的说明只有「发现新事件」片段，但 `field_changes`、`new_conflict_ids` 照常给出。
6. 状态仅因时效衰减变化（同一检查点既无本事件材料释放、也无到期）时：触发记为 `document` + 本事件最新材料，说明为「状态 X → Y（支持证据的时效衰减使权重下降）」。
7. 未解决冲突变为已解决 / 消失时，追加片段「冲突已解决：…」/「冲突不再存在：…」；人工修正触发的状态片段不带「触发：…」。
8. 有效证据为 0 条时，待证实结论为「「{core}」尚待证实：目前没有有效证据。」
9. 披露时间晚于 T 时，时效衰减的天数按 0 计。行情反应不按演示时钟截断日线。

## 运行

```bash
npm test                                    # 单元测试（src/engine/__tests__）
npm run typecheck
npx tsx src/engine/cli.ts data/dev          # 按检查点打印各事件状态序列、版本、复核队列、通知
npx tsx src/engine/cli.ts public/data --production   # 上线数据：出现 is_dev_sample 会报 error
```

开发样例 `data/dev/` 为虚构数据（全部带 `is_dev_sample: true`），不得上线。
