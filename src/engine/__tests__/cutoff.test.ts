// 数据截止时间（rules.data_as_of）与「只走本事件」的检查点
import { describe, expect, it } from 'vitest';
import { derive, eventCheckpoints } from '../index';
import { devData, fetched, input } from './helpers';

describe('数据截止时间与本事件检查点', () => {
  it('data_as_of 之后的检查点不进入回放', () => {
    const base = devData();
    const asOf = '2025-04-30T00:00:00+08:00';
    const out = derive({ ...input(null), rules: { ...base.rules, data_as_of: asOf } });
    expect(out.checkpoints.every((c) => Date.parse(c) <= Date.parse(asOf))).toBe(true);
    // evt_C 的有效期 2025-06-30 晚于截止时间，因此不再出现在检查点里
    expect(out.checkpoints.some((c) => c.startsWith('2025-06-30'))).toBe(false);
  });

  it('未设置 data_as_of 时检查点不受影响', () => {
    const out = derive(input(null));
    expect(out.checkpoints.some((c) => c.startsWith('2025-06-30'))).toBe(true);
  });

  it('只走本事件时不停在仅有无关材料的时刻', () => {
    const cps = eventCheckpoints(input(null), 'evt_A');
    expect(cps).not.toContain(fetched('A06'));
    expect(cps).toContain(fetched('A05'));
  });
});
