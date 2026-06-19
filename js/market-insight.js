/**
 * market-insight.js — 투자포인트 요약 엔진 v2
 *
 * 흐름:
 *   loadMarketInsight()
 *     → _loadSummaryFromDB()    DB 우선 (market_investment_summary)
 *     → _buildLiveSections()   폴백: 프론트 실시간 계산
 *     → _renderInsightCard()   5섹션 렌더링
 *
 * 5섹션:
 *   [1] 오늘의 핵심 흐름   — 시장·산업 분위기, 강약 산업, 외국인 수급
 *   [2] 주목할 투자포인트  — 데이터 기반 포인트 최대 4개
 *   [3] 리스크 요인        — VIX · 디커플링 · 모멘텀 약화 · 금리
 *   [4] 확인할 이벤트      — 공시 건수 · US 선물 · 금리·VIX
 *   [5] 한 줄 요약         — 장세를 한 문장으로
 *
 * DB 테이블: market_investment_summary
 *   백엔드(Python market_summary_generator.py)가 생성한 데이터 우선 표시.
 *   없으면 프론트 실시간 계산으로 폴백.
 *
 * 의존:
 *   window._macroData         (chart-macro.js)
 *   window._krIndFinalReturn  (chart-industry.js)
 *   window._krIndDates        (chart-industry.js)
 *   window._allMarketRows     (market-overview.js)
 *   window.USKR_MAP           (chart-uskr.js)
 *   window.INDUSTRIES      (config.js)
 *   sb                        (config.js)
 */

// ── 미국 ETF → KR 산업 레이블 ──────────────────────────────────────────────
const USKR_LABELS = {
  '반도체': 'SOXX·SMH',  '바이오': 'IBB·XBI',   '로봇': 'BOTZ·ROBO',
  '우주':   'ARKX·UFO',  '2차전지':'LIT·BATT',   '소비재':'XLY·XLP',
  '엔터':   'XLC·PEJ',   '조선':   'SEA·XLI',    '테크':  'VGT·XLK',
  '뷰티':   'XLP·KXI',   '신재생': 'ICLN·QCLN',
};

// ── 장세 판단 임계값 ─────────────────────────────────────────────────────────
const THR = {
  STRONG:    0.5,
  WEAK:     -0.5,
  SURGE:     2.0,
  PLUNGE:   -2.0,
  VIX_HIGH:  25,
  VIX_FEAR:  20,
  RANK_CHG:  3,
};


// ════════════════════════════════════════════════════════════
// ① 데이터 수집 (기존 유지)
// ════════════════════════════════════════════════════════════
async function buildInsightData() {
  const m       = window._macroData        || {};
  const krR     = window._krIndFinalReturn || {};
  const indDates = window._krIndDates      || {};

  // US ETF 산업별 평균 등락률
  const usIndAvg = {};
  try {
    const { data: usRows } = await sb.from('us_market')
      .select('base_date,industry,ticker,chg_pct')
      .order('base_date', { ascending: false })
      .limit(600);

    if (usRows?.length) {
      const dates = [...new Set(usRows.map(r => r.base_date))].sort().reverse();
      const latestDate = dates[0];
      const latest = usRows.filter(r => r.base_date === latestDate);
      const uskrMap = window.USKR_MAP || {};
      INDUSTRIES.forEach(ind => {
        const tickers = uskrMap[ind] || [];
        const d1Vals  = latest
          .filter(r => r.industry === ind && tickers.includes(r.ticker) && r.chg_pct != null)
          .map(r => r.chg_pct);
        if (!d1Vals.length) return;
        usIndAvg[ind] = { d1: d1Vals.reduce((s,v)=>s+v,0) / d1Vals.length };
      });
    }
  } catch(e) { console.warn('[Insight] US ETF 조회 오류:', e); }

  // KR 업종별 기간 수익률
  const krPeriod = {};
  INDUSTRIES.forEach(ind => {
    const dates = Object.keys(indDates[ind] || {}).sort();
    const calcReturn = (days) => {
      const slice = dates.slice(-days);
      if (!slice.length) return null;
      let cum = 100;
      slice.forEach(date => {
        const chgs = indDates[ind][date] || [];
        if (chgs.length) cum *= (1 + chgs.reduce((s,v)=>s+v,0)/chgs.length/100);
      });
      return parseFloat((cum - 100).toFixed(2));
    };
    krPeriod[ind] = { d1: calcReturn(1), d5: calcReturn(5), d20: calcReturn(20) };
  });

  return { m, krR, krPeriod, usIndAvg };
}


// ════════════════════════════════════════════════════════════
// ② 판단 로직 (기존 유지)
// ════════════════════════════════════════════════════════════
function analyzeMarket({ m, krR, krPeriod, usIndAvg }) {
  const sp500Chg  = m.sp500_chg  ?? 0;
  const nasdaqChg = m.nasdaq_chg ?? 0;
  const vix       = m.vix        ?? 0;
  const us10y     = m.us10y      ?? 0;
  const kospiChg  = m.kospi_chg  ?? 0;
  const kosdaqChg = m.kosdaq_chg ?? 0;

  const usAvgChg = (sp500Chg + nasdaqChg) / 2;
  let usMarketState, krMarketState, marketRegime;

  if (vix >= THR.VIX_HIGH)              usMarketState = 'risk-off';
  else if (usAvgChg >= THR.STRONG)      usMarketState = 'risk-on';
  else if (usAvgChg <= THR.WEAK)        usMarketState = 'caution';
  else                                   usMarketState = 'neutral';

  const krAvgChg = (kospiChg + kosdaqChg) / 2;
  if (krAvgChg >= 1.0)        krMarketState = 'strong';
  else if (krAvgChg >= 0.3)   krMarketState = 'mild-up';
  else if (krAvgChg <= -1.0)  krMarketState = 'weak';
  else if (krAvgChg <= -0.3)  krMarketState = 'mild-down';
  else                         krMarketState = 'flat';

  const defenseInds = ['뷰티','소비재'];
  const growthInds  = ['반도체','바이오','테크','로봇','우주'];
  const defenseAvg  = defenseInds.map(i => usIndAvg[i]?.d1 ?? 0).reduce((s,v)=>s+v,0)/defenseInds.length;
  const growthAvg   = growthInds .map(i => usIndAvg[i]?.d1 ?? 0).reduce((s,v)=>s+v,0)/growthInds.length;

  if (vix >= THR.VIX_HIGH)                     marketRegime = 'risk-off';
  else if (defenseAvg > growthAvg + 0.5)       marketRegime = '방어주 장세';
  else if (growthAvg  > defenseAvg + 0.5)      marketRegime = '성장주 장세';
  else if (usMarketState === 'risk-on')         marketRegime = 'risk-on';
  else if (usMarketState === 'caution')         marketRegime = '관망';
  else                                           marketRegime = '혼조';

  const usSorted  = Object.entries(usIndAvg).filter(([,v]) => v?.d1 != null).sort(([,a],[,b]) => b.d1 - a.d1);
  const usStrong  = usSorted.filter(([,v]) => v.d1 >= THR.STRONG).map(([ind]) => ind);
  const usWeak    = usSorted.filter(([,v]) => v.d1 <= THR.WEAK  ).map(([ind]) => ind);

  const krSorted  = INDUSTRIES
    .filter(ind => krPeriod[ind]?.d1 != null)
    .sort((a,b) => (krPeriod[b]?.d1 ?? 0) - (krPeriod[a]?.d1 ?? 0));

  const krRank1d = krSorted.map((ind,i) => ({ ind, rank: i+1 }));
  const krSorted5d = INDUSTRIES
    .filter(ind => krPeriod[ind]?.d5 != null)
    .sort((a,b) => (krPeriod[b]?.d5 ?? 0) - (krPeriod[a]?.d5 ?? 0));
  const krRank5dMap = {};
  krSorted5d.forEach((ind,i) => { krRank5dMap[ind] = i+1; });

  const krRising  = [];
  const krFalling = [];
  krRank1d.forEach(({ ind, rank }) => {
    const rank5d = krRank5dMap[ind] ?? rank;
    const diff   = rank5d - rank;
    if (diff >= THR.RANK_CHG)  krRising .push({ ind, diff });
    if (diff <= -THR.RANK_CHG) krFalling.push({ ind, diff: Math.abs(diff) });
  });

  const crossSignals = [];
  INDUSTRIES.forEach(ind => {
    const usChg = usIndAvg[ind]?.d1 ?? null;
    const krChg = krPeriod[ind]?.d1 ?? null;
    if (usChg == null || krChg == null) return;
    if (usChg >= THR.STRONG && krChg <= -THR.STRONG)
      crossSignals.push({ type: 'lag',           ind, usChg, krChg });
    else if (usChg <= THR.WEAK && krChg >= THR.STRONG)
      crossSignals.push({ type: 'decouple-risk', ind, usChg, krChg });
    else if (usChg >= THR.STRONG && krChg >= THR.STRONG)
      crossSignals.push({ type: 'sync-up',       ind, usChg, krChg });
    else if (usChg <= THR.WEAK && krChg <= THR.WEAK)
      crossSignals.push({ type: 'sync-down',     ind, usChg, krChg });
  });

  return {
    usMarketState, krMarketState, marketRegime,
    sp500Chg, nasdaqChg, kospiChg, kosdaqChg, vix, us10y,
    usSorted, usStrong, usWeak,
    krSorted, krRising, krFalling,
    crossSignals,
    usIndAvg, krPeriod,
  };
}

function _fmt(v) {
  if (v == null || isNaN(Number(v))) return '—';
  const n = Number(v);
  return (n >= 0 ? '+' : '') + n.toFixed(1) + '%';
}


// ════════════════════════════════════════════════════════════
// 프론트 → DB 저장 (어드민 전용)
// ════════════════════════════════════════════════════════════
window._insightSaveDB = async function() {
  const btn  = document.getElementById('insight-save-btn');
  const data = window._insightCurrentData;
  if (!data || data.generated_by !== 'live') return;

  if (btn) { btn.disabled = true; btn.textContent = '저장 중...'; }

  // core_points(기회/리스크 각 1개)를 구 스키마 컬럼에 매핑 — 테이블 구조 변경 없이 호환
  const _up   = (data.core_points || []).find(p => p.type === 'up');
  const _down = (data.core_points || []).find(p => p.type === 'down');

  const record = {
    market_date:       data.market_date,
    market_type:       'KR',
    one_line_summary:  data.one_line_summary,
    flow_summary:      JSON.stringify(data.flow || {}),
    key_points:        JSON.stringify(_up   ? [_up.text]   : []),
    risk_factors:      JSON.stringify(_down ? [_down.text] : []),
    watch_events:      JSON.stringify([]),
    strong_industries: JSON.stringify((data.flow?.strong_industries) || []),
    weak_industries:   JSON.stringify((data.flow?.weak_industries)   || []),
    top_stocks:        JSON.stringify(data.top_stocks || []),
    data_basis:        data.data_basis || '',
    generated_at:      new Date().toISOString(),
  };

  try {
    const { error } = await sb
      .from('market_investment_summary')
      .upsert(record, { onConflict: 'market_date,market_type' });
    if (error) throw error;

    if (btn) { btn.textContent = '✅ 저장됨'; btn.style.color = 'var(--green)'; }
    toast('투자포인트 요약이 DB에 저장되었습니다.', 'success');
  } catch(e) {
    console.error('[Insight] 저장 실패:', e);
    if (btn) { btn.disabled = false; btn.textContent = 'DB 저장'; }
    toast('저장 실패: ' + e.message, 'error');
  }
};


// ════════════════════════════════════════════════════════════
// ③ DB 우선 조회 (market_investment_summary)
// ════════════════════════════════════════════════════════════
async function _loadSummaryFromDB() {
  try {
    const { data, error } = await sb.from('market_investment_summary')
      .select('market_date,market_type,one_line_summary,flow_summary,key_points,risk_factors,watch_events,strong_industries,weak_industries,top_stocks,data_basis,generated_at')
      .eq('market_type', 'KR')
      .order('market_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;

    // 3일 이상 오래된 데이터는 사용하지 않음 (주말 포함 허용)
    const diffMs = Date.now() - new Date(data.market_date).getTime();
    if (diffMs > 3 * 24 * 60 * 60 * 1000) return null;

    // 구 스키마(key_points/risk_factors 배열) 호환 — 핵심 1개씩만 추출
    const kp = data.key_points   || [];
    const rf = data.risk_factors || [];
    const corePoints = [];
    if (kp[0]) corePoints.push({ type: 'up',   text: kp[0] });
    if (rf[0]) corePoints.push({ type: 'down', text: rf[0] });
    if (!corePoints.length) corePoints.push({ type: 'flat', text: '뚜렷한 신호 없음 — 관망 유지' });

    return {
      ...data,
      generated_by: 'db',
      flow:          data.flow_summary   || {},
      core_points:   corePoints,
    };
  } catch(e) {
    console.warn('[Insight] DB 조회 실패:', e);
    return null;
  }
}


// ════════════════════════════════════════════════════════════
// ④ 프론트 실시간 5섹션 빌더 (폴백)
// ════════════════════════════════════════════════════════════
async function _buildLiveSections() {
  const { m, krR, krPeriod, usIndAvg } = await buildInsightData();
  const a = analyzeMarket({ m, krR, krPeriod, usIndAvg });
  const allRows = window._allMarketRows || [];

  // ── 외국인 순매수 상위 ──
  const topFrgnBuy = [...allRows]
    .filter(r => (r.foreign_net_buy ?? 0) > 0 && r.corp_name)
    .sort((a, b) => (b.foreign_net_buy ?? 0) - (a.foreign_net_buy ?? 0))
    .slice(0, 3);

  // ── 급등/급락 종목 (window._allMarketRows 활용) ──
  const surgeStocks = [...allRows]
    .filter(r => r.corp_name && (r.price_change_rate ?? 0) >= THR.SURGE)
    .sort((a, b) => (b.price_change_rate ?? 0) - (a.price_change_rate ?? 0))
    .slice(0, 5);
  const plungeStocks = [...allRows]
    .filter(r => r.corp_name && (r.price_change_rate ?? 0) <= THR.PLUNGE)
    .sort((a, b) => (a.price_change_rate ?? 0) - (b.price_change_rate ?? 0))
    .slice(0, 3);

  // ── 52주 신고가 종목 (빠른 카운트) ──
  let hgprCount = 0, hgprNames = [];
  try {
    const latestDate = m.base_date || new Date().toISOString().split('T')[0];
    const { data: hgpr } = await sb.from('market_data')
      .select('corp_name,price_change_rate,market')
      .eq('base_date', latestDate)
      .in('hgpr_cls_code', ['신고가', '52주 신고가', '1'])
      .order('market_cap', { ascending: false })
      .limit(20);
    hgprCount = hgpr?.length || 0;
    hgprNames = (hgpr || []).slice(0, 3).map(r => r.corp_name).filter(Boolean);
  } catch(e) { console.warn('[Insight] 신고가 조회 오류:', e); }

  // ── 오늘 공시 카운트 ──
  let discInfo = { count: 0, categories: [] };
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const { data: discs } = await sb.from('daily_disclosures')
      .select('category')
      .eq('base_date', todayStr)
      .limit(200);
    const catCounts = {};
    (discs || []).forEach(d => {
      const c = d.category || '기타';
      catCounts[c] = (catCounts[c] || 0) + 1;
    });
    discInfo = {
      count: (discs || []).length,
      categories: Object.entries(catCounts)
        .sort((a, b) => b[1] - a[1]).slice(0, 3)
        .map(([k, v]) => `${k}(${v})`),
    };
  } catch(e) {}

  // ── ① 핵심 흐름 데이터 ──
  const moodMap = { 'strong':'강세','mild-up':'소폭 상승','flat':'보합','mild-down':'소폭 하락','weak':'약세' };
  const strongInds = a.krSorted.filter(ind => (a.krPeriod[ind]?.d1 ?? 0) > 0).slice(0, 4);
  const weakInds   = [...a.krSorted].reverse().filter(ind => (a.krPeriod[ind]?.d1 ?? 0) < 0).slice(0, 4);

  const syncUpSigs   = a.crossSignals.filter(s => s.type === 'sync-up');
  const lagSigs      = a.crossSignals.filter(s => s.type === 'lag');
  const riskSigs     = a.crossSignals.filter(s => s.type === 'decouple-risk');
  const syncDownSigs = a.crossSignals.filter(s => s.type === 'sync-down');

  // ── ② 핵심 포인트 — 기회 1 · 리스크 1 만 선별 (펀드매니저가 보는 요약) ──
  // 후보를 우선순위대로 쌓고 가장 중요한 1개만 채택
  let opportunity = null;
  if (lagSigs.length) {
    const best = lagSigs[0];
    const etf = USKR_LABELS[best.ind] || '';
    opportunity = `${best.ind}${etf ? '('+etf+')' : ''} 후행 선점 — 미국 ${_fmt(best.usChg)} 선행·국내 ${_fmt(best.krChg)}, 수급 유입 시 진입`;
  } else if (syncUpSigs.length >= 2) {
    const inds = syncUpSigs.slice(0, 2).map(s => s.ind).join('·');
    opportunity = `${inds} 미·한 동반 강세 — 추세 추종 검토`;
  } else if (a.krRising.length >= 2) {
    const inds = a.krRising.slice(0, 2).map(x => x.ind).join('·');
    opportunity = `${inds} 모멘텀 강화 — 5일 대비 순위 상승, 매집 신호`;
  } else if (surgeStocks.length >= 2) {
    const names = surgeStocks.slice(0, 2).map(r => `${r.corp_name}(${_fmt(r.price_change_rate)})`).join(' · ');
    opportunity = `${names} 급등 — 추격 자제, 다음날 지속성 확인`;
  } else if (topFrgnBuy.length >= 2 && (a.kospiChg ?? 0) > 0) {
    opportunity = `${topFrgnBuy.slice(0, 2).map(r => r.corp_name).join('·')} 외국인 집중 매수`;
  }

  let risk = null;
  if ((m.vix ?? 0) >= THR.VIX_HIGH) {
    risk = `VIX ${Number(m.vix).toFixed(0)} 공포 구간 — 신규 매수 중단, 헤지 확대`;
  } else if (riskSigs.length) {
    const s = riskSigs[0];
    risk = `${s.ind} 디커플링 — 한국 ${_fmt(s.krChg)} 상승 중 미국 ${_fmt(s.usChg)} 부진, 차익 실현 우선`;
  } else if (syncDownSigs.length) {
    risk = `${syncDownSigs.map(s => s.ind).join('·')} 미·한 동반 약세 — 반등 매수 금지`;
  } else if (plungeStocks.length >= 2) {
    const names = plungeStocks.slice(0, 2).map(r => `${r.corp_name}(${_fmt(r.price_change_rate)})`).join(' · ');
    risk = `${names} 급락 — 실적·공시 이슈 확인 필요`;
  } else if (a.krFalling.length >= 2) {
    risk = `${a.krFalling.slice(0, 2).map(x => x.ind).join('·')} 모멘텀 소멸 — 비중 축소 검토`;
  } else if ((m.us10y ?? 0) >= 4.5) {
    risk = `미 10년 금리 ${Number(m.us10y).toFixed(3)}% — 밸류에이션 부담`;
  } else if ((m.vix ?? 0) >= THR.VIX_FEAR) {
    risk = `VIX ${Number(m.vix).toFixed(0)} 경계 구간 — 포지션 점검`;
  }

  const corePoints = [];
  if (opportunity) corePoints.push({ type: 'up',   text: opportunity });
  if (risk)        corePoints.push({ type: 'down', text: risk });
  if (!corePoints.length) corePoints.push({ type: 'flat', text: '뚜렷한 신호 없음 — 관망 유지' });

  // ── ⑤ 한 줄 총평 (전문가 어조) ──
  const moodStr    = moodMap[a.krMarketState] || '혼조';
  const topIndStr  = a.krSorted[0] ? ` · ${a.krSorted[0]} 주도` : '';
  const usContext  = a.sp500Chg != null ? `S&P ${_fmt(a.sp500Chg)}·NDX ${_fmt(a.nasdaqChg)} 마감` : '';

  let strategy;
  if ((m.vix ?? 0) >= THR.VIX_HIGH)
    strategy = `VIX ${Number(m.vix).toFixed(0)} 공포 구간 — 현금 비중 최우선, 추격 전면 금지`;
  else if (a.marketRegime === 'risk-off')
    strategy = '리스크오프 전환 — 방어 포지션 유지, 낙폭 과대 종목 관찰 대기';
  else if (lagSigs.length) {
    const lagInd = lagSigs[0].ind;
    strategy = `후행 업종 ${lagInd} 선점 기회 — 수급 유입 확인 후 단계적 진입`;
  } else if (syncUpSigs.length >= 2 && a.krRising.length >= 2) {
    const top = syncUpSigs.slice(0,2).map(s=>s.ind).join('·');
    strategy = `미·한 동반 강세(${top}) — 추세 추종, 저항선 돌파 시 단기 비중 확대`;
  } else if (riskSigs.length) {
    const riskInd = riskSigs.slice(0,2).map(s=>s.ind).join('·');
    strategy = `${riskInd} 디커플링 주의 — 한국 선행 상승분 차익 실현 검토`;
  } else {
    strategy = '혼조 국면 — 섣부른 추격 금지, 강세 업종 눌림목 대기';
  }

  const oneLiner = [usContext, `코스피 ${_fmt(a.kospiChg)} ${moodStr}${topIndStr}`, strategy].filter(Boolean).join(' / ');

  return {
    market_date:   m.base_date || new Date().toISOString().split('T')[0],
    generated_by:  'live',
    one_line_summary: oneLiner,
    flow: {
      market_mood:       a.krMarketState,
      market_mood_label: moodStr,
      market_regime:     a.marketRegime,
      kospi_chg:         a.kospiChg,
      kosdaq_chg:        a.kosdaqChg,
      sp500_chg:         a.sp500Chg,
      nasdaq_chg:        a.nasdaqChg,
      vix:               m.vix,
      us10y:             m.us10y,
      strong_industries: strongInds,
      weak_industries:   weakInds,
      top_frgn_buy:      topFrgnBuy.map(r => r.corp_name),
    },
    core_points:  corePoints,
    top_stocks:   {
      surge:  surgeStocks.slice(0,3).map(r => ({ name: r.corp_name, chg: r.price_change_rate })),
      plunge: plungeStocks.slice(0,3).map(r => ({ name: r.corp_name, chg: r.price_change_rate })),
    },
    data_basis:   `${m.base_date || '최신'} 시장 데이터 기준`,
    updated_at:   new Date().toISOString(),
  };
}


// ════════════════════════════════════════════════════════════
// ⑤ 압축 렌더링 — 한 줄 총평 + 장세/업종 배지 + 핵심 포인트 최대 2개
// ════════════════════════════════════════════════════════════
function _renderInsightCard(data) {
  const el = document.getElementById('market-insight-card');
  if (!el) return;

  // 어드민 저장 버튼용으로 현재 데이터 보관
  window._insightCurrentData = data;

  const f = data.flow || {};

  // ─── 한 줄 총평 (최상단, 강조) ───
  const oneLiner = `
  <div class="insight-oneliner" style="margin-bottom:10px">
    <div style="font-size:13px;font-weight:700;color:var(--text);line-height:1.5">
      ${data.one_line_summary || '—'}
    </div>
  </div>`;

  // ─── 영향 업종 배지 (시장 전체 등급은 온도계 카드 역할 — 여기선 업종 단위만) ───
  const indBadges =
    (f.strong_industries || []).slice(0, 3).map(ind =>
      `<span class="insight-tag up">${ind}</span>`).join('') +
    (f.weak_industries || []).slice(0, 2).map(ind =>
      `<span class="insight-tag dn">${ind}</span>`).join('');

  const moodRow = indBadges ? `
  <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid var(--border)">
    <span style="font-size:10px;color:var(--text2);font-weight:600">영향 업종</span>
    ${indBadges}
  </div>` : '';

  // ─── 핵심 포인트 (기회 1 · 리스크 1 만) ───
  const typeStyle = {
    up:   { color: '#34d399', icon: '▲' },
    down: { color: '#f59e0b', icon: '▼' },
    flat: { color: 'var(--text2)', icon: '—' },
  };
  const pointsHTML = (data.core_points || []).map(p => {
    const ts = typeStyle[p.type] || typeStyle.flat;
    return `
    <div style="display:flex;gap:7px;align-items:flex-start;margin-bottom:7px">
      <span style="color:${ts.color};font-size:11px;font-weight:700;flex-shrink:0;margin-top:1px">${ts.icon}</span>
      <span style="font-size:12.5px;color:var(--text1);line-height:1.5">${p.text}</span>
    </div>`;
  }).join('');

  // ─── 푸터 ───
  const source = data.generated_by === 'db' ? '백엔드 분석' : '실시간 계산';
  const _isAdm = typeof isAdmin === 'function' && isAdmin();

  const adminBtns = _isAdm ? `
  <div style="display:flex;gap:5px;justify-content:flex-end;margin-top:8px">
    ${data.generated_by === 'live' ? `
    <button id="insight-save-btn" onclick="window._insightSaveDB()"
      style="font-size:10px;padding:2px 9px;border-radius:4px;border:1px solid var(--border);
             background:var(--bg3);color:var(--text1);cursor:pointer">
      DB 저장
    </button>` : ''}
    <button onclick="loadMarketInsight(true)"
      style="font-size:10px;padding:2px 9px;border-radius:4px;border:1px solid var(--border);
             background:var(--bg3);color:var(--text1);cursor:pointer">
      재생성
    </button>
  </div>` : '';

  const footer = `
  <div style="text-align:right;font-size:10px;color:var(--text2);margin-top:8px">
    ${source} · ${data.data_basis || ''}
  </div>
  ${adminBtns}`;

  el.innerHTML = oneLiner + moodRow + pointsHTML + footer;

  // Zone A 브리핑 바의 '한 줄 총평'도 함께 갱신
  if (typeof renderBriefingBar === 'function') renderBriefingBar();
}


// ════════════════════════════════════════════════════════════
// 투자포인트 히스토리 로더 (타임라인 뷰)
// ════════════════════════════════════════════════════════════
async function loadInsightHistory() {
  const el = document.getElementById('insight-history-body');
  if (!el) return;
  el.innerHTML = `<div style="color:var(--text2);font-size:12px;padding:.5rem 0"><span class="loading"></span> 불러오는 중...</div>`;

  try {
    const { data, error } = await sb.from('market_investment_summary')
      .select('market_date,one_line_summary,flow_summary,key_points,risk_factors,generated_at')
      .eq('market_type', 'KR')
      .order('market_date', { ascending: false })
      .limit(14);

    if (error) throw error;
    if (!data || !data.length) {
      el.innerHTML = `<div style="color:var(--text2);font-size:12px;padding:.5rem 0">저장된 기록이 없습니다.</div>`;
      return;
    }

    el.innerHTML = data.map((row, idx) => {
      // flow_summary 파싱
      let flow = {};
      try { flow = typeof row.flow_summary === 'string' ? JSON.parse(row.flow_summary) : (row.flow_summary || {}); } catch(e) {}

      // key_points 파싱
      let kps = [];
      try { kps = typeof row.key_points === 'string' ? JSON.parse(row.key_points) : (row.key_points || []); } catch(e) {}

      // 장세 색
      const moodColors = { strong:'var(--red)', 'mild-up':'#2dce89', flat:'var(--text3)', 'mild-down':'#f59e0b', weak:'var(--blue)' };
      const moodColor = moodColors[flow.market_mood] || 'var(--text2)';
      const kospiStr  = flow.kospi_chg != null
        ? `<span style="color:${chgColor(flow.kospi_chg)};font-weight:600">${flow.kospi_chg >= 0 ? '+' : ''}${Number(flow.kospi_chg).toFixed(1)}%</span>`
        : '';
      const vixStr    = flow.vix != null
        ? `<span style="color:var(--text2)">VIX ${Number(flow.vix).toFixed(0)}</span>`
        : '';

      const isFirst = idx === 0;
      const dotColor = isFirst ? '#2dce89' : 'var(--border2)';

      return `
      <div style="display:flex;gap:10px;padding:8px 0;${idx < data.length - 1 ? 'border-bottom:1px solid rgba(255,255,255,.04)' : ''}">
        <!-- 타임라인 선 -->
        <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;padding-top:3px">
          <div style="width:8px;height:8px;border-radius:50%;background:${dotColor};flex-shrink:0"></div>
          ${idx < data.length - 1
            ? `<div style="width:1px;flex:1;background:rgba(255,255,255,.07);margin-top:3px"></div>`
            : ''}
        </div>
        <!-- 내용 -->
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap">
            <span style="font-size:11px;font-weight:700;color:${isFirst ? 'var(--text)' : 'var(--text2)'}">${row.market_date}</span>
            ${flow.market_mood_label
              ? `<span style="font-size:10px;font-weight:600;color:${moodColor}">${flow.market_mood_label}</span>`
              : ''}
            ${kospiStr}
            ${vixStr}
          </div>
          <div style="font-size:12px;color:var(--text1);line-height:1.5;margin-bottom:4px">
            ${row.one_line_summary || '—'}
          </div>
          ${kps.length ? `
          <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:3px">
            ${kps.slice(0, 3).map(kp =>
              `<span style="font-size:10px;color:var(--text2);background:rgba(255,255,255,.04);
                border:1px solid rgba(255,255,255,.07);border-radius:3px;padding:1px 6px;
                white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px">${kp}</span>`
            ).join('')}
          </div>` : ''}
        </div>
      </div>`;
    }).join('');

  } catch(e) {
    console.error('[InsightHistory]', e);
    el.innerHTML = `<div style="color:var(--text2);font-size:12px;padding:.5rem 0">기록 조회 실패: ${e.message}</div>`;
  }
}


// ════════════════════════════════════════════════════════════
// 메인 진입점
// ════════════════════════════════════════════════════════════
/**
 * @param {boolean} [force=false]  true면 DB 캐시를 건너뛰고 실시간 재계산
 */
async function loadMarketInsight(force = false) {
  const el = document.getElementById('market-insight-card');
  if (!el) return;

  el.innerHTML = `<div style="padding:.5rem;color:var(--text2);font-size:12px">
    <span class="loading"></span> ${force ? '재생성 중...' : '분석 중...'}</div>`;

  try {
    // DB 우선 조회 (force=true 이면 건너뜀)
    if (!force) {
      const dbData = await _loadSummaryFromDB();
      if (dbData) {
        _renderInsightCard(dbData);
        return;
      }
    }
    // 실시간 계산 (폴백 또는 강제 재생성)
    const liveData = await _buildLiveSections();
    _renderInsightCard(liveData);
  } catch(e) {
    console.error('[MarketInsight]', e);
    el.innerHTML = `<div style="color:var(--text2);font-size:12px;padding:.5rem">
      분석 데이터 준비 중... (장 마감 후 업데이트)</div>`;
  }
}
