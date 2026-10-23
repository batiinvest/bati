#!/usr/bin/env node
// MD 파싱 회귀 점검 — 커밋 직전(.githooks/pre-commit)에 실행.
// 같은 DART MD 표본을 '커밋된 코드(HEAD)'와 '지금 코드'로 각각 파싱해 결과 지표를 비교한다.
//   · 사라진 값(증권사·추정치·사업 데이터 행·기본정보 항목이 줄거나, 있던 값이 없어짐·오류) → 실패(커밋 중단)
//   · 바뀐 값 → 알림만(의도한 개선일 수 있음)
// 표본: ../BatiDartReports/content/dart_reports 의 DB 업로드 종목 MD(없으면 건너뜀) + 데이터 블록을 뺀 변형(표로 대신 읽는 경로)
// 코드는 index.html이 불러오는 report-fnguide·report-consensus·report-md·report-dart를 그 순서대로 vm에 올림(HEAD는 git show).
// 실행: node tools/md-regress.js   (건너뛰기: SKIP_MD_REGRESS=1 git commit …)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const MD_DIR = path.resolve(ROOT, '..', 'BatiDartReports', 'content', 'dart_reports');
const SAMPLES = ['240810', '036930', '448900', '477850'];   // DB에 올라간 종목(새 양식 1 + 옛 양식 3)
const FILES = /^js\/report-(fnguide|consensus|md|dart)\.js$/;   // fnguide: 카드 공통(RP_CARD_STYLE·_rpSecT)을 report-dart가 불러올 때 씀

if (process.env.SKIP_MD_REGRESS) process.exit(0);
if (!fs.existsSync(MD_DIR)) { console.log('[md-regress] MD 폴더 없음 — 건너뜀'); process.exit(0); }

const git = args => execSync(`git ${args}`, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] });
const scriptsOf = html => [...html.matchAll(/<script src="(js\/[^"?]+)/g)].map(m => m[1]).filter(f => FILES.test(f));

function load(label, readFile, html) {
  const ctx = vm.createContext({
    console, escapeHtml: s => String(s ?? ''), escAttr: s => String(s ?? ''), safeUrl: s => /^https?:/.test(s || '') ? s : '',
    escJsStr: s => s, toggleSection: () => {}, toast: () => {}, kstToday: () => '2026-01-01',
    document: { getElementById: () => null, querySelectorAll: () => [] }, window: {}, sb: {},
  });
  const src = scriptsOf(html).map(f => readFile(f)).join('\n;\n')
    + '\n;({ _rpStripRawSections: typeof _rpStripRawSections === "function" ? _rpStripRawSections : null,'
    + ' _rpParseMd: typeof _rpParseMd === "function" ? _rpParseMd : null,'
    + ' _rpParseBusinessSections: typeof _rpParseBusinessSections === "function" ? _rpParseBusinessSections : null,'
    + ' _mdDeepParse: typeof _mdDeepParse === "function" ? _mdDeepParse : null,'
    + ' _rpDartModel: typeof _rpDartModel === "function" ? _rpDartModel : null })';
  try { return vm.runInContext(`let _rpStock = null, _rpData = {};\n${src}`, ctx, { filename: `${label}.js` }); }
  catch (e) { return { loadError: e.message }; }
}

const filled = v => v != null && v !== '' && !(Array.isArray(v) && !v.length) && !(typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length);
const cnt = o => Object.values(o || {}).filter(v => v != null).length;

function metrics(F, code, text) {
  const m = {};
  const run = (k, fn) => { try { m[k] = fn(); } catch (e) { m[k] = { error: String(e.message).slice(0, 120) }; } };
  if (F.loadError) return { loadError: F.loadError };
  const stored = F._rpStripRawSections(text, true);
  run('summary', () => {
    const s = F._rpParseMd(text).summary || {};
    return { keys: Object.keys(s).filter(k => filled(s[k])).sort(), points: (s.investment_points || []).length + (s.risk_points || []).length,
      consAnnual: s.consensus?.annual?.length ?? 0, consOp: s.consensus?.op?.val ?? null, consNeed: s.consensus?.need?.opm ?? null };
  });
  run('biz', () => Object.fromEntries(Object.entries(F._rpParseBusinessSections(text, code)).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v.length])));
  run('profile', () => { const d = F._mdDeepParse(stored, {}); return { fields: Object.keys(d).filter(k => filled(d[k])).sort(), subs: (d.subsidiaries || []).length }; });
  run('model', () => {
    const M = F._rpDartModel(stored);
    return { brokers: (M.brokers || []).length, estimates: (M.brokers || []).reduce((a, b) => a + cnt(b.rev) + cnt(b.op), 0),
      targetPrices: (M.brokers || []).filter(b => /\d/.test(b.tp || '')).length, market: M.market?.tp ?? null,
      ranges: Object.keys(M.ranges || {}).length, events: (M.events || []).length, verdict: !!M.verdict, trend: !!M.trend,
      consOp: M.consensus?.op?.val ?? null, consRev: (M.consensus?.rev || []).length, need: M.consensus?.need?.opm ?? null };
  });
  return m;
}

// 지표 비교 — 숫자는 줄면 실패, 참/값은 없어지면 실패, 목록은 빠진 항목 있으면 실패, 오류 새로 나면 실패
function compare(a, b, where, out) {
  if (a && typeof a === 'object' && 'error' in a && !(b && typeof b === 'object' && 'error' in b)) return;   // 예전에도 오류였다가 나아짐
  if (b && typeof b === 'object' && 'error' in b) { if (!(a && typeof a === 'object' && 'error' in a)) out.fail.push(`${where}: 오류 — ${b.error}`); return; }
  if (Array.isArray(a)) {
    const lost = a.filter(x => !(b || []).includes(x)), added = (b || []).filter(x => !a.includes(x));
    if (lost.length) out.fail.push(`${where}: 빠짐 ${lost.join(', ')}`);
    if (added.length) out.warn.push(`${where}: 추가 ${added.join(', ')}`);
    return;
  }
  if (a && typeof a === 'object') { for (const k of new Set([...Object.keys(a), ...Object.keys(b || {})])) compare(a[k], (b || {})[k], `${where}.${k}`, out); return; }
  if (typeof a === 'number' && typeof b === 'number') { if (b < a) out.fail.push(`${where}: ${a} → ${b}`); else if (b !== a) out.warn.push(`${where}: ${a} → ${b}`); return; }
  if (filled(a) && !filled(b)) { out.fail.push(`${where}: ${JSON.stringify(a)} → 없음`); return; }
  if (a === true && b === false) { out.fail.push(`${where}: 있음 → 없음`); return; }
  if (JSON.stringify(a) !== JSON.stringify(b)) out.warn.push(`${where}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
}

let headHtml;
try { headHtml = git('show HEAD:index.html'); } catch (e) { console.log('[md-regress] HEAD 없음 — 건너뜀'); process.exit(0); }
const HEAD = load('HEAD', f => { try { return git(`show HEAD:${f}`); } catch (e) { return ''; } }, headHtml);
const NOW = load('NOW', f => fs.readFileSync(path.join(ROOT, f), 'utf8'), fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
if (NOW.loadError) { console.error(`[md-regress] 지금 코드를 불러오지 못함: ${NOW.loadError}`); process.exit(1); }

const out = { fail: [], warn: [] };
let n = 0;
for (const code of SAMPLES) {
  const f = fs.readdirSync(MD_DIR).find(x => x.startsWith(code + '_') && x.endsWith('.md'));
  if (!f) continue;
  const text = fs.readFileSync(path.join(MD_DIR, f), 'utf8').replace(/\r/g, '');
  const variants = [[f, text]];
  if (/<!--\s*dart-report-consensus:v\d/.test(text)) variants.push([`${f} (데이터 블록 없이)`, text.replace(/<!--\s*dart-report-consensus:v\d+[\s\S]*?-->/, '')]);
  for (const [name, t] of variants) { n++; compare(metrics(HEAD, code, t), metrics(NOW, code, t), name, out); }
}
for (const w of out.warn) console.log(`[md-regress] 바뀜  ${w}`);
for (const f of out.fail) console.log(`[md-regress] 사라짐 ${f}`);
if (out.fail.length) {
  console.error(`[md-regress] MD ${n}건 중 사라진 값 ${out.fail.length}곳 — 의도한 변경이면 SKIP_MD_REGRESS=1 로 커밋`);
  process.exit(1);
}
console.log(`[md-regress] MD ${n}건 통과 (바뀜 ${out.warn.length}곳)`);
