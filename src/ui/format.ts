// 纯展示用的格式化函数（固定 Asia/Shanghai 时区），不包含任何业务规则
import type { TimePrecision } from '../types';

const partsFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

interface Parts { y: string; M: string; d: string; h: string; m: string }

function shParts(iso: string): Parts | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const p: Record<string, string> = {};
  for (const x of partsFmt.formatToParts(date)) p[x.type] = x.value;
  return { y: p.year, M: p.month, d: p.day, h: p.hour === '24' ? '00' : p.hour, m: p.minute };
}

/** YYYY-MM-DD HH:mm（Asia/Shanghai） */
export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const p = shParts(iso);
  return p ? `${p.y}-${p.M}-${p.d} ${p.h}:${p.m}` : iso;
}

/** YYYY-MM-DD（Asia/Shanghai） */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const p = shParts(iso);
  return p ? `${p.y}-${p.M}-${p.d}` : iso;
}

/** 按精度显示发生时间 */
export function fmtOccurred(
  at: string | null,
  precision: TimePrecision,
  range?: [string, string],
): string {
  if (precision === 'range' && range) return `${fmtDate(range[0])} 至 ${fmtDate(range[1])}`;
  if (!at || precision === 'unknown') return '未知';
  const p = shParts(at);
  if (!p) return '未知';
  switch (precision) {
    case 'datetime':
      return `${p.y}-${p.M}-${p.d} ${p.h}:${p.m}`;
    case 'day':
      return `${p.y}-${p.M}-${p.d}`;
    case 'month':
      return `${p.y}-${p.M}`;
    case 'quarter':
      return `${p.y} 年第 ${Math.ceil(Number(p.M) / 3)} 季度`;
    default:
      return `${p.y}-${p.M}-${p.d}`;
  }
}

/** 百分比数值（3.21 表示 +3.21%） */
export function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

export function fmtNum(n: number, digits = 2): string {
  return Number.isFinite(n) ? n.toFixed(digits) : '—';
}

/** 信息时差（小时） */
export function fmtLag(hours: number | null): string | null {
  if (hours === null || !Number.isFinite(hours)) return null;
  const abs = Math.abs(hours);
  const sign = hours < 0 ? '-' : '';
  if (abs < 48) return `${sign}${Math.round(abs * 10) / 10} 小时`;
  return `${sign}${Math.round((abs / 24) * 10) / 10} 天`;
}

/** 当前真实时间，东八区 ISO 8601（含毫秒） */
export function nowShanghaiISO(): string {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(), 3)}+08:00`
  );
}

/** 时间先后比较（毫秒） */
export function timeMs(iso: string | null | undefined): number {
  if (!iso) return Number.NaN;
  return new Date(iso).getTime();
}

/** 字符数（按 Unicode 码点计） */
export function charCount(s: string): number {
  return Array.from(s.trim()).length;
}
