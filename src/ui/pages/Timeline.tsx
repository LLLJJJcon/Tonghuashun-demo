// 证据时间线 + 主张
import { useState } from 'react';
import type { ClaimView, DocumentView, EventView, MarketReaction } from '../../types';
import { EXCLUDED_LABEL, NatureBadge, SimTag, Tag, TierBadge, Tip, WarnIcon } from '../components/common';
import { labels } from '../engineApi';
import { fmtLag, fmtNum, fmtOccurred, fmtPct, fmtTime, timeMs } from '../format';
import { useApp } from '../store';

export type ClaimMap = Map<string, { claim: ClaimView; doc: DocumentView }>;

export function isFolded(d: DocumentView): boolean {
  return d.repost_of !== null || d.match.decision === 'unrelated';
}

export function Timeline({
  ev,
  claimMap,
  showFolded,
  setShowFolded,
}: {
  ev: EventView;
  claimMap: ClaimMap;
  showFolded: boolean;
  setShowFolded: (v: boolean) => void;
}) {
  const docs = ev.documents;
  const foldedCount = docs.filter(isFolded).length;
  const visible = showFolded ? docs : docs.filter((d) => !isFolded(d));
  const reviewTargets = new Set(ev.review_items.map((r) => r.target.id));
  const docById = new Map(docs.map((d) => [d.id, d]));
  const fieldLabels: Record<string, string> = Object.fromEntries(ev.event.fields.map((f) => [f.key, f.label]));

  return (
    <section className="panel" aria-labelledby="tl-title">
      <div className="panel-head">
        <h2 id="tl-title">证据时间线</h2>
        <span className="muted small">按披露时间升序</span>
      </div>
      {foldedCount > 0 && (
        <button type="button" className="fold-toggle" aria-expanded={showFolded} onClick={() => setShowFolded(!showFolded)}>
          {showFolded ? `收起 ${foldedCount} 条转载或无关材料` : `已折叠 ${foldedCount} 条转载或无关材料，点击展开`}
        </button>
      )}
      <ol className="timeline">
        {visible.map((d) => (
          <DocNode
            key={d.id}
            doc={d}
            original={d.repost_of ? docById.get(d.repost_of) : undefined}
            claimMap={claimMap}
            reviewTargets={reviewTargets}
            fieldLabels={fieldLabels}
          />
        ))}
      </ol>
    </section>
  );
}

function DocNode({
  doc,
  original,
  claimMap,
  reviewTargets,
  fieldLabels,
}: {
  doc: DocumentView;
  original?: DocumentView;
  claimMap: ClaimMap;
  reviewTargets: Set<string>;
  fieldLabels: Record<string, string>;
}) {
  const { openTrace, state, loaded } = useApp();
  const [open, setOpen] = useState(true);
  const clock = state.demo.clock;
  const folded = isFolded(doc);
  const unrelated = doc.match.decision === 'unrelated';
  const noiseByReview = state.reviews.some(
    (r) =>
      r.action === 'mark_noise' &&
      r.target.kind === 'document' &&
      r.target.id === doc.id &&
      clock !== null &&
      timeMs(r.demo_time) <= timeMs(clock),
  );
  const isRumor = doc.claims.some((c) => c.effective_nature === 'rumor');
  const earliest = doc.claims
    .filter((c) => c.occurred_at)
    .sort((a, b) => timeMs(a.occurred_at) - timeMs(b.occurred_at))[0];
  const lag = fmtLag(doc.info_lag_hours);

  return (
    <li id={`doc-${doc.id}`} className={`tl-node${folded ? ' tl-folded' : ''}${isRumor ? ' tl-rumor' : ''}`}>
      <span className="tl-dot" aria-hidden="true" />
      <div className="tl-card">
        <div className="tl-head">
          <span className="tl-source">
            {doc.source.name} <TierBadge tier={doc.source.tier} reason={doc.source.tier_reason} />
          </span>
          <button type="button" className="tl-title linkish" onClick={() => openTrace({ docId: doc.id, quote: doc.claims[0]?.quote, claimId: doc.claims[0]?.id })}>
            {doc.title}
          </button>
        </div>
        <div className="chips small">
          {doc.is_first_source && <Tag kind="ok">首发</Tag>}
          {doc.repost_of && (
            <Tag kind="muted" title={original ? `转载自「${original.title}」` : `转载自 ${doc.repost_of}`}>
              转载{original ? `自 ${original.source.name}` : ''}
            </Tag>
          )}
          {unrelated && (
            <Tip
              label="已判为无关"
              tip={
                <>
                  <div>AI 同一事件判定：无关（置信度 {fmtNum(doc.match.ai.confidence)}）</div>
                  <div>{doc.match.ai.reason}</div>
                </>
              }
            >
              <Tag kind="muted">已判为无关</Tag>
            </Tip>
          )}
          {noiseByReview && <Tag kind="muted">人工标为噪声</Tag>}
          {doc.source_updated_at && <Tag kind="info">来源已修订</Tag>}
          {doc.match.decision === 'related' && <Tag kind="info">相关但未合并</Tag>}
          {reviewTargets.has(doc.id) && <Tag kind="warn">待复核</Tag>}
        </div>
        {isRumor && (
          <div className="rumor-banner" role="note">
            <WarnIcon /> 传闻 · 未经证实：来源不明或匿名，无法核验
          </div>
        )}

        <dl className="times">
          <div>
            <dt>发生</dt>
            <dd>
              {earliest ? fmtOccurred(earliest.occurred_at, earliest.occurred_precision, earliest.occurred_range) : '未知'}
            </dd>
          </div>
          <div>
            <dt>披露</dt>
            <dd>{fmtTime(doc.published_at)}</dd>
          </div>
          <div>
            <dt>抓取</dt>
            <dd>
              {fmtTime(doc.fetched_at)} <SimTag />
            </dd>
          </div>
          {doc.source_updated_at && (
            <div>
              <dt>来源更新</dt>
              <dd>{fmtTime(doc.source_updated_at)}</dd>
            </div>
          )}
          {lag && (
            <div>
              <dt>信息时差</dt>
              <dd title="披露时间 − 发生时间">{lag}</dd>
            </div>
          )}
        </dl>

        {doc.market_reaction && <Market r={doc.market_reaction} benchName={loaded.data.market?.benchmark.name} adjust={loaded.data.market?.adjust} />}

        {doc.claims.length > 0 && (
          <div className="claims">
            <button type="button" className="btn btn-link small" aria-expanded={open} onClick={() => setOpen(!open)}>
              {open ? '收起主张' : `展开主张（${doc.claims.length}）`}
            </button>
            {open && (
              <ul className="claim-list">
                {doc.claims.map((c) => (
                  <ClaimItem
                    key={c.id}
                    claim={c}
                    doc={doc}
                    claimMap={claimMap}
                    needsReview={reviewTargets.has(c.id)}
                    fieldLabels={fieldLabels}
                  />
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function Market({ r, benchName, adjust }: { r: MarketReaction; benchName?: string; adjust?: string }) {
  const tip = (
    <>
      <div>数据来源：{r.source}</div>
      <div>取数时间：{fmtTime(r.fetched_at)}</div>
      {adjust && <div>复权方式：{adjust}</div>}
      <div>反应日：{r.reaction_date}</div>
      <div>仅为观察到的价格变化，不代表因果。</div>
    </>
  );
  return (
    <div className="market">
      <Tip tip={tip} label="行情反应说明">
        <span className="market-line">
          <strong>{r.name}</strong> 当日 {fmtPct(r.day_pct)}｜3 日 {fmtPct(r.three_day_pct)}｜{benchName ?? '基准指数'} 同期 当日{' '}
          {fmtPct(r.bench_day_pct)}｜3 日 {fmtPct(r.bench_three_day_pct)}
        </span>
      </Tip>
      <span className="market-note">仅为观察到的价格变化，不代表因果</span>
    </div>
  );
}

function ClaimItem({
  claim,
  doc,
  claimMap,
  needsReview,
  fieldLabels,
}: {
  claim: ClaimView;
  doc: DocumentView;
  claimMap: ClaimMap;
  needsReview: boolean;
  fieldLabels: Record<string, string>;
}) {
  const { openTrace, loaded } = useApp();
  const [aiOpen, setAiOpen] = useState(false);
  const run = loaded.data.aiRuns.find((r) => r.id === claim.ai.run_id);
  const excluded = claim.excluded_reason;
  const b = claim.weight_breakdown;
  const changed = claim.effective_nature !== claim.nature;

  return (
    <li id={`claim-${claim.id}`} className={`claim${excluded ? ' claim-excluded' : ''}`}>
      <div className="claim-tags">
        <NatureBadge nature={claim.effective_nature} />
        <Tag kind={claim.stance === 'oppose' ? 'danger' : claim.stance === 'support' ? 'ok' : 'muted'}>
          {labels.stance[claim.stance]}
        </Tag>
        {claim.revision &&
          claim.revision.targets.map((t) => {
            const target = claimMap.get(t);
            const verb = claim.revision!.type === 'update' ? '更新了' : '更正了';
            return (
              <Tag key={t} kind="info">
                {verb}「{target ? target.claim.text : t}」
              </Tag>
            );
          })}
        {changed && (
          <Tag kind="human">
            人工改判：{labels.nature[claim.nature]} → {labels.nature[claim.effective_nature]}
          </Tag>
        )}
        {needsReview && <Tag kind="warn">待复核</Tag>}
        {excluded && <Tag kind="muted">无效：{EXCLUDED_LABEL[excluded]}</Tag>}
      </div>
      <p className="claim-text">{claim.text}</p>
      <button
        type="button"
        className="quote linkish"
        onClick={() => openTrace({ docId: doc.id, quote: claim.quote, claimId: claim.id })}
        title="点击查看原文"
      >
        「{claim.quote}」
      </button>
      {claim.fields && Object.keys(claim.fields).length > 0 && (
        <div className="small muted">
          {Object.entries(claim.fields).map(([k, v]) => (
            <span key={k} className="field-pill">
              {fieldLabels[k] ?? k}：{v.display}
            </span>
          ))}
        </div>
      )}
      <div className="claim-foot">
        <Tip
          label={`权重 ${fmtNum(claim.weight, 3)}`}
          tip={
            <>
              来源分 {fmtNum(b.tier_score)} × 性质系数 {fmtNum(b.nature_coef)} × 时效衰减 {fmtNum(b.decay, 3)} = 权重{' '}
              {fmtNum(claim.weight, 3)}
              {excluded && <div>此主张无效（{EXCLUDED_LABEL[excluded]}），权重计为 0</div>}
            </>
          }
        >
          <span className="weight">权重 {fmtNum(claim.weight, 3)}</span>
        </Tip>
        <button type="button" className="ai-tag" aria-expanded={aiOpen} onClick={() => setAiOpen(!aiOpen)}>
          AI 预处理
        </button>
      </div>
      {aiOpen && (
        <dl className="kv ai-detail">
          <dt>模型</dt>
          <dd>{run ? run.model : '—'}</dd>
          <dt>提示词版本</dt>
          <dd>{run ? `${run.prompt_version}（${run.prompt_file}）` : '—'}</dd>
          <dt>运行时间</dt>
          <dd>{run ? fmtTime(run.run_at) : '—'}</dd>
          <dt>AI 置信度</dt>
          <dd>{fmtNum(claim.ai.confidence)}</dd>
          <dt>AI 理由</dt>
          <dd>{claim.ai.reason}</dd>
          <dt>预处理校验</dt>
          <dd>
            {claim.prep_check.status === 'passed'
              ? '人工校验：通过'
              : claim.prep_check.status === 'corrected'
                ? `已修正：${claim.prep_check.note ?? `原为 ${JSON.stringify(claim.prep_check.original)}`}`
                : '未经人工校验'}
          </dd>
        </dl>
      )}
    </li>
  );
}
