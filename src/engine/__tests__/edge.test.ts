// 边界用例：时钟、同一检查点多条复核、关注列表、噪声、行情、时间控件
import { describe, expect, it } from 'vitest';
import { derive, eventCheckpoints, latestCheckpoint, nextCheckpoint, prevCheckpoint } from '../index';
import { reactionStartDate } from '../market';
import { claimView, ev, fetched, input, LATEST, review, run } from './helpers';

describe('边界', () => {
  it('clock = null 时输出为空（检查点照常给出）', () => {
    const out = run(null);
    expect(out.clock).toBeNull();
    expect(out.events).toEqual([]);
    expect(out.notifications).toEqual([]);
    expect(out.review_queue).toEqual([]);
    expect(out.checkpoints.length).toBe(13);
  });

  it('时钟早于第一个检查点时，什么都不可见', () => {
    const out = run('2024-12-31T00:00:00+08:00');
    expect(out.events).toEqual([]);
  });

  it('时钟晚于最后一个检查点时，输出与最后一个检查点一致', () => {
    const last = run(LATEST);
    const later = run('2026-01-01T00:00:00+08:00');
    expect(later.clock).toBe('2026-01-01T00:00:00+08:00');
    expect({ ...later, clock: null }).toEqual({ ...last, clock: null });
  });

  it('同一检查点有多条复核记录时，按 created_at 依次生成多个版本', () => {
    const T = fetched('A04');
    const r1 = review({ id: 'rv_1', target: { kind: 'claim', id: 'doc_A04_c1' }, action: 'change_nature', to: 'rumor', demo_time: T, created_at: '2026-10-13T10:00:00+08:00', reason: '先改为传闻处理' });
    const r2 = review({ id: 'rv_2', target: { kind: 'claim', id: 'doc_A04_c1' }, action: 'change_nature', to: 'speculation', demo_time: T, created_at: '2026-10-13T10:05:00+08:00', reason: '再改回推测处理' });
    const r3 = review({ id: 'rv_3', target: { kind: 'claim', id: 'doc_A04_c1' }, action: 'confirm', demo_time: T, created_at: '2026-10-13T10:06:00+08:00', reason: '确认无需改动' });
    const out = run(T, [r3, r2, r1]); // 故意打乱数组顺序
    const vs = ev(out, 'evt_A').versions.filter((v) => v.is_human_correction);
    expect(vs.map((v) => v.trigger.ref_id)).toEqual(['rv_1', 'rv_2']); // confirm 不改变快照，不产生版本
    expect(vs.map((v) => v.status_after)).toEqual(['unverified', 'partially_confirmed']);
    expect(vs.every((v) => v.at === T)).toBe(true);
    expect(ev(out, 'evt_A').status).toBe('partially_confirmed');
    expect(claimView(out, 'doc_A04_c1').effective_nature).toBe('speculation');
    // 版本号连续
    expect(ev(out, 'evt_A').versions.map((v) => v.no)).toEqual(ev(out, 'evt_A').versions.map((_, i) => i + 1));
  });

  it('复核记录在后续检查点继续生效（pre 阶段取 demo_time < c）', () => {
    const T = fetched('A04');
    const r = review({ id: 'rv_1', target: { kind: 'claim', id: 'doc_A04_c1' }, action: 'change_nature', to: 'rumor', demo_time: T });
    const out = run(fetched('A05'), [r]);
    const a = ev(out, 'evt_A');
    expect(a.status).toBe('denied');
    const last = a.versions[a.versions.length - 1];
    expect(last.status_before).toBe('unverified');
    expect(last.is_human_correction).toBe(false);
  });

  it('材料标为噪声：首发来源改写、主张排除原因为 noise', () => {
    const r = review({ target: { kind: 'document', id: 'doc_A01' }, action: 'mark_noise', demo_time: fetched('A02') });
    const out = run(fetched('A02'), [r]);
    const a = ev(out, 'evt_A');
    expect(a.first_source_doc_id).toBe('doc_A02');
    expect(claimView(out, 'doc_A01_c1').excluded_reason).toBe('noise');
    expect(claimView(out, 'doc_A01_c1').weight).toBe(0);
  });

  it('关注列表只过滤通知', () => {
    const all = run(LATEST);
    const only = run(LATEST, [], { watchlist: ['DEV003.SH'] });
    expect(only.events).toEqual(all.events);
    expect(only.notifications.every((n) => n.event_id === 'evt_C')).toBe(true);
    expect(only.notifications.length).toBe(2);
    expect(run(LATEST, [], { watchlist: [] }).notifications).toEqual([]);
    // DEV002 同时是 evt_A 的交易对手和 evt_B 的主体
    expect(new Set(run(LATEST, [], { watchlist: ['DEV002.SZ'] }).notifications.map((n) => n.event_id))).toEqual(new Set(['evt_A', 'evt_B']));
    // 时间倒序
    const times = all.notifications.map((n) => Date.parse(n.at));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it('权重 = 来源分 × 性质系数 × 时效衰减，并保留 4 位小数', () => {
    const out = run(fetched('A04'));
    const c = claimView(out, 'doc_A02_c1');
    expect(c.weight_breakdown.tier_score).toBe(0.6);
    expect(c.weight_breakdown.nature_coef).toBe(0.4);
    expect(c.weight_breakdown.decay).toBeCloseTo(Math.pow(0.5, 6.5 / 24 / 30), 4);
    expect(c.weight).toBeCloseTo(0.24 * Math.pow(0.5, 6.5 / 24 / 30), 4);
    expect(Math.round(c.weight * 1e4) / 1e4).toBe(c.weight);
  });

  it('行情反应：只在关键节点计算，15:00 及以后顺延一天', () => {
    expect(reactionStartDate('2025-03-05T19:30:00+08:00')).toBe('2025-03-06');
    expect(reactionStartDate('2025-03-04T14:59:00+08:00')).toBe('2025-03-04');
    expect(reactionStartDate('2025-03-04T15:00:00+08:00')).toBe('2025-03-05');
    const a = ev(run(LATEST), 'evt_A');
    const withReaction = a.documents.filter((d) => d.market_reaction).map((d) => d.id);
    expect(withReaction).toEqual(['doc_A01', 'doc_A04', 'doc_A05']); // 首发 + 触发状态变化的材料
    const m = a.documents.find((d) => d.id === 'doc_A05')!.market_reaction!;
    expect(m.code).toBe('DEV001.SZ');
    expect(m.reaction_date).toBe('2025-03-06');
    expect(m.three_day_pct).not.toBeNull();
    expect(m.bench_day_pct).not.toBeNull();
    // 行情缺失 → null，不报错
    const noMarket = derive(input(LATEST, [], { market: null }));
    expect(noMarket.events.every((e) => e.documents.every((d) => d.market_reaction === null))).toBe(true);
    expect(noMarket.issues).toEqual([]);
  });

  it('信息时差 = 披露时间 − 最早发生时间（小时），未知时为 null', () => {
    const out = run(LATEST);
    expect(ev(out, 'evt_D').documents[0].info_lag_hours).toBe(2);
    expect(ev(out, 'evt_A').documents.find((d) => d.id === 'doc_A01')!.info_lag_hours).toBeNull();
  });

  it('非法复核记录被忽略并记 warning', () => {
    const bad = review({ id: 'rv_bad', target: { kind: 'claim', id: 'doc_NOPE_c1' }, action: 'confirm', demo_time: fetched('A04') });
    const out = run(fetched('A04'), [bad]);
    expect(out.issues).toEqual([expect.objectContaining({ level: 'warning', record_id: 'rv_bad' })]);
    expect(out.events).toEqual(run(fetched('A04')).events);
  });

  it('附录 B 未覆盖：仅因时效衰减导致的状态变化也生成版本（触发记为本事件最新材料）', () => {
    const data = input(null);
    const noDenial = { ...data, documents: data.documents.filter((d) => d.id !== 'doc_A05'), claims: data.claims.filter((c) => c.id !== 'doc_A05_c1') };
    const out = derive({ ...noDenial, clock: LATEST });
    const a = ev(out, 'evt_A');
    expect(a.status).toBe('unverified');
    const v = a.versions[a.versions.length - 1];
    expect(v.status_before).toBe('partially_confirmed');
    expect(v.status_after).toBe('unverified');
    expect(v.trigger).toEqual({ kind: 'document', ref_id: 'doc_A04' });
    expect(v.text).toContain('时效衰减');
    expect(a.versions.at(-1)!.at).not.toBe(fetched('A04'));
  });

  it('时间控件：next / prev / latest / eventCheckpoints', () => {
    const cps = run(null).checkpoints;
    expect(nextCheckpoint(cps, null)).toBe(cps[0]);
    expect(nextCheckpoint(cps, cps[0])).toBe(cps[1]);
    expect(nextCheckpoint(cps, cps[cps.length - 1])).toBeNull();
    expect(nextCheckpoint([], null)).toBeNull();
    expect(prevCheckpoint(cps, cps[0])).toBeNull();
    expect(prevCheckpoint(cps, null)).toBeNull();
    expect(prevCheckpoint(cps, cps[2])).toBe(cps[1]);
    expect(prevCheckpoint(cps, '2026-01-01T00:00:00+08:00')).toBe(cps[cps.length - 1]);
    expect(latestCheckpoint(cps)).toBe(LATEST);
    const a = eventCheckpoints(input(null), 'evt_A');
    expect(a).toEqual(['A01', 'A02', 'A03', 'A06', 'A04', 'A05'].map(fetched));
    expect(eventCheckpoints(input(null), 'evt_C')).toEqual([fetched('C01'), fetched('C02'), LATEST]);
  });
});
