// 数据校验与降级（附录 A.4）。
// 输入 raw 的键名接受：sources / documents / aiRuns（或 ai_runs）/ claims / events / rules / market / watchlistSeed，
// 也接受带 .json 的文件名（如 "ai_runs.json"、"watchlist.seed.json"）。
// 数组文件接受顶层数组，或 { "<键名>": [...] } 的包装形式。
import type {
  AiRun, Claim, DataIssue, Document, EngineInput, EventDef, MarketData, Rules, Source,
} from '../types';
import { isIsoTime } from './util';

export type EngineData = Omit<EngineInput, 'reviews' | 'clock' | 'watchlist'>;

export const DEFAULT_RULES: Rules = {
  version: 'default',
  tier_score: { S: 1.0, A: 0.8, B: 0.6, C: 0.4, D: 0.2 },
  nature_coef: { fact: 1.0, opinion: 0.6, speculation: 0.4, rumor: 0.2 },
  decay: { half_life_days: 30, floor: 0.2 },
  partial_confirm: { min_support_weight: 0.4, min_independent_sources: 2 },
  review: { confidence_threshold: 0.7, fact_low_tiers: ['C', 'D'] },
};

const TIERS = ['S', 'A', 'B', 'C', 'D'];
const SOURCE_TYPES = ['exchange', 'company', 'media', 'research', 'social'];
const NATURES = ['fact', 'opinion', 'speculation', 'rumor'];
const STANCES = ['support', 'oppose', 'neutral'];
const REVISION_TYPES = ['update', 'correct'];
const PRECISIONS = ['datetime', 'day', 'month', 'quarter', 'range', 'unknown'];
const DECISIONS = ['new', 'same', 'related', 'unrelated'];
const ORIGINS = ['ifind', 'cninfo', 'sse', 'szse', 'irm', 'company_site', 'media_site', 'other'];
const PREP_STATUS = ['passed', 'corrected', 'unreviewed'];
const EVENT_TYPES = ['mna', 'earnings', 'project', 'other'];
const RELATIONS = ['subject', 'counterparty', 'related'];
const RUN_STAGES = ['AI-1', 'AI-2', 'AI-3'];
const RUN_STATUS = ['ok', 'retried_ok', 'failed', 'invalid_output'];

const FILES = {
  sources: { file: 'sources.json', keys: ['sources', 'sources.json'] },
  documents: { file: 'documents.json', keys: ['documents', 'documents.json'] },
  aiRuns: { file: 'ai_runs.json', keys: ['aiRuns', 'ai_runs', 'ai_runs.json'] },
  claims: { file: 'claims.json', keys: ['claims', 'claims.json'] },
  events: { file: 'events.json', keys: ['events', 'events.json'] },
  rules: { file: 'rules.json', keys: ['rules', 'rules.json'] },
  market: { file: 'market.json', keys: ['market', 'market.json'] },
  watchlistSeed: { file: 'watchlist.seed.json', keys: ['watchlistSeed', 'watchlist.seed', 'watchlist', 'watchlist.seed.json'] },
} as const;
type FileKey = keyof typeof FILES;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isText = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const inEnum = (v: unknown, list: readonly string[]) => typeof v === 'string' && list.includes(v);
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function pick(raw: Record<string, unknown>, k: FileKey): { present: boolean; value: unknown } {
  for (const key of FILES[k].keys) if (key in raw) return { present: true, value: raw[key] };
  return { present: false, value: undefined };
}

function aiMetaErrors(v: unknown, path: string): string[] {
  if (!isObj(v)) return [path];
  const out: string[] = [];
  if (!isStr(v.run_id)) out.push(`${path}.run_id`);
  if (!isNum(v.confidence) || v.confidence < 0 || v.confidence > 1) out.push(`${path}.confidence`);
  if (!isText(v.reason)) out.push(`${path}.reason`);
  return out;
}
function prepCheckErrors(v: unknown, path: string): string[] {
  return isObj(v) && inEnum(v.status, PREP_STATUS) ? [] : [path];
}

export function validate(
  raw: Record<string, unknown>,
  opts: { production: boolean },
): { data: EngineData; issues: DataIssue[] } {
  const issues: DataIssue[] = [];
  const err = (file: string, message: string, record_id?: string) =>
    issues.push(record_id ? { level: 'error', file, record_id, message } : { level: 'error', file, message });
  const warn = (file: string, message: string, record_id?: string) =>
    issues.push(record_id ? { level: 'warning', file, record_id, message } : { level: 'warning', file, message });

  // ---------- 读取数组文件 ----------
  function arrayFile(k: FileKey): Obj[] {
    const { file } = FILES[k];
    const { present, value } = pick(raw, k);
    if (!present) { err(file, '文件缺失'); return []; }
    let arr: unknown = value;
    if (isObj(value)) {
      const inner = FILES[k].keys.map((key) => value[key]).find(Array.isArray);
      arr = inner;
    }
    if (!Array.isArray(arr)) { err(file, '文件格式错误：应为数组'); return []; }
    const out: Obj[] = [];
    arr.forEach((r, i) => {
      if (isObj(r)) out.push(r);
      else err(file, `第 ${i + 1} 条记录不是对象，已丢弃`);
    });
    return out;
  }

  // ---------- 上线数据不得包含开发样例 ----------
  if (opts.production) {
    for (const k of Object.keys(FILES) as FileKey[]) {
      const { present, value } = pick(raw, k);
      if (!present) continue;
      const file = FILES[k].file;
      if (isObj(value) && value.is_dev_sample === true) err(file, '上线数据中出现开发样例标记 is_dev_sample');
      const list = Array.isArray(value) ? value : isObj(value) ? FILES[k].keys.map((key) => value[key]).find(Array.isArray) : undefined;
      if (Array.isArray(list)) {
        for (const r of list) {
          if (isObj(r) && r.is_dev_sample === true) err(file, '上线数据中出现开发样例标记 is_dev_sample', isStr(r.id) ? r.id : undefined);
        }
      }
    }
  }

  // ---------- 通用：必填检查 + 去重 ----------
  function accept<T>(file: string, records: Obj[], check: (r: Obj) => string[]): T[] {
    const seen = new Set<string>();
    const out: T[] = [];
    records.forEach((r, i) => {
      const rid = isStr(r.id) ? r.id : undefined;
      const bad = check(r);
      if (bad.length) {
        err(file, `缺少必填字段或格式非法（${bad.join('、')}），已丢弃`, rid ?? `#${i + 1}`);
        return;
      }
      if (seen.has(rid!)) { err(file, 'ID 重复，已丢弃后出现的记录', rid); return; }
      seen.add(rid!);
      out.push(clone(r) as T);
    });
    return out;
  }

  // ---------- D1 来源 ----------
  const sources = accept<Source>(FILES.sources.file, arrayFile('sources'), (r) => {
    const b: string[] = [];
    if (!isStr(r.id)) b.push('id');
    if (!isStr(r.name)) b.push('name');
    if (!inEnum(r.type, SOURCE_TYPES)) b.push('type');
    if (!inEnum(r.tier, TIERS)) b.push('tier');
    if (!isText(r.tier_reason)) b.push('tier_reason');
    return b;
  });
  const sourceIds = new Set(sources.map((s) => s.id));

  // ---------- D5 事件 ----------
  let events = accept<EventDef>(FILES.events.file, arrayFile('events'), (r) => {
    const b: string[] = [];
    if (!isStr(r.id)) b.push('id');
    if (!isStr(r.title)) b.push('title');
    if (!inEnum(r.type, EVENT_TYPES)) b.push('type');
    if (!isStr(r.core_proposition)) b.push('core_proposition');
    if (!Array.isArray(r.stocks) || !r.stocks.every((s) => isObj(s) && isStr(s.code) && isText(s.name) && inEnum(s.relation, RELATIONS))) b.push('stocks');
    if (!Array.isArray(r.fields) || !r.fields.every((f) => isObj(f) && isStr(f.key) && isText(f.label))) b.push('fields');
    if (r.is_counter_example !== undefined && typeof r.is_counter_example !== 'boolean') b.push('is_counter_example');
    if (r.related_event_ids !== undefined && !isStrArr(r.related_event_ids)) b.push('related_event_ids');
    return b;
  });
  const eventIds = new Set(events.map((e) => e.id));
  events = events.map((e) => {
    if (!e.related_event_ids) return e;
    const bad = e.related_event_ids.filter((id) => !eventIds.has(id));
    if (!bad.length) return e;
    warn(FILES.events.file, `related_event_ids 引用了不存在的事件（${bad.join('、')}），已忽略这些引用`, e.id);
    return { ...e, related_event_ids: e.related_event_ids.filter((id) => eventIds.has(id)) };
  });

  // ---------- D2 材料 ----------
  const docFile = FILES.documents.file;
  let documents = accept<Document>(docFile, arrayFile('documents'), (r) => {
    const b: string[] = [];
    if (!isStr(r.id)) b.push('id');
    if (!isStr(r.source_id)) b.push('source_id');
    if (!isStr(r.title)) b.push('title');
    if (!isText(r.url)) b.push('url');
    if (!isText(r.excerpt)) b.push('excerpt');
    if (!inEnum(r.data_origin, ORIGINS)) b.push('data_origin');
    if (!isIsoTime(r.published_at)) b.push('published_at');
    if (!isIsoTime(r.fetched_at)) b.push('fetched_at');
    if (r.fetched_at_simulated !== true) b.push('fetched_at_simulated');
    if (!(r.source_updated_at === null || isIsoTime(r.source_updated_at))) b.push('source_updated_at');
    if (!(r.repost_of === null || isStr(r.repost_of))) b.push('repost_of');
    if (!isStrArr(r.stocks)) b.push('stocks');
    const m = r.match;
    if (!isObj(m)) b.push('match');
    else {
      if (!inEnum(m.decision, DECISIONS)) b.push('match.decision');
      if (!(m.event_id === null || isStr(m.event_id))) b.push('match.event_id');
      if (m.decision !== 'unrelated' && m.event_id === null) b.push('match.event_id（非 unrelated 时不能为空）');
      if (!isStrArr(m.candidate_event_ids)) b.push('match.candidate_event_ids');
      b.push(...aiMetaErrors(m.ai, 'match.ai'), ...prepCheckErrors(m.prep_check, 'match.prep_check'));
    }
    return b;
  });
  documents = documents.filter((d) => {
    const bad: string[] = [];
    if (!sourceIds.has(d.source_id)) bad.push(`来源 ${d.source_id}`);
    if (d.match.event_id !== null && !eventIds.has(d.match.event_id)) bad.push(`事件 ${d.match.event_id}`);
    for (const c of d.match.candidate_event_ids) if (!eventIds.has(c)) bad.push(`候选事件 ${c}`);
    if (bad.length) { err(docFile, `引用了不存在的 ID（${bad.join('、')}），已丢弃`, d.id); return false; }
    return true;
  });
  // 转载引用：反复过滤直到稳定（被引用的材料可能本身被丢弃）
  for (let changed = true; changed;) {
    changed = false;
    const ids = new Set(documents.map((d) => d.id));
    documents = documents.filter((d) => {
      if (d.repost_of === null || ids.has(d.repost_of)) return true;
      err(docFile, `repost_of 引用了不存在的材料 ${d.repost_of}，已丢弃`, d.id);
      changed = true;
      return false;
    });
  }
  const docById = new Map(documents.map((d) => [d.id, d]));
  for (const d of documents) {
    if (Array.from(d.excerpt).length > 200) warn(docFile, '摘录超过 200 字', d.id);
    if (d.match.prep_check.status === 'corrected' && !d.match.prep_check.note) warn(docFile, 'match.prep_check 为 corrected 但缺少 note', d.id);
  }

  // ---------- D3 AI 运行记录 ----------
  const runFile = FILES.aiRuns.file;
  const aiRuns = accept<AiRun>(runFile, arrayFile('aiRuns'), (r) => {
    const b: string[] = [];
    if (!isStr(r.id)) b.push('id');
    if (!inEnum(r.stage, RUN_STAGES)) b.push('stage');
    if (!isStr(r.document_id)) b.push('document_id');
    if (!isText(r.model)) b.push('model');
    if (!isText(r.prompt_file)) b.push('prompt_file');
    if (!isText(r.prompt_version)) b.push('prompt_version');
    if (!isIsoTime(r.run_at)) b.push('run_at');
    if (!inEnum(r.status, RUN_STATUS)) b.push('status');
    if (!isNum(r.attempts)) b.push('attempts');
    if (!isText(r.output_excerpt)) b.push('output_excerpt');
    return b;
  }).filter((run) => {
    if (docById.has(run.document_id)) return true;
    err(runFile, `引用了不存在的材料 ${run.document_id}，已丢弃`, run.id);
    return false;
  });
  const runIds = new Set(aiRuns.map((r) => r.id));
  for (const d of documents) {
    if (!runIds.has(d.match.ai.run_id)) warn(docFile, `match.ai.run_id 指向的 AI 运行记录 ${d.match.ai.run_id} 不存在`, d.id);
  }

  // ---------- D4 主张 ----------
  const claimFile = FILES.claims.file;
  const eventById = new Map(events.map((e) => [e.id, e]));
  let claims = accept<Claim>(claimFile, arrayFile('claims'), (r) => {
    const b: string[] = [];
    if (!isStr(r.id)) b.push('id');
    if (!isStr(r.document_id)) b.push('document_id');
    if (!isStr(r.event_id)) b.push('event_id');
    if (!isText(r.text)) b.push('text');
    if (!isText(r.quote)) b.push('quote');
    if (!inEnum(r.nature, NATURES)) b.push('nature');
    if (!inEnum(r.stance, STANCES)) b.push('stance');
    if (r.revision !== undefined && !(isObj(r.revision) && inEnum(r.revision.type, REVISION_TYPES) && isStrArr(r.revision.targets))) b.push('revision');
    if (r.fields !== undefined && !(isObj(r.fields) && Object.values(r.fields).every((f) => isObj(f) && (isNum(f.value) || typeof f.value === 'string') && isText(f.display)))) b.push('fields');
    if (!(r.valid_until === null || isIsoTime(r.valid_until))) b.push('valid_until');
    b.push(...aiMetaErrors(r.ai, 'ai'), ...prepCheckErrors(r.prep_check, 'prep_check'));
    return b;
  });
  claims = claims.filter((c) => {
    const bad: string[] = [];
    if (!docById.has(c.document_id)) bad.push(`材料 ${c.document_id}`);
    if (!eventById.has(c.event_id)) bad.push(`事件 ${c.event_id}`);
    if (bad.length) { err(claimFile, `引用了不存在的 ID（${bad.join('、')}），已丢弃`, c.id); return false; }
    return true;
  });
  for (let changed = true; changed;) {
    changed = false;
    const ids = new Set(claims.map((c) => c.id));
    claims = claims.filter((c) => {
      const bad = (c.revision?.targets ?? []).filter((t) => !ids.has(t));
      if (!bad.length) return true;
      err(claimFile, `revision.targets 引用了不存在的主张（${bad.join('、')}），已丢弃`, c.id);
      changed = true;
      return false;
    });
  }
  claims = claims.map((c) => {
    const doc = docById.get(c.document_id)!;
    const ev = eventById.get(c.event_id)!;
    const out: Claim = { ...c };
    if (!doc.excerpt.includes(c.quote)) warn(claimFile, 'quote 不是所属材料摘录的子串', c.id);
    if (doc.match.event_id !== c.event_id) warn(claimFile, `主张的 event_id 与所属材料的同一事件判定（${doc.match.event_id ?? '无关'}）不一致`, c.id);
    if (!runIds.has(c.ai.run_id)) warn(claimFile, `ai.run_id 指向的 AI 运行记录 ${c.ai.run_id} 不存在`, c.id);
    if (c.prep_check.status === 'corrected' && !c.prep_check.note) warn(claimFile, 'prep_check 为 corrected 但缺少 note', c.id);
    if (c.fields) {
      const allowed = new Set(ev.fields.map((f) => f.key));
      const bad = Object.keys(c.fields).filter((k) => !allowed.has(k));
      if (bad.length) {
        warn(claimFile, `要素 ${bad.join('、')} 未在事件 ${ev.id} 的 fields 中定义，已忽略`, c.id);
        out.fields = Object.fromEntries(Object.entries(c.fields).filter(([k]) => allowed.has(k)));
      }
    }
    // 发生时间：缺失或非法 → 精度改为 unknown，记 warning
    const rawOcc = (c as unknown as Obj).occurred_at;
    const precOk = inEnum(c.occurred_precision, PRECISIONS);
    if (rawOcc === null) {
      if (precOk && c.occurred_precision !== 'unknown' && c.occurred_precision !== 'range') {
        warn(claimFile, 'occurred_at 为空但精度不是 unknown，已改为 unknown', c.id);
        out.occurred_precision = 'unknown';
      }
    } else if (!isIsoTime(rawOcc)) {
      warn(claimFile, 'occurred_at 缺失或非法，精度已改为 unknown', c.id);
      out.occurred_at = null;
      out.occurred_precision = 'unknown';
    }
    if (!precOk) {
      warn(claimFile, 'occurred_precision 非法，已改为 unknown', c.id);
      out.occurred_at = null;
      out.occurred_precision = 'unknown';
    }
    if (out.occurred_precision === 'range') {
      const rg = c.occurred_range;
      if (!(Array.isArray(rg) && rg.length === 2 && isIsoTime(rg[0]) && isIsoTime(rg[1]))) {
        warn(claimFile, '精度为 range 但 occurred_range 缺失或非法', c.id);
        delete out.occurred_range;
        if (out.occurred_at === null) out.occurred_precision = 'unknown';
      }
    }
    return out;
  });

  // ---------- D6 规则参数 ----------
  let rules: Rules = DEFAULT_RULES;
  {
    const { present, value: r } = pick(raw, 'rules');
    const ok = isObj(r)
      && isText(r.version)
      && isObj(r.tier_score) && TIERS.every((t) => isNum((r.tier_score as Obj)[t]))
      && isObj(r.nature_coef) && NATURES.every((n) => isNum((r.nature_coef as Obj)[n]))
      && isObj(r.decay) && isNum(r.decay.half_life_days) && r.decay.half_life_days > 0 && isNum(r.decay.floor)
      && isObj(r.partial_confirm) && isNum(r.partial_confirm.min_support_weight) && isNum(r.partial_confirm.min_independent_sources)
      && isObj(r.review) && isNum(r.review.confidence_threshold)
      && Array.isArray(r.review.fact_low_tiers) && r.review.fact_low_tiers.every((t) => inEnum(t, TIERS));
    if (ok) {
      rules = clone(r) as unknown as Rules;
      if (rules.data_as_of !== undefined && !isIsoTime(rules.data_as_of)) {
        issues.push({ level: 'warning', file: FILES.rules.file, message: 'data_as_of 不是合法时间，已忽略' });
        delete rules.data_as_of;
      }
    } else err(FILES.rules.file, present ? '规则参数缺少必填字段或格式非法，已使用默认参数' : '文件缺失，已使用默认参数');
  }

  // ---------- D10 行情（缺失不报错） ----------
  let market: MarketData | null = null;
  {
    const { value: m } = pick(raw, 'market');
    const file = FILES.market.file;
    if (m === undefined || m === null) market = null;
    else if (!(isObj(m) && isText(m.source) && isText(m.fetched_at) && isText(m.adjust)
      && isObj(m.benchmark) && isStr(m.benchmark.code) && isObj(m.series))) {
      warn(file, '行情数据格式非法，已忽略行情');
    } else {
      const series: MarketData['series'] = {};
      let dropped = 0;
      for (const [code, s] of Object.entries(m.series as Obj)) {
        if (!isObj(s) || !Array.isArray(s.bars)) { warn(file, '行情序列格式非法，已忽略', code); continue; }
        const bars = s.bars.filter((b) => isObj(b) && typeof b.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.date) && isNum(b.close) && isNum(b.pct_chg)) as MarketData['series'][string]['bars'];
        dropped += s.bars.length - bars.length;
        series[code] = { name: isText(s.name) ? s.name : code, bars: clone(bars).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)) };
      }
      if (dropped) warn(file, `${dropped} 条日线格式非法，已忽略`);
      const bench = m.benchmark as Obj;
      if (!series[bench.code as string]) warn(file, `series 中缺少基准指数 ${String(bench.code)}，基准涨跌幅将为空`);
      market = {
        source: m.source as string, fetched_at: m.fetched_at as string, adjust: m.adjust as string,
        benchmark: { code: bench.code as string, name: isText(bench.name) ? bench.name : String(bench.code) },
        series,
      };
    }
  }

  // ---------- D7 默认关注列表（不进入引擎数据，仅检查格式） ----------
  {
    const { present, value: w } = pick(raw, 'watchlistSeed');
    if (present && !(isObj(w) && Array.isArray(w.stocks) && w.stocks.every((s) => isObj(s) && isStr(s.code) && isText(s.name)))) {
      warn(FILES.watchlistSeed.file, '默认关注列表格式非法');
    }
  }

  return { data: { sources, documents, aiRuns, claims, events, rules, market }, issues };
}
