/**
 * sector-flow.js — 섹터 수급 트렌드 보드
 *
 * sector_daily_summary 테이블(백엔드 17:15 집계)에서 직접 읽어 렌더링.
 * 이전: market_data 직접 집계 (복잡한 페이지네이션 + 인라인 연산)
 * 현재: 사전집계 테이블 단순 조회 → 렌더링만 담당
 *
 * 의존: sb, fmtNet, INDUSTRIES, IND_COLORS (config.js)
 */

let _sfPeriod = 5;
let _sfType   = 'combined';

const _SF_TYPES = {
  combined: { label: '합산',   posColor: '#2dce89', negColor: '#f5365c', desc: '외국인+기관 스마트머니 (KR 전체 종목 기준)' },
  foreign:  { label: '외국인', posColor: '#2AABEE', negColor: '#f5365c', desc: '외국인 순매수 (KR 전체 종목 기준)' },
  inst:     { label: '기관',   posColor: '#f59e0b', negColor: '#f5365c', desc: '기관 순매수 (KR 전체 종목 기준)'   },
};

// ── 로드 ──────────────────────────────────────────────────────────────────────
async function loadSectorFlow() {
  const el = document.getElementById('sf-body');
  if (!el) return;

  el.innerHTML = '<div style="padding:1rem;color:var(--text2);font-size:12px"><span class="loading"></span> 수급 집계 중...</div>';

  try {
    // sector_daily_summary 자체 최신 날짜로 조회 (macro_data 날짜와 불일치 방지)
    const { data: latest } = await sb.from('sector_daily_summary')
      .select('base_date')
      .order('base_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    const latestDate = latest?.base_date;
    if (!latestDate) {
      el.innerHTML =
        '<div style="padding:1rem;color:var(--text2);font-size:12px;text-align:center">' +
        '수급 데이터 없음 — 장 마감 후 (17:15) 자동 집계됩니다</div>';
      return;
    }

    // sector_daily_summary 에서 직접 조회 (백엔드 사전집계)
    const { data: rows, error } = await sb.from('sector_daily_summary')
      .select('industry,avg_chg_1d,avg_chg_5d,avg_chg_20d,foreign_net_1d,foreign_net_5d,foreign_net_20d,inst_net_1d,inst_net_5d,inst_net_20d,stock_count')
      .eq('base_date', latestDate);

    if (error) throw error;

    // 데이터 없으면 폴백 안내
    if (!rows?.length) {
      el.innerHTML =
        '<div style="padding:1rem;color:var(--text2);font-size:12px;text-align:center">' +
        '수급 데이터 없음 — 장 마감 후 (17:15) 자동 집계됩니다</div>';
      return;
    }

    // 날짜 표시
    const sfDateEl = document.getElementById('sf-date');
    if (sfDateEl) sfDateEl.textContent = latestDate + ' 기준';

    // 테이블 → 맵 구조로 변환
    // maps[type][ind][period] = value
    const maps = { combined: {}, foreign: {}, inst: {} };
    for (const r of rows) {
      const ind = r.industry;
      maps.foreign[ind]  = { d1: r.foreign_net_1d, d5: r.foreign_net_5d, d20: r.foreign_net_20d };
      maps.inst[ind]     = { d1: r.inst_net_1d,    d5: r.inst_net_5d,    d20: r.inst_net_20d    };
      maps.combined[ind] = {
        d1:  (r.foreign_net_1d  || 0) + (r.inst_net_1d  || 0) || null,
        d5:  (r.foreign_net_5d  || 0) + (r.inst_net_5d  || 0) || null,
        d20: (r.foreign_net_20d || 0) + (r.inst_net_20d || 0) || null,
      };
      // stock_count 저장
      maps._stockCount = maps._stockCount || {};
      maps._stockCount[ind] = r.stock_count || 0;
    }

    window._sfMaps = maps;
    renderSectorFlow();

  } catch(e) {
    console.error('[SectorFlow]', e);
    if (el) el.innerHTML =
      `<div style="padding:1rem;color:var(--text2);font-size:12px">집계 실패: ${e.message}</div>`;
  }
}

// ── 기간 탭 전환 ──────────────────────────────────────────────────────────────
function switchSfPeriod(p) {
  _sfPeriod = p;
  document.querySelectorAll('[data-sf-period]').forEach(b =>
    b.classList.toggle('active', Number(b.dataset.sfPeriod) === p));
  renderSectorFlow();
}

// ── 수급 타입 탭 전환 ─────────────────────────────────────────────────────────
function switchSfType(t) {
  _sfType = t;
  document.querySelectorAll('[data-sf-type]').forEach(b =>
    b.classList.toggle('active', b.dataset.sfType === t));
  const descEl = document.getElementById('sf-desc');
  if (descEl) descEl.textContent = (_SF_TYPES[t] || _SF_TYPES.combined).desc + ' (모니터링 종목 기준)';
  renderSectorFlow();
}

// ── 렌더링 ────────────────────────────────────────────────────────────────────
function renderSectorFlow() {
  const el = document.getElementById('sf-body');
  if (!el) return;

  const maps = window._sfMaps;
  if (!maps) return;

  const sectorMap  = maps[_sfType] || maps.combined;
  const typeConfig = _SF_TYPES[_sfType] || _SF_TYPES.combined;
  const key        = `d${_sfPeriod}`;

  const KR_INDS = INDUSTRIES;

  const entries = KR_INDS
    .filter(ind => sectorMap[ind])
    .map(ind => ({ ind, val: sectorMap[ind][key] ?? null }))
    .filter(e => e.val !== null)
    .sort((a, b) => b.val - a.val);

  if (!entries.length) {
    el.innerHTML = '<div style="padding:1rem;color:var(--text2);font-size:12px;text-align:center">데이터 없음</div>';
    return;
  }

  const maxAbs     = Math.max(...entries.map(e => Math.abs(e.val)), 1);
  const showSignal = _sfType === 'combined' && maps.foreign && maps.inst;
  const stockCount = maps._stockCount || {};

  el.innerHTML = entries.map(({ ind, val }) => {
    const isPos  = val >= 0;
    const color  = isPos ? typeConfig.posColor : typeConfig.negColor;
    // 양방향 바: 중앙선 기준, 최대 50%씩
    const barPct = Math.min(Math.abs(val) / maxAbs * 50, 50);
    const valStr = fmtNet(val);
    const cnt    = stockCount[ind] ? `<span style="font-size:9px;color:var(--text2)">(${stockCount[ind]})</span>` : '';

    // 합산일 때: 외국인/기관 방향 일치 여부 뱃지
    let signalBadge = '';
    if (showSignal) {
      const vf = (maps.foreign[ind] || {})[key] ?? 0;
      const vi = (maps.inst[ind]    || {})[key] ?? 0;
      if      (vf > 0 && vi > 0)
        signalBadge = `<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:rgba(45,206,137,.15);color:#2dce89;font-weight:600;flex-shrink:0">외↑기↑</span>`;
      else if (vf < 0 && vi < 0)
        signalBadge = `<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:rgba(245,54,92,.12);color:#f5365c;font-weight:600;flex-shrink:0">외↓기↓</span>`;
      else if (vf !== 0 || vi !== 0)
        signalBadge = `<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:rgba(245,158,11,.12);color:#f59e0b;font-weight:600;flex-shrink:0">엇갈림</span>`;
    }

    return `
    <div style="display:flex;align-items:center;gap:8px;padding:5px 12px;border-bottom:1px solid var(--border)">
      <span style="min-width:60px;font-size:12px;color:var(--text1);flex-shrink:0">${ind} ${cnt}</span>
      <!-- 양방향 바: 중앙선 기준 -->
      <div style="flex:1;height:6px;border-radius:3px;background:rgba(255,255,255,.06);position:relative;overflow:hidden">
        <div style="position:absolute;top:0;height:100%;width:${barPct}%;background:${color};border-radius:3px;transition:width .4s ease;${isPos ? 'left:50%' : `right:50%`}"></div>
        <div style="position:absolute;top:0;left:50%;width:1px;height:100%;background:rgba(255,255,255,.2)"></div>
      </div>
      ${signalBadge}
      <span style="min-width:58px;text-align:right;font-size:12px;font-weight:600;color:${color}">${valStr}</span>
    </div>`;
  }).join('');

  if (typeof _syncSfImHeight === 'function') _syncSfImHeight();
}

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

    // 날짜 표시
    const dateEl = document.getElementById('stockflow-date');
    if (dateEl) dateEl.textContent = `${dates[dates.length - 1]} ~ ${latestDate} 기준`;

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
    <div style="display:flex;align-items:center;gap:8px;padding:5px 12px;border-bottom:1px solid var(--border)">
      <div style="min-width:90px">
        <div style="font-size:12px;font-weight:600">${e.corp_name}</div>
        <div style="font-size:10px;color:var(--text2)">${e.industry}</div>
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
