// 首页：关注标的 + 事件列表
import { useMemo, useState } from 'react';
import type { EventView } from '../../types';
import { ConfidenceBar, RELATION_LABEL, StatusBadge, Tag } from '../components/common';
import { nextCheckpoint } from '../engineApi';
import { fmtTime, timeMs } from '../format';
import { eventHref } from '../router';
import { useApp } from '../store';

export function HomePage() {
  const { loaded, state, dispatch, output, stepNext } = useApp();
  const [onlyWatched, setOnlyWatched] = useState(true);
  const [manageOpen, setManageOpen] = useState(false);
  const watch = state.demo.watchlist;
  const watchSet = new Set(watch);

  // 所有事件涉及的股票（D5），附带 D7 中的名称
  const allStocks = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of loaded.data.events) for (const s of e.stocks) if (!m.has(s.code)) m.set(s.code, s.name);
    for (const s of loaded.seed.stocks) if (!m.has(s.code)) m.set(s.code, s.name);
    return [...m.entries()].map(([code, name]) => ({ code, name }));
  }, [loaded]);
  const nameOf = (code: string) => allStocks.find((s) => s.code === code)?.name ?? code;

  const toggleStock = (code: string, on: boolean) => {
    const next = on ? [...watch.filter((c) => c !== code), code] : watch.filter((c) => c !== code);
    dispatch({ type: 'setWatchlist', codes: next });
  };

  const events = useMemo(() => {
    const ws = new Set(watch);
    const list = output.events.filter((ev) => !onlyWatched || ev.event.stocks.some((s) => ws.has(s.code)));
    return [...list].sort((a, b) => {
      const ta = timeMs(a.last_changed_at);
      const tb = timeMs(b.last_changed_at);
      if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
      if (Number.isNaN(ta)) return 1;
      if (Number.isNaN(tb)) return -1;
      return tb - ta;
    });
  }, [output.events, onlyWatched, watch]);

  const clock = state.demo.clock;
  const hasNext = nextCheckpoint(output.checkpoints, clock) !== null;

  return (
    <div className="page home">
      <section className="panel watch" aria-labelledby="watch-title">
        <div className="panel-head">
          <h2 id="watch-title">关注标的</h2>
          <button type="button" className="btn btn-link" aria-expanded={manageOpen} onClick={() => setManageOpen((v) => !v)}>
            {manageOpen ? '收起' : '管理关注'}
          </button>
        </div>
        <div className="chips">
          {watch.length === 0 ? (
            <span className="muted small">尚未关注任何股票。通知只推送关注标的的变化。</span>
          ) : (
            watch.map((c) => (
              <span key={c} className="chip">
                {nameOf(c)} <span className="muted">{c}</span>
              </span>
            ))
          )}
        </div>
        {manageOpen && (
          <fieldset className="manage">
            <legend className="small muted">勾选要关注的股票（来自所有事件涉及的股票）</legend>
            {allStocks.map((s) => (
              <label key={s.code} className="check">
                <input
                  type="checkbox"
                  aria-label={`关注 ${s.name}（${s.code}）`}
                  checked={watchSet.has(s.code)}
                  onChange={(e) => toggleStock(s.code, e.target.checked)}
                />
                {s.name} <span className="muted">{s.code}</span>
              </label>
            ))}
          </fieldset>
        )}
      </section>

      <section aria-labelledby="events-title">
        <div className="section-head">
          <h2 id="events-title">事件</h2>
          <label className="switch">
            <input
              type="checkbox"
              aria-label="只看关注标的"
              checked={onlyWatched}
              onChange={(e) => setOnlyWatched(e.target.checked)}
            />
            <span>只看关注标的</span>
          </label>
        </div>

        {clock === null ? (
          <div className="empty-state">
            <p>演示尚未开始。点击「开始演示」，系统会按抓取时间逐条接收材料，事件会随之出现在这里。</p>
            <button type="button" className="btn btn-primary" onClick={stepNext} disabled={!hasNext}>
              开始演示
            </button>
          </div>
        ) : output.events.length === 0 ? (
          <div className="empty-state">
            <p>当前演示时刻还没有可见的事件。继续点击「下一步」接收更多材料。</p>
            <button type="button" className="btn btn-primary" onClick={stepNext} disabled={!hasNext}>
              下一步
            </button>
          </div>
        ) : events.length === 0 ? (
          <div className="empty-state">
            <p>关注标的中暂时没有事件。可以关闭「只看关注标的」查看全部事件，或在「管理关注」中添加股票。</p>
          </div>
        ) : (
          <ul className="event-list">
            {events.map((ev) => (
              <li key={ev.event.id}>
                <EventCard ev={ev} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function EventCard({ ev }: { ev: EventView }) {
  const unresolved = ev.conflicts.filter((c) => !c.resolved).length;
  const reviews = ev.review_items.length;
  return (
    <a className={`card event-card st-border-${ev.status}`} href={eventHref(ev.event.id)}>
      <div className="event-card-top">
        <h3>{ev.event.title}</h3>
        <StatusBadge status={ev.status} />
      </div>
      <div className="chips small">
        {ev.event.stocks.map((s) => (
          <span key={s.code} className="chip chip-sm">
            {s.name}
            <span className="muted">（{RELATION_LABEL[s.relation]}）</span>
          </span>
        ))}
        {ev.event.is_counter_example && (
          <Tag kind="info" title="与其他事件同公司同期，但判定为不同事项，未合并">
            相关但未合并
          </Tag>
        )}
      </div>
      <div className="event-card-meta">
        <ConfidenceBar
          compact
          confidence={ev.confidence}
          support={ev.support_weight}
          oppose={ev.oppose_weight}
          sources={ev.independent_sources}
        />
        <span className="small muted">最后变化：{fmtTime(ev.last_changed_at)}</span>
        {unresolved > 0 && <Tag kind="danger">未解决冲突 {unresolved}</Tag>}
        {reviews > 0 && <Tag kind="warn">待复核 {reviews}</Tag>}
      </div>
    </a>
  );
}
