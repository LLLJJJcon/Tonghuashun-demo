// 顶栏：产品名、演示时钟、时间控件、复核待办、通知中心
import { useEffect, useRef, useState } from 'react';
import { eventCheckpoints, nextCheckpoint, prevCheckpoint } from '../engineApi';
import { fmtTime } from '../format';
import { goEvent, type Route } from '../router';
import { useApp } from '../store';
import { BellIcon, ClipboardIcon, SimTag } from './common';

export function TopBar({ route }: { route: Route }) {
  const { state, dispatch, input, output, defaultWatchlist, showToast, setFocus } = useApp();
  const clock = state.demo.clock;
  const [eventOnly, setEventOnly] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const onEvent = route.name === 'event';
  const useEventCps = onEvent && eventOnly;
  const stepCps = useEventCps ? eventCheckpoints(input, route.id) : output.checkpoints;
  const next = nextCheckpoint(stepCps, clock);
  const latest = output.checkpoints.length ? output.checkpoints[output.checkpoints.length - 1] : null;

  const setClock = (c: string | null) => dispatch({ type: 'setClock', clock: c });
  const onPrev = () => {
    if (clock !== null) setClock(prevCheckpoint(stepCps, clock));
  };
  const onNext = () => {
    if (next !== null) setClock(next);
  };

  const queue = output.review_queue;
  const onReviewTodo = () => {
    const first = queue[0];
    if (!first) return;
    goEvent(first.event_id);
    setFocus(first.event_id, `rq-${first.id}`);
  };

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <a className="brand" href="#/">
          EventTrace<span className="brand-sep"> · </span>
          <span className="brand-sub">投资事件证据时间线</span>
        </a>

        <div className="clock" aria-live="polite">
          {clock === null ? (
            <span className="clock-text muted">演示尚未开始</span>
          ) : (
            <>
              <span className="clock-text">
                演示时钟：<strong>{fmtTime(clock)}</strong>
              </span>
              <SimTag />
            </>
          )}
        </div>

        <div className="time-controls" role="group" aria-label="演示时间控件">
          <button type="button" className="btn" onClick={onPrev} disabled={clock === null}>
            上一步
          </button>
          <button type="button" className="btn btn-primary" onClick={onNext} disabled={next === null}>
            下一步
          </button>
          <button type="button" className="btn" onClick={() => setClock(latest)} disabled={latest === null || clock === latest}>
            到最新
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setConfirmReset(true)}>
            重置演示
          </button>
          {onEvent && (
            <label className="switch" title="打开后，「上一步」「下一步」只停靠本事件相关的时刻">
              <input
                type="checkbox"
                aria-label="只走本事件"
                checked={eventOnly}
                onChange={(e) => setEventOnly(e.target.checked)}
              />
              <span>只走本事件</span>
            </label>
          )}
        </div>

        <div className="topbar-right">
          <button
            type="button"
            className="btn btn-icon"
            onClick={onReviewTodo}
            disabled={queue.length === 0}
            aria-label={`复核待办 ${queue.length} 条`}
            title={queue.length ? '跳到第一个有待复核条目的事件' : '暂无待复核'}
          >
            <ClipboardIcon />
            <span>待复核</span>
            <span className={`count${queue.length ? ' count-warn' : ''}`}>{queue.length}</span>
          </button>
          <NotificationBell />
        </div>
      </div>

      {confirmReset && (
        <div className="modal-backdrop" onClick={() => setConfirmReset(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="reset-title">重置演示？</h2>
            <p>将清空所有复核记录和演示进度，回到「演示尚未开始」，并恢复默认关注列表。</p>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setConfirmReset(false)} autoFocus>
                取消
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  dispatch({ type: 'reset', watchlist: defaultWatchlist });
                  setConfirmReset(false);
                  showToast('演示已重置');
                }}
              >
                确认重置
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

function NotificationBell() {
  const { output, state, dispatch, setFocus } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const read = new Set(state.demo.read_notification_ids);
  const list = output.notifications;
  const unread = list.filter((n) => !read.has(n.id)).length;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="bell" ref={ref}>
      <button
        type="button"
        className="btn btn-icon"
        aria-label={`通知中心，未读 ${unread} 条`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <BellIcon />
        <span>通知</span>
        {unread > 0 && <span className="count count-alert">{unread}</span>}
      </button>
      {open && (
        <div className="dropdown" role="dialog" aria-label="通知列表">
          <div className="dropdown-head">
            <strong>通知</strong>
            <span className="muted small">只推送关注标的的实质变化</span>
            <button
              type="button"
              className="btn btn-link"
              disabled={unread === 0}
              onClick={() => dispatch({ type: 'markRead', ids: list.map((n) => n.id) })}
            >
              全部标为已读
            </button>
          </div>
          {list.length === 0 ? (
            <p className="empty small">暂无通知。点击「下一步」推进演示时钟后，关注标的的事件出现实质变化时会通知你。</p>
          ) : (
            <ul className="notif-list">
              {list.map((n) => {
                const isRead = read.has(n.id);
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      className={`notif${isRead ? ' read' : ''}`}
                      onClick={() => {
                        dispatch({ type: 'markRead', ids: [n.id] });
                        setOpen(false);
                        goEvent(n.event_id);
                        setFocus(n.event_id, `ver-${n.id}`);
                      }}
                    >
                      <span className="notif-meta">
                        <span className={`dot${isRead ? '' : ' dot-unread'}`} aria-hidden="true" />
                        <span>{fmtTime(n.at)}</span>
                        <span className="muted">{isRead ? '已读' : '未读'}</span>
                      </span>
                      <span className="notif-text">{n.text}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
