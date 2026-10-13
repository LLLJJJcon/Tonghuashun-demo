// 本地命令：按每个检查点打印各事件的状态序列，帮助确认场景覆盖。
// 用法：npx tsx src/engine/cli.ts <数据目录> [--production] [--verbose]
//   例：npx tsx src/engine/cli.ts data/dev
//       npx tsx src/engine/cli.ts public/data --production
import { derive, formatDateTime, labels, validate } from './index';
import { loadRawDir } from './load';

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--'));
const production = args.includes('--production');
const verbose = args.includes('--verbose');
if (!dir) {
  console.error('用法：npx tsx src/engine/cli.ts <数据目录> [--production] [--verbose]');
  process.exit(2);
}

const { raw, failures } = loadRawDir(dir);
for (const f of failures) console.log(`[加载失败] ${f}`);
const { data, issues } = validate(raw, { production });
const errors = issues.filter((i) => i.level === 'error').length;
console.log(`== 数据校验（production=${production}）：${errors} error，${issues.length - errors} warning`);
for (const i of issues) console.log(`  [${i.level}] ${i.file}${i.record_id ? ` ${i.record_id}` : ''}：${i.message}`);

const base = { ...data, reviews: [], clock: null };
const { checkpoints } = derive(base);
console.log(`\n== 检查点 ${checkpoints.length} 个（* 表示该检查点生成了新版本）`);
const eventIds = data.events.map((e) => e.id);
const seq = new Map<string, string[]>(eventIds.map((id) => [id, []]));
let prevVersions = new Map<string, number>();
checkpoints.forEach((cp, i) => {
  const out = derive({ ...base, clock: cp });
  const cells: string[] = [];
  const nowVersions = new Map<string, number>();
  for (const ev of out.events) {
    const n = ev.versions.length;
    nowVersions.set(ev.event.id, n);
    const changed = n > (prevVersions.get(ev.event.id) ?? 0);
    cells.push(`${ev.event.id}=${labels.status[ev.status]}${changed ? '*' : ''}`);
    const s = seq.get(ev.event.id)!;
    if (s[s.length - 1] !== labels.status[ev.status]) s.push(labels.status[ev.status]);
  }
  prevVersions = nowVersions;
  console.log(`[${String(i + 1).padStart(2)}] ${formatDateTime(cp)}  ${cells.join('  ')}`);
  if (verbose) for (const ev of out.events) console.log(`       ${ev.event.id} 支持 ${ev.support_weight} 反对 ${ev.oppose_weight} 独立来源 ${ev.independent_sources}`);
});

const last = derive({ ...base, clock: checkpoints[checkpoints.length - 1] ?? null });
console.log('\n== 各事件状态序列与版本（最新时刻）');
for (const ev of last.events) {
  console.log(`${ev.event.id}「${ev.event.title}」${ev.event.is_counter_example ? '（反例）' : ''}：${seq.get(ev.event.id)!.join(' → ')}`);
  console.log(`  结论：${ev.conclusion_text}`);
  console.log(`  首发来源：${ev.first_source_doc_id ?? '无'}；材料：${ev.documents.map((d) => `${d.id}${d.match.decision === 'unrelated' ? '(无关)' : d.repost_of ? '(转载)' : ''}`).join('、')}`);
  for (const c of ev.conflicts) console.log(`  冲突 ${c.id}：${c.resolved ? `已解决，${c.winner} 方胜出` : '未解决'}（${c.rule_text}）`);
  for (const v of ev.versions) {
    console.log(`  v${v.no} ${formatDateTime(v.at)} [${v.trigger.kind} ${v.trigger.ref_id}]${v.is_human_correction ? ' [人工修正]' : ''} ${v.text}`);
  }
  for (const d of ev.documents) {
    if (d.market_reaction) {
      const m = d.market_reaction;
      console.log(`  行情 ${d.id}：${m.name} ${m.reaction_date} 当日 ${m.day_pct}% 3日 ${m.three_day_pct}% 基准 ${m.bench_day_pct}% / ${m.bench_three_day_pct}%`);
    }
  }
}
console.log(`\n== 复核队列（最新时刻）${last.review_queue.length} 条`);
for (const r of last.review_queue) console.log(`  ${r.id} [${r.reason_code}] ${r.reason_text}｜${r.ai_suggestion}`);
console.log(`\n== 通知（最新时刻，未过滤关注列表）${last.notifications.length} 条`);
for (const n of last.notifications) console.log(`  ${formatDateTime(n.at)} ${n.text}`);
