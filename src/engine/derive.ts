// 规则引擎主入口：纯函数，同样的输入一定得到同样的输出。
// 不读取系统时间、不读写 localStorage、不发请求；每次调用都从头计算。
import type {
  ClaimView, DataIssue, DeriveOutput, DocumentView, EngineInput, EventView, Notification,
} from '../types';
import { computeCheckpoints, effectiveTime } from './clock';
import { buildContext, effectsOf } from './context';
import { marketReaction } from './market';
import { buildReviewItems } from './review';
import { evaluateEvent } from './status';
import { notificationTpl } from './templates';
import { HOUR_MS, idCompare, round4, toMs } from './util';
import { buildTimeline } from './version';
import { evaluateClaims } from './weight';

export function derive(input: EngineInput): DeriveOutput {
  const issues: DataIssue[] = [];
  const ctx = buildContext(input, issues);
  const checkpoints = computeCheckpoints({ documents: [...ctx.docs.values()], claims: ctx.claims });
  const E = effectiveTime(checkpoints, input.clock);
  if (E === null) return { clock: input.clock, checkpoints, events: [], notifications: [], review_queue: [], issues };

  const cps = checkpoints.map((iso) => ({ iso, ms: toMs(iso) })).filter((c) => c.ms <= E);
  const applied = ctx.reviews.filter((r) => r.demoMs <= E);
  const fx = effectsOf(applied);
  const views = evaluateClaims(ctx, E, fx);
  const allItems = buildReviewItems(ctx, E, fx);

  const events: EventView[] = [];
  const notifications: Notification[] = [];
  const watch = input.watchlist ? new Set(input.watchlist) : null;

  for (const event of ctx.events) {
    const own = (ctx.ownDocs.get(event.id) ?? []).filter((d) => toMs(d.fetched_at) <= E);
    if (!own.length) continue;
    const state = evaluateEvent(ctx, event, views);
    const { versions, statusDocIds } = buildTimeline(ctx, event, cps);

    // 首发来源：已释放、未被标为噪声、不是转载的本事件材料中披露最早的（own 已按披露时间排序）
    const first = own.find((d) => d.repost_of === null && !fx.noiseDocs.has(d.id)) ?? null;
    const keyDocs = new Set(statusDocIds);
    if (first) keyDocs.add(first.id);

    const documents: DocumentView[] = (ctx.timelineDocs.get(event.id) ?? [])
      .filter((d) => toMs(d.fetched_at) <= E)
      .map((d) => {
        const claims: ClaimView[] = [...(ctx.claimsByDoc.get(d.id) ?? [])]
          .sort((a, b) => idCompare(a.id, b.id))
          .map((c) => views.get(c.id)!);
        const occ = claims.map((c) => c.occurred_at).filter((x): x is string => x !== null).map(toMs).filter((x) => !Number.isNaN(x));
        const lag = occ.length ? round4((toMs(d.published_at) - Math.min(...occ)) / HOUR_MS) : null;
        return {
          ...d,
          source: ctx.sources.get(d.source_id)!,
          released: true,
          is_first_source: first?.id === d.id,
          info_lag_hours: lag,
          market_reaction: keyDocs.has(d.id) && d.match.event_id === event.id ? marketReaction(input.market, event, d) : null,
          claims,
        };
      });

    const last = versions[versions.length - 1];
    events.push({
      event,
      status: state.status,
      conclusion_text: state.conclusion_text,
      confidence: state.confidence,
      support_weight: state.support_weight,
      oppose_weight: state.oppose_weight,
      independent_sources: state.independent_sources,
      current_fields: state.current_fields,
      first_source_doc_id: first?.id ?? null,
      last_changed_at: last?.at ?? null,
      documents,
      conflicts: state.conflicts,
      versions,
      review_items: allItems.filter((i) => i.event_id === event.id),
    });

    const stocks = event.stocks.map((s) => s.code);
    if (!watch || stocks.some((s) => watch.has(s))) {
      for (const v of versions) notifications.push({ id: v.id, event_id: v.event_id, at: v.at, text: notificationTpl(event.title, v.text), stocks });
    }
  }

  // 通知：时间倒序 → 事件 ID 升序 → 版本号倒序
  const noOf = (id: string) => Number(id.slice(id.lastIndexOf('_v') + 2));
  notifications.sort((a, b) => toMs(b.at) - toMs(a.at) || idCompare(a.event_id, b.event_id) || noOf(b.id) - noOf(a.id));

  const visible = new Set(events.map((e) => e.event.id));
  const review_queue = allItems.filter((i) => visible.has(i.event_id));

  return { clock: input.clock, checkpoints, events, notifications, review_queue, issues };
}
