// sector-earnings.js — 산업 내 소섹터(세부분야) 실적 집계 (분기 YoY)
// 의존: config.js (sb, fetchAllPages, finPreferFs, INDUSTRIES, chgColor, escapeHtml,
//                   loadingHTML, emptyHTML)
//
// 각 산업의 sub_industry별로 매출·영업이익 YoY(중앙값·합산), 영업이익률, 영익개선 기업수,
// 집중종목을 집계. 재무는 CFS 우선·OFS 폴백(finPreferFs). 대형주·유통주 왜곡을 걸러내기 위해
// 합산과 함께 '중앙값(대표기업)'을 병기한다. 최근 분기가 덜 수집됐으면 자동으로 직전 분기를 사용.
// 페이지 상태 네임스페이스 = SEC (window._* 금지 규약)

const SEC = { ind: '반도체', mode: 'q', raw: {}, current: null, sort: { key: 'medRevYoY', dir: -1 } };

function pSectorEarn() {
  return `
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;flex-wrap:wrap;gap:8px">
    <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
      ${INDUSTRIES.map(i => `<button class="chip${i === SEC.ind ? ' active' : ''}" data-sec-ind="${i}" onclick="switchSecInd(this,'${i}')">${i}</button>`).join('')}
    </div>
    <div style="display:flex;align-items:center;gap:6px">
      <button class="chip${SEC.mode === 'q' ? ' active' : ''}" data-sec-mode="q" onclick="switchSecMode('q')">분기</button>
      <button class="chip${SEC.mode === 'ttm' ? ' active' : ''}" data-sec-mode="ttm" onclick="switchSecMode('ttm')">TTM</button>
      <span id="sec-period" style="font-size:calc(11px*var(--m-label));color:var(--text2);margin-left:4px"></span>
    </div>
  </div>
  <div id="sec-desc" style="font-size:calc(12px*var(--m-sub));color:var(--text2);margin-bottom:.75rem"></div>
  <div id="sec-head"></div>
  <div id="sec-chart"></div>
  <div id="sec-body">${loadingHTML('집계 중...')}</div>`;
}

function switchSecInd(el, ind) {
  if (SEC.ind === ind) return;
  SEC.ind = ind;
  document.querySelectorAll('[data-sec-ind]').forEach(b =>
    b.classList.toggle('active', b.dataset.secInd === ind));
  loadSectorEarn();
}

// 기준 모드 전환 (분기 YoY ↔ TTM YoY) — 재조회 없이 원자료에서 재집계
function switchSecMode(m) {
  if (SEC.mode === m) return;
  SEC.mode = m;
  document.querySelectorAll('[data-sec-mode]').forEach(b =>
    b.classList.toggle('active', b.dataset.secMode === m));
  if (SEC.raw[SEC.ind]) _secCompute(SEC.ind); else loadSectorEarn();
}

// 분기 라벨/키 헬퍼
const _secQn = q => { const n = parseInt(String(q).replace(/\D/g, ''), 10); return (n >= 1 && n <= 4) ? n : null; };
const _secMed = arr => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const _secPct = v => (v >= 0 ? '+' : '') + v.toFixed(1) + '%';

async function loadSectorEarn() {
  const body = document.getElementById('sec-body');
  const head = document.getElementById('sec-head');
  if (!body) return;
  head.innerHTML = '';
  body.innerHTML = loadingHTML('집계 중...');

  const ind = SEC.ind;
  try {
    if (!SEC.raw[ind]) {
      // 1) 산업 종목 목록
      const { data: comps, error: e1 } = await sb.from('companies')
        .select('code,name,sub_industry').eq('industry', ind);
      if (e1) throw e1;
      if (!comps || !comps.length) { body.innerHTML = emptyHTML(ind + ' 산업 종목 없음'); return; }

      const clean = c => (c || '').replace(/\.(KS|KQ)$/, '');
      const subOf = {}, nameOf = {}, codes = [];
      for (const c of comps) {
        const cd = clean(c.code);
        if (!cd) continue;
        codes.push(cd); subOf[cd] = c.sub_industry || '기타'; nameOf[cd] = c.name;
      }

      // 2) 재무 (최근 3년 — TTM/추세 스파크라인용, CFS 우선·OFS 폴백)
      const year = new Date().getFullYear();
      let rawRows = [];
      for (let i = 0; i < codes.length; i += 300) {
        const data = await fetchAllPages((s, e) => sb.from('financials')
          .select('stock_code,bsns_year,quarter,revenue,operating_profit,debt_ratio,finance_cost,fs_div')
          .in('stock_code', codes.slice(i, i + 300))
          .gte('bsns_year', String(year - 2))
          .order('stock_code', { ascending: true })
          .range(s, e));
        rawRows.push(...data);
      }
      const rows = finPreferFs(rawRows);
      if (!rows.length) { body.innerHTML = emptyHTML(ind + ' 산업 재무데이터 없음'); return; }

      // 2b) 시장데이터(밸류·시총·외국인) — 최신 거래일 (수익률/순매수는 커버리지 낮아 제외)
      const mdOf = {};
      try {
        const mdDate = await getLatestMarketDate();
        if (mdDate) for (let i = 0; i < codes.length; i += 300) {
          const { data: md } = await sb.from('market_data')
            .select('stock_code,per,pbr,market_cap,foreign_hold_rate')
            .eq('base_date', mdDate).in('stock_code', codes.slice(i, i + 300));
          for (const m of (md || [])) mdOf[m.stock_code] = m;
        }
      } catch (e) { console.warn('[SectorEarn] market_data', e); }

      // 3) 종목×기간 인덱스 + 기간별 커버리지
      const byStock = {}, periodCnt = {};
      for (const r of rows) {
        const qn = _secQn(r.quarter); if (!qn) continue;
        const key = r.bsns_year + '-' + qn;
        (byStock[r.stock_code] || (byStock[r.stock_code] = {}))[key] = { rev: +r.revenue, op: +r.operating_profit, dr: r.debt_ratio, fc: r.finance_cost };
        if (r.revenue != null && +r.revenue > 0) periodCnt[key] = (periodCnt[key] || 0) + 1;
      }
      const periods = Object.keys(periodCnt).sort((a, b) => {
        const [ay, aq] = a.split('-').map(Number), [by, bq] = b.split('-').map(Number);
        return by - ay || bq - aq;
      });
      SEC.raw[ind] = { byStock, periodCnt, periods, subOf, nameOf, mdOf, total: comps.length };
    }
    _secCompute(ind);
  } catch (err) {
    console.error('[SectorEarn]', err);
    body.innerHTML = emptyHTML('집계 실패: ' + (err.message || err));
  }
}

// 원자료(SEC.raw)에서 현재 모드(분기/TTM)로 집계 → 렌더. 모드/재정렬 시 재조회 없이 재호출.
function _secCompute(ind) {
  const body = document.getElementById('sec-body');
  const raw = SEC.raw[ind];
  if (!raw || !body) return;
  const { byStock, periodCnt, periods, subOf, nameOf, mdOf, total } = raw;
  const ttm = SEC.mode === 'ttm';

  // 기준 분기 선택 — 최근 분기 커버리지 70% 미만이면 직전 분기
  const maxCnt = Math.max(...periods.map(p => periodCnt[p] || 0), 1);
  let nowKey = null;
  for (const p of periods) {
    const [y, q] = p.split('-').map(Number);
    if ((periodCnt[p] || 0) >= maxCnt * 0.7 && periodCnt[(y - 1) + '-' + q]) { nowKey = p; break; }
  }
  if (!nowKey) { body.innerHTML = emptyHTML('YoY 비교 가능한 분기 없음'); return; }
  const [ny, nq] = nowKey.split('-').map(Number);
  const agoKey = (ny - 1) + '-' + nq;
  const win = end => { const i = periods.indexOf(end); return i < 0 ? [] : periods.slice(i, i + 4); };
  const nowWin = win(nowKey), agoWin = win(agoKey);

  // 종목별 now/prev (모드별: 분기=단일분기, TTM=최근 4분기 합)
  const vals = code => {
    const dr = (byStock[code][nowKey] || {}).dr;   // 부채율=현재분기 스냅샷(잔액 지표라 합산 안 함)
    if (!ttm) {
      const n = byStock[code][nowKey], p = byStock[code][agoKey];
      return (n && p) ? { nr: n.rev, no: n.op, pr: p.rev, po: p.op, nfc: n.fc, dr } : null;
    }
    if (nowWin.length < 4 || agoWin.length < 4) return null;
    let nr = 0, no = 0, pr = 0, po = 0, nfc = 0, fcOk = true;
    for (const k of nowWin) { const v = byStock[code][k]; if (!v) return null; nr += v.rev; no += v.op; if (v.fc == null) fcOk = false; else nfc += v.fc; }
    for (const k of agoWin) { const v = byStock[code][k]; if (!v) return null; pr += v.rev; po += v.op; }
    return { nr, no, pr, po, nfc: fcOk ? nfc : null, dr };
  };

  const sparkQs = periods.slice(0, 6).reverse();   // 추세 스파크라인: 최근 6분기(오름차순)
  const buckets = {};
  let usable = 0;
  for (const cd in byStock) {
    const v = vals(cd);
    if (!v || !(v.pr > 0) || !(v.nr > 0)) continue;
    const sub = subOf[cd] || '기타';
    const md = mdOf[cd] || {};
    (buckets[sub] || (buckets[sub] = { sub, items: [] })).items.push({
      code: cd, nm: nameOf[cd] || cd,
      revYoY: (v.nr - v.pr) / v.pr * 100,
      marg: v.no / v.nr * 100,
      improved: v.no > v.po,
      rn: v.nr, on: v.no, rp: v.pr, op: v.po,
      per: md.per, pbr: md.pbr, cap: md.market_cap, fhr: md.foreign_hold_rate,
      dr: v.dr, ic: (v.nfc != null && v.nfc > 0) ? v.no / v.nfc : null,
    });
    usable++;
  }
  if (!usable) { body.innerHTML = emptyHTML('비교 가능한 종목 없음'); return; }

  const rowsOut = Object.values(buckets).map(b => {
    const it = b.items;
    const sRn = it.reduce((s, x) => s + x.rn, 0), sOn = it.reduce((s, x) => s + x.on, 0);
    const sRp = it.reduce((s, x) => s + x.rp, 0), sOp = it.reduce((s, x) => s + x.op, 0);
    const top = it.reduce((a, x) => x.rn > a.rn ? x : a, it[0]);
    const impN = it.filter(x => x.improved).length;
    const posPer = it.map(x => x.per).filter(v => v != null && v > 0);
    const posPbr = it.map(x => x.pbr).filter(v => v != null && v > 0);
    const fhrs = it.map(x => x.fhr).filter(v => v != null);
    const drs = it.map(x => x.dr).filter(v => v != null);
    const ics = it.map(x => x.ic).filter(v => v != null && isFinite(v));
    const spark = sparkQs.map(q => it.reduce((s, x) => s + (((byStock[x.code] || {})[q] || {}).rev || 0), 0));
    return {
      sub: b.sub, n: it.length, items: it,
      medRevYoY: _secMed(it.map(x => x.revYoY)),
      medMarg: _secMed(it.map(x => x.marg)),
      aggRevYoY: sRp > 0 ? (sRn - sRp) / sRp * 100 : null,
      aggMarg: sRn > 0 ? sOn / sRn * 100 : null,
      turnaround: sOp <= 0 && sOn > 0,
      impN, impRatio: impN / it.length,
      topName: top.nm, topShare: sRn > 0 ? top.rn / sRn * 100 : 0,
      medPer: posPer.length ? _secMed(posPer) : null,
      medPbr: posPbr.length ? _secMed(posPbr) : null,
      sumCap: it.reduce((s, x) => s + (x.cap || 0), 0),
      medFhr: fhrs.length ? _secMed(fhrs) : null,
      medDebt: drs.length ? _secMed(drs) : null,
      medIC: ics.length ? _secMed(ics) : null,
      spark,
      sRn, sOn, sRp, sOp,
    };
  });

  const T = rowsOut.reduce((t, r) => {
    t.sRn += r.sRn; t.sOn += r.sOn; t.sRp += r.sRp; t.sOp += r.sOp; t.n += r.n; t.imp += r.impN; return t;
  }, { sRn: 0, sOn: 0, sRp: 0, sOp: 0, n: 0, imp: 0 });

  SEC.current = {
    ind, rows: rowsOut, T, ttm, sparkQs, total, usable,
    periodLabel: ttm ? (ny + '년 ' + nq + '분기 TTM') : (ny + '년 ' + nq + '분기'),
  };
  _secRender(SEC.current);
}

// 소섹터 특징 태그 (지표 규칙 기반)
function _secTags(r) {
  const t = [];
  if (r.turnaround) t.push('흑자전환');
  if (r.medMarg >= 12) t.push('고마진');
  else if (r.medMarg < 0) t.push('적자권');
  if (r.medRevYoY >= 25) t.push('고성장');
  if (r.impRatio >= 0.8) t.push('개선 광범위');
  if (r.topShare >= 45) t.push('대형주 편중');
  return t.slice(0, 3);
}

// 성장×수익성 버블맵 (SVG) — 소섹터를 매출성장(x)·영익률(y)에 배치, 크기=종목수.
// 극단 아웃라이어(IQR 상단 초과) 소섹터는 축 밖 칩으로 분리(예: 반도체 메모리). 차트라 폰트는 bare px(배율 예외).
function _secScatter(d) {
  const rows = d.rows;
  if (!rows || rows.length < 2) return '';

  const fenceHi = vals => {
    const s = [...vals].sort((a, b) => a - b), n = s.length;
    const Q = p => { const i = (n - 1) * p, lo = Math.floor(i); return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo); };
    const q1 = Q(0.25), q3 = Q(0.75); return q3 + 1.5 * (q3 - q1);
  };
  let plotted = rows, offChart = [];
  if (rows.length >= 6) {
    const fx = fenceHi(rows.map(r => r.medRevYoY)), fy = fenceHi(rows.map(r => r.medMarg));
    const off = rows.filter(r => r.medRevYoY > fx || r.medMarg > fy);
    const keep = rows.filter(r => !off.includes(r));
    if (keep.length >= 3 && off.length >= 1 && off.length <= 3) { plotted = keep; offChart = off; }
  }
  // 소규모 소섹터(n<3)는 중앙값 신뢰도 낮아 지도에서 제외 (표에는 유지)
  const omitted = plotted.filter(r => r.n < 3);
  if (omitted.length && plotted.length - omitted.length >= 3) plotted = plotted.filter(r => r.n >= 3);

  const W = 940, H = 360, ml = 54, mr = 26, mt = 20, mb = 48, pw = W - ml - mr, ph = H - mt - mb;
  const xs = plotted.map(r => r.medRevYoY), ys = plotted.map(r => r.medMarg);
  let xMin = Math.min(0, ...xs), xMax = Math.max(...xs, 1);
  let yMin = Math.min(0, ...ys), yMax = Math.max(0, ...ys);
  const xpad = Math.max((xMax - xMin) * 0.1, 3), ypad = Math.max((yMax - yMin) * 0.12, 2);
  xMin -= xpad; xMax += xpad; yMin -= ypad; yMax += ypad;
  const X = v => ml + (v - xMin) / (xMax - xMin) * pw;
  const Y = v => mt + (yMax - v) / (yMax - yMin) * ph;
  const maxN = Math.max(...plotted.map(r => r.n), 1);
  const R = n => 7 + Math.sqrt(n) / Math.sqrt(maxN) * 12;
  const ticks = (min, max, k) => { const o = []; for (let i = 0; i <= k; i++) o.push(min + (max - min) * i / k); return o; };

  let svg = `<svg viewBox="0 0 ${W} ${H}" style="display:block;width:100%;min-width:640px;max-width:1120px;height:auto;margin:2px auto 0" role="img" aria-label="소섹터 성장률 대 영업이익률 버블맵">`;
  svg += `<rect x="${ml}" y="${Y(0)}" width="${pw}" height="${mt + ph - Y(0)}" style="fill:var(--blue);opacity:.06"/>`;
  ticks(yMin, yMax, 4).forEach(t => {
    const yy = Y(t);
    svg += `<line x1="${ml}" y1="${yy}" x2="${W - mr}" y2="${yy}" style="stroke:var(--border);stroke-width:1"/>`;
    svg += `<text x="${ml - 8}" y="${yy + 4}" text-anchor="end" style="fill:var(--text3);font-size:11px">${t.toFixed(0)}%</text>`;
  });
  ticks(xMin, xMax, 4).forEach(t => {
    svg += `<text x="${X(t)}" y="${mt + ph + 20}" text-anchor="middle" style="fill:var(--text3);font-size:11px">${t.toFixed(0)}%</text>`;
  });
  svg += `<line x1="${ml}" y1="${Y(0)}" x2="${W - mr}" y2="${Y(0)}" style="stroke:var(--text3);stroke-width:1.3;stroke-dasharray:4 4;opacity:.65"/>`;
  svg += `<text x="${W - mr}" y="${Y(0) - 6}" text-anchor="end" style="fill:var(--text3);font-size:10.5px;opacity:.85">손익분기</text>`;
  svg += `<text x="${ml + pw / 2}" y="${H - 6}" text-anchor="middle" style="fill:var(--text3);font-size:11.5px;font-weight:600">매출 성장률 (중앙값, YoY)</text>`;
  svg += `<text transform="translate(13,${mt + ph / 2}) rotate(-90)" text-anchor="middle" style="fill:var(--text3);font-size:11.5px;font-weight:600">영업이익률 (중앙값)</text>`;
  // 버블 + 라벨(세로 충돌 회피 + 연결선)
  const labs = plotted.map(r => {
    const cx = X(r.medRevYoY), cy = Y(r.medMarg), rr = R(r.n);
    return { r, cx, cy, rr, right: cx < ml + pw * 0.5, ly: cy + 4 };
  });
  // 라벨 세로 충돌 회피 — 양쪽(좌/우) 통합, 가로로 겹치는 라벨만 세로로 밀어냄
  labs.forEach(L => {
    L.w = L.r.sub.length * 8 + 6;
    L.x1 = L.right ? L.cx + L.rr + 4 : L.cx - L.rr - 4 - L.w;
    L.x2 = L.x1 + L.w;
  });
  for (let pass = 0; pass < 3; pass++) {
    labs.sort((a, b) => a.ly - b.ly);
    for (let i = 1; i < labs.length; i++) {
      const A = labs[i];
      for (let j = 0; j < i; j++) {
        const B = labs[j];
        const xover = A.x1 < B.x2 + 3 && B.x1 < A.x2 + 3;
        if (xover && A.ly - B.ly < 12 && A.ly - B.ly > -12) A.ly = B.ly + 12;
      }
    }
  }
  const loLim = mt + 6, hiLim = mt + ph - 2;
  labs.forEach(L => { L.ly = Math.max(loLim, Math.min(hiLim, L.ly)); });
  labs.forEach(L => {
    const col = L.r.medMarg >= 0 ? 'var(--red)' : 'var(--blue)';
    svg += `<circle cx="${L.cx}" cy="${L.cy}" r="${L.rr}" style="fill:${col};fill-opacity:.58;stroke:var(--bg2);stroke-width:1.6"><title>${escapeHtml(L.r.sub)} · 매출 ${_secPct(L.r.medRevYoY)} · 영익률 ${L.r.medMarg.toFixed(1)}% · ${L.r.n}종</title></circle>`;
    if (L.r.n >= maxN * 0.55) svg += `<text x="${L.cx}" y="${L.cy + 3}" text-anchor="middle" style="fill:var(--bg2);font-size:9px;font-weight:700">${L.r.n}</text>`;
    const lx = L.right ? L.cx + L.rr + 4 : L.cx - L.rr - 4;
    if (Math.abs(L.ly - L.cy - 4) > L.rr + 3)
      svg += `<line x1="${L.right ? L.cx + L.rr : L.cx - L.rr}" y1="${L.cy}" x2="${lx}" y2="${L.ly - 3}" style="stroke:var(--text3);stroke-width:.8;opacity:.45"/>`;
    svg += `<text x="${lx}" y="${L.ly}" text-anchor="${L.right ? 'start' : 'end'}" style="paint-order:stroke;stroke:var(--bg2);stroke-width:2.8px;stroke-linejoin:round;fill:var(--text);font-size:11.5px;font-weight:600">${escapeHtml(L.r.sub)}</text>`;
  });
  svg += `</svg>`;

  const pills = offChart.map(r => {
    const col = r.medMarg >= 0 ? 'var(--red)' : 'var(--blue)';
    return `<span style="display:inline-flex;align-items:center;gap:5px;font-size:calc(11px*var(--m-label));font-weight:600;color:${col};background:var(--bg2);border:1px solid var(--border2);padding:4px 9px;border-radius:100px">${escapeHtml(r.sub)} ↗ 매출 ${_secPct(r.medRevYoY)} · 영익률 ${r.medMarg.toFixed(1)}%</span>`;
  }).join(' ');
  const pillRow = offChart.length
    ? `<div style="display:flex;flex-wrap:wrap;gap:6px;padding:0 4px 10px">${pills}</div>` : '';
  const omitNote = omitted.length
    ? `<div style="font-size:calc(10.5px*var(--m-label));color:var(--text3);padding:0 4px 8px">지도 제외(소규모 n&lt;3): ${omitted.map(r => escapeHtml(r.sub)).join(', ')}</div>` : '';

  return `
  <div class="card" style="margin-bottom:1rem"><div class="card-body" style="padding:14px 12px 8px">
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;padding:0 4px 8px;flex-wrap:wrap">
      <span style="font-size:calc(13px*var(--m-body));font-weight:700">성장 × 수익성 지도</span>
      <span style="font-size:calc(11px*var(--m-label));color:var(--text3)">버블 크기=종목수 · 색=<span style="color:var(--red)">흑자</span>/<span style="color:var(--blue)">적자</span> · 세로 0=손익분기</span>
    </div>
    ${pillRow}
    ${omitNote}
    <div style="overflow-x:auto;padding-bottom:2px">${svg}</div>
  </div></div>`;
}

function _secRender(d) {
  const body = document.getElementById('sec-body');
  const head = document.getElementById('sec-head');
  const desc = document.getElementById('sec-desc');
  const per  = document.getElementById('sec-period');
  if (!body) return;

  if (per)  per.textContent = d.periodLabel + ' 기준';
  if (desc) desc.innerHTML =
    `${escapeHtml(d.ind)} 소섹터별 ${d.ttm ? 'TTM(최근 4분기)' : '분기'} 실적 · 전년동기 대비(YoY) · 집계 ${d.usable}/${d.total}종. ` +
    `<b style="color:var(--text)">중앙값</b>=대표기업(거대·유통주 왜곡 제외), 작은 글씨=합산. 재무는 연결(CFS) 우선. PER·PBR·외국인=최신 시장데이터 중앙값. 헤더 클릭 정렬 · <b style="color:var(--text)">소섹터 클릭 시 구성종목</b>. 이자보상=영업이익÷금융비용(금융비용=이자+환차손 등 집계 프록시).`;

  // 헤드라인 (섹터 합산)
  const T = d.T;
  const rev = T.sRp > 0 ? (T.sRn - T.sRp) / T.sRp * 100 : null;
  const opY = T.sOp > 0 ? (T.sOn - T.sOp) / T.sOp * 100 : null;
  const marg = T.sRn > 0 ? T.sOn / T.sRn * 100 : null;
  const margP = T.sRp > 0 ? T.sOp / T.sRp * 100 : null;
  head.innerHTML = `
  <div class="metrics-grid" style="margin-bottom:1rem">
    <div class="metric-card"><div class="metric-label">집계 종목</div><div class="metric-value">${T.n}</div><div class="metric-sub">영익개선 ${T.imp}/${T.n}</div></div>
    <div class="metric-card"><div class="metric-label">매출 YoY(합산)</div><div class="metric-value" style="color:${chgColor(rev)}">${rev == null ? '—' : _secPct(rev)}</div><div class="metric-sub">전년동기 대비</div></div>
    <div class="metric-card"><div class="metric-label">영업이익 YoY(합산)</div><div class="metric-value" style="color:${chgColor(opY)}">${opY == null ? (T.sOn > 0 ? '흑자전환' : '—') : _secPct(opY)}</div><div class="metric-sub">전년동기 대비</div></div>
    <div class="metric-card"><div class="metric-label">영업이익률(합산)</div><div class="metric-value">${marg == null ? '—' : marg.toFixed(1) + '%'}</div><div class="metric-sub">전년 ${margP == null ? '—' : margP.toFixed(1) + '%'}</div></div>
  </div>`;

  // 성장×수익성 버블맵
  const chartEl = document.getElementById('sec-chart');
  if (chartEl) chartEl.innerHTML = _secScatter(d);

  // 표 (정렬 가능 — SEC.sort 기준)
  _secBody(d);
}

// 추세 스파크라인 (최근 6분기 매출) — 마지막≥처음이면 빨강, 아니면 파랑
function _secSpark(arr) {
  if (!arr || arr.length < 2 || arr.every(v => !v)) return '<span style="color:var(--text3)">—</span>';
  const w = 58, h = 18, mn = Math.min(...arr), mx = Math.max(...arr), rng = (mx - mn) || 1;
  const px = i => (i / (arr.length - 1) * (w - 2) + 1).toFixed(1);
  const py = v => (h - 2 - ((v - mn) / rng) * (h - 4)).toFixed(1);
  const pts = arr.map((v, i) => `${px(i)},${py(v)}`).join(' ');
  const col = arr[arr.length - 1] >= arr[0] ? 'var(--red)' : 'var(--blue)';
  return `<svg width="${w}" height="${h}" style="vertical-align:middle"><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${px(arr.length - 1)}" cy="${py(arr[arr.length - 1])}" r="2" style="fill:${col}"/></svg>`;
}

// 드릴다운: 소섹터 구성 종목 (시총순, data-stock-open으로 상세 모달)
function _secDrillHtml(r) {
  const escA = typeof escAttr === 'function' ? escAttr : escapeHtml;
  const cell = 'padding:6px 10px;font-size:calc(12px*var(--m-sub))';
  const rows = [...r.items].sort((a, b) => (b.cap || 0) - (a.cap || 0)).map(x => `
    <tr>
      <td style="${cell};text-align:left"><span class="stock-row" data-stock-open="${x.code}" data-stock-name="${escA(x.nm)}" style="cursor:pointer;font-weight:600;color:var(--text)">${escapeHtml(x.nm)}</span> <span style="color:var(--text3);font-size:calc(10px*var(--m-label))">${x.code}</span></td>
      <td style="${cell};text-align:right;color:${chgColor(x.revYoY)}">${_secPct(x.revYoY)}</td>
      <td style="${cell};text-align:right;color:${x.marg < 0 ? 'var(--blue)' : 'inherit'}">${x.marg.toFixed(1)}%</td>
      <td style="${cell};text-align:right;color:var(--text2)">${x.per != null && x.per > 0 ? x.per.toFixed(1) : '—'}</td>
      <td style="${cell};text-align:right;color:var(--text2)">${fmtCap(x.cap || 0)}</td>
      <td style="${cell};text-align:right;color:var(--text2)">${x.fhr != null ? x.fhr.toFixed(1) + '%' : '—'}</td>
      <td style="${cell};text-align:right;color:${x.dr != null && x.dr > 200 ? 'var(--yellow)' : 'var(--text2)'}">${x.dr != null ? x.dr.toFixed(0) + '%' : '—'}</td>
      <td style="${cell};text-align:right;color:var(--text2)">${x.ic != null && isFinite(x.ic) ? (x.ic >= 100 ? '100+' : x.ic.toFixed(1)) + '배' : '—'}</td>
    </tr>`).join('');
  const hd = ['종목', '매출YoY', '영익률', 'PER', '시총', '외국인', '부채율', '이자보상'];
  return `<div style="padding:6px 12px 12px;background:var(--bg2)">
    <div style="font-size:calc(11px*var(--m-label));color:var(--text3);padding:4px 10px 6px">구성 종목 ${r.items.length} · 시총순 (클릭 시 종목 상세)</div>
    <table style="border-collapse:collapse;width:100%;min-width:640px">
      <thead><tr>${hd.map((h, i) => `<th style="text-align:${i === 0 ? 'left' : 'right'};padding:4px 10px;font-size:calc(10px*var(--m-label));color:var(--text3);font-weight:600;border-bottom:1px solid var(--border)">${h}</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
}

// 표 본문 렌더 (헤더 클릭 정렬 시 재호출)
function _secBody(d) {
  const body = document.getElementById('sec-body');
  if (!body) return;
  const { key, dir } = SEC.sort;
  const sorted = [...d.rows].sort((a, b) => {
    const va = a[key], vb = b[key];
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return (va - vb) * dir;
  });

  const arrow = k => SEC.sort.key === k ? (dir < 0 ? ' ▾' : ' ▴') : '';
  const th  = (t, al) => `<th style="text-align:${al || 'right'};padding:10px 12px;font-size:calc(11px*var(--m-label));font-weight:600;color:var(--text3);border-bottom:1px solid var(--border2);white-space:nowrap">${t}</th>`;
  const thS = (t, k, al) => `<th onclick="secSort('${k}')" title="클릭하여 정렬" style="cursor:pointer;user-select:none;text-align:${al || 'right'};padding:10px 12px;font-size:calc(11px*var(--m-label));font-weight:600;color:${SEC.sort.key === k ? 'var(--text)' : 'var(--text3)'};border-bottom:1px solid var(--border2);white-space:nowrap">${t}${arrow(k)}</th>`;

  const trs = sorted.map((r, i) => {
    const tags = _secTags(r).map(t =>
      `<span style="display:inline-block;font-size:calc(10px*var(--m-label));padding:1px 6px;border-radius:100px;background:var(--bg2);color:var(--text2);margin:1px 2px 1px 0">${t}</span>`).join('');
    const margCol = r.medMarg < 0 ? 'var(--blue)' : 'inherit';
    const aggMargTxt = r.aggMarg == null ? '' : `합산 ${r.aggMarg.toFixed(1)}%`;
    const aggRevTxt  = r.aggRevYoY == null ? '' : `합산 ${_secPct(r.aggRevYoY)}`;
    return `
    <tr style="border-bottom:1px solid var(--border)">
      <td onclick="secDrill(${i})" style="padding:11px 12px;text-align:left;cursor:pointer"><span id="secArr-${i}" style="color:var(--text3);font-size:calc(10px*var(--m-label));margin-right:4px">▸</span><span style="font-weight:700;font-size:calc(13px*var(--m-body))">${escapeHtml(r.sub)}</span></td>
      <td style="padding:11px 12px;text-align:right"><span style="font-size:calc(11px*var(--m-label));color:var(--text2)">${r.n}종</span></td>
      <td style="padding:11px 12px;text-align:right">
        <div style="font-weight:700;font-size:calc(13.5px*var(--m-body));color:${chgColor(r.medRevYoY)}">${_secPct(r.medRevYoY)}</div>
        <div style="font-size:calc(10px*var(--m-label));color:var(--text3)">${aggRevTxt}</div>
      </td>
      <td style="padding:11px 12px;text-align:right">
        <div style="font-weight:700;font-size:calc(13.5px*var(--m-body));color:${margCol}">${r.medMarg.toFixed(1)}%</div>
        <div style="font-size:calc(10px*var(--m-label));color:var(--text3)">${aggMargTxt}</div>
      </td>
      <td style="padding:11px 12px;text-align:right">
        <div style="font-size:calc(12.5px*var(--m-sub))">${r.medPer == null ? '—' : r.medPer.toFixed(1)}</div>
        <div style="font-size:calc(10px*var(--m-label));color:var(--text3)">PBR ${r.medPbr == null ? '—' : r.medPbr.toFixed(2)}</div>
      </td>
      <td style="padding:11px 12px;text-align:right"><span style="font-size:calc(12px*var(--m-sub));color:var(--text2)">${fmtCap(r.sumCap)}</span></td>
      <td style="padding:11px 12px;text-align:right"><span style="font-size:calc(12px*var(--m-sub));color:var(--text2)">${r.medFhr == null ? '—' : r.medFhr.toFixed(1) + '%'}</span></td>
      <td style="padding:11px 12px;text-align:right" title="부채율(중앙) / 이자보상배율(중앙) · 이자보상은 금융비용 기준 프록시(환차손 등 포함)">
        <div style="font-size:calc(12.5px*var(--m-sub));color:${r.medDebt != null && r.medDebt > 200 ? 'var(--yellow)' : 'inherit'}">${r.medDebt == null ? '—' : r.medDebt.toFixed(0) + '%'}</div>
        <div style="font-size:calc(10px*var(--m-label));color:var(--text3)">이자 ${r.medIC == null ? '—' : (r.medIC >= 100 ? '100+' : r.medIC.toFixed(1)) + '배'}</div>
      </td>
      <td style="padding:11px 12px;text-align:right">
        <div style="display:inline-flex;align-items:center;gap:8px;justify-content:flex-end">
          <span style="font-size:calc(12px*var(--m-sub));color:var(--text2);min-width:38px;text-align:right">${r.impN}/${r.n}</span>
          <span style="width:46px;height:6px;border-radius:100px;background:var(--border2);overflow:hidden;display:inline-block">
            <span style="display:block;height:100%;width:${Math.round(r.impRatio * 100)}%;background:var(--red);border-radius:100px"></span>
          </span>
        </div>
      </td>
      <td style="padding:11px 12px;text-align:center" title="최근 6분기 매출 추세">${_secSpark(r.spark)}</td>
      <td style="padding:11px 12px;text-align:right"><span style="font-size:calc(12px*var(--m-sub));color:var(--text2);white-space:nowrap">${escapeHtml(r.topName)} <span style="color:var(--text3)">${Math.round(r.topShare)}%</span></span></td>
      <td style="padding:11px 12px;text-align:left">${tags || '<span style="color:var(--text3)">—</span>'}</td>
    </tr>
    <tr id="secd-${i}" style="display:none"><td colspan="12" style="padding:0">${_secDrillHtml(r)}</td></tr>`;
  }).join('');

  body.innerHTML = `
  <div class="card"><div class="card-body" style="padding:0">
    <div style="overflow-x:auto">
      <table style="border-collapse:collapse;width:100%;min-width:1080px">
        <thead><tr>
          ${th('소섹터', 'left')}${thS('종목수', 'n')}${thS('매출 YoY', 'medRevYoY')}${thS('영업이익률', 'medMarg')}${thS('PER', 'medPer')}${thS('시총', 'sumCap')}${thS('외국인', 'medFhr')}${thS('부채율', 'medDebt')}${thS('영익 개선', 'impRatio')}${th('추세')}${th('집중 종목')}${th('특징', 'left')}
        </tr></thead>
        <tbody>${trs}</tbody>
      </table>
    </div>
  </div></div>`;
}

// 헤더 클릭 정렬 토글
function secSort(key) {
  if (SEC.sort.key === key) SEC.sort.dir *= -1;
  else { SEC.sort.key = key; SEC.sort.dir = -1; }
  if (SEC.current) _secBody(SEC.current);
}

// 소섹터 드릴다운 토글 (구성 종목 펼침/접힘)
function secDrill(i) {
  const row = document.getElementById('secd-' + i);
  const arr = document.getElementById('secArr-' + i);
  if (!row) return;
  const open = row.style.display === 'none';
  row.style.display = open ? '' : 'none';
  if (arr) arr.textContent = open ? '▾' : '▸';
}
