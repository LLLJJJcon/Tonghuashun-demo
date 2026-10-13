// 数据契约：与 agent-docs 附录 A.2、A.3 保持一致，修改需同步文档

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
  trigger: { kind: 'document' | 'expiry' | 'review' | 'decay'; ref_id: string };  // decay：仅因时效衰减导致状态变化，ref_id 为事件 ID
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

