/**
 * sector-flow.js — 섹터 수급 트렌드 보드
 *
 * 외국인 + 기관 합산(스마트머니) 기본 표시 / 탭으로 분리 가능
 *   - 합산: 외국인+기관 동반매수=강한 신호 / 엇갈림=경계
 *   - 외국인: EM 자금흐름·환율 연동 노이즈 포함
 *   - 기관: 분기말 윈도우드레싱 계절성 주의
 *
 * 의존: sb, KR_INDUSTRIES, getIndustryMap, fetchAllPages (config.js)
 */

let _sfPeriod = 3;   // 기본 3일
let _sfType   = 'combined';  // 'combined' | 'foreign' | 'inst'

// ── 수급 타입 설정 ────────────────────────────────────────────────────────────
const _SF_TYPES = {
  combined: { label: '합산',   posColor: '#2dce89', negColor: '#f5365c', desc: '외국인+기관 스마트머니' },
  foreign:  { label: '외국인', posColor: '#2AABEE', negColor: '#5b7fff', desc: '외국인 순매수' },
  inst:     { label: '기관',   posColor: '#f59e0b', negColor: '#fb923c', desc: '기관 순매수'   },
};

// ── 로드 ──────────────────────────────────────────────────────────────────────
async function loadSectorFlow() {
  const el = document.getElementById('sf-body');
  if (!el) return;

  el.innerHTML = '<div style="padding:1rem;color:var(--text3);font-size:12px"><span class="loading"></span> 수급 집계 중...</div>';

  try {
    // ─ 최근 25 거래일 목록 ─
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

    // ─ 모니터링 종목 ─
    const industryMap = await getIndustryMap();
    const codes = Object.keys(industryMap);
    if (!codes.length) {
      el.innerHTML = '<div style="padding:1rem;color:var(--text3);font-size:12px">모니터링 종목 없음</div>';
      return;
    }

    // ─ 외국인 + 기관 순매수 조회 ─
    let flowRows = [];
    try {
      flowRows = await fetchAllPages(
        sb.from('market_data')
          .select('base_date,stock_code,foreign_net_buy,institution_net_buy')
          .in('stock_code', codes)
          .gte('base_date', cutoffDate)
          .lte('base_date', latestDate)
      );
    } catch(_) {
      // institution_net_buy 컬럼 미존재 fallback — 외국인만 조회
      const { data: fallback } = await sb.from('market_data')
        .select('base_date,stock_code,foreign_net_buy')
        .in('stock_code', codes)
        .gte('base_date', cutoffDate)
        .lte('base_date', latestDate)
        .not('foreign_net_buy', 'is', null)
        .limit(10000);
      flowRows = fallback || [];
    }

    // ─ 거래일 인덱스 맵 (0 = 가장 최근) ─
    const dayIdx = {};
    tradingDays.forEach((d, i) => { dayIdx[d] = i; });

    // ─ 산업별 집계 (3가지 타입 동시) ─
    const KR_INDS = (typeof KR_INDUSTRIES !== 'undefined' ? KR_INDUSTRIES : null)
                 || (typeof INDUSTRIES    !== 'undefined' ? INDUSTRIES    : null)
                 || [];

    const _mkMap = () => {
      const m = {};
      KR_INDS.forEach(ind => { m[ind] = { d1: 0, d3: 0, d5: 0, d20: 0 }; });
      return m;
    };
    const sfCombined = _mkMap();
    const sfForeign  = _mkMap();
    const sfInst     = _mkMap();

    for (const row of flowRows) {
      const ind = industryMap[row.stock_code];
      if (!ind || !sfCombined[ind]) continue;
      const idx = dayIdx[row.base_date];
      if (idx === undefined) continue;

      const vf = row.foreign_net_buy   || 0;
      const vi = row.institution_net_buy || 0;
      const vc = vf + vi;

      const periods = [];
      if (idx < 1)  periods.push('d1');
      if (idx < 3)  periods.push('d3');
      if (idx < 5)  periods.push('d5');
      if (idx < 20) periods.push('d20');

      for (const p of periods) {
        sfCombined[ind][p] += vc;
        sfForeign [ind][p] += vf;
        sfInst    [ind][p] += vi;
      }
    }

    window._sfMaps = { combined: sfCombined, foreign: sfForeign, inst: sfInst };
    window._sfTradingDays = tradingDays;

    // 날짜 범위 표시
    const sfDateEl = document.getElementById('sf-date');
    if (sfDateEl) {
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

// ── 수급 타입 탭 전환 ─────────────────────────────────────────────────────────
function switchSfType(t) {
  _sfType = t;
  document.querySelectorAll('[data-sf-type]').forEach(b =>
    b.classList.toggle('active', b.dataset.sfType === t));

  // 설명 텍스트 갱신
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

  // 합산 타입일 때는 외국인/기관 분리 신호도 표시
  const showSignal = _sfType === 'combined' && maps.foreign && maps.inst;

  el.innerHTML = entries.map(({ ind, val }) => {
    const isPos  = val >= 0;
    const color  = isPos ? typeConfig.posColor : typeConfig.negColor;
    const pct    = Math.round(Math.abs(val) / maxAbs * 100);
    const fab    = Math.abs(val);
    const valStr = (isPos ? '+' : '-') + (fab >= 1e6 ? (fab / 1e6).toFixed(1) + '조' : Math.round(fab / 100) + '억');

    // 합산일 때: 외국인/기관 방향 일치 여부 체크 → 신호 뱃지
    let signalBadge = '';
    if (showSignal) {
      const vf = (maps.foreign[ind] || {})[key] ?? 0;
      const vi = (maps.inst[ind]    || {})[key] ?? 0;
      if (vf > 0 && vi > 0) {
        signalBadge = `<span style="font-size:9px;padding:1px 5px;border-radius:3px;` +
          `background:rgba(45,206,137,.15);color:#2dce89;font-weight:600;flex-shrink:0">외↑기↑</span>`;
      } else if (vf < 0 && vi < 0) {
        signalBadge = `<span style="font-size:9px;padding:1px 5px;border-radius:3px;` +
          `background:rgba(245,54,92,.12);color:#f5365c;font-weight:600;flex-shrink:0">외↓기↓</span>`;
      } else if (vf !== 0 || vi !== 0) {
        signalBadge = `<span style="font-size:9px;padding:1px 5px;border-radius:3px;` +
          `background:rgba(245,158,11,.12);color:#f59e0b;font-weight:600;flex-shrink:0">엇갈림</span>`;
      }
    }

    return `
    <div style="display:flex;align-items:center;gap:8px;padding:5px 12px;border-bottom:1px solid var(--border)">
      <span style="min-width:48px;font-size:12px;color:var(--text2);flex-shrink:0">${ind}</span>
      <div style="flex:1;height:6px;border-radius:3px;background:rgba(255,255,255,.06);overflow:hidden">
        <div style="height:100%;width:${pct}%;background:${color};border-radius:3px;transition:width .4s ease"></div>
      </div>
      ${signalBadge}
      <span style="min-width:54px;text-align:right;font-size:12px;font-weight:600;color:${color}">${valStr}</span>
    </div>`;
  }).join('');
}
