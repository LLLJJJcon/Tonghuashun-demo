// 附录 B.12 主链路用例 M1–M13（基于 data/dev 开发样例）
import { describe, expect, it } from 'vitest';
import { derive, prevCheckpoint } from '../index';
import { claimView, devData, ev, fetched, input, LATEST, review, run } from './helpers';

describe('附录 B.12 主链路', () => {
  it('M1 首发来源按披露时间判定：A02 抓取时首发为 A01，evt_A 待证实', () => {
    const out = run(fetched('A02'));
    const a = ev(out, 'evt_A');
    expect(a.first_source_doc_id).toBe('doc_A01');
    expect(a.documents.find((d) => d.id === 'doc_A01')!.is_first_source).toBe(true);
    expect(a.documents.find((d) => d.id === 'doc_A02')!.is_first_source).toBe(false);
    expect(a.status).toBe('unverified');
  });

  it('M2 按抓取时间释放：A02 抓取时 A04、A05 不可见', () => {
    const out = run(fetched('A02'));
    const ids = ev(out, 'evt_A').documents.map((d) => d.id);
    expect(ids).toEqual(['doc_A01', 'doc_A02']);
    expect(ids).not.toContain('doc_A04');
    expect(ids).not.toContain('doc_A05');
    expect(out.review_queue.map((r) => r.id)).not.toContain('rq_doc_A04_c1');
    for (const d of ev(out, 'evt_A').documents) expect(d.released).toBe(true);
  });

  it('M3 转载不产生版本：A03 主张排除原因为 repost、权重为 0，没有新增版本和通知', () => {
    const before = run(fetched('A02'));
    const out = run(fetched('A03'));
    const c = claimView(out, 'doc_A03_c1');
    expect(c.excluded_reason).toBe('repost');
    expect(c.weight).toBe(0);
    expect(ev(out, 'evt_A').versions).toEqual(ev(before, 'evt_A').versions);
    expect(out.notifications).toEqual(before.notifications);
    expect(ev(out, 'evt_A').independent_sources).toBe(ev(before, 'evt_A').independent_sources);
  });

  it('M4 多来源推测 → 部分证实，price 冲突未解决，A04_c1 进入复核队列（low_confidence）', () => {
    const out = run(fetched('A04'));
    const a = ev(out, 'evt_A');
    expect(a.status).toBe('partially_confirmed');
    expect(a.support_weight).toBeGreaterThanOrEqual(0.4);
    expect(a.independent_sources).toBeGreaterThanOrEqual(2);
    const price = a.conflicts.filter((c) => c.kind === 'field' && c.field_key === 'price');
    expect(price).toHaveLength(1);
    expect(price[0].resolved).toBe(false);
    expect(price[0].winner).toBeNull();
    expect(price[0].side_a).toEqual(['doc_A04_c1']);
    expect(price[0].side_b).toEqual(['doc_A02_c1']);
    expect(a.current_fields.price).toEqual({ display: '8 亿元', claim_id: 'doc_A04_c1' });
    const item = out.review_queue.find((r) => r.id === 'rq_doc_A04_c1');
    expect(item?.reason_code).toBe('low_confidence');
    expect(item?.reason_text).toBe('AI 置信度低（0.62），请确认性质');
    expect(a.review_items.map((r) => r.id)).toContain('rq_doc_A04_c1');
    const last = a.versions[a.versions.length - 1];
    expect(last.at).toBe(fetched('A04'));
    expect(last.status_after).toBe('partially_confirmed');
    expect(last.new_conflict_ids).toEqual(['evt_A_field_price_1000000000']);
  });

  it('M5 官方否认：已否认，立场冲突已解决、反对方胜出，生成新版本和通知', () => {
    const before = run(fetched('A04'));
    const out = run(fetched('A05'));
    const a = ev(out, 'evt_A');
    expect(a.status).toBe('denied');
    const stance = a.conflicts.find((c) => c.kind === 'stance')!;
    expect(stance.id).toBe('evt_A_stance');
    expect(stance.resolved).toBe(true);
    expect(stance.winner).toBe('b');
    expect(stance.side_b).toEqual(['doc_A05_c1']);
    expect(stance.rule_text).toBe('以示例证券交易所（S 级事实）为准');
    expect(a.versions.length).toBe(ev(before, 'evt_A').versions.length + 1);
    const v = a.versions[a.versions.length - 1];
    expect(v).toMatchObject({ at: fetched('A05'), status_before: 'partially_confirmed', status_after: 'denied', trigger: { kind: 'document', ref_id: 'doc_A05' } });
    expect(out.notifications[0].id).toBe(v.id);
    expect(out.notifications[0].text.startsWith('【示例科技拟收购样本材料】状态 部分证实 → 已否认')).toBe(true);
    expect(a.conclusion_text).toBe('「示例科技拟收购样本材料控股权」已被示例证券交易所（S 级）于 2025-03-05 否认。');
    expect(a.last_changed_at).toBe(fetched('A05'));
  });

  it('M6 人工改性质后重算：A04_c1 改为传闻 → 回到待证实，版本为人工修正，复核条目消失', () => {
    const T = fetched('A04');
    const rv = review({ id: 'rv_1', target: { kind: 'claim', id: 'doc_A04_c1' }, action: 'change_nature', from: 'speculation', to: 'rumor', demo_time: T, reason: '匿名人士说法，按传闻处理' });
    const out = run(T, [rv]);
    const a = ev(out, 'evt_A');
    expect(a.status).toBe('unverified');
    expect(claimView(out, 'doc_A04_c1').effective_nature).toBe('rumor');
    const last = a.versions[a.versions.length - 1];
    expect(last.is_human_correction).toBe(true);
    expect(last.trigger).toEqual({ kind: 'review', ref_id: 'rv_1' });
    expect(last.status_before).toBe('partially_confirmed');
    expect(last.status_after).toBe('unverified');
    expect(last.text).toBe('人工修正（改性质为传闻，理由：匿名人士说法，按传闻处理）：状态 部分证实 → 待证实');
    // pre 阶段的版本仍然存在：先升到部分证实，再被人工修正拉回
    expect(a.versions[a.versions.length - 2].status_after).toBe('partially_confirmed');
    expect(out.review_queue.map((r) => r.id)).not.toContain('rq_doc_A04_c1');
    expect(a.review_items.map((r) => r.id)).not.toContain('rq_doc_A04_c1');
    expect(out.notifications[0].id).toBe(last.id);
  });

  it('M7 更新：B02 抓取时已确认，profit 1.2–1.5 亿元 → 1.38 亿元，没有要素冲突', () => {
    const out = run(fetched('B02'));
    const b = ev(out, 'evt_B');
    expect(b.status).toBe('confirmed');
    expect(b.current_fields.profit?.display).toBe('1.38 亿元');
    expect(claimView(out, 'doc_B01_c1').excluded_reason).toBe('superseded');
    expect(b.conflicts).toEqual([]);
    const v = b.versions[b.versions.length - 1];
    expect(v.field_changes).toEqual([{ key: 'profit', label: '归母净利润', before: '1.2–1.5 亿元', after: '1.38 亿元', claim_id: 'doc_B02_c1' }]);
    expect(v.text).toBe('归母净利润：1.2–1.5 亿元 → 1.38 亿元');
  });

  it('M8 更正：B03 抓取时已更正，profit 变为 1.32 亿元，没有冲突', () => {
    const out = run(fetched('B03'));
    const b = ev(out, 'evt_B');
    expect(b.status).toBe('corrected');
    expect(b.current_fields.profit?.display).toBe('1.32 亿元');
    expect(claimView(out, 'doc_B01_c1').excluded_reason).toBe('superseded');
    expect(claimView(out, 'doc_B02_c1').excluded_reason).toBe('superseded');
    expect(b.conflicts).toEqual([]);
    const v = b.versions[b.versions.length - 1];
    expect(v.status_before).toBe('confirmed');
    expect(v.status_after).toBe('corrected');
    expect(v.field_changes.map((f) => [f.before, f.after])).toEqual([['1.38 亿元', '1.32 亿元']]);
    expect(b.conclusion_text).toBe('「样本材料 2024 年归母净利润」的披露内容已由示例证券交易所于 2025-03-10 更正，当前要素以更正后为准。');
  });

  it('M9 过期：T = 2025-06-30T23:59:59+08:00 时 evt_C 已过期，前一个检查点为待证实，生成过期类型版本', () => {
    const out = run(LATEST);
    const c = ev(out, 'evt_C');
    expect(c.status).toBe('expired');
    expect(claimView(out, 'doc_C01_c1').excluded_reason).toBe('expired');
    const prevCp = prevCheckpoint(out.checkpoints, LATEST)!;
    expect(prevCp).toBe(fetched('C02'));
    const prev = ev(run(prevCp), 'evt_C');
    expect(prev.status).toBe('unverified');
    expect(prev.independent_sources).toBe(2);
    expect(prev.support_weight).toBeLessThan(0.4); // 时效衰减导致低于阈值
    const v = c.versions[c.versions.length - 1];
    expect(v.trigger).toEqual({ kind: 'expiry', ref_id: 'doc_C01_c1' });
    expect(v.status_before).toBe('unverified');
    expect(v.status_after).toBe('expired');
    expect(v.text).toBe('状态 待证实 → 已过期（主张「公司预计二期项目 6 月投产」有效期 2025-06-30 已到）');
    expect(c.conclusion_text).toBe('「演示新能源二期项目于 2025 年 6 月投产」中的预期已于 2025-06-30 到期，截至当前未见兑现证据。');
  });

  it('M10 反例不合并：evt_A 中没有 D01，evt_D 独立存在，D01 进入复核队列（fact_low_tier）', () => {
    const out = run(LATEST);
    expect(ev(out, 'evt_A').documents.map((d) => d.id)).not.toContain('doc_D01');
    const d = ev(out, 'evt_D');
    expect(d.event.is_counter_example).toBe(true);
    expect(d.event.related_event_ids).toEqual(['evt_A']);
    expect(d.documents.map((x) => x.id)).toEqual(['doc_D01']);
    expect(d.status).toBe('unverified');
    const item = out.review_queue.find((r) => r.id === 'rq_doc_D01_c1');
    expect(item?.reason_code).toBe('fact_low_tier');
    expect(item?.event_id).toBe('evt_D');
    expect(item?.reason_text).toBe('低等级来源被判为事实，与规则冲突');
  });

  it('M11 噪声：A06 出现在 evt_A 的材料中，标记为无关，不影响状态', () => {
    const out = run(LATEST);
    const a = ev(out, 'evt_A');
    const a06 = a.documents.find((d) => d.id === 'doc_A06')!;
    expect(a06.match.decision).toBe('unrelated');
    expect(a06.match.event_id).toBeNull();
    expect(a06.claims).toEqual([]);
    expect(a06.is_first_source).toBe(false);
    expect(a06.market_reaction).toBeNull();
    // A06 到达时没有新版本
    expect(ev(run(fetched('A06')), 'evt_A').versions).toEqual(ev(run(fetched('A03')), 'evt_A').versions);
    // 去掉 A06 后，在两份数据共有的检查点上 evt_A 的状态、版本、权重都不变
    const data = devData();
    const without = { ...data, documents: data.documents.filter((d) => d.id !== 'doc_A06') };
    for (const cp of [fetched('A04'), fetched('A05'), LATEST]) {
      const withA06 = ev(run(cp), 'evt_A');
      const noA06 = ev(derive({ ...without, reviews: [], clock: cp }), 'evt_A');
      expect(withA06.status).toBe(noA06.status);
      expect(withA06.versions).toEqual(noA06.versions);
      expect(withA06.support_weight).toBe(noA06.support_weight);
    }
  });

  it('M12 回退不使用未来证据：从 A05 回退到 A02，输出与直接设为 A02 一致', () => {
    const future = review({ id: 'rv_future', target: { kind: 'claim', id: 'doc_A04_c1' }, action: 'change_nature', to: 'rumor', demo_time: fetched('A04') });
    const direct = run(fetched('A02'), [future]);
    let clock: string | null = fetched('A05');
    const seen: string[] = [];
    while (clock !== null && clock !== fetched('A02')) {
      run(clock, [future]);
      seen.push(clock);
      clock = prevCheckpoint(direct.checkpoints, clock);
    }
    expect(seen.length).toBeGreaterThan(1);
    const back = run(clock, [future]);
    expect(back).toEqual(direct);
    // 未来的复核记录（demo_time > T）不生效
    expect(direct.events).toEqual(run(fetched('A02')).events);
  });

  it('M13 纯函数：同一输入调用两次输出深度相等，且不修改输入', () => {
    const rv = review({ target: { kind: 'document', id: 'doc_A01' }, action: 'mark_noise', demo_time: fetched('A04') });
    const inp = input(LATEST, [rv], { watchlist: ['DEV001.SZ'] });
    const snapshot = JSON.parse(JSON.stringify(inp));
    const a = derive(inp);
    const b = derive(inp);
    expect(a).toEqual(b);
    expect(JSON.parse(JSON.stringify(inp))).toEqual(snapshot);
  });
});
