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

// INV 네임스페이스 자체는 config.js에서 먼저 선언(로드 순서 문제 — market-overview 등이
// investment.js보다 먼저 로드되며 최상위에서 INV에 접근). 여기서는 시황 페이지 기본값만 주입한다.
//   selected·period: 지표 선택/기간 UI 상태
//   ── 구 window._* 수렴 (런타임 대입) ──
//   tab·highlighted·hovered: 시황 페이지 UI 상태
//   allMarketRows·macroData·marketBreadth·indMapData:
//     market-overview/chart-macro가 공유하는 시장 데이터 캐시
//   moSort·indBarChart: 섹션별 상태
INV.selected = new Set(['sp500','nasdaq','kospi','kosdaq']);
INV.period   = 7;

// (카드 SVG 아이콘 맵 _ICO → config.js로 이동 — 상세 모달 등 다른 파일도 공용 사용)

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

// ── 페이지 HTML ──
function pInvestment() {
  return `
  <!-- 페이지 헤더 -->
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem;flex-wrap:wrap;gap:8px">
    <div style="font-size:calc(13px*var(--m-body));font-weight:600;color:var(--text)">오늘의 시황</div>
    <div style="display:flex;align-items:center;gap:8px">
      <div style="font-size:calc(11px*var(--m-label));color:var(--text2)" id="inv-date"></div>
      <button class="btn btn-sm" id="inv-refresh-btn" onclick="refreshInvestment()">${_ICO.refresh}새로고침</button>
    </div>
  </div>

  <!-- 상단: 피어앤그리드 — 시장 심리(공포↔탐욕) 한눈에. 좌 차트 | 우 요약·구성 요소 (fear-greed.js) -->
  <!-- (구 '오늘의 시장 판단' 온도계+투자포인트 카드는 09-28 이 카드로 대체 — market-temperature/-insight.js 삭제) -->
  <div class="card insight-card card--hero" style="margin-bottom:1rem">
    <div class="card-header" style="flex-wrap:wrap;gap:6px">
      <span class="card-title">${_ICO.temp}피어앤그리드</span>
      <span class="card-sub">시장 심리 — 공포 ↔ 탐욕 (0~100)</span>
      <span id="fg-date" style="font-size:calc(11px*var(--m-label));color:var(--text2);margin-left:auto"></span>
      <div style="display:flex;gap:4px">
        <button class="chip chip-sm active" data-fg-market="kospi"  onclick="setFgMarket('kospi')" >코스피</button>
        <button class="chip chip-sm"        data-fg-market="kosdaq" onclick="setFgMarket('kosdaq')">코스닥</button>
      </div>
    </div>
    <div class="fg-grid">
      <!-- 좌: 지수·EMA20·시장 지수 차트 + 오실레이터 -->
      <div class="fg-col-chart">
        <div id="fg-charts">
          <div style="padding:.75rem 1rem 0;position:relative;height:240px"><canvas id="fg-chart"></canvas></div>
          <div style="padding:0 1rem .5rem;position:relative;height:70px"><canvas id="fg-osc-chart"></canvas></div>
        </div>
        <div id="fg-empty" style="display:none;padding:3rem 1rem;text-align:center;color:var(--text2);font-size:calc(12px*var(--m-sub))"></div>
      </div>
      <!-- 우: 요약 + 구성 요소 -->
      <div class="fg-col-side">
        <div id="fg-summary" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;border-bottom:1px solid var(--border)"></div>
        <div id="fg-rules"></div>
        <div style="padding:.6rem 1rem .75rem">
          <div style="font-size:calc(11px*var(--m-label));color:var(--text2);margin-bottom:4px">구성 요소 · 탐욕 쪽 점수 (각 20%)</div>
          <div id="fg-comp"></div>
          <div style="font-size:calc(11px*var(--m-label));color:var(--text3);margin-top:8px;line-height:1.5">
            파랑 = 지수 · 주황 = EMA20 · 회색 = 시장 지수 · 점선 20/50/80. 아래 막대 = 오실레이터(지수의 MACD − 시그널),
            <span style="color:#fb6340">▼</span> 피크 · <span style="color:#2dce89">▲</span> 매수 조건.
            최근 1년 안에서 각 요소를 0~100으로 맞춘 상대 점수라, 새 고점·저점이 생기면 과거 값도 조금 바뀝니다.
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- 내 종목 현황 — 보유/관심 종목의 시세·오늘 공시·최근 보고서를 한눈에 -->
  <div class="card" id="my-stocks-card" style="margin-bottom:1rem">
    <div class="card-header" style="flex-wrap:wrap;gap:6px">
      <span class="card-title">${_ICO.doc}내 종목 현황</span>
      <span class="card-sub">시세 · 오늘 공시 · 최근 보고서</span>
      <span id="ms-count-badge" style="font-size:calc(11px*var(--m-label));color:var(--text2);margin-left:auto"></span>
    </div>
    <div id="ms-body" style="border-top:1px solid var(--border)">${_skelList(3, true)}</div>
  </div>

  <!-- 업종 보드 — 주도 업종·업종 수급·쏠림지수·국면·관심도 (WICS 중분류 28개, sector-lead.js).
       09-29 옛 '산업별 수급동향'(자체 산업 분류·4사분면, sector-rotation.js)을 이 카드로 대체 -->
  ${typeof pSectorLead === 'function' ? pSectorLead() : ''}

  <!-- 수급 3종 가로 배치(10-03 사용자 요청) — 기관/외국인 수급 · 투자자별 매매동향 · 신용융자 잔고.
       옛 2단(좌 수급 | 우 아이디어·공시) 레이아웃은 없앴다 -->
  <div class="inv-3col">

      <!-- 수급 요약 -->
      <div class="card" style="margin-bottom:0">
        <div class="card-header">
          <span class="card-title">${_ICO.flow}기관/외국인 수급</span>
          <span style="font-size:calc(11px*var(--m-label));color:var(--text2)" id="flow-date-label">집계 중…</span>
        </div>
        <div class="flow-grid" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border-top:1px solid var(--border)">
          <div>
            <div style="padding:5px 8px;font-size:calc(11px*var(--m-label));font-weight:600;color:var(--text1);background:var(--bg2);border-bottom:1px solid var(--border)">${_ICO.shuffle}동시매수</div>
            <div id="flow-body-both">${_skelList(6, true)}</div>
          </div>
          <div style="border-left:1px solid var(--border)">
            <div style="padding:5px 8px;font-size:calc(11px*var(--m-label));font-weight:600;color:var(--tg);background:var(--bg2);border-bottom:1px solid var(--border)">${_ICO.globe}외국인</div>
            <div id="flow-body-frgn">${_skelList(6, true)}</div>
          </div>
          <div style="border-left:1px solid var(--border)">
            <div style="padding:5px 8px;font-size:calc(11px*var(--m-label));font-weight:600;color:var(--yellow);background:var(--bg2);border-bottom:1px solid var(--border)">${_ICO.building}기관</div>
            <div id="flow-body-orgn">${_skelList(6, true)}</div>
          </div>
        </div>
      </div>

      <!-- 투자자별 매매동향 — 시장 전체 개인·외국인·기관 순매수 (market-investor.js) -->
      <div class="card" style="margin-bottom:0">
        <div class="card-header" style="flex-wrap:wrap;gap:6px">
          <span class="card-title">${_ICO.bar}투자자별 매매동향</span>
          <span class="card-sub">누가 사고 파나 — 개인·외국인·기관</span>
          <span id="mif-date" style="font-size:calc(11px*var(--m-label));color:var(--text2);margin-left:auto"></span>
          <div style="display:flex;gap:4px">
            <button class="chip chip-sm active" data-mif-market="kospi"  onclick="setMifMarket('kospi')" >코스피</button>
            <button class="chip chip-sm"        data-mif-market="kosdaq" onclick="setMifMarket('kosdaq')">코스닥</button>
          </div>
          <div style="display:flex;gap:4px">
            ${[{d:90,l:'3달'},{d:180,l:'6달'},{d:365,l:'1년'},{d:0,l:'전체'}].map(({d,l})=>`
              <button class="chip chip-sm ${d===90?'active':''}" data-mif-period="${d}"
                onclick="setMifPeriod(${d})">${l}</button>
            `).join('')}
          </div>
        </div>
        <div id="mif-summary" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;border-top:1px solid var(--border)"></div>
        <div style="padding:.75rem 1rem;position:relative;height:220px;border-top:1px solid var(--border)">
          <canvas id="mif-chart"></canvas>
          <div id="mif-empty" style="display:none;position:absolute;inset:0;align-items:center;justify-content:center;color:var(--text2);font-size:calc(12px*var(--m-sub))">
            데이터 수집 중... (매일 18:20 업데이트)
          </div>
        </div>
      </div>

      <!-- 신용융자 잔고 추이 — KOFIA 신용공여 잔고 (credit-balance.js) -->
      <div class="card" style="margin-bottom:0">
        <div class="card-header" style="flex-wrap:wrap;gap:6px">
          <span class="card-title">${_ICO.bank}신용융자 잔고</span>
          <span class="card-sub">빚투 규모 — 레버리지 과열·위축</span>
          <span id="cb-date" style="font-size:calc(11px*var(--m-label));color:var(--text2);margin-left:auto"></span>
          <div style="display:flex;gap:4px">
            ${[{d:90,l:'3달'},{d:180,l:'6달'},{d:365,l:'1년'},{d:0,l:'전체'}].map(({d,l})=>`
              <button class="chip chip-sm ${d===180?'active':''}" data-cb-period="${d}"
                onclick="setCbPeriod(${d})">${l}</button>
            `).join('')}
          </div>
        </div>
        <div id="cb-summary" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0;border-top:1px solid var(--border)"></div>
        <div style="padding:.75rem 1rem;position:relative;height:220px;border-top:1px solid var(--border)">
          <canvas id="cb-chart"></canvas>
          <div id="cb-empty" style="display:none;position:absolute;inset:0;align-items:center;justify-content:center;color:var(--text2);font-size:calc(12px*var(--m-sub))">
            데이터 수집 중... (매일 19:00 업데이트)
          </div>
        </div>
      </div>

  </div>

      <!-- 💡 오늘의 아이디어 (전체 폭) = 태린이아빠 후보 (taerin-picks.js). 10-03 사용자 결정 '태린 후보로만' —
           옛 탭(주도주·신고가·실적급등·급등·전망)과 그 화면 코드는 없앴다 -->
      <div class="card" style="margin-bottom:1rem">
        <div class="card-header" style="flex-wrap:wrap;gap:6px">
          <span class="card-title">${_ICO.bulb}오늘의 아이디어</span>
          <span class="card-sub">태린이아빠 후보 — 주도 업종 빈집</span>
          <span id="tp-count" style="font-size:calc(11px*var(--m-label));color:var(--text2);margin-left:auto"></span>
          <div style="display:flex;gap:4px">
            <button class="chip chip-sm active" data-tp-filter="all" onclick="setTpFilter('all')">전체</button>
            <button class="chip chip-sm"        data-tp-filter="A"   onclick="setTpFilter('A')" title="주도 업종 ∧ 수급 빈집 + 확률 조건">A</button>
            <button class="chip chip-sm"        data-tp-filter="B"   onclick="setTpFilter('B')" title="RS 70 일일 스크린">B</button>
          </div>
        </div>
        <div id="tp-body" style="border-top:1px solid var(--border)">${_skelList(8, true)}</div>
      </div>

      <!-- 공시 피드 (전체 폭) -->
      <div class="card" style="margin-bottom:1rem">
        <div class="card-header">
          <span class="card-title">${_ICO.doc}오늘 실적 공시 종목</span>
          <span id="inv-disclosure-date" style="font-size:calc(11px*var(--m-label));color:var(--text2);margin-left:8px"></span>
          <button id="inv-disclosure-expand-btn" class="btn btn-sm" style="margin-left:auto;font-size:calc(12px*var(--m-sub))"
            onclick="toggleAllDisclosures()">+ 전체 공시</button>
        </div>
        <div id="inv-disclosure-list" style="padding:.5rem 0">${_skelList(4)}</div>
        <div id="inv-all-disclosure" style="display:none;border-top:1px solid var(--border)">
          <div id="inv-all-disclosure-list" style="padding:.5rem 0">${_skelList(6)}</div>
        </div>
      </div>


  <!-- 이하: 상세 섹션들 (전체 너비) -->
  <div id="inv-tab-market" style="display:block">


    <!-- (산업별 수급동향 → '내 종목 현황' 카드 바로 아래로 이동) -->

    <!-- (종목별 수급 순위 → Zone C 심화 분석으로 이동) -->

    <!-- (주도 업종 → '내 종목 현황' 바로 아래 업종 보드로 이동) -->

    <!-- ⑦ 산업 동향 -->
    <div class="card" style="margin-bottom:12px">
      <div class="card-header" style="flex-wrap:wrap;gap:4px;padding-bottom:6px">
        <span class="card-title">${_ICO.grid}산업 동향</span>
        <!-- US ETF 배너 -->
        <div id="inv-etf-banner" style="display:flex;gap:10px;align-items:center;margin-left:auto;font-size:calc(12px*var(--m-sub));flex-wrap:wrap">
          <span style="color:var(--text2)"><span class="loading"></span></span>
        </div>
      </div>
      <!-- KR 모니터링 현황 -->
      <div id="inv-industry-banner" style="padding:4px 1rem 6px;border-bottom:1px solid var(--border);font-size:calc(12px*var(--m-sub));display:flex;gap:10px;color:var(--text2)">
        <span><span class="loading"></span></span>
      </div>
      <div id="inv-industry-chart"></div>
    </div>

    <!-- Zone C — 심화 분석 (기본 접힘) -->
    <div onclick="toggleZoneC()" style="cursor:pointer;display:flex;align-items:center;gap:8px;
      padding:10px 14px;margin-bottom:12px;background:var(--bg2);border:1px solid var(--border);border-radius:8px">
      <span style="font-size:calc(13px*var(--m-body));font-weight:600;color:var(--text1)">${_ICO.grid}심화 분석</span>
      <span class="card-sub">종목별 수급 · 거래대금 · 급등/급락 · 비교 차트</span>
      <span id="zonec-toggle" style="font-size:calc(12px*var(--m-sub));color:var(--text2);margin-left:auto">펼치기 ▾</span>
    </div>

    <div id="inv-zonec" style="display:none">

    <!-- ③-b 수급 지도 (찬집/빈집 사분면 — 종목별 누적 순매수÷시총, 지연 로드) -->
    <div class="card" style="margin-bottom:12px">
      <div class="card-header" style="flex-wrap:wrap;gap:6px">
        <span class="card-title">${_ICO.bank}수급 지도 <span class="card-sub">(찬집·빈집 사분면 · 누적 순매수÷시총)</span></span>
      </div>
      <div style="padding:.75rem 1rem 0">
        ${typeof pFlowMap === 'function' ? pFlowMap() : ''}
      </div>
    </div>

    <!-- (52주 신고가 → '오늘의 아이디어' 탭으로 이동) -->

    <!-- ⑩ 거래대금 상위 -->
    <div class="card" style="margin-bottom:12px">
      <div class="card-header">
        <span class="card-title">${_ICO.coin}거래대금 상위</span>
        <span style="font-size:calc(11px*var(--m-label));color:var(--text2)">최근 거래일 종가 기준</span>
      </div>
      <div id="inv-volume-body" style="display:grid;grid-template-columns:repeat(2,1fr);gap:0;border-top:1px solid var(--border)">
        ${_skelList(3)}
      </div>
    </div>

    <!-- ⑪ 흐름 비교 차트 (접기/펼치기) -->
    <div class="card" style="margin-bottom:12px">
      <div class="card-header" style="cursor:pointer" onclick="toggleTrendChart()">
        <span class="card-title">${_ICO.chart}흐름 비교 차트</span>
        <span id="inv-trend-toggle" style="font-size:calc(12px*var(--m-sub));color:var(--text2);margin-left:auto">접기 ▴</span>
      </div>
      <div id="inv-trend-body" style="display:block">
        <div style="flex-wrap:wrap;gap:8px;padding:.75rem 1rem;border-bottom:1px solid var(--border);display:flex;align-items:center">
          <div style="display:flex;gap:4px;margin-left:auto">
            ${[{d:7,l:'1주'},{d:30,l:'1달'},{d:90,l:'3달'}].map(({d,l})=>`
              <button class="chip chip-sm ${d===7?'active':''}" data-inv-period="${d}"
                onclick="setInvPeriod(${d})">${l}</button>
            `).join('')}
          </div>
        </div>
        <!-- 그룹 필터 버튼 -->
        <div style="padding:.5rem 1rem;border-bottom:1px solid var(--border);display:flex;flex-wrap:wrap;gap:4px;align-items:center">
          <span style="font-size:calc(11px*var(--m-label));color:var(--text2);margin-right:4px">그룹선택</span>
          ${['미국','한국','환율','원자재','기타'].map(g => `
            <button class="chip chip-sm"
              onclick="selectInvGroup('${g}')">${g}</button>
          `).join('')}
          <button class="chip chip-sm" style="margin-left:4px"
            onclick="selectInvGroup('')">전체해제</button>
        </div>
        <div style="padding:.75rem 1rem;border-bottom:1px solid var(--border);display:flex;flex-wrap:wrap;gap:6px" id="inv-metric-checks">
          ${INV_ALL_METRICS.map(m => `
            <label style="display:flex;align-items:center;gap:5px;cursor:pointer;padding:3px 8px;border-radius:100px;border:1px solid var(--border);font-size:calc(12px*var(--m-sub));user-select:none"
              id="inv-lbl-${m.col}">
              <input type="checkbox" style="display:none" id="inv-chk-${m.col}"
                onchange="toggleInvMetric('${m.col}')" ${['sp500','nasdaq','kospi','kosdaq'].includes(m.col)?'checked':''}>
              <span style="width:8px;height:8px;border-radius:50%;background:${m.color};flex-shrink:0"></span>
              <span>${m.name}</span>
              <span style="font-size:calc(11px*var(--m-label));color:var(--text2)">${m.group}</span>
            </label>
          `).join('')}
        </div>
        <div style="padding:1rem;position:relative;height:260px">
          <canvas id="inv-trend-chart"></canvas>
          <div id="inv-trend-empty" style="display:none;position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--text2);font-size:calc(13px*var(--m-body))">
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
            <button class="chip chip-sm ${d===7?'active':''}" data-ind-period="${d}"
              onclick="setIndTrendPeriod(${d})">${l}</button>
          `).join('')}
        </div>
      </div>
      <!-- ② 수익률 순위 범례 -->
      <div style="padding:.5rem 1rem .25rem;border-bottom:1px solid var(--border);display:flex;flex-wrap:wrap;gap:6px;align-items:center" id="ind-trend-checks">
        <!-- 상/하위 버튼 -->
        <div style="display:flex;gap:4px;margin-left:auto;flex-shrink:0">
          <button class="chip chip-sm" id="btn-top3" onclick="filterIndTrend('top')"
           >▲ 상위3</button>
          <button class="chip chip-sm" id="btn-bot3" onclick="filterIndTrend('bottom')"
           >▼ 하위3</button>
          <button class="chip chip-sm active" id="btn-all" onclick="filterIndTrend('all')"
           >전체</button>
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
            <button class="chip chip-sm ${d===7?'active':''}" data-uskr-period="${d}"
              onclick="setUskrPeriod(${d})">${l}</button>
          `).join('')}
        </div>
      </div>
      <!-- 산업 선택 (하나 선택 → KR+US 1:1 비교) -->
      <div style="padding:.5rem 1rem;border-bottom:1px solid var(--border);display:flex;flex-wrap:wrap;gap:6px;align-items:center">
        ${INDUSTRIES.map((ind,i)=>`
          <button class="chip chip-sm ${i===0?'active':''}" id="uskr-btn-${ind}"
            onclick="selectUskrInd('${ind}')">${ind}</button>
        `).join('')}
      </div>
      <!-- 모드 전환 버튼 -->
      <div style="padding:.4rem 1rem;border-bottom:1px solid var(--border);display:flex;gap:6px;align-items:center">
        <span style="font-size:calc(11px*var(--m-label));color:var(--text2)">표시 방식</span>
        <button class="chip chip-sm active" id="uskr-mode-avg" onclick="setUskrMode('avg')"
         >KR vs US 평균</button>
        <button class="chip chip-sm" id="uskr-mode-all" onclick="setUskrMode('all')"
         >KR + 개별 ETF 전체</button>
      </div>
      <div style="padding:1rem;position:relative;height:320px">
        <canvas id="uskr-chart"></canvas>
      </div>
    </div>

    <!-- ⑭ 급등/급락 — 4열 그리드 -->
    <div class="surge-drop-grid">
      <div class="card" style="margin-bottom:0">
        <div class="card-header" style="padding:8px 10px">
          <span class="card-title" style="color:var(--red);font-size:calc(13px*var(--m-body))">${_ICO.arrowUp}코스피 급등</span>
        </div>
        <div id="inv-surge-kospi" style="padding:.25rem 0"></div>
      </div>
      <div class="card" style="margin-bottom:0">
        <div class="card-header" style="padding:8px 10px">
          <span class="card-title" style="color:var(--blue);font-size:calc(13px*var(--m-body))">${_ICO.arrowDn}코스피 급락</span>
        </div>
        <div id="inv-drop-kospi" style="padding:.25rem 0"></div>
      </div>
      <div class="card" style="margin-bottom:0">
        <div class="card-header" style="padding:8px 10px">
          <span class="card-title" style="color:var(--red);font-size:calc(13px*var(--m-body))">${_ICO.arrowUp}코스닥 급등</span>
        </div>
        <div id="inv-surge-kosdaq" style="padding:.25rem 0"></div>
      </div>
      <div class="card" style="margin-bottom:0">
        <div class="card-header" style="padding:8px 10px">
          <span class="card-title" style="color:var(--blue);font-size:calc(13px*var(--m-body))">${_ICO.arrowDn}코스닥 급락</span>
        </div>
        <div id="inv-drop-kosdaq" style="padding:.25rem 0"></div>
      </div>
    </div>

    </div><!-- /inv-zonec (심화 분석) -->

  </div>`;
}




// (정리됨) mkIndexCard·_macroCard·setInvTab — 매크로 카드 그리드/공시 탭 제거로 호출처 소멸.
//   매크로 지수는 전역 탑바 스트립·시장 온도계 6세부요소·Zone A 브리핑 위험배지가 담당.

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
  if (typeof resetFlowMap === 'function') resetFlowMap();   // 수급 지도 원자료 폐기
}

async function refreshInvestment() {
  _clearInvRefreshTimers();  // 연타 시 이전 폴링 취소
  _latestMarketDate = null;
  const btn = document.getElementById('inv-refresh-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
  const restoreBtn = () => {
    const b = document.getElementById('inv-refresh-btn');
    if (b) { b.disabled = false; b.innerHTML = _ICO.refresh + '새로고침'; }
  };

  // ── 서버 수집 트리거 ──
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
    toast(isWeekend
      ? '📡 매크로(환율·지수) 수집 요청 — 주말은 주식 시장 데이터 수집 제외'
      : '📡 서버 수집 요청 완료 — 수집 완료 확인 후 자동 반영됩니다', 'info');
  } catch(e) {
    toast('트리거 전송 실패: ' + e.message, 'error');
    restoreBtn();   // 구 코드: 실패 시 버튼이 ⏳로 잠긴 채 방치되던 버그 수정
    return;
  }

  // ── 수집 완료 폴링 — macro_data.updated_at이 트리거 시각 이후로 갱신되면 재로드 ──
  // (구 70초 고정 대기: 일찍 끝나면 낭비, 늦게 끝나면 미완료 데이터 재로드 → 실제 완료 신호로 교체)
  const t0 = new Date();
  let tries = 0;
  const MAX_TRIES = 15;   // 10초 간격 · 최대 150초
  const finish = async (done) => {
    _clearInvRefreshTimers();
    if (A.page !== 'investment') return;   // 페이지 이탈 — 유령 재로드 방지
    _latestMarketDate = null;
    await loadInvestment();
    restoreBtn();
    toast(done ? '✅ 최신 데이터로 업데이트됐습니다'
               : '⏱ 완료 확인 시간 초과 — 현재 시점 데이터로 갱신했습니다', done ? 'success' : 'info');
  };
  const poll = setInterval(async () => {
    tries++;
    const b = document.getElementById('inv-refresh-btn');
    if (!b || A.page !== 'investment') { _clearInvRefreshTimers(); return; }
    b.textContent = `⏳ 수집 확인 ${tries * 10}초`;
    let done = false;
    try {
      const { data } = await sb.from('macro_data')
        .select('updated_at').order('base_date', { ascending: false }).limit(1).maybeSingle();
      done = !!(data?.updated_at && new Date(data.updated_at) > t0);
    } catch (e) { /* 일시 오류 — 다음 폴링에서 재확인 */ }
    if (done || tries >= MAX_TRIES) finish(done);
  }, 10000);
  _invRefreshTimers.push(poll);
}

// ── 기준일 라벨 — 지수(macro_data, 매일)와 종목데이터(market_data, 주간) 이원 표기 ──
// '오늘'을 표방하지만 종목 단위 데이터는 갱신 주기가 달라, 기준일을 분리해 정직하게 노출한다.
// loadInvestment 본문에서 분리 — 메인 로드를 블로킹하지 않고 병렬 렌더.
async function _renderInvAsOf(mktDate) {
  try {
    const { data: lastUpdate } = await sb.from('macro_data')
      .select('base_date,updated_at').order('base_date', { ascending: false }).limit(1).maybeSingle();
    const el = document.getElementById('inv-date');
    if (!el) return;
    if (!lastUpdate && !mktDate) { _updateInvTimestamp(); return; }

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
  } catch(e) {
    _updateInvTimestamp();
  }
}

// ── 메인 로드 ──
async function loadInvestment() {
  // 보유/관심 종목 교차표시용 코드 로드 (각 진입 시 최신화) — 목록 렌더 전 준비
  loadWatchlistCodes(true);
  loadMyStocksCard(); // 내 종목 현황 — 공시·보고서 먼저 비동기 로드

  // ── 독립 위젯 즉시 병렬 발사 — 매크로/종목 데이터 완료를 기다리지 않는다 ──
  loadCreditBalance();   // 신용융자 잔고 카드 (credit-balance.js) — 독립 쿼리
  loadMarketInvestor();  // 투자자별 매매동향 카드 (market-investor.js) — 독립 쿼리
  loadFearGreed();       // 피어앤그리드 카드 (fear-greed.js) — 독립 쿼리
  if (typeof loadSectorLead === 'function') loadSectorLead();  // 주도 업종 카드 (sector-lead.js) — 독립 쿼리
  loadTrendChart();      // 흐름 비교 차트 — macro_data 자체 조회 (loadMacroData와 독립)
  _allDiscLoaded = false;
  loadTodayDisclosures();
  loadTaerinPicks();     // '오늘의 아이디어' = 태린이아빠 후보 (taerin-picks.js) — 판정 캐시 공유

  // 매크로(탑바 스트립 의존)는 병렬 시작 — 완료는 하단에서 대기
  const macroP = loadMacroData().catch(e => console.warn('[loadInvestment] macro', e));

  const maxDate = await getLatestMarketDate();
  _renderInvAsOf(maxDate);   // 기준일 라벨 — 블로킹 없이 별도 렌더

  if (!maxDate) { await macroP; return; }

  // 전체 종목 + 산업별 동향 (내부에서 INV.allMarketRows 세팅)
  await loadMarketOverview(maxDate);

  // INV.allMarketRows 확보 후 내 종목 현황 행(등락률) 갱신
  if (_myStocksWlRows) _renderMyStocks();

  // 종목 데이터만 필요한 위젯 (INV.allMarketRows 재활용)
  renderVolumeLeaders();
  renderTaerinPicks();   // 시세(등락률·거래대금)가 들어왔으니 태린 후보 다시 그림
  // 수급 지도(종목별 찬집/빈집)는 Zone C를 펼칠 때만 지연 로드 — toggleZoneC 참조.
  // 단 새로고침 경로(refreshInvestment→finish→loadInvestment)는 셸을 다시 그리지 않아
  // 펼쳐둔 지도가 캐시(FM.raw)에 묶인 채 남는다 → 캐시를 버리고 열려 있으면 재조회.
  if (typeof resetFlowMap === 'function') resetFlowMap(true);

  // 매크로 의존 위젯 — 병렬 로드 완료 후 실행 (구: 직렬 await + setTimeout 1500ms 지연 호출)
  await macroP;

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
      <span style="width:14px;font-size:calc(11px*var(--m-label));color:var(--text2);font-weight:600;flex-shrink:0">${i+1}</span>
      <span style="flex:1;font-size:calc(12px*var(--m-sub));font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(r.corp_name)}</span>
      ${wlBadge(r.stock_code)}
      <span style="font-size:calc(12px*var(--m-sub));font-weight:700;color:${chgColor(r.price_change_rate)};flex-shrink:0">${chgStr(r.price_change_rate)}</span>
    </div>`;

  const setCard = (id, data) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = (data || []).map(rankRow).join('') || '<div style="padding:12px;color:var(--text2);font-size:calc(12px*var(--m-sub));text-align:center">데이터 없음</div>';
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
    el.innerHTML = '<div style="grid-column:1/-1;padding:1rem;text-align:center;color:var(--text2);font-size:calc(12px*var(--m-sub))">데이터 없음</div>';
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
        <div style="padding:8px 12px;font-size:calc(12px*var(--m-sub));font-weight:700;color:${p.color};
          border-bottom:2px solid ${p.color}50;letter-spacing:.5px">${p.label}</div>
        <div style="padding:1rem;text-align:center;color:var(--text2);font-size:calc(11px*var(--m-label))">데이터 없음</div>
      </div>`;

    const maxTV = sorted[0].tv;
    const rows = sorted.map((r, i) => {
      const c     = r.price_change_rate ?? 0;
      const cc    = chgColor(c);   // 공용 색상 — 0은 회색 (인라인 재구현 제거)
      const cs    = fmtPct(c);
      const tvStr = fmtTV(r.tv);
      const barPct = Math.round(r.tv / maxTV * 100);
      return `
      <div class="stock-row" data-stock-open="${r.stock_code}" data-stock-name="${escAttr(r.corp_name||r.stock_code||'')}" data-stock-tab="market"
        style="display:flex;align-items:center;gap:8px;padding:6px 12px;
        border-bottom:1px solid var(--border)">
        <span style="min-width:16px;font-size:calc(11px*var(--m-label));color:var(--text2);font-weight:600">${i + 1}</span>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:4px;margin-bottom:3px"><span style="font-size:calc(12px*var(--m-sub));font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(r.corp_name)}</span>${wlBadge(r.stock_code)}</div>
          <div style="height:3px;border-radius:2px;background:var(--border);overflow:hidden">
            <div style="height:100%;width:${barPct}%;background:${p.color};border-radius:2px"></div>
          </div>
        </div>
        <div style="text-align:right;white-space:nowrap">
          <div style="font-size:calc(12px*var(--m-sub));color:var(--text1)">${tvStr}</div>
          <div style="font-size:calc(11px*var(--m-label));font-weight:600;color:${cc}">${cs}</div>
        </div>
      </div>`;
    }).join('');

    return `
    <div style="border-right:${pi === 0 ? '1px solid var(--border)' : 'none'}">
      <div style="padding:8px 12px;font-size:calc(12px*var(--m-sub));font-weight:700;color:${p.color};
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
    try { if (typeof loadFlowMap       === 'function') loadFlowMap();       } catch(e) { console.warn('[ZoneC] flowmap', e); }
  });
}


// (정리됨) 섹터수급↔산업강도 2열 그리드/높이동기화 헬퍼(switchSfImTab·_initSfImLayout·
//   _syncSfImHeight)는 sf-card(섹터 수급 트렌드) 제거로 소멸 — 업종 수급은 sector-lead.js(업종 보드).


// ── 내 종목 현황 카드 ────────────────────────────────────────────────────────
// 종목당 한 줄: [종목명][보유/관심][등락률][오늘 공시][최근 보고서]
//   → 한 종목의 등락이 오늘 공시·리포트와 상관있는지 한눈에 읽힌다.
//   이벤트(공시 or 리포트) 있는 종목을 위로, 그 안에서 등락 큰 순으로 정렬.
//   시세는 INV.allMarketRows(loadMarketOverview)에 의존 → 준비되면 _renderMyStocks() 재호출로 갱신.
let _myStocksWlRows = null;
let _myStocksData   = null;   // { wlRows, discsByCode, reportsByCode, nameToWl, fv, comp }
let _msRuleOpen     = null;   // 매매 규칙(매도 조건·교체 후보) 패널을 펼친 보유 종목 코드

// ── 교체 후보 — 태린이아빠 09-19 회원 영상 「수급 빈집 체크」 ─────────────────────
//  "보유 종목 수급 오실레이터가 차면(과열권) 같은 카테고리 안에서 수급이 비어 있고 모멘텀이 살아 있는
//   종목으로 바꾼다" (가온전선 → LS, 원익IPS → 주성엔지니어링). 보유 종목 단계가 '다 찼다'·'꺾임'이면
//  같은 테마(sub_industry) → WICS 소분류 → 중분류 순으로 넓혀 찾는다.
//  후보 = 빈집(수급 칸 2개 이하 — flowIsEmpty) ∧ 모멘텀 1개 이상(컨센↑·신고가·거래대금↑·군집·RS 70↑),
//  범위는 원본 엑셀처럼 시가총액 상위 1,400.
const _MS_SWAP_STAGES = new Set(['top', 'turn']);
const _MS_SWAP_MAX = 5, _MS_UNIVERSE = 1400;

function _msCompanies() {
  if (!CACHE.msCompanies) {
    CACHE.msCompanies = fetchPagesParallel(
      (a, b) => sb.from('companies').select('code,name,wics_code,wics_industry,sub_industry')
        .eq('active', true).order('code').range(a, b),
      sb.from('companies').select('code', { count: 'exact', head: true }).eq('active', true))
      .then(rows => Object.fromEntries(rows.map(c => [c.code, c])))
      .catch(e => { console.warn('[교체후보] 기업 분류 조회 실패', e); CACHE.msCompanies = null; return null; });
  }
  return CACHE.msCompanies;
}

function _msMomentum(f) {
  const m = [];
  if (f.cons) m.push('컨센↑');
  if (f.nh) m.push('신고가');
  if (f.tvu) m.push('거래대금↑');
  if (f.cl) m.push('군집');
  if ((f.rs || 0) >= 70) m.push(`RS ${f.rs}`);
  return m;
}

function _msSwapCands(code, fv, comp, heldSet) {
  const me = comp?.[code];
  if (!me || !fv) return { basis: null, list: [] };
  const capRank = {};
  (INV.allMarketRows || []).filter(r => r.market_cap).sort((a, b) => b.market_cap - a.market_cap)
    .forEach((r, i) => { capRank[r.stock_code] = i + 1; });
  const hasCap = Object.keys(capRank).length > 0;
  const levels = [
    ['같은 테마', c => me.sub_industry && c.sub_industry === me.sub_industry],
    [`같은 업종(${me.wics_industry || 'WICS 소분류'})`, c => me.wics_code && c.wics_code === me.wics_code],
    ['같은 WICS 중분류', c => me.wics_code && (c.wics_code || '').slice(0, 5) === me.wics_code.slice(0, 5)],
  ];
  for (const [basis, same] of levels) {
    const list = Object.values(comp)
      .filter(c => c.code !== code && !heldSet.has(c.code) && same(c)
        && (!hasCap || (capRank[c.code] != null && capRank[c.code] <= _MS_UNIVERSE)))
      .map(c => ({ c, v: fv.byCode[c.code] }))
      .filter(x => x.v && flowIsEmpty(x.v.flow_gauge, x.v.flow_pctl))
      .map(x => {
        const f = x.v.lead_flags || {};
        const gg = x.v.flow_gauge ? flowGauge(x.v.flow_gauge) : null;
        const te = typeof taerinEval === 'function' ? taerinEval(x.v.flow_gauge, x.v.lead_flags, x.v.flow_pctl) : null;
        return { code: x.c.code, name: x.c.name, pctl: x.v.flow_pctl, gg, mom: _msMomentum(f), lead: !!f.lead, te };
      })
      .filter(x => x.mom.length)
      .sort((a, b) => ((b.te?.a ? 2 : 0) + (b.gg?.key === 'start' ? 1 : 0)) - ((a.te?.a ? 2 : 0) + (a.gg?.key === 'start' ? 1 : 0))
        || b.mom.length - a.mom.length || (a.gg?.fill ?? 9) - (b.gg?.fill ?? 9) || a.pctl - b.pctl);
    if (list.length) return { basis, list: list.slice(0, _MS_SWAP_MAX), total: list.length };
  }
  return { basis: null, list: [], total: 0 };
}

function toggleMsRule(code) {
  _msRuleOpen = _msRuleOpen === code ? null : code;
  _renderMyStocks();
}

function _msStageHTML(v) {
  const gg = v?.flow_gauge ? flowGauge(v.flow_gauge) : null;
  if (!gg) return '';
  return `<span data-no-detail title="${escAttr('수급 오실레이터 ' + flowGaugeTip(v.flow_gauge, gg))}" `
    + `style="font-size:calc(11px*var(--m-label));white-space:nowrap;flex-shrink:1;min-width:0;overflow:hidden;text-overflow:ellipsis">${flowGaugeBar(gg)} `
    + `<span style="color:${gg.color};font-weight:600">${gg.label}</span></span>`;
}

function _msSwapRows(it, sw) {
  const rows = sw.list.map(x => `
    <div class="stock-row" data-stock-open="${x.code}" data-stock-name="${escAttr(x.name)}" data-stock-tab="market"
      style="display:flex;align-items:center;gap:8px;padding:5px 14px 5px 28px;border-top:1px dashed var(--border)">
      <span style="font-size:calc(12px*var(--m-sub));color:var(--text1);flex-shrink:0;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(x.name)}</span>
      ${x.te?.a ? `<span title="태린 후보 A — 주도 업종 ∧ 수급 빈 ∧ 확률 조건" style="font-size:calc(10.5px*var(--m-label));font-weight:800;padding:0 5px;border-radius:3px;background:rgba(245,158,11,.18);color:#f59e0b;flex-shrink:0">A</span>` : ''}
      <span style="font-size:calc(11px*var(--m-label));white-space:nowrap;flex-shrink:0">${x.gg ? flowGaugeBar(x.gg) + ` <span style="color:${x.gg.color};font-weight:600">${x.gg.label}</span>` : ''}</span>
      <span style="font-size:calc(11px*var(--m-label));color:var(--text1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0">${escapeHtml(x.mom.join(' · '))}${x.lead ? ' <span style="color:#f59e0b">· 주도 업종</span>' : ''}</span>
    </div>`).join('');
  return `<div style="padding:0 14px 4px 28px;font-size:calc(11px*var(--m-label));color:var(--text2)">
      수급이 ${escapeHtml(it.gg.label)} —
      ${sw.basis ? `${escapeHtml(sw.basis)}에서 수급이 비어 있고 모멘텀이 있는 종목 ${sw.total}개${sw.total > sw.list.length ? ` 중 ${sw.list.length}개` : ''}` : '같은 테마·업종에 조건에 맞는 종목이 없습니다'}
      <span style="color:var(--text3)">(태린이아빠 09-19 회원 영상의 교체 방식 · 시총 상위 ${_MS_UNIVERSE})</span>
    </div>${rows}`;
}

// 매매 규칙 패널 — 원저자 '일관성' 시트 매도 조건 점검(config.js holdRules) + 교체 후보
function _msRulePanel(it) {
  const hr = it.hr, sw = it.swap;
  const fs = 'font-size:calc(11px*var(--m-label))';
  const sub = t => `<div style="padding:5px 14px 1px 28px;${fs};font-weight:600;color:var(--text2)">${t}</div>`;
  const row = r => {
    const hit = r.on && r.hit;
    const st = !r.on ? `<span style="color:var(--text3)">${escapeHtml(r.off || '')}</span>`
      : hit ? '<b style="color:#fb6340">해당</b>' : '<span style="color:var(--text2)">아님</span>';
    return `<div style="display:flex;align-items:center;gap:8px;padding:1px 14px 1px 28px;${fs}">
      <span style="width:10px;flex-shrink:0;color:${hit ? '#fb6340' : 'var(--text3)'}">${hit ? '●' : '○'}</span>
      <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${r.on ? 'var(--text1)' : 'var(--text3)'}">${escapeHtml(r.name)}${r.val ? ` <span style="color:var(--text3)">(${escapeHtml(r.val)})</span>` : ''}</span>
      <span style="flex-shrink:0">${st}</span>
    </div>`;
  };
  let h = '';
  if (hr) {
    const ctx = [hr.trend ? HOLD_TREND_LABEL[hr.trend] : '추세 판정 불가(60거래일 미만)',
                 hr.gg ? `수급 ${hr.gg.fill}/5칸 ${hr.gg.up ? '↑' : '↓'} ${hr.gg.label}` : '수급 칸 없음'].join(' · ');
    h += `<div style="padding:6px 14px 0 28px;${fs};color:var(--text2)">
        <b style="color:var(--text1)">${escapeHtml(it.name)}</b> 매도 조건 점검 — ${escapeHtml(ctx)}</div>`
      + sub('(1) 신고가 후 밀리는 음봉 · 주봉') + hr.rules.filter(r => r.g === 1).map(row).join('')
      + sub('(2) 수급 과열권 + 이평선 이탈') + hr.rules.filter(r => r.g === 2).map(row).join('')
      + (hr.keep ? `<div style="padding:2px 14px 0 46px;${fs};color:var(--text2)">과열권이지만 선을 지키는 중 — 원저자 기준으로는 그대로 두는 구간</div>` : '')
      + (hr.patience ? `<div style="padding:2px 14px 0 46px;${fs};color:#f59e0b">주도 업종 · 최근 5거래일 안 52주 신고가 · 수급 내려가는 중 — 원저자가 '한 번 참아볼 만하다'고 한 구간</div>` : '');
  } else {
    h += `<div style="padding:6px 14px 0 28px;${fs};color:var(--text3)">매도 조건 재료가 아직 없습니다 (평일 18:50 수급 판정 때 함께 계산)</div>`;
  }
  h += sub('(3) 더 나은 종목이 나오면 교체')
    + (sw ? _msSwapRows(it, sw)
          : `<div style="padding:0 14px 2px 28px;${fs};color:var(--text3)">수급이 다 찼다·꺾임일 때 같은 테마·업종에서 수급이 빈 종목을 찾습니다${it.gg ? ` — 지금 ${escapeHtml(it.gg.label)}` : ''}</div>`);
  h += `<div style="padding:6px 14px 8px 28px;${fs};color:var(--text3);line-height:1.5">
      태린이아빠 「외국인기관수급오실레이터」 '일관성' 시트의 종목 매도 규칙을 판정일 종가로 점검한 것.
      원본에 수치가 없어 정한 기준: 과열권 = 수급 칸 4개 이상 · 추세 = 20일선과 60일선 · 신고가 '후' = 3거래일 안 · 직전 양봉 = 앞 4주 안.</div>`;
  return `<div style="background:var(--bg2)">${h}</div>`;
}

// 보유 종목 줄의 매매 규칙 칩 — 매도 조건 해당 > 교체 후보 > 과열·선 지킴 > 참아볼 구간 > 점검
function _msRuleChip(it) {
  const hr = it.hr, sw = it.swap;
  if (!hr && !sw) return '';
  const n = hr?.hits.length || 0;
  const [label, color, tip] = n ? [`매도 조건 ${n}`, '#fb6340', hr.hits.map(r => r.name).join(' · ')]
    : sw ? [`교체 후보 ${sw.total}`, '', '같은 테마·업종에서 수급이 비어 있고 모멘텀이 있는 종목']
    : hr.keep ? ['과열 · 선 지킴', '', '수급 과열권이지만 이평선을 지키는 중']
    : hr.patience ? ['참아볼 구간', '#f59e0b', '주도 업종 신고가 중 수급 하락 — 원저자 예외 구간']
    : ['매도 조건 0', 'var(--text3)', '원저자 매도 조건 중 해당 없음'];
  const open = _msRuleOpen === it.code;   // 펼친 칩은 active 배경 — 강조색 글자를 빼야 읽힌다
  return `<button class="chip chip-sm ${open ? 'active' : ''}" data-no-detail
        onclick="toggleMsRule('${escJsStr(it.code)}')" title="${escAttr(tip + ' — 눌러서 매매 규칙 점검')}"
        style="flex-shrink:0${color && !open ? `;color:${color}` : ''}">${label}${n && sw ? ` · 교체 ${sw.total}` : ''}</button>`;
}

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

  // 오류와 빈 목록 분리 — RLS/네트워크 오류를 "종목 없음"으로 오인시키지 않는다
  if (wlErr) {
    body.innerHTML = errorHTML('내 종목 로드 실패: ' + wlErr.message);
    return;
  }
  if (!wlRows?.length) {
    body.innerHTML = '<div style="padding:1.2rem;text-align:center;color:var(--text2);font-size:calc(12px*var(--m-sub))">보유/관심 종목을 추가하면 현황이 표시됩니다</div>';
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

  const [discRes, reportRes, fv, comp] = await Promise.all([
    sb.from('daily_disclosures')
      .select('corp_name,report_nm,rcept_no,category')
      .eq('base_date', todayKst),
    sb.from('dart_reports')
      .select('stock_code,stock_name,report_type,receive_date,summary')
      .in('stock_code', stockCodes)
      .gte('receive_date', daysAgo30)
      .order('receive_date', { ascending: false })
      .limit(30),
    getFlowVerdicts(),   // 수급 단계·빈집 — 기업분석 표와 같은 캐시
    _msCompanies(),      // 교체 후보의 같은 테마·업종 찾기
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

  _myStocksData = { wlRows, discsByCode, reportsByCode, nameToWl, todayKst, fv, comp };
  _renderMyStocks();
}

// 종목당 한 줄 렌더 (시세·공시·보고서 결합) — 시세가 늦게 와도 재호출로 갱신
function _renderMyStocks() {
  const body = document.getElementById('ms-body');
  if (!body || !_myStocksData) return;

  const { wlRows, discsByCode, reportsByCode, todayKst, fv, comp } = _myStocksData;
  const heldSet = new Set(wlRows.filter(w => w.group_name === '보유중').map(w => w.stock_code));
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
      fvRow: fv?.byCode?.[wl.stock_code],
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

  // 교체 검토 — 보유 종목 수급이 다 찼다·꺾임 / 매도 조건 — 원저자 '일관성' 시트(config.js holdRules)
  items.forEach(it => {
    it.gg = it.fvRow?.flow_gauge ? flowGauge(it.fvRow.flow_gauge) : null;
    it.swap = it.held && it.gg && _MS_SWAP_STAGES.has(it.gg.key) ? _msSwapCands(it.code, fv, comp, heldSet) : null;
    it.hr = it.held ? holdRules(it.fvRow) : null;
  });
  const swapCnt = items.filter(i => i.swap).length;
  const sellCnt = items.filter(i => i.hr?.hits.length).length;
  const eventCnt = items.filter(i => i.hasEvent).length;
  const priceReady = allRows.length > 0;

  const rows = items.map(it => {

    // 등락률
    const chgHTML = it.chg != null
      ? `<span style="font-size:calc(12px*var(--m-sub));font-weight:700;color:${chgColor(it.chg)};flex-shrink:0;min-width:52px;text-align:right">${chgStr(it.chg)}</span>`
      : `<span style="font-size:calc(11px*var(--m-label));color:var(--text3);flex-shrink:0;min-width:52px;text-align:right">${priceReady ? '—' : '·'}</span>`;

    // 공시 — 카테고리 배지 + 공시 제목(첫 건), 추가 건은 +N. 클릭 시 DART
    let discHTML = '';
    if (it.discs.length) {
      const d0   = it.discs[0];
      const s    = _msCatStyle(d0.category || '기타');
      const link = d0.rcept_no ? `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${d0.rcept_no}` : null;
      const click = link ? `onclick="event.stopPropagation();window.open('${link}','_blank')"` : '';
      const more  = it.discs.length > 1
        ? `<span style="font-size:calc(11px*var(--m-label));color:var(--text3);flex-shrink:0">+${it.discs.length - 1}</span>` : '';
      discHTML = `
        <span ${click} style="font-size:calc(11px*var(--m-label));padding:1px 6px;border-radius:3px;font-weight:600;white-space:nowrap;flex-shrink:0;
          background:${s.bg};color:${s.c};cursor:${link ? 'pointer' : 'default'}">${escapeHtml(d0.category || '공시')}</span>
        <span ${click} title="${escAttr(d0.report_nm || '')}"
          style="font-size:calc(11px*var(--m-label));color:var(--text1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;cursor:${link ? 'pointer' : 'default'}">${escapeHtml(d0.report_nm || '공시')}</span>
        ${more}`;
    }

    // 최근 보고서 배지 (최신 1건 날짜) — 행 클릭으로 상세 진입
    let reportHTML = '';
    if (it.reports.length) {
      const latest = it.reports[0];
      const md = (latest.receive_date || '').slice(5).replace('-', '/');
      reportHTML = `<span title="${escAttr(latest.report_type || 'DART 분석 보고서')}"
        style="font-size:calc(11px*var(--m-label));padding:1px 6px;border-radius:3px;font-weight:600;white-space:nowrap;flex-shrink:0;
        background:rgba(42,171,238,.13);color:#2AABEE">📄 리포트${md ? ' ' + md : ''}${it.reports.length > 1 ? ` +${it.reports.length - 1}` : ''}</span>`;
    }

    return `
    <div class="stock-row" data-stock-open="${it.code}" data-stock-name="${escAttr(it.name)}" data-stock-tab="market"
      style="display:flex;align-items:center;gap:8px;padding:7px 14px 7px 12px;border-top:1px solid var(--border);
      border-left:2px solid ${it.hasEvent ? 'var(--tg)' : 'transparent'}">
      <span style="font-size:calc(12px*var(--m-sub));font-weight:500;color:var(--text1);flex-shrink:0;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(it.name)}</span>
      <span style="font-size:calc(11px*var(--m-label));padding:1px 5px;border-radius:3px;font-weight:700;flex-shrink:0;
        background:${it.held?'rgba(245,58,92,.13)':'rgba(255,255,255,.06)'};
        color:${it.held?'var(--red)':'var(--text2)'}">${it.held?'보유':'관심'}</span>
      ${chgHTML}
      ${_msStageHTML(it.fvRow)}
      ${_msRuleChip(it)}
      <div style="display:flex;align-items:center;gap:5px;flex:1;min-width:0;overflow:hidden">
        ${discHTML}${reportHTML}
      </div>
    </div>${(it.hr || it.swap) && _msRuleOpen === it.code ? _msRulePanel(it) : ''}`;
  }).join('');

  const header = `<div style="display:flex;align-items:center;gap:6px;padding:7px 14px 7px 12px;font-size:calc(11px*var(--m-label));color:var(--text2)">
    <span style="width:2px;height:11px;background:var(--tg);border-radius:2px;flex-shrink:0"></span>
    ${eventCnt ? `오늘 <b style="color:var(--text1)">${eventCnt}</b>종목에 공시·리포트` : '오늘 공시·리포트 있는 종목 없음'}
    ${sellCnt ? `<span style="color:var(--border)">·</span> <span title="원저자 '일관성' 시트 매도 조건에 해당하는 보유 종목 — 매도 조건 버튼에서 확인">매도 조건 <b style="color:#fb6340">${sellCnt}</b>종목</span>` : ''}
    ${swapCnt ? `<span style="color:var(--border)">·</span> <span title="보유 종목 수급 오실레이터가 다 찼다·꺾임 — 교체 후보 버튼에서 확인">교체 검토 <b style="color:#fb6340">${swapCnt}</b>종목</span>` : ''}
    <span style="color:var(--text3);margin-left:auto">${todayKst} 기준 · 리포트 30일${fv?.date ? ` · 수급 ${fv.date}` : ''}</span>
  </div>`;

  body.innerHTML = header + rows;
}


// ── 시황/공시/급등 로직은 분리된 파일에서 로드 ──
// market-overview.js    : loadMacroData, loadTrendChart, loadMarketOverview
// fear-greed.js         : loadFearGreed, setFgMarket (최상단 피어앤그리드)
// disclosure.js         : loadTodayDisclosures, loadAllDisclosures, toggleAllDisclosures
// taerin-picks.js       : loadTaerinPicks, renderTaerinPicks, setTpFilter (오늘의 아이디어)
