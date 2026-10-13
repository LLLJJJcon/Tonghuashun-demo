// 交叉复核一致率评估：比较第一轮 AI 预处理结果与独立 AI 复核结果。
// 用法：npx tsx scripts/eval.ts
// 输入：public/data/claims.json、public/data/documents.json、data/labels/crosscheck_*.json
// 输出：data/labels/eval_result.json
// 注意：复核方也是 AI，结果表示「两轮 AI 判断的一致率」，不是相对人工标准答案的准确率。
import { readFileSync, writeFileSync } from 'node:fs';
import type { Claim, Document } from '../src/types';

const read = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T;

const claims = read<Claim[]>('public/data/claims.json');
const documents = read<Document[]>('public/data/documents.json');
const ccClaims = read<{ claim_id: string; nature: string; stance: string; reason: string }[]>('data/labels/crosscheck_claims.json');
const ccMatch = read<{ document_id: string; event_id: string; decision: string; reason: string }[]>('data/labels/crosscheck_match.json');
const meta = read<Record<string, unknown>>('data/labels/crosscheck_meta.json');

const claimById = new Map(claims.map((c) => [c.id, c]));
const docById = new Map(documents.map((d) => [d.id, d]));
const NATURES = ['fact', 'opinion', 'speculation', 'rumor'];

const confusion: Record<string, Record<string, number>> = {};
for (const a of NATURES) confusion[a] = Object.fromEntries(NATURES.map((b) => [b, 0]));

let natureAgree = 0;
let stanceAgree = 0;
let claimTotal = 0;
const claimDisagreements: unknown[] = [];
const missing: string[] = [];

for (const cc of ccClaims) {
  const c = claimById.get(cc.claim_id);
  if (!c) {
    missing.push(cc.claim_id);
    continue;
  }
  claimTotal++;
  // 行：第一轮 AI；列：独立复核
  if (confusion[c.nature] && cc.nature in confusion[c.nature]) confusion[c.nature][cc.nature]++;
  const n = c.nature === cc.nature;
  const s = c.stance === cc.stance;
  if (n) natureAgree++;
  if (s) stanceAgree++;
  if (!n || !s) {
    claimDisagreements.push({
      claim_id: c.id,
      quote: c.quote,
      first_pass: { nature: c.nature, stance: c.stance, confidence: c.ai.confidence, reason: c.ai.reason },
      crosscheck: { nature: cc.nature, stance: cc.stance, reason: cc.reason },
    });
  }
}

// 第一轮的 new（新建事件）与 same（并入）都表示「材料属于该事件」，复核表里统一记为 same
const normalize = (d: Document, eventId: string): string => {
  const { decision, event_id, candidate_event_ids } = d.match;
  if ((decision === 'new' || decision === 'same') && event_id === eventId) return 'same';
  if (decision === 'related' && (event_id === eventId || candidate_event_ids.includes(eventId))) return 'related';
  return 'unrelated';
};

let matchAgree = 0;
let matchTotal = 0;
const matchDisagreements: unknown[] = [];
for (const cc of ccMatch) {
  const d = docById.get(cc.document_id);
  if (!d) {
    missing.push(cc.document_id);
    continue;
  }
  matchTotal++;
  const first = normalize(d, cc.event_id);
  if (first === cc.decision) matchAgree++;
  else
    matchDisagreements.push({
      document_id: d.id,
      event_id: cc.event_id,
      first_pass: { decision: d.match.decision, event_id: d.match.event_id, normalized: first, confidence: d.match.ai.confidence, reason: d.match.ai.reason },
      crosscheck: { decision: cc.decision, reason: cc.reason },
    });
}

const pct = (a: number, b: number) => (b === 0 ? null : Math.round((a / b) * 1000) / 10);
const result = {
  note: '复核方为独立 AI（未查看第一轮结果），以下为两轮 AI 判断的一致率，不是相对人工标准答案的准确率；本项目未做人工校验。',
  generated_at: new Date().toISOString(),
  crosscheck_meta: meta,
  claims: {
    total: claimTotal,
    nature_agreement_pct: pct(natureAgree, claimTotal),
    stance_agreement_pct: pct(stanceAgree, claimTotal),
    nature_confusion_rows_first_pass_cols_crosscheck: confusion,
  },
  match: { total: matchTotal, agreement_pct: pct(matchAgree, matchTotal) },
  disagreements: { claims: claimDisagreements, match: matchDisagreements },
  missing_ids: missing,
};
writeFileSync('data/labels/eval_result.json', JSON.stringify(result, null, 2) + '\n');
console.log(
  `主张 ${claimTotal} 条：性质一致率 ${result.claims.nature_agreement_pct}%，立场一致率 ${result.claims.stance_agreement_pct}%；` +
    `同一事件 ${matchTotal} 对：一致率 ${result.match.agreement_pct}%；分歧 ${claimDisagreements.length + matchDisagreements.length} 处；缺失 ID ${missing.length} 个`,
);
