/**
 * sector-flow.js — 섹터 수급 트렌드 보드
 *
 * 최근 N 거래일 산업별 외국인 순매수 집계 → 방향성 시각화
 * 별도 백엔드 없이 프론트 직접 집계:
 *   1) macro_data에서 최근 25 거래일 목록 구하기
 *   2) market_data에서 모니터링 종목 × N일 foreign_net_buy 조회
 *   3) getIndustryMap() 캐시로 stock_code → industry 조인
 *   4) 산업별 기간별 합산 후 막대 렌더링
 *
 * 의존: sb, KR_INDUSTRIES, getIndustryMap (config.js)
 */

let _sfPeriod = 3;  // 기본 3일

// ── 로드 ──────────────────────────────────────────────────────────────────────
async function loadSectorFlow() {
  const el = document.getElementById('sf-body');
  if (!el) return;

  el.innerHTML = '<div style="padding:1rem;color:var(--text3);font-size:12px"><span class="loading"></span> 수급 집계 중...</div>';

  try {
    // ─ 최근 25 거래일 목록 (macro_data는 거래일마다 1행) ─
    const latestDate = (window._macroData || {}).base_date;
    if (!latestDate) {
      el.innerHTML = '<div style="padding:1rem;color:var(--text3);font-size:12px">시장 데이터 미로드</div>';
      return;
    }

    const { data: macroRows } = await sb.from('macro_data')
      .select('base_date')
      .lte('base_date', latestDate)
      .order('base_date', { ascending: false })
      .limit(25);

    const tradingDays = (macroRows || []).map(r => r.base_date);
    if (!tradingDays.length) {
      el.innerHTML = '<div style="padding:1rem;color:var(--text3);font-size:12px">거래일 데이터 없음</div>';
      return;
    }

    const cutoffDate = tradingDays[tradingDays.length - 1];

    // ─ 모니터링 종목 코드 목록 (캐시 재활용) ─
    const industryMap = await getIndustryMap();
    const codes = Object.keys(industryMap);
    if (!codes.length) {
      el.innerHTML = '<div style="padding:1rem;color:var(--text3);font-size:12px">모니터링 종목 없음</div>';
      return;
    }

    // ─ foreign_net_buy 조회 ─
    const { data: flowRows, error } = await sb.from('market_data')
      .select('base_date,stock_code,foreign_net_buy')
      .in('stock_code', codes)
      .gte('base_date', cutoffDate)
      .lte('base_date', latestDate)
      .not('foreign_net_buy', 'is', null)
      .limit(10000);

    if (error) throw error;

    // ─ 거래일 인덱스 맵 (0 = 가장 최근) ─
    const dayIdx = {};
    tradingDays.forEach((d, i) => { dayIdx[d] = i; });

    // ─ 산업별 집계 ─
    const KR_INDS = (typeof KR_INDUSTRIES !== 'undefined' ? KR_INDUSTRIES : null)
                 || (typeof INDUSTRIES    !== 'undefined' ? INDUSTRIES    : null)
                 || [];
    const sectorMap = {};
    KR_INDS.forEach(ind => { sectorMap[ind] = { d1: 0, d3: 0, d5: 0, d20: 0 }; });

    for (const row of (flowRows || [])) {
      const ind = industryMap[row.stock_code];
      if (!ind || !sectorMap[ind]) continue;
      const idx = dayIdx[row.base_date];
      if (idx === undefined) continue;
      const val = row.foreign_net_buy || 0;
      if (idx < 1)  sectorMap[ind].d1  += val;
      if (idx < 3)  sectorMap[ind].d3  += val;
      if (idx < 5)  sectorMap[ind].d5  += val;
      if (idx < 20) sectorMap[ind].d20 += val;
    }

    window._sfSectorMap   = sectorMap;
    window._sfTradingDays = tradingDays;

    // 날짜 범위 표시
    const sfDateEl = document.getElementById('sf-date');
    if (sfDateEl) {
      const d5  = tradingDays[Math.min(4,  tradingDays.length - 1)];
      const d20 = tradingDays[Math.min(19, tradingDays.length - 1)];
      sfDateEl.textContent = `${d20} ~ ${latestDate}`;
    }

    renderSectorFlow();
  } catch(e) {
    console.error('[SectorFlow]', e);
    const elE = document.getElementById('sf-body');
    if (elE) elE.innerHTML = `<div style="padding:1rem;color:var(--text3);font-size:12px">집계 실패: ${e.message}</div>`;
  }
}

// ── 기간 탭 전환 ──────────────────────────────────────────────────────────────
function switchSfPeriod(p) {
  _sfPeriod = p;
  document.querySelectorAll('[data-sf-period]').forEach(b =>
    b.classList.toggle('active', Number(b.dataset.sfPeriod) === p));
  renderSectorFlow();
}

// ── 렌더링 ────────────────────────────────────────────────────────────────────
function renderSectorFlow() {
  const el = document.getElementById('sf-body');
  if (!el) return;

  const sectorMap = window._sfSectorMap;
  if (!sectorMap) return;

  const key = `d${_sfPeriod}`;
  const KR_INDS = (typeof KR_INDUSTRIES !== 'undefined' ? KR_INDUSTRIES : null)
               || (typeof INDUSTRIES    !== 'undefined' ? INDUSTRIES    : null)
               || [];

  const entries = KR_INDS
    .filter(ind => sectorMap[ind])
    .map(ind => ({ ind, val: sectorMap[ind][key] ?? 0 }))
    .sort((a, b) => b.val - a.val);

  if (!entries.length) {
    el.innerHTML = '<div style="padding:1rem;color:var(--text3);font-size:12px;text-align:center">데이터 없음</div>';
    return;
  }

  const maxAbs = Math.max(...entries.map(e => Math.abs(e.val)), 1);

  el.innerHTML = entries.map(({ ind, val }) => {
    const pct    = Math.round(Math.abs(val) / maxAbs * 100);
    const isPos  = val >= 0;
    const color  = isPos ? '#2dce89' : '#f5365c';
    const fab    = Math.abs(val);
    // foreign_net_buy 단위: 백만원 → 억 = fab/100
    const valStr = (isPos ? '+' : '-') + (fab >= 1e6 ? (fab / 1e6).toFixed(1) + '조' : Math.round(fab / 100) + '억');

    return `
    <div style="display:flex;align-items:center;gap:8px;padding:5px 12px;border-bottom:1px solid var(--border)">
      <span style="min-width:52px;font-size:12px;color:var(--text2);flex-shrink:0">${ind}</span>
      <div style="flex:1;height:6px;border-radius:3px;background:rgba(255,255,255,.06);overflow:hidden">
        <div style="height:100%;width:${pct}%;background:${color};border-radius:3px;transition:width .4s ease"></div>
      </div>
      <span style="min-width:56px;text-align:right;font-size:12px;font-weight:600;color:${color}">${valStr}</span>
    </div>`;
  }).join('');
}
