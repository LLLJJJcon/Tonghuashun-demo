// 仅供 Node 端（CLI、单元测试）使用：从目录读取 D1–D7、D10。浏览器端不要导入本文件。
import fs from 'node:fs';
import path from 'node:path';

/** 键名与前端 src/ui/data.ts 保持一致 */
export const DATA_FILES = [
  ['sources', 'sources.json'],
  ['documents', 'documents.json'],
  ['aiRuns', 'ai_runs.json'],
  ['claims', 'claims.json'],
  ['events', 'events.json'],
  ['rules', 'rules.json'],
  ['watchlistSeed', 'watchlist.seed.json'],
  ['market', 'market.json'],
] as const;

/** 读取目录下的数据文件；缺失的文件不放入 raw（交给 validate 报告） */
export function loadRawDir(dir: string): { raw: Record<string, unknown>; failures: string[] } {
  const raw: Record<string, unknown> = {};
  const failures: string[] = [];
  for (const [key, file] of DATA_FILES) {
    const p = path.join(dir, file);
    if (!fs.existsSync(p)) { failures.push(`${file}：文件不存在`); continue; }
    try {
      raw[key] = JSON.parse(fs.readFileSync(p, 'utf8')) as unknown;
    } catch (e) {
      failures.push(`${file}：JSON 解析失败（${e instanceof Error ? e.message : String(e)}）`);
    }
  }
  return { raw, failures };
}
