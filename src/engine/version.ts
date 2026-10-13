// 快照、版本与通知（附录 B.7）
import type { Conflict, Document, EventDef, EventStatus, FieldChange, ReviewEntry, Version } from '../types';
import { docOrder, effectsOf, type Ctx, type SortedReview } from './context';
import { evaluateEvent, type EventState } from './status';
import { formatDate, reviewActionText, versionTpl } from './templates';
import { idCompare, toMs } from './util';
import { evaluateClaims } from './weight';

/** 快照 = { 状态, 各要素的展示值, 未解决冲突 ID 集合 }；置信度和权重不进快照 */
interface Snapshot {
  status: EventStatus;
  fields: Record<string, { display: string; claim_id: string } | null>;
  unresolved: string[];
}

function snapshotOf(s: EventState): Snapshot {
  return {
    status: s.status,
    fields: s.current_fields,
    unresolved: s.conflicts.filter((c) => !c.resolved).map((c) => c.id).sort(),
  };
}

function sameSnapshot(a: Snapshot, b: Snapshot): boolean {
  if (a.status !== b.status) return false;
  if (a.unresolved.join('\n') !== b.unresolved.join('\n')) return false;
  const keys = new Set([...Object.keys(a.fields), ...Object.keys(b.fields)]);
  for (const k of keys) if ((a.fields[k]?.display ?? null) !== (b.fields[k]?.display ?? null)) return false;
  return true;
}

function conflictWhat(event: EventDef, c: Pick<Conflict, 'kind' | 'field_key'>): string {
  if (c.kind === 'stance') return versionTpl.conflictStance();
  const label = event.fields.find((f) => f.key === c.field_key)?.label ?? c.field_key ?? '';
  return versionTpl.conflictField(label);
}

export interface EventTimeline {
  versions: Version[];
  /** 状态发生变化、且由材料释放触发的版本对应的材料 ID（用于行情关键节点） */
  statusDocIds: Set<string>;
}

type Trigger =
  | { kind: 'document'; doc: Document }
  | { kind: 'expiry'; claimId: string }
  | { kind: 'review'; review: ReviewEntry }
  | { kind: 'decay' };

/**
 * 依次遍历 ≤ E 的检查点，每个检查点先算 pre（复核只取 demo_time < c），
 * 再按 created_at 逐条加入 demo_time = c 的复核记录（post），快照变化即生成版本。
 */
export function buildTimeline(ctx: Ctx, event: EventDef, checkpoints: { iso: string; ms: number }[]): EventTimeline {
  const versions: Version[] = [];
  const statusDocIds = new Set<string>();
  const own = ctx.ownDocs.get(event.id) ?? [];
  // 用断言声明，避免 TS 在闭包赋值后仍把它收窄为 null
  let prev = null as { snap: Snapshot; state: EventState } | null;
  let prevMs = -Infinity;

  const stateAt = (ms: number, applied: SortedReview[]) =>
    evaluateEvent(ctx, event, evaluateClaims(ctx, ms, effectsOf(applied)));

  const emit = (at: string, trigger: Trigger, state: EventState) => {
    const snap = snapshotOf(state);
    const before = prev?.snap ?? null;
    const no = versions.length + 1;
    const parts: string[] = [];
    const field_changes: FieldChange[] = [];
    for (const f of event.fields) {
      const b = before?.fields[f.key] ?? null;
      const a = snap.fields[f.key] ?? null;
      if ((b?.display ?? null) === (a?.display ?? null)) continue;
      field_changes.push({ key: f.key, label: f.label, before: b?.display ?? null, after: a?.display ?? null, claim_id: a?.claim_id ?? b?.claim_id ?? '' });
    }
    const beforeSet = new Set(before?.unresolved ?? []);
    const nowSet = new Set(snap.unresolved);
    const new_conflict_ids = snap.unresolved.filter((id) => !beforeSet.has(id));

    if (!before) {
      const doc = (trigger as { doc: Document }).doc;
      const src = ctx.sources.get(doc.source_id)!;
      parts.push(versionTpl.newEvent(src.name, src.tier, doc.title));
    } else {
      if (before.status !== snap.status) {
        if (trigger.kind === 'document') {
          const src = ctx.sources.get(trigger.doc.source_id)!;
          parts.push(versionTpl.statusByDocument(before.status, snap.status, src.name, trigger.doc.title));
        } else if (trigger.kind === 'expiry') {
          const c = ctx.claimsById.get(trigger.claimId)!;
          parts.push(versionTpl.statusByExpiry(before.status, snap.status, c.text, formatDate(c.valid_until)));
        } else if (trigger.kind === 'review') {
          parts.push(versionTpl.statusByReview(before.status, snap.status));
        } else {
          parts.push(versionTpl.statusByDecay(before.status, snap.status));
        }
      }
      for (const fc of field_changes) parts.push(versionTpl.field(fc.label, fc.before, fc.after));
      const seen = new Set<string>();
      for (const id of new_conflict_ids) {
        const c = state.conflicts.find((x) => x.id === id)!;
        const txt = versionTpl.newConflict(conflictWhat(event, c));
        if (!seen.has(txt)) { seen.add(txt); parts.push(txt); }
      }
      for (const id of before.unresolved) {
        if (nowSet.has(id)) continue;
        const still = state.conflicts.find((x) => x.id === id);
        const old = prev!.state.conflicts.find((x) => x.id === id)!;
        const txt = still ? versionTpl.conflictResolved(conflictWhat(event, old)) : versionTpl.conflictGone(conflictWhat(event, old));
        if (!seen.has(txt)) { seen.add(txt); parts.push(txt); }
      }
    }
    const human = trigger.kind === 'review';
    let text = versionTpl.join(parts);
    if (human) {
      const r = trigger.review;
      text = versionTpl.humanPrefix(reviewActionText(r.action, r.to), r.reason) + text;
    }
    if (trigger.kind === 'document' && (before?.status ?? null) !== snap.status) statusDocIds.add(trigger.doc.id);
    versions.push({
      id: `${event.id}_v${no}`, event_id: event.id, no, at,
      trigger: trigger.kind === 'document' ? { kind: 'document', ref_id: trigger.doc.id }
        : trigger.kind === 'expiry' ? { kind: 'expiry', ref_id: trigger.claimId }
        : trigger.kind === 'review' ? { kind: 'review', ref_id: trigger.review.id }
        : { kind: 'decay', ref_id: event.id },
      status_before: before?.status ?? null, status_after: snap.status,
      field_changes, new_conflict_ids, is_human_correction: human, text,
    });
    prev = { snap, state };
  };

  for (const cp of checkpoints) {
    const released = own.filter((d) => toMs(d.fetched_at) <= cp.ms);
    const pre = ctx.reviews.filter((r) => r.demoMs < cp.ms);
    const atC = ctx.reviews.filter((r) => r.demoMs === cp.ms);
    if (released.length) {
      // ---- pre ----
      const state = stateAt(cp.ms, pre);
      const snap = snapshotOf(state);
      if (!prev || !sameSnapshot(prev.snap, snap)) {
        const docsAtC = released.filter((d) => toMs(d.fetched_at) === cp.ms).sort(docOrder);
        let trigger: Trigger;
        if (!prev) trigger = { kind: 'document', doc: docsAtC[0] ?? [...released].sort(docOrder)[0] };
        else if (docsAtC.length) trigger = { kind: 'document', doc: docsAtC[0] };
        else {
          const expiring = (ctx.claimsByEvent.get(event.id) ?? [])
            .filter((c) => c.valid_until !== null && toMs(c.valid_until) === cp.ms)
            .sort((a, b) => toMs(ctx.docs.get(a.document_id)!.published_at) - toMs(ctx.docs.get(b.document_id)!.published_at) || idCompare(a.id, b.id));
          const between = pre.filter((r) => r.demoMs > prevMs);
          if (expiring.length) trigger = { kind: 'expiry', claimId: expiring[0].id };
          else if (between.length) trigger = { kind: 'review', review: between[between.length - 1].entry };
          else trigger = { kind: 'decay' };
        }
        emit(cp.iso, trigger, state);
      }
      // ---- post ----
      for (let i = 0; i < atC.length; i++) {
        const s = stateAt(cp.ms, [...pre, ...atC.slice(0, i + 1)]);
        if (!sameSnapshot(prev!.snap, snapshotOf(s))) emit(cp.iso, { kind: 'review', review: atC[i].entry }, s);
      }
    }
    prevMs = cp.ms;
  }
  return { versions, statusDocIds };
}
