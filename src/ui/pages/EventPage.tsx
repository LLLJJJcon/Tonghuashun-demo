// 事件详情：结论卡、冲突、时间线、版本历史、复核
import { useEffect, useMemo, useState } from 'react';
import type { Conflict, EventView, Version } from '../../types';
import { ACTION_LABEL, ConfidenceBar, NatureBadge, RELATION_LABEL, StatusBadge, Tag, TierBadge } from '../components/common';
import { labels } from '../engineApi';
import { fmtTime } from '../format';
import { eventHref } from '../router';
import { useApp } from '../store';
import { ReviewPanel } from './ReviewPanel';
import { isFolded, Timeline, type ClaimMap } from './Timeline';

export function EventPage({ id }: { id: string }) {
  const { output, loaded, focus, clearFocus, stepNext } = useApp();
  const ev = output.events.find((e) => e.event.id === id);
  const [showFolded, setShowFolded] = useState(false);

  const claimMap: ClaimMap = useMemo(() => {
    const m: ClaimMap = new Map();
    if (ev) for (const d of ev.documents) for (const c of d.claims) m.set(c.id, { claim: c, doc: d });
    return m;
  }, [ev]);

  // 定位：需要时先展开折叠材料，再滚动并高亮 2 秒
  const [localFocus, setFocusLocal] = useState<string | null>(null);
  const locateDoc = (docId: string, elementId = `doc-${docId}`) => {
    const d = ev?.documents.find((x) => x.id === docId);
    if (d && isFolded(d)) setShowFolded(true);
    setFocusLocal(elementId);
  };

  useEffect(() => {
    const globalFocus = focus && focus.eventId === id ? focus : null;
    const target = localFocus ?? globalFocus?.elementId ?? null;
    if (!target) return;
    const el = document.getElementById(target);
    if (localFocus) setFocusLocal(null);
    if (globalFocus) clearFocus();
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
    window.setTimeout(() => el.classList.remove('flash'), 2000);
  }, [focus, localFocus, clearFocus, showFolded, ev, id]);

  const def = loaded.data.events.find((e) => e.id === id);
  if (!ev) {
    return (
      <div className="page">
        <a href="#/" className="back">
          ← 返回首页
        </a>
        <div className="empty-state">
          {def ? (
            <>
              <h2>{def.title}</h2>
              <p>在当前演示时刻，这个事件还没有可见的材料。继续点击「下一步」接收更多材料。</p>
              <button type="button" className="btn btn-primary" onClick={stepNext}>
                下一步
              </button>
            </>
          ) : (
            <p>未找到这个事件（{id}）。</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="page event">
      <a href="#/" className="back">
        ← 返回首页
      </a>
      <ConclusionCard ev={ev} claimMap={claimMap} />
      {ev.conflicts.length > 0 && <Conflicts ev={ev} claimMap={claimMap} />}
      <div className="event-grid">
        <div className="col-main">
          <Timeline ev={ev} claimMap={claimMap} showFolded={showFolded} setShowFolded={setShowFolded} />
        </div>
        <div className="col-side">
          <Versions ev={ev} claimMap={claimMap} locateDoc={locateDoc} />
          <ReviewPanel ev={ev} claimMap={claimMap} />
        </div>
      </div>
    </div>
  );
}

function ConclusionCard({ ev, claimMap }: { ev: EventView; claimMap: ClaimMap }) {
  const { openTrace, loaded } = useApp();
  const first = ev.documents.find((d) => d.id === ev.first_source_doc_id);
  const related = (ev.event.related_event_ids ?? [])
    .map((rid) => loaded.data.events.find((e) => e.id === rid))
    .filter((e): e is NonNullable<typeof e> => !!e);
  return (
    <section className={`panel conclusion st-border-${ev.status}`} aria-labelledby="ev-title">
      <div className="conclusion-top">
        <div>
          <h1 id="ev-title">{ev.event.title}</h1>
          <div className="chips small">
            {ev.event.stocks.map((s) => (
              <span key={s.code} className="chip chip-sm">
                {s.name} <span className="muted">{s.code}（{RELATION_LABEL[s.relation]}）</span>
              </span>
            ))}
            {ev.event.is_counter_example && <Tag kind="info">相关但未合并</Tag>}
          </div>
          {related.length > 0 && (
            <p className="small muted">
              相关但未合并的事件：
              {related.map((e, i) => (
                <span key={e.id}>
                  {i > 0 && '、'}
                  <a href={eventHref(e.id)}>{e.title}</a>
                </span>
              ))}
            </p>
          )}
        </div>
        <StatusBadge status={ev.status} large />
      </div>
      <p className="conclusion-text">{ev.conclusion_text}</p>
      <ConfidenceBar
        confidence={ev.confidence}
        support={ev.support_weight}
        oppose={ev.oppose_weight}
        sources={ev.independent_sources}
      />

      <div className="conclusion-grid">
        <div>
          <h3 className="small muted">当前关键要素</h3>
          {ev.event.fields.length === 0 ? (
            <p className="small muted">本事件没有定义关键要素</p>
          ) : (
            <ul className="field-list">
              {ev.event.fields.map((f) => {
                const cur = ev.current_fields[f.key];
                const hit = cur ? claimMap.get(cur.claim_id) : undefined;
                return (
                  <li key={f.key}>
                    <span className="muted">{f.label}：</span>
                    {cur ? (
                      <button
                        type="button"
                        className="linkish strong"
                        title="点击溯源"
                        onClick={() =>
                          hit && openTrace({ docId: hit.doc.id, quote: hit.claim.quote, claimId: hit.claim.id })
                        }
                      >
                        {cur.display}
                      </button>
                    ) : (
                      <span className="muted">暂无</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div>
          <h3 className="small muted">首发来源</h3>
          {first ? (
            <button type="button" className="linkish first-source" title="点击溯源" onClick={() => openTrace({ docId: first.id, quote: first.claims[0]?.quote, claimId: first.claims[0]?.id })}>
              {first.source.name} <TierBadge tier={first.source.tier} /> · 披露于 {fmtTime(first.published_at)}
            </button>
          ) : (
            <span className="small muted">—</span>
          )}
        </div>
        <div>
          <h3 className="small muted">最后变化于</h3>
          <span>{fmtTime(ev.last_changed_at)}</span>
        </div>
      </div>
    </section>
  );
}

function Conflicts({ ev, claimMap }: { ev: EventView; claimMap: ClaimMap }) {
  const fieldLabel = (k?: string) => ev.event.fields.find((f) => f.key === k)?.label ?? k ?? '';
  return (
    <section className="panel" aria-labelledby="cf-title">
      <div className="panel-head">
        <h2 id="cf-title">证据冲突</h2>
      </div>
      <ul className="conflict-list">
        {ev.conflicts.map((c) => (
          <li key={c.id} className={`conflict${c.resolved ? ' resolved' : ' unresolved'}`}>
            <div className="conflict-head">
              <strong>{c.kind === 'stance' ? '立场冲突' : `要素「${fieldLabel(c.field_key)}」取值不一致`}</strong>
              {c.resolved ? <Tag kind="ok">已解决</Tag> : <Tag kind="danger">未解决</Tag>}
            </div>
            <p className="small">{c.rule_text}</p>
            <div className="sides">
              <Side title="A 方" ids={c.side_a} win={c.winner === 'a'} claimMap={claimMap} conflict={c} />
              <Side title="B 方" ids={c.side_b} win={c.winner === 'b'} claimMap={claimMap} conflict={c} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Side({
  title,
  ids,
  win,
  claimMap,
  conflict,
}: {
  title: string;
  ids: string[];
  win: boolean;
  claimMap: ClaimMap;
  conflict: Conflict;
}) {
  const { openTrace } = useApp();
  return (
    <div className={`side${win ? ' side-win' : ''}`}>
      <div className="side-title">
        {title}
        {win && <Tag kind="ok">以此为准</Tag>}
      </div>
      <ul>
        {ids.map((id) => {
          const hit = claimMap.get(id);
          if (!hit) return <li key={id}>{id}</li>;
          const { claim, doc } = hit;
          return (
            <li key={id} className="side-claim">
              <div className="chips small">
                <span>{claim.source.name}</span>
                <TierBadge tier={claim.source.tier} />
                <NatureBadge nature={claim.effective_nature} />
                {conflict.kind === 'field' && conflict.field_key && claim.fields?.[conflict.field_key] && (
                  <span className="strong">{claim.fields[conflict.field_key].display}</span>
                )}
              </div>
              <button type="button" className="quote linkish" onClick={() => openTrace({ docId: doc.id, quote: claim.quote, claimId: claim.id })}>
                「{claim.quote}」
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Versions({
  ev,
  claimMap,
  locateDoc,
}: {
  ev: EventView;
  claimMap: ClaimMap;
  locateDoc: (docId: string, elementId?: string) => void;
}) {
  const list = [...ev.versions].reverse();
  return (
    <section className="panel" aria-labelledby="ver-title">
      <div className="panel-head">
        <h2 id="ver-title">版本历史</h2>
        <span className="muted small">只有实质变化才生成版本</span>
      </div>
      <ol className="version-list">
        {list.map((v) => (
          <li key={v.id} id={`ver-${v.id}`} className={`version${v.is_human_correction ? ' version-human' : ''}`}>
            <div className="version-head">
              <strong>v{v.no}</strong>
              <span className="small muted">{fmtTime(v.at)}</span>
              {v.is_human_correction && <Tag kind="human">人工修正</Tag>}
            </div>
            <div className="small">
              {v.status_before === v.status_after ? (
                <>
                  状态未变：<StatusBadge status={v.status_after} />
                </>
              ) : (
                <>
                  {v.status_before ? labels.status[v.status_before] : '新事件'} → <StatusBadge status={v.status_after} />
                </>
              )}
            </div>
            <p className="version-text">{v.text}</p>
            <TriggerLink v={v} ev={ev} claimMap={claimMap} locateDoc={locateDoc} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function TriggerLink({
  v,
  ev,
  claimMap,
  locateDoc,
}: {
  v: Version;
  ev: EventView;
  claimMap: ClaimMap;
  locateDoc: (docId: string, elementId?: string) => void;
}) {
  const { state } = useApp();
  const t = v.trigger;
  if (t.kind === 'decay') return <span className="small muted">触发：时效衰减</span>;
  if (t.kind === 'document') {
    const d = ev.documents.find((x) => x.id === t.ref_id);
    return (
      <button type="button" className="btn btn-link small" onClick={() => locateDoc(t.ref_id)}>
        触发材料：{d ? d.title : t.ref_id}
      </button>
    );
  }
  if (t.kind === 'expiry') {
    const hit = claimMap.get(t.ref_id);
    return (
      <button
        type="button"
        className="btn btn-link small"
        onClick={() => (hit ? locateDoc(hit.doc.id, `claim-${hit.claim.id}`) : locateDoc(t.ref_id))}
      >
        到期主张：{hit ? hit.claim.text : t.ref_id}
      </button>
    );
  }
  const r = state.reviews.find((x) => x.id === t.ref_id);
  if (!r) return <span className="small muted">复核记录：{t.ref_id}</span>;
  const hit = r.target.kind === 'claim' ? claimMap.get(r.target.id) : undefined;
  const docId = hit ? hit.doc.id : r.target.id;
  return (
    <button
      type="button"
      className="btn btn-link small"
      onClick={() => locateDoc(docId, hit ? `claim-${hit.claim.id}` : `doc-${docId}`)}
    >
      复核记录：{ACTION_LABEL[r.action]}
      {r.action === 'change_nature' && r.from && r.to
        ? `（${labels.nature[r.from as keyof typeof labels.nature] ?? r.from} → ${labels.nature[r.to as keyof typeof labels.nature] ?? r.to}）`
        : ''}
      ，理由：{r.reason}
    </button>
  );
}
