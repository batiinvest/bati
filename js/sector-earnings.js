// sector-earnings.js — 산업 내 소섹터(세부분야) 실적 집계 (분기 YoY)
// 의존: config.js (sb, fetchAllPages, finPreferFs, INDUSTRIES, chgColor, escapeHtml,
//                   loadingHTML, emptyHTML)
//
// 각 산업의 sub_industry별로 매출·영업이익 YoY(중앙값·합산), 영업이익률, 영익개선 기업수,
// 집중종목을 집계. 재무는 CFS 우선·OFS 폴백(finPreferFs). 대형주·유통주 왜곡을 걸러내기 위해
// 합산과 함께 '중앙값(대표기업)'을 병기한다. 최근 분기가 덜 수집됐으면 자동으로 직전 분기를 사용.
// 페이지 상태 네임스페이스 = SEC (window._* 금지 규약)

const SEC = { ind: '반도체', cache: {} };

function pSectorEarn() {
  return `
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;flex-wrap:wrap;gap:8px">
    <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
      ${INDUSTRIES.map(i => `<button class="chip${i === SEC.ind ? ' active' : ''}" data-sec-ind="${i}" onclick="switchSecInd(this,'${i}')">${i}</button>`).join('')}
    </div>
    <span id="sec-period" style="font-size:calc(11px*var(--m-label));color:var(--text2)"></span>
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
  const desc = document.getElementById('sec-desc');
  const per  = document.getElementById('sec-period');
  if (!body) return;
  head.innerHTML = '';
  body.innerHTML = loadingHTML('집계 중...');

  const ind = SEC.ind;
  try {
    if (SEC.cache[ind]) { _secRender(SEC.cache[ind]); return; }

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

    // 2) 재무 (최근 2년, CFS 우선·OFS 폴백)
    const year = new Date().getFullYear();
    let rawRows = [];
    for (let i = 0; i < codes.length; i += 300) {
      const slice = codes.slice(i, i + 300);
      const data = await fetchAllPages((s, e) => sb.from('financials')
        .select('stock_code,bsns_year,quarter,revenue,operating_profit,fs_div')
        .in('stock_code', slice)
        .gte('bsns_year', String(year - 1))
        .order('stock_code', { ascending: true })
        .range(s, e));
      rawRows.push(...data);
    }
    const rows = finPreferFs(rawRows);
    if (!rows.length) { body.innerHTML = emptyHTML(ind + ' 산업 재무데이터 없음'); return; }

    // 3) 종목×기간 인덱스 + 기간별 커버리지
    const byStock = {};            // code -> { 'Y-Q': {rev, op} }
    const periodCnt = {};          // 'Y-Q' -> 매출 유효 종목수
    for (const r of rows) {
      const qn = _secQn(r.quarter); if (!qn) continue;
      const key = r.bsns_year + '-' + qn;
      const cd = r.stock_code;
      (byStock[cd] || (byStock[cd] = {}))[key] = { rev: +r.revenue, op: +r.operating_profit };
      if (r.revenue != null && +r.revenue > 0) periodCnt[key] = (periodCnt[key] || 0) + 1;
    }

    // 4) 기준 분기 선택 — 최근 분기가 덜 수집됐으면(만수 대비 70% 미만) 직전 분기로
    const periods = Object.keys(periodCnt).sort((a, b) => {
      const [ay, aq] = a.split('-').map(Number), [by, bq] = b.split('-').map(Number);
      return by - ay || bq - aq;
    });
    const maxCnt = Math.max(...periods.map(p => periodCnt[p]));
    let nowKey = null;
    for (const p of periods) {
      const [y, q] = p.split('-').map(Number);
      const prev = (y - 1) + '-' + q;
      if (periodCnt[p] >= maxCnt * 0.7 && periodCnt[prev]) { nowKey = p; break; }
    }
    if (!nowKey) { body.innerHTML = emptyHTML('YoY 비교 가능한 분기 없음'); return; }
    const [ny, nq] = nowKey.split('-').map(Number);
    const prevKey = (ny - 1) + '-' + nq;

    // 5) 종목별 YoY → 버킷 집계
    const buckets = {};   // sub -> {name, items:[{revYoY, marg, improved, rn, on, rp, op, code, nm}]}
    let usable = 0;
    for (const cd in byStock) {
      const now = byStock[cd][nowKey], prv = byStock[cd][prevKey];
      if (!now || !prv || !(prv.rev > 0) || !(now.rev > 0)) continue;
      const sub = subOf[cd] || '기타';
      (buckets[sub] || (buckets[sub] = { sub, items: [] })).items.push({
        code: cd, nm: nameOf[cd] || cd,
        revYoY: (now.rev - prv.rev) / prv.rev * 100,
        marg: now.op / now.rev * 100,
        improved: now.op > prv.op,
        rn: now.rev, on: now.op, rp: prv.rev, op: prv.op,
      });
      usable++;
    }
    if (!usable) { body.innerHTML = emptyHTML('YoY 계산 가능한 종목 없음'); return; }

    // 6) 버킷 지표 계산
    const rowsOut = Object.values(buckets).map(b => {
      const it = b.items;
      const sRn = it.reduce((s, x) => s + x.rn, 0), sOn = it.reduce((s, x) => s + x.on, 0);
      const sRp = it.reduce((s, x) => s + x.rp, 0), sOp = it.reduce((s, x) => s + x.op, 0);
      const top = it.reduce((a, x) => x.rn > a.rn ? x : a, it[0]);
      const impN = it.filter(x => x.improved).length;
      return {
        sub: b.sub, n: it.length,
        medRevYoY: _secMed(it.map(x => x.revYoY)),
        medMarg: _secMed(it.map(x => x.marg)),
        aggRevYoY: sRp > 0 ? (sRn - sRp) / sRp * 100 : null,
        aggMarg: sRn > 0 ? sOn / sRn * 100 : null,
        aggOpYoY: sOp > 0 ? (sOn - sOp) / sOp * 100 : null,
        turnaround: sOp <= 0 && sOn > 0,
        impN, impRatio: impN / it.length,
        topName: top.nm, topShare: sRn > 0 ? top.rn / sRn * 100 : 0,
        sRn, sOn, sRp, sOp,
      };
    }).sort((a, b) => b.medRevYoY - a.medRevYoY);

    // 7) 섹터 총계
    const T = rowsOut.reduce((t, r) => {
      t.sRn += r.sRn; t.sOn += r.sOn; t.sRp += r.sRp; t.sOp += r.sOp; t.n += r.n; t.imp += r.impN; return t;
    }, { sRn: 0, sOn: 0, sRp: 0, sOp: 0, n: 0, imp: 0 });

    const result = {
      ind, rows: rowsOut, T,
      periodLabel: ny + '년 ' + nq + '분기',
      total: comps.length, usable,
    };
    SEC.cache[ind] = result;
    _secRender(result);
  } catch (err) {
    console.error('[SectorEarn]', err);
    body.innerHTML = emptyHTML('집계 실패: ' + (err.message || err));
  }
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

  const W = 760, H = 430, ml = 52, mr = 24, mt = 22, mb = 52, pw = W - ml - mr, ph = H - mt - mb;
  const xs = plotted.map(r => r.medRevYoY), ys = plotted.map(r => r.medMarg);
  let xMin = Math.min(0, ...xs), xMax = Math.max(...xs, 1);
  let yMin = Math.min(0, ...ys), yMax = Math.max(0, ...ys);
  const xpad = Math.max((xMax - xMin) * 0.1, 3), ypad = Math.max((yMax - yMin) * 0.12, 2);
  xMin -= xpad; xMax += xpad; yMin -= ypad; yMax += ypad;
  const X = v => ml + (v - xMin) / (xMax - xMin) * pw;
  const Y = v => mt + (yMax - v) / (yMax - yMin) * ph;
  const maxN = Math.max(...plotted.map(r => r.n), 1);
  const R = n => 9 + Math.sqrt(n) / Math.sqrt(maxN) * 17;
  const ticks = (min, max, k) => { const o = []; for (let i = 0; i <= k; i++) o.push(min + (max - min) * i / k); return o; };

  let svg = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" role="img" aria-label="소섹터 성장률 대 영업이익률 버블맵">`;
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
  plotted.forEach(r => {
    const cx = X(r.medRevYoY), cy = Y(r.medMarg), rr = R(r.n);
    const col = r.medMarg >= 0 ? 'var(--red)' : 'var(--blue)';
    svg += `<circle cx="${cx}" cy="${cy}" r="${rr}" style="fill:${col};fill-opacity:.62;stroke:var(--bg2);stroke-width:2"><title>${escapeHtml(r.sub)} · 매출 ${_secPct(r.medRevYoY)} · 영익률 ${r.medMarg.toFixed(1)}% · ${r.n}종</title></circle>`;
    if (r.n >= maxN * 0.5) svg += `<text x="${cx}" y="${cy + 3.5}" text-anchor="middle" style="fill:var(--bg2);font-size:10px;font-weight:700">${r.n}</text>`;
    const right = cx < ml + pw * 0.62, lx = right ? cx + rr + 5 : cx - rr - 5;
    svg += `<text x="${lx}" y="${cy + 4}" text-anchor="${right ? 'start' : 'end'}" style="paint-order:stroke;stroke:var(--bg2);stroke-width:3px;stroke-linejoin:round;fill:var(--text);font-size:11.5px;font-weight:600">${escapeHtml(r.sub)}</text>`;
  });
  svg += `</svg>`;

  const pills = offChart.map(r => {
    const col = r.medMarg >= 0 ? 'var(--red)' : 'var(--blue)';
    return `<span style="display:inline-flex;align-items:center;gap:5px;font-size:calc(11px*var(--m-label));font-weight:600;color:${col};background:var(--bg2);border:1px solid var(--border2);padding:4px 9px;border-radius:100px">${escapeHtml(r.sub)} ↗ 매출 ${_secPct(r.medRevYoY)} · 영익률 ${r.medMarg.toFixed(1)}%</span>`;
  }).join(' ');
  const pillRow = offChart.length
    ? `<div style="display:flex;flex-wrap:wrap;gap:6px;padding:0 4px 10px">${pills}</div>` : '';

  return `
  <div class="card" style="margin-bottom:1rem"><div class="card-body" style="padding:14px 12px 8px">
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;padding:0 4px 8px;flex-wrap:wrap">
      <span style="font-size:calc(13px*var(--m-body));font-weight:700">성장 × 수익성 지도</span>
      <span style="font-size:calc(11px*var(--m-label));color:var(--text3)">버블 크기=종목수 · 색=<span style="color:var(--red)">흑자</span>/<span style="color:var(--blue)">적자</span> · 세로 0=손익분기</span>
    </div>
    ${pillRow}
    ${svg}
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
    `${escapeHtml(d.ind)} 소섹터별 분기 실적 · 전년동기 대비(YoY) · 집계 ${d.usable}/${d.total}종. ` +
    `<b style="color:var(--text)">중앙값</b>=대표기업(거대·유통주 왜곡 제외), 작은 글씨=합산. 재무는 연결(CFS) 우선.`;

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

  // 표
  const th = (t, al) => `<th style="text-align:${al || 'right'};padding:10px 12px;font-size:calc(11px*var(--m-label));font-weight:600;color:var(--text3);border-bottom:1px solid var(--border2);white-space:nowrap">${t}</th>`;
  const trs = d.rows.map(r => {
    const tags = _secTags(r).map(t =>
      `<span style="display:inline-block;font-size:calc(10px*var(--m-label));padding:1px 6px;border-radius:100px;background:var(--bg2);color:var(--text2);margin:1px 2px 1px 0">${t}</span>`).join('');
    const margCol = r.medMarg < 0 ? 'var(--blue)' : 'inherit';
    const aggMargTxt = r.aggMarg == null ? '' : `합산 ${r.aggMarg.toFixed(1)}%`;
    const aggRevTxt  = r.aggRevYoY == null ? '' : `합산 ${_secPct(r.aggRevYoY)}`;
    return `
    <tr style="border-bottom:1px solid var(--border)">
      <td style="padding:11px 12px;text-align:left"><span style="font-weight:700;font-size:calc(13px*var(--m-body))">${escapeHtml(r.sub)}</span></td>
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
        <div style="display:inline-flex;align-items:center;gap:8px;justify-content:flex-end">
          <span style="font-size:calc(12px*var(--m-sub));color:var(--text2);min-width:38px;text-align:right">${r.impN}/${r.n}</span>
          <span style="width:46px;height:6px;border-radius:100px;background:var(--border2);overflow:hidden;display:inline-block">
            <span style="display:block;height:100%;width:${Math.round(r.impRatio * 100)}%;background:var(--red);border-radius:100px"></span>
          </span>
        </div>
      </td>
      <td style="padding:11px 12px;text-align:right"><span style="font-size:calc(12px*var(--m-sub));color:var(--text2);white-space:nowrap">${escapeHtml(r.topName)} <span style="color:var(--text3)">${Math.round(r.topShare)}%</span></span></td>
      <td style="padding:11px 12px;text-align:left">${tags || '<span style="color:var(--text3)">—</span>'}</td>
    </tr>`;
  }).join('');

  body.innerHTML = `
  <div class="card"><div class="card-body" style="padding:0">
    <div style="overflow-x:auto">
      <table style="border-collapse:collapse;width:100%;min-width:720px">
        <thead><tr>
          ${th('소섹터', 'left')}${th('종목수')}${th('매출 YoY')}${th('영업이익률')}${th('영익 개선')}${th('집중 종목')}${th('특징', 'left')}
        </tr></thead>
        <tbody>${trs}</tbody>
      </table>
    </div>
  </div></div>`;
}
