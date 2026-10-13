// 复核队列（附录 B.8）
import type { ReviewItem } from '../types';
import { docOrder, type Ctx, type Effects } from './context';
import { reviewTpl } from './templates';
import { idCompare, toMs } from './util';

/**
 * 在时刻 t 生成全部「已释放、尚未处理」的复核条目。
 * 同一对象命中多个原因时只生成一条（ID 为 rq_${target.id}），原因按 low_confidence → fact_low_tier → low_match_confidence 取第一个。
 * 排序：所属材料按抓取时间升序 → 材料排序（披露时间、ID）→ 目标 ID。
 */
export function buildReviewItems(ctx: Ctx, t: number, fx: Effects): ReviewItem[] {
  const { confidence_threshold: th, fact_low_tiers } = ctx.rules.review;
  const items: ReviewItem[] = [];
  const released = [...ctx.docs.values()].filter((d) => toMs(d.fetched_at) <= t).sort(
    (a, b) => toMs(a.fetched_at) - toMs(b.fetched_at) || docOrder(a, b));

  for (const doc of released) {
    const src = ctx.sources.get(doc.source_id)!;
    const claims = [...(ctx.claimsByDoc.get(doc.id) ?? [])].sort((a, b) => idCompare(a.id, b.id));
    for (const c of claims) {
      // 材料被标为噪声后，其下主张的复核条目也视为已处理
      if (fx.handled.has(`claim:${c.id}`) || fx.noiseDocs.has(doc.id)) continue;
      let code: ReviewItem['reason_code'] | null = null;
      if (c.ai.confidence < th && doc.repost_of === null) code = 'low_confidence';
      else if (c.nature === 'fact' && fact_low_tiers.includes(src.tier)) code = 'fact_low_tier';
      if (!code) continue;
      items.push({
        id: `rq_${c.id}`, event_id: c.event_id, target: { kind: 'claim', id: c.id }, reason_code: code,
        reason_text: code === 'low_confidence' ? reviewTpl.low_confidence(c.ai.confidence) : reviewTpl.fact_low_tier(),
        ai_suggestion: reviewTpl.claimSuggestion(c.nature, c.ai.confidence),
        resolved_by: null,
      });
    }
    if (!fx.handled.has(`document:${doc.id}`) && doc.match.ai.confidence < th) {
      const eventId = doc.match.event_id ?? doc.match.candidate_event_ids[0] ?? null;
      if (eventId === null) continue;
      const ev = ctx.events.find((e) => e.id === doc.match.event_id);
      items.push({
        id: `rq_${doc.id}`, event_id: eventId, target: { kind: 'document', id: doc.id }, reason_code: 'low_match_confidence',
        reason_text: reviewTpl.low_match_confidence(),
        ai_suggestion: reviewTpl.matchSuggestion(doc.match.decision, ev?.title ?? null, doc.match.ai.confidence),
        resolved_by: null,
      });
    }
  }
  return items;
}
