// 复核面板：可真实执行的复核动作 + 3 个「建设中」入口
import { useState } from 'react';
import type { EventView, Nature, ReviewAction, ReviewEntry, ReviewItem, SourceTier } from '../../types';
import { labels } from '../engineApi';
import { charCount, nowShanghaiISO } from '../format';
import { useApp } from '../store';
import type { ClaimMap } from './Timeline';

const MIN_REASON = 5;
const NATURES: Nature[] = ['fact', 'opinion', 'speculation', 'rumor'];
const BUILDING_MSG = '能力建设中：该操作需要在线 AI 依据你的说明重新生成结果。本 demo 运行时不调用 AI，因此当前不生效。';

export function ReviewPanel({ ev, claimMap }: { ev: EventView; claimMap: ClaimMap }) {
  return (
    <section className="panel" id="review-panel" aria-labelledby="rv-title">
      <div className="panel-head">
        <h2 id="rv-title">复核</h2>
        <span className="muted small">处理后结论会立即按规则重新计算</span>
      </div>
      {ev.review_items.length === 0 ? (
        <p className="empty">暂无待复核</p>
      ) : (
        <ul className="review-list">
          {ev.review_items.map((item) => (
            <li key={item.id}>
              <ReviewCard item={item} ev={ev} claimMap={claimMap} />
            </li>
          ))}
        </ul>
      )}
      <BuildingEntries ev={ev} />
    </section>
  );
}

function ReviewCard({ item, ev, claimMap }: { item: ReviewItem; ev: EventView; claimMap: ClaimMap }) {
  const { state, dispatch, openTrace, showToast } = useApp();
  const isClaim = item.target.kind === 'claim';
  const hit = isClaim ? claimMap.get(item.target.id) : undefined;
  const doc = isClaim ? hit?.doc : ev.documents.find((d) => d.id === item.target.id);
  const currentNature = hit?.claim.effective_nature;

  const [action, setAction] = useState<ReviewAction>('confirm');
  const [toNature, setToNature] = useState<Nature | ''>('');
  const [reason, setReason] = useState('');
  const reasonOk = charCount(reason) >= MIN_REASON;
  const natureOk = action !== 'change_nature' || (toNature !== '' && toNature !== currentNature);
  const clock = state.demo.clock;
  const canSubmit = reasonOk && natureOk && clock !== null;

  const actions: { value: ReviewAction; label: string }[] = isClaim
    ? [
        { value: 'confirm', label: '确认' },
        { value: 'change_nature', label: '改性质' },
        { value: 'mark_noise', label: '标为噪声' },
      ]
    : [
        { value: 'confirm', label: '确认归属' },
        { value: 'mark_noise', label: '标为噪声' },
      ];

  const submit = () => {
    if (!canSubmit || clock === null) return;
    let id = `rv_${Date.now()}`;
    let n = 1;
    while (state.reviews.some((r) => r.id === id)) id = `rv_${Date.now()}_${n++}`;
    const entry: ReviewEntry = {
      id,
      target: item.target,
      action,
      reason: reason.trim(),
      demo_time: clock,
      created_at: nowShanghaiISO(),
    };
    if (action === 'change_nature' && currentNature && toNature) {
      entry.from = currentNature;
      entry.to = toNature;
    }
    dispatch({ type: 'addReview', entry });
    showToast('已提交，结论已重新计算');
  };

  const name = `rv-action-${item.id}`;
  return (
    <div className="review-card" id={`rq-${item.id}`}>
      <p className="review-reason">
        <strong>{item.reason_text}</strong>
      </p>
      <p className="small">AI 当时的判断：{item.ai_suggestion}</p>
      <div className="review-target">
        {isClaim && hit ? (
          <>
            <span className="muted small">主张：</span>
            {hit.claim.text}
            <blockquote className="quote-inline">「{hit.claim.quote}」</blockquote>
          </>
        ) : doc ? (
          <>
            <span className="muted small">材料：</span>
            {doc.title}
          </>
        ) : (
          <code>{item.target.id}</code>
        )}
        {doc && (
          <button
            type="button"
            className="btn btn-link small"
            onClick={() => openTrace({ docId: doc.id, quote: hit?.claim.quote, claimId: hit?.claim.id })}
          >
            查看原文
          </button>
        )}
      </div>

      <form
        className="review-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="seg" role="radiogroup" aria-label="复核动作">
          {actions.map((a) => (
            <label key={a.value} className={`seg-item${action === a.value ? ' on' : ''}`}>
              <input type="radio" name={name} value={a.value} checked={action === a.value} onChange={() => setAction(a.value)} />
              {a.label}
            </label>
          ))}
        </div>
        {action === 'change_nature' && (
          <label className="field">
            <span className="small">
              改为（当前：{currentNature ? labels.nature[currentNature] : '—'}）
            </span>
            <select value={toNature} onChange={(e) => setToNature(e.target.value as Nature | '')}>
              <option value="">请选择性质</option>
              {NATURES.filter((n) => n !== currentNature).map((n) => (
                <option key={n} value={n}>
                  {labels.nature[n]}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="field">
          <span className="small">理由（必填）</span>
          <textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="例如：该说法来自匿名人士，无法核验"
            aria-invalid={!reasonOk}
            aria-describedby={`${name}-hint`}
          />
        </label>
        {!reasonOk && (
          <p className="hint-error" id={`${name}-hint`}>
            请填写至少 5 个字的理由
          </p>
        )}
        {action === 'change_nature' && !natureOk && <p className="hint-error">请选择与当前不同的性质</p>}
        <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
          提交复核
        </button>
      </form>
    </div>
  );
}

function BuildingEntries({ ev }: { ev: EventView }) {
  const { loaded, showToast } = useApp();
  const [note, setNote] = useState('');
  const [tier, setTier] = useState<SourceTier>('B');
  const [target, setTarget] = useState('');
  const others = loaded.data.events.filter((e) => e.id !== ev.event.id);
  const tell = () => showToast(BUILDING_MSG, 'info');

  return (
    <div className="building-group">
      <h3 className="small muted">更多人工介入（需要在线 AI，当前仅界面）</h3>
      <form
        className="building"
        onSubmit={(e) => {
          e.preventDefault();
          tell();
        }}
      >
        <div className="building-head">
          <strong>补充说明（对话）</strong>
          <span className="tag tag-building">建设中</span>
        </div>
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="向 AI 补充你对这个事件的说明" aria-label="补充说明" />
        <button type="submit" className="btn">
          发送
        </button>
      </form>
      <form
        className="building"
        onSubmit={(e) => {
          e.preventDefault();
          tell();
        }}
      >
        <div className="building-head">
          <strong>调整来源信任等级</strong>
          <span className="tag tag-building">建设中</span>
        </div>
        <select value={tier} onChange={(e) => setTier(e.target.value as SourceTier)} aria-label="来源信任等级">
          {(['S', 'A', 'B', 'C', 'D'] as SourceTier[]).map((t) => (
            <option key={t} value={t}>
              {labels.tier(t)}
            </option>
          ))}
        </select>
        <button type="submit" className="btn">
          保存
        </button>
      </form>
      <form
        className="building"
        onSubmit={(e) => {
          e.preventDefault();
          tell();
        }}
      >
        <div className="building-head">
          <strong>改归属到其他事件</strong>
          <span className="tag tag-building">建设中</span>
        </div>
        <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="目标事件">
          <option value="">请选择事件</option>
          {others.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title}
            </option>
          ))}
        </select>
        <button type="submit" className="btn">
          确定
        </button>
      </form>
    </div>
  );
}
