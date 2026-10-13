// 启动时加载 D1–D7、D10，交给引擎的 validate()
import type { DataIssue, EngineInput, WatchlistSeed } from '../types';
import { validate } from './engineApi';

export type EngineData = Omit<EngineInput, 'reviews' | 'clock' | 'watchlist'>;

export interface LoadedData {
  data: EngineData;
  seed: WatchlistSeed;
  issues: DataIssue[];
}

export interface LoadFailure {
  file: string;
  message: string;
}

export type LoadResult = { ok: true; value: LoadedData } | { ok: false; failures: LoadFailure[] };

/** raw 中的键名 → 文件名 */
const FILES = [
  ['sources', 'sources.json'],
  ['documents', 'documents.json'],
  ['aiRuns', 'ai_runs.json'],
  ['claims', 'claims.json'],
  ['events', 'events.json'],
  ['rules', 'rules.json'],
  ['watchlistSeed', 'watchlist.seed.json'],
  ['market', 'market.json'],
] as const;

async function fetchJson(file: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`./data/${file}`, { cache: 'no-cache' });
  } catch {
    throw new Error('网络请求失败');
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error('JSON 解析失败');
  }
}

function isSeed(v: unknown): v is WatchlistSeed {
  if (!v || typeof v !== 'object') return false;
  const s = (v as Record<string, unknown>).stocks;
  return (
    Array.isArray(s) &&
    s.every((x) => !!x && typeof x === 'object' && typeof (x as Record<string, unknown>).code === 'string')
  );
}

export async function loadAll(): Promise<LoadResult> {
  const results = await Promise.allSettled(FILES.map(([, file]) => fetchJson(file)));
  const raw: Record<string, unknown> = {};
  const failures: LoadFailure[] = [];
  const extraIssues: DataIssue[] = [];
  results.forEach((r, i) => {
    const [key, file] = FILES[i];
    const message = r.status === 'rejected' ? (r.reason instanceof Error ? r.reason.message : String(r.reason)) : '';
    if (r.status === 'fulfilled') raw[key] = r.value;
    else if (key === 'market') {
      // 附录 A.4：行情数据缺失时隐藏行情信息，不阻断页面
      raw.market = null;
      extraIssues.push({ level: 'warning', file, message: `行情文件加载失败（${message}），已隐藏行情信息` });
    } else failures.push({ file, message });
  });
  if (!failures.length && !isSeed(raw.watchlistSeed)) {
    failures.push({ file: 'watchlist.seed.json', message: '格式不正确：缺少 stocks 列表' });
  }
  if (failures.length) return { ok: false, failures };

  try {
    // 生产构建中 import.meta.env.PROD 恒为 true；开发服务器加载虚构样例时为 false，避免样例标记被报错
    const { data, issues } = validate(raw, { production: import.meta.env.PROD });
    return { ok: true, value: { data, seed: raw.watchlistSeed as WatchlistSeed, issues: [...extraIssues, ...issues] } };
  } catch (e) {
    return {
      ok: false,
      failures: [{ file: '（数据校验）', message: e instanceof Error ? e.message : String(e) }],
    };
  }
}
