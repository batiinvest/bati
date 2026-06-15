// investment.js — 오늘의 시황 페이지

// ── 전체 지표 정의 ──
const INV_ALL_METRICS = [
  { col:'sp500',   name:'S&P500',   group:'미국',   color:'#2AABEE' },  // 하늘파랑
  { col:'nasdaq',  name:'나스닥',    group:'미국',   color:'#ff6b35' },  // 주황
  { col:'dow',     name:'다우',      group:'미국',   color:'#a259ff' },  // 보라
  { col:'kospi',   name:'코스피',    group:'한국',   color:'#2dce89' },  // 초록
  { col:'kosdaq',  name:'코스닥',    group:'한국',   color:'#ffd600' },  // 노랑
  { col:'bitcoin', name:'비트코인', group:'암호화폐', color:'#f7931a' },  // 비트코인 오렌지
  { col:'usd_krw', name:'USD/KRW',  group:'환율',   color:'#f5365c' },  // 빨강
  { col:'jpy_krw', name:'JPY/KRW',  group:'환율',   color:'#fb6340' },  // 주황빨강
  { col:'eur_krw', name:'EUR/KRW',  group:'환율',   color:'#ffc107' },  // 황금
  { col:'wti',     name:'WTI',      group:'원자재', color:'#8b5cf6' },  // 연보라
  { col:'gold',    name:'금',        group:'원자재', color:'#f59e0b' },  // 금색
  { col:'vix',     name:'VIX',      group:'기타',   color:'#64748b' },  // 회청
  { col:'us10y',   name:'미 금리',  group:'기타',   color:'#94a3b8' },  // 연회
];

const INV = {
  selected: new Set(['sp500','nasdaq','kospi','kosdaq']),
  period:   7,
};

// ── 카드 SVG 아이콘 맵 ──
const _ICO = (() => {
  const s = (d, w=14, mr=5) =>
    `<svg style="width:${w}px;height:${w}px;vertical-align:-2px;margin-right:${mr}px;flex-shrink:0" viewBox="0 0 16 16" fill="none">${d}</svg>`;
  return {
    bar:      s('<rect x="2" y="8" width="3" height="6" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="6.5" y="5" width="3" height="9" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="11" y="3" width="3" height="11" rx="1" stroke="currentColor" stroke-width="1.5"/>'),
    chart:    s('<path d="M2 12l3-4 3 2 3-5 3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'),
    bulb:     s('<path d="M8 2a4 4 0 0 1 2.5 7.1V11a.5.5 0 0 1-.5.5h-4A.5.5 0 0 1 5.5 11V9.1A4 4 0 0 1 8 2z" stroke="currentColor" stroke-width="1.4"/><path d="M6.5 13h3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>'),
    flag:     s('<path d="M4 2v12M4 2l8 3-8 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'),
    flow:     s('<path d="M2 4h12M4 8h8M6 12h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'),
    arrowUp:  s('<path d="M8 13V3M4 7l4-4 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>', 12, 4),
    arrowDn:  s('<path d="M8 3v10M4 9l4 4 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>', 12, 4),
    shuffle:  s('<path d="M2 5h3l8 6h1M14 5h-1l-2 1.5M2 11h3l2-1.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M13 3l2 2-2 2M13 9l2 2-2 2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>'),
    globe:    s('<circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.4"/><path d="M8 2.5C6.5 4 5.5 5.8 5.5 8s1 4 2.5 5.5M8 2.5C9.5 4 10.5 5.8 10.5 8s-1 4-2.5 5.5M2.5 8h11" stroke="currentColor" stroke-width="1.3"/>'),
    building: s('<rect x="3" y="2" width="10" height="12" rx="1" stroke="currentColor" stroke-width="1.4"/><path d="M6 6h1M9 6h1M6 9h1M9 9h1M7 14v-3h2v3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>'),
    grid:     s('<rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.4"/><rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.4"/><rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.4"/><rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.4"/>'),
    doc:      s('<rect x="3" y="1.5" width="10" height="13" rx="1.5" stroke="currentColor" stroke-width="1.4"/><path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>'),
    rocket:   s('<path d="M8 2c2.5 0 5 2.2 5 5.5C13 10.5 10.5 12.5 8 14 5.5 12.5 3 10.5 3 7.5 3 4.2 5.5 2 8 2z" stroke="currentColor" stroke-width="1.4"/><circle cx="8" cy="7.5" r="1.5" stroke="currentColor" stroke-width="1.3"/>'),
    refresh:  s('<path d="M13.5 8A5.5 5.5 0 112.5 5M2.5 2v3h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>', 12, 3),
    temp:     s('<path d="M10 9.2V3a2 2 0 0 0-4 0v6.2A4 4 0 1 0 10 9.2z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>'),
    coin:     s('<ellipse cx="8" cy="5" rx="5.5" ry="2.2" stroke="currentColor" stroke-width="1.4"/><path d="M2.5 5v6c0 1.2 2.5 2.2 5.5 2.2s5.5-1 5.5-2.2V5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M2.5 8c0 1.2 2.5 2.2 5.5 2.2S13.5 9.2 13.5 8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>'),
    history:  s('<circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.4"/><path d="M8 5v3.5l2.5 1.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>'),
  };
})();

// ── 스켈레톤 리스트 헬퍼 ──
function _skelList(n=5, compact=false) {
  const h = compact ? 10 : 12, p = compact ? '5px 10px' : '7px 12px';
  return Array(n).fill(0).map(() =>
    `<div style="display:flex;align-items:center;gap:8px;padding:${p};border-bottom:1px solid var(--border)">` +
    `<span class="skeleton" style="width:18px;height:${h}px;border-radius:3px;flex-shrink:0"></span>` +
    `<span class="skeleton" style="flex:1;height:${h}px;border-radius:3px"></span>` +
    `<span class="skeleton" style="width:44px;height:${h}px;border-radius:3px"></span>` +
    `</div>`
  ).join('');
}
function _skelCards(n=4) {
  return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;padding:12px">` +
    Array(n).fill(0).map(() =>
      `<div style="background:var(--bg3);border-radius:8px;padding:14px;display:flex;flex-direction:column;gap:8px">` +
      `<span class="skeleton" style="width:60%;height:12px;border-radius:4px"></span>` +
      `<span class="skeleton" style="width:40%;height:18px;border-radius:4px"></span>` +
      `<span class="skeleton" style="width:80%;height:10px;border-radius:3px"></span>` +
      `</div>`
    ).join('') + `</div>`;
}

// ── 매크로 카드 ──
function _macroCard(label, value, chg, color) {
  const up = chg >= 0;
  return `
  <div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:10px 12px;
              border-left:3px solid ${color};cursor:pointer" title="${label}">
    <div style="font-size:10px;color:var(--text3);margin-bottom:4px">${label}</div>
    <div style="font-size:15px;font-weight:700;font-variant-numeric:tabular-nums">${value}</div>
    <div style="font-size:11px;color:${up?'var(--up)':'var(--down)'};margin-top:2px">
      ${up?'▲':'▼'} ${Math.abs(chg).toFixed(2)}%
    </div>
  </div>`;
}

// ── 페이지 HTML ──
function pInvestment() {
  window._invTab = window._invTab || 'market';
  return `
  <!-- 페이지 헤더 -->
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem;flex-wrap:wrap;gap:8px">
    <div style="font-size:13px;font-weight:600;color:var(--text)">오늘의 시황</div>
    <div style="display:flex;align-items:center;gap:8px">
      <div style="font-size:11px;color:var(--text2)" id="inv-date"></div>
      <button class="btn btn-sm" id="inv-refresh-btn" onclick="refreshInvestment()">${_ICO.refresh}새로고침</button>
    </div>
  </div>


  <!-- 온도계 + 증시동향 같은 행 -->
  <div style="display:grid;grid-template-columns:1fr 2fr;gap:1rem;align-items:stretch;margin-bottom:1rem">

    <!-- 시장 온도계 -->
    <div class="card" style="margin-bottom:0;display:flex;flex-direction:column">
      <div class="card-header">
        <span class="card-title">${_ICO.temp}시장 온도계</span>
        <span style="font-size:11px;color:var(--text2);margin-left:auto" id="market-temp-date"></span>
      </div>
      <div class="card-body" style="padding:.75rem 1rem;flex:1" id="market-temp-body">
        <span class="skeleton" style="width:100%;height:60px;border-radius:6px;display:block"></span>
      </div>
    </div>

    <!-- 증시 동향 -->
    <div class="card" style="margin-bottom:0;display:flex;flex-direction:column">
      <div class="card-header" style="flex-wrap:wrap;gap:6px">
        <span class="card-title">${_ICO.bar}증시 동향</span>
        <div id="inv-banner-content" style="display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-left:auto">
          <span style="color:var(--text2);font-size:12px"><span class="loading"></span></span>
        </div>
      </div>
      <div id="inv-total-summary" style="padding:.75rem 1rem;border-bottom:1px solid var(--border)"></div>
      <div id="inv-industry-grid" style="flex:1"></div>
    </div>

  </div>

  <!-- 2단 레이아웃: 좌(시황 요약) + 우(공시/신호) -->
  <div style="display:grid;grid-template-columns:2fr 3fr;gap:1rem;align-items:start;margin-bottom:1rem">

    <!-- 좌 패널 -->
    <div id="inv-left" style="display:flex;flex-direction:column;gap:1rem">


      <!-- 주도주 Top5 -->
      <div class="card" style="margin-bottom:0">
        <div class="card-header" style="flex-wrap:wrap;gap:6px">
          <span class="card-title">${_ICO.rocket}주도주 탐색기</span>
          <button id="ls-refresh-btn" onclick="refreshLeadingStocks()"
            style="font-size:11px;padding:2px 8px;border-radius:5px;border:1px solid var(--border);
                   background:transparent;color:var(--text2);cursor:pointer;margin-left:auto"
            title="새로고침">${_ICO.refresh}</button>
        </div>
        <div style="border-top:1px solid var(--border)">
          <div style="padding:5px 10px;border-bottom:1px solid var(--border);display:flex;gap:3px">
            <button class="chip active" data-ls-tab="all"    onclick="switchLsTab('all')"    style="font-size:10px;padding:3px 8px">전체</button>
            <button class="chip"        data-ls-tab="kospi"  onclick="switchLsTab('kospi')"  style="font-size:10px;padding:3px 8px">코스피</button>
            <button class="chip"        data-ls-tab="kosdaq" onclick="switchLsTab('kosdaq')" style="font-size:10px;padding:3px 8px">코스닥</button>
            <span style="font-size:10px;color:var(--text2);margin-left:auto;align-self:center" id="ls-date"></span>
          </div>
          <div id="ls-body">${_skelList(8)}</div>
          <!-- 과거 주도주 수익률 (접힘) -->
          <div style="padding:5px 10px;border-top:1px solid var(--border);border-bottom:1px solid var(--border);display:flex;gap:3px">
            <span style="font-size:11px;font-weight:600;color:var(--text2)">과거 주도주 수익률</span>
            <span id="ls-bt-date" style="font-size:10px;color:var(--text2);margin-left:auto;align-self:center"></span>
            <div style="display:flex;gap:3px">
              <button class="chip active" data-bt-period="1w" onclick="switchBtPeriod('1w')" style="font-size:10px;padding:2px 6px">1주</button>
              <button class="chip"        data-bt-period="1m" onclick="switchBtPeriod('1m')" style="font-size:10px;padding:2px 6px">1달</button>
              <button class="chip"        data-bt-period="3m" onclick="switchBtPeriod('3m')" style="font-size:10px;padding:2px 6px">3달</button>
            </div>
          </div>
          <div id="ls-bt-body" style="padding:6px 8px">${_skelList(5)}</div>
        </div>
      </div>

      <!-- 수급 요약 -->
      <div class="card" style="margin-bottom:0">
        <div class="card-header">
          <span class="card-title">${_ICO.flow}기관/외국인 수급</span>
          <span style="font-size:11px;color:var(--text2)" id="flow-date-label">장중 4회 집계</span>
        </div>
        <div class="flow-grid" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border-top:1px solid var(--border)">
          <div>
            <div style="padding:5px 8px;font-size:10px;font-weight:600;color:var(--text1);background:var(--bg2);border-bottom:1px solid var(--border)">${_ICO.shuffle}동시매수</div>
            <div id="flow-body-both">${_skelList(6, true)}</div>
          </div>
          <div style="border-left:1px solid var(--border)">
            <div style="padding:5px 8px;font-size:10px;font-weight:600;color:var(--tg);background:var(--bg2);border-bottom:1px solid var(--border)">${_ICO.globe}외국인</div>
            <div id="flow-body-frgn">${_skelList(6, true)}</div>
          </div>
          <div style="border-left:1px solid var(--border)">
            <div style="padding:5px 8px;font-size:10px;font-weight:600;color:var(--yellow);background:var(--bg2);border-bottom:1px solid var(--border)">${_ICO.building}기관</div>
            <div id="flow-body-orgn">${_skelList(6, true)}</div>
          </div>
        </div>
      </div>

    </div>

    <!-- 우 패널 -->
    <div id="inv-right" style="display:flex;flex-direction:column;gap:1rem">

      <!-- 공시 피드 -->
      <div class="card" style="margin-bottom:0">
        <div class="card-header">
          <span class="card-title">${_ICO.doc}오늘 실적 공시 종목</span>
          <span id="inv-disclosure-date" style="font-size:11px;color:var(--text2);margin-left:8px"></span>
          <button id="inv-disclosure-expand-btn" class="btn btn-sm" style="margin-left:auto;font-size:12px"
            onclick="toggleAllDisclosures()">+ 전체 공시</button>
        </div>
        <div id="inv-disclosure-list" style="padding:.5rem 0">${_skelList(4)}</div>
        <div id="inv-all-disclosure" style="display:none;border-top:1px solid var(--border)">
          <div id="inv-all-disclosure-list" style="padding:.5rem 0">${_skelList(6)}</div>
        </div>
      </div>

      <!-- 실적 급등 Top5 -->
      <div class="card" style="margin-bottom:0">
        <div class="card-header" style="flex-wrap:wrap;gap:8px;align-items:center">
          <span class="card-title">${_ICO.rocket}실적 급등 종목</span>
          <div style="display:flex;align-items:center;gap:6px;margin-left:auto;flex-wrap:wrap">
            <div style="display:flex;gap:4px">
              <button class="chip active" data-surge-grade="all"  onclick="setSurgeGrade(this,'all')"  style="font-size:11px">전체</button>
              <button class="chip"        data-surge-grade="S"    onclick="setSurgeGrade(this,'S')"    style="font-size:11px">S급</button>
              <button class="chip"        data-surge-grade="A"    onclick="setSurgeGrade(this,'A')"    style="font-size:11px">A급</button>
              <button class="chip"        data-surge-grade="B"    onclick="setSurgeGrade(this,'B')"    style="font-size:11px">B급</button>
              <button class="chip"        data-surge-grade="관찰"  onclick="setSurgeGrade(this,'관찰')"  style="font-size:11px">관찰</button>
            </div>
            <select class="form-select" id="inv-earnings-quarter" style="width:130px;padding:3px 8px;font-size:12px"
              onchange="loadEarningsSurge()"><option value="">로딩 중...</option></select>
          </div>
        </div>
        <div id="inv-earnings-list" style="padding:.5rem 0">${_skelCards(4)}</div>
      </div>

      <!-- 산업 강도 매트릭스 (미니) -->
      <div id="im-card" class="card" style="margin-bottom:0">
        <div class="card-header" style="flex-wrap:wrap;gap:6px">
          <span class="card-title">${_ICO.grid}산업 강도 매트릭스</span>
          <span style="font-size:10px;color:var(--text2)" id="im-date"></span>
          <div style="display:flex;gap:4px;margin-left:auto">
            ${[{p:1,l:'1일'},{p:5,l:'5일'},{p:20,l:'20일'}].map(({p,l})=>`
              <button class="chip ${p===5?'active':''}" data-im-period="${p}"
                onclick="switchImPeriod(${p})" style="font-size:11px;padding:2px 8px">${l}</button>
            `).join('')}
          </div>
        </div>
        <div style="font-size:11px;color:var(--text2);padding:4px 12px 2px">
          US·KR 섹터 성과 비교 — 미국이 먼저 움직이면 한국이 따라온다
        </div>
        <div id="im-body">${_skelList(11, true)}</div>
      </div>

    </div>
  </div>

  <!-- 이하: 상세 섹션들 (전체 너비) -->
  <div id="inv-tab-market" style="display:block">


    <!-- 섹터 수급 트렌드 (전체 너비) -->
    <div id="sf-card" class="card" style="margin-bottom:12px">
      <div class="card-header" style="flex-wrap:wrap;gap:6px">
        <span class="card-title">${_ICO.shuffle}섹터 수급 트렌드</span>
        <span style="font-size:10px;color:var(--text2)" id="sf-date"></span>
        <div style="display:flex;gap:4px;margin-left:auto;flex-wrap:wrap;align-items:center">
          <button class="chip active" data-sf-type="combined" onclick="switchSfType('combined')" style="font-size:11px;padding:2px 8px">합산</button>
          <button class="chip" data-sf-type="foreign"         onclick="switchSfType('foreign')"  style="font-size:11px;padding:2px 8px">외국인</button>
          <button class="chip" data-sf-type="inst"            onclick="switchSfType('inst')"     style="font-size:11px;padding:2px 8px">기관</button>
          <div style="width:1px;height:14px;background:var(--border);margin:0 2px;flex-shrink:0"></div>
          ${[{p:1,l:'1일'},{p:5,l:'5일'},{p:20,l:'20일'}].map(({p,l})=>`
            <button class="chip ${p===5?'active':''}" data-sf-period="${p}"
              onclick="switchSfPeriod(${p})" style="font-size:11px;padding:2px 8px">${l}</button>
          `).join('')}
        </div>
      </div>
      <div style="font-size:11px;color:var(--text2);padding:5px 12px 2px" id="sf-desc">외국인+기관 스마트머니 (KR 전체 종목 기준)</div>
      <div id="sf-body" style="padding:.25rem 0">${_skelList(12, true)}</div>
    </div>

    <!-- ③-b 종목별 수급 순위 (외국인/기관 10거래일 누적) -->
    <div class="card" style="margin-bottom:12px">
      <div class="card-header" style="flex-wrap:wrap;gap:6px">
        <span class="card-title">🏦 종목별 수급 순위 <span style="font-size:10px;font-weight:400;color:var(--text2)">(10거래일 누적)</span></span>
        <span style="font-size:10px;color:var(--text2)" id="stockflow-date"></span>
        <div style="display:flex;gap:4px;margin-left:auto">
          <button class="chip active" data-sflow-type="foreign" onclick="switchStockFlowType('foreign')" style="font-size:11px;padding:2px 8px">외국인</button>
          <button class="chip"        data-sflow-type="inst"    onclick="switchStockFlowType('inst')"    style="font-size:11px;padding:2px 8px">기관</button>
          <button class="chip"        data-sflow-type="combined" onclick="switchStockFlowType('combined')" style="font-size:11px;padding:2px 8px">합산</button>
        </div>
      </div>
      <div id="stockflow-body" style="padding:.25rem 0">
        ${_skelList(6, true)}
      </div>
    </div>

    <!-- ⑤ 투자포인트 요약 -->
    <div class="card insight-card" style="margin-bottom:12px">
      <div class="card-header" style="justify-content:space-between;flex-wrap:wrap;gap:4px">
        <span class="card-title">${_ICO.bulb}투자포인트 요약</span>
        <div style="display:flex;gap:5px">
          <button class="chip" id="btn-insight-hist" style="font-size:11px;padding:2px 8px"
            onclick="toggleInsightHistory()">${_ICO.history}히스토리</button>
          <button class="chip" style="font-size:11px;padding:2px 8px"
            onclick="loadMarketInsight()">${_ICO.refresh}재분석</button>
        </div>
      </div>
      <div class="card-body" style="padding:.75rem 1rem" id="market-insight-card">
        <div style="color:var(--text2);font-size:12px"><span class="loading"></span> 분석 중...</div>
      </div>
      <!-- 히스토리 패널 (접힘) -->
      <div id="insight-history" style="display:none;border-top:1px solid var(--border)">
        <div style="padding:7px 1rem 4px;font-size:11px;font-weight:600;color:var(--text2);
          letter-spacing:.04em;display:flex;align-items:center;gap:6px">
          최근 시장 국면
          <span style="font-size:10px;font-weight:400;opacity:.7">(DB 저장 기준)</span>
        </div>
        <div id="insight-history-body" style="padding:0 1rem .75rem">
          <div style="color:var(--text2);font-size:12px;padding:.5rem 0"><span class="loading"></span></div>
        </div>
      </div>
    </div>


    <!-- ⑦ 산업 동향 -->
    <div class="card" style="margin-bottom:12px">
      <div class="card-header" style="flex-wrap:wrap;gap:4px;padding-bottom:6px">
        <span class="card-title">${_ICO.grid}산업 동향</span>
        <!-- US ETF 배너 -->
        <div id="inv-etf-banner" style="display:flex;gap:10px;align-items:center;margin-left:auto;font-size:12px;flex-wrap:wrap">
          <span style="color:var(--text2)"><span class="loading"></span></span>
        </div>
      </div>
      <!-- KR 모니터링 현황 -->
      <div id="inv-industry-banner" style="padding:4px 1rem 6px;border-bottom:1px solid var(--border);font-size:12px;display:flex;gap:10px;color:var(--text2)">
        <span><span class="loading"></span></span>
      </div>
      <div id="inv-industry-chart"></div>
    </div>


    <!-- ⑨ 52주 신고가 종목 -->
    <div class="card" style="margin-bottom:12px">
      <div class="card-header" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span class="card-title">${_ICO.flag}오늘 52주 신고가 갱신</span>
        <span style="font-size:10px;color:var(--text2);font-weight:400">KIS 기준 당일 신고가 지정 종목</span>
        <div style="display:flex;gap:4px;margin-left:auto">
          <button class="chip active" data-hgpr-tab="monitored" onclick="switchHgprTab('monitored')" style="font-size:11px;padding:2px 8px">⭐ 모니터링</button>
          <button class="chip"        data-hgpr-tab="all"       onclick="switchHgprTab('all')"       style="font-size:11px;padding:2px 8px">전체 종목</button>
        </div>
      </div>
      <div id="hgpr-body" style="padding:.5rem 0">
        ${_skelList(6)}
      </div>
    </div>

    <!-- ⑩ 거래대금 상위 -->
    <div class="card" style="margin-bottom:12px">
      <div class="card-header">
        <span class="card-title">${_ICO.coin}거래대금 상위</span>
        <span style="font-size:11px;color:var(--text2)">당일 거래대금 기준</span>
      </div>
      <div id="inv-volume-body" style="display:grid;grid-template-columns:repeat(2,1fr);gap:0;border-top:1px solid var(--border)">
        ${_skelList(3)}
      </div>
    </div>

    <!-- ⑪ 흐름 비교 차트 (접기/펼치기) -->
    <div class="card" style="margin-bottom:12px">
      <div class="card-header" style="cursor:pointer" onclick="toggleTrendChart()">
        <span class="card-title">${_ICO.chart}흐름 비교 차트</span>
        <span id="inv-trend-toggle" style="font-size:12px;color:var(--text2);margin-left:auto">접기 ▴</span>
      </div>
      <div id="inv-trend-body" style="display:block">
        <div style="flex-wrap:wrap;gap:8px;padding:.75rem 1rem;border-bottom:1px solid var(--border);display:flex;align-items:center">
          <div style="display:flex;gap:4px;margin-left:auto">
            ${[{d:7,l:'1주'},{d:30,l:'1달'},{d:90,l:'3달'}].map(({d,l})=>`
              <button class="chip ${d===7?'active':''}" data-inv-period="${d}"
                onclick="setInvPeriod(${d})" style="font-size:11px;padding:2px 8px">${l}</button>
            `).join('')}
          </div>
        </div>
        <!-- 그룹 필터 버튼 -->
        <div style="padding:.5rem 1rem;border-bottom:1px solid var(--border);display:flex;flex-wrap:wrap;gap:4px;align-items:center">
          <span style="font-size:11px;color:var(--text2);margin-right:4px">그룹선택</span>
          ${['미국','한국','환율','원자재','기타'].map(g => `
            <button class="chip" style="font-size:11px;padding:2px 8px"
              onclick="selectInvGroup('${g}')">${g}</button>
          `).join('')}
          <button class="chip" style="font-size:11px;padding:2px 8px;margin-left:4px"
            onclick="selectInvGroup('')">전체해제</button>
        </div>
        <div style="padding:.75rem 1rem;border-bottom:1px solid var(--border);display:flex;flex-wrap:wrap;gap:6px" id="inv-metric-checks">
          ${INV_ALL_METRICS.map(m => `
            <label style="display:flex;align-items:center;gap:5px;cursor:pointer;padding:3px 8px;border-radius:100px;border:1px solid var(--border);font-size:12px;user-select:none"
              id="inv-lbl-${m.col}">
              <input type="checkbox" style="display:none" id="inv-chk-${m.col}"
                onchange="toggleInvMetric('${m.col}')" ${['sp500','nasdaq','kospi','kosdaq'].includes(m.col)?'checked':''}>
              <span style="width:8px;height:8px;border-radius:50%;background:${m.color};flex-shrink:0"></span>
              <span>${m.name}</span>
              <span style="font-size:10px;color:var(--text2)">${m.group}</span>
            </label>
          `).join('')}
        </div>
        <div style="padding:1rem;position:relative;height:260px">
          <canvas id="inv-trend-chart"></canvas>
          <div id="inv-trend-empty" style="display:none;position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--text2);font-size:13px">
            데이터 수집 중... (매일 09:00, 16:10 업데이트)
          </div>
        </div>
      </div>
    </div>

    <!-- ⑫ 산업별 흐름 비교 -->
    <div class="card" style="margin-bottom:12px">
      <div class="card-header" style="flex-wrap:wrap;gap:6px">
        <span class="card-title">${_ICO.chart}산업별 흐름 비교</span>
        <div style="display:flex;gap:4px;margin-left:auto">
          ${[{d:7,l:'1주'},{d:30,l:'1달'},{d:90,l:'3달'}].map(({d,l})=>`
            <button class="chip ${d===7?'active':''}" data-ind-period="${d}"
              onclick="setIndTrendPeriod(${d})" style="font-size:11px;padding:2px 8px">${l}</button>
          `).join('')}
        </div>
      </div>
      <!-- ② 수익률 순위 범례 -->
      <div style="padding:.5rem 1rem .25rem;border-bottom:1px solid var(--border);display:flex;flex-wrap:wrap;gap:6px;align-items:center" id="ind-trend-checks">
        <!-- 상/하위 버튼 -->
        <div style="display:flex;gap:4px;margin-left:auto;flex-shrink:0">
          <button class="chip" id="btn-top3" onclick="filterIndTrend('top')"
            style="font-size:11px;padding:2px 8px">▲ 상위3</button>
          <button class="chip" id="btn-bot3" onclick="filterIndTrend('bottom')"
            style="font-size:11px;padding:2px 8px">▼ 하위3</button>
          <button class="chip active" id="btn-all" onclick="filterIndTrend('all')"
            style="font-size:11px;padding:2px 8px">전체</button>
        </div>
      </div>
      <div style="padding:1rem;position:relative;height:300px">
        <canvas id="ind-trend-chart"></canvas>
      </div>
    </div>

    <!-- ⑬ US vs KR 산업 비교 차트 -->
    <div class="card" style="margin-bottom:12px">
      <div class="card-header" style="flex-wrap:wrap;gap:6px">
        <span class="card-title">${_ICO.globe}US vs KR 산업 비교</span>
        <div style="display:flex;gap:4px;margin-left:auto">
          ${[{d:7,l:'1주'},{d:30,l:'1달'},{d:90,l:'3달'}].map(({d,l})=>`
            <button class="chip ${d===7?'active':''}" data-uskr-period="${d}"
              onclick="setUskrPeriod(${d})" style="font-size:11px;padding:2px 8px">${l}</button>
          `).join('')}
        </div>
      </div>
      <!-- 산업 선택 (하나 선택 → KR+US 1:1 비교) -->
      <div style="padding:.5rem 1rem;border-bottom:1px solid var(--border);display:flex;flex-wrap:wrap;gap:6px;align-items:center">
        ${INDUSTRIES.map((ind,i)=>`
          <button class="chip ${i===0?'active':''}" id="uskr-btn-${ind}"
            onclick="selectUskrInd('${ind}')"
            style="font-size:12px;padding:3px 10px">${ind}</button>
        `).join('')}
      </div>
      <!-- 모드 전환 버튼 -->
      <div style="padding:.4rem 1rem;border-bottom:1px solid var(--border);display:flex;gap:6px;align-items:center">
        <span style="font-size:11px;color:var(--text2)">표시 방식</span>
        <button class="chip active" id="uskr-mode-avg" onclick="setUskrMode('avg')"
          style="font-size:11px;padding:2px 8px">KR vs US 평균</button>
        <button class="chip" id="uskr-mode-all" onclick="setUskrMode('all')"
          style="font-size:11px;padding:2px 8px">KR + 개별 ETF 전체</button>
      </div>
      <div style="padding:1rem;position:relative;height:320px">
        <canvas id="uskr-chart"></canvas>
      </div>
    </div>

    <!-- ⑭ 급등/급락 — 4열 그리드 -->
    <div class="surge-drop-grid">
      <div class="card" style="margin-bottom:0">
        <div class="card-header" style="padding:8px 10px">
          <span class="card-title" style="color:var(--red);font-size:13px">${_ICO.arrowUp}코스피 급등</span>
        </div>
        <div id="inv-surge-kospi" style="padding:.25rem 0"></div>
      </div>
      <div class="card" style="margin-bottom:0">
        <div class="card-header" style="padding:8px 10px">
          <span class="card-title" style="color:var(--blue);font-size:13px">${_ICO.arrowDn}코스피 급락</span>
        </div>
        <div id="inv-drop-kospi" style="padding:.25rem 0"></div>
      </div>
      <div class="card" style="margin-bottom:0">
        <div class="card-header" style="padding:8px 10px">
          <span class="card-title" style="color:var(--red);font-size:13px">${_ICO.arrowUp}코스닥 급등</span>
        </div>
        <div id="inv-surge-kosdaq" style="padding:.25rem 0"></div>
      </div>
      <div class="card" style="margin-bottom:0">
        <div class="card-header" style="padding:8px 10px">
          <span class="card-title" style="color:var(--blue);font-size:13px">${_ICO.arrowDn}코스닥 급락</span>
        </div>
        <div id="inv-drop-kosdaq" style="padding:.25rem 0"></div>
      </div>
    </div>

  </div>

  <!-- 숨김 호환 div (setInvTab 참조용) -->
  <div id="inv-tab-disclosure" style="display:none"></div>`;
}




// ── 지수 카드 ──
// risk: null | 'caution' | 'danger' | 'critical'
function mkIndexCard(label, value, chg, unit, sub, risk) {
  const cc  = chg != null ? chgColor(chg) : 'var(--text2)';
  const cs  = chg != null ? chgStr(chg) : '—';
  const val = value != null ? Number(value).toLocaleString() + (unit||'') : '—';

  const _RS = {
    caution:  { border:'1px solid #f59e0b', bg:'rgba(245,158,11,0.09)', icon:'⚠️', shadow:'' },
    danger:   { border:'1px solid #ef4444', bg:'rgba(239,68,68,0.09)',  icon:'🚨', shadow:'' },
    critical: { border:'2px solid #dc2626', bg:'rgba(220,38,38,0.13)', icon:'🔴', shadow:'box-shadow:0 0 10px rgba(220,38,38,0.25);' },
  };
  const rs = risk ? _RS[risk] : null;
  const cardStyle = rs
    ? `padding:10px 12px;border:${rs.border};background:${rs.bg};${rs.shadow}`
    : 'padding:10px 12px';

  return `
  <div class="card" style="${cardStyle}">
    <div style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--text1);margin-bottom:3px;font-weight:500">
      ${rs ? `<span style="font-size:11px">${rs.icon}</span>` : ''}
      <span>${label}</span>
    </div>
    <div style="font-size:15px;font-weight:700;color:${rs?'var(--text1)':'var(--text1)'};line-height:1.2">${val}</div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px">
      <div style="font-size:12px;color:${cc};font-weight:600">${cs}</div>
      ${sub ? `<div style="font-size:10px;color:var(--text1)">${sub}</div>` : ''}
    </div>
  </div>`;
}

// ── 탭 전환 (2단 레이아웃으로 전환 후 no-op, 호환성 유지) ──
function setInvTab(tab) {
  window._invTab = tab;
}

// ── 날짜/시간 업데이트 ────────────────────────────────────────
function _updateInvTimestamp() {
  const el = document.getElementById('inv-date');
  if (!el) return;
  const now = new Date();
  const d = now.toLocaleDateString('ko-KR', {year:'numeric', month:'2-digit', day:'2-digit'})
    .replace(/\. /g, '-').replace('.', '').trim();
  const t = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  el.textContent = `기준: ${d} ${t}`;
}

// ── 새로고침 ──────────────────────────────────────────────────
async function refreshInvestment() {
  _latestMarketDate = null;
  const btn = document.getElementById('inv-refresh-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳'; }

  try {
    if (window._invTab === 'disclosure') {
      _allDiscLoaded = false;
      loadTodayDisclosures();
      loadEarningsSurge();
      const panel = document.getElementById('inv-all-disclosure');
      if (panel && panel.style.display !== 'none') loadAllDisclosures();
      try {
        await sb.from('app_config').upsert({
          key: 'run_disclosure_flag', value: String(Date.now()),
          description: '대시보드 공시수집 수동 트리거'
        }, { onConflict: 'key' });
        toast('📡 DART 공시 수집 요청 — 봇이 1분 내 업데이트합니다', 'info');
      } catch(e) { toast('트리거 전송 실패: ' + e.message, 'error'); }
    } else {
      // 시황 탭 — 서버 트리거 → 수집 완료 후 재로드
      const isWeekend = [0, 6].includes(new Date().getDay()); // 0=일, 6=토
      try {
        const upserts = [
          sb.from('app_config').upsert({
            key: 'run_macro_flag', value: String(Date.now()),
            description: '대시보드 매크로 수동 수집 트리거'
          }, { onConflict: 'key' }),
          sb.from('app_config').upsert({
            key: 'run_leading_stocks_flag', value: String(Date.now()),
            description: '주도주 탐색기 수동 생성 트리거'
          }, { onConflict: 'key' }),
          sb.from('app_config').upsert({
            key: 'run_sector_summary_flag', value: String(Date.now()),
            description: '산업별 요약·신호탐지 수동 집계 트리거'
          }, { onConflict: 'key' }),
        ];
        if (!isWeekend) {
          upserts.push(sb.from('app_config').upsert({
            key: 'run_market_all_flag', value: String(Date.now()),
            description: '대시보드 전체 종목 시장 데이터 수집 트리거'
          }, { onConflict: 'key' }));
        }
        await Promise.all(upserts);
        if (isWeekend) {
          toast('📡 매크로(환율·지수) 수집 요청 — 주말은 주식 시장 데이터 수집 제외', 'info');
        } else {
          toast('📡 서버 수집 요청 완료 — 약 1분 후 자동 반영됩니다', 'info');
        }
      } catch(e) {
        toast('트리거 전송 실패: ' + e.message, 'error');
        return;
      }

      // 버튼 로딩 상태 + 카운트다운
      let remaining = 70;
      const timer = setInterval(() => {
        remaining--;
        if (btn) btn.textContent = `⏳ ${remaining}초`;
        if (remaining <= 0) clearInterval(timer);
      }, 1000);

      // 70초 후 재로드 + 버튼 복구
      setTimeout(async () => {
        clearInterval(timer);
        _latestMarketDate = null;
        await loadInvestment();
        if (btn) { btn.disabled = false; btn.textContent = '🔄 새로고침'; }
        toast('✅ 최신 데이터로 업데이트됐습니다', 'success');
      }, 70000);

      return; // finally에서 버튼 복구 안 되도록
    }
  } finally {
    // 시황 탭은 70초 후 자동 복구, 공시 탭만 즉시 복구
    if (window._invTab === 'disclosure') {
      if (btn) { btn.disabled = false; btn.textContent = '🔄 새로고침'; }
    }
  }
}

// ── 메인 로드 ──
async function loadInvestment() {
  // 시황 탭 로드 (market-overview.js) — 배너 채운 후 나머지 실행
  await loadMacroData();
  loadTrendChart();

  // 마지막 업데이트 시각 표시
  try {
    const { data: lastUpdate } = await sb.from('macro_data')
      .select('base_date,updated_at').order('base_date', { ascending: false }).limit(1).single();
    const el = document.getElementById('inv-date');
    if (el && lastUpdate) {
      if (lastUpdate.updated_at) {
        const kst = new Date(new Date(lastUpdate.updated_at).getTime() + 9 * 60 * 60 * 1000);
        const t = `${String(kst.getUTCHours()).padStart(2,'0')}:${String(kst.getUTCMinutes()).padStart(2,'0')}`;
        el.textContent = `업데이트: ${lastUpdate.base_date} ${t}`;
      } else {
        el.textContent = `기준: ${lastUpdate.base_date}`;
      }
    } else {
      _updateInvTimestamp();
    }
  } catch(e) {
    _updateInvTimestamp();
  }

  // 공시/실적 항상 로드 (2단 레이아웃 우 패널)
  _allDiscLoaded = false;
  loadTodayDisclosures();
  loadEarningsSurge();

  const maxDate = await getLatestMarketDate();
  if (!maxDate) return;

  // 전체 종목 + 산업별 동향 (내부에서 window._allMarketRows 세팅)
  await loadMarketOverview(maxDate);

  // Phase 1 — 온도계 + 거래대금 상위 (window._allMarketRows / _macroData 재활용)
  renderMarketTemperature();
  renderVolumeLeaders();

  // Phase 2 — 주도주 탐색기 + 백테스트 + 섹터 수급 트렌드 + 산업 강도 매트릭스
  _initSfImLayout(); // 2열 그리드 / 모바일 탭 초기화
  loadLeadingStocks();
  loadLeadingBacktest();
  loadSectorFlow();
  loadStockFlow();
  loadIndustryMatrix();

  // 모니터링 종목 목록 — getIndustryMap() 캐시 재활용 (companies 중복 조회 방지)
  const industryMap = await getIndustryMap();
  const monList = Object.keys(industryMap);

  if (!monList.length) return;

  // loadMarketOverview에서 이미 가져온 전체 데이터를 메모리에서 필터
  const allRows = window._allMarketRows || [];
  const monSet  = new Set(monList);
  let mktRows   = allRows.filter(r => monSet.has(r.stock_code));

  if (!mktRows.length) return;
  const rows = mktRows.filter(r => r.price_change_rate != null);
  if (!rows.length) return;

  const rise   = rows.filter(r => r.price_change_rate > 0).length;
  const fall   = rows.filter(r => r.price_change_rate < 0).length;
  const avgChg = rows.reduce((s,r) => s + r.price_change_rate, 0) / rows.length;

  // 산업 동향 카드 배너에 모니터링 종목 현황 표시
  const indBanner = document.getElementById('inv-industry-banner');
  if (indBanner) {
    const sep = '<span style="color:var(--border)">|</span>';
    indBanner.innerHTML = [
      `<span style="color:var(--text2)">모니터링 ${rows.length}개</span>`,
      sep,
      `<span style="color:var(--red);font-weight:600">▲ ${rise}개</span>`,
      sep,
      `<span style="color:var(--blue);font-weight:600">▼ ${fall}개</span>`,
      sep,
      `<span style="font-weight:600;color:${chgColor(avgChg)}">평균 ${chgStr(avgChg)}</span>`,
    ].join(' ');
  }

  // 전체 상장사 급등/급락 — loadMarketOverview가 이미 가져온 데이터를 메모리에서 계산
  // (DB 쿼리 4회 → 0회, window._allMarketRows 재활용)
  // 최소 거래대금 5억원 필터 — 거래량 극소 껍데기 급등 종목 제거
  const _MIN_TV = 5e8; // 5억원
  const _all = (window._allMarketRows || []).filter(r => {
    if (r.price_change_rate == null) return false;
    const tv = r.trading_value || ((r.volume ?? 0) * (r.price ?? 0));
    return tv >= _MIN_TV;
  });
  const _byMkt = (mkt, asc) => [..._all]
    .filter(r => r.market === mkt)
    .sort((a, b) => asc
      ? a.price_change_rate - b.price_change_rate
      : b.price_change_rate - a.price_change_rate)
    .slice(0, 10);
  const surgeKospi  = _byMkt('KOSPI',  false);
  const dropKospi   = _byMkt('KOSPI',  true);
  const surgeKosdaq = _byMkt('KOSDAQ', false);
  const dropKosdaq  = _byMkt('KOSDAQ', true);

  const rankRow = (r, i) => `
    <div style="display:flex;align-items:center;gap:5px;padding:5px 10px;border-bottom:1px solid var(--border)">
      <span style="width:14px;font-size:10px;color:var(--text2);font-weight:600;flex-shrink:0">${i+1}</span>
      <span style="flex:1;font-size:12px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.corp_name}</span>
      <span style="font-size:12px;font-weight:700;color:${chgColor(r.price_change_rate)};flex-shrink:0">${chgStr(r.price_change_rate)}</span>
    </div>`;

  const setCard = (id, data) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = (data || []).map(rankRow).join('') || '<div style="padding:12px;color:var(--text2);font-size:12px;text-align:center">데이터 없음</div>';
  };
  setCard('inv-surge-kospi',  surgeKospi  || []);
  setCard('inv-drop-kospi',   dropKospi   || []);
  setCard('inv-surge-kosdaq', surgeKosdaq || []);
  setCard('inv-drop-kosdaq',  dropKosdaq  || []);
}


// ── 거래대금 상위 (3-그리드) ───────────────────────────────────────────────────
function renderVolumeLeaders() {
  const el = document.getElementById('inv-volume-body');
  if (!el) return;

  const allRows = window._allMarketRows || [];
  if (!allRows.length) {
    el.innerHTML = '<div style="grid-column:1/-1;padding:1rem;text-align:center;color:var(--text2);font-size:12px">데이터 없음</div>';
    return;
  }

  // 거래대금 — trading_value 컬럼 우선 사용, 없으면 volume × price 근사
  const withTV = allRows
    .filter(r => r.corp_name && (r.trading_value || (r.volume && r.price)))
    .map(r => ({ ...r, tv: r.trading_value || (r.volume * r.price) }));

  const panels = [
    { label: '코스피', color: '#60a5fa', rows: withTV.filter(r => r.market === 'KOSPI') },
    { label: '코스닥', color: '#f59e0b', rows: withTV.filter(r => r.market === 'KOSDAQ') },
  ];

  el.innerHTML = panels.map((p, pi) => {
    const sorted = [...p.rows].sort((a, b) => b.tv - a.tv).slice(0, 10);
    if (!sorted.length) return `
      <div style="border-right:${pi === 0 ? '1px solid var(--border)' : 'none'}">
        <div style="padding:8px 12px;font-size:12px;font-weight:700;color:${p.color};
          border-bottom:2px solid ${p.color}50;letter-spacing:.5px">${p.label}</div>
        <div style="padding:1rem;text-align:center;color:var(--text2);font-size:11px">데이터 없음</div>
      </div>`;

    const maxTV = sorted[0].tv;
    const rows = sorted.map((r, i) => {
      const c     = r.price_change_rate ?? 0;
      const cc    = c > 0 ? 'var(--red)' : c < 0 ? 'var(--blue)' : 'var(--text3)';
      const cs    = (c >= 0 ? '+' : '') + c.toFixed(1) + '%';
      const tvStr = r.tv >= 1e12
        ? (r.tv / 1e12).toFixed(1) + '조'
        : r.tv >= 1e11
        ? (r.tv / 1e11).toFixed(1) + '천억'
        : (r.tv / 1e8).toFixed(0) + '억';
      const barPct = Math.round(r.tv / maxTV * 100);
      return `
      <div style="display:flex;align-items:center;gap:8px;padding:6px 12px;
        border-bottom:1px solid var(--border)">
        <span style="min-width:16px;font-size:11px;color:var(--text2);font-weight:600">${i + 1}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:3px">${r.corp_name}</div>
          <div style="height:3px;border-radius:2px;background:var(--border);overflow:hidden">
            <div style="height:100%;width:${barPct}%;background:${p.color};border-radius:2px"></div>
          </div>
        </div>
        <div style="text-align:right;white-space:nowrap">
          <div style="font-size:12px;color:var(--text1)">${tvStr}</div>
          <div style="font-size:11px;font-weight:600;color:${cc}">${cs}</div>
        </div>
      </div>`;
    }).join('');

    return `
    <div style="border-right:${pi === 0 ? '1px solid var(--border)' : 'none'}">
      <div style="padding:8px 12px;font-size:12px;font-weight:700;color:${p.color};
        border-bottom:2px solid ${p.color}50;letter-spacing:.5px">${p.label}</div>
      ${rows}
    </div>`;
  }).join('');
}


// ── 투자포인트 히스토리 토글 ───────────────────────────────────────────────────
function toggleInsightHistory() {
  const hist = document.getElementById('insight-history');
  const btn  = document.getElementById('btn-insight-hist');
  if (!hist) return;
  const isOpen = hist.style.display !== 'none';
  hist.style.display = isOpen ? 'none' : 'block';
  if (btn) btn.classList.toggle('active', !isOpen);
  if (!isOpen) loadInsightHistory();
}


// ── 섹터 수급 + 산업강도 2열 그리드 / 모바일 탭 전환 ──────────────────────────
let _sfImActiveTab = 'sf'; // 모바일 활성 탭

function switchSfImTab(tab) {
  _sfImActiveTab = tab;
  const sfCard = document.getElementById('sf-card');
  const imCard = document.getElementById('im-card');
  const tabSf  = document.getElementById('sf-im-tab-sf');
  const tabIm  = document.getElementById('sf-im-tab-im');
  if (!sfCard || !imCard) return;

  const isMobile = window.innerWidth < 768;
  if (isMobile) {
    sfCard.style.display = tab === 'sf' ? '' : 'none';
    imCard.style.display = tab === 'im' ? '' : 'none';
  }
  if (tabSf) {
    tabSf.style.background = tab === 'sf' ? 'var(--accent)' : 'var(--bg3)';
    tabSf.style.color      = tab === 'sf' ? '#fff' : 'var(--text3)';
  }
  if (tabIm) {
    tabIm.style.background = tab === 'im' ? 'var(--accent)' : 'var(--bg3)';
    tabIm.style.color      = tab === 'im' ? '#fff' : 'var(--text3)';
  }
}

function _initSfImLayout() {
  const grid    = document.getElementById('sf-im-grid');
  const tabs    = document.getElementById('sf-im-tabs');
  const sfCard  = document.getElementById('sf-card');
  const imCard  = document.getElementById('im-card');
  if (!grid || !tabs || !sfCard || !imCard) return;

  const isMobile = window.innerWidth < 768;
  // 모바일: 1열 + 탭 버튼 표시
  grid.style.gridTemplateColumns = isMobile ? '1fr' : '1fr 1fr';
  tabs.style.display = isMobile ? 'flex' : 'none';
  if (isMobile) {
    sfCard.style.display = _sfImActiveTab === 'sf' ? '' : 'none';
    imCard.style.display = _sfImActiveTab === 'im' ? '' : 'none';
  } else {
    sfCard.style.display = '';
    imCard.style.display = '';
  }
}

// 페이지 로드 + 리사이즈 시 레이아웃 업데이트
window.addEventListener('resize', () => { _initSfImLayout(); _syncSfImHeight(); });

// ── 두 카드 높이 동기화 ────────────────────────────────────────────────────────
function _syncSfImHeight() {
  if (window.innerWidth < 768) return;          // 모바일 탭 모드는 불필요
  const sf     = document.getElementById('sf-card');
  const im     = document.getElementById('im-card');
  const sfBody = document.getElementById('sf-body');
  if (!sf || !im || !sfBody) return;

  // 초기화 → 자연 높이 측정
  Array.from(sfBody.children).forEach(r => r.style.minHeight = '');
  sfBody.style.height = '';
  sf.style.height = '';
  im.style.height = '';

  const h = Math.max(sf.offsetHeight, im.offsetHeight);
  sf.style.height = h + 'px';
  im.style.height = h + 'px';

  // sf-body가 채워야 할 높이 = 카드 하단 - sf-body 상단
  const bodyAvail = sf.getBoundingClientRect().bottom - sfBody.getBoundingClientRect().top;
  if (bodyAvail > 0 && sfBody.children.length > 0) {
    const perRow = Math.floor(bodyAvail / sfBody.children.length);
    Array.from(sfBody.children).forEach(r => r.style.minHeight = perRow + 'px');
  }
}


// ── 시황/공시/급등 로직은 분리된 파일에서 로드 ──
// market-overview.js    : loadMacroData, loadTrendChart, loadMarketOverview
// market-temperature.js : renderMarketTemperature
// disclosure.js         : loadTodayDisclosures, loadAllDisclosures, toggleAllDisclosures
// earnings-surge.js     : loadEarningsSurge, renderSurgeList, setSurgeGrade 등
