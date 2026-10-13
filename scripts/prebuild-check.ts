// 构建前检查（AGENT-4，指导文档 2.2 节）。任何一项失败都以非零退出码退出，阻止构建。
//
// 用法：
//   npx tsx scripts/prebuild-check.ts [数据目录] [--data-only]
//   - 数据目录默认 public/data（相对项目根目录，也可以是绝对路径）
//   - --data-only：只检查数据目录（npm run check:data），不扫描 src/、index.html 等源码
//
// 四项检查：
//   1. validate(raw, { production: true }) 不能有 error（文件缺失、JSON 解析失败也算失败）
//   2. 上线数据中不能出现 is_dev_sample 字段（无论取值）
//   3. 源码和数据中不能出现疑似密钥
//   4. 源码中不能出现外部 URL 资源引用；数据中除材料原文链接（documents[].url）外不能出现外部 URL
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate } from '../src/engine/index';
import { DATA_FILES, loadRawDir } from '../src/engine/load';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const dataOnly = args.includes('--data-only');
const dataArg = args.find((a) => !a.startsWith('--')) ?? 'public/data';
const DATA_DIR = path.resolve(ROOT, dataArg);

const rel = (p: string) => {
  const r = path.relative(ROOT, p);
  return r.startsWith('..') ? p : r;
};

// ---------------------------------------------------------------- 文件收集

const TEXT_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.html', '.json', '.md', '.txt', '.svg', '.csv']);
const isTestFile = (p: string) => /(^|[\\/])__tests__[\\/]/.test(p) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(p);

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else if (ent.isFile()) out.push(p);
  }
  return out.sort();
}

function readText(p: string): string | null {
  const ext = path.extname(p).toLowerCase();
  // .env 之类无扩展名的文件也按文本读
  if (ext && !TEXT_EXT.has(ext) && !path.basename(p).startsWith('.env')) return null;
  return fs.readFileSync(p, 'utf8');
}

/** 源码扫描范围：src/、index.html、vite.config.ts、vercel.json、根目录下的 .env*（Vite 会把 VITE_ 变量打进产物） */
function sourceFiles(): string[] {
  const files = [...walk(path.join(ROOT, 'src'))];
  for (const f of ['index.html', 'vite.config.ts', 'vercel.json']) {
    const p = path.join(ROOT, f);
    if (fs.existsSync(p)) files.push(p);
  }
  for (const f of fs.readdirSync(ROOT)) if (f.startsWith('.env')) files.push(path.join(ROOT, f));
  return files;
}

// ---------------------------------------------------------------- 结果汇总

type Finding = { where: string; message: string };
const results: { name: string; findings: Finding[]; notes: string[] }[] = [];
function check(name: string, run: (fail: (where: string, message: string) => void, note: (s: string) => void) => void) {
  const findings: Finding[] = [];
  const notes: string[] = [];
  run((where, message) => findings.push({ where, message }), (s) => notes.push(s));
  results.push({ name, findings, notes });
}

const lineOf = (text: string, index: number) => text.slice(0, index).split('\n').length;
const clip = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n)}…` : s);

// ---------------------------------------------------------------- 读取数据目录

const dataDirExists = fs.existsSync(DATA_DIR) && fs.statSync(DATA_DIR).isDirectory();
const dataFiles = dataDirExists ? walk(DATA_DIR) : [];
const { raw, failures } = dataDirExists ? loadRawDir(DATA_DIR) : { raw: {}, failures: [] as string[] };

// ---------------------------------------------------------------- 检查 1：validate(production)

check('1. 数据校验 validate({ production: true })', (fail, note) => {
  if (!dataDirExists) {
    fail(rel(DATA_DIR), '数据目录不存在');
    return;
  }
  for (const f of failures) fail(rel(DATA_DIR), f);
  const { issues } = validate(raw, { production: true });
  for (const i of issues) {
    const where = `${i.file}${i.record_id ? ` ${i.record_id}` : ''}`;
    if (i.level === 'error') fail(where, i.message);
    else note(`[warning] ${where}：${i.message}`);
  }
});

// ---------------------------------------------------------------- 检查 2：is_dev_sample

check('2. 上线数据不含 is_dev_sample', (fail) => {
  for (const p of dataFiles) {
    const text = readText(p);
    if (text === null) continue;
    const re = /is_dev_sample/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) fail(`${rel(p)}:${lineOf(text, m.index)}`, '出现开发样例字段 is_dev_sample');
  }
});

// ---------------------------------------------------------------- 检查 3：疑似密钥

const SECRET_PATTERNS: { name: string; re: RegExp }[] = [
  { name: 'sk- 前缀密钥', re: /(?<![A-Za-z0-9_])sk-[A-Za-z0-9_-]{4,}/g },
  { name: 'api_key / apikey', re: /api[_-]?key/gi },
  { name: 'Authorization', re: /authorization/gi },
  { name: 'Bearer 令牌', re: /bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi },
  { name: '私钥', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { name: 'AWS Access Key', re: /AKIA[0-9A-Z]{16}/g },
  { name: 'GitHub Token', re: /gh[pousr]_[A-Za-z0-9]{20,}/g },
  { name: 'Slack Token', re: /xox[abposr]-[A-Za-z0-9-]{10,}/g },
  { name: '密钥类赋值', re: /(?:secret|password|passwd|access[_-]?token)["']?\s*[:=]\s*["'][^"'\s]{8,}["']/gi },
];

function scanSecrets(files: string[], fail: (where: string, message: string) => void) {
  for (const p of files) {
    const text = readText(p);
    if (text === null) continue;
    for (const { name, re } of SECRET_PATTERNS) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) fail(`${rel(p)}:${lineOf(text, m.index)}`, `疑似密钥（${name}）：${clip(m[0], 24)}`);
    }
  }
}

check('3. 源码和数据中无疑似密钥', (fail, note) => {
  // 测试文件也扫描：仓库公开，测试里的密钥同样会泄露
  const files = [...(dataOnly ? [] : sourceFiles()), ...dataFiles];
  scanSecrets(files, fail);
  note(`扫描 ${files.length} 个文件${dataOnly ? '（仅数据目录）' : ''}`);
});

// ---------------------------------------------------------------- 检查 4：外部 URL

// XML 命名空间（如内联 SVG 的 xmlns）只是标识符，不会发请求
const URL_ALLOW = [/^https?:\/\/www\.w3\.org\//];
const ABS_URL = /https?:\/\/[^\s"'`<>)\\]+/g;
// 协议相对地址（//cdn.example.com/x.js）用在资源位置上同样是外部请求
const PROTOCOL_RELATIVE = [
  /\b(?:src|href|srcset|poster|action)\s*=\s*\{?\s*["'`]\/\/[^\s"'`]+/gi,
  /url\(\s*["']?\/\/[^\s"')]+/gi,
  /@import\s+["']\/\/[^\s"']+/gi,
  /\b(?:fetch|import|new\s+URL|new\s+WebSocket|new\s+EventSource)\s*\(\s*["'`]\/\/[^\s"'`]+/g,
];

check('4. 无外部 URL 资源引用', (fail, note) => {
  if (!dataOnly) {
    // 测试文件不进入产物，不检查外部 URL
    const files = sourceFiles().filter((p) => !isTestFile(p));
    for (const p of files) {
      const text = readText(p);
      if (text === null) continue;
      ABS_URL.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = ABS_URL.exec(text))) {
        if (URL_ALLOW.some((a) => a.test(m![0]))) continue;
        fail(`${rel(p)}:${lineOf(text, m.index)}`, `源码中出现外部 URL：${clip(m[0])}`);
      }
      for (const re of PROTOCOL_RELATIVE) {
        re.lastIndex = 0;
        while ((m = re.exec(text))) fail(`${rel(p)}:${lineOf(text, m.index)}`, `源码中出现协议相对的外部资源：${clip(m[0])}`);
      }
    }
    note(`扫描源码 ${files.length} 个文件（不含测试文件）`);
  }

  // 数据：documents[].url 是材料原文链接，排除；其他字段中出现与原文链接完全相同的 URL（如 AI 原始返回里引用了原文）也视为原文链接
  const docsFile = DATA_FILES.find(([k]) => k === 'documents')![1];
  const docUrls = new Set<string>();
  const docs = raw.documents;
  const docList = Array.isArray(docs) ? docs : docs && typeof docs === 'object' ? Object.values(docs).find(Array.isArray) : undefined;
  if (Array.isArray(docList)) for (const d of docList) if (d && typeof d === 'object' && typeof (d as { url?: unknown }).url === 'string') docUrls.add((d as { url: string }).url);

  const visit = (v: unknown, at: string, file: string, isDocs: boolean, depth: number) => {
    if (typeof v === 'string') {
      ABS_URL.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = ABS_URL.exec(v))) {
        const u = m[0];
        if (URL_ALLOW.some((a) => a.test(u)) || docUrls.has(u)) continue;
        fail(`${file} ${at}`, `数据中出现外部 URL（不是材料原文链接）：${clip(u)}`);
      }
      return;
    }
    if (Array.isArray(v)) { v.forEach((x, i) => visit(x, `${at}[${i}]`, file, isDocs, depth + 1)); return; }
    if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        // documents.json 中每条材料（数组元素，depth 1 或包裹对象下 depth 2）的 url 字段排除
        if (isDocs && k === 'url' && typeof x === 'string' && (depth === 1 || depth === 2)) continue;
        visit(x, at ? `${at}.${k}` : k, file, isDocs, depth + 1);
      }
    }
  };

  for (const p of dataFiles) {
    const text = readText(p);
    if (text === null) continue;
    const name = path.basename(p);
    let parsed: unknown;
    let ok = false;
    if (path.extname(p).toLowerCase() === '.json') {
      try { parsed = JSON.parse(text); ok = true; } catch { /* 解析失败在检查 1 中报告，这里退回按文本扫描 */ }
    }
    if (ok) visit(parsed, '', rel(p), name === docsFile, 0);
    else visit(text, '', rel(p), false, 0);
  }
  note(`扫描数据 ${dataFiles.length} 个文件（documents[].url 原文链接 ${docUrls.size} 条已排除）`);
});

// ---------------------------------------------------------------- 输出

console.log(`== prebuild-check  数据目录：${rel(DATA_DIR)}${dataOnly ? '  （--data-only）' : ''}`);
let failed = 0;
for (const r of results) {
  const ok = r.findings.length === 0;
  if (!ok) failed++;
  console.log(`\n[${ok ? 'PASS' : 'FAIL'}] ${r.name}${ok ? '' : `：${r.findings.length} 处问题`}`);
  for (const n of r.notes) console.log(`       ${n}`);
  const shown = r.findings.slice(0, 50);
  for (const f of shown) console.log(`   ✗ ${f.where}：${f.message}`);
  if (r.findings.length > shown.length) console.log(`   … 另有 ${r.findings.length - shown.length} 处未列出`);
}

if (failed) {
  console.error(`\nprebuild-check 失败：${failed} 项检查未通过，已阻止构建。`);
  process.exit(1);
}
console.log('\nprebuild-check 通过。');
