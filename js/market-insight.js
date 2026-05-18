/**
 * market-insight.js — 투자포인트 요약 엔진
 *
 * 구조:
 *   ① 데이터 수집  buildInsightData()
 *   ② 판단 로직    analyzeMarket()
 *   ③ 문장 생성    generateInsightText()   ← AI API로 교체 가능한 계층
 *   ④ 렌더링       renderMarketInsight()
 *
 * 의존:
 *   window._macroData        (chart-macro.js)
 *   window._krIndFinalReturn (chart-industry.js)
 *   window._krIndDates       (chart-industry.js)
 *   window.USKR_MAP          (chart-uskr.js)
 *   window.KR_INDUSTRIES     (config.js)
 *   sb                       (config.js)
 */

// ── 미국 ETF → KR 산업 매핑 레이블 ──────────────────────────────────
const USKR_LABELS = {
  '반도체': 'SOXX·SMH',  '바이오': 'IBB·XBI',  '로봇': 'BOTZ·ROBO',
  '우주':   'ARKX·UFO',  '2차전지':'LIT·BATT',  '소비재':'XLY·ONLN',
  '엔터':   'XLC·PEJ',   '조선':   'BOAT·SEA',  '테크':  'VGT·XLK',
  '뷰티':   'RTH·ONLN',  '신재생': 'ICLN·QCLN',
};

// ── 장세 판단 임계값 ──────────────────────────────────────────────────
const THR = {
  STRONG:    0.5,   // 강세 기준 등락률(%)
  WEAK:     -0.5,   // 약세 기준
  SURGE:     2.0,   // 급등
  PLUNGE:   -2.0,   // 급락
  VIX_HIGH:  25,    // VIX 공포 구간
  VIX_FEAR:  20,    // VIX 주의 구간
  RANK_CHG:  3,     // 업종 순위 변화 유의미 기준
};


// ════════════════════════════════════════════════════════════
// ① 데이터 수집
// ════════════════════════════════════════════════════════════

async function buildInsightData() {
  const m    = window._macroData        || {};
  const krR  = window._krIndFinalReturn || {};  // 현재 기간 KR 업종 수익률
  const indDates = window._krIndDates   || {};

  // ── US ETF 산업별 평균 등락률 (us_market 최신 2일치) ──
  const usIndAvg = {};   // { '반도체': { d1: 0.5, d5: 2.1 } }
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
      KR_INDUSTRIES.forEach(ind => {
        const tickers = uskrMap[ind] || [];
        const d1Vals  = latest.filter(r => r.industry === ind && tickers.includes(r.ticker) && r.chg_pct != null).map(r => r.chg_pct);
        if (!d1Vals.length) return;
        usIndAvg[ind] = { d1: d1Vals.reduce((s,v)=>s+v,0) / d1Vals.length };
      });
    }
  } catch(e) { console.warn('[Insight] US ETF 조회 오류:', e); }

  // ── KR 업종별 기간 수익률 계산 (1일/5일/20일) ──
  const krPeriod = {};  // { '반도체': { d1: -0.3, d5: 1.2, d20: 5.4 } }
  KR_INDUSTRIES.forEach(ind => {
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
// ② 판단 로직
// ════════════════════════════════════════════════════════════

function analyzeMarket({ m, krR, krPeriod, usIndAvg }) {

  // ── 미국 시장 상태 판단 ──
  const sp500Chg   = m.sp500_chg  ?? 0;
  const nasdaqChg  = m.nasdaq_chg ?? 0;
  const vix        = m.vix        ?? 0;
  const us10y      = m.us10y      ?? 0;
  const kospiChg   = m.kospi_chg  ?? 0;
  const kosdaqChg  = m.kosdaq_chg ?? 0;

  // 장세 판단
  const usAvgChg = (sp500Chg + nasdaqChg) / 2;
  let usMarketState, krMarketState, marketRegime;

  if (vix >= THR.VIX_HIGH)     usMarketState = 'risk-off';
  else if (usAvgChg >= THR.STRONG) usMarketState = 'risk-on';
  else if (usAvgChg <= THR.WEAK)   usMarketState = 'caution';
  else                              usMarketState = 'neutral';

  const krAvgChg = (kospiChg + kosdaqChg) / 2;
  if (krAvgChg >= 1.0)         krMarketState = 'strong';
  else if (krAvgChg >= 0.3)    krMarketState = 'mild-up';
  else if (krAvgChg <= -1.0)   krMarketState = 'weak';
  else if (krAvgChg <= -0.3)   krMarketState = 'mild-down';
  else                          krMarketState = 'flat';

  // 장세 유형 (regime)
  const defenseInds = ['뷰티','소비재'];
  const growthInds  = ['반도체','바이오','테크','로봇','우주'];
  const defenseAvg  = defenseInds.map(i => usIndAvg[i]?.d1 ?? 0).reduce((s,v)=>s+v,0)/defenseInds.length;
  const growthAvg   = growthInds .map(i => usIndAvg[i]?.d1 ?? 0).reduce((s,v)=>s+v,0)/growthInds.length;

  if (vix >= THR.VIX_HIGH)                          marketRegime = 'risk-off';
  else if (defenseAvg > growthAvg + 0.5)            marketRegime = '방어주 장세';
  else if (growthAvg  > defenseAvg + 0.5)           marketRegime = '성장주 장세';
  else if (usMarketState === 'risk-on')             marketRegime = 'risk-on';
  else if (usMarketState === 'caution')             marketRegime = '관망';
  else                                               marketRegime = '혼조';

  // ── US 업종 강약 분류 ──
  const usSorted = Object.entries(usIndAvg)
    .filter(([,v]) => v?.d1 != null)
    .sort(([,a],[,b]) => b.d1 - a.d1);

  const usStrong = usSorted.filter(([,v]) => v.d1 >= THR.STRONG).map(([ind]) => ind);
  const usWeak   = usSorted.filter(([,v]) => v.d1 <= THR.WEAK  ).map(([ind]) => ind);
  const usNeutral = usSorted.filter(([,v]) => v.d1 > THR.WEAK && v.d1 < THR.STRONG).map(([ind]) => ind);

  // ── KR 업종 강약 분류 ──
  const krSorted = KR_INDUSTRIES
    .filter(ind => krPeriod[ind]?.d1 != null)
    .sort((a,b) => (krPeriod[b]?.d1 ?? 0) - (krPeriod[a]?.d1 ?? 0));

  // 5일 순위 vs 1일 순위로 모멘텀 변화 감지
  const krRank1d = krSorted.map((ind,i) => ({ ind, rank: i+1 }));
  const krSorted5d = KR_INDUSTRIES
    .filter(ind => krPeriod[ind]?.d5 != null)
    .sort((a,b) => (krPeriod[b]?.d5 ?? 0) - (krPeriod[a]?.d5 ?? 0));
  const krRank5dMap = {};
  krSorted5d.forEach((ind,i) => { krRank5dMap[ind] = i+1; });

  const krRising  = [];  // 1일 순위 5일 대비 상승 업종
  const krFalling = [];  // 1일 순위 5일 대비 하락 업종
  krRank1d.forEach(({ ind, rank }) => {
    const rank5d = krRank5dMap[ind] ?? rank;
    const diff   = rank5d - rank;  // 양수 = 순위 상승(숫자 감소)
    if (diff >= THR.RANK_CHG)  krRising .push({ ind, diff });
    if (diff <= -THR.RANK_CHG) krFalling.push({ ind, diff: Math.abs(diff) });
  });

  // ── 미국→한국 연계 해석 ──
  const crossSignals = [];  // { type, ind, usChg, krChg, message }
  KR_INDUSTRIES.forEach(ind => {
    const usChg = usIndAvg[ind]?.d1 ?? null;
    const krChg = krPeriod[ind]?.d1 ?? null;
    if (usChg == null || krChg == null) return;

    if (usChg >= THR.STRONG && krChg <= -THR.STRONG) {
      crossSignals.push({ type: 'lag', ind, usChg, krChg,
        msg: `미국 강세(${_fmt(usChg)}) → 한국 아직 미반응(${_fmt(krChg)}) — 후행 관찰` });
    } else if (usChg <= THR.WEAK && krChg >= THR.STRONG) {
      crossSignals.push({ type: 'decouple-risk', ind, usChg, krChg,
        msg: `한국 강세(${_fmt(krChg)})이나 미국 약세(${_fmt(usChg)}) — 선별 주의` });
    } else if (usChg >= THR.STRONG && krChg >= THR.STRONG) {
      crossSignals.push({ type: 'sync-up', ind, usChg, krChg,
        msg: `미국·한국 동반 강세(${_fmt(usChg)} / ${_fmt(krChg)})` });
    } else if (usChg <= THR.WEAK && krChg <= THR.WEAK) {
      crossSignals.push({ type: 'sync-down', ind, usChg, krChg,
        msg: `미국·한국 동반 약세(${_fmt(usChg)} / ${_fmt(krChg)})` });
    }
  });

  // ── 행동 포인트 ──
  const watchList  = [];  // 오늘 먼저 볼 업종
  const cautionList= [];  // 조심할 업종

  crossSignals.filter(s => s.type === 'lag' || s.type === 'sync-up')
    .forEach(s => watchList.push(s.ind));
  crossSignals.filter(s => s.type === 'decouple-risk' || s.type === 'sync-down')
    .forEach(s => cautionList.push(s.ind));

  krRising.forEach(({ ind }) => { if (!watchList.includes(ind)) watchList.push(ind); });

  return {
    usMarketState, krMarketState, marketRegime,
    sp500Chg, nasdaqChg, kospiChg, kosdaqChg, vix, us10y,
    usSorted, usStrong, usWeak, usNeutral,
    krSorted, krRising, krFalling,
    crossSignals, watchList, cautionList,
    usIndAvg, krPeriod,
  };
}

function _fmt(v) {
  if (v == null) return '—';
  return (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
}


// ════════════════════════════════════════════════════════════
// ③ 문장 생성 (AI로 교체 가능한 계층)
// generateInsightText(analysis) → { sections: [...] }
// ════════════════════════════════════════════════════════════

function generateInsightText(a) {
  const sections = [];

  // 1) 한줄 총평
  const regimeIcon = { 'risk-on':'🟢','risk-off':'🔴','방어주 장세':'🛡','성장주 장세':'🚀','관망':'🟡','혼조':'⚪' };
  const usOneLiner = _usOneLiner(a);
  const krOneLiner = _krOneLiner(a);

  sections.push({ id: 'summary', title: '오늘의 시장 총평',
    items: [
      { icon: regimeIcon[a.marketRegime] || '⚪', label: '장세', text: a.marketRegime },
      { icon: '🇺🇸', label: '미국', text: usOneLiner },
      { icon: '🇰🇷', label: '한국', text: krOneLiner },
    ]
  });

  // 2) 미국 업종 흐름
  const usFlowItems = [];
  if (a.usStrong.length) usFlowItems.push({ icon:'📈', label:'강세', text: a.usStrong.map(i=>`${i}(${_fmt(a.usIndAvg[i]?.d1)})`).join(' · ') });
  if (a.usWeak.length)   usFlowItems.push({ icon:'📉', label:'약세', text: a.usWeak.map(i=>`${i}(${_fmt(a.usIndAvg[i]?.d1)})`).join(' · ') });
  if (a.usNeutral.length)usFlowItems.push({ icon:'➖', label:'중립', text: a.usNeutral.join(' · ') });

  sections.push({ id: 'us-flow', title: '🇺🇸 미국 업종 흐름', items: usFlowItems });

  // 3) 미국→한국 연계 해석
  const crossItems = [];
  const lagSigs      = a.crossSignals.filter(s => s.type === 'lag');
  const riskSigs     = a.crossSignals.filter(s => s.type === 'decouple-risk');
  const syncUpSigs   = a.crossSignals.filter(s => s.type === 'sync-up');
  const syncDownSigs = a.crossSignals.filter(s => s.type === 'sync-down');

  if (lagSigs.length)      crossItems.push({ icon:'⏳', label:'후행 관찰', text: lagSigs.map(s=>`${s.ind}(미국 ${_fmt(s.usChg)} → 한국 ${_fmt(s.krChg)})`).join(' / ') });
  if (riskSigs.length)     crossItems.push({ icon:'⚠️', label:'디커플링 주의', text: riskSigs.map(s=>`${s.ind}(한국 ${_fmt(s.krChg)} 강하나 미국 ${_fmt(s.usChg)})`).join(' / ') });
  if (syncUpSigs.length)   crossItems.push({ icon:'🔗', label:'동반 강세', text: syncUpSigs.map(s=>s.ind).join(' · ') });
  if (syncDownSigs.length) crossItems.push({ icon:'🔗', label:'동반 약세', text: syncDownSigs.map(s=>s.ind).join(' · ') });
  if (!crossItems.length)  crossItems.push({ icon:'➖', label:'신호 없음', text: '미국·한국 뚜렷한 연계 신호 없음' });

  sections.push({ id: 'cross', title: '🔀 미국→한국 업종 연계 해석', items: crossItems });

  // 4) 변화 감지
  const changeItems = [];
  if (a.krRising.length)  changeItems.push({ icon:'🔺', label:'모멘텀 강화', text: a.krRising.map(({ind,diff})=>`${ind}(5일 대비 ${diff}단계↑)`).join(' / ') });
  if (a.krFalling.length) changeItems.push({ icon:'🔻', label:'모멘텀 둔화', text: a.krFalling.map(({ind,diff})=>`${ind}(5일 대비 ${diff}단계↓)`).join(' / ') });
  if (!changeItems.length) changeItems.push({ icon:'➖', label:'변화 없음', text: '뚜렷한 업종 순위 변동 없음' });

  // 20일 대비 KR 상대강도 변화 상위/하위
  const kr20sorted = KR_INDUSTRIES.filter(i=>a.krPeriod[i]?.d20!=null)
    .sort((a2,b2)=>(a.krPeriod[b2]?.d1??0)-(a.krPeriod[b2]?.d20??0)*0 - ((a.krPeriod[a2]?.d1??0)-(a.krPeriod[a2]?.d20??0)*0));
  const krTop = a.krSorted.slice(0,3).map(i=>`${i} ${_fmt(a.krPeriod[i]?.d1)}`).join(' · ');
  const krBot = [...a.krSorted].reverse().slice(0,2).map(i=>`${i} ${_fmt(a.krPeriod[i]?.d1)}`).join(' · ');
  changeItems.push({ icon:'📊', label:'업종 등락', text: `▲ ${krTop}  ▼ ${krBot}` });

  sections.push({ id: 'change', title: '📡 변화 감지', items: changeItems });

  // 5) 행동 포인트
  const actionItems = [];
  if (a.watchList.length)   actionItems.push({ icon:'👀', label:'먼저 볼 업종', text: [...new Set(a.watchList)].slice(0,4).join(' · ') });
  if (a.cautionList.length) actionItems.push({ icon:'🚫', label:'조심할 업종', text: [...new Set(a.cautionList)].slice(0,3).join(' · ') });

  // 시장 전체 행동 판단
  if (a.marketRegime === 'risk-off' || a.vix >= THR.VIX_HIGH) {
    actionItems.push({ icon:'🛡', label:'전략', text: `VIX ${a.vix?.toFixed(1)} — 추격 자제, 방어·현금 비중 점검` });
  } else if (a.krRising.length >= 3 && a.usStrong.length >= 3) {
    actionItems.push({ icon:'🚀', label:'전략', text: '미국·한국 동반 강세 확인 — 강세 업종 집중, 포트폴리오 압축보다 확인 후 진입' });
  } else {
    actionItems.push({ icon:'🔍', label:'전략', text: '혼조 국면 — 추격보다 관찰, 후행 업종 중심 선별 대응' });
  }

  sections.push({ id: 'action', title: '⚡ 행동 포인트', items: actionItems });

  return { sections };
}

function _usOneLiner(a) {
  const { sp500Chg, nasdaqChg, vix, usStrong, usWeak } = a;
  if (vix >= THR.VIX_HIGH) return `공포 국면 (VIX ${vix?.toFixed(0)}) — 전 업종 부진`;
  if (sp500Chg >= 1) return `S&P500 강세 ${_fmt(sp500Chg)} — ${usStrong.slice(0,2).join('·')} 주도`;
  if (sp500Chg <= -1) return `S&P500 하락 ${_fmt(sp500Chg)} — ${usWeak.slice(0,2).join('·')} 부진`;
  return `S&P500 ${_fmt(sp500Chg)}, 나스닥 ${_fmt(nasdaqChg)} — 혼조`;
}

function _krOneLiner(a) {
  const { kospiChg, kosdaqChg, krSorted, krPeriod } = a;
  const top = krSorted[0];
  const bot = [...krSorted].reverse()[0];
  if (kospiChg >= 1) return `코스피 강세 ${_fmt(kospiChg)} — ${top} 주도`;
  if (kospiChg <= -1) return `코스피 하락 ${_fmt(kospiChg)} — ${bot} 부진`;
  return `코스피 ${_fmt(kospiChg)}, 코스닥 ${_fmt(kosdaqChg)} — 업종 혼조`;
}


// ════════════════════════════════════════════════════════════
// ④ 렌더링
// ════════════════════════════════════════════════════════════

function renderMarketInsight(insightData) {
  const el = document.getElementById('market-insight-card');
  if (!el) return;

  // 섹션 순서: 행동포인트 → 총평 → 미국 → 연계 → 변화
  const ordered = ['action', 'summary', 'us-flow', 'cross', 'change'];
  const sections = ordered
    .map(id => insightData.sections.find(s => s.id === id))
    .filter(Boolean);

  const sectionColors = {
    'action':   '#fbbf24',
    'summary':  '#2AABEE',
    'us-flow':  '#60a5fa',
    'cross':    '#a78bfa',
    'change':   '#34d399',
  };

  el.innerHTML = sections.map((sec, si) => {
    const color = sectionColors[sec.id] || '#6e7491';
    const isAction = sec.id === 'action';

    return `
    <div style="margin-bottom:${si < sections.length-1 ? '14px' : '4px'}">
      <div style="font-size:11px;font-weight:700;color:${color};
        letter-spacing:.08em;margin-bottom:6px;
        display:flex;align-items:center;gap:5px">
        <span style="width:2px;height:12px;background:${color};border-radius:2px;flex-shrink:0;opacity:.8"></span>
        ${sec.title}
      </div>
      <div style="display:flex;flex-direction:column;gap:${isAction?'4px':'3px'}">
        ${sec.items.map(item => {
          // 행동포인트는 더 크게, 나머지는 컴팩트
          const textSize   = isAction ? '13px' : '12px';
          const textColor  = item.label === '먼저 볼 업종' ? 'var(--tg)'
                           : item.label === '조심할 업종'  ? 'var(--red)'
                           : item.label === '전략'         ? '#fbbf24'
                           : item.label === '장세'         ? '#fff'
                           : 'var(--text)';
          const fontWeight = (isAction || item.label === '장세') ? '600' : '400';
          const bg         = item.label === '먼저 볼 업종' ? 'rgba(42,171,238,.08)'
                           : item.label === '조심할 업종'  ? 'rgba(245,54,92,.06)'
                           : item.label === '장세'         ? 'rgba(255,255,255,.05)'
                           : 'transparent';
          return `<div style="display:flex;align-items:baseline;gap:8px;
              padding:${isAction?'5px 8px':'3px 6px'};border-radius:5px;
              background:${bg}">
            <span style="font-size:13px;flex-shrink:0;width:18px;text-align:center;line-height:1">${item.icon}</span>
            <span style="font-size:10px;color:var(--text3);flex-shrink:0;
              white-space:nowrap;min-width:52px">${item.label}</span>
            <span style="font-size:${textSize};color:${textColor};
              font-weight:${fontWeight};line-height:1.4">${item.text}</span>
          </div>`;
        }).join('')}
      </div>
      ${si < sections.length-1 ? '<div style="margin-top:10px;border-bottom:1px solid rgba(255,255,255,.05)"></div>' : ''}
    </div>`;
  }).join('');

  // 업데이트 시각
  const now = new Date();
  const ts = now.toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' });
  el.insertAdjacentHTML('beforeend',
    `<div style="text-align:right;font-size:10px;color:var(--text3);margin-top:6px">
      규칙 기반 분석 · ${ts} 기준
    </div>`);
}

// ════════════════════════════════════════════════════════════
// 메인 진입점
// ════════════════════════════════════════════════════════════

async function loadMarketInsight() {
  const el = document.getElementById('market-insight-card');
  if (!el) return;

  el.innerHTML = '<div style="padding:.5rem;color:var(--text3);font-size:12px"><span class="loading"></span> 분석 중...</div>';

  try {
    const data     = await buildInsightData();
    const analysis = analyzeMarket(data);
    const text     = generateInsightText(analysis);
    renderMarketInsight(text);
  } catch(e) {
    console.error('[MarketInsight]', e);
    el.innerHTML = `<div style="color:var(--text3);font-size:12px">분석 데이터 준비 중...</div>`;
  }
}
