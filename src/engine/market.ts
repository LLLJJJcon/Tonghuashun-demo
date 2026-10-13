// 行情反应（附录 B.9）：只为关键节点计算，只展示观察到的价格变化，不做归因
import type { Document, EventDef, MarketData, MarketReaction } from '../types';
import { shanghaiDateHour } from './templates';
import { round4 } from './util';

type Bars = MarketData['series'][string]['bars'];

/** 披露日期（15:00 及以后顺延一天）对应的起始日期 YYYY-MM-DD */
export function reactionStartDate(publishedAt: string): string | null {
  const p = shanghaiDateHour(publishedAt);
  if (!p) return null;
  if (p.hour < 15) return p.date;
  const d = new Date(`${p.date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function reactionAt(bars: Bars, start: string): { date: string; day: number; three: number | null } | null {
  const i = bars.findIndex((b) => b.date >= start);
  if (i < 0) return null;
  const three = i + 2 < bars.length
    ? round4(((1 + bars[i].pct_chg / 100) * (1 + bars[i + 1].pct_chg / 100) * (1 + bars[i + 2].pct_chg / 100) - 1) * 100)
    : null;
  return { date: bars[i].date, day: round4(bars[i].pct_chg), three };
}

/** 事件主体股票（relation = subject，取第一只）在该材料披露后的行情反应；缺少数据时为 null */
export function marketReaction(market: MarketData | null, event: EventDef, doc: Document): MarketReaction | null {
  if (!market) return null;
  const subject = event.stocks.find((s) => s.relation === 'subject');
  if (!subject) return null;
  const series = market.series[subject.code];
  const start = reactionStartDate(doc.published_at);
  if (!series || !start) return null;
  const r = reactionAt(series.bars, start);
  if (!r) return null;
  const benchSeries = market.series[market.benchmark.code];
  const b = benchSeries ? reactionAt(benchSeries.bars, start) : null;
  return {
    code: subject.code, name: subject.name, reaction_date: r.date,
    day_pct: r.day, three_day_pct: r.three,
    bench_day_pct: b?.day ?? null, bench_three_day_pct: b?.three ?? null,
    source: market.source, fetched_at: market.fetched_at,
  };
}
