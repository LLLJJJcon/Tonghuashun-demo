// 主张有效性（附录 B.3）与证据权重（附录 B.4）
import type { Claim, ClaimView, ExcludedReason } from '../types';
import type { Ctx, Effects } from './context';
import { DAY_MS, round4, toMs } from './util';

/** decay = max(floor, 0.5 ^ (距今天数 / half_life_days))；披露晚于 T 时距今天数按 0 计 */
export function decayFactor(ctx: Ctx, publishedAt: string, t: number): number {
  const days = Math.max(0, (t - toMs(publishedAt)) / DAY_MS);
  return Math.max(ctx.rules.decay.floor, Math.pow(0.5, days / ctx.rules.decay.half_life_days));
}

/** 在时刻 t、给定复核影响下，计算所有主张的视图 */
export function evaluateClaims(ctx: Ctx, t: number, fx: Effects): Map<string, ClaimView> {
  // 第 1–3 步：未释放 / 转载 / 噪声
  const baseReason = (c: Claim): ExcludedReason | null => {
    const doc = ctx.docs.get(c.document_id)!;
    if (toMs(doc.fetched_at) > t) return 'not_released';
    if (doc.repost_of !== null) return 'repost';
    if (fx.noiseDocs.has(doc.id) || fx.noiseClaims.has(c.id)) return 'noise';
    return null;
  };
  // 第 4 步的「有效的主张」按「通过第 1–3 步」理解：修订链 B01 ← B02 ← B03 中，
  // B02 被 B03 替换后仍然替换 B01，否则 B01 会「复活」并与 B03 形成要素冲突（违背附录 B.6 的说明）。
  const reasonOf = (c: Claim): ExcludedReason | null => {
    const base = baseReason(c);
    if (base) return base;
    if ((ctx.revisers.get(c.id) ?? []).some((rv) => baseReason(rv) === null)) return 'superseded';
    if (c.valid_until !== null && toMs(c.valid_until) <= t) return 'expired';
    return null;
  };

  const out = new Map<string, ClaimView>();
  for (const c of ctx.claims) {
    const doc = ctx.docs.get(c.document_id)!;
    const source = ctx.sources.get(doc.source_id)!;
    const excluded = reasonOf(c);
    const effective_nature = fx.nature.get(c.id) ?? c.nature;
    const tier_score = ctx.rules.tier_score[source.tier];
    const nature_coef = ctx.rules.nature_coef[effective_nature];
    const decay = decayFactor(ctx, doc.published_at, t);
    out.set(c.id, {
      ...c,
      effective_nature,
      released: toMs(doc.fetched_at) <= t,
      excluded_reason: excluded,
      weight: excluded === null ? round4(tier_score * nature_coef * decay) : 0,
      weight_breakdown: { tier_score: round4(tier_score), nature_coef: round4(nature_coef), decay: round4(decay) },
      source,
    });
  }
  return out;
}
