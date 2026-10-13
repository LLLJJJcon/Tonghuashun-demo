// 溯源抽屉：材料原文、来源等级、四个时间、AI 运行记录
import { useEffect, useRef } from 'react';
import { fmtOccurred, fmtTime, timeMs } from '../format';
import { useApp } from '../store';
import { CloseIcon, ORIGIN_LABEL, SimTag, TierBadge } from './common';

function Highlighted({ text, quote }: { text: string; quote?: string }) {
  if (!quote) return <>{text}</>;
  const i = text.indexOf(quote);
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="quote-mark">{quote}</mark>
      {text.slice(i + quote.length)}
    </>
  );
}

export function TraceDrawer() {
  const { trace, closeTrace, loaded } = useApp();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!trace) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeTrace();
    };
    document.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [trace, closeTrace]);

  if (!trace) return null;
  const { data } = loaded;
  const doc = data.documents.find((d) => d.id === trace.docId);
  const source = doc ? data.sources.find((s) => s.id === doc.source_id) : undefined;
  const claims = doc ? data.claims.filter((c) => c.document_id === doc.id) : [];
  const runs = doc
    ? data.aiRuns.filter((r) => r.document_id === doc.id).sort((a, b) => a.stage.localeCompare(b.stage))
    : [];
  const earliest = claims
    .filter((c) => c.occurred_at)
    .sort((a, b) => timeMs(a.occurred_at) - timeMs(b.occurred_at))[0];
  const quoteFound = !!trace.quote && !!doc && doc.excerpt.includes(trace.quote);

  return (
    <div className="drawer-backdrop" onClick={closeTrace}>
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        tabIndex={-1}
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-head">
          <span className="muted small">溯源</span>
          <button type="button" className="btn btn-icon" aria-label="关闭溯源抽屉" onClick={closeTrace}>
            <CloseIcon />
          </button>
        </div>
        {!doc ? (
          <p className="empty">未找到这条材料（{trace.docId}）。</p>
        ) : (
          <div className="drawer-body">
            <h2 id="drawer-title">{doc.title}</h2>
            <dl className="kv">
              <dt>来源</dt>
              <dd>
                {source ? (
                  <>
                    {source.name} <TierBadge tier={source.tier} />
                  </>
                ) : (
                  doc.source_id
                )}
              </dd>
              {source && (
                <>
                  <dt>等级理由</dt>
                  <dd>{source.tier_reason}</dd>
                </>
              )}
              <dt>数据渠道</dt>
              <dd>{ORIGIN_LABEL[doc.data_origin] ?? doc.data_origin}</dd>
              <dt>原文链接</dt>
              <dd>
                {doc.url ? (
                  <a href={doc.url} target="_blank" rel="noopener noreferrer">
                    在新窗口打开原文
                  </a>
                ) : (
                  '—'
                )}
              </dd>
            </dl>

            <h3>摘录全文</h3>
            <blockquote className="excerpt">
              <Highlighted text={doc.excerpt} quote={trace.quote} />
            </blockquote>
            {trace.quote && !quoteFound && (
              <p className="small warn-text">提示：引用片段未能在摘录中精确定位。引用为「{trace.quote}」</p>
            )}

            <h3>四个时间</h3>
            <dl className="kv">
              <dt>发生</dt>
              <dd>
                {earliest
                  ? fmtOccurred(earliest.occurred_at, earliest.occurred_precision, earliest.occurred_range)
                  : '未知'}
              </dd>
              <dt>披露</dt>
              <dd>{fmtTime(doc.published_at)}</dd>
              <dt>抓取</dt>
              <dd>
                {fmtTime(doc.fetched_at)} <SimTag />
              </dd>
              {doc.source_updated_at && (
                <>
                  <dt>来源更新</dt>
                  <dd>{fmtTime(doc.source_updated_at)}</dd>
                </>
              )}
            </dl>

            <h3>AI 运行记录</h3>
            {runs.length === 0 ? (
              <p className="muted small">没有这条材料的 AI 运行记录。</p>
            ) : (
              <ul className="run-list">
                {runs.map((r) => (
                  <li key={r.id} className="run">
                    <div className="run-head">
                      <strong>{r.stage}</strong>
                      <span>{r.model}</span>
                      <span className="muted">提示词 {r.prompt_version}</span>
                      <span className={`tag ${r.status === 'ok' || r.status === 'retried_ok' ? 'tag-ok' : 'tag-danger'}`}>
                        {r.status}
                      </span>
                    </div>
                    <div className="muted small">
                      运行时间 {fmtTime(r.run_at)} · 尝试 {r.attempts} 次 · {r.prompt_file}
                    </div>
                    {r.error && <div className="small warn-text">错误：{r.error}</div>}
                    <pre className="run-output">{r.output_excerpt}</pre>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
