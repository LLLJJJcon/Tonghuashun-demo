// 引擎上下文：索引输入数据，校验并整理复核记录，计算复核记录对规则输入的影响
import type {
  Claim, DataIssue, Document, EngineInput, EventDef, Nature, ReviewEntry, Rules, Source,
} from '../types';
import { idCompare, isIsoTime, toMs } from './util';

export interface Ctx {
  rules: Rules;
  events: EventDef[];
  sources: Map<string, Source>;
  docs: Map<string, Document>;
  claims: Claim[];
  claimsById: Map<string, Claim>;
  claimsByDoc: Map<string, Claim[]>;
  claimsByEvent: Map<string, Claim[]>;
  /** 被 revision.targets 指向的主张 → 指向它的主张 */
  revisers: Map<string, Claim[]>;
  /** 本事件的材料（match.event_id 指向它） */
  ownDocs: Map<string, Document[]>;
  /** 时间线展示的材料：本事件材料 + 候选事件包含本事件的无关材料 */
  timelineDocs: Map<string, Document[]>;
  /** 合法的复核记录，按 demo_time、created_at、id 升序 */
  reviews: SortedReview[];
}

export interface SortedReview { entry: ReviewEntry; demoMs: number; createdMs: number }

const NATURES: Nature[] = ['fact', 'opinion', 'speculation', 'rumor'];

function push<K, V>(m: Map<K, V[]>, k: K, v: V) {
  const arr = m.get(k);
  if (arr) arr.push(v); else m.set(k, [v]);
}

/** 材料排序：披露时间升序 → 抓取时间升序 → ID */
export function docOrder(a: Document, b: Document): number {
  return toMs(a.published_at) - toMs(b.published_at) || toMs(a.fetched_at) - toMs(b.fetched_at) || idCompare(a.id, b.id);
}

export function buildContext(input: EngineInput, issues: DataIssue[]): Ctx {
  const sources = new Map(input.sources.map((s) => [s.id, s]));
  const eventIds = new Set(input.events.map((e) => e.id));
  const docs = new Map<string, Document>();
  for (const d of input.documents) {
    if (!sources.has(d.source_id)) {
      issues.push({ level: 'error', file: 'documents.json', record_id: d.id, message: `引用了不存在的来源 ${d.source_id}，引擎已忽略该材料` });
      continue;
    }
    docs.set(d.id, d);
  }
  const claims = input.claims.filter((c) => {
    if (docs.has(c.document_id) && eventIds.has(c.event_id)) return true;
    issues.push({ level: 'error', file: 'claims.json', record_id: c.id, message: '引用了不存在的材料或事件，引擎已忽略该主张' });
    return false;
  });
  const claimsById = new Map(claims.map((c) => [c.id, c]));
  const claimsByDoc = new Map<string, Claim[]>();
  const claimsByEvent = new Map<string, Claim[]>();
  const revisers = new Map<string, Claim[]>();
  for (const c of claims) {
    push(claimsByDoc, c.document_id, c);
    push(claimsByEvent, c.event_id, c);
    for (const t of c.revision?.targets ?? []) push(revisers, t, c);
  }
  const ownDocs = new Map<string, Document[]>();
  const timelineDocs = new Map<string, Document[]>();
  const sortedDocs = [...docs.values()].sort(docOrder);
  for (const d of sortedDocs) {
    if (d.match.event_id !== null && eventIds.has(d.match.event_id)) {
      push(ownDocs, d.match.event_id, d);
      push(timelineDocs, d.match.event_id, d);
    } else if (d.match.decision === 'unrelated') {
      for (const e of d.match.candidate_event_ids) if (eventIds.has(e)) push(timelineDocs, e, d);
    }
  }

  // 复核记录：非法的忽略并记 warning
  const reviews: SortedReview[] = [];
  for (const r of input.reviews) {
    const bad: string[] = [];
    if (!r || typeof r !== 'object') { issues.push({ level: 'warning', file: 'reviews', message: '复核记录格式非法，已忽略' }); continue; }
    const kind = r.target?.kind;
    const tid = r.target?.id;
    if (kind === 'claim' ? !claimsById.has(tid) : kind === 'document' ? !docs.has(tid) : true) bad.push('target');
    if (!['confirm', 'change_nature', 'mark_noise'].includes(r.action)) bad.push('action');
    if (r.action === 'change_nature' && (kind !== 'claim' || !NATURES.includes(r.to as Nature))) bad.push('to');
    if (!isIsoTime(r.demo_time)) bad.push('demo_time');
    if (typeof r.reason !== 'string' || !r.reason.trim()) bad.push('reason');
    const createdMs = isIsoTime(r.created_at) ? toMs(r.created_at) : Number.NaN;
    if (Number.isNaN(createdMs)) bad.push('created_at');
    if (bad.length) {
      issues.push({ level: 'warning', file: 'reviews', record_id: r.id, message: `复核记录字段非法（${bad.join('、')}），已忽略` });
      continue;
    }
    reviews.push({ entry: r, demoMs: toMs(r.demo_time), createdMs });
  }
  reviews.sort((a, b) => a.demoMs - b.demoMs || a.createdMs - b.createdMs || idCompare(a.entry.id, b.entry.id));

  return {
    rules: input.rules, events: input.events, sources, docs, claims, claimsById, claimsByDoc, claimsByEvent,
    revisers, ownDocs, timelineDocs, reviews,
  };
}

/** 一组已生效的复核记录对规则输入的影响 */
export interface Effects {
  noiseClaims: Set<string>;
  noiseDocs: Set<string>;
  nature: Map<string, Nature>;
  /** `${kind}:${id}` → 最早处理它的复核记录 ID */
  handled: Map<string, string>;
}

/** reviews 须已按 demo_time、created_at 升序 */
export function effectsOf(reviews: SortedReview[]): Effects {
  const fx: Effects = { noiseClaims: new Set(), noiseDocs: new Set(), nature: new Map(), handled: new Map() };
  for (const { entry: r } of reviews) {
    const key = `${r.target.kind}:${r.target.id}`;
    if (!fx.handled.has(key)) fx.handled.set(key, r.id);
    if (r.action === 'mark_noise') (r.target.kind === 'claim' ? fx.noiseClaims : fx.noiseDocs).add(r.target.id);
    if (r.action === 'change_nature') fx.nature.set(r.target.id, r.to as Nature);
  }
  return fx;
}
