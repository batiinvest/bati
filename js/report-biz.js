// report-biz.js — 기업 분석 리포트: 사업분석 탭 (DART 4-1~4-6 그래프 + 표)
// 매출(제품)·매출(국내/해외)·원재료·원재료 가격추이·생산력·수주현황
// 의존: config.js(sb·fmtCap·escapeHtml), report-fnguide.js(_rpSecT), report-cards.js(_rpSegLabel), report.js(_rpStock)

const BIZ_COLORS = ['#2AABEE','#4ade80','#fb923c','#a78bfa','#f59e0b','#34d399','#f87171','#60a5fa','#22d3ee','#e879f9'];

// 매출(국내/해외) 품목 필터 상태
let _rpBizRegion = null;      // { mR, rColor, prods }
let _rpBizRegionSel = null;   // 선택 품목 (null = 전체)

// ── 탭 진입: 6종 데이터 병렬 로드 후 렌더 ────────────────────────────────────
async function _rpLoadAndRenderBiz(body) {
  if (!_rpStock || !body) return;
  try {
    const code = _rpStock.code;
    const [segRes, rawRes, prodRes] = await Promise.all([
      sb.from('dart_segment_revenue').select('bsns_year,quarter,segment_type,category,subcategory,revenue,revenue_ratio')
        .eq('stock_code', code).order('bsns_year', { ascending: true }).order('quarter', { ascending: true }),
      sb.from('dart_raw_material').select('bsns_year,quarter,data_type,product_name,material_name,origin,amount')
        .eq('stock_code', code).order('bsns_year', { ascending: true }).order('quarter', { ascending: true }),
      sb.from('dart_production').select('bsns_year,quarter,factory_name,capacity,actual,utilization_rate')
        .eq('stock_code', code).order('bsns_year', { ascending: true }).order('quarter', { ascending: true }),
    ]);
    const seg = segRes.data || [], raw = rawRes.data || [], prod = prodRes.data || [];
    body.innerHTML = _rpBizTab({
      product: seg.filter(r => r.segment_type === 'product'),
      region:  seg.filter(r => r.segment_type === 'region'),
      backlog: seg.filter(r => r.segment_type === 'backlog'),
      rawUsage: raw.filter(r => r.data_type === 'usage'),
      rawPrice: raw.filter(r => r.data_type === 'price'),
      prod,
    });
  } catch (e) {
    body.innerHTML = `<div style="padding:20px;text-align:center;color:var(--red);font-size:calc(12px*var(--m-sub))">사업분석 로드 실패: ${e.message}</div>`;
  }
}

// ── 공용: 시계열 매트릭스 { periods[], items[], dataMap{key:{item:val}} } ──────
function _bizMatrix(rows, keyFn, valFn) {
  const periods = [], seen = new Set(), items = [], iseen = new Set(), dataMap = {};
  for (const r of rows) {
    const pk = `${r.bsns_year}.${r.quarter}`;
    if (!seen.has(pk)) {
      seen.add(pk);
      periods.push({ key: pk, year: +r.bsns_year, q: r.quarter,
        sort: (+r.bsns_year) * 10 + (parseInt(String(r.quarter).replace(/\D/g, '')) || 0) });
    }
    const name = keyFn(r);
    if (name == null || name === '') continue;
    if (!iseen.has(name)) { iseen.add(name); items.push(name); }
    (dataMap[pk] ||= {});
    dataMap[pk][name] = (dataMap[pk][name] || 0) + (valFn(r) || 0);
  }
  periods.sort((a, b) => a.sort - b.sort);
  return { periods, items, dataMap };
}

// ── 공용: 잡음 시리즈 제거 — 최신 기간에 없고 3개 기간 미만만 등장하는 항목 제외 ──
// (같은 섹션에 섞여든 스냅샷/계약 행 등 시계열이 아닌 잡음 카테고리 방어)
function _bizSeriesClean(rows, keyFn) {
  if (!rows.length) return rows;
  const pk = r => `${r.bsns_year}.${r.quarter}`;
  const periods = [...new Set(rows.map(pk))].sort((a, b) => {
    const [ay, aq] = a.split('.'), [by, bq] = b.split('.');
    return (+ay) - (+by) || (parseInt(aq.replace(/\D/g, '')) || 0) - (parseInt(bq.replace(/\D/g, '')) || 0);
  });
  const latest = periods[periods.length - 1];
  const cnt = {}, inLatest = {};
  for (const r of rows) { const k = keyFn(r); if (k == null || k === '') continue; cnt[k] = (cnt[k] || 0) + 1; if (pk(r) === latest) inLatest[k] = true; }
  const keep = new Set(Object.keys(cnt).filter(k => inLatest[k] || cnt[k] >= 3));
  return rows.filter(r => keep.has(keyFn(r)));
}

// ── 공용: 누적 막대 그래프 (비인터랙티브) ────────────────────────────────────
function _bizStack(m, opts) {
  const o = opts || {}, fmt = o.fmt || (v => Math.round(v).toLocaleString());
  const COLORS = o.colors || BIZ_COLORS, lastN = o.lastN || m.periods.length, H = 150;
  const ps = m.periods.slice(-lastN);
  if (!ps.length || !m.items.length) return '';
  const last = m.dataMap[ps[ps.length - 1].key] || {};
  const its = [...m.items].sort((a, b) => (last[b] || 0) - (last[a] || 0));
  const colorOf = o.colorFn ? (n, i) => o.colorFn(n) : (n, i) => COLORS[i % COLORS.length];
  const totals = ps.map(p => its.reduce((s, n) => s + ((m.dataMap[p.key] || {})[n] || 0), 0));
  const maxT = Math.max(...totals, 1);
  const bars = ps.map((p, pi) => {
    const total = totals[pi], bh = Math.max(3, Math.round(total / maxT * H)), isLast = pi === ps.length - 1;
    const segs = its.map((n, i) => ({ n, v: (m.dataMap[p.key] || {})[n] || 0, c: colorOf(n, i) })).filter(s => s.v > 0).reverse();
    return `<div style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:flex-end;height:${H}px">
      <div style="font-size:calc(10px*var(--m-label));color:var(--text2);text-align:center;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${total ? fmt(total) : ''}</div>
      <div style="height:${bh}px;border-radius:2px 2px 0 0;overflow:hidden;display:flex;flex-direction:column;${isLast ? 'box-shadow:0 0 0 2px rgba(255,255,255,.18)' : ''}">
        ${segs.map(s => `<div style="flex:${s.v};background:${s.c};min-height:1px" title="${escapeHtml(s.n)}: ${fmt(s.v)}"></div>`).join('')}
      </div>
    </div>`;
  }).join('');
  const labels = ps.map((p, pi) => `<div style="flex:1;min-width:0;text-align:center;font-size:calc(10px*var(--m-label));
    color:${pi === ps.length - 1 ? 'var(--tg)' : 'var(--text3)'}">${String(p.year).slice(2)}<br>${p.q}</div>`).join('');
  const legend = its.map((n, i) => `<span style="display:inline-flex;align-items:center;gap:4px;font-size:calc(11px*var(--m-label));color:var(--text2)">
    <span style="width:8px;height:8px;border-radius:2px;background:${colorOf(n, i)};flex-shrink:0"></span>${escapeHtml(n)}</span>`).join('');
  return `<div style="display:flex;align-items:flex-end;gap:4px">${bars}</div>
    <div style="display:flex;gap:4px;margin-top:3px">${labels}</div>
    <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:8px">${legend}</div>`;
}

// ── 공용: 멀티 라인 그래프 (가격 추이 등) ────────────────────────────────────
function _bizLines(m, opts) {
  const o = opts || {}, fmt = o.fmt || (v => v.toLocaleString());
  const COLORS = o.colors || BIZ_COLORS, lastN = o.lastN || m.periods.length;
  const ps = m.periods.slice(-lastN);
  if (ps.length < 2 || !m.items.length) return '';
  const all = [];
  m.items.forEach(n => ps.forEach(p => { const v = (m.dataMap[p.key] || {})[n]; if (v != null) all.push(v); }));
  if (!all.length) return '';
  const mn = Math.min(...all), mx = Math.max(...all), rg = (mx - mn) || 1;
  const W = 640, H = 140, PAD = 8;
  const X = i => ps.length > 1 ? (i / (ps.length - 1)) * W : W / 2;
  const Y = v => PAD + (1 - (v - mn) / rg) * (H - 2 * PAD);
  const lines = m.items.map((n, i) => {
    const pts = ps.map((p, pi) => { const v = (m.dataMap[p.key] || {})[n]; return v == null ? null : `${X(pi).toFixed(1)},${Y(v).toFixed(1)}`; }).filter(Boolean).join(' ');
    const c = COLORS[i % COLORS.length];
    const lp = ps.length - 1, lv = (m.dataMap[ps[lp].key] || {})[n];
    return `<polyline points="${pts}" fill="none" stroke="${c}" stroke-width="1.8" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`
      + (lv != null ? `<circle cx="${X(lp).toFixed(1)}" cy="${Y(lv).toFixed(1)}" r="2.6" fill="${c}"/>` : '');
  }).join('');
  const legend = m.items.map((n, i) => {
    const c = COLORS[i % COLORS.length], lv = (m.dataMap[ps[ps.length - 1].key] || {})[n];
    return `<span style="display:inline-flex;align-items:center;gap:5px;font-size:calc(11px*var(--m-label));color:var(--text2)">
      <span style="width:11px;height:2px;background:${c};flex-shrink:0"></span>${escapeHtml(n)}${lv != null ? ` <b style="color:var(--text1)">${fmt(lv)}</b>` : ''}</span>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:150px;display:block" preserveAspectRatio="none">${lines}</svg>
    <div style="display:flex;justify-content:space-between;font-size:calc(10px*var(--m-label));color:var(--text3);margin-top:2px">
      <span>${ps[0].year} ${ps[0].q}</span><span>${ps[ps.length - 1].year} ${ps[ps.length - 1].q}</span></div>
    <div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:8px">${legend}</div>`;
}

// ── 공용: 항목 × 기간 표 ─────────────────────────────────────────────────────
function _bizTable(m, opts) {
  const o = opts || {}, fmt = o.fmt || (v => v == null ? '—' : Math.round(v).toLocaleString());
  const lastN = o.lastN || m.periods.length;
  const ps = m.periods.slice(-lastN);
  if (!ps.length || !m.items.length) return '';
  const last = m.dataMap[ps[ps.length - 1].key] || {};
  const its = [...m.items].sort((a, b) => (last[b] || 0) - (last[a] || 0));
  const th = (t, al) => `<th style="padding:6px 8px;text-align:${al || 'left'};color:var(--text2);font-weight:600;
    border-bottom:1px solid var(--border);white-space:nowrap">${t}</th>`;
  const head = `<tr style="background:var(--bg3)">${th(o.label || '항목')}${ps.map(p => th(`${String(p.year).slice(2)} ${p.q}`, 'right')).join('')}</tr>`;
  const body = its.map(n => `<tr>
    <td style="padding:6px 8px;color:var(--text1);font-weight:600;border-bottom:1px solid var(--border);white-space:nowrap">${escapeHtml(n)}</td>
    ${ps.map((p, i) => { const v = (m.dataMap[p.key] || {})[n], isLast = i === ps.length - 1;
      return `<td style="padding:6px 8px;text-align:right;border-bottom:1px solid var(--border);font-variant-numeric:tabular-nums;
        color:${isLast ? 'var(--text1)' : 'var(--text2)'};${isLast ? 'font-weight:700' : ''}">${v == null ? '—' : fmt(v)}</td>`; }).join('')}
  </tr>`).join('');
  const sumRow = o.sum === false ? '' : `<tr style="background:var(--bg3)">
    <td style="padding:6px 8px;font-weight:700;color:var(--text1);border-top:2px solid var(--border)">합계</td>
    ${ps.map(p => { const t = its.reduce((s, n) => s + ((m.dataMap[p.key] || {})[n] || 0), 0);
      return `<td style="padding:6px 8px;text-align:right;font-weight:700;color:var(--text1);border-top:2px solid var(--border);font-variant-numeric:tabular-nums">${fmt(t)}</td>`; }).join('')}
  </tr>`;
  return `<div style="overflow-x:auto;margin-top:10px"><table style="width:100%;border-collapse:collapse;font-size:calc(12px*var(--m-sub));white-space:nowrap">
    <thead>${head}</thead><tbody>${body}${sumRow}</tbody></table></div>`;
}

// ── 탭 본문 조립 ─────────────────────────────────────────────────────────────
function _rpBizTab({ product, region, backlog, rawUsage, rawPrice, prod }) {
  const box = inner => `<div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px">${inner}</div>`;
  const secT = (t, r) => typeof _rpSecT === 'function' ? _rpSecT(t, r || '')
    : `<div style="font-size:calc(13px*var(--m-body));font-weight:700;margin-bottom:10px">${t}</div>`;
  const empty = msg => `<div style="font-size:calc(12px*var(--m-sub));color:var(--text3);padding:20px 0;text-align:center">${msg}</div>`;
  const label = typeof _rpSegLabel === 'function' ? _rpSegLabel : (r => (r.category || '').trim());
  const fmtEok = v => fmtCap(v * 1e6);            // 그래프 총계: 억
  const fmtMil = v => v == null ? '—' : Math.round(v).toLocaleString();  // 표: 백만원 원값
  const section = (title, sub, hasData, inner, emptyMsg) => box(secT(title, sub) + (hasData ? inner : empty(emptyMsg)));

  // ① 매출(제품)
  const pRows = (product || []).filter(r => (r.category || '').trim() !== '합계' && (r.subcategory || '').trim() !== '합계');
  const mP = _bizMatrix(pRows, label, r => +r.revenue || 0);
  const s1 = section('매출 (제품별)', '단위: 백만원 · 그래프 총계는 억', mP.items.length,
    _bizStack(mP, { fmt: fmtEok }) + _bizTable(mP, { label: '제품', fmt: fmtMil }),
    'DART 업로드 시 제품별 매출이 표시됩니다');

  // ② 매출(국내/해외) — 품목(반도체/디스플레이/태양전지) × 내수/수출 구분
  const isDom = s => /내수|국내/.test(s || ''), isExp = s => /수출|해외/.test(s || '');
  const rRows = (region || []).filter(r => (r.category || '').trim() !== '합계' && (r.subcategory || '').trim() !== '합계');
  const rKey = r => {                                        // "반도체 장비 · 내수"
    const subAxis = isDom(r.subcategory) || isExp(r.subcategory);
    const axis = subAxis ? r.subcategory : r.category;
    const prod = ((subAxis ? r.category : r.subcategory) || '').trim();
    const ax = isDom(axis) ? '내수' : isExp(axis) ? '수출' : null;
    return ax ? (prod ? `${prod} · ${ax}` : ax) : null;
  };
  const mR = _bizMatrix(rRows, rKey, r => +r.revenue || 0);
  // 내수=초록 계열 / 수출=주황 계열, 품목별 명암으로 구분
  const rProds = [...new Set(mR.items.map(n => n.replace(/ · (내수|수출)$/, '')))];
  const domSh = ['#16a34a', '#22c55e', '#4ade80', '#86efac'], expSh = ['#ea580c', '#f97316', '#fb923c', '#fdba74'];
  const rColor = n => {
    const pi = Math.max(0, rProds.indexOf(n.replace(/ · (내수|수출)$/, '')));
    return /내수/.test(n) ? domSh[pi % domSh.length] : /수출/.test(n) ? expSh[pi % expSh.length] : '#60a5fa';
  };
  // 인터랙티브 필터 상태 저장 — 품목 칩으로 그래프 필터 (전체 → 품목 클릭 시 해당 품목 내수/수출만)
  _rpBizRegion = mR.items.length ? { mR, rColor, prods: rProds } : null;
  _rpBizRegionSel = null;
  const s2 = box(secT('매출 (국내/해외)', '단위: 백만원 · 품목 선택 시 내수/수출만')
    + (mR.items.length
      ? _bizRegionChips(rProds) + `<div id="rp-biz-region-chart">${_rpBizRegionChart(null)}</div>` + _bizTable(mR, { label: '품목 · 구분', fmt: fmtMil })
      : empty('DART 업로드 시 내수/수출 매출이 표시됩니다')));

  // ③ 원재료 (매입/투입)
  const uRows = (rawUsage || []).filter(r => (r.product_name || '').trim() !== '합계' && (r.material_name || '').trim() !== '합계');
  const mU = _bizMatrix(uRows, r => r.material_name, r => +r.amount || 0);
  const s3 = section('원재료 (매입/투입)', '단위: 백만원 · 그래프 총계는 억', mU.items.length,
    _bizStack(mU, { fmt: fmtEok }) + _bizTable(mU, { label: '원재료', fmt: fmtMil }),
    'DART 업로드 시 원재료 매입/투입이 표시됩니다');

  // ④ 원재료 가격추이 (단가)
  const mPr = _bizMatrix((rawPrice || []).filter(r => (r.material_name || '').trim() !== '합계'), r => r.material_name, r => +r.amount || 0);
  const s4 = section('원재료 가격추이', '평균단가 추이', mPr.items.length,
    _bizLines(mPr, {}) + _bizTable(mPr, { label: '원재료', fmt: fmtMil, sum: false }),
    'DART 업로드 시 원재료 단가 추이가 표시됩니다');

  // ⑤ 생산력 (생산능력·생산실적·가동률)
  const s5 = box(secT('생산능력 및 가동률', prod && prod.length ? '단위: 공시값' : '') + _bizProduction(prod || []));

  // ⑥ 수주현황 (수주잔고 기말)
  const bRows = _bizSeriesClean((backlog || []).filter(r => (r.category || '').trim() !== '합계'), r => (r.category || '').trim());
  const mB = _bizMatrix(bRows, r => r.category, r => +r.revenue || 0);
  const s6 = section('수주현황 (수주잔고 · 기말)', '단위: 백만원 · 그래프 총계는 억', mB.items.length,
    _bizStack(mB, { fmt: fmtEok }) + _bizTable(mB, { label: '품목', fmt: fmtMil }),
    'DART 업로드 시 수주잔고 추이가 표시됩니다');

  const allEmpty = !mP.items.length && !mR.items.length && !mU.items.length && !mPr.items.length && !(prod && prod.length) && !mB.items.length;
  if (allEmpty) return `<div style="padding:40px;text-align:center;color:var(--text2);font-size:calc(13px*var(--m-body))">
    <div style="font-size:calc(26px*var(--m-title));margin-bottom:10px">📊</div>사업분석 데이터가 없습니다.<br>
    <span style="font-size:calc(12px*var(--m-sub));color:var(--text3)">DART 분석 MD를 업로드하면 매출·원재료·생산·수주 데이터가 표시됩니다.</span></div>`;

  return `<div style="display:flex;flex-direction:column;gap:12px">${s1}${s2}${s3}${s4}${s5}${s6}</div>`;
}

// ── 매출(국내/해외) 품목 필터 ────────────────────────────────────────────────
function _bizFilterItems(m, pred) {
  const items = m.items.filter(pred), set = new Set(items), dataMap = {};
  for (const k in m.dataMap) {
    const o = {}, src = m.dataMap[k];
    for (const n in src) if (set.has(n)) o[n] = src[n];
    dataMap[k] = o;
  }
  return { periods: m.periods, items, dataMap };
}

function _bizRegionChips(prods) {
  const esc = escapeHtml, js = typeof escJsStr === 'function' ? escJsStr : (s => String(s).replace(/'/g, "\\'"));
  return `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">
    ${['전체', ...prods].map(p => {
      const on = (_rpBizRegionSel || '전체') === p;
      return `<button onclick="rpBizRegionSel('${js(p)}')" data-biz-reg="${esc(p)}"
        style="padding:3px 12px;font-size:calc(11px*var(--m-label));font-weight:600;border:1px solid var(--border);border-radius:100px;cursor:pointer;
          background:${on ? 'var(--tg)' : 'transparent'};color:${on ? '#fff' : 'var(--text2)'}">${esc(p)}</button>`;
    }).join('')}
  </div>`;
}

function _rpBizRegionChart(sel) {
  if (!_rpBizRegion) return '';
  const { mR, rColor } = _rpBizRegion;
  const m = sel ? _bizFilterItems(mR, n => n.indexOf(sel + ' · ') === 0) : mR;
  return _bizStack(m, { fmt: v => fmtCap(v * 1e6), colorFn: rColor });
}

function rpBizRegionSel(prod) {
  if (!_rpBizRegion) return;
  _rpBizRegionSel = (prod === '전체' || _rpBizRegionSel === prod) ? null : prod;
  const el = document.getElementById('rp-biz-region-chart');
  if (el) el.innerHTML = _rpBizRegionChart(_rpBizRegionSel);
  document.querySelectorAll('[data-biz-reg]').forEach(b => {
    const on = b.getAttribute('data-biz-reg') === (_rpBizRegionSel || '전체');
    b.style.background = on ? 'var(--tg)' : 'transparent';
    b.style.color = on ? '#fff' : 'var(--text2)';
  });
}

// ── 생산력 렌더 (가동률 라인 + 생산실적 추이 + 생산능력 최신) ────────────────
function _bizProduction(prod) {
  if (!prod.length) return `<div style="font-size:calc(12px*var(--m-sub));color:var(--text3);padding:16px 0;text-align:center">
    이 종목은 생산능력·가동률을 공시하지 않습니다 (장비/서비스업 등).</div>`;
  const esc = escapeHtml, fmtN = v => v == null ? '—' : Math.round(v).toLocaleString();
  const items = prod.filter(r => r.factory_name !== '평균가동률');   // 품목별 능력/실적
  const util  = prod.filter(r => r.utilization_rate != null);        // 가동률(평균가동률 등)
  let html = '';

  // ① 가동률 추이 라인
  const mUtil = _bizMatrix(util, r => r.factory_name, r => +r.utilization_rate);
  if (mUtil.items.length) {
    const lastKey = mUtil.periods[mUtil.periods.length - 1]?.key;
    const lastU = (mUtil.dataMap[lastKey] || {})[mUtil.items[0]];
    html += `<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px">
      <span style="font-size:calc(11px*var(--m-label));color:var(--text2)">가동률 추이 (%)</span>
      ${lastU != null ? `<span style="font-size:calc(11px*var(--m-label));color:var(--text3)">최신 <b style="color:${lastU < 60 ? '#f5a623' : 'var(--tg)'}">${lastU.toFixed(1)}%</b></span>` : ''}</div>`
      + _bizLines(mUtil, { fmt: v => v.toFixed(1) + '%' });
  }

  // ② 생산실적 추이 (품목별, 대)
  const mAct = _bizMatrix(items.filter(r => r.actual != null), r => r.factory_name, r => +r.actual);
  if (mAct.items.length) {
    html += `<div style="font-size:calc(11px*var(--m-label));color:var(--text2);margin:14px 0 4px">생산실적 추이 (대)</div>`
      + _bizStack(mAct, { fmt: v => v.toLocaleString() }) + _bizTable(mAct, { label: '생산실적(대)', fmt: fmtN });
  }

  // ③ 생산능력 최신 (품목별 칩)
  const periods = [...new Set(items.map(r => `${r.bsns_year}.${r.quarter}`))];
  const lastKey = periods[periods.length - 1];
  const capRows = items.filter(r => `${r.bsns_year}.${r.quarter}` === lastKey && r.capacity != null);
  if (capRows.length) {
    html += `<div style="font-size:calc(11px*var(--m-label));color:var(--text2);margin-top:14px">생산능력 <span style="color:var(--text3)">(${(lastKey || '').replace('.', ' ')})</span></div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px">
        ${capRows.map(r => `<span style="padding:4px 11px;background:var(--bg3);border-radius:100px;font-size:calc(12px*var(--m-sub))">
          <span style="color:var(--text2)">${esc(r.factory_name)}</span> <b style="color:var(--text1)">${fmtN(r.capacity)}대</b></span>`).join('')}
      </div>`;
  }

  return html || `<div style="font-size:calc(12px*var(--m-sub));color:var(--text3);padding:16px 0;text-align:center">생산 데이터 파싱 실패</div>`;
}
