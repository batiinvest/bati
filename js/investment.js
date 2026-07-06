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
  // ── 구 window._* 수렴 (런타임 대입) ──
  // tab·highlighted·hovered: 시황 페이지 UI 상태
  // allMarketRows·macroData·macroRows·marketBreadth·tempScore·indMapData:
  //   market-overview/-insight/-temperature/sector-rotation/chart-macro가 공유하는 시장 데이터 캐시
  // moSort·indBarChart·insightSaveDB·insightCurrentData·lsPollTimer·lsAllData: 섹션별 상태
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
  INV.tab = INV.tab || 'market';
  return `
  <!-- 페이지 헤더 -->
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem;flex-wrap:wrap;gap:8px">
    <div style="font-size:13px;font-weight:600;color:var(--text)">오늘의 시황</div>
    <div style="display:flex;align-items:center;gap:8px">
      <div style="font-size:11px;color:var(--text2)" id="inv-date"></div>
      <button class="btn btn-sm" id="inv-refresh-btn" onclick="refreshInvestment()">${_ICO.refresh}새로고침</button>
    </div>
  </div>

  <!-- 상단: 오늘의 시장 판단 — 온도계(환경)+투자포인트(전략) 통합 카드. 환경→전략→근거 수직 흐름 -->
  <div class="card insight-card" style="margin-bottom:1rem">
    <div class="card-header" style="flex-wrap:wrap;gap:6px">
      <span class="card-title">${_ICO.temp}오늘의 시장 판단</span>
      <span style="font-size:10px;color:var(--text2);font-weight:400">지금 들어가도 되나 → 무엇을 할까</span>
      <span id="mj-source" style="font-size:10px;color:var(--text2);margin-left:auto"></span>
      <span style="font-size:11px;color:var(--text2)" id="market-temp-date"></span>
      <div style="display:flex;gap:5px;align-items:center">
        <button class="chip" id="btn-insight-hist" style="font-size:11px;padding:2px 8px;display:none"
          onclick="toggleInsightHistory()">${_ICO.history}히스토리</button>
        <button class="chip" style="font-size:11px;padding:2px 8px"
          onclick="loadMarketInsight(true)">${_ICO.refresh}재분석</button>
        <span id="mj-admin-btns" style="display:flex;gap:5px;align-items:center"></span>
      </div>
    </div>

    <!-- A 환경 | B 전략 — 2열 (밀도 회복: '이 환경이니 → 이렇게' 좌우 병치) -->
    <div class="mj-grid">
      <!-- A. 환경(Regime) + 통합 행동지침 -->
      <div class="card-body mj-col-a" style="padding:.75rem 1rem" id="market-temp-body">
        <span class="skeleton" style="width:100%;height:60px;border-radius:6px;display:block"></span>
      </div>
      <!-- B. 전략(Selection) — 영향 업종 + 기회/리스크 -->
      <div class="mj-col-b" style="padding:.75rem 1rem" id="market-insight-card">
        <div style="color:var(--text2);font-size:12px"><span class="loading"></span> 전략 분석 중...</div>
      </div>
    </div>

    <!-- C. 근거(Evidence) — 6지표, 기본 접힘 (풀폭) -->
    <!-- (출처·DB저장은 상단 헤더로 일원화, 재생성은 재분석과 통합 제거 — 하단 푸터 폐지) -->
    <div id="mj-evidence" style="border-top:1px solid var(--border)"></div>

    <!-- 히스토리 (DB 저장 국면) -->
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

  <!-- 내 종목 현황 — 보유/관심 종목의 시세·오늘 공시·최근 보고서를 한눈에 -->
  <div class="card" id="my-stocks-card" style="margin-bottom:1rem">
    <div class="card-header" style="flex-wrap:wrap;gap:6px">
      <span class="card-title">${_ICO.doc}내 종목 현황</span>
      <span style="font-size:10px;color:var(--text2);font-weight:400">시세 · 오늘 공시 · 최근 보고서</span>
      <span id="ms-count-badge" style="font-size:10px;color:var(--text2);margin-left:auto"></span>
    </div>
    <div id="ms-body" style="border-top:1px solid var(--border)">${_skelList(3, true)}</div>
  </div>

  <!-- 산업별 수급동향 — 로테이션 맵 + 산업 보드 (등락·거래대금·수급·국면). 내 종목 현황 바로 아래 배치 -->
  <div id="sector-rot-card" class="card" style="margin-bottom:1rem">
    <div class="card-header" style="flex-wrap:wrap;gap:6px">
      <span class="card-title">${_ICO.flow}산업별 수급동향</span>
      <span style="font-size:10px;color:var(--text2);font-weight:400">자금이 어디로 — 등락·거래대금·수급·국면</span>
      <span id="sr-date" style="font-size:10px;color:var(--text2);margin-left:auto"></span>
      <div style="display:flex;gap:4px">
        <button class="chip"        data-sr-period="1"  onclick="switchSrPeriod(1)"  style="font-size:11px;padding:2px 8px">1일</button>
        <button class="chip active" data-sr-period="5"  onclick="switchSrPeriod(5)"  style="font-size:11px;padding:2px 8px">5일</button>
        <button class="chip"        data-sr-period="20" onclick="switchSrPeriod(20)" style="font-size:11px;padding:2px 8px">20일</button>
      </div>
    </div>
    <div id="sector-rot-body" style="padding:0">${_skelList(8, true)}</div>
  </div>

  <!-- 2단 레이아웃: 좌(투자포인트+주도주+수급) + 우(공시/신호) -->
  <div style="display:grid;grid-template-columns:2fr 3fr;gap:1rem;align-items:start;margin-bottom:1rem">

    <!-- 좌 패널 -->
    <div id="inv-left" style="display:flex;flex-direction:column;gap:1rem">

      <!-- (투자포인트 요약 → 상단 온도계 옆으로 이동) -->
      <!-- (주도주 → '오늘의 아이디어' 탭으로 이동) -->

      <!-- 수급 요약 -->
      <div class="card" style="margin-bottom:0">
        <div class="card-header">
          <span class="card-title">${_ICO.flow}기관/외국인 수급</span>
          <span style="font-size:11px;color:var(--text2)" id="flow-date-label">집계 중…</span>
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

      <!-- (산업 강도 매트릭스 → '산업별 수급동향' 보드의 US·KR·선행 컬럼으로 통합) -->

    </div>

    <!-- 우 패널 -->
    <div id="inv-right" style="display:flex;flex-direction:column;gap:1rem">

      <!-- 💡 오늘의 아이디어 (주도주·신고가·실적급등 통합 탭) -->
      <div class="card" style="margin-bottom:0">
        <div class="card-header" style="flex-wrap:wrap;gap:6px">
          <span class="card-title">${_ICO.bulb}오늘의 아이디어</span>
          <span style="font-size:10px;color:var(--text2);font-weight:400">발굴 → 클릭 → 상세·⭐관심</span>
          <div style="display:flex;gap:4px;margin-left:auto;flex-wrap:wrap">
            <button class="chip active" id="idea-tab-ls"       onclick="switchIdeaTab('ls')"       style="font-size:11px;padding:3px 10px">${_ICO.rocket}주도주</button>
            <button class="chip"        id="idea-tab-hgpr"     onclick="switchIdeaTab('hgpr')"     style="font-size:11px;padding:3px 10px">${_ICO.flag}신고가</button>
            <button class="chip"        id="idea-tab-earnings" onclick="switchIdeaTab('earnings')" style="font-size:11px;padding:3px 10px">${_ICO.bar}실적급등</button>
            <button class="chip"        id="idea-tab-surge"    onclick="switchIdeaTab('surge')"    style="font-size:11px;padding:3px 10px">${_ICO.arrowUp}급등</button>
            <button class="chip"        id="idea-tab-outlook"  onclick="switchIdeaTab('outlook')"  style="font-size:11px;padding:3px 10px">${_ICO.chart}전망</button>
          </div>
        </div>

        <!-- 주도주 패널 -->
        <div id="idea-panel-ls" style="border-top:1px solid var(--border)">
          <div style="padding:5px 10px;border-bottom:1px solid var(--border);display:flex;gap:3px;align-items:center">
            <button class="chip active" data-ls-tab="all"    onclick="switchLsTab('all')"    style="font-size:10px;padding:3px 8px">전체</button>
            <button class="chip"        data-ls-tab="kospi"  onclick="switchLsTab('kospi')"  style="font-size:10px;padding:3px 8px">코스피</button>
            <button class="chip"        data-ls-tab="kosdaq" onclick="switchLsTab('kosdaq')" style="font-size:10px;padding:3px 8px">코스닥</button>
            <span style="font-size:10px;color:var(--text2);margin-left:auto;align-self:center" id="ls-date"></span>
            <button id="ls-refresh-btn" onclick="refreshLeadingStocks()"
              style="font-size:11px;padding:2px 8px;border-radius:5px;border:1px solid var(--border);
                     background:transparent;color:var(--text2);cursor:pointer;margin-left:6px"
              title="새로고침">${_ICO.refresh}</button>
          </div>
          <div id="ls-body">${_skelList(8)}</div>
          <div style="padding:5px 10px;border-top:1px solid var(--border);border-bottom:1px solid var(--border);display:flex;gap:3px;align-items:center">
            <span onclick="toggleLsBacktest()" style="font-size:11px;font-weight:600;color:var(--text2);cursor:pointer;user-select:none">과거 주도주 수익률 <span id="ls-bt-chev" style="font-size:9px">▾</span></span>
            <span id="ls-bt-date" style="font-size:10px;color:var(--text2);margin-left:auto;align-self:center"></span>
            <div style="display:flex;gap:3px">
              <button class="chip active" data-bt-period="1w" onclick="switchBtPeriod('1w')" style="font-size:10px;padding:2px 6px">1주</button>
              <button class="chip"        data-bt-period="1m" onclick="switchBtPeriod('1m')" style="font-size:10px;padding:2px 6px">1달</button>
              <button class="chip"        data-bt-period="3m" onclick="switchBtPeriod('3m')" style="font-size:10px;padding:2px 6px">3달</button>
            </div>
          </div>
          <div id="ls-bt-body" style="padding:6px 8px;display:none">${_skelList(5)}</div>
        </div>

        <!-- 신고가 패널 -->
        <div id="idea-panel-hgpr" style="display:none;border-top:1px solid var(--border)">
          <div style="padding:5px 10px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span style="font-size:10px;color:var(--text2)">KIS 기준 신고가 지정 종목</span>
            <span id="hgpr-date" style="font-size:10px;color:var(--text2)"></span>
            <div style="display:flex;gap:4px;margin-left:auto">
              <button class="chip active" data-hgpr-tab="monitored" onclick="switchHgprTab('monitored')" style="font-size:11px;padding:2px 8px">⭐ 모니터링</button>
              <button class="chip"        data-hgpr-tab="all"       onclick="switchHgprTab('all')"       style="font-size:11px;padding:2px 8px">전체 종목</button>
            </div>
          </div>
          <div id="hgpr-body" style="padding:.5rem 0">${_skelList(6)}</div>
        </div>

        <!-- 실적급등 패널 -->
        <div id="idea-panel-earnings" style="display:none;border-top:1px solid var(--border)">
          <div style="padding:5px 10px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <div style="display:flex;gap:4px">
              <button class="chip active" data-surge-grade="all"  onclick="setSurgeGrade(this,'all')"  style="font-size:11px">전체</button>
              <button class="chip"        data-surge-grade="S"    onclick="setSurgeGrade(this,'S')"    style="font-size:11px">S급</button>
              <button class="chip"        data-surge-grade="A"    onclick="setSurgeGrade(this,'A')"    style="font-size:11px">A급</button>
              <button class="chip"        data-surge-grade="B"    onclick="setSurgeGrade(this,'B')"    style="font-size:11px">B급</button>
              <button class="chip"        data-surge-grade="관찰"  onclick="setSurgeGrade(this,'관찰')"  style="font-size:11px">관찰</button>
            </div>
            <select class="form-select" id="inv-earnings-quarter" style="width:130px;padding:3px 8px;font-size:12px;margin-left:auto"
              onchange="loadEarningsSurge()"><option value="">로딩 중...</option></select>
          </div>
          <div id="inv-earnings-list" style="padding:.5rem 0">${_skelCards(4)}</div>
        </div>

        <!-- 급등 패널 (당일 상승률 상위, 거래대금 필터) -->
        <div id="idea-panel-surge" style="display:none;border-top:1px solid var(--border)">
          <div style="padding:5px 10px;border-bottom:1px solid var(--border);font-size:10px;color:var(--text2)">거래대금 5억↑ · 상승률 상위 (최근 거래일 종가 기준)</div>
          <div id="idea-surge-body" style="padding:.25rem 0">${_skelList(8, true)}</div>
        </div>

        <!-- 전망 패널 (미래 실적 추정치 — 상향 감지 + 고성장, estimates.js) -->
        <div id="idea-panel-outlook" style="display:none;border-top:1px solid var(--border)">
          <div style="padding:5px 10px;border-bottom:1px solid var(--border);font-size:10px;color:var(--text2)">KIS 리서치 연간 추정치 (매일 18:40 갱신) · 커버 종목만 표시</div>
          <div id="idea-outlook-body" style="padding:.25rem 0">${_skelList(8, true)}</div>
        </div>
      </div>

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

      <!-- (실적 급등 → '오늘의 아이디어' 탭으로 이동) -->

      <!-- (산업 강도 매트릭스 → 좌측 컨텍스트 열로 이동) -->

    </div>
  </div>

  <!-- 이하: 상세 섹션들 (전체 너비) -->
  <div id="inv-tab-market" style="display:block">


    <!-- (산업별 수급동향 → '내 종목 현황' 카드 바로 아래로 이동) -->

    <!-- (종목별 수급 순위 → Zone C 심화 분석으로 이동) -->

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

    <!-- Zone C — 심화 분석 (기본 접힘) -->
    <div onclick="toggleZoneC()" style="cursor:pointer;display:flex;align-items:center;gap:8px;
      padding:10px 14px;margin-bottom:12px;background:var(--bg2);border:1px solid var(--border);border-radius:8px">
      <span style="font-size:13px;font-weight:600;color:var(--text1)">${_ICO.grid}심화 분석</span>
      <span style="font-size:11px;color:var(--text2);font-weight:400">종목별 수급 · 거래대금 · 급등/급락 · 비교 차트</span>
      <span id="zonec-toggle" style="font-size:12px;color:var(--text2);margin-left:auto">펼치기 ▾</span>
    </div>

    <div id="inv-zonec" style="display:none">

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

    <!-- (52주 신고가 → '오늘의 아이디어' 탭으로 이동) -->

    <!-- ⑩ 거래대금 상위 -->
    <div class="card" style="margin-bottom:12px">
      <div class="card-header">
        <span class="card-title">${_ICO.coin}거래대금 상위</span>
        <span style="font-size:11px;color:var(--text2)">최근 거래일 종가 기준</span>
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

    </div><!-- /inv-zonec (심화 분석) -->

  </div>

  <!-- 숨김 호환 div (setInvTab 참조용) -->
  <div id="inv-tab-disclosure" style="display:none"></div>`;
}




// (정리됨) mkIndexCard — 매크로 카드 그리드 전용 헬퍼였으나 그리드 제거로 호출처 소멸.
//   매크로 지수는 전역 탑바 스트립·시장 온도계 6세부요소·Zone A 브리핑 위험배지가 담당.

// ── 탭 전환 (2단 레이아웃으로 전환 후 no-op, 호환성 유지) ──
function setInvTab(tab) {
  INV.tab = tab;
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
// 진행 중 타이머 핸들 — 연타·페이지 이탈 시 중첩/유령 재로드 방지
let _invRefreshTimers = [];
function _clearInvRefreshTimers() {
  _invRefreshTimers.forEach(t => { clearInterval(t); clearTimeout(t); });
  _invRefreshTimers = [];
}

// 페이지 이탈 정리 훅 — nav go()가 PAGE_META.onUnload로 호출
function unloadInvestment() {
  _clearInvRefreshTimers();
  if (INV.lsPollTimer) { clearInterval(INV.lsPollTimer); INV.lsPollTimer = null; }
}

async function refreshInvestment() {
  _clearInvRefreshTimers();  // 연타 시 이전 카운트다운/재로드 취소
  _latestMarketDate = null;
  const btn = document.getElementById('inv-refresh-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳'; }

  try {
    if (INV.tab === 'disclosure') {
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
          // 종목별 외국인·기관 순매수 확정(inquire-investor) 즉시 수집
          upserts.push(sb.from('app_config').upsert({
            key: 'run_flow_flag', value: String(Date.now()),
            description: '기관/외국인 수급(랭킹+종목별 투자자) 수동 수집 트리거'
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
        // 페이지 이탈로 버튼이 사라졌으면 카운트다운 중단
        const b = document.getElementById('inv-refresh-btn');
        if (!b) { clearInterval(timer); return; }
        b.textContent = `⏳ ${remaining}초`;
        if (remaining <= 0) clearInterval(timer);
      }, 1000);
      _invRefreshTimers.push(timer);

      // 70초 후 재로드 + 버튼 복구 — 시황 페이지에 머물러 있을 때만
      const reload = setTimeout(async () => {
        clearInterval(timer);
        if (A.page !== 'investment') return;  // 이탈했으면 유령 재로드 방지
        _latestMarketDate = null;
        await loadInvestment();
        const b = document.getElementById('inv-refresh-btn');
        if (b) { b.disabled = false; b.textContent = '🔄 새로고침'; }
        toast('✅ 최신 데이터로 업데이트됐습니다', 'success');
      }, 70000);
      _invRefreshTimers.push(reload);

      return; // finally에서 버튼 복구 안 되도록
    }
  } finally {
    // 시황 탭은 70초 후 자동 복구, 공시 탭만 즉시 복구
    if (INV.tab === 'disclosure') {
      if (btn) { btn.disabled = false; btn.textContent = '🔄 새로고침'; }
    }
  }
}

// ── 메인 로드 ──
async function loadInvestment() {
  // 보유/관심 종목 교차표시용 코드 로드 (각 진입 시 최신화) — 목록 렌더 전 준비
  loadWatchlistCodes(true);
  loadMyStocksCard(); // 내 종목 현황 — 공시·보고서 먼저 비동기 로드

  // 시황 탭 로드 (market-overview.js) — 배너 채운 후 나머지 실행
  await loadMacroData();
  loadTrendChart();

  // 마지막 업데이트 시각 표시 — 지수(macro_data, 매일)와 종목데이터(market_data, 주간) 이원 표기
  // '오늘'을 표방하지만 종목 단위 데이터는 갱신 주기가 달라, 기준일을 분리해 정직하게 노출한다.
  try {
    const { data: lastUpdate } = await sb.from('macro_data')
      .select('base_date,updated_at').order('base_date', { ascending: false }).limit(1).single();
    const mktDate = await getLatestMarketDate();
    const el = document.getElementById('inv-date');
    if (el) {
      // ① 지수/매크로 기준
      let idxStr = '';
      if (lastUpdate) {
        if (lastUpdate.updated_at) {
          const kst = new Date(new Date(lastUpdate.updated_at).getTime() + 9 * 60 * 60 * 1000);
          const t = `${String(kst.getUTCHours()).padStart(2,'0')}:${String(kst.getUTCMinutes()).padStart(2,'0')}`;
          idxStr = `지수 ${lastUpdate.base_date} ${t}`;
        } else {
          idxStr = `지수 ${lastUpdate.base_date}`;
        }
      }
      // ② 종목 데이터(breadth·수급·급등락·거래대금·신고가 공통 기준) — 신선도 경고
      let mktStr = '';
      if (mktDate) {
        const todayKst = kstToday();
        const diffDays = Math.round((new Date(todayKst) - new Date(mktDate)) / 86400000);
        const stale = diffDays >= 5; // 정상 주간 사이클(주말 포함)을 넘어선 경우만 경고
        mktStr = `<span title="breadth·수급·급등락·거래대금·신고가 공통 기준일" style="${stale ? 'color:var(--yellow);font-weight:600' : 'color:var(--text2)'}">`
          + `종목 ${mktDate}${stale ? ` ⚠ ${diffDays}일 전` : ''}</span>`;
      }
      const parts = [idxStr ? `<span style="color:var(--text2)">${idxStr}</span>` : '', mktStr].filter(Boolean);
      if (parts.length) el.innerHTML = parts.join('<span style="color:var(--border);margin:0 6px">·</span>');
      else _updateInvTimestamp();
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
  loadEstimateOutlook();  // '오늘의 아이디어' 전망 탭 (추정치 상향+고성장, estimates.js)

  const maxDate = await getLatestMarketDate();
  if (!maxDate) return;

  // 전체 종목 + 산업별 동향 (내부에서 INV.allMarketRows 세팅)
  await loadMarketOverview(maxDate);

  // INV.allMarketRows 확보 후 내 종목 현황 행(등락률) 갱신
  if (_myStocksWlRows) _renderMyStocks();

  // Phase 1 — 온도계 + 거래대금 상위 (INV.allMarketRows / INV.macroData 재활용)
  renderMarketTemperature();
  renderVolumeLeaders();
  renderIdeaSurge(); // '오늘의 아이디어' 급등 탭

  // Phase 2 — 주도주 탐색기 + 백테스트 + 산업별 수급동향(산업 강도 매트릭스 통합)
  loadLeadingStocks();
  loadLeadingBacktest();
  loadSectorRotation();  // 산업별 수급동향(로테이션 맵+보드, US·KR·선행 컬럼 통합) — INV.indMapData(신선)+sector_daily_summary
  loadStockFlow();

  // 모니터링 종목 목록 — getIndustryMap() 캐시 재활용 (companies 중복 조회 방지)
  const industryMap = await getIndustryMap();
  const monList = Object.keys(industryMap);

  if (!monList.length) return;

  // loadMarketOverview에서 이미 가져온 전체 데이터를 메모리에서 필터
  const allRows = INV.allMarketRows || [];
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
  // (DB 쿼리 4회 → 0회, INV.allMarketRows 재활용)
  // 최소 거래대금 5억원 필터 — 거래량 극소 껍데기 급등 종목 제거
  const _MIN_TV = 5e8; // 5억원
  const _all = (INV.allMarketRows || []).filter(r => {
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
    <div class="stock-row" data-stock-open="${r.stock_code}" data-stock-name="${escAttr(r.corp_name||r.stock_code||'')}" data-stock-tab="market"
      style="display:flex;align-items:center;gap:5px;padding:5px 10px;border-bottom:1px solid var(--border)">
      <span style="width:14px;font-size:10px;color:var(--text2);font-weight:600;flex-shrink:0">${i+1}</span>
      <span style="flex:1;font-size:12px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(r.corp_name)}</span>
      ${wlBadge(r.stock_code)}
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

  const allRows = INV.allMarketRows || [];
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
      const tvStr = fmtTV(r.tv);
      const barPct = Math.round(r.tv / maxTV * 100);
      return `
      <div class="stock-row" data-stock-open="${r.stock_code}" data-stock-name="${escAttr(r.corp_name||r.stock_code||'')}" data-stock-tab="market"
        style="display:flex;align-items:center;gap:8px;padding:6px 12px;
        border-bottom:1px solid var(--border)">
        <span style="min-width:16px;font-size:11px;color:var(--text2);font-weight:600">${i + 1}</span>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:4px;margin-bottom:3px"><span style="font-size:12px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(r.corp_name)}</span>${wlBadge(r.stock_code)}</div>
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


// ── Zone C(심화 분석) 접기/펼치기 ──────────────────────────────────────────────
// 비교 차트(inv-trend/ind-trend/uskr)는 display:none 상태에서 0px로 그려지므로,
// 펼칠 때 해당 로더를 재호출해 올바른 크기로 다시 그린다 (toggleTrendChart와 동일 패턴).
function toggleZoneC() {
  toggleSection('inv-zonec', 'zonec-toggle', ['접기 ▴', '펼치기 ▾'], () => {
    try { if (typeof loadTrendChart    === 'function') loadTrendChart();    } catch(e) { console.warn('[ZoneC] trend', e); }
    try { if (typeof loadIndTrendChart === 'function') loadIndTrendChart(); } catch(e) { console.warn('[ZoneC] indTrend', e); }
    try { if (typeof loadUskrChart     === 'function') loadUskrChart();     } catch(e) { console.warn('[ZoneC] uskr', e); }
  });
}


// ── 주도주 백테스트(과거 주도주 수익률) 접기/펼치기 ──────────────────────────────
function toggleLsBacktest() {
  toggleSection('ls-bt-body', 'ls-bt-chev', ['▴', '▾']);
}


// ── '오늘의 아이디어' 탭 전환 (주도주 / 신고가 / 실적급등) ───────────────────────
// 각 패널은 기존 위젯 내용을 그대로 품고 있어(id 유지) 로더는 변경 불필요 — 표시 토글만.
function switchIdeaTab(tab) {
  ['ls', 'hgpr', 'earnings', 'surge', 'outlook'].forEach(t => {
    const panel = document.getElementById('idea-panel-' + t);
    if (panel) panel.style.display = (t === tab) ? 'block' : 'none';
    const btn = document.getElementById('idea-tab-' + t);
    if (btn) btn.classList.toggle('active', t === tab);
  });
}

// ── '급등' 탭 — 당일 상승률 상위 (거래대금 5억↑, 껍데기 급등 제외) ────────────────
// 이미 로드된 INV.allMarketRows 재사용 (별도 쿼리 없음). 행 클릭 → 상세.
function renderIdeaSurge() {
  const el = document.getElementById('idea-surge-body');
  if (!el) return;
  const MIN_TV = 5e8; // 거래대금 5억원
  const rows = (INV.allMarketRows || [])
    .filter(r => r.price_change_rate != null && r.corp_name)
    .filter(r => (r.trading_value || ((r.volume ?? 0) * (r.price ?? 0))) >= MIN_TV)
    .sort((a, b) => b.price_change_rate - a.price_change_rate)
    .slice(0, 15);

  if (!rows.length) {
    el.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--text2);font-size:12px">데이터 없음</div>';
    return;
  }

  el.innerHTML = rows.map((r, i) => {
    const mkTag = r.market === 'KOSDAQ'
      ? '<span style="font-size:9px;color:var(--text2);margin-left:2px;font-weight:600">Q</span>' : '';
    const tv    = r.trading_value || ((r.volume ?? 0) * (r.price ?? 0));
    const tvStr = fmtTV(tv);
    return `
    <div class="stock-row" data-stock-open="${r.stock_code}" data-stock-name="${escAttr(r.corp_name||r.stock_code||'')}" data-stock-tab="market"
      style="display:flex;align-items:center;gap:8px;padding:6px 12px;border-bottom:1px solid var(--border)">
      <span style="width:16px;font-size:11px;color:var(--text2);font-weight:600;flex-shrink:0">${i + 1}</span>
      <span style="flex:1;font-size:12px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(r.corp_name)}${mkTag}</span>
      <span style="font-size:10px;color:var(--text2);white-space:nowrap">${tvStr}</span>
      <span style="font-size:12px;font-weight:700;color:${chgColor(r.price_change_rate)};flex-shrink:0;min-width:48px;text-align:right">${chgStr(r.price_change_rate)}</span>
    </div>`;
  }).join('');
}


// ── 투자포인트 히스토리 토글 ───────────────────────────────────────────────────
function toggleInsightHistory() {
  const open = toggleSection('insight-history', null, null, loadInsightHistory);
  const btn  = document.getElementById('btn-insight-hist');
  if (btn && open != null) btn.classList.toggle('active', open);
}


// (정리됨) 섹터수급↔산업강도 2열 그리드/높이동기화 헬퍼(switchSfImTab·_initSfImLayout·
//   _syncSfImHeight)는 sf-card(섹터 수급 트렌드) 제거로 소멸 — 산업별 수급동향은 sector-rotation.js.


// ── 내 종목 현황 카드 ────────────────────────────────────────────────────────
// 종목당 한 줄: [종목명][보유/관심][등락률][오늘 공시][최근 보고서]
//   → 한 종목의 등락이 오늘 공시·리포트와 상관있는지 한눈에 읽힌다.
//   이벤트(공시 or 리포트) 있는 종목을 위로, 그 안에서 등락 큰 순으로 정렬.
//   시세는 INV.allMarketRows(loadMarketOverview)에 의존 → 준비되면 _renderMyStocks() 재호출로 갱신.
let _myStocksWlRows = null;
let _myStocksData   = null;   // { wlRows, discsByCode, reportsByCode, nameToWl }

// 공시 카테고리 색
const _MS_CAT_ST = {
  '잠정실적':     { c:'#f59e0b', bg:'rgba(245,158,11,.13)'  },
  '주요사항':     { c:'#ffd600', bg:'rgba(255,214,0,.13)'   },
  '주요경영사항': { c:'#fb923c', bg:'rgba(251,146,60,.13)'  },
  '증자/감자':    { c:'#a78bfa', bg:'rgba(167,139,250,.13)' },
  '합병/분할':    { c:'#f87171', bg:'rgba(248,113,113,.13)' },
  '사채/전환':    { c:'#60a5fa', bg:'rgba(96,165,250,.13)'  },
  '자사주':       { c:'#34d399', bg:'rgba(52,211,153,.13)'  },
  '배당':         { c:'#fbbf24', bg:'rgba(251,191,36,.13)'  },
  '지분공시':     { c:'#a259ff', bg:'rgba(162,89,255,.13)'  },
  '대량보유':     { c:'#e879f9', bg:'rgba(232,121,249,.13)' },
  '공정공시':     { c:'#00d4aa', bg:'rgba(0,212,170,.13)'   },
  '최대주주변동': { c:'#f97316', bg:'rgba(249,115,22,.13)'  },
};
const _msCatStyle = cat => _MS_CAT_ST[cat] || { c:'#8b90a7', bg:'rgba(139,144,167,.13)' };

async function loadMyStocksCard() {
  const body = document.getElementById('ms-body');
  if (!body) return;

  const { data: wlRows, error: wlErr } = await sb.from('watchlist')
    .select('stock_code,corp_name,group_name');

  if (wlErr || !wlRows?.length) {
    body.innerHTML = '<div style="padding:1.2rem;text-align:center;color:var(--text2);font-size:12px">보유/관심 종목을 추가하면 현황이 표시됩니다</div>';
    return;
  }

  _myStocksWlRows = wlRows;

  const norm = s => (s || '').trim();
  const corpNameSet = new Set(wlRows.map(r => norm(r.corp_name)));
  const stockCodes  = [...new Set(wlRows.map(r => r.stock_code))];
  const nameToWl    = {};
  wlRows.forEach(r => { if (r.corp_name) nameToWl[norm(r.corp_name)] = r; });

  const heldCnt  = wlRows.filter(r => r.group_name === '보유중').length;
  const watchCnt = wlRows.filter(r => r.group_name !== '보유중').length;
  const badgeEl  = document.getElementById('ms-count-badge');
  if (badgeEl) badgeEl.innerHTML =
    `<span style="color:var(--red);font-weight:600">보유 ${heldCnt}</span>` +
    `<span style="color:var(--border);margin:0 5px">·</span>` +
    `<span style="color:var(--text2)">관심 ${watchCnt}</span>`;

  body.innerHTML = _skelList(4, true);

  const todayKst  = kstToday();   // 공시 기준일 — KST 단일 기준 (fmtDate 로컬TZ 혼용 제거)
  const daysAgo30 = offsetDate(-30);

  const [discRes, reportRes] = await Promise.all([
    sb.from('daily_disclosures')
      .select('corp_name,report_nm,rcept_no,category')
      .eq('base_date', todayKst),
    sb.from('dart_reports')
      .select('stock_code,stock_name,report_type,receive_date,summary')
      .in('stock_code', stockCodes)
      .gte('receive_date', daysAgo30)
      .order('receive_date', { ascending: false })
      .limit(30),
  ]);

  // 종목코드 기준으로 공시·보고서 묶기 (공시는 corp_name → wl → stock_code)
  const discsByCode   = {};
  (discRes.data || []).forEach(d => {
    const wl = nameToWl[norm(d.corp_name)];
    if (!wl) return;
    (discsByCode[wl.stock_code] = discsByCode[wl.stock_code] || []).push(d);
  });
  const reportsByCode = {};
  (reportRes.data || []).forEach(r => {
    (reportsByCode[r.stock_code] = reportsByCode[r.stock_code] || []).push(r);
  });

  _myStocksData = { wlRows, discsByCode, reportsByCode, nameToWl, todayKst };
  _renderMyStocks();
}

// 종목당 한 줄 렌더 (시세·공시·보고서 결합) — 시세가 늦게 와도 재호출로 갱신
function _renderMyStocks() {
  const body = document.getElementById('ms-body');
  if (!body || !_myStocksData) return;

  const { wlRows, discsByCode, reportsByCode, todayKst } = _myStocksData;
  const allRows = INV.allMarketRows || [];
  const mktByCode = {};
  allRows.forEach(r => { mktByCode[r.stock_code] = r; });

  // 종목 단위로 통합 (watchlist 중복 코드 제거)
  const seen = new Set();
  const items = [];
  wlRows.forEach(wl => {
    if (seen.has(wl.stock_code)) return;
    seen.add(wl.stock_code);
    const mkt     = mktByCode[wl.stock_code];
    const discs   = discsByCode[wl.stock_code]   || [];
    const reports = reportsByCode[wl.stock_code] || [];
    items.push({
      code: wl.stock_code,
      name: wl.corp_name || mkt?.corp_name || wl.stock_code,
      held: wl.group_name === '보유중',
      chg:  mkt?.price_change_rate,
      discs, reports,
      hasEvent: discs.length > 0 || reports.length > 0,
    });
  });

  // 이벤트 있는 종목 우선 → 등락 큰 순 (등락 없으면 맨 뒤)
  items.sort((a, b) => {
    if (a.hasEvent !== b.hasEvent) return a.hasEvent ? -1 : 1;
    const ca = a.chg == null ? -Infinity : Math.abs(a.chg);
    const cb = b.chg == null ? -Infinity : Math.abs(b.chg);
    return cb - ca;
  });

  const eventCnt = items.filter(i => i.hasEvent).length;
  const priceReady = allRows.length > 0;

  const rows = items.map(it => {

    // 등락률
    const chgHTML = it.chg != null
      ? `<span style="font-size:12px;font-weight:700;color:${chgColor(it.chg)};flex-shrink:0;min-width:52px;text-align:right">${chgStr(it.chg)}</span>`
      : `<span style="font-size:11px;color:var(--text3);flex-shrink:0;min-width:52px;text-align:right">${priceReady ? '—' : '·'}</span>`;

    // 공시 — 카테고리 배지 + 공시 제목(첫 건), 추가 건은 +N. 클릭 시 DART
    let discHTML = '';
    if (it.discs.length) {
      const d0   = it.discs[0];
      const s    = _msCatStyle(d0.category || '기타');
      const link = d0.rcept_no ? `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${d0.rcept_no}` : null;
      const click = link ? `onclick="event.stopPropagation();window.open('${link}','_blank')"` : '';
      const more  = it.discs.length > 1
        ? `<span style="font-size:10px;color:var(--text3);flex-shrink:0">+${it.discs.length - 1}</span>` : '';
      discHTML = `
        <span ${click} style="font-size:10px;padding:1px 6px;border-radius:3px;font-weight:600;white-space:nowrap;flex-shrink:0;
          background:${s.bg};color:${s.c};cursor:${link ? 'pointer' : 'default'}">${escapeHtml(d0.category || '공시')}</span>
        <span ${click} title="${escAttr(d0.report_nm || '')}"
          style="font-size:11px;color:var(--text1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;cursor:${link ? 'pointer' : 'default'}">${escapeHtml(d0.report_nm || '공시')}</span>
        ${more}`;
    }

    // 최근 보고서 배지 (최신 1건 날짜) — 행 클릭으로 상세 진입
    let reportHTML = '';
    if (it.reports.length) {
      const latest = it.reports[0];
      const md = (latest.receive_date || '').slice(5).replace('-', '/');
      reportHTML = `<span title="${escAttr(latest.report_type || 'DART 분석 보고서')}"
        style="font-size:10px;padding:1px 6px;border-radius:3px;font-weight:600;white-space:nowrap;flex-shrink:0;
        background:rgba(42,171,238,.13);color:#2AABEE">📄 리포트${md ? ' ' + md : ''}${it.reports.length > 1 ? ` +${it.reports.length - 1}` : ''}</span>`;
    }

    return `
    <div class="stock-row" data-stock-open="${it.code}" data-stock-name="${escAttr(it.name)}" data-stock-tab="market"
      style="display:flex;align-items:center;gap:8px;padding:7px 14px 7px 12px;border-top:1px solid var(--border);
      border-left:2px solid ${it.hasEvent ? 'var(--tg)' : 'transparent'}">
      <span style="font-size:12px;font-weight:500;color:var(--text1);flex-shrink:0;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(it.name)}</span>
      <span style="font-size:9px;padding:1px 5px;border-radius:3px;font-weight:700;flex-shrink:0;
        background:${it.held?'rgba(245,58,92,.13)':'rgba(255,255,255,.06)'};
        color:${it.held?'var(--red)':'var(--text2)'}">${it.held?'보유':'관심'}</span>
      ${chgHTML}
      <div style="display:flex;align-items:center;gap:5px;flex:1;min-width:0;overflow:hidden">
        ${discHTML}${reportHTML}
      </div>
    </div>`;
  }).join('');

  const header = `<div style="display:flex;align-items:center;gap:6px;padding:7px 14px 7px 12px;font-size:11px;color:var(--text2)">
    <span style="width:2px;height:11px;background:var(--tg);border-radius:2px;flex-shrink:0"></span>
    ${eventCnt ? `오늘 <b style="color:var(--text1)">${eventCnt}</b>종목에 공시·리포트` : '오늘 공시·리포트 있는 종목 없음'}
    <span style="color:var(--text3);margin-left:auto">${todayKst} 기준 · 리포트 30일</span>
  </div>`;

  body.innerHTML = header + rows;
}


// ── 시황/공시/급등 로직은 분리된 파일에서 로드 ──
// market-overview.js    : loadMacroData, loadTrendChart, loadMarketOverview
// market-temperature.js : renderMarketTemperature
// disclosure.js         : loadTodayDisclosures, loadAllDisclosures, toggleAllDisclosures
// earnings-surge.js     : loadEarningsSurge, renderSurgeList, setSurgeGrade 등
