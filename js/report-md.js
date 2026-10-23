// ── DART 분석 MD 읽기 ─────────────────────────────────────────────────────────
// 생성기(사용자의 ChatGPT 쪽 BatiDartReports) MD의 '양식 계약' — 제목·소제목·이름표·표·데이터 블록 — 을
// 해석하는 순수 함수만 모음(HTML 없음). 화면(카드·상세 분석·업로드 UI)은 report-dart.js,
// 컨센서스 데이터 블록 파서는 report-consensus.js(BatiDartReports 도구가 만든 묶음).
// 불러오는 순서: report-consensus.js → report-md.js → report-dart.js (index.html)
// 양식이 바뀌면 여기를 고치고 tools/md-regress.js(커밋 전 자동 점검)로 확인.

// ── DART 탭 화면 모델 — 생성기 MD의 소절·표에서 카드용 데이터를 한곳에서 읽음 ─────────────
// 소제목 이름('#### 분기별 추이' 등)에 기대므로 생성기 양식이 바뀌면 여기만 고친다.
// 못 찾은 항목은 null → 그 카드는 숨김(06월 생성분 옛 양식 MD는 대부분 null = 예전 화면 그대로)

// 소절 줄에서 검토·메타를 뺀 사실 줄. '#### 원문 대조 검토' 블록은 다음 제목 또는 빈 줄 두 개까지(생성기 양식)
function _rpMdFacts(sec) {
  const out = [];
  let skip = false, blank = 0;
  for (const l of sec || []) {
    if (/^#{3,6}\s/.test(l)) {
      skip = /^#{4,6}\s*(원문 대조 검토|원문·API)/.test(l);
      blank = 0;
      if (skip) continue;
    } else if (skip) {
      blank = l.trim() ? 0 : blank + 1;
      if (blank >= 2) skip = false;
      continue;
    }
    if (/^[-*]\s*(기준|검토 근거|원문 확인|판단 기준)[:：]/.test(l)) continue;
    if (/^\s*-{3,}\s*$/.test(l) || _RPD_DROP_LINE.test(l.trim())) continue;   // 가로줄·앵커
    out.push(l);
  }
  return out;
}
const _rpMdVal = (sec, key) => (sec || []).map(l => l.match(new RegExp(`^[-*]\\s*${key}[:：]\\s*(.+)$`))?.[1]?.trim()).find(Boolean) || null;
// 첫 표의 원문 줄(구분선 포함)과 그 위의 '단위:' 줄
function _rpMdTableRaw(sec) {
  const i = (sec || []).findIndex(l => /^\|/.test(l));
  if (i < 0) return { lines: [], unit: null };
  const lines = [];
  for (let j = i; j < sec.length && /^\|/.test(sec[j]); j++) lines.push(sec[j]);
  let unit = null;
  for (let j = i - 1; j >= 0 && j >= i - 4; j--) { const m = sec[j].match(/^단위[:：]\s*(.+)$/); if (m) { unit = m[1].trim(); break; } }
  return { lines, unit };
}

// 표 한 줄 → 칸 배열. \| (생성기가 \\|로 두 번 이스케이프한 것 포함)는 칸 구분이 아닌 글자 '|'
const _rpMdCells = r => r.replace(/\\+\|/g, '\u0001').split('|').slice(1, -1).map(c => c.trim().replace(/\u0001/g, '|'));

// 제목 줄(re)부터 같은·상위 단계 제목 전까지
function _rpMdSec(lines, re) {
  const si = lines.findIndex(l => re.test(l));
  if (si < 0) return null;
  const lv = (lines[si].match(/^#+/) || ['######'])[0].length;
  const ei = lines.findIndex((l, i) => i > si && /^#{1,6}\s/.test(l) && l.match(/^#+/)[0].length <= lv);
  return lines.slice(si + 1, ei > 0 ? ei : lines.length);
}
// 줄 묶음의 첫 표 → { hdr, rows } (구분선 제외)
function _rpMdFirstTable(sec) {
  const i = sec ? sec.findIndex(l => /^\|/.test(l)) : -1;
  if (i < 0) return null;
  const rows = [];
  for (let j = i; j < sec.length && /^\|/.test(sec[j]); j++)
    if (!/^\|[-:\s|]+$/.test(sec[j])) rows.push(_rpMdCells(sec[j]));
  return rows.length > 1 ? { hdr: rows[0], rows: rows.slice(1) } : null;
}
// 연도별로 나뉜 기간 표(MD reader-layout annual-tables-v1, 10-18~: '**2023년**' 표 · '**2024년**' 표 …)를 한 표로.
// sec[i] = 표 첫 줄. 표 사이에 빈 줄과 '**2024년**' 같은 연도 줄만 있고(연도 줄이 하나는 있어야), 첫 기간 열 앞의 열(항목·품목·
// 사업부문)이 같으면 같은 표의 다음 해로 보고 기간 열을 이어 붙인다. 예전 양식(한 표에 14개 분기)은 그대로.
// isPeriod(머리 칸) → 기간 열인지. 반환 { hdr, rows, end } (구분선 제외, rows = 처음 나온 행 순서)
const _RPD_YEAR_LINE = /^\*\*\s*\d{4}\s*년?\s*\*\*$/;
const _rpIsQ = h => /^\d{2}\.\dQ$/.test(String(h || '').trim());
function _rpMdPeriodTable(sec, i, isPeriod = _rpIsQ) {
  const read = k => {
    const t = [];
    for (; k < sec.length && /^\s*\|/.test(sec[k]); k++) if (!/^\s*\|[-:\s|]+$/.test(sec[k])) t.push(_rpMdCells(sec[k].trim()));
    return { t, k };
  };
  let { t, k } = read(i);
  if (!t.length) return null;
  const hdr = t[0], d = hdr.findIndex(isPeriod);
  if (d < 1) return { hdr, rows: t.slice(1), end: k };
  const dims = hdr.slice(0, d).join('|'), periods = [], order = [], map = new Map();
  const add = (P, rows) => {
    P.forEach(p => { if (!periods.includes(p)) periods.push(p); });
    for (const r of rows) {
      const key = r.slice(0, d).join('|');
      if (!map.has(key)) { map.set(key, { dims: r.slice(0, d), v: {} }); order.push(key); }
      P.forEach((p, j) => { map.get(key).v[p] = r[d + j] ?? ''; });
    }
  };
  add(hdr.slice(d), t.slice(1));
  for (;;) {
    let j = k, years = 0;
    for (; j < sec.length; j++) {
      const x = sec[j].trim();
      if (_RPD_YEAR_LINE.test(x)) years++;
      else if (x) break;
    }
    if (!years || j >= sec.length || !/^\s*\|/.test(sec[j])) break;
    const nx = read(j), h2 = nx.t[0] || [];
    if (h2.findIndex(isPeriod) !== d || h2.slice(0, d).join('|') !== dims) break;
    add(h2.slice(d), nx.t.slice(1));
    k = nx.k;
  }
  return { hdr: [...hdr.slice(0, d), ...periods], rows: order.map(key => [...map.get(key).dims, ...periods.map(p => map.get(key).v[p] ?? '')]), end: k };
}
// 줄 묶음에서 기간 열이 있는 첫 표(연도별로 나뉘었으면 합친 것) → { hdr, rows }
function _rpMdFirstPeriodTable(sec, isPeriod = _rpIsQ) {
  for (let i = 0; sec && i < sec.length; i++) {
    if (!/^\|/.test(sec[i]) || (i > 0 && /^\|/.test(sec[i - 1]))) continue;
    if (!_rpMdCells(sec[i]).some(isPeriod)) continue;
    const T = _rpMdPeriodTable(sec, i, isPeriod);
    return T && T.rows.length ? T : null;
  }
  return null;
}
// '1,234.5' '-12.3%' '268.9' → 수 / '산출 불가'·'-'·'' → null
const _rpNum = s => {
  const m = String(s ?? '').replace(/,/g, '').match(/^\s*(-?\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
};
// '[신한투자증권](url) (2026-10-08)' → { text, url, date }
const _rpMdLinkCell = c => {
  const m = String(c || '').match(/^\[((?:\\.|[^\]\\])+)\]\((https?:\/\/[^)\s]+)\)\s*(?:\((\d{4}-\d{2}-\d{2})\))?/);
  return m ? { text: m[1].replace(_RPD_ESC, '$1'), url: m[2], date: m[3] || null }
           : { text: String(c || '').replace(_RPD_ESC, '$1'), url: null, date: null };
};

// 기간 열 이름 → 비교 키: '26.3QE'·'2026.3QE' → '2026Q3', '2026 연간E'·'2026년E'·'2025년A' → '2026'·'2025'
// (증권사 추정 표와 컨센서스 표의 열 이름이 달라 같은 기간끼리 맞출 때)
const _rpPeriodKey = h => {
  const t = String(h || '').trim();
  let m = t.match(/^(\d{2}|\d{4})\.(\d)Q/);
  if (m) return `${m[1].length === 2 ? '20' + m[1] : m[1]}Q${m[2]}`;
  m = t.match(/^(\d{4})\s*(?:년|연간)?\s*[AE]?$/);
  return m ? m[1] : null;
};

// 반기 표기(10-20 양식 '26.H1A'·'26.H2') → '상반기'·'하반기'(year=true면 '2025 하반기'). 다른 글자는 그대로
const _rpHalfLabel = (h, year) => {
  const m = String(h || '').trim().match(/^(\d{2}|\d{4})\.?\s*H([12])/i);
  if (!m) return String(h || '').trim();
  return `${year ? (m[1].length === 2 ? '20' + m[1] : m[1]) + ' ' : ''}${m[2] === '1' ? '상반기' : '하반기'}`;
};

// v1/v2 공통 파서. 블록이 없을 때만 2-10 표로 복원하며 오류·보류 상태는 이전 수치를 숨긴다.
function _rpConsJson(md) {
  try { return DartReport.parseDartReport(String(md || '')).consensus; }
  catch (e) { return { status: 'held', rows: [], warnings: ['컨센서스 데이터 형식 오류로 표시 보류'] }; }
}
// 영어 의견(Buy·BUY)만 한글로 — 한글 의견은 원문 그대로(분류 'neutral'이어도 '보유'는 '보유')
const _RP_RATING_KO = { strong_buy: '적극매수', buy: '매수', hold: '보유', neutral: '중립', sell: '매도', strong_sell: '적극매도' };
// 데이터 블록 → 통합표·요약 칩 모양(brokers의 rev/op 키는 화면 열 이름 '2026E'·'26.3QE')
function _rpConsFromJson(d) {
  const lab = p => d.period_labels?.[p] || p;
  const periods = d.periods || [];
  const by = new Map();
  let crating = null;
  for (const r of d.rows) {
    if (r.broker_id === 'consensus') { crating = crating || r.rating || null; continue; }
    const id = r.broker_id || r.broker_name;
    if (!by.has(id)) {
      const tp = Number(r.target_price) || null, pt = Number(r.previous_target_price) || null;
      by.set(id, { broker: r.broker_name, url: DartReport.forecastSourceUrl(r), date: r.published_on || '',
        // 의견은 짧은 한글(rating_label '매수') — '매수 (Buy)'의 원문 괄호는 표에서 뺌. 없으면 한글 원문, 영어만 분류로 옮김
        opinion: (r.rating_label || (/[가-힣]/.test(r.rating || '') ? r.rating : _RP_RATING_KO[r.rating_category] || r.rating || '')).replace(/([가-힣])\s*\([A-Za-z ]+\)$/, '$1'), tp: tp ? `${tp.toLocaleString()}원` : '',
        // 직전 금액은 바뀐 때(상향·하향)만 — '유지 · 직전 165,000원'은 같은 숫자 반복
        change: r.target_change_label ? r.target_change_label + (tp && pt && ['상향', '하향'].includes(r.target_change_label) ? ` · 직전 ${pt.toLocaleString()}원` : '')
          : tp && pt ? (tp > pt ? `상향 · 직전 ${pt.toLocaleString()}원` : tp < pt ? `하향 · 직전 ${pt.toLocaleString()}원` : '유지') : '',
        rev: {}, op: {}, prev: { rev: {}, op: {} } });
    }
    const b = by.get(id), key = r.metric === 'revenue' ? 'rev' : r.metric === 'operating_profit' ? 'op' : null;
    if (!key) continue;
    for (const pk of periods) {
      const v = r.periods?.[pk];
      if (!v) continue;
      if (v.current != null) b[key][lab(pk)] = Number(v.current);
      if (v.revision_pct != null) b.prev[key][lab(pk)] = Number(v.revision_pct);
    }
  }
  const brokers = [...by.values()].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const ranges = {};
  for (const g of d.ranges || []) {
    const k = _rpPeriodKey(lab(g.period)), mk = g.metric === 'revenue' ? 'rev' : g.metric === 'operating_profit' ? 'op' : null;
    if (k && mk && g.low != null && g.high != null) (ranges[k] = ranges[k] || {})[mk] = { low: Number(g.low), high: Number(g.high) };
  }
  const mk = d.market;
  return {
    brokers,
    estCols: periods.map(lab).filter(c => brokers.some(b => b.rev[c] != null || b.op[c] != null)),
    ranges,
    market: mk?.mean ? { tp: Number(mk.mean), count: mk.institution_count ?? null, score: mk.rating_score ?? null, rating: crating,
      dist: mk.distribution || null, asOf: mk.as_of || d.source_as_of || null,
      price: mk.price?.value ?? null, priceAsOf: mk.price?.as_of || null, upside: mk.upside_pct ?? null } : null,
    estNotes: [...(d.warnings || []), ...(d.limitations || [])].map(String),
  };
}

// 신규 요약 칩·업로드 요약은 MD 표 모양이 아닌 동일 데이터 모델에서 읽는다.
// 이름 주의: _rpConsensusSummary(rows, price)는 report-tabs.js의 목표주가 컨센서스(3개월·증권사별 마지막) —
// 같은 이름이면 나중에 로드되는 이 파일이 덮어써 기업현황·최근리포트·종합분석 목표주가가 깨졌음(10-21)
function _rpConsModelSummary(d) {
  const pct = v => typeof v === 'number' && Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` : null;
  const margin = v => typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(1)}%` : null;
  const annual = (d.outlook?.annual || []).map(a => ({
    year: String(a.period).slice(0, 4), est: a.status === 'E', revenue: a.revenue ?? null,
    op: a.operating_profit ?? null, ni: a.net_profit ?? null, eps: a.eps ?? null,
    opm: a.operating_margin_pct ?? null, opYoy: pct(a.operating_profit_yoy_pct),
  }));
  const quarters = (d.outlook?.quarterly || []).map(a => ({
    key: a.period, label: a.label, revenue: a.revenue ?? null, op: a.operating_profit ?? null,
  }));
  const first = annual.find(a => a.est), change = (d.estimate_changes || [])
    .find(r => r.period === `${first?.year}FY` && r.metric === 'operating_profit');
  const p = d.annual_progress, valid = ['verified', 'partial', 'markdown_fallback'].includes(p?.status);
  const labels = p?.labels || {}, actual = p?.cumulative_actual, required = p?.remaining_required;
  const annualOp = p?.annual_estimate?.operating_profit, actualOp = actual?.operating_profit;
  const progress = p?.progress_pct?.operating_profit ?? (annualOp > 0 && actualOp != null ? actualOp / annualOp * 100 : null);
  return {
    date: d.source_as_of || null, annual, quarters,
    op: first?.op != null ? { col: `${first.year}E`, val: first.op, yoy: first.opYoy } : null,
    rev: change ? [['1개월', change.one_month_change_pct], ['3개월', change.three_month_change_pct]]
      .filter(([, v]) => v != null).map(([k, v]) => ({ k, v: pct(v) })) : [],
    prog: valid && progress != null ? { label: _rpHalfLabel(labels.cumulative_actual), pct: progress } : null,
    need: valid && required?.operating_margin_pct != null ? {
      period: _rpHalfLabel(labels.remaining_required), opm: margin(required.operating_margin_pct), op: required.operating_profit,
      ytd: _rpHalfLabel(labels.cumulative_actual), ytdOpm: margin(actual?.operating_margin_pct),
      prev: _rpHalfLabel(labels.prior_remaining, true), prevOpm: margin(p.prior_remaining?.operating_margin_pct),
    } : null,
  };
}

// 향후 컨센서스(MD 2-10, FnGuide 증권사 추정 평균) 읽기 — DART 분석 모델과 업로드(summary.consensus) 공용.
// annual = 연간 전망 표 열별 값(억원·EPS 원): 기업현황 탭 '연간 실적 요약'의 (E) 행. op·rev·prog = DART 분석 종합분석 줄
function _rpMdConsensus(lines) {
  const L = (lines || []).map(l => String(l).replace(/\r$/, ''));
  const data = _rpConsJson(L.join('\n'));
  if (data && !['verified_snapshot', 'markdown_fallback'].includes(data.status)) return null;
  // 2-10은 생성 묶음(report-consensus.js) 하나로 읽음 — 데이터 블록이 있으면 블록, 없으면 묶음이 고정 표에서 복원(markdown_fallback).
  // 예전엔 여기서 표를 따로 다시 읽어 두 곳이 어긋날 수 있었음(10-23 정리). 블록 v1(outlook 없음)·10-19 이전 표 양식은 null
  return data?.outlook ? _rpConsModelSummary(data) : null;
}

function _rpDartModel(md) {
  const L = (md || '').split('\n').map(l => l.replace(/\r$/, ''));
  const lab = (sec, key) => (sec || []).map(l => l.match(new RegExp(`^[-*]\\s*${key}[:：]\\s*(.+)$`))?.[1]?.trim()).find(Boolean) || null;
  const out = {};

  // 종합판단: 1-3 검토의견 → 없으면 2-9 '종합 검토의견' 첫 줄
  const s13 = _rpMdSec(L, /^### 1-3\./);
  out.verdict = lab(s13, '검토의견')
    || (_rpMdSec(L, /^#### 종합 검토의견/) || []).map(l => l.match(/^[-*]\s+(.+)$/)?.[1]?.trim()).find(Boolean) || null;
  out.scope = lab(s13, '판단 범위');

  // 분기 추이(2-7) 매출·영업이익 — 증권사 전망 카드의 '참고(공시 분기 합)' 줄에만 씀(개별 분기, 억원)
  const tr = _rpMdFirstPeriodTable(_rpMdSec(L, /^####\s*(?:2-7\.\d+\s+)?분기별 추이\s*$/));
  if (tr) {
    const row = re => { const r = tr.rows.find(r => re.test(r[0])); return r ? r.slice(1).map(_rpNum) : null; };
    const revenue = row(/^매출액/);
    out.trend = revenue && { periods: tr.hdr.slice(1), revenue, op: row(/^영업이익\(/) };
  }

  // 향후 컨센서스(2-10) — 종합분석 시장 평가 줄(op·rev·prog)
  const cons = _rpMdConsensus(L);
  if (cons) out.consensus = cons;

  // 증권사 전망(옛 양식): 영업이익(2-7)·매출(4-1) 추정 표 + 리포트 표(2-9)를 증권사·발행일로 합침.
  // 10-20 양식부터는 아래 데이터 블록(2-10 통합표)이 덮어씀. 옛 양식 MD(주성엔지니어링·한국피아이엠·마키나락스)를
  // 새 양식으로 다시 올리면 이 합치기는 지워도 됨 — tools/md-regress.js 표본에서도 빼고 확인
  const est = re => {
    const t = _rpMdFirstTable(_rpMdSec(L, re));
    return t ? { cols: t.hdr.slice(1), rows: t.rows.map(r => ({ ..._rpMdLinkCell(r[0]), vals: r.slice(1).map(_rpNum) })) } : null;
  };
  // 10-18 양식부터 2-7 소제목에 번호('#### 2-7.13 증권사 영업이익 추정') — 번호 없는 제목만 찾아 영업이익 추정이 전부 빠졌었음
  const estOp = est(/^####\s*(?:\d+-\d+\.\d+\s+)?증권사 영업이익 추정/), estRev = est(/^####\s*(?:\d+-\d+\.\d+\s+)?증권사 매출 추정/);
  const rsec = _rpMdSec(L, /^#### 증권사 리포트/) || [];
  const rt = _rpMdFirstTable(rsec);
  const reports = (rt?.rows || []).map(r => ({ ..._rpMdLinkCell(r[1]), date: r[0], opinion: r[2] || '', tp: r[3] || '', change: r[4] || '', bodyStatus: r[5] || '' }));
  const rnote = {};   // '**신한투자증권 | 제목**' 아래 '- 자체 검토:'
  let cur = null;
  for (const l of rsec) {
    const b = l.trim().match(/^\*\*(.+?)\s*\|\s*(.+)\*\*$/);
    if (b) { cur = rnote[b[1].trim()] = { headline: b[2].trim(), review: null }; continue; }
    const rv = cur && l.match(/^[-*]\s*자체 검토[:：]\s*(.+)$/);
    if (rv) cur.review = rv[1].trim();
  }
  const bmap = new Map();
  const bget = (text, url, date) => {
    const k = `${text}|${date || ''}`;
    if (!bmap.has(k)) bmap.set(k, { broker: text, url, date, opinion: '', tp: '', change: '', rev: {}, op: {} });
    return bmap.get(k);
  };
  for (const [t, key] of [[estRev, 'rev'], [estOp, 'op']])
    for (const r of t?.rows || []) { const b = bget(r.text, r.url, r.date); t.cols.forEach((c, i) => { b[key][c] = r.vals[i]; }); }
  for (const r of reports) Object.assign(bget(r.text, r.url, r.date), { opinion: r.opinion, tp: r.tp, change: r.change, url: r.url || null });
  out.brokers = [...bmap.values()].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  out.estCols = [...new Set([...(estOp?.cols || []), ...(estRev?.cols || [])])];

  // 신규 모델 또는 2-10 통합표가 기존 분산 표보다 우선. 보류·오류 시 구형 표로 되돌리지 않는다.
  const cj = _rpConsJson(md);
  out.consensusState = cj;
  if (cj) {
    const valid = ['verified_snapshot', 'markdown_fallback'].includes(cj.status);
    const j = _rpConsFromJson(valid ? cj : { rows: [], warnings: cj.warnings });
    out.brokers = j.brokers; out.estCols = j.estCols;
    out.ranges = j.ranges; out.market = j.market; out.estNotes = j.estNotes;
    if (!valid) out.consensus = null;
  }

  // 보고기간 이후 이벤트: 후속 공시(2-8) + 리포트·뉴스(2-9), 최근 순
  const events = [];
  out.eventRange = (lab(_rpMdSec(L, /^### 2-8\./), '조회 범위') || '').match(/\d{4}-\d{2}-\d{2}\s*~\s*\d{4}-\d{2}-\d{2}/)?.[0] || null;
  for (const r of _rpMdFirstTable(_rpMdSec(L, /^#### 후속 공시 목록/))?.rows || []) {
    const k = _rpMdLinkCell(r[1]);
    events.push({ date: r[0], kind: '공시', title: k.text, url: k.url, tag: r[2] || '', scope: r[3] || '', text: null, opinion: null });
  }
  // 같은 날 공시에 내용·검토의견을 붙임 — '원문 검토 반영' 공시 우선
  const attach = (date, text, opinion) => {
    const same = events.filter(e => e.kind === '공시' && e.date === date && !e.text);
    const ev = same.find(e => /원문 검토 반영/.test(e.scope)) || same[0];
    if (ev) { ev.text = text; ev.opinion = opinion; }
  };
  // 확인된 투자 영향(2-8): '- 날짜: 내용' + 다음 줄 '- 검토의견: …'
  const imp = _rpMdSec(L, /^#### 확인된 투자 영향/) || [];
  imp.forEach((l, i) => {
    const m = l.match(/^[-*]\s*(\d{4}-\d{2}-\d{2})[:：]\s*(.+)$/);
    if (m) {
      const next = imp.findIndex((row, j) => j > i && /^[-*]\s*\d{4}-\d{2}-\d{2}[:：]/.test(row));
      const opinion = imp.slice(i + 1, next < 0 ? imp.length : next)
        .map(row => row.match(/^[-*]\s*검토의견[:：]\s*(.+)$/)?.[1]).find(Boolean);
      attach(m[1], m[2], opinion || null);
    }
  });
  // 주요 뉴스(2-9): '**날짜 | 제목**' + 구분·확인 내용·자체 검토. '구분: 공시'는 같은 날 공시 항목에 합침(중복 표시 방지)
  let nv = null;
  const flush = () => {
    if (!nv) return;
    if (nv.isDisc && events.some(e => e.kind === '공시' && e.date === nv.date)) attach(nv.date, nv.text || nv.title, nv.opinion);
    else events.push(nv);
    nv = null;
  };
  for (const l of _rpMdSec(L, /^#### 주요 뉴스/) || []) {
    const b = l.trim().match(/^\*\*(\d{4}-\d{2}-\d{2})\s*\|\s*(.+)\*\*$/);
    if (b) { flush(); nv = { date: b[1], kind: '뉴스', title: b[2].trim(), url: null, tag: '', scope: '', text: null, opinion: null, isDisc: false }; continue; }
    if (!nv) continue;
    const g = l.match(/^[-*]\s*구분[:：]\s*(.+)$/);
    if (g) { nv.isDisc = /^공시/.test(g[1]); nv.url = g[1].match(/\]\((https?:\/\/[^)\s]+)\)/)?.[1] || null; nv.tag = g[1].split(/[.。]/)[0].trim(); continue; }
    const t = l.match(/^[-*]\s*확인 내용[:：]\s*(.+)$/);
    if (t) { nv.text = t[1].trim(); continue; }
    const o = l.match(/^[-*]\s*자체 검토[:：]\s*(.+)$/);
    if (o) nv.opinion = o[1].trim();
  }
  flush();
  for (const r of reports) {
    const n = rnote[r.text];
    const tp = r.tp && !/미확인|미제시/.test(r.tp) ? ` · 목표주가 ${r.tp}` : '';
    events.push({ date: r.date, kind: '리포트', title: `${r.text} ${r.opinion}${tp}`, url: r.bodyStatus === '원문 미확인' ? null : r.url, tag: '', scope: [r.change, r.bodyStatus].filter(Boolean).join(' · '),
      text: n?.headline ? `「${n.headline}」` : null, opinion: n?.review || null });
  }
  out.events = events.filter(e => /^\d{4}-\d{2}-\d{2}$/.test(e.date)).sort((a, b) => b.date.localeCompare(a.date));
  return out;
}

// ── MD 깊은 파싱 (렌더 전용) ──────────────────────────────────────────────────
// summary를 넘기면 사용자가 고친 기본정보(profile_edits)를 적용 — orig: MD 원래 값, edited: 고친 항목
function _mdDeepParse(md, summary) {
  const lines = md.split('\n');

  function secLines(h2keyword) {
    const si = lines.findIndex(l => l.startsWith('## ') && l.includes(h2keyword));
    if (si < 0) return [];
    const ei = lines.findIndex((l,i) => i > si && /^## /.test(l));
    return lines.slice(si+1, ei > 0 ? ei : lines.length);
  }
  function subLines(keyword, src) {
    const si = src.findIndex(l => l.startsWith('### ') && l.includes(keyword));
    if (si < 0) return [];
    const ei = src.findIndex((l,i) => i > si && /^#{2,3} /.test(l));
    return src.slice(si+1, ei > 0 ? ei : src.length);
  }
  function lv(keyword, src) {
    const l = (src||lines).find(l => new RegExp(`[-*]\\s*${keyword}[:：]`).test(l));
    return l ? l.replace(new RegExp(`.*${keyword}[:：]\\s*`), '').trim() : null;
  }

  // 문서 개요
  const stockCode = (() => {
    const l = lines.find(l => /\|\s*종목코드\s*\|/.test(l));
    return l ? l.split('|')[2]?.trim() : null;
  })();
  const stockName = (() => {
    const l = lines.find(l => /\|\s*회사명\s*\|/.test(l));
    return l ? l.split('|')[2]?.trim() : null;
  })();
  const docVal = key => {   // 문서 개요 표 '| 키 | 값 |'
    const l = lines.find(l => new RegExp(`^\\|\\s*${key}\\s*\\|`).test(l));
    return l ? l.split('|')[2]?.trim() || null : null;
  };
  const receiptNo = (docVal('접수번호') || '').match(/^\d{14}$/)?.[0] || null;   // DART 원문 링크용
  const updated = docVal('업데이트');

  // 2-1 기본정보
  const sec2 = secLines('2. 기업정보');
  const basic = subLines('2-1', sec2);
  const mainBusinessRaw = lv('주요사업', basic);
  const mainBusiness = mainBusinessRaw
    ? mainBusinessRaw.slice(0, 120) + (mainBusinessRaw.length > 120 ? '...' : '')
    : null;   // 없으면 null — 'undefined' 문자열이 카드에 찍히던 문제

  // 2-4 계열회사 — 관계·지분율·역할·국가·매출·순손익·자본·자산·부채·검토의견. 금액은 천원으로 맞춰 둠(_rpSubsContent가 천원 기준)
  // 생성기 양식마다 단위가 다름: '매출 1,462천원'(옛 양식) · '매출 4.97억원'(새 양식, 원익IPS) · '매출 4,506,790,604원'(파두)
  // — 예전엔 천원만 읽어 새 양식은 표 숫자가 전부 '—'였음(10-18)
  const subSec = subLines('2-4', sec2);
  const subsidiaries = [];
  const UNIT_K = { '원': 1e-3, '천원': 1, '만원': 10, '백만원': 1e3, '억원': 1e5, '조원': 1e8 };
  const AMT = '(-?[\\d,]+(?:\\.\\d+)?)\\s*(조원|억원|백만원|만원|천원|원)';
  const toK = (n, u) => Math.round(parseFloat(n.replace(/,/g, '')) * UNIT_K[u]);
  const num천 = (s, kw) => {  // "kw 1,462천원" / "kw 4.97억원" / "kw -143,014원" → 천원 정수, 없으면 null("매출 -" 등)
    const m = (s || '').match(new RegExp(kw + '\\s*' + AMT));
    return m ? toK(m[1], m[2]) : null;
  };
  let cur = null;
  for (const l of subSec) {
    const h5 = l.match(/^##### (.+)/);
    if (h5) {
      if (cur) subsidiaries.push(cur);
      cur = { name: h5[1].trim(), relation: null, ownership: null, role: null, country: null,
        revenue: null, netIncome: null, equity: null, assets: null, liabilities: null,
        opinion: null, note: null };
      continue;
    }
    if (!cur) continue;
    const relM = l.match(/관계\/지분율[:：]\s*(.+)/);        // 종속기업 / 100%
    if (relM) { const p = relM[1].split('/').map(s => s.trim()); cur.relation = p[0] || null; cur.ownership = p[1] || null; }
    const roleM = l.match(/역할[:：]\s*(.+)/);               // 반도체장비 제조 및 판매 / 독일
    if (roleM) {
      const p = roleM[1].split('/').map(s => s.trim()).filter(Boolean);
      if (p.length >= 2) { cur.country = p[p.length - 1]; cur.role = p.slice(0, -1).join(' / '); }
      else cur.role = p[0] || null;
    }
    const rev = num천(l, '매출'); if (rev != null) cur.revenue = rev;          // "매출 -"는 null 유지
    const eq  = num천(l, '자본'); if (eq  != null) cur.equity = eq;
    const as  = num천(l, '자산'); if (as  != null) cur.assets = as;
    const li  = num천(l, '부채'); if (li  != null) cur.liabilities = li;
    const netM = l.match(new RegExp('순(이익|손실)\\s*' + AMT));
    if (netM) cur.netIncome = toK(netM[2], netM[3]) * (netM[1] === '손실' ? -1 : 1);
    const opM = l.match(/검토의견[:：]\s*(.+)/); if (opM) cur.opinion = opM[1].trim();
    if (l.includes('자본잠식')) cur.note = '자본잠식';
  }
  if (cur) subsidiaries.push(cur);
  for (const s of subsidiaries) if (s.equity != null && s.equity < 0 && !s.note) s.note = '자본잠식';

  const subsidiarySummary = {
    count:        lv('계열회사 수', subSec),
    revenueSum:   lv('계열회사 매출 합계', subSec),
    lossCount:    lv('손실 계열회사', subSec),
    financeCheck: lv('재무 체크', subSec),
  };

  // 3-1 주주
  const sec3 = secLines('3. 주주');
  const sh = subLines('3-1', sec3);
  const majorRaw = lv('최대주주', sh);
  // 끝의 '(32.90%)'만 떼어냄 — split('(')는 '(주)원익홀딩스'처럼 괄호로 시작하는 이름을 빈 값으로 만들었음
  const majorShareholder   = majorRaw?.replace(/\s*\(\s*[\d.]+\s*%\s*\)\s*$/, '').trim() || majorRaw;
  const majorShRatioRaw    = lv('최대주주', sh)?.match(/([\d.]+)%/);
  const majorShareholderRatio = majorShRatioRaw ? majorShRatioRaw[1]+'%' : null;

  const out = {
    stockCode, stockName, receiptNo, updated,
    legalName:   lv('회사명', basic),
    mainBusiness,
    established: lv('설립일', basic),
    listedDate:  lv('상장일', basic),
    location:    lv('소재지', basic),
    subsidiaries,
    subsidiarySummary,
    majorShareholder,
    majorShareholderRatio,
  };
  // 사용자 수정값 적용(주요사업 원래 값은 자르기 전 전문)
  out.orig = {}; out.edited = [];
  const edits = summary?.profile_edits || {};
  for (const { k } of RP_PROFILE_FIELDS) {
    out.orig[k] = (k === 'mainBusiness' ? mainBusinessRaw : out[k]) || null;
    if (typeof edits[k] === 'string') { out[k] = edits[k].trim() || null; out.edited.push(k); }
  }
  return out;
}

// ── 사업 섹션 파서 (4-1 ~ 4-5) ───────────────────────────────────────────────
function _rpParseBusinessSections(md, stockCode) {
  const lines = md.split('\n');

  // "25.1Q" → {bsns_year:2025, quarter:'Q1'}
  const parsePeriod = s => {
    const m = s.trim().match(/^(\d{2})\.(\d)Q$/);
    return m ? { bsns_year: 2000 + parseInt(m[1]), quarter: 'Q' + m[2] } : null;
  };

  // "3,596 (42%)" → {amount:3596, ratio:42.00} / "3,596" → {amount:3596, ratio:null}
  // (소수까지 읽음 — 억원 표의 1,234.5를 백만원으로 바꿀 때 .5를 버리지 않게)
  const parseAmtRatio = s => {
    const str = (s||'').trim();
    if (!str || str === '-') return { amount: null, ratio: null };
    const rm = str.match(/\((\d+\.?\d*)%\)/);
    const ratio = rm ? parseFloat(rm[1]) : null;
    const n = parseFloat(str.replace(/\(.*?\)/,'').replace(/,/g,'').replace(/-/g,'').trim());
    const neg = /^-/.test(str.replace(/\(.*?\)/,'').trim());
    const amount = isNaN(n) ? null : (neg ? -n : n);
    return { amount, ratio };
  };

  // "8,222,688" or "27%" or "-" → {value, isPct}
  const parseNumOrPct = s => {
    const str = (s||'').trim();
    if (!str || str === '-') return { value: null, isPct: false };
    const pm = str.match(/^(\d+\.?\d*)%$/);
    if (pm) return { value: parseFloat(pm[1]), isPct: true };
    const n = parseInt(str.replace(/,/g,''));
    return { value: isNaN(n) ? null : n, isPct: false };
  };

  const parseRow = r => r.split('|').slice(1,-1).map(c => c.trim());

  // 특정 h3 섹션의 h3~다음 h2/h3 사이 줄
  const sectionLines = h3 => {
    const si = lines.findIndex(l => l.startsWith('### ') && l.includes(h3));
    if (si < 0) return [];
    const ei = lines.findIndex((l,i) => i > si && /^#{2,3} /.test(l));
    return lines.slice(si, ei > 0 ? ei : lines.length);
  };

  // 표 단위 → 백만원 배율. 사업분석 탭이 4-1·4-2·4-3·4-6을 '백만원'으로 그리므로 저장 전에 맞춤.
  // 외화가 섞였거나(천 USD 등) 금액이 아닌 단위(대수·천C/S·'천')는 환산할 수 없어 f=null → 저장하지 않음.
  // 단위 표기가 없는 표는 예전처럼 백만원으로 봄(f=1)
  const TO_MIL = { '원': 1e-6, '천원': 1e-3, '백만원': 1, '억원': 100, '십억원': 1e3, '조원': 1e6 };
  const unitFactor = ls => {   // 표 위쪽 줄(가까운 것부터)의 '단위: …'
    // 표 값의 단위는 '**표 기준: 별도 | … | 금액 억원; …; 원문 금액 백만원**'의 '금액 ○○'(표시 단위)가 먼저.
    // 같은 소절의 '원문 단위: 백만원'은 DART 원문 단위라 표와 다르다 — 이것만 읽어 원익IPS 4-1·4-2·4-3·4-6이 100배 작게
    // 저장됐음(10-17 업로드, 23.1Q 매출 1,503.68억 → 1,504백만원)
    for (let i = ls.length - 1; i >= 0; i--) {
      const m = /표 기준/.test(ls[i]) && ls[i].match(/(?<!원문\s?)금액\s*(조원|십억원|억원|백만원|천원|원)/);
      if (m) return { unit: m[1], f: TO_MIL[m[1]] };
    }
    for (let i = ls.length - 1; i >= 0; i--) {
      const m = ls[i].match(/단위[:：]\s*([^)|]+)/);
      if (!m) continue;
      const unit = m[1].trim(), raw = unit.replace(/\s+/g, '');
      if (/USD|JPY|EUR|CNY|CAD|GBP|HKD|달러|위안|엔화/i.test(raw)) return { unit, f: null };
      return { unit, f: TO_MIL[raw.split(/[,/·%]/)[0]] ?? null };
    }
    return { unit: null, f: 1 };
  };

  // 특정 h3 섹션에서 '기간 열(25.1Q)이 있는 첫 표'의 행만 추출(+ 그 표의 단위 uf).
  // 같은 섹션의 '증권사 매출 추정'(26.3QE·연간E) 표가 섞이면 추정치가 과거 분기 매출로 저장됐음
  // 연도별로 나뉜 표(새 양식)는 _rpMdPeriodTable로 합쳐 예전처럼 '한 표' 줄 목록으로. 맨 위 '최근 비교'(최근·전년 동기) 표는
  // 기간 열이 없어 건너뜀
  const isP = h => !!parsePeriod(h);
  const mergedAt = (ls, i) => {
    const T = _rpMdPeriodTable(ls, i, isP);
    return T ? [T.hdr, ...T.rows].map(c => '| ' + c.join(' | ') + ' |') : [];
  };
  const getSectionTable = h3 => {
    const sec = sectionLines(h3);
    for (let i = 1; i < sec.length; i++) {
      if (!/^\|/.test(sec[i]) || /^\|/.test(sec[i - 1])) continue;   // 표의 첫 줄에서만 시작
      if (!parseRow(sec[i]).some(isP)) continue;
      const tbl = mergedAt(sec, i);
      if (tbl.length) { tbl.uf = unitFactor(sec.slice(0, i)); return tbl; }
    }
    return [];
  };

  // 소제목(#### 생산능력 추이 등) 다음의 '첫 번째 연속 표'만 추출 — 한 섹션에 표 여러 개일 때 분리용.
  // 4장 안의 제목 줄에서만 찾음(요약 본문에 같은 낱말이 나와도 무시), 표 없이 다음 제목이 나오면 빈 값(다른 절 표를 집지 않음)
  const sec4 = Math.max(0, lines.findIndex(l => /^## 4\./.test(l)));
  const firstTableAfter = kw => {
    const h = lines.findIndex((l, j) => j >= sec4 && /^#{2,6}\s/.test(l) && l.includes(kw));
    if (h < 0) return [];
    // 기간 열이 있는 첫 표(새 양식의 '최근 비교' 표는 건너뜀) — 다음 제목이 먼저 나오면 빈 값
    for (let i = h + 1; i < lines.length; i++) {
      if (/^#{2,6}\s/.test(lines[i])) return [];
      if (!/^\s*\|/.test(lines[i]) || /^\s*\|/.test(lines[i - 1])) continue;
      if (!parseRow(lines[i].trim()).some(isP)) continue;
      const tbl = mergedAt(lines, i);
      tbl.uf = unitFactor(lines.slice(h, i));   // 제목 '(단위: 백만원)'·'표 기준 … 금액 억원' 등 제목~표 사이 줄
      return tbl;
    }
    return [];
  };

  // skipped: 단위를 백만원으로 바꿀 수 없어 저장하지 않은 표(업로드 알림용)
  const result = { segmentRevenue: [], rawMaterial: [], production: [], orderBacklog: [], skipped: [] };
  const toMil = (n, uf) => Math.round(n * uf.f);
  const usable = (tbl, label) => {
    if (tbl.length < 2) return false;
    if (tbl.uf?.f == null) { result.skipped.push(`${label}(${(tbl.uf?.unit || '단위 불명').slice(0, 20)})`); return false; }
    return true;
  };

  // ── 4-1. 매출(제품별) ─ 차원 컬럼(사업부문·품목) 자동 감지 ──────────────────
  // 헤더에서 기간("25.1Q") 컬럼이 처음 나오는 위치 이전까지를 차원 컬럼으로 본다.
  //   "| 사업부문 | 품목 | 23.1Q | ... |" → 차원 2개(category=사업부문, subcategory=품목)
  //   "| 구분 | 25.1Q | ... |"           → 차원 1개(category=구분)
  const t41 = getSectionTable('4-1');
  if (usable(t41, '4-1 제품별 매출')) {
    const header = parseRow(t41[0]);
    let dimN = header.findIndex(h => parsePeriod(h));  // 첫 기간 컬럼 위치
    if (dimN < 1) dimN = 1;                             // 기간 미인식 시 차원 1개로 폴백
    const periods = header.slice(dimN).map(parsePeriod);
    for (const row of t41.slice(1)) {
      const cols = parseRow(row);
      const category    = (cols[0] || '').trim();
      const subcategory = dimN >= 2 ? (cols[1] || '').trim() : '';
      if (!category || category === '합계' || subcategory === '합계') continue;
      cols.slice(dimN).forEach((v, pi) => {
        if (!periods[pi]) return;
        const { amount, ratio } = parseAmtRatio(v);
        if (amount == null) return;
        result.segmentRevenue.push({
          stock_code: stockCode, ...periods[pi],
          segment_type: 'product', category, subcategory,
          revenue: toMil(amount, t41.uf), revenue_ratio: ratio,
        });
      });
    }
  }

  // ── 4-2. 매출(국내/해외) ─────────────────────────────────────────────────
  const t42 = getSectionTable('4-2');
  if (usable(t42, '4-2 국내/해외 매출')) {
    const periods = parseRow(t42[0]).slice(2).map(parsePeriod);
    for (const row of t42.slice(1)) {
      const cols = parseRow(row);
      const category = cols[0], sub = cols[1];
      if (!category || category === '합계' || sub === '합계') continue;
      cols.slice(2).forEach((v, pi) => {
        if (!periods[pi]) return;
        const str = v.replace(/,/g,'').trim();
        if (!str || str === '-') return;
        const n = parseFloat(str);
        if (isNaN(n)) return;
        result.segmentRevenue.push({
          stock_code: stockCode, ...periods[pi],
          segment_type: 'region', category, subcategory: sub||'',
          revenue: toMil(n, t42.uf), revenue_ratio: null,
        });
      });
    }
  }

  // ── 4-3. 원재료 ──────────────────────────────────────────────────────────
  const t43 = getSectionTable('4-3');
  if (usable(t43, '4-3 원재료')) {
    const periods = parseRow(t43[0]).slice(2).map(parsePeriod);
    for (const row of t43.slice(1)) {
      const cols = parseRow(row);
      const pname = cols[0], mname = cols[1];
      if (!mname || pname === '합계') continue;
      cols.slice(2).forEach((v, pi) => {
        if (!periods[pi]) return;
        const n = parseFloat(v.replace(/,/g,'').trim());
        if (isNaN(n)) return;
        result.rawMaterial.push({
          stock_code: stockCode, ...periods[pi],
          data_type: 'usage', product_name: pname||'', material_name: mname,
          origin: '', amount: toMil(n, t43.uf),
        });
      });
    }
  }

  // ── 4-4. 원재료 가격변동추이 ─────────────────────────────────────────────
  const t44 = getSectionTable('4-4');
  if (t44.length >= 2) {
    const periods = parseRow(t44[0]).slice(2).map(parsePeriod);
    for (const row of t44.slice(1)) {
      const cols = parseRow(row);
      const mname = cols[0], origin = cols[1];
      if (!mname) continue;
      cols.slice(2).forEach((v, pi) => {
        if (!periods[pi]) return;
        const n = parseInt(v.replace(/,/g,'').trim());
        if (isNaN(n)) return;
        result.rawMaterial.push({
          stock_code: stockCode, ...periods[pi],
          data_type: 'price', product_name: '', material_name: mname,
          origin: origin||'', amount: n,
        });
      });
    }
  }

  // ── 4-5. 생산능력·생산실적·가동률 ─────────────────────────────────────────
  //  신형: "생산능력 추이"(품목|기간, 대) · "생산실적 추이"(품목|기간) · "가동률 추이"(항목|기간)
  //  구형: "공장/지표 | 기간" 단일표
  {
    const prodMap = {};
    const put = (name, p, field, val) => {
      if (val == null) return;
      const key = `${p.bsns_year}_${p.quarter}_${name}`;
      (prodMap[key] ||= { stock_code: stockCode, bsns_year: p.bsns_year, quarter: p.quarter,
        factory_name: name, capacity: null, actual: null, utilization_rate: null });
      prodMap[key][field] = val;
    };
    const numOnly = v => { const s = (v || '').replace(/,/g, '').replace(/[^\d.\-]/g, '').trim();
      const n = parseFloat(s); return s === '' || isNaN(n) ? null : Math.round(n); };
    const pctOnly = v => { const m = (v || '').match(/(-?[\d.]+)\s*%/); return m ? parseFloat(m[1]) : null; };
    const pKey = p => `${p.bsns_year}_${p.quarter}`;
    // 표 → { 품목: Map(기간키 → { p, v }) }
    const byItem = (tbl, parse) => {
      const out = {};
      if (tbl.length < 2) return out;
      const h = parseRow(tbl[0]); let d = h.findIndex(x => parsePeriod(x)); if (d < 1) d = 1;
      const P = h.slice(d).map(parsePeriod);
      for (const row of tbl.slice(1)) {
        const cols = parseRow(row); const name = (cols[0] || '').trim();
        if (!name || name === '합계') continue;
        const m = (out[name] ||= new Map());
        cols.slice(d).forEach((v, pi) => { if (P[pi]) m.set(pKey(P[pi]), { p: P[pi], v: parse(v) }); });
      }
      return out;
    };
    // 누적 → 분기: 1분기는 그대로, 2~4분기는 같은 해 직전 분기 누적을 뺌.
    // 직전 누적이 없거나 결과가 음수면 비움(지어내지 않음)
    const deCum = m => {
      const q = new Map();
      for (const [k, { p, v }] of m) {
        const n = +p.quarter.slice(1);
        const prev = n > 1 ? m.get(`${p.bsns_year}_Q${n - 1}`)?.v : 0;
        const d = v == null || prev == null ? null : v - prev;
        q.set(k, { p, v: d != null && d >= 0 ? d : null });
      }
      return q;
    };
    const tCap = firstTableAfter('생산능력 추이');
    const tAct = firstTableAfter('생산실적 추이');
    const tUtil = firstTableAfter('가동률 추이');
    if (tCap.length || tAct.length || tUtil.length) {
      // 4-5 기준 문구가 '누적'이라고 밝힌 경우(반기·3분기·연간 = 기간 누적 공시)만 분기값으로 바꿔 저장.
      // 밝히지 않은 MD는 공시값 그대로(주성엔지니어링처럼 분기마다 공시 방식이 섞인 회사가 있어 숫자 모양으로 추측하지 않음)
      const cumulative = sectionLines('4-5').some(l => /^[-*]\s*기준[:：]/.test(l) && l.includes('누적'));
      const capRaw = byItem(tCap, numOnly), actRaw = byItem(tAct, numOnly);
      const conv = o => Object.fromEntries(Object.entries(o).map(([n, m]) => [n, cumulative ? deCum(m) : m]));
      const cap = conv(capRaw), act = conv(actRaw);
      for (const [name, m] of Object.entries(cap)) for (const { p, v } of m.values()) put(name, p, 'capacity', v);
      for (const [name, m] of Object.entries(act)) for (const { p, v } of m.values()) put(name, p, 'actual', v);

      // 가동률: '…가동률' 행(평균가동률) + 생산능력·실적 표와 같은 품목 행(반도체·디스플레이 등).
      // 가동가능시간 같은 보조 행은 % 값이 없어 건너뜀
      const utilRaw = byItem(tUtil, pctOnly);
      for (const [rowName, m] of Object.entries(utilRaw)) {
        const name = /가동률/.test(rowName) ? '평균가동률' : rowName;
        if (name !== '평균가동률' && !capRaw[name] && !actRaw[name]) continue;
        let out = m;
        if (cumulative) {
          // 누적 가동률은 빼서 분기값을 만들 수 없음. 공시 가동률이 누적 실적÷누적 능력과 맞는(±1%p) 품목만
          // 분기 실적÷분기 능력으로 다시 계산하고, 아니면 1분기(누적=분기)만 남김
          const c = capRaw[name], a = actRaw[name];
          let checked = 0;
          const fits = !!(c && a) && [...m].every(([k, { v }]) => {
            const cv = c.get(k)?.v, av = a.get(k)?.v;
            if (v == null || cv == null || av == null || cv === 0) return true;
            checked++;
            return Math.abs(av / cv * 100 - v) <= 1;
          }) && checked > 0;
          out = new Map([...m].map(([k, { p, v }]) => {
            if (p.quarter === 'Q1') return [k, { p, v }];
            if (!fits) return [k, { p, v: null }];
            const cq = cap[name].get(k)?.v, aq = act[name].get(k)?.v;
            return [k, { p, v: cq && aq != null ? Math.round(aq / cq * 1000) / 10 : null }];
          }));
        }
        for (const { p, v } of out.values()) put(name, p, 'utilization_rate', v);
      }
    } else {
      const t45 = getSectionTable('4-5');
      if (t45.length >= 2) {
        const P = parseRow(t45[0]).slice(1).map(parsePeriod);
        const mm = { '생산능력': 'capacity', '생산실적': 'actual', '가동률': 'utilization_rate' };
        for (const row of t45.slice(1)) {
          const cols = parseRow(row);
          const [factory, metricKr] = (cols[0] || '').split('/').map(s => s.trim());
          const field = mm[metricKr];
          if (!factory || !field) continue;
          cols.slice(1).forEach((v, pi) => { if (!P[pi]) return; const { value } = parseNumOrPct(v); put(factory, P[pi], field, value); });
        }
      }
    }
    result.production = Object.values(prodMap).filter(r =>
      r.capacity != null || r.actual != null || r.utilization_rate != null);
  }

  // ── 4-6. 수주현황 — "수주잔고 추이"(품목 | 기간…) 표만 파싱 ─────────────────────
  // 같은 4-6 섹션의 스냅샷(수주총액/기납품액…)·판매계약 표가 섞이지 않도록 소제목 기준 첫 표만.
  // 잔고는 기말 잔액(stock). 매출처럼 합산하지 않음. segment_type='backlog'로 저장.
  const t46 = firstTableAfter('수주잔고 추이');
  if (usable(t46, '4-6 수주잔고')) {
    const header = parseRow(t46[0]);
    let dimN = header.findIndex(h => parsePeriod(h));
    const periods = dimN >= 1 ? header.slice(dimN).map(parsePeriod) : [];
    // 기간 컬럼이 실제로 있을 때만(= 수주잔고 추이 표).
    if (periods.some(Boolean)) {
      for (const row of t46.slice(1)) {
        const cols = parseRow(row);
        const category = (cols[0] || '').trim();
        if (!category || category === '합계') continue;
        cols.slice(dimN).forEach((v, pi) => {
          if (!periods[pi]) return;
          const n = parseFloat((v || '').replace(/,/g, '').trim());
          if (isNaN(n)) return;
          result.orderBacklog.push({
            stock_code: stockCode, ...periods[pi],
            segment_type: 'backlog', category, subcategory: '',
            revenue: toMil(n, t46.uf), revenue_ratio: null,
          });
        });
      }
    }
  }

  return result;
}

// 원자료 덤프(원문 변환본·원문 XML·API JSON = 5~7장)는 화면·저장에서 뺀다 — 원익IPS 기준 MD 6MB의 98%·DOM의 92%.
// 분석(1~4장)·변경사항(8장~)만 남기고 원문은 헤더의 'DART 원문' 링크로 대신함. 코드블록 안의 '## '는 제목으로 보지 않음.
// 옛 양식(06월 생성분)은 5장 안에 '## 원문 XML: 접수번호.xml'이 따로 ## 제목으로 있음
const _RPD_RAW_SEC = /^##\s+(?:\d+\.\s*(?:보고서 원문 전체 변환|재무정보 전체|정기보고서 주요정보 전체)|원문 XML:.*)\s*$/;
const _rpFenceClose = open => new RegExp(`^${open[0] === '`' ? '`' : '~'}{${open.length},}\\s*$`);
// 새 양식(10-18~)의 편집용 줄 — 목차 앵커 '<a id="section-2-3"></a>', '<!-- reader-layout … -->' 주석, 로컬 파일로 가는
// '[상세 검토·계산 근거](../../data/…review_details….md#…)'(사이트엔 없는 파일). 카드에 '<a id=…>' 글자가 그대로 보였음
const _RPD_DROP_LINE = /^(<a id="[^"]*">\s*<\/a>|<!--.*-->|[-*]\s*\[상세 검토[^\]]*\]\((?!https?:)[^)]*\))$/;
// keepData: 여러 줄 주석(버전별 consensus 데이터 블록)을 남김 — 업로드 저장본용.
// 화면용(상세 분석·카드)은 빼야 JSON 글자가 '10. 제외 후보 메모'에 그대로 찍히지 않음
function _rpStripRawSections(md, keepData = false) {
  const out = [];
  let skip = false, close = null, cmt = false;
  for (const line of (md || '').split('\n')) {
    const t = line.trim();
    if (cmt) { if (t.includes('-->')) cmt = false; if (keepData && !skip) out.push(line); continue; }
    if (!close && /^<!--/.test(t) && !t.includes('-->')) { cmt = true; if (keepData && !skip) out.push(line); continue; }
    if (close) { if (close.test(t)) close = null; }
    else if (/^(`{3,}|~{3,})/.test(t)) close = _rpFenceClose(t.match(/^(`{3,}|~{3,})/)[1]);
    else if (/^## /.test(line)) skip = _RPD_RAW_SEC.test(t);
    else if (_RPD_DROP_LINE.test(t)) continue;
    if (!skip) out.push(line);
  }
  return out.join('\n');
}

const _RPD_ESC = /\\([\\`*_{}\[\]()#+\-.!|])/g;

// ── DART MD 파서 ─────────────────────────────────────────────────────────────
function _rpParseMd(text) {
  const lines = text.split('\n');

  function tableVal(sectionKeyword, key) {
    const si = lines.findIndex(l => l.includes(sectionKeyword));
    if (si < 0) return null;
    for (let i = si; i < Math.min(si + 40, lines.length); i++) {
      const m = lines[i].match(/\|\s*(.+?)\s*\|\s*(.+?)\s*\|/);
      if (m && m[1].trim() === key) return m[2].trim();
    }
    return null;
  }

  function lineVal(keyword) {
    const l = lines.find(l => l.match(new RegExp(`[-*]\\s*${keyword}[:：]`)));
    return l ? l.replace(new RegExp(`.*${keyword}[:：]\\s*`), '').trim() : null;
  }

  function allTagged(tag) {
    return lines
      .filter(l => l.match(new RegExp(`^[-*]\\s*${tag}[:：]`)))
      .map(l => l.replace(new RegExp(`^[-*]\\s*${tag}[:：]\\s*`), '').trim())
      .filter(Boolean);
  }

  // 신양식 1-1 투자포인트 / 1-2 핵심 리스크 — 굵은 제목 줄(**제목 [태그]**) 하나가 항목 하나.
  // 섹션이 없으면 null(옛 양식 → '- 투자판단:' 줄로 폴백), 섹션은 있는데 항목이 없으면 [] (폴백하지 않음)
  function boldTitles(h3re) {
    const si = lines.findIndex(l => h3re.test(l));
    if (si < 0) return null;
    const ei = lines.findIndex((l, i) => i > si && /^#{2,3} /.test(l));
    return lines.slice(si + 1, ei > 0 ? ei : lines.length)
      .map(l => l.trim().match(/^\*\*(.+)\*\*$/)?.[1].trim())
      .filter(Boolean);
  }

  const stockCode  = tableVal('문서 개요', '종목코드') || '';
  const stockName  = tableVal('문서 개요', '회사명') || '';
  const reportType = tableVal('문서 개요', '원문 기준') || '';
  const receiveDate = tableVal('문서 개요', '접수일') || '';

  const dilutionRatioRaw = lineVal('전체 잠재 물량');
  const dilutionRatio = dilutionRatioRaw ? parseFloat(dilutionRatioRaw.match(/([\d.]+)%/)?.[1] ?? '0') : 0;

  const lockupRaw = lineVal('보호예수 물량');
  const lockupRatio = lockupRaw ? parseFloat(lockupRaw.match(/([\d.]+)%/)?.[1] ?? '0') : 0;
  const lockupEnd = lineVal('주요 반환예정일');

  const majorRaw = lineVal('최대주주 및 특수관계인 지분');
  const relatedPartyRatio = majorRaw ? parseFloat(majorRaw.match(/([\d.]+)%/)?.[1] ?? '0') : 0;

  return {
    stock_code:   stockCode,
    stock_name:   stockName,
    report_type:  reportType,
    receive_date: receiveDate,
    summary: {
      dilution_ratio:     dilutionRatio,
      lockup_ratio:       lockupRatio,
      lockup_end:         lockupEnd,
      related_party_ratio: relatedPartyRatio,
      investment_points:  boldTitles(/^### 1-1\./) ?? allTagged('투자판단'),
      risk_points:        boldTitles(/^### 1-2\./) ?? allTagged('리스크'),
      review_points:      allTagged('검토의견'),
      // 향후 컨센서스(2-10) — 기업현황 탭은 raw_md를 안 불러오므로 업로드 때 읽어 둠(없으면 키 없음)
      consensus:          _rpMdConsensus(lines) || undefined,
    },
  };
}
