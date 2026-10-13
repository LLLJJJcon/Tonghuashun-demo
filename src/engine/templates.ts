// 模板与标签（附录 B.10）：所有面向用户的业务文案都在这里生成，前端只负责显示。
// 日期格式化固定按 Asia/Shanghai（UTC+8，无夏令时），不依赖 Intl，保证纯函数、可复现。
import type {
  EventStatus, ExcludedReason, MatchDecision, Nature, ReviewAction, RevisionType,
  SourceTier, Stance, TimePrecision,
} from '../types';
import { HOUR_MS } from './util';

// ===== 标签 =====
export const labels = {
  status: {
    unverified: '待证实', partially_confirmed: '部分证实', confirmed: '已确认',
    denied: '已否认', corrected: '已更正', expired: '已过期',
  } as Record<EventStatus, string>,
  nature: { fact: '事实', opinion: '观点', speculation: '推测', rumor: '传闻' } as Record<Nature, string>,
  stance: { support: '支持', oppose: '反对', neutral: '无关' } as Record<Stance, string>,
  tier: (t: SourceTier): string => `${t} 级`,
  // 以下为附加标签，前端可选用
  excluded: {
    not_released: '未释放', repost: '转载', noise: '噪声', superseded: '已被替换', expired: '已过期',
  } as Record<ExcludedReason, string>,
  revision: { update: '更新', correct: '更正' } as Record<RevisionType, string>,
  match: { new: '新建事件', same: '并入事件', related: '相关但另建事件', unrelated: '已判为无关' } as Record<MatchDecision, string>,
  reviewAction: { confirm: '确认', change_nature: '改性质', mark_noise: '标为噪声' } as Record<ReviewAction, string>,
  relation: { subject: '主体', counterparty: '交易对手', related: '相关' } as Record<'subject' | 'counterparty' | 'related', string>,
  precision: {
    datetime: '精确到分钟', day: '精确到日', month: '精确到月', quarter: '精确到季度', range: '时间区间', unknown: '未知',
  } as Record<TimePrecision, string>,
};

// ===== 日期格式化（Asia/Shanghai） =====
interface ShParts { y: number; M: number; d: number; h: number; m: number }
function shParts(iso: string): ShParts | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const t = new Date(ms + 8 * HOUR_MS);
  return { y: t.getUTCFullYear(), M: t.getUTCMonth() + 1, d: t.getUTCDate(), h: t.getUTCHours(), m: t.getUTCMinutes() };
}
const p2 = (n: number) => String(n).padStart(2, '0');

/** YYYY-MM-DD HH:mm；空值或非法时返回「—」 */
export function formatDateTime(iso: string | null | undefined): string {
  const p = iso ? shParts(iso) : null;
  return p ? `${p.y}-${p2(p.M)}-${p2(p.d)} ${p2(p.h)}:${p2(p.m)}` : '—';
}
/** YYYY-MM-DD；空值或非法时返回「—」 */
export function formatDate(iso: string | null | undefined): string {
  const p = iso ? shParts(iso) : null;
  return p ? `${p.y}-${p2(p.M)}-${p2(p.d)}` : '—';
}
/** 东八区日期和小时，供行情反应日计算使用 */
export function shanghaiDateHour(iso: string): { date: string; hour: number } | null {
  const p = shParts(iso);
  return p ? { date: `${p.y}-${p2(p.M)}-${p2(p.d)}`, hour: p.h } : null;
}
/** 按精度显示发生时间；未知显示「未知」 */
export function formatOccurred(at: string | null, precision: TimePrecision, range?: [string, string]): string {
  if (precision === 'range' && range) return `${formatDate(range[0])} 至 ${formatDate(range[1])}`;
  const p = at && precision !== 'unknown' ? shParts(at) : null;
  if (!p) return '未知';
  switch (precision) {
    case 'datetime': return `${p.y}-${p2(p.M)}-${p2(p.d)} ${p2(p.h)}:${p2(p.m)}`;
    case 'month': return `${p.y}-${p2(p.M)}`;
    case 'quarter': return `${p.y} 年第 ${Math.ceil(p.M / 3)} 季度`;
    default: return `${p.y}-${p2(p.M)}-${p2(p.d)}`;
  }
}
/** 百分比数值 → 「+3.21%」；null 显示「—」 */
export function formatPct(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
}
/** 置信度 → 两位小数 */
export function formatConfidence(c: number): string {
  return c.toFixed(2);
}

// ===== 一句话结论 =====
export const conclusionTpl = {
  unverified: (core: string, n: number, tier: SourceTier | null) =>
    n > 0 && tier
      ? `「${core}」尚待证实：目前有效证据 ${n} 条，最高来源等级为 ${tier} 级。`
      : `「${core}」尚待证实：目前没有有效证据。`,
  partially_confirmed: (core: string, k: number) =>
    `「${core}」部分证实：${k} 个独立来源支持，但尚无交易所或公司官方的事实确认。`,
  confirmed: (core: string, source: string, tier: SourceTier, date: string) =>
    `「${core}」已由${source}（${tier} 级）于 ${date} 确认。`,
  denied: (core: string, source: string, tier: SourceTier, date: string) =>
    `「${core}」已被${source}（${tier} 级）于 ${date} 否认。`,
  corrected: (core: string, source: string, date: string) =>
    `「${core}」的披露内容已由${source}于 ${date} 更正，当前要素以更正后为准。`,
  expired: (core: string, date: string) =>
    `「${core}」中的预期已于 ${date} 到期，截至当前未见兑现证据。`,
};

// ===== 版本说明片段 =====
export const versionTpl = {
  newEvent: (source: string, tier: SourceTier, title: string) =>
    `发现新事件：${source}（${tier} 级）发布「${title}」`,
  statusByDocument: (from: EventStatus, to: EventStatus, source: string, title: string) =>
    `状态 ${labels.status[from]} → ${labels.status[to]}（触发：${source}「${title}」）`,
  statusByExpiry: (from: EventStatus, to: EventStatus, claimText: string, date: string) =>
    `状态 ${labels.status[from]} → ${labels.status[to]}（主张「${claimText}」有效期 ${date} 已到）`,
  /** 人工修正触发：前缀已说明原因，这里不再附触发来源 */
  statusByReview: (from: EventStatus, to: EventStatus) =>
    `状态 ${labels.status[from]} → ${labels.status[to]}`,
  /** 附录 B 未覆盖：既无材料释放、也无到期，仅因时效衰减导致的状态变化 */
  statusByDecay: (from: EventStatus, to: EventStatus) =>
    `状态 ${labels.status[from]} → ${labels.status[to]}（支持证据的时效衰减使权重下降）`,
  field: (label: string, before: string | null, after: string | null) =>
    `${label}：${before ?? '无'} → ${after ?? '无'}`,
  newConflict: (what: string) => `出现未解决冲突：${what}`,
  /** 附录 B 未覆盖：原未解决冲突被裁决为已解决 */
  conflictResolved: (what: string) => `冲突已解决：${what}`,
  /** 附录 B 未覆盖：原未解决冲突因证据失效而不再存在 */
  conflictGone: (what: string) => `冲突不再存在：${what}`,
  conflictStance: () => '立场冲突',
  conflictField: (label: string) => `要素「${label}」取值不一致`,
  humanPrefix: (action: string, reason: string) => `人工修正（${action}，理由：${reason}）：`,
  join: (parts: string[]) => parts.join('；'),
};

/** 人工修正前缀中的「动作」 */
export function reviewActionText(action: ReviewAction, to?: string): string {
  if (action === 'change_nature' && to && to in labels.nature) return `改性质为${labels.nature[to as Nature]}`;
  return labels.reviewAction[action];
}

// ===== 冲突裁决依据 =====
export const conflictTpl = {
  resolved: (source: string, tier: SourceTier) => `以${source}（${tier} 级事实）为准`,
  unresolved: () => '双方均无交易所或公司官方的事实证据，冲突待解决',
};

// ===== 复核队列 =====
export const reviewTpl = {
  low_confidence: (conf: number) => `AI 置信度低（${formatConfidence(conf)}），请确认性质`,
  fact_low_tier: () => '低等级来源被判为事实，与规则冲突',
  low_match_confidence: () => '同一事件判定置信度低，请确认归属',
  claimSuggestion: (nature: Nature, conf: number) => `性质：${labels.nature[nature]}（置信度 ${formatConfidence(conf)}）`,
  matchSuggestion: (decision: MatchDecision, eventTitle: string | null, conf: number) =>
    `同一事件判定：${labels.match[decision]}${eventTitle ? `「${eventTitle}」` : ''}（置信度 ${formatConfidence(conf)}）`,
};

// ===== 通知 =====
export const notificationTpl = (eventTitle: string, versionText: string) => `【${eventTitle}】${versionText}`;

/** 合规禁用词（附录 B.10），模板固定部分不得出现 */
export const FORBIDDEN_WORDS = ['买入', '卖出', '增持', '减持', '推荐', '目标价', '建议'];
