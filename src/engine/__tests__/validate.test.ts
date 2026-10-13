// 附录 B.12 V1：数据校验与降级（附录 A.4）
import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, validate } from '../index';
import { loadDevRaw } from './helpers';

type Rec = Record<string, unknown>;
const arr = (raw: Rec, k: string) => raw[k] as Rec[];

describe('附录 B.12 数据校验', () => {
  it('V1-a 缺少必填字段 → error，丢弃该记录（以及引用它的主张）', () => {
    const raw = loadDevRaw();
    delete arr(raw, 'documents').find((d) => d.id === 'doc_A02')!.title;
    const { data, issues } = validate(raw, { production: false });
    expect(issues).toContainEqual(expect.objectContaining({ level: 'error', file: 'documents.json', record_id: 'doc_A02' }));
    expect(data.documents.map((d) => d.id)).not.toContain('doc_A02');
    expect(issues).toContainEqual(expect.objectContaining({ level: 'error', file: 'claims.json', record_id: 'doc_A02_c1' }));
    expect(data.claims.map((c) => c.id)).not.toContain('doc_A02_c1');
  });

  it('V1-b 引用不存在的 ID → error，丢弃该记录', () => {
    const raw = loadDevRaw();
    arr(raw, 'claims').find((c) => c.id === 'doc_A04_c1')!.document_id = 'doc_X99';
    arr(raw, 'documents').find((d) => d.id === 'doc_C02')!.source_id = 'src_nope';
    const { data, issues } = validate(raw, { production: false });
    expect(issues).toContainEqual(expect.objectContaining({ level: 'error', file: 'claims.json', record_id: 'doc_A04_c1' }));
    expect(issues).toContainEqual(expect.objectContaining({ level: 'error', file: 'documents.json', record_id: 'doc_C02' }));
    expect(data.claims.map((c) => c.id)).not.toContain('doc_A04_c1');
    expect(data.documents.map((d) => d.id)).not.toContain('doc_C02');
  });

  it('V1-c 引用不是摘录子串 → warning，保留记录', () => {
    const raw = loadDevRaw();
    arr(raw, 'claims').find((c) => c.id === 'doc_A02_c1')!.quote = '摘录中没有这句话';
    const { data, issues } = validate(raw, { production: false });
    expect(issues).toEqual([expect.objectContaining({ level: 'warning', file: 'claims.json', record_id: 'doc_A02_c1' })]);
    expect(data.claims.map((c) => c.id)).toContain('doc_A02_c1');
  });

  it('V1-d 生产模式下出现开发样例 → error', () => {
    const { issues } = validate(loadDevRaw(), { production: true });
    const devErrors = issues.filter((i) => i.level === 'error' && i.message.includes('is_dev_sample'));
    expect(devErrors.length).toBeGreaterThan(0);
    expect(devErrors.map((i) => i.file)).toEqual(expect.arrayContaining(['documents.json', 'claims.json', 'sources.json', 'rules.json', 'market.json']));
    // 非生产模式不报
    expect(validate(loadDevRaw(), { production: false }).issues).toEqual([]);
  });

  it('V1 补充：时间格式非法 → error 丢弃；occurred_at 非法 → warning 且精度改为 unknown', () => {
    const raw = loadDevRaw();
    arr(raw, 'documents').find((d) => d.id === 'doc_D01')!.fetched_at = '2025/03/04 12:20';
    const c = arr(raw, 'claims').find((x) => x.id === 'doc_A05_c1')!;
    c.occurred_at = 'not-a-time';
    const { data, issues } = validate(raw, { production: false });
    expect(issues).toContainEqual(expect.objectContaining({ level: 'error', record_id: 'doc_D01' }));
    expect(issues).toContainEqual(expect.objectContaining({ level: 'warning', record_id: 'doc_A05_c1' }));
    const a05 = data.claims.find((x) => x.id === 'doc_A05_c1')!;
    expect(a05.occurred_at).toBeNull();
    expect(a05.occurred_precision).toBe('unknown');
  });

  it('V1 补充：行情缺失 → market 为 null 且不报错；规则缺失 → error 并使用默认参数；接受 .json 文件名作为键', () => {
    const raw = loadDevRaw();
    delete raw.market;
    delete raw.rules;
    const renamed: Rec = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k === 'aiRuns' ? 'ai_runs.json' : k, v]));
    const { data, issues } = validate(renamed, { production: false });
    expect(data.market).toBeNull();
    expect(data.rules).toEqual(DEFAULT_RULES);
    expect(data.aiRuns.length).toBeGreaterThan(0);
    expect(issues).toEqual([expect.objectContaining({ level: 'error', file: 'rules.json' })]);
  });

  it('V1 补充：不修改传入的 raw', () => {
    const raw = loadDevRaw();
    const before = JSON.stringify(raw);
    validate(raw, { production: true });
    expect(JSON.stringify(raw)).toBe(before);
  });
});
