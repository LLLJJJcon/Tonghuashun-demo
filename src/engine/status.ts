// 结论汇总与状态判定（附录 B.5）、冲突识别（附录 B.6）、一句话结论（附录 B.10）
import type { ClaimView, Conflict, EventDef, EventStatus, FieldValue, SourceTier } from '../types';
import type { Ctx } from './context';
import { conclusionTpl, conflictTpl, formatDate } from './templates';
import { idCompare, isOfficial, round4, tierRank, toMs } from './util';

export interface EventState {
  event: EventDef;
  /** 本事件的全部主张视图（含无效的） */
  claims: ClaimView[];
  valid: ClaimView[];
  status: EventStatus;
  support_weight: number;
  oppose_weight: number;
  confidence: number | null;
  independent_sources: number;
  current_fields: Record<string, { display: string; claim_id: string } | null>;
  conflicts: Conflict[];
  conclusion_text: string;
}

const pubMs = (ctx: Ctx, c: ClaimView) => toMs(ctx.docs.get(c.document_id)!.published_at);
const isOfficialFact = (c: ClaimView) => isOfficial(c.source.tier) && c.effective_nature === 'fact';

/** 披露最晚的主张（同时刻按 ID 取后者，保证稳定） */
function latest(ctx: Ctx, list: ClaimView[]): ClaimView {
  return [...list].sort((a, b) => pubMs(ctx, b) - pubMs(ctx, a) || idCompare(b.id, a.id))[0];
}

/** 要素取值优先级：官方 > 非官方；事实 > 其他；披露更晚 > 更早；权重更高 > 更低；最后按 ID */
function fieldPriority(ctx: Ctx) {
  return (a: ClaimView, b: ClaimView) =>
    Number(isOfficial(b.source.tier)) - Number(isOfficial(a.source.tier))
    || Number(b.effective_nature === 'fact') - Number(a.effective_nature === 'fact')
    || pubMs(ctx, b) - pubMs(ctx, a)
    || b.weight - a.weight
    || idCompare(a.id, b.id);
}

/** 冲突一方的排序：披露时间升序 → ID */
function sideOrder(ctx: Ctx) {
  return (a: ClaimView, b: ClaimView) => pubMs(ctx, a) - pubMs(ctx, b) || idCompare(a.id, b.id);
}

function judge(ctx: Ctx, a: ClaimView[], b: ClaimView[]): Pick<Conflict, 'resolved' | 'winner' | 'rule_text'> {
  const aOf = a.filter(isOfficialFact);
  const bOf = b.filter(isOfficialFact);
  if ((aOf.length > 0) === (bOf.length > 0)) return { resolved: false, winner: null, rule_text: conflictTpl.unresolved() };
  const win = aOf.length ? aOf : bOf;
  const best = [...win].sort((x, y) => tierRank(y.source.tier) - tierRank(x.source.tier) || pubMs(ctx, y) - pubMs(ctx, x) || idCompare(x.id, y.id))[0];
  return { resolved: true, winner: aOf.length ? 'a' : 'b', rule_text: conflictTpl.resolved(best.source.name, best.source.tier) };
}

const valueKey = (v: FieldValue['value']) => `${typeof v}:${String(v)}`;

export function evaluateEvent(ctx: Ctx, event: EventDef, views: Map<string, ClaimView>): EventState {
  const claims = (ctx.claimsByEvent.get(event.id) ?? []).map((c) => views.get(c.id)!);
  const valid = claims.filter((c) => c.excluded_reason === null);
  const support = valid.filter((c) => c.stance === 'support');
  const oppose = valid.filter((c) => c.stance === 'oppose');
  const support_weight = round4(support.reduce((s, c) => s + c.weight, 0));
  const oppose_weight = round4(oppose.reduce((s, c) => s + c.weight, 0));
  const confidence = support_weight + oppose_weight > 0 ? round4(support_weight / (support_weight + oppose_weight)) : null;
  const independent_sources = new Set(support.map((c) => c.source.id)).size;

  // ---- 状态判定：按顺序，命中即停 ----
  const pc = ctx.rules.partial_confirm;
  const denyBy = oppose.filter(isOfficialFact);
  const correctBy = valid.filter((c) => isOfficial(c.source.tier) && c.revision?.type === 'correct');
  const confirmBy = support.filter(isOfficialFact);
  const expiredSupport = claims.filter((c) => c.released && c.stance === 'support' && c.excluded_reason === 'expired');
  let status: EventStatus;
  if (denyBy.length) status = 'denied';
  else if (correctBy.length) status = 'corrected';
  else if (confirmBy.length) status = 'confirmed';
  else if (!support.length && expiredSupport.length) status = 'expired';
  else if (support_weight >= pc.min_support_weight && independent_sources >= pc.min_independent_sources) status = 'partially_confirmed';
  else status = 'unverified';

  // ---- 当前要素值 ----
  const prio = fieldPriority(ctx);
  const current_fields: EventState['current_fields'] = {};
  const holders: Record<string, ClaimView[]> = {};
  for (const f of event.fields) {
    const withField = valid.filter((c) => c.fields?.[f.key] !== undefined);
    holders[f.key] = withField;
    const best = [...withField].sort(prio)[0];
    current_fields[f.key] = best ? { display: best.fields![f.key].display, claim_id: best.id } : null;
  }

  // ---- 冲突识别（只在有效主张之间） ----
  const conflicts: Conflict[] = [];
  const so = sideOrder(ctx);
  if (support.length && oppose.length) {
    const a = [...support].sort(so);
    const b = [...oppose].sort(so);
    conflicts.push({ id: `${event.id}_stance`, kind: 'stance', side_a: a.map((c) => c.id), side_b: b.map((c) => c.id), ...judge(ctx, a, b) });
  }
  for (const f of event.fields) {
    const cur = current_fields[f.key];
    if (!cur) continue;
    const curVal = views.get(cur.claim_id)!.fields![f.key].value;
    const a = holders[f.key].filter((c) => valueKey(c.fields![f.key].value) === valueKey(curVal)).sort(so);
    const groups = new Map<string, { value: FieldValue['value']; claims: ClaimView[] }>();
    for (const c of [...holders[f.key]].sort(so)) {
      const v = c.fields![f.key].value;
      if (valueKey(v) === valueKey(curVal)) continue;
      const g = groups.get(valueKey(v));
      if (g) g.claims.push(c); else groups.set(valueKey(v), { value: v, claims: [c] });
    }
    for (const g of groups.values()) {
      conflicts.push({
        id: `${event.id}_field_${f.key}_${String(g.value)}`, kind: 'field', field_key: f.key,
        side_a: a.map((c) => c.id), side_b: g.claims.map((c) => c.id), ...judge(ctx, a, g.claims),
      });
    }
  }

  // ---- 一句话结论 ----
  const core = event.core_proposition;
  const dateOf = (c: ClaimView) => formatDate(ctx.docs.get(c.document_id)!.published_at);
  let conclusion_text: string;
  switch (status) {
    case 'denied': { const c = latest(ctx, denyBy); conclusion_text = conclusionTpl.denied(core, c.source.name, c.source.tier, dateOf(c)); break; }
    case 'corrected': { const c = latest(ctx, correctBy); conclusion_text = conclusionTpl.corrected(core, c.source.name, dateOf(c)); break; }
    case 'confirmed': { const c = latest(ctx, confirmBy); conclusion_text = conclusionTpl.confirmed(core, c.source.name, c.source.tier, dateOf(c)); break; }
    case 'expired': { const c = latest(ctx, expiredSupport); conclusion_text = conclusionTpl.expired(core, formatDate(c.valid_until)); break; }
    case 'partially_confirmed': conclusion_text = conclusionTpl.partially_confirmed(core, independent_sources); break;
    default: {
      let top: SourceTier | null = null;
      for (const c of valid) if (!top || tierRank(c.source.tier) > tierRank(top)) top = c.source.tier;
      conclusion_text = conclusionTpl.unverified(core, valid.length, top);
    }
  }

  return {
    event, claims, valid, status, support_weight, oppose_weight, confidence, independent_sources,
    current_fields, conflicts, conclusion_text,
  };
}
