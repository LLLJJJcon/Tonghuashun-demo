// localStorage 读写：全部包在 try/catch 里，不可用时由调用方退回内存状态
import type { DemoState, ReviewEntry } from '../types';

export const KEY_REVIEWS = 'eventtrace.v1.reviews'; // D8
export const KEY_DEMO = 'eventtrace.v1.demo'; // D9

export function storageAvailable(): boolean {
  try {
    const k = 'eventtrace.v1.__probe';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

function readJSON(key: string): unknown {
  try {
    const s = window.localStorage.getItem(key);
    return s ? (JSON.parse(s) as unknown) : null;
  } catch {
    return null;
  }
}

export function writeJSON(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

const isStr = (v: unknown): v is string => typeof v === 'string';
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);

function isReviewEntry(v: unknown): v is ReviewEntry {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  const t = r.target as Record<string, unknown> | undefined;
  return (
    isStr(r.id) &&
    !!t &&
    (t.kind === 'claim' || t.kind === 'document') &&
    isStr(t.id) &&
    (r.action === 'confirm' || r.action === 'change_nature' || r.action === 'mark_noise') &&
    isStr(r.reason) &&
    isStr(r.demo_time) &&
    isStr(r.created_at)
  );
}

export function loadReviews(): ReviewEntry[] {
  const raw = readJSON(KEY_REVIEWS);
  return Array.isArray(raw) ? raw.filter(isReviewEntry) : [];
}

export function loadDemo(defaultWatchlist: string[]): DemoState {
  const fresh: DemoState = {
    clock: null,
    read_notification_ids: [],
    onboarding_dismissed: false,
    watchlist: defaultWatchlist,
  };
  const raw = readJSON(KEY_DEMO);
  if (!raw || typeof raw !== 'object') return fresh;
  const r = raw as Record<string, unknown>;
  return {
    clock: isStr(r.clock) ? r.clock : null,
    read_notification_ids: isStrArr(r.read_notification_ids) ? r.read_notification_ids : [],
    onboarding_dismissed: r.onboarding_dismissed === true,
    watchlist: isStrArr(r.watchlist) ? r.watchlist : defaultWatchlist,
  };
}
