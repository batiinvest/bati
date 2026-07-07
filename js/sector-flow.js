/**
 * sector-flow.js — 종목별 수급 순위 (10거래일 누적 외국인/기관 순매수)
 *
 * Zone C(심화 분석)의 '종목별 수급 순위' 카드 전용.
 * 산업별 수급동향(섹터 단위)은 sector-rotation.js로 이관됨.
 *
 * 의존: sb, fmtNet, getIndustryMap, openMarketDetail, wlBadge (config.js / financials.js)
 */

// ══════════════════════════════════════════════════════════════════════════════
//  종목별 수급 순위 — 10거래일 누적 외국인/기관 순매수
// ══════════════════════════════════════════════════════════════════════════════

let _sfStockType = 'foreign';
let _sfStockData = null;   // { dates, byCode: { code: { corp_name, foreign_sum, inst_sum, combined_sum } } }

async function loadStockFlow() {
  const el = document.getElementById('stockflow-body');
  if (!el) return;

  try {
    // 최신 10거래일 날짜 조회
    const { data: dateRows } = await sb.from('market_data')
      .select('base_date')
      .order('base_date', { ascending: false })
      .limit(10);
    if (!dateRows?.length) { el.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--text2);font-size:12px">데이터 없음</div>'; return; }

    const dates    = dateRows.map(r => r.base_date);
    const latestDate = dates[0];

    // 모니터링 종목 코드 목록 (getIndustryMap 캐시 활용)
    const indMap = await getIndustryMap();
    const monCodes = Object.keys(indMap);
    if (!monCodes.length) { el.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--text2);font-size:12px">종목 데이터 없음</div>'; return; }

    // 10거래일치 market_data 조회 — 모니터링 종목만, 청크 500개 단위
    const chunkSize = 500;
    const allRows = [];
    for (let i = 0; i < monCodes.length; i += chunkSize) {
      const chunk = monCodes.slice(i, i + chunkSize);
      const { data } = await sb.from('market_data')
        .select('stock_code,corp_name,base_date,foreign_net_buy,institution_net_buy')
        .in('stock_code', chunk)
        .in('base_date', dates);
      if (data) allRows.push(...data);
    }

    // 종목별 누적 집계
    const byCode = {};
    for (const r of allRows) {
      if (!byCode[r.stock_code]) {
        byCode[r.stock_code] = {
          corp_name:    r.corp_name,
          industry:     indMap[r.stock_code] || '',
          foreign_sum:  0,
          inst_sum:     0,
        };
      }
      byCode[r.stock_code].foreign_sum += r.foreign_net_buy    || 0;
      byCode[r.stock_code].inst_sum    += r.institution_net_buy || 0;
    }

    // combined 계산
    for (const v of Object.values(byCode)) {
      v.combined_sum = v.foreign_sum + v.inst_sum;
    }

    _sfStockData = { dates, byCode };

    setAsOf('stockflow-date', `${dates[dates.length - 1]} ~ ${latestDate}`);

    renderStockFlow();
  } catch(e) {
    console.error('[StockFlow]', e);
    const el2 = document.getElementById('stockflow-body');
    if (el2) el2.innerHTML = `<div style="padding:1rem;color:var(--text2);font-size:12px">조회 실패: ${e.message}</div>`;
  }
}

function switchStockFlowType(type) {
  _sfStockType = type;
  document.querySelectorAll('[data-sflow-type]').forEach(b =>
    b.classList.toggle('active', b.dataset.sflowType === type));
  renderStockFlow();
}

function renderStockFlow() {
  const el = document.getElementById('stockflow-body');
  if (!el || !_sfStockData) return;

  const key = _sfStockType === 'foreign' ? 'foreign_sum'
            : _sfStockType === 'inst'    ? 'inst_sum'
            : 'combined_sum';

  const entries = Object.entries(_sfStockData.byCode)
    .map(([code, v]) => ({ code, corp_name: v.corp_name, industry: v.industry, val: v[key] }))
    .filter(e => e.val !== 0);

  entries.sort((a, b) => b.val - a.val);

  const top10  = entries.slice(0, 10);
  const bot10  = entries.slice(-10).reverse();
  const maxAbs = Math.max(...entries.map(e => Math.abs(e.val)), 1);

  const renderRows = (list, isPositive) => list.map(e => {
    const color  = isPositive ? 'var(--tg)' : 'var(--red)';
    const barPct = Math.min(Math.abs(e.val) / maxAbs * 100, 100);
    return `
    <div class="stock-row" data-stock-open="${e.code}" data-stock-name="${escAttr(e.corp_name||e.code)}" data-stock-tab="market"
      style="display:flex;align-items:center;gap:8px;padding:5px 12px;border-bottom:1px solid var(--border)">
      <div style="min-width:90px">
        <div style="font-size:12px;font-weight:600;display:flex;align-items:center;gap:5px">${e.corp_name}${typeof wlBadge==='function'?wlBadge(e.code):''}</div>
        <div style="font-size:11px;color:var(--text2)">${e.industry}</div>
      </div>
      <div style="flex:1;height:5px;background:rgba(255,255,255,.06);border-radius:3px;overflow:hidden">
        <div style="width:${barPct}%;height:100%;background:${color};border-radius:3px"></div>
      </div>
      <span style="min-width:64px;text-align:right;font-size:12px;font-weight:600;color:${color}">${fmtNet(e.val)}</span>
    </div>`;
  }).join('');

  el.innerHTML = `
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:0">
    <div>
      <div style="font-size:11px;font-weight:600;color:var(--tg);padding:6px 12px 4px;border-bottom:1px solid var(--border)">
        📈 순매수 상위 10
      </div>
      ${renderRows(top10, true)}
    </div>
    <div style="border-left:1px solid var(--border)">
      <div style="font-size:11px;font-weight:600;color:var(--red);padding:6px 12px 4px;border-bottom:1px solid var(--border)">
        📉 순매도 상위 10
      </div>
      ${renderRows(bot10, false)}
    </div>
  </div>`;
}
