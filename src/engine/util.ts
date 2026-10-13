// 引擎内部通用工具：时间解析、取整、稳定排序
import type { SourceTier } from '../types';

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

/** 是否为带时区的 ISO 8601 时间 */
export function isIsoTime(v: unknown): v is string {
  return typeof v === 'string' && ISO_RE.test(v) && !Number.isNaN(Date.parse(v));
}

/** ISO 时间 → 毫秒时间戳；非法时返回 NaN */
export function toMs(iso: string): number {
  return Date.parse(iso);
}

/** 浮点数保留 4 位小数，避免测试因精度抖动 */
export function round4(x: number): number {
  const r = Math.round(x * 1e4) / 1e4;
  return Object.is(r, -0) ? 0 : r;
}

/** 自然序比较（doc_A2 < doc_A10），用于 ID 排序 */
export function idCompare(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true });
}

const TIER_RANK: Record<SourceTier, number> = { S: 5, A: 4, B: 3, C: 2, D: 1 };
export function tierRank(t: SourceTier): number {
  return TIER_RANK[t];
}
export function isOfficial(t: SourceTier): boolean {
  return t === 'S' || t === 'A';
}

export const DAY_MS = 24 * 3600 * 1000;
export const HOUR_MS = 3600 * 1000;
