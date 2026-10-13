// 引导横幅、页脚、数据提示、顶部提示
import { useState } from 'react';
import { useApp } from '../store';
import { CloseIcon } from './common';

export function Onboarding() {
  const { state, dispatch, stepNext } = useApp();
  if (state.demo.onboarding_dismissed) return null;
  return (
    <section className="onboarding" aria-label="操作引导">
      <p>
        这是一个可操作的演示：点击『下一步』，系统会按抓取时间逐条接收材料，观察事件结论如何变化、何时通知你。你也可以在事件详情里处理『待复核』条目。
      </p>
      <div className="onboarding-actions">
        {state.demo.clock === null && (
          <button type="button" className="btn btn-primary" onClick={stepNext}>
            开始演示
          </button>
        )}
        <button type="button" className="btn" onClick={() => dispatch({ type: 'dismissOnboarding' })}>
          关闭
        </button>
      </div>
    </section>
  );
}

export function Footer() {
  const { storageOk } = useApp();
  const version = import.meta.env.VITE_APP_VERSION as string | undefined;
  const buildTime = import.meta.env.VITE_BUILD_TIME as string | undefined;
  return (
    <footer className="footer">
      <p>本产品为演示 demo，内容不构成任何投资建议。行情仅为观察到的价格变化，不代表因果关系。</p>
      <p>运行时不调用 AI：AI 结果在数据准备阶段基于真实材料生成，并经人工校验。抓取时间为模拟值。</p>
      {!storageOk && <p className="footer-warn">当前浏览器不支持本地保存，刷新后演示进度会重置。</p>}
      <p className="muted">
        版本：{version || '开发版'}
        {' · '}构建时间：{buildTime || '开发版'}
      </p>
    </footer>
  );
}

export function IssuesButton() {
  const { issues } = useApp();
  const [open, setOpen] = useState(false);
  if (!issues.length) return null;
  return (
    <>
      <button type="button" className="issues-fab" onClick={() => setOpen(true)} aria-label={`数据提示 ${issues.length} 条`}>
        数据提示 {issues.length}
      </button>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div
            className="modal modal-wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="issues-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h2 id="issues-title">数据提示（{issues.length}）</h2>
              <button type="button" className="btn btn-icon" aria-label="关闭数据提示" onClick={() => setOpen(false)}>
                <CloseIcon />
              </button>
            </div>
            <p className="muted small">数据加载与校验时发现的问题，处理方式见每条说明。</p>
            <ul className="issue-list">
              {issues.map((i, idx) => (
                <li key={idx} className={`issue issue-${i.level}`}>
                  <span className={`tag tag-${i.level === 'error' ? 'danger' : 'warn'}`}>{i.level}</span>
                  <code>{i.file}</code>
                  {i.record_id && <code>{i.record_id}</code>}
                  <span>{i.message}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

export function ToastHost() {
  const { toast } = useApp();
  return (
    <div className="toast-host" role="status" aria-live="polite">
      {toast && (
        <div key={toast.nonce} className={`toast toast-${toast.kind}`}>
          {toast.text}
        </div>
      )}
    </div>
  );
}
