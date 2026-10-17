// 기업 분석 리포트 — DART 분석 탭 (lazy 로드·MD 딥파싱·사업섹션 파서·아코디언·업로드) (report.js에서 분할)

// ── DART 탭: lazy fetch + 펀드매니저 리포트 렌더 ─────────────────────────────
async function _rpLoadAndRenderDart(body) {
  if (!_rpStock) return;

  const { data, error } = await sb.from('dart_reports')
    .select('report_type,receive_date,raw_md,summary')
    .eq('stock_code', _rpStock.code)
    .order('receive_date', { ascending: false })
    .limit(1).maybeSingle();

  if (error || !data) {
    body.innerHTML = `
      <div style="padding:32px;text-align:center;color:var(--text2);font-size:calc(13px*var(--m-body))">
        <div style="margin-bottom:12px;font-size:calc(28px*var(--m-title))">📄</div>
        <div style="font-weight:600;margin-bottom:6px;font-size:calc(15px*var(--m-title))">DART 분석 리포트 없음</div>
        <div style="font-size:calc(12px*var(--m-sub));margin-bottom:16px">사업보고서 분석 MD 파일을 업로드하면 여기에 표시됩니다</div>
        <button onclick="document.getElementById('rp-dart-file').click()"
          style="padding:8px 18px;border:1px solid var(--tg);border-radius:var(--radius-sm);
            background:none;color:var(--tg);font-size:calc(13px*var(--m-body));cursor:pointer">DART 업로드</button>
      </div>`;
    return;
  }

  const s   = data.summary || {};
  const dp  = _mdDeepParse(data.raw_md || '');
  const M   = _rpDartModel(data.raw_md || '');
  const esc = escapeHtml;

  body.innerHTML = `
  <div style="display:flex;flex-direction:column;gap:18px">

  <!-- ① 리포트 헤더 ─────────────────────────────── -->
  <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:10px;
    padding-bottom:14px;border-bottom:2px solid color-mix(in srgb, var(--tg) 25%, transparent)">
    <div>
      <div style="font-size:calc(20px*var(--m-title));font-weight:800;color:var(--text1)">${esc(dp.stockName || _rpStock?.name || '')}</div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:4px;flex-wrap:wrap">
        <span style="font-size:calc(12px*var(--m-sub));color:var(--text2)">${esc(dp.stockCode || _rpStock?.code || '')}</span>
        <span style="font-size:calc(12px*var(--m-sub));padding:2px 9px;border-radius:100px;
          background:color-mix(in srgb, var(--tg) 12%, transparent);color:var(--tg);font-weight:600">${esc(data.report_type||'')}</span>
        <span style="font-size:calc(12px*var(--m-sub));color:var(--text2)">접수 ${esc(data.receive_date||'')}</span>
        ${dp.listedDate ? `<span style="font-size:calc(12px*var(--m-sub));color:var(--text2)">상장 ${esc(dp.listedDate)}</span>` : ''}
        ${dp.updated ? `<span style="font-size:calc(12px*var(--m-sub));color:var(--text2)">검토 ${esc(dp.updated)}</span>` : ''}
        ${dp.receiptNo ? `<a href="https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${dp.receiptNo}" target="_blank" rel="noopener"
          style="font-size:calc(12px*var(--m-sub));color:var(--tg);text-decoration:none">DART 원문 ↗</a>` : ''}
      </div>
    </div>
    <button onclick="document.getElementById('rp-dart-file').click()"
      style="padding:5px 12px;font-size:calc(11px*var(--m-label));border:1px solid var(--border);
        border-radius:var(--radius-sm);background:var(--bg3);color:var(--text2);cursor:pointer;white-space:nowrap">
      최신 업로드
    </button>
  </div>

  <!-- ② 종합판단 (1-3) -->
  ${_rpDartVerdict(M)}

  <!-- ③ 핵심 지표 (2-7 분기 추이·재고·4-6 수주 + 희석·보호예수·지분) -->
  ${_rpDartKpis(M, s)}

  <!-- ④ 투자 포인트 | 리스크 (1-1·1-2, 누르면 근거) ── -->
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:12px">
    ${_rpDartPoints('핵심 투자 포인트', M.points, s.investment_points || [], '#4ade80', '투자판단 항목 없음')}
    ${_rpDartPoints('주요 리스크', M.risks, s.risk_points || [], '#f87171', '리스크 항목 없음')}
  </div>

  <!-- ⑤ 분기 실적 추이 · ⑥ 증권사 전망 · ⑦ 보고기간 이후 이벤트 -->
  ${_rpDartTrend(M)}
  ${_rpDartEstimates(M)}
  ${_rpDartEvents(M)}

  <!-- ⑧ 기업 개요 | 주주 구조 ─────────────────── -->
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:12px">

    <!-- 기업 개요 -->
    <div style="${_RPD_CARD}">
      ${_rpdT('기업 개요')}
      <div style="display:flex;flex-direction:column;gap:6px">
        ${dp.mainBusiness ? `
          <div style="font-size:calc(12px*var(--m-sub));color:var(--text1);line-height:1.6;padding:8px;
            background:var(--bg3);border-radius:var(--radius-sm)">${esc(dp.mainBusiness)}</div>` : ''}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:4px">
          ${dp.established ? `<div style="font-size:calc(12px*var(--m-sub));color:var(--text1)">설립 <span style="color:var(--text1);font-weight:600">${esc(dp.established)}</span></div>` : ''}
          ${dp.listedDate  ? `<div style="font-size:calc(12px*var(--m-sub));color:var(--text1)">상장 <span style="color:var(--text1);font-weight:600">${esc(dp.listedDate)}</span></div>` : ''}
          ${dp.location    ? `<div style="font-size:calc(12px*var(--m-sub));color:var(--text1);grid-column:1/-1">소재 <span style="color:var(--text1)">${esc(dp.location)}</span></div>` : ''}
        </div>
      </div>
    </div>

    <!-- 주주 구조 -->
    <div style="${_RPD_CARD}">
      ${_rpdT('주주 구조')}
      <div style="display:flex;flex-direction:column;gap:6px">
        ${dp.majorShareholder ? `
          <div style="display:flex;justify-content:space-between;align-items:center;
            padding:7px 10px;background:var(--bg3);border-radius:var(--radius-sm)">
            <div>
              <div style="font-size:calc(13px*var(--m-body));font-weight:700;color:var(--text1)">${esc(dp.majorShareholder)}</div>
              <div style="font-size:calc(12px*var(--m-sub));color:var(--text1)">최대주주</div>
            </div>
            ${dp.majorShareholderRatio ? `<div style="font-size:calc(16px*var(--m-title));font-weight:800;color:var(--tg)">${esc(dp.majorShareholderRatio)}</div>` : ''}
          </div>` : ''}
        ${s.related_party_ratio ? `
          <div style="display:flex;justify-content:space-between;padding:6px 10px;
            font-size:calc(12px*var(--m-sub));color:var(--text1)">
            <span>최대주주+특수관계인</span>
            <span style="font-weight:700;color:var(--text1)">${s.related_party_ratio.toFixed(1)}%</span>
          </div>` : ''}
        ${s.lockup_ratio ? `
          <div style="display:flex;justify-content:space-between;padding:6px 10px;
            font-size:calc(12px*var(--m-sub));color:var(--text1)">
            <span>보호예수 (해제 ${esc(s.lockup_end||'-')})</span>
            <span style="font-weight:700;color:var(--text1)">${s.lockup_ratio.toFixed(1)}%</span>
          </div>` : ''}
        ${dp.majorShareholder ? `
          <!-- 지분율 바 -->
          ${(() => {
            const total = Math.min(s.related_party_ratio||0, 100);
            return `<div style="margin-top:4px">
              <div style="height:6px;border-radius:3px;background:var(--border);position:relative;overflow:hidden">
                <div style="position:absolute;left:0;top:0;height:100%;width:${total}%;
                  background:linear-gradient(90deg,var(--tg),color-mix(in srgb, var(--tg) 50%, transparent));border-radius:3px"></div>
              </div>
              <div style="display:flex;justify-content:space-between;margin-top:3px;font-size:calc(12px*var(--m-sub));color:var(--text1)">
                <span>0%</span><span style="color:var(--tg);font-weight:600">${total.toFixed(1)}%</span><span>100%</span>
              </div>
            </div>`;
          })()}` : ''}
      </div>
    </div>
  </div>

  <!-- ⑨ 계열사 현황 ───────────────────────────── -->
  ${dp.subsidiaries?.length ? `
  <div style="${_RPD_CARD}">
    ${_rpdT('계열사 현황')}
    ${_rpSubsContent(dp.subsidiaries, dp.subsidiarySummary)}
  </div>` : ''}

  <!-- ⑩ 섹션별 상세 분석 (아코디언) ─────────── -->
  <div>
    ${_rpdT('섹션별 상세 분석')}
    <div style="display:flex;flex-direction:column;gap:4px">
      ${_mdToAccordion(data.raw_md||'')}
    </div>
  </div>

  </div>`;
}

// ── DART 탭 화면 모델 — 생성기 MD의 소절·표에서 카드용 데이터를 한곳에서 읽음 ─────────────
// 소제목 이름('#### 분기별 추이' 등)에 기대므로 생성기 양식이 바뀌면 여기만 고친다.
// 못 찾은 항목은 null → 그 카드는 숨김(06월 생성분 옛 양식 MD는 대부분 null = 예전 화면 그대로)

const _RPD_CARD = 'background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px';
const _rpdT = (t, right) => typeof _rpSecT === 'function' ? _rpSecT(t, right || '') : `
  <div style="font-size:calc(13px*var(--m-body));font-weight:700;color:var(--text1);margin-bottom:10px">${t}</div>`;

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
// 억원 → '2,165억' / '1.49조'
const _rpEok = v => v == null ? '—' : Math.abs(v) >= 10000 ? `${(v / 10000).toFixed(2)}조` : `${Math.round(v).toLocaleString()}억`;
// '26.2Q' → 전년 같은 분기 '25.2Q'
const _rpPrevYearQ = p => { const m = String(p).match(/^(\d{2})\.(\d)Q$/); return m ? `${String(+m[1] - 1).padStart(2, '0')}.${m[2]}Q` : null; };
// 전년 동기 대비 — 둘 다 플러스면 증감률(상승 빨강·하락 파랑, 한국식), 부호가 바뀌면 흑자/적자전환
function _rpYoY(cur, prev) {
  if (cur == null || prev == null) return null;
  if (prev > 0 && cur > 0) {
    const p = (cur - prev) / prev * 100;
    return { text: `${p >= 0 ? '+' : ''}${p.toFixed(1)}%`, color: p >= 0 ? 'var(--red)' : 'var(--blue)' };
  }
  if (prev <= 0 && cur > 0) return { text: '흑자전환', color: 'var(--red)' };
  if (prev > 0 && cur <= 0) return { text: '적자전환', color: 'var(--blue)' };
  if (cur === prev) return { text: '적자지속', color: 'var(--text3)' };
  return cur > prev ? { text: '적자축소', color: 'var(--red)' } : { text: '적자확대', color: 'var(--blue)' };
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

  // 투자포인트·리스크: 굵은 제목 줄 + 그 아래 '- 근거/투자 의미/확인 조건'
  const items = sec => {
    if (!sec) return null;
    const list = [];
    for (const l of sec) {
      const b = l.trim().match(/^\*\*(.+)\*\*$/);
      if (b) list.push({ title: b[1].trim(), lines: [] });
      else if (list.length && /^[-*]\s+/.test(l)) list[list.length - 1].lines.push(l.replace(/^[-*]\s+/, '').trim());
    }
    return list;
  };
  out.points = items(_rpMdSec(L, /^### 1-1\./));
  out.risks  = items(_rpMdSec(L, /^### 1-2\./));

  // 분기 추이(2-7): 첫 열 항목명, 나머지 '23.1Q'… — 손익·현금흐름은 개별 분기, 재무상태는 분기말
  const tr = _rpMdFirstTable(_rpMdSec(L, /^#### 분기별 추이\s*$/));
  if (tr) {
    const row = re => { const r = tr.rows.find(r => re.test(r[0])); return r ? r.slice(1).map(_rpNum) : null; };
    const revenue = row(/^매출액/);
    out.trend = revenue && {
      periods: tr.hdr.slice(1), revenue,
      basis: tr.rows.find(r => /재무제표 기준/.test(r[0]))?.slice(1) || [],
      op: row(/^영업이익\(/), opm: row(/^영업이익률/), fcf: row(/^잉여현금흐름/), debt: row(/^부채비율/),
    };
  }

  // 재고 회전일수(2-7): '| 지표 | 2025.2Q | 2026.2Q | 변화 |'의 단분기 회전일수 행
  const inv = _rpMdFirstTable(_rpMdSec(L, /^#### 재고자산 회전율/));
  const invRow = inv?.rows.find(r => /^단분기 회전일수/.test(r[0]));
  out.invDays = invRow ? { prev: _rpNum(invRow[1]), cur: _rpNum(invRow[2]) } : null;

  // 수주잔고(4-6): 제목의 단위('백만원'·'천 USD' 등) + 합계 행(품목 하나면 그 행)
  const blIdx = L.findIndex(l => /^#### 수주잔고 추이/.test(l));
  if (blIdx >= 0) {
    const bt = _rpMdFirstTable(_rpMdSec(L, /^#### 수주잔고 추이/));
    const r = bt && (bt.rows.find(r => r[0] === '합계') || (bt.rows.length === 1 ? bt.rows[0] : null));
    if (r) out.backlog = { unit: (L[blIdx].match(/단위[:：]\s*([^)]+)\)/) || [])[1]?.trim() || '', periods: bt.hdr.slice(1), values: r.slice(1).map(_rpNum) };
  }

  // 증권사 전망: 영업이익(2-7)·매출(4-1) 추정 표 + 리포트 표(2-9)를 증권사·발행일로 합침
  const est = re => {
    const t = _rpMdFirstTable(_rpMdSec(L, re));
    return t ? { cols: t.hdr.slice(1), rows: t.rows.map(r => ({ ..._rpMdLinkCell(r[0]), vals: r.slice(1).map(_rpNum) })) } : null;
  };
  const estOp = est(/^#### 증권사 영업이익 추정/), estRev = est(/^#### 증권사 매출 추정/);
  const rsec = _rpMdSec(L, /^#### 증권사 리포트/) || [];
  const rt = _rpMdFirstTable(rsec);
  const reports = (rt?.rows || []).map(r => ({ ..._rpMdLinkCell(r[1]), date: r[0], opinion: r[2] || '', tp: r[3] || '', change: r[4] || '' }));
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
    if (m) attach(m[1], m[2], imp[i + 1]?.match(/^[-*]\s*검토의견[:：]\s*(.+)$/)?.[1] || null);
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
    events.push({ date: r.date, kind: '리포트', title: `${r.text} ${r.opinion}${tp}`, url: r.url, tag: '', scope: r.change,
      text: n?.headline ? `「${n.headline}」` : null, opinion: n?.review || null });
  }
  out.events = events.filter(e => /^\d{4}-\d{2}-\d{2}$/.test(e.date)).sort((a, b) => b.date.localeCompare(a.date));
  return out;
}

// ── DART 탭 카드 ─────────────────────────────────────────────────────────────

// ② 종합판단
function _rpDartVerdict(m) {
  if (!m.verdict) return '';
  return `<div style="${_RPD_CARD};border-left:3px solid var(--tg)">
    ${_rpdT('종합판단')}
    <div style="font-size:calc(13px*var(--m-body));color:var(--text);line-height:1.7;overflow-wrap:anywhere">${_rpMdInline(m.verdict)}</div>
    ${m.scope ? `<div style="font-size:calc(11px*var(--m-label));color:var(--text3);margin-top:6px;line-height:1.5;overflow-wrap:anywhere">${_rpMdInline(m.scope)}</div>` : ''}
  </div>`;
}

// ③ 핵심 지표 — 최신 분기와 전년 같은 분기 비교. 희석·보호예수·지분은 업로드 시 요약(summary)
function _rpDartKpis(m, s) {
  const esc = escapeHtml, tiles = [];
  const tile = (label, value, sub, subColor) => `
    <div style="padding:10px 12px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-sm);min-width:0">
      <div style="font-size:calc(11px*var(--m-label));color:var(--text2);margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${label}</div>
      <div style="font-size:calc(15px*var(--m-title));font-weight:800;color:var(--text);font-variant-numeric:tabular-nums;white-space:nowrap">${value}</div>
      ${sub ? `<div style="font-size:calc(11px*var(--m-label));color:${subColor || 'var(--text3)'};margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${sub}</div>` : ''}
    </div>`;
  const lastIdx = arr => { let i = (arr || []).length - 1; while (i >= 0 && arr[i] == null) i--; return i; };
  let asOf = '';
  const t = m.trend;
  if (t) {
    const li = lastIdx(t.revenue);
    if (li >= 0) {
      asOf = t.periods[li];
      const pi = t.periods.indexOf(_rpPrevYearQ(asOf));
      const at = (arr, i) => arr && i >= 0 ? arr[i] : null;
      const flow = (label, arr) => {
        const v = at(arr, li); if (v == null) return;
        const y = _rpYoY(v, at(arr, pi));
        tiles.push(tile(label, _rpEok(v), y ? `YoY ${y.text}` : '', y?.color));
      };
      const ratio = (label, arr) => {
        const v = at(arr, li); if (v == null) return;
        const p = at(arr, pi);
        tiles.push(tile(label, `${v.toFixed(2)}%`, p != null ? `전년 ${p.toFixed(2)}% · ${v - p >= 0 ? '+' : ''}${(v - p).toFixed(2)}%p` : ''));
      };
      flow('매출액', t.revenue); flow('영업이익', t.op); ratio('영업이익률', t.opm);
      flow('간이 FCF', t.fcf); ratio('부채비율', t.debt);
    }
  }
  const bl = m.backlog;
  const bi = bl ? lastIdx(bl.values) : -1;
  if (bi >= 0) {
    const toEok = { '백만원': 1e-2, '천원': 1e-5, '원': 1e-8, '억원': 1 }[bl.unit.replace(/\s/g, '')];
    const v = bl.values[bi], lab = bl.periods[bi], pi = bl.periods.indexOf(_rpPrevYearQ(lab));
    const y = _rpYoY(v, pi >= 0 ? bl.values[pi] : null);
    tiles.push(tile(`수주잔고${lab !== asOf ? ` (${esc(lab)})` : ''}`,
      toEok ? _rpEok(v * toEok) : `${Math.round(v).toLocaleString()} ${esc(bl.unit)}`, y ? `YoY ${y.text}` : '', y?.color));
  }
  const iv = m.invDays;
  if (iv?.cur != null) {
    const d = iv.prev != null ? iv.cur - iv.prev : null;
    tiles.push(tile('재고 회전일수', `${iv.cur.toFixed(1)}일`, d != null ? `전년 ${iv.prev.toFixed(1)}일 · ${d >= 0 ? '+' : ''}${d.toFixed(1)}일` : ''));
  }
  if (s.dilution_ratio != null)
    tiles.push(tile('주식 희석률', `${(+s.dilution_ratio).toFixed(2)}%`, s.dilution_ratio > 5 ? '잠재 물량 5% 초과' : '', 'var(--warn)'));
  if (s.lockup_ratio) tiles.push(tile('보호예수', `${(+s.lockup_ratio).toFixed(1)}%`, s.lockup_end ? `해제 ${esc(s.lockup_end)}` : ''));
  if (s.related_party_ratio) tiles.push(tile('최대주주+특관', `${(+s.related_party_ratio).toFixed(1)}%`, ''));
  if (!tiles.length) return '';
  return `<div>
    ${_rpdT('핵심 지표', asOf ? `${esc(asOf)} 기준 · YoY = 전년 같은 분기` : '')}
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:8px">${tiles.join('')}</div>
  </div>`;
}

// ④ 투자 포인트·리스크 — 신양식은 제목을 누르면 근거·투자 의미·확인 조건, 옛 양식은 요약 문장 목록
function _rpDartPoints(title, list, fallback, color, emptyText) {
  const box = inner => `<div style="background:var(--bg2);border:1px solid ${color}30;border-radius:var(--radius-sm);padding:14px">${inner}</div>`;
  if (list && list.length) {
    return box(_rpdT(title, '눌러서 근거 보기') + list.map(it => `
      <details style="margin-bottom:4px;background:${color}08;border-radius:var(--radius-sm);border-left:2px solid ${color}50">
        <summary style="cursor:pointer;padding:7px 10px;font-size:calc(13px*var(--m-body));color:var(--text1);line-height:1.6;overflow-wrap:anywhere">${_rpMdInline(it.title)}</summary>
        ${it.lines.length ? `<div style="padding:0 10px 9px 24px;display:flex;flex-direction:column;gap:3px">
          ${it.lines.map(l => `<div style="font-size:calc(12px*var(--m-sub));color:var(--text1);line-height:1.6;overflow-wrap:anywhere">${_rpMdLabeled(l)}</div>`).join('')}
        </div>` : ''}
      </details>`).join(''));
  }
  return box(_rpdT(title) + (fallback.length
    ? fallback.map(t => `
      <div style="display:flex;align-items:flex-start;gap:8px;padding:7px 10px;margin-bottom:4px;
        background:${color}08;border-radius:var(--radius-sm);border-left:2px solid ${color}50">
        <span style="font-size:calc(13px*var(--m-body));color:var(--text1);line-height:1.6">${_rpMdInline(t)}</span>
      </div>`).join('')
    : `<div style="font-size:calc(12px*var(--m-sub));color:var(--text2);padding:8px">${emptyText}</div>`));
}

// ⑤ 분기 실적 추이 — 매출·영업이익·간이 FCF를 항목별 작은 막대(각자 눈금, 0 기준선 위아래).
// 규모가 다른 값을 한 축에 겹치지 않음. 막대에 마우스를 올리면 그 분기 값 전부
function _rpDartTrend(m) {
  const t = m.trend;
  if (!t) return '';
  const P = t.periods, n = P.length;
  const tip = i => [P[i],
    t.revenue?.[i] != null && `매출 ${_rpEok(t.revenue[i])}`,
    t.op?.[i] != null && `영업이익 ${_rpEok(t.op[i])}`,
    t.opm?.[i] != null && `영업이익률 ${t.opm[i].toFixed(2)}%`,
    t.fcf?.[i] != null && `간이 FCF ${_rpEok(t.fcf[i])}`].filter(Boolean).join(' · ');
  const H = 64;
  const bars = (label, arr, colorOf) => {
    if (!arr || arr.every(v => v == null)) return '';
    const vals = arr.map(v => v ?? 0);
    const maxP = Math.max(0, ...vals), maxN = Math.max(0, ...vals.map(v => -v)), span = (maxP + maxN) || 1;
    const zero = Math.round(H * maxP / span);   // 위에서부터 0 기준선까지
    let li = arr.length - 1; while (li >= 0 && arr[li] == null) li--;
    const cols = arr.map((v, i) => {
      const h = v == null ? 0 : Math.max(v ? 2 : 0, Math.round(Math.abs(v) / span * H));
      const up = v != null && v >= 0;
      return `<div title="${escAttr(tip(i))}" style="flex:1;min-width:0;position:relative;height:${H}px">
        ${v == null ? '' : `<div style="position:absolute;left:14%;right:14%;height:${h}px;background:${colorOf(v)};
          ${up ? `bottom:${H - zero}px;border-radius:3px 3px 0 0` : `top:${zero}px;border-radius:0 0 3px 3px`};${i === li ? '' : 'opacity:.7'}"></div>`}
      </div>`;
    }).join('');
    return `<div style="margin-top:12px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:calc(11px*var(--m-label));color:var(--text2);margin-bottom:4px">
        <span>${label}</span>
        ${li >= 0 ? `<span style="white-space:nowrap">${escapeHtml(P[li])} <b style="color:var(--text1)">${_rpEok(arr[li])}</b></span>` : ''}
      </div>
      <div style="position:relative;display:flex;gap:2px">
        ${cols}
        <div style="position:absolute;left:0;right:0;top:${zero}px;border-top:1px solid var(--border2);pointer-events:none"></div>
      </div>
    </div>`;
  };
  const labels = P.map((p, i) => {
    const q = p.match(/^(\d{2})\.(\d)Q$/);
    return `<div style="flex:1;min-width:0;text-align:center;font-size:calc(10px*var(--m-label));line-height:1.25;
      color:${i === n - 1 ? 'var(--tg)' : 'var(--text3)'}">${q ? `${q[2] === '1' || i === 0 ? q[1] : '&nbsp;'}<br>${q[2]}Q` : escapeHtml(p)}</div>`;
  }).join('');
  const sign = v => v >= 0 ? 'var(--red)' : 'var(--blue)';
  const mixed = new Set(t.basis.filter(Boolean)).size > 1;
  return `<div style="${_RPD_CARD}">
    ${_rpdT('분기 실적 추이', '단위 억원 · 개별 분기 · 막대에 올리면 값')}
    ${bars('매출액', t.revenue, () => 'var(--tg)')}
    ${bars('영업이익', t.op, sign)}
    ${bars('간이 FCF (영업현금흐름 − 유형·무형자산 취득)', t.fcf, sign)}
    <div style="display:flex;gap:2px;margin-top:4px">${labels}</div>
    ${mixed ? `<div style="font-size:calc(11px*var(--m-label));color:var(--text3);margin-top:6px">연결·별도 기준이 바뀐 분기가 있어 단순 비교에 유의</div>` : ''}
  </div>`;
}

// ⑥ 증권사 전망 — 증권사별 발행 당시 의견·목표주가·매출/영업이익 추정(억원)
function _rpDartEstimates(m) {
  const B = m.brokers;
  if (!B || !B.length) return '';
  const esc = escapeHtml, cols = m.estCols;
  const hasRev = B.some(b => Object.values(b.rev).some(v => v != null));
  const num = v => v == null ? '—' : Math.round(v).toLocaleString();
  // 첫 열(증권사) 고정 — 좁은 화면에서 추정 열을 가로로 넘겨도 어느 증권사인지 보이게
  const stick = 'position:sticky;left:0;z-index:1;background:inherit;';
  const th = (t, al, st) => `<th style="${st || ''}padding:6px 8px;text-align:${al || 'left'};color:var(--text2);font-weight:600;border-bottom:1px solid var(--border);white-space:nowrap;vertical-align:bottom">${t}</th>`;
  const td = (v, al, st) => `<td style="${st || ''}padding:6px 8px;text-align:${al || 'left'};border-bottom:1px solid var(--border);vertical-align:top;font-variant-numeric:tabular-nums">${v}</td>`;
  const head = `<tr style="background:var(--bg3)">${th('증권사 · 발행일', 'left', stick)}${th('의견')}${th('목표주가', 'right')}
    ${cols.map(c => th(`${esc(c)}<div style="font-weight:400;color:var(--text3);font-size:calc(10px*var(--m-label))">${hasRev ? '매출 / 영업이익' : '영업이익'}</div>`, 'right')).join('')}</tr>`;
  const rows = B.map(b => {
    const url = safeUrl(b.url);
    const name = url ? `<a href="${escAttr(url)}" target="_blank" rel="noopener" style="color:var(--text1);font-weight:600;text-decoration:none">${esc(b.broker)} <span style="color:var(--tg)">↗</span></a>`
                     : `<span style="color:var(--text1);font-weight:600">${esc(b.broker)}</span>`;
    return `<tr style="background:var(--bg2)">
      ${td(`${name}<div style="font-size:calc(11px*var(--m-label));color:var(--text3)">${esc(b.date || '')}</div>`, 'left', stick)}
      ${td(`<span style="color:var(--text1)">${esc(b.opinion || '—')}</span>`)}
      ${td(`<span style="color:var(--text1);white-space:nowrap">${esc(b.tp || '—')}</span>${b.change ? `<div style="font-size:calc(11px*var(--m-label));color:var(--text3);white-space:nowrap">${esc(b.change)}</div>` : ''}`, 'right')}
      ${cols.map(c => td(`${hasRev ? `<div style="color:var(--text1)">${num(b.rev[c])}</div>` : ''}<div style="color:${hasRev ? 'var(--text2)' : 'var(--text1)'}">${num(b.op[c])}</div>`, 'right')).join('')}
    </tr>`;
  }).join('');
  // 참고: 공시 분기 합(전년 4개 분기 완비 시) · 올해 누적 — 연간 추정과 비교용
  let ref = '';
  const t = m.trend;
  if (t) {
    const yy = t.periods.map(p => p.match(/^(\d{2})\.\dQ$/)?.[1]).filter(Boolean);
    const last = yy[yy.length - 1];
    const sumY = (arr, y) => {
      const idx = t.periods.map((p, i) => p.startsWith(`${y}.`) ? i : -1).filter(i => i >= 0);
      const vals = idx.map(i => arr?.[i]).filter(v => v != null);
      return { n: idx.length, ok: vals.length === idx.length && idx.length > 0, sum: vals.reduce((a, b) => a + b, 0) };
    };
    const parts = [];
    if (last) {
      const py = String(+last - 1).padStart(2, '0');
      const pr = sumY(t.revenue, py), po = sumY(t.op, py);
      if (pr.ok && pr.n === 4) parts.push(`20${py}년 매출 ${_rpEok(pr.sum)}${po.ok ? ` · 영업이익 ${_rpEok(po.sum)}` : ''}`);
      const cr = sumY(t.revenue, last), co = sumY(t.op, last);
      if (cr.ok && cr.n < 4) parts.push(`20${last}년 1~${cr.n}분기 매출 ${_rpEok(cr.sum)}${co.ok ? ` · 영업이익 ${_rpEok(co.sum)}` : ''}`);
    }
    if (parts.length) ref = `참고(공시 분기 합): ${parts.join(' / ')}`;
  }
  return `<div style="${_RPD_CARD}">
    ${_rpdT('증권사 전망', '발행 당시 추정 · 컨센서스 아님 · 단위 억원')}
    <div style="overflow-x:auto;border:1px solid var(--border);border-radius:var(--radius-sm)">
      <table style="width:100%;border-collapse:collapse;font-size:calc(12px*var(--m-sub))"><thead>${head}</thead><tbody>${rows}</tbody></table>
    </div>
    ${ref ? `<div style="font-size:calc(11px*var(--m-label));color:var(--text3);margin-top:6px">${ref}</div>` : ''}
  </div>`;
}

// ⑦ 보고기간 이후 이벤트 — 공시·리포트·뉴스 최근 순. 제목만 점검한 공시는 흐리게
function _rpDartEvents(m) {
  const E = m.events;
  if (!E || !E.length) return '';
  const esc = escapeHtml;
  const KC = { '공시': 'var(--tg)', '리포트': 'var(--warn)', '뉴스': 'var(--text2)' };
  const row = e => {
    const url = safeUrl(e.url), dim = /^제목 점검$/.test(e.scope);
    const title = `<span style="color:${dim ? 'var(--text2)' : 'var(--text1)'}">${esc(e.title)}</span>${url ? ' <span style="color:var(--tg)">↗</span>' : ''}`;
    const c = KC[e.kind] || 'var(--text2)';
    return `<div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
      <div style="flex-shrink:0;width:76px;font-size:calc(11px*var(--m-label));color:var(--text2);font-variant-numeric:tabular-nums">
        ${esc(e.date)}
        <div style="margin-top:3px"><span style="display:inline-block;padding:0 7px;border-radius:100px;font-size:calc(10px*var(--m-label));font-weight:600;
          background:color-mix(in srgb, ${c} 14%, transparent);color:${c}">${esc(e.kind)}</span></div>
      </div>
      <div style="min-width:0;flex:1">
        <div style="font-size:calc(12px*var(--m-sub));font-weight:600;line-height:1.5;overflow-wrap:anywhere">
          ${url ? `<a href="${escAttr(url)}" target="_blank" rel="noopener" style="text-decoration:none">${title}</a>` : title}
          ${e.tag ? `<span style="font-weight:400;font-size:calc(11px*var(--m-label));color:var(--text3);margin-left:4px">${esc(e.tag)}</span>` : ''}
          ${e.scope ? `<span style="font-weight:400;font-size:calc(11px*var(--m-label));color:var(--text3);margin-left:4px">· ${esc(e.scope)}</span>` : ''}
        </div>
        ${e.text ? `<div style="font-size:calc(12px*var(--m-sub));color:var(--text1);line-height:1.6;margin-top:2px;overflow-wrap:anywhere">${_rpMdInline(e.text)}</div>` : ''}
        ${e.opinion ? `<details style="margin-top:2px">
          <summary style="cursor:pointer;font-size:calc(11px*var(--m-label));color:var(--tg)">자체 검토</summary>
          <div style="font-size:calc(12px*var(--m-sub));color:var(--text2);line-height:1.6;margin-top:2px;overflow-wrap:anywhere">${_rpMdInline(e.opinion)}</div>
        </details>` : ''}
      </div>
    </div>`;
  };
  const N = 6, rest = E.slice(N);
  return `<div style="${_RPD_CARD}">
    ${_rpdT('보고기간 이후 이벤트', m.eventRange ? `${esc(m.eventRange)} · 공시·리포트·뉴스` : '공시·리포트·뉴스')}
    ${E.slice(0, N).map(row).join('')}
    ${rest.length ? `<details style="margin-top:6px">
      <summary style="cursor:pointer;font-size:calc(12px*var(--m-sub));color:var(--tg);padding:4px 0">이전 ${rest.length}건 더 보기</summary>
      ${rest.map(row).join('')}
    </details>` : ''}
  </div>`;
}

// ── MD 깊은 파싱 (렌더 전용) ──────────────────────────────────────────────────
function _mdDeepParse(md) {
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

  // 2-4 계열회사 (단위: 천원) — 관계·지분율·역할·국가·매출·순손익·자본·자산·부채·검토의견
  const subSec = subLines('2-4', sec2);
  const subsidiaries = [];
  const num천 = (s, kw) => {  // "kw 1,462천원" / "kw -143,014천원" → 정수(천원 그대로), 없으면 null
    const m = (s || '').match(new RegExp(kw + '\\s*(-?[\\d,]+)\\s*천원'));
    return m ? parseInt(m[1].replace(/,/g, ''), 10) : null;
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
    const netM = l.match(/순(이익|손실)\s*(-?[\d,]+)\s*천원/);
    if (netM) cur.netIncome = parseInt(netM[2].replace(/,/g, ''), 10) * (netM[1] === '손실' ? -1 : 1);
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

  return {
    stockCode, stockName, receiptNo, updated,
    mainBusiness,
    established: lv('설립일', basic),
    listedDate:  lv('상장일', basic),
    location:    lv('소재지', basic),
    subsidiaries,
    subsidiarySummary,
    majorShareholder,
    majorShareholderRatio,
  };
}

// ── 계열사 현황 상세 렌더 (2-4 파싱결과 공용 — 기업개요 탭·DART 탭) · 단위 천원 ──
function _rpSubsContent(subs, summary) {
  const esc = typeof escapeHtml === 'function' ? escapeHtml : (v => v ?? '');
  if (!subs || !subs.length) return '';
  const fmtKW = v => {  // v: 천원 → 억/만/원
    if (v == null) return '—';
    const won = v * 1000, abs = Math.abs(won), sg = won < 0 ? '-' : '';
    if (abs >= 1e12) return sg + (abs / 1e12).toFixed(1) + '조';
    if (abs >= 1e8)  return sg + (abs / 1e8).toFixed(1) + '억';
    if (abs >= 1e4)  return sg + Math.round(abs / 1e4).toLocaleString() + '만';
    if (abs === 0)   return '0';
    return sg + Math.round(abs).toLocaleString() + '원';
  };
  const relColor = r => /종속/.test(r || '') ? '#2AABEE' : /관계|공동/.test(r || '') ? '#a78bfa' : 'var(--text2)';

  // 요약 스트립
  let summaryHTML = '';
  if (summary && (summary.count || summary.revenueSum || summary.lossCount || summary.financeCheck)) {
    const chip = (label, val, col) => val ? `<span style="display:inline-flex;align-items:baseline;gap:4px">
      <span style="color:var(--text3)">${label}</span><b style="color:${col || 'var(--text1)'}">${esc(val)}</b></span>` : '';
    summaryHTML = `<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:baseline;font-size:calc(11px*var(--m-label));margin-bottom:10px;
      padding:8px 11px;background:var(--bg3);border-radius:var(--radius-sm)">
      ${chip('계열사', summary.count)}${chip('매출합계', summary.revenueSum)}${chip('손실', summary.lossCount, '#f5a623')}
      ${summary.financeCheck ? `<span style="color:#ef4444;flex-basis:100%;line-height:1.5">⚠ ${esc(summary.financeCheck)}</span>` : ''}</div>`;
  }

  // ── 단일 표 렌더 ──────────────────────────────────────────────────────────
  const th = (label, align) => `<th style="padding:7px 9px;text-align:${align || 'left'};color:var(--text2);
    font-weight:600;border-bottom:1px solid var(--border);white-space:nowrap">${label}</th>`;
  const td = (v, align, col, bold) => `<td style="padding:7px 9px;text-align:${align || 'left'};
    border-bottom:1px solid var(--border);color:${col || 'var(--text1)'};${bold ? 'font-weight:700;' : ''}
    font-variant-numeric:tabular-nums">${v}</td>`;
  const COLS = 11;

  // 3곳 이상·절반 이상이 같은 검토의견이면 표 위에 한 번만(원익IPS는 6곳 중 5곳이 같은 문장이었음)
  const opCount = {};
  subs.forEach(s => { if (s.opinion) opCount[s.opinion] = (opCount[s.opinion] || 0) + 1; });
  const common = Object.keys(opCount).find(o => opCount[o] >= 3 && opCount[o] * 2 >= subs.length) || null;
  if (common) summaryHTML += `<div style="font-size:calc(11px*var(--m-label));color:var(--text3);line-height:1.55;margin:-4px 0 10px">
    <span style="color:var(--text2)">공통 검토의견 (${opCount[common]}곳)</span> · ${esc(common)}</div>`;

  const rows = subs.map(s => {
    const insolvent = (s.note && s.note.includes('자본잠식')) || (s.equity != null && s.equity < 0);
    const isLoss = s.netIncome != null && s.netIncome < 0;
    const rc = relColor(s.relation);
    const badge = insolvent
      ? `<span style="font-size:calc(10px*var(--m-label));padding:1px 7px;border-radius:100px;background:#ef444420;color:#ef4444;font-weight:700">자본잠식</span>`
      : isLoss
      ? `<span style="font-size:calc(10px*var(--m-label));padding:1px 7px;border-radius:100px;background:#f5a62320;color:#f5a623;font-weight:700">순손실</span>`
      : `<span style="font-size:calc(10px*var(--m-label));padding:1px 7px;border-radius:100px;background:#4ade8020;color:#4ade80;font-weight:700">정상</span>`;
    const debtRatio = (s.equity != null && s.equity > 0 && s.liabilities != null) ? (s.liabilities / s.equity * 100) : null;
    const rowBg = insolvent ? 'background:#ef44440a' : '';
    return `<tr style="${rowBg}">
      ${td(esc(s.name), 'left', 'var(--text1)', true)}
      ${td(s.relation ? `<span style="font-size:calc(10px*var(--m-label));padding:1px 6px;border-radius:100px;background:${rc}1f;color:${rc};font-weight:600">${esc(s.relation)}</span>` : '—', 'left')}
      ${td(s.ownership ? esc(s.ownership) : '—', 'right')}
      ${td(s.country ? esc(s.country) : '—', 'center', 'var(--text2)')}
      ${td(s.role ? esc(s.role) : '—', 'left', 'var(--text2)')}
      ${td(s.revenue != null ? fmtKW(s.revenue) : '—', 'right')}
      ${td(s.netIncome != null ? fmtKW(s.netIncome) : '—', 'right', s.netIncome == null ? 'var(--text3)' : isLoss ? 'var(--blue)' : 'var(--red)', true)}
      ${td(s.equity != null ? fmtKW(s.equity) : '—', 'right', s.equity != null && s.equity < 0 ? '#ef4444' : 'var(--text1)')}
      ${td(s.assets != null ? fmtKW(s.assets) : '—', 'right', 'var(--text2)')}
      ${td(s.liabilities != null ? fmtKW(s.liabilities) : '—', 'right', 'var(--text2)')}
      ${td(debtRatio != null ? Math.round(debtRatio).toLocaleString() + '%' : '—', 'right', debtRatio != null && debtRatio > 200 ? '#f5a623' : 'var(--text1)')}
      ${td(badge, 'center')}
    </tr>${s.opinion && s.opinion !== common ? `<tr style="${rowBg}"><td colspan="${COLS + 1}" style="padding:2px 9px 9px;border-bottom:1px solid var(--border);
      font-size:calc(11px*var(--m-label));color:var(--text3);line-height:1.55;white-space:normal">
      <span style="color:var(--text2)">검토의견</span> · ${esc(s.opinion)}</td></tr>` : ''}`;
  }).join('');

  return summaryHTML + `<div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:calc(12px*var(--m-sub));white-space:nowrap">
      <thead><tr style="background:var(--bg3)">
        ${th('계열사')}${th('관계')}${th('지분', 'right')}${th('국가', 'center')}${th('역할')}
        ${th('매출', 'right')}${th('순손익', 'right')}${th('자본', 'right')}${th('자산', 'right')}${th('부채', 'right')}${th('부채비율', 'right')}${th('상태', 'center')}
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
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
  const getSectionTable = h3 => {
    const sec = sectionLines(h3);
    for (let i = 1; i < sec.length; i++) {
      if (!/^\|/.test(sec[i]) || /^\|/.test(sec[i - 1])) continue;   // 표의 첫 줄에서만 시작
      const tbl = [];
      for (let j = i; j < sec.length && /^\|/.test(sec[j]); j++)
        if (!/^\|[-:\s|]+$/.test(sec[j])) tbl.push(sec[j]);
      if (tbl.length && parseRow(tbl[0]).some(h => parsePeriod(h))) { tbl.uf = unitFactor(sec.slice(0, i)); return tbl; }
    }
    return [];
  };

  // 소제목(#### 생산능력 추이 등) 다음의 '첫 번째 연속 표'만 추출 — 한 섹션에 표 여러 개일 때 분리용.
  // 4장 안의 제목 줄에서만 찾음(요약 본문에 같은 낱말이 나와도 무시), 표 없이 다음 제목이 나오면 빈 값(다른 절 표를 집지 않음)
  const sec4 = Math.max(0, lines.findIndex(l => /^## 4\./.test(l)));
  const firstTableAfter = kw => {
    const h = lines.findIndex((l, j) => j >= sec4 && /^#{2,6}\s/.test(l) && l.includes(kw));
    if (h < 0) return [];
    let i = h + 1;
    for (; i < lines.length && !/^\s*\|/.test(lines[i]); i++)
      if (/^#{2,6}\s/.test(lines[i])) return [];
    const tbl = [];
    tbl.uf = unitFactor(lines.slice(h, i));   // 제목 '(단위: 백만원)' 또는 제목~표 사이 줄
    while (i < lines.length && /^\s*\|/.test(lines[i])) {
      const t = lines[i].trim();
      if (!/^\|[-:\s|]+$/.test(t)) tbl.push(t);
      i++;
    }
    return tbl;
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

// ── MD → 아코디언 섹션 HTML ───────────────────────────────────────────────────
// 섹션(## )마다 헤더만 먼저 그리고 본문은 처음 펼칠 때 렌더(RPD.secs) — 원익IPS MD를 한 번에 그리면 DOM 13.8만 노드였음

// DART 탭 상태 — 상세 분석 섹션 원문 줄
const RPD = { secs: [] };

// 원자료 덤프(원문 변환본·원문 XML·API JSON = 5~7장)는 화면·저장에서 뺀다 — 원익IPS 기준 MD 6MB의 98%·DOM의 92%.
// 분석(1~4장)·변경사항(8장~)만 남기고 원문은 헤더의 'DART 원문' 링크로 대신함. 코드블록 안의 '## '는 제목으로 보지 않음.
// 옛 양식(06월 생성분)은 5장 안에 '## 원문 XML: 접수번호.xml'이 따로 ## 제목으로 있음
const _RPD_RAW_SEC = /^##\s+(?:\d+\.\s*(?:보고서 원문 전체 변환|재무정보 전체|정기보고서 주요정보 전체)|원문 XML:.*)\s*$/;
const _rpFenceClose = open => new RegExp(`^${open[0] === '`' ? '`' : '~'}{${open.length},}\\s*$`);
function _rpStripRawSections(md) {
  const out = [];
  let skip = false, close = null;
  for (const line of (md || '').split('\n')) {
    const t = line.trim();
    if (close) { if (close.test(t)) close = null; }
    else if (/^(`{3,}|~{3,})/.test(t)) close = _rpFenceClose(t.match(/^(`{3,}|~{3,})/)[1]);
    else if (/^## /.test(line)) skip = _RPD_RAW_SEC.test(t);
    if (!skip) out.push(line);
  }
  return out.join('\n');
}

// 인라인: [글](url) → 원문 칩(safeUrl 통과분만), **굵게**, `코드`, <br>, [공시 확인]·[증권사 전망] 태그.
// \[ \] \* \| 같은 마크다운 이스케이프는 글자 그대로 — 자리표시로 잠시 빼 둬서 굵게·태그로 오인하지 않게 함
// (공시 제목 '[분기별공시(개별회사용)]'처럼 대괄호가 든 링크 글자가 생성기에서 \[ \]로 나옴)
const _RPD_ESC = /\\([\\`*_{}\[\]()#+\-.!|])/g;
const _rpMdText = s => escapeHtml(s.replace(_RPD_ESC, (m, c) => `\u0002${c.charCodeAt(0)}\u0003`))
  .replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--text)">$1</strong>')
  .replace(/`([^`]+)`/g, '<code style="background:var(--bg3);padding:1px 4px;border-radius:3px;font-size:calc(11px*var(--m-label))">$1</code>')
  .replace(/&lt;br\s*\/?&gt;/gi, '<br>')
  .replace(/\[((?:공시|증권사|회사|언론|자체)[^\[\]]{0,12})\]/g, (m, tag) => {
    const c = /전망|추정/.test(tag) ? 'var(--warn)' : 'var(--tg)';
    return `<span style="display:inline-block;padding:0 7px;margin-left:2px;border-radius:100px;font-size:calc(10px*var(--m-label));font-weight:600;vertical-align:1px;white-space:nowrap;background:color-mix(in srgb, ${c} 14%, transparent);color:${c}">${tag}</span>`;
  })
  .replace(/\u0002(\d+)\u0003/g, (m, c) => escapeHtml(String.fromCharCode(+c)));
function _rpMdInline(s) {
  const re = /\[((?:\\.|[^\]\\\n])+)\]\((https?:\/\/[^)\s]+)\)/g;   // 링크 글자 안의 \] 허용
  let html = '', last = 0, m;
  while ((m = re.exec(s))) {
    html += _rpMdText(s.slice(last, m.index));
    const url = safeUrl(m[2]);
    html += url
      ? `<a href="${escAttr(url)}" target="_blank" rel="noopener" style="display:inline-block;padding:0 7px;margin:0 2px;border-radius:100px;font-size:calc(11px*var(--m-label));line-height:1.6;white-space:nowrap;text-decoration:none;vertical-align:1px;background:color-mix(in srgb, var(--tg) 12%, transparent);color:var(--tg)">${escapeHtml(m[1].replace(_RPD_ESC, '$1'))} ↗</a>`
      : _rpMdText(m[0]);
    last = re.lastIndex;
  }
  return html + _rpMdText(s.slice(last));
}

// '라벨: 내용' 줄은 라벨만 굵게. 투자판단·리스크·검토의견·중요도는 라벨에 의미색(예전엔 줄 전체를 칠해 긴 문단이 읽기 힘들었음)
const _RPD_KEY = { '투자판단': 'var(--green)', '리스크': 'var(--danger)', '검토의견': 'var(--tg)', '중요도': 'var(--warn)' };
function _rpMdLabeled(t) {
  const m = t.match(/^([^:：\[\]()*`|]{1,16}?)\s*[:：](?:\s+(.*))?$/);
  if (!m) return _rpMdInline(t);
  const col = _RPD_KEY[m[1].trim()];
  return `<b style="color:${col || 'var(--text)'};font-weight:${col ? 700 : 600}">${escapeHtml(m[1].trim())}</b> ${_rpMdInline(m[2] || '')}`;
}

// 숫자 칸(정렬 미지정 열의 자동 우측 정렬용): 1,234 / -12.5% / (3,000) / +1.3%p / 6,345.90억원 / 3,225,945주
const _RPD_NUM = /^[-+]?\(?[\d,]*\.?\d+\)?\s*(%p?|원|억원|억|조원|조|백만원|천원|만원|주|대|회|일|배|개사|개|명)?$/;
function _rpMdTable(tableLines) {
  const cells = _rpMdCells;
  const isSep = l => /^\|[-:\s|]+$/.test(l);
  const sep = tableLines.find(isSep);
  const align = sep ? cells(sep).map(c => /^:-+:$/.test(c) ? 'center' : /^-+:$/.test(c) ? 'right' : /^:-+$/.test(c) ? 'left' : null) : [];
  const rows = tableLines.filter(l => !isSep(l));
  if (!rows.length) return '';
  const hdr = cells(rows[0]);
  const body = rows.slice(1).map(cells);
  // 열이 많은 표(분기 추이 등)는 내용 폭대로 펼쳐 가로 스크롤 + 첫 열 고정 — 100% 폭에 욱여넣으면 항목명이 한 글자씩 줄바꿈됐음
  const wide = hdr.length > 5;
  const stick = wide ? 'position:sticky;left:0;z-index:1;min-width:88px;max-width:180px;white-space:normal;' : '';
  // 정렬 미지정 열은 값의 60% 이상이 숫자일 때만 우측 정렬(열 단위) — 칸마다 판정하면 '항목|값' 표가 들쭉날쭉해짐
  const auto = hdr.map((_, k) => {
    const vals = body.map(r => r[k]).filter(v => v && v !== '-');
    return vals.length && vals.filter(v => _RPD_NUM.test(v)).length / vals.length >= 0.6 ? 'right' : 'left';
  });
  const al = k => align[k] || auto[k];
  return `<div style="overflow-x:auto;margin:4px 0;border:1px solid var(--border);border-radius:var(--radius-sm)">
    <table style="${wide ? 'width:max-content;min-width:100%' : 'width:100%'};border-collapse:collapse;font-size:calc(12px*var(--m-sub));font-variant-numeric:tabular-nums">
      <thead><tr style="background:var(--bg3)">
        ${hdr.map((h, k) => `<th style="${k === 0 ? stick : ''}background:inherit;padding:5px 8px;text-align:${al(k)};font-weight:600;color:var(--text1);
          border-bottom:1px solid var(--border);white-space:nowrap">${_rpMdInline(h)}</th>`).join('')}
      </tr></thead>
      <tbody>
        ${body.map((r, ri) => `<tr style="background:${ri % 2 ? 'color-mix(in srgb, var(--bg3) 55%, var(--bg2))' : 'var(--bg2)'}">
          ${r.map((c, k) => { const a = al(k); return `<td style="${k === 0 ? stick : ''}background:inherit;padding:4px 8px;text-align:${a};color:var(--text1);
            border-bottom:1px solid var(--border);line-height:1.5;${a === 'right' ? 'white-space:nowrap;' : wide && k ? 'max-width:320px;' : ''}">${_rpMdInline(c)}</td>`; }).join('')}
        </tr>`).join('')}
      </tbody>
    </table></div>`;
}

// 섹션 본문 줄 → HTML
function _rpMdBlocks(lines) {
  let html = '', i = 0;
  const text = 'font-size:calc(12px*var(--m-sub));color:var(--text1);line-height:1.6;min-width:0;overflow-wrap:anywhere';
  while (i < lines.length) {
    const line = lines[i].trimEnd();
    const t = line.trim();

    const fm = t.match(/^(`{3,}|~{3,})/);
    if (fm) {   // 코드블록 — 높이 제한 스크롤 상자
      const close = _rpFenceClose(fm[1]), body = [];
      for (i++; i < lines.length && !close.test(lines[i].trim()); i++) body.push(lines[i]);
      i++;
      html += `<pre style="margin:4px 0;padding:8px 10px;max-height:320px;overflow:auto;background:var(--bg3);border-radius:var(--radius-sm);
        font-size:calc(11px*var(--m-label));color:var(--text2);white-space:pre">${escapeHtml(body.join('\n'))}</pre>`;
      continue;
    }

    const h = line.match(/^(#{3,6})\s+(.*)$/);
    if (h) {
      const n = h[1].length, title = _rpMdInline(h[2].trim());
      html += n === 3
        ? `<div style="font-size:calc(12px*var(--m-sub));font-weight:700;color:var(--tg);margin-top:10px;margin-bottom:4px;padding-bottom:3px;border-bottom:1px solid var(--border2)">${title}</div>`
        : n === 4
        ? `<div style="font-size:calc(12px*var(--m-sub));font-weight:700;color:var(--text1);margin-top:6px">${title}</div>`
        : `<div style="font-size:calc(11px*var(--m-label));font-weight:600;color:var(--text2);margin-top:4px">${title}</div>`;
      i++; continue;
    }
    if (/^---+$/.test(t)) { i++; continue; }

    // 생성기의 접기 블록(<details>/<summary> 줄 단독)만 실제 태그로 — 그 외 HTML은 글자로 이스케이프
    if (t === '<details>') { html += `<details style="margin:2px 0">`; i++; continue; }
    if (t === '</details>') { html += `</details>`; i++; continue; }
    const sm = t.match(/^<summary>(.*)<\/summary>$/);
    if (sm) { html += `<summary style="cursor:pointer;font-size:calc(11px*var(--m-label));color:var(--text2);padding:2px 0">${_rpMdInline(sm[1])}</summary>`; i++; continue; }

    if (/^\|/.test(line)) {
      const tbl = [];
      while (i < lines.length && /^\|/.test(lines[i].trimEnd())) { tbl.push(lines[i].trimEnd()); i++; }
      html += _rpMdTable(tbl);
      continue;
    }

    const li = line.match(/^(\s*)[-*]\s+(.*)$/);
    if (li) {   // 들여쓴 목록(대표 경력 등)은 단계별 들여쓰기
      const lv = Math.min(3, Math.floor(li[1].replace(/\t/g, '  ').length / 2));
      html += `<div style="display:flex;align-items:flex-start;gap:6px;padding:1px 0 1px ${lv * 16}px">
        <span style="color:var(--text2);font-size:calc(11px*var(--m-label));margin-top:5px;flex-shrink:0">${lv ? '·' : '◦'}</span>
        <span style="${text}">${_rpMdLabeled(li[2].trim())}</span>
      </div>`;
      i++; continue;
    }

    if (!t) { i++; continue; }
    const bold = t.match(/^\*\*(.+)\*\*$/);   // 굵은 제목 줄(투자포인트·리스크 항목 등)
    html += bold
      ? `<div style="font-size:calc(13px*var(--m-body));font-weight:700;color:var(--text);margin-top:8px;overflow-wrap:anywhere">${_rpMdInline(bold[1])}</div>`
      : `<div style="${text}">${_rpMdLabeled(t)}</div>`;
    i++;
  }
  return html;
}

function _mdToAccordion(md) {
  const src = md || '';
  const kept = _rpStripRawSections(src);
  RPD.secs = [];
  let close = null;
  for (const line of kept.split('\n')) {
    const t = line.trim();
    if (close) { if (close.test(t)) close = null; }
    else if (/^(`{3,}|~{3,})/.test(t)) close = _rpFenceClose(t.match(/^(`{3,}|~{3,})/)[1]);
    else if (/^## /.test(line)) { RPD.secs.push({ title: t.replace(/^##\s+/, ''), lines: [] }); continue; }
    if (RPD.secs.length) RPD.secs[RPD.secs.length - 1].lines.push(line);   // 첫 ## 이전(# 제목)은 버림
  }
  const html = RPD.secs.map((s, i) => `
    <div style="border:1px solid var(--border);border-radius:var(--radius-sm);overflow:hidden">
      <div onclick="rpDartAcc(${i})"
        style="padding:9px 14px;background:var(--bg2);cursor:pointer;display:flex;
          align-items:center;gap:8px;font-size:calc(13px*var(--m-body));font-weight:700;color:var(--text1);user-select:none">
        <span id="dac-l-${i}" style="font-size:calc(11px*var(--m-label));color:var(--text2);width:12px">▶</span>
        ${escapeHtml(s.title)}
      </div>
      <div id="dac-${i}" style="display:none;padding:12px 14px"></div>
    </div>`).join('');
  const note = kept.length < src.length
    ? `<div style="font-size:calc(11px*var(--m-label));color:var(--text3);padding:4px 2px">원문 변환본·원문 XML·API 원자료(5~7장)는 화면에서 뺐습니다 — 위 'DART 원문' 링크에서 확인</div>`
    : '';
  return html + note;
}

// 아코디언 펼침/접힘 — 처음 펼칠 때 본문 렌더
function rpDartAcc(i) {
  toggleSection(`dac-${i}`, `dac-l-${i}`, ['▼', '▶'], () => {
    const el = document.getElementById(`dac-${i}`);
    if (!el || el.dataset.r || !RPD.secs[i]) return;
    el.innerHTML = `<div style="display:flex;flex-direction:column;gap:6px">${_rpMdBlocks(RPD.secs[i].lines)}</div>`;
    el.dataset.r = '1';
  });
}

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
    },
  };
}

// ── DART 업로드 ───────────────────────────────────────────────────────────────
async function rpUploadDart(input) {
  const file = input.files?.[0];
  if (!file) return;

  let text;
  try { text = await file.text(); } catch(e) { toast('파일 읽기 실패', 'error'); return; }

  let parsed;
  try { parsed = _rpParseMd(text); } catch(e) { toast('MD 파싱 실패: ' + e.message, 'error'); return; }

  if (!parsed.stock_code) { toast('종목코드를 파싱할 수 없습니다 (문서 개요 섹션 확인)', 'warn'); return; }

  toast('저장 중...', 'info');
  const { error } = await sb.from('dart_reports').upsert({
    stock_code:   parsed.stock_code,
    stock_name:   parsed.stock_name,
    report_type:  parsed.report_type,
    receive_date: parsed.receive_date,
    raw_md:       _rpStripRawSections(text),   // 파싱은 원본 전체로, 저장은 원자료(5~7장) 뺀 본 — 원익IPS 6MB→약 0.1MB
    summary:      parsed.summary,
  }, { onConflict: 'stock_code,report_type' });

  if (error) { toast('저장 실패: ' + error.message, 'error'); return; }

  // 4-1 ~ 4-5 사업 섹션 파싱 & 저장
  try {
    const biz = _rpParseBusinessSections(text, parsed.stock_code);
    // 동일 충돌키 중복 제거 (마지막 값 우선) — Postgres 배치 upsert의 "cannot affect row a second time" 방지
    const _dedup = (arr, keys) => {
      const m = new Map();
      for (const r of arr) m.set(keys.map(k => r[k] ?? '').join(''), r);
      return [...m.values()];
    };
    // 제품/지역 매출 + 수주잔고는 같은 테이블(dart_segment_revenue), segment_type로 구분 → 한 번에 upsert
    const segRows  = _dedup([...biz.segmentRevenue, ...biz.orderBacklog],
      ['stock_code','bsns_year','quarter','segment_type','category','subcategory']);
    const rawRows  = _dedup(biz.rawMaterial,    ['stock_code','bsns_year','quarter','data_type','product_name','material_name','origin']);
    const prodRows = _dedup(biz.production,      ['stock_code','bsns_year','quarter','factory_name']);
    const saves = [];
    if (segRows.length)
      saves.push(sb.from('dart_segment_revenue').upsert(segRows,
        { onConflict: 'stock_code,bsns_year,quarter,segment_type,category,subcategory' }));
    if (rawRows.length)
      saves.push(sb.from('dart_raw_material').upsert(rawRows,
        { onConflict: 'stock_code,bsns_year,quarter,data_type,product_name,material_name,origin' }));
    if (prodRows.length)
      saves.push(sb.from('dart_production').upsert(prodRows,
        { onConflict: 'stock_code,bsns_year,quarter,factory_name' }));
    await Promise.all(saves);
    const counts = `세그먼트 ${segRows.length}건 / 원재료 ${rawRows.length}건 / 생산 ${prodRows.length}건`;
    if (biz.skipped.length)   // 백만원으로 못 바꾼 표 — 사업분석 탭에 틀린 단위로 그리지 않도록 저장 안 함
      toast(`${parsed.stock_name} DART 저장 완료 (${counts}) · 백만원으로 바꿀 수 없는 단위라 저장 안 함: ${biz.skipped.join(', ')}`, 'warn');
    else
      toast(`${parsed.stock_name} DART 저장 완료 (${counts})`, 'success');
  } catch(e) {
    toast(`DART 기본 저장 완료, 사업 섹션 저장 실패: ${e.message}`, 'warn');
  }
  input.value = '';

  // 저장 후 전체 리로드 — 방금 저장한 세그먼트(제품별 매출)까지 재조회해야
  // 기업현황 탭의 '제품·사업부별 매출' 그래프에 즉시 반영된다.
  // (기존엔 dart만 갱신 → segment 미조회로 재업로드 전까지 그래프 비어 보임)
  _rpStock = { code: parsed.stock_code, name: parsed.stock_name };
  try {
    await rpLoadReport();  // price·fin·watch·dart·analyst·segment·company·summary 전부 재조회 + 렌더
  } catch (e) {
    // 데이터 로드 실패해도 DART 탭은 자체 조회로 표시 가능
  }
  setTimeout(() => rpSetTab(RP_TABS.indexOf('DART 분석')), 50);
}
