// 检查点与时间控件辅助函数（附录 B.2、B.1）
import type { Claim, Document, EngineInput } from '../types';
import { toMs } from './util';

/** 把一组时间去重（按毫秒）后升序排列，保留每个时刻首次出现的字符串写法 */
function uniqSorted(times: string[]): string[] {
  const byMs = new Map<number, string>();
  for (const t of times) {
    const ms = toMs(t);
    if (Number.isNaN(ms)) continue;
    const prev = byMs.get(ms);
    if (prev === undefined || t < prev) byMs.set(ms, t);
  }
  return [...byMs.entries()].sort((a, b) => a[0] - b[0]).map(([, t]) => t);
}

/**
 * 检查点 = 所有材料的 fetched_at + 所有非空的 valid_until，去重后升序。
 * 给出数据截止时间 dataAsOf 时，晚于它的检查点不进入回放（数据采集之后的时刻无法如实回放）。
 */
export function computeCheckpoints(input: { documents: Document[]; claims: Claim[] }, dataAsOf?: string): string[] {
  const all = uniqSorted([
    ...input.documents.map((d) => d.fetched_at),
    ...input.claims.flatMap((c) => (c.valid_until ? [c.valid_until] : [])),
  ]);
  const cap = dataAsOf ? toMs(dataAsOf) : NaN;
  return Number.isNaN(cap) ? all : all.filter((t) => toMs(t) <= cap);
}

/**
 * 下一个检查点。clock 为 null（未开始）时返回第一个检查点；
 * 已经在最后一个检查点（或之后）时返回 null，表示「没有下一步」（前端应禁用按钮，而不是把时钟设为 null）。
 */
export function nextCheckpoint(checkpoints: string[], clock: string | null): string | null {
  if (clock === null) return checkpoints[0] ?? null;
  const t = toMs(clock);
  return checkpoints.find((c) => toMs(c) > t) ?? null;
}

/** 上一个检查点。已在最早时刻（或未开始）时返回 null，表示回到「未开始」 */
export function prevCheckpoint(checkpoints: string[], clock: string | null): string | null {
  if (clock === null) return null;
  const t = toMs(clock);
  let out: string | null = null;
  for (const c of checkpoints) if (toMs(c) < t) out = c;
  return out;
}

/** 最后一个检查点（「到最新」），没有检查点时为 null */
export function latestCheckpoint(checkpoints: string[]): string | null {
  return checkpoints.length ? checkpoints[checkpoints.length - 1] : null;
}

/**
 * 只走本事件时使用的检查点：本事件材料的 fetched_at、本事件主张的 valid_until。
 * 不含被判为无关的材料：否则会停在本事件尚无可见材料的时刻。
 */
export function eventCheckpoints(input: EngineInput, eventId: string): string[] {
  const docs = input.documents.filter((d) => d.match.event_id === eventId && d.match.decision !== 'unrelated');
  const claims = input.claims.filter((c) => c.event_id === eventId);
  return computeCheckpoints({ documents: docs, claims }, input.rules.data_as_of);
}

/**
 * 引擎实际使用的计算时刻：≤ clock 的最后一个检查点（毫秒）。
 * 状态只在检查点上变化，所以时钟晚于最后一个检查点时，结果与最后一个检查点一致。
 * clock 为 null 或早于第一个检查点时返回 null（什么都不可见）。
 */
export function effectiveTime(checkpoints: string[], clock: string | null): number | null {
  if (clock === null) return null;
  const t = toMs(clock);
  if (Number.isNaN(t)) return null;
  let out: number | null = null;
  for (const c of checkpoints) {
    const ms = toMs(c);
    if (ms <= t) out = ms;
  }
  return out;
}
