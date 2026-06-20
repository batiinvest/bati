/**
 * leading-stocks.js — 주도주 탐색기
 *
 * leading_stocks 테이블(백엔드 일배치 생성)에서 오늘의 주도주 Top 10 렌더링.
 * 데이터 없으면 "백엔드 미실행" 안내 + 어드민 전용 실행 트리거 버튼.
 *
 * 스코어 구성 (합계 100, leading_stocks_generator.py 기준):
 *   price_momentum  (max 25) : 5일·20일·60일 수익률 백분위 + 추세 일관성
 *   volume_surge    (max 15) : 거래대금 배율 × 방향성 × 3일 지속성
 *   foreign_flow    (max 30) : 외국인+기관 동반 수급 10일 누적 백분위 (DB 컬럼명 그대로 재활용)
 *   sector_strength (max 20) : 업종 평균 대비 초과 수익률 백분위
 *   hgpr_score      (max 10) : 52주 고가 근접도
 *
 * 의존: sb (config.js), chgColor/chgStr/isAdmin (config.js)
 */

let _lsTab = 'all';

// ── 데이터 로드 ────────────────────────────────────────────────────────────────
async function loadLeadingStocks() {
  const el = document.getElementById('ls-body');
  if (!el) return;

  try {
    // 최신 날짜
    const { data: dateRow } = await sb.from('leading_stocks')
      .select('base_date')
      .order('base_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!dateRow) {
      el.innerHTML = _lsEmptyHtml();
      return;
    }

    const _baseCols = 'stock_code,corp_name,market,industry,total_score,price_momentum,volume_surge,foreign_flow,hgpr_score,price_chg_5d,price_chg_20d,volume_ratio,foreign_3d_sum,market_cap,rank';

    // sector_strength 컬럼 시도 → DB 마이그레이션 전이면(42703) 구 스키마로 폴백
    let { data, error } = await sb.from('leading_stocks')
      .select(_baseCols + ',sector_strength')
      .eq('base_date', dateRow.base_date)
      .order('rank', { ascending: true })
      .limit(50);

    if (error?.code === '42703') {
      ({ data, error } = await sb.from('leading_stocks')
        .select(_baseCols)
        .eq('base_date', dateRow.base_date)
        .order('rank', { ascending: true })
        .limit(50));
    }

    if (error) throw error;

    // 날짜 표시
    const dateEl = document.getElementById('ls-date');
    if (dateEl) dateEl.textContent = dateRow.base_date + ' 기준';

    window._lsAllData = data || [];
    renderLeadingStocks();
  } catch(e) {
    console.error('[LeadingStocks]', e);
    const elE = document.getElementById('ls-body');
    if (elE) elE.innerHTML = `<div style="padding:1rem;text-align:center;color:var(--text2);font-size:12px">조회 실패: ${e.message}</div>`;
  }
}

// ── 탭 전환 ───────────────────────────────────────────────────────────────────
function switchLsTab(tab) {
  _lsTab = tab;
  document.querySelectorAll('[data-ls-tab]').forEach(b =>
    b.classList.toggle('active', b.dataset.lsTab === tab));
  renderLeadingStocks();
}

// ── 렌더링 ────────────────────────────────────────────────────────────────────
function renderLeadingStocks() {
  const el = document.getElementById('ls-body');
  if (!el) return;

  const all = window._lsAllData || [];
  if (!all.length) { el.innerHTML = _lsEmptyHtml(); return; }

  let rows = all;
  if (_lsTab === 'kospi')  rows = all.filter(r => r.market === 'KOSPI');
  if (_lsTab === 'kosdaq') rows = all.filter(r => r.market === 'KOSDAQ');
  rows = rows.slice(0, 8);

  if (!rows.length) {
    el.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--text2);font-size:12px">해당 시장 데이터 없음</div>';
    return;
  }

  el.innerHTML = rows.map((r, i) => {
    const total = r.total_score ?? 0;
    const scoreColor = total >= 75 ? '#2dce89' : total >= 50 ? '#f59e0b' : 'var(--text3)';

    // 스코어 구성 미니 바
    const miniBar = (label, val, max, color) => {
      const pct = Math.round((val || 0) / max * 100);
      return `<div style="display:flex;align-items:center;gap:3px">
        <span style="font-size:9px;color:var(--text2);width:34px;flex-shrink:0;white-space:nowrap">${label}</span>
        <div style="flex:1;height:3px;border-radius:2px;background:rgba(255,255,255,.08);overflow:hidden;min-width:20px">
          <div style="height:100%;width:${pct}%;background:${color};border-radius:2px"></div>
        </div>
        <span style="font-size:9px;color:var(--text2);width:18px;text-align:right;flex-shrink:0">${val || 0}</span>
      </div>`;
    };

    const mktTag = (r.market === 'KOSDAQ' && _lsTab === 'all')
      ? '<span style="font-size:9px;color:var(--text2);margin-left:2px;font-weight:600">Q</span>' : '';
    const indTag = r.industry
      ? `<span style="font-size:10px;color:var(--text2)">${r.industry}</span>` : '';
    const chg5dStr = r.price_chg_5d != null
      ? `<span style="font-size:10px;color:${chgColor(r.price_chg_5d)}">${r.price_chg_5d >= 0 ? '+' : ''}${Number(r.price_chg_5d).toFixed(1)}%</span>`
      : '';
    const volRatio = r.volume_ratio != null && r.volume_ratio > 1.5
      ? `<span style="font-size:9px;color:#f59e0b;padding:1px 4px;border-radius:3px;background:rgba(245,158,11,.1)">거래 ${Number(r.volume_ratio).toFixed(1)}x</span>` : '';
    const frgnTag = r.foreign_3d_sum != null && r.foreign_3d_sum !== 0
      ? (r.foreign_3d_sum > 0
          ? `<span style="font-size:9px;color:var(--tg);padding:1px 4px;border-radius:3px;background:rgba(42,171,238,.1)">외국인↑</span>`
          : `<span style="font-size:9px;color:var(--blue);padding:1px 4px;border-radius:3px;background:rgba(74,158,255,.08)">외국인↓</span>`)
      : '';

    return `
    <div onclick="openMarketDetail('${r.stock_code}','${(r.corp_name||r.stock_code).replace(/'/g,"\\'")}')"
      style="display:flex;align-items:flex-start;gap:8px;padding:7px 12px;border-bottom:1px solid var(--border);cursor:pointer"
      onmouseover="this.style.background='rgba(255,255,255,.03)'" onmouseout="this.style.background=''">
      <!-- 순위 -->
      <div style="min-width:20px;padding-top:3px;flex-shrink:0">
        <span style="font-size:${i < 3 ? '13' : '11'}px;font-weight:700;color:${i < 3 ? scoreColor : 'var(--text3)'}">${r.rank}</span>
      </div>
      <!-- 종목 정보 + 스코어 바 -->
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:4px;margin-bottom:5px;flex-wrap:wrap">
          <span style="font-size:13px;font-weight:600">${r.corp_name || r.stock_code}${mktTag}</span>
          ${typeof wlBadge==='function'?wlBadge(r.stock_code):''}
          ${chg5dStr}${indTag}${volRatio}${frgnTag}
        </div>
        <div style="display:flex;flex-direction:column;gap:2px">
          ${r.sector_strength != null
            ? `${miniBar('가격', r.price_momentum, 25, '#4a9eff')}
               ${miniBar('거래대금', r.volume_surge, 15, '#f59e0b')}
               ${miniBar('동반수급', r.foreign_flow, 30, '#2AABEE')}
               ${miniBar('업종강도', r.sector_strength, 20, '#a78bfa')}
               ${miniBar('신고가', r.hgpr_score, 10, '#2dce89')}`
            : `${miniBar('가격', r.price_momentum, 30, '#4a9eff')}
               ${miniBar('거래대금', r.volume_surge, 25, '#f59e0b')}
               ${miniBar('외국인', r.foreign_flow, 25, '#2AABEE')}
               ${miniBar('신고가', r.hgpr_score, 20, '#2dce89')}`
          }
        </div>
      </div>
      <!-- 총점 -->
      <div style="text-align:right;flex-shrink:0;padding-top:2px">
        <div style="font-size:18px;font-weight:800;line-height:1;color:${scoreColor};font-variant-numeric:tabular-nums">${total}</div>
        <div style="font-size:9px;color:var(--text2);margin-top:1px">/ 100</div>
      </div>
    </div>`;
  }).join('');
}

// ── 빈 상태 HTML ──────────────────────────────────────────────────────────────
function _lsEmptyHtml() {
  const isAdm = typeof isAdmin === 'function' && isAdmin();
  const adminBtn = isAdm
    ? `<button onclick="triggerLeadingStocks()"
        style="margin-top:8px;font-size:11px;padding:4px 14px;border-radius:5px;
               border:1px solid var(--border);background:var(--bg3);color:var(--text1);cursor:pointer">
        지금 계산 요청
       </button>`
    : '';
  return `<div style="padding:1.5rem;text-align:center;color:var(--text2);font-size:12px;line-height:1.8">
    오늘 데이터가 없습니다 — 매일 장 마감 후 자동 생성됩니다<br>
    <span style="font-size:11px;color:var(--text2);opacity:.7">(leading_stocks_generator.py)</span>
    ${adminBtn}
  </div>`;
}

// ── 계산 중 HTML (폴링 상태) ───────────────────────────────────────────────────
function _lsCalcHtml() {
  return `<div id="ls-calc-state" style="padding:1.5rem;text-align:center;color:var(--text2);font-size:12px;line-height:2">
    <span class="loading"></span> 백엔드에서 주도주 스코어 계산 중...<br>
    <span style="font-size:11px;opacity:.7">전체 종목 분석 (최대 3분 소요)</span>
    <div id="ls-poll-counter" style="font-size:10px;color:var(--text2);margin-top:2px;opacity:.6"></div>
  </div>`;
}

// ── 어드민 전용: 백엔드 트리거 + 폴링 ─────────────────────────────────────────
window.triggerLeadingStocks = async function() {
  const el = document.getElementById('ls-body');
  try {
    await sb.from('app_config').upsert({
      key: 'run_leading_stocks_flag',
      value: String(Date.now()),
      description: '주도주 탐색기 수동 생성 트리거',
    }, { onConflict: 'key' });

    if (typeof toast === 'function') toast('📡 주도주 계산 요청 완료 — 최대 3분 소요', 'info');

    // ── 계산 중 UI 표시 ──
    if (el) el.innerHTML = _lsCalcHtml();

    // ── 트리거 직전 기존 데이터 기준선 기록 ──────────────────────────────────
    let _baselineDate = null;
    try {
      const { data: _prev } = await sb.from('leading_stocks')
        .select('base_date').order('base_date', { ascending: false })
        .limit(1).maybeSingle();
      _baselineDate = _prev?.base_date || null;
    } catch(_) {}

    // ── 폴링: 5초마다 leading_stocks 신규 데이터 확인 (최대 36회 = 3분) ──
    let tries = 0;
    const MAX_TRIES = 36;

    const poll = setInterval(async () => {
      tries++;
      const cntEl = document.getElementById('ls-poll-counter');
      if (cntEl) cntEl.textContent = `${tries * 5}초 경과 / 최대 ${MAX_TRIES * 5}초`;

      try {
        const { data: row } = await sb.from('leading_stocks')
          .select('base_date')
          .order('base_date', { ascending: false })
          .limit(1)
          .maybeSingle();

        // 기존 데이터 없었으면 → 어떤 데이터든 생기면 완료
        // 기존 데이터 있었으면 → 더 최신 날짜 데이터가 생기면 완료
        const isNew = row && (_baselineDate === null || row.base_date > _baselineDate);
        if (isNew) {
          clearInterval(poll);
          await loadLeadingStocks();
          if (typeof toast === 'function') toast('✅ 주도주 탐색기 업데이트 완료', 'success');
          return;
        }
      } catch(_) {}

      // 3분 타임아웃
      if (tries >= MAX_TRIES) {
        clearInterval(poll);
        if (el) el.innerHTML = _lsEmptyHtml();
        if (typeof toast === 'function') toast('⚠️ 3분 내 계산 미완료 — 백엔드 서버 상태 확인', 'warning');
      }
    }, 5000);

  } catch(e) {
    if (typeof toast === 'function') toast('트리거 실패: ' + e.message, 'error');
  }
};

// ── 주도주 카드 수동 새로고침 ──────────────────────────────────────────────────
window.refreshLeadingStocks = async function() {
  const btn = document.getElementById('ls-refresh-btn');
  if (btn) { btn.disabled = true; btn.style.opacity = '.5'; }
  try {
    await loadLeadingStocks();
  } finally {
    if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
  }
};


// ══════════════════════════════════════════════════════════════════════════════
//  주도주 백테스트 — 과거 주도주를 샀다면 지금 수익은?
// ══════════════════════════════════════════════════════════════════════════════

let _lsBtPeriod = '1w';  // 선택된 기간

// ── 시장(코스피/코스닥) 전 종목 종가 맵 ────────────────────────────────────────
// PostgREST 기본 1000행 캡 회피용 페이지네이션 + (market|date) 캐시 (기간 전환 시 재조회 방지)
const _mktPriceCache = {};
async function _fetchMarketPrices(market, date) {
  const key = market + '|' + date;
  if (_mktPriceCache[key]) return _mktPriceCache[key];
  const map = {};
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from('market_data')
      .select('stock_code,price')
      .eq('base_date', date)
      .eq('market', market)
      .range(from, from + PAGE - 1);
    if (error || !data || !data.length) break;
    for (const r of data) if (r.price) map[r.stock_code] = r.price;
    if (data.length < PAGE) break;
  }
  _mktPriceCache[key] = map;
  return map;
}

// ── 백테스트 렌더링 진입점 ────────────────────────────────────────────────────
async function loadLeadingBacktest() {
  const el = document.getElementById('ls-bt-body');
  if (!el) return;

  el.innerHTML = `<div style="padding:1.5rem;text-align:center;color:var(--text2);font-size:12px">
    <span class="loading"></span> 수익률 계산 중...</div>`;

  try {
    // 1. 현재 기준 최신 날짜 조회
    const { data: latestRow } = await sb.from('market_data')
      .select('base_date').order('base_date', { ascending: false }).limit(1).maybeSingle();
    if (!latestRow) { el.innerHTML = _lsBtEmpty('시장 데이터 없음'); return; }
    const latestDate = latestRow.base_date;

    // 2. 진입일 계산 — 캘린더 기간(1주/1달/3달) 목표일에 가장 가까운 '선정일'
    //    leading_stocks는 날짜당 50행이라 base_date만 뽑으면 중복 → rank=1로 날짜당 1행(고유 선정일).
    const { data: dateRows } = await sb.from('leading_stocks')
      .select('base_date')
      .eq('rank', 1)
      .lt('base_date', latestDate)
      .order('base_date', { ascending: false })
      .limit(200);

    if (!dateRows || !dateRows.length) {
      el.innerHTML = _lsBtEmpty('과거 주도주 데이터가 아직 없습니다 — 누적되면 표시됩니다');
      return;
    }
    const selDates = dateRows.map(r => r.base_date);  // 최신순 고유 선정일

    // 목표 캘린더일(latestDate − N일) 이하의 가장 최근 선정일; 보유기간이 더 짧으면 가장 오래된 선정일로 폴백
    const calDays = { '1w': 7, '1m': 30, '3m': 90 }[_lsBtPeriod] || 7;
    const target = new Date(latestDate + 'T00:00:00Z');
    target.setUTCDate(target.getUTCDate() - calDays);
    const targetStr = target.toISOString().slice(0, 10);
    const entryDate = selDates.find(d => d <= targetStr) || selDates[selDates.length - 1];
    const capped    = !selDates.some(d => d <= targetStr);  // 목표 기간만큼 과거 데이터 부족

    // 헤더에 선정일 표시 (기간 미달 시 보유 최장 기준임을 안내)
    const btDateEl = document.getElementById('ls-bt-date');
    if (btDateEl) btDateEl.textContent = capped
      ? `선정일 ${entryDate} · ${_lsBtLabel()} 미달(보유 최장)`
      : `선정일 ${entryDate}`;

    // 3. 진입일 Top 10 주도주 조회
    const { data: entryStocks } = await sb.from('leading_stocks')
      .select('stock_code,corp_name,industry,total_score,rank')
      .eq('base_date', entryDate)
      .order('rank', { ascending: true })
      .limit(10);

    if (!entryStocks || !entryStocks.length) {
      el.innerHTML = _lsBtEmpty(`${entryDate} 주도주 데이터 없음`);
      return;
    }

    const codes = entryStocks.map(s => s.stock_code);

    // 4. 진입일 가격 조회
    const { data: entryPrices } = await sb.from('market_data')
      .select('stock_code,price')
      .eq('base_date', entryDate)
      .in('stock_code', codes);

    // 5. 현재 가격 + 시장 구분 조회
    const { data: currPrices } = await sb.from('market_data')
      .select('stock_code,price,price_change_rate,market')
      .eq('base_date', latestDate)
      .in('stock_code', codes);

    // 6. 결과 계산 (수익률 높은 순)
    const entryMap = Object.fromEntries((entryPrices || []).map(r => [r.stock_code, r.price]));
    const currMap  = Object.fromEntries((currPrices  || []).map(r => [r.stock_code, r]));

    const results = entryStocks.map(s => {
      const ep = entryMap[s.stock_code];
      const cr = currMap[s.stock_code];
      const ret = (ep && cr?.price) ? (cr.price / ep - 1) * 100 : null;
      return { ...s, market: cr?.market, entry_price: ep, curr_price: cr?.price, ret, entry_date: entryDate };
    }).filter(r => r.ret !== null)
      .sort((a, b) => b.ret - a.ret);

    const avgRet  = results.length ? results.reduce((a, r) => a + r.ret, 0) / results.length : null;
    const winRate = results.length ? results.filter(r => r.ret > 0).length / results.length * 100 : null;

    // 7. 벤치마크 — 종목 구성에 맞춘 시장(코스피/코스닥) 동일가중 평균
    //    주도주는 코스닥 비중이 높아 코스피만 쓰면 부적합 → 각 종목을 자기 시장 평균과 비교 후 평균.
    const markets = [...new Set(results.map(r => r.market).filter(Boolean))];
    const mktRet = {};
    await Promise.all(markets.map(async mkt => {
      const [me, ml] = await Promise.all([
        _fetchMarketPrices(mkt, entryDate),
        _fetchMarketPrices(mkt, latestDate),
      ]);
      const rs = Object.keys(me).filter(c => ml[c]).map(c => (ml[c] / me[c] - 1) * 100);
      mktRet[mkt] = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null;
    }));

    const benchPer  = results.map(r => mktRet[r.market]).filter(v => v != null);
    const bmkReturn = benchPer.length ? benchPer.reduce((a, b) => a + b, 0) / benchPer.length : null;
    const excess    = (avgRet !== null && bmkReturn !== null) ? avgRet - bmkReturn : null;

    _renderBacktest(el, { entryDate, latestDate, results, avgRet, winRate, bmkReturn, excess });

  } catch(e) {
    console.error('[Backtest]', e);
    el.innerHTML = _lsBtEmpty('조회 실패: ' + e.message);
  }
}

// ── 백테스트 결과 렌더링 ──────────────────────────────────────────────────────
function _renderBacktest(el, { entryDate, latestDate, results, avgRet, winRate, bmkReturn, excess }) {
  const fmtRet = (v, size = 13) => v == null ? '—'
    : `<span style="font-size:${size}px;font-weight:700;color:${v >= 0 ? 'var(--red)' : 'var(--blue)'}">
        ${v >= 0 ? '+' : ''}${v.toFixed(2)}%</span>`;

  const excessColor = excess == null ? 'var(--text3)'
    : excess > 0 ? 'var(--green)' : 'var(--red)';
  const excessStr = excess == null ? '—'
    : `${excess >= 0 ? '+' : ''}${excess.toFixed(2)}%p`;

  const winStr = winRate == null ? '—' : `${winRate.toFixed(0)}%`;
  const winColor = winRate == null ? 'var(--text3)'
    : winRate >= 60 ? 'var(--green)' : winRate >= 40 ? 'var(--yellow)' : 'var(--red)';

  el.innerHTML = `
  <!-- 요약 카드 -->
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px">
    <div style="background:var(--bg3);border-radius:var(--radius-sm);padding:10px;text-align:center">
      <div style="font-size:10px;color:var(--text2);margin-bottom:4px">평균 수익률</div>
      <div>${fmtRet(avgRet, 18)}</div>
    </div>
    <div style="background:var(--bg3);border-radius:var(--radius-sm);padding:10px;text-align:center">
      <div style="font-size:10px;color:var(--text2);margin-bottom:4px">성공률 (양수)</div>
      <div style="font-size:18px;font-weight:700;color:${winColor}">${winStr}</div>
    </div>
    <div style="background:var(--bg3);border-radius:var(--radius-sm);padding:10px;text-align:center">
      <div style="font-size:10px;color:var(--text2);margin-bottom:4px">시장 대비</div>
      <div style="font-size:18px;font-weight:700;color:${excessColor}">${excessStr}</div>
    </div>
  </div>

  <!-- 기준일 표시 -->
  <div style="font-size:11px;color:var(--text2);margin-bottom:8px;padding:0 2px">
    → 현재 <b style="color:var(--text1)">${latestDate}</b>
    ${bmkReturn != null ? `| 시장 평균 ${fmtRet(bmkReturn, 11)}` : ''}
  </div>

  <!-- 종목별 결과 -->
  <div style="display:flex;flex-direction:column;gap:2px">
    ${results.map(r => {
      const retColor = r.ret >= 0 ? 'var(--red)' : 'var(--blue)';
      const retStr   = `${r.ret >= 0 ? '+' : ''}${r.ret.toFixed(2)}%`;
      const barW     = Math.min(Math.abs(r.ret) * 3, 100);
      return `
      <div style="display:flex;align-items:center;gap:8px;padding:5px 8px;
        border-radius:var(--radius-sm);background:${r.ret > 0 ? 'rgba(245,54,92,.05)' : r.ret < 0 ? 'rgba(74,158,255,.05)' : 'transparent'}">
        <span style="font-size:10px;color:var(--text2);min-width:16px">#${r.rank}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.corp_name}</div>
          <div style="font-size:10px;color:var(--text2)">
            선정일 ${r.entry_date} &nbsp;${r.entry_price?.toLocaleString()}원 → ${r.curr_price?.toLocaleString()}원
          </div>
        </div>
        <div style="text-align:right;min-width:60px">
          <div style="font-size:13px;font-weight:700;color:${retColor}">${retStr}</div>
          <div style="height:3px;border-radius:2px;background:rgba(255,255,255,.08);margin-top:3px;overflow:hidden">
            <div style="height:100%;width:${barW}%;background:${retColor};border-radius:2px;
              ${r.ret < 0 ? 'margin-left:auto' : ''}"></div>
          </div>
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

// ── 기간 전환 ─────────────────────────────────────────────────────────────────
window.switchBtPeriod = function(period) {
  _lsBtPeriod = period;
  document.querySelectorAll('[data-bt-period]').forEach(b =>
    b.classList.toggle('active', b.dataset.btPeriod === period));
  loadLeadingBacktest();
};

function _lsBtLabel() {
  return { '1w': '1주', '1m': '1개월', '3m': '3개월' }[_lsBtPeriod] || '';
}

function _lsBtEmpty(msg) {
  return `<div style="padding:1.5rem;text-align:center;color:var(--text2);font-size:12px">${msg}</div>`;
}
