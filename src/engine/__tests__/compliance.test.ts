// 附录 B.12 C1：模板固定部分不得包含禁用词
import { describe, expect, it } from 'vitest';
import type { EventStatus } from '../../types';
import {
  conclusionTpl, conflictTpl, FORBIDDEN_WORDS, labels, notificationTpl, reviewActionText, reviewTpl, versionTpl,
} from '../templates';
import { LATEST, run } from './helpers';

/** 用中性占位符渲染每一个模板，得到的就是模板的固定部分 */
function renderAllTemplates(): string[] {
  const X = 'X';
  const statuses = Object.keys(labels.status) as EventStatus[];
  const out: string[] = [
    conclusionTpl.unverified(X, 3, 'B'), conclusionTpl.unverified(X, 0, null),
    conclusionTpl.partially_confirmed(X, 2), conclusionTpl.confirmed(X, X, 'S', X), conclusionTpl.denied(X, X, 'S', X),
    conclusionTpl.corrected(X, X, X), conclusionTpl.expired(X, X),
    versionTpl.newEvent(X, 'S', X), versionTpl.field(X, null, X), versionTpl.field(X, X, null),
    versionTpl.newConflict(versionTpl.conflictStance()), versionTpl.newConflict(versionTpl.conflictField(X)),
    versionTpl.conflictResolved(X), versionTpl.conflictGone(X), versionTpl.humanPrefix(X, X), versionTpl.join([X, X]),
    conflictTpl.resolved(X, 'S'), conflictTpl.unresolved(),
    reviewTpl.low_confidence(0.62), reviewTpl.fact_low_tier(), reviewTpl.low_match_confidence(),
    reviewTpl.claimSuggestion('fact', 0.5), reviewTpl.matchSuggestion('same', X, 0.5), reviewTpl.matchSuggestion('unrelated', null, 0.5),
    notificationTpl(X, X),
    reviewActionText('confirm'), reviewActionText('mark_noise'), reviewActionText('change_nature', 'rumor'),
  ];
  for (const a of statuses) for (const b of statuses) {
    out.push(versionTpl.statusByDocument(a, b, X, X), versionTpl.statusByExpiry(a, b, X, X), versionTpl.statusByReview(a, b), versionTpl.statusByDecay(a, b));
  }
  for (const group of [labels.status, labels.nature, labels.stance, labels.excluded, labels.revision, labels.match, labels.reviewAction, labels.relation, labels.precision]) {
    out.push(...Object.values(group));
  }
  out.push(...(['S', 'A', 'B', 'C', 'D'] as const).map(labels.tier));
  return out;
}

describe('附录 B.12 合规', () => {
  it('C1 所有模板的固定部分不包含禁用词', () => {
    const texts = renderAllTemplates();
    expect(texts.length).toBeGreaterThan(150);
    for (const t of texts) for (const w of FORBIDDEN_WORDS) expect(t, `「${t}」包含禁用词「${w}」`).not.toContain(w);
    expect(FORBIDDEN_WORDS).toEqual(expect.arrayContaining(['买入', '卖出', '增持', '减持', '推荐', '目标价', '建议']));
  });

  it('C1 补充：开发样例全流程生成的文案也不包含禁用词', () => {
    const out = run(LATEST);
    const texts = [
      ...out.events.flatMap((e) => [e.conclusion_text, ...e.versions.map((v) => v.text), ...e.conflicts.map((c) => c.rule_text)]),
      ...out.notifications.map((n) => n.text),
      ...out.review_queue.flatMap((r) => [r.reason_text, r.ai_suggestion]),
    ];
    for (const t of texts) for (const w of FORBIDDEN_WORDS) expect(t).not.toContain(w);
  });
});
