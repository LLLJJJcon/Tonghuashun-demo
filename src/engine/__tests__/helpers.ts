// 测试辅助：加载开发样例（data/dev），构造引擎输入
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EngineInput, ReviewEntry } from '../../types';
import { derive, validate } from '../index';
import type { EngineData } from '../validate';
import { loadRawDir } from '../load';

export const DEV_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../data/dev');

export function loadDevRaw(): Record<string, unknown> {
  const { raw, failures } = loadRawDir(DEV_DIR);
  if (failures.length) throw new Error(failures.join('\n'));
  return raw;
}

let cached: EngineData | null = null;
export function devData(): EngineData {
  if (!cached) {
    const { data, issues } = validate(loadDevRaw(), { production: false });
    if (issues.length) throw new Error(`开发样例校验不通过：${JSON.stringify(issues)}`);
    cached = data;
  }
  return JSON.parse(JSON.stringify(cached)) as EngineData;
}

export function input(clock: string | null, reviews: ReviewEntry[] = [], extra: Partial<EngineInput> = {}): EngineInput {
  return { ...devData(), reviews, clock, ...extra };
}

export function run(clock: string | null, reviews: ReviewEntry[] = [], extra: Partial<EngineInput> = {}) {
  return derive(input(clock, reviews, extra));
}

/** 材料的抓取时间（检查点） */
export function fetched(docNo: string): string {
  const d = devData().documents.find((x) => x.id === `doc_${docNo}`);
  if (!d) throw new Error(`no doc ${docNo}`);
  return d.fetched_at;
}

export function ev(out: ReturnType<typeof derive>, id: string) {
  const e = out.events.find((x) => x.event.id === id);
  if (!e) throw new Error(`event ${id} not visible`);
  return e;
}

export function claimView(out: ReturnType<typeof derive>, claimId: string) {
  for (const e of out.events) for (const d of e.documents) for (const c of d.claims) if (c.id === claimId) return c;
  throw new Error(`claim ${claimId} not visible`);
}

export function review(p: Partial<ReviewEntry> & Pick<ReviewEntry, 'target' | 'action' | 'demo_time'>): ReviewEntry {
  return {
    id: p.id ?? `rv_${p.target.id}_${p.action}`,
    reason: '测试用复核理由',
    created_at: '2026-10-13T10:00:00.000+08:00',
    ...p,
  };
}

export const LATEST = '2025-06-30T23:59:59+08:00';
