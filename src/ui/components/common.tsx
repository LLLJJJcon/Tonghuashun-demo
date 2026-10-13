// 通用小组件：状态 / 性质 / 等级标签、模拟标记、悬停提示、置信度条、图标
import type { ReactNode } from 'react';
import type { EventStatus, Nature, SourceTier } from '../../types';
import { labels } from '../engineApi';
import { fmtNum } from '../format';

export function StatusBadge({ status, large = false }: { status: EventStatus; large?: boolean }) {
  return (
    <span className={`status-badge st-${status}${large ? ' large' : ''}`}>{labels.status[status]}</span>
  );
}

export function NatureBadge({ nature }: { nature: Nature }) {
  if (nature === 'rumor') {
    return (
      <span className="nature-badge nt-rumor" title="传闻：来源不明或匿名，无法核验">
        <WarnIcon />
        {labels.nature.rumor} · 未经证实
      </span>
    );
  }
  return <span className={`nature-badge nt-${nature}`}>{labels.nature[nature]}</span>;
}

export function TierBadge({ tier, reason }: { tier: SourceTier; reason?: string }) {
  return (
    <span className={`tier-badge tier-${tier}`} title={reason ? `${labels.tier(tier)}：${reason}` : labels.tier(tier)}>
      {tier}
      <span className="sr-only">{labels.tier(tier)}</span>
    </span>
  );
}

export function SimTag() {
  return (
    <span className="sim-tag" title="抓取时间为模拟值">
      模拟
    </span>
  );
}

export function Tag({ children, kind = 'plain', title }: { children: ReactNode; kind?: string; title?: string }) {
  return (
    <span className={`tag tag-${kind}`} title={title}>
      {children}
    </span>
  );
}

/** 悬停或键盘聚焦时显示的提示气泡 */
export function Tip({ children, tip, label }: { children: ReactNode; tip: ReactNode; label?: string }) {
  return (
    <span className="tip" tabIndex={0} aria-label={label}>
      {children}
      <span className="tip-bubble" role="tooltip">
        {tip}
      </span>
    </span>
  );
}

export function ConfidenceBar({
  confidence,
  support,
  oppose,
  sources,
  compact = false,
}: {
  confidence: number | null;
  support: number;
  oppose: number;
  sources: number;
  compact?: boolean;
}) {
  const tip = (
    <>
      <div>支持权重：{fmtNum(support)}</div>
      <div>反对权重：{fmtNum(oppose)}</div>
      <div>独立来源数：{sources}</div>
    </>
  );
  if (confidence === null) {
    return (
      <Tip tip={tip} label="置信度：证据不足">
        <span className={`conf conf-empty${compact ? ' compact' : ''}`}>证据不足</span>
      </Tip>
    );
  }
  const pct = Math.round(confidence * 100);
  return (
    <Tip tip={tip} label={`置信度 ${pct}%，支持权重 ${fmtNum(support)}，反对权重 ${fmtNum(oppose)}`}>
      <span className={`conf${compact ? ' compact' : ''}`}>
        <span className="conf-bar" aria-hidden="true">
          <span className="conf-support" style={{ width: `${pct}%` }} />
          <span className="conf-oppose" style={{ width: `${100 - pct}%` }} />
        </span>
        <span className="conf-text">支持 {pct}% · 反对 {100 - pct}%</span>
      </span>
    </Tip>
  );
}

export function WarnIcon() {
  return (
    <svg className="icon" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <path d="M8 1.5 15 14H1L8 1.5Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M8 6v3.6M8 11.4v.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function BellIcon() {
  return (
    <svg className="icon" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
      <path
        d="M10 2.5a5 5 0 0 0-5 5v3.2L3.5 13.5h13L15 10.7V7.5a5 5 0 0 0-5-5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M8 16a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function ClipboardIcon() {
  return (
    <svg className="icon" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
      <rect x="4" y="3.5" width="12" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7.5 9.5l2 2 3.5-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg className="icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export const RELATION_LABEL = labels.relation;

export const ORIGIN_LABEL: Record<string, string> = {
  ifind: 'iFinD',
  cninfo: '巨潮资讯',
  sse: '上海证券交易所',
  szse: '深圳证券交易所',
  irm: '互动易 / 上证 e 互动',
  company_site: '公司官网',
  media_site: '媒体网站',
  other: '其他',
};

export const EXCLUDED_LABEL = labels.excluded;

export const ACTION_LABEL = labels.reviewAction;
