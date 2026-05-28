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

// ── 페이지 HTML ──
function pInvestment() {
  window._invTab = window._invTab || 'market';
  return `
  <!-- 탭 헤더 -->
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;flex-wrap:wrap;gap:8px">
    <div style="display:flex;gap:6px">
      <button class="chip ${window._invTab==='market'?'active':''}" onclick="setInvTab('market')">📊 시황</button>
      <button class="chip ${window._invTab==='disclosure'?'active':''}" onclick="setInvTab('disclosure')">📋 공시</button>
    </div>
    <div style="display:flex;align-items:center;gap:8px">
      <div style="font-size:11px;color:var(--text3)" id="inv-date"></div>
      <button class="btn btn-sm" id="inv-refresh-btn" onclick="refreshInvestment()">🔄 새로고침</button>
    </div>
  </div>

  <!-- 시황 탭 -->
  <div id="inv-tab-market" style="display:${window._invTab==='market'?'block':'none'}">

    <!-- ① 증시 동향 (최상단) -->
    <div class="card" style="margin-bottom:12px">
      <div class="card-header" style="flex-wrap:wrap;gap:6px">
        <span class="card-title">📊 증시 동향</span>
        <div id="inv-banner-content" style="display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-left:auto">
          <span style="color:var(--text3);font-size:12px"><span class="loading"></span></span>
        </div>
      </div>
      <!-- 전체 집계 + 코스피/코스닥 지수 한 행 -->
      <div id="inv-total-summary" style="padding:.75rem 1rem;border-bottom:1px solid var(--border)"></div>
      <div id="inv-industry-grid"></div>
    </div>

    <!-- 💡 투자포인트 요약 -->
    <div class="card insight-card" style="margin-bottom:12px">
      <div class="card-header" style="justify-content:space-between">
        <span class="card-title">💡 투자포인트 요약</span>
        <button class="chip" style="font-size:11px;padding:2px 8px"
          onclick="loadMarketInsight()">🔄 재분석</button>
      </div>
      <div class="card-body" style="padding:.75rem 1rem" id="market-insight-card">
        <div style="color:var(--text3);font-size:12px"><span class="loading"></span> 분석 중...</div>
      </div>
    </div>

    <!-- 📈 흐름 비교 차트 (접기/펼치기) -->
    <div class="card" style="margin-bottom:12px">
      <div class="card-header" style="cursor:pointer" onclick="toggleTrendChart()">
        <span class="card-title">📈 흐름 비교 차트</span>
        <span id="inv-trend-toggle" style="font-size:12px;color:var(--text3);margin-left:auto">펼치기 ▾</span>
      </div>
      <div id="inv-trend-body" style="display:none">
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
          <span style="font-size:11px;color:var(--text3);margin-right:4px">그룹선택</span>
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
              <span style="font-size:10px;color:var(--text3)">${m.group}</span>
            </label>
          `).join('')}
        </div>
        <div style="padding:1rem;position:relative;height:260px">
          <canvas id="inv-trend-chart"></canvas>
          <div id="inv-trend-empty" style="display:none;position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--text3);font-size:13px">
            데이터 수집 중... (매일 09:00, 16:10 업데이트)
          </div>
        </div>
      </div>
    </div>

    <!-- 📈 52주 신고가 종목 -->
    <div class="card" style="margin-bottom:12px">
      <div class="card-header" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span class="card-title">📈 52주 신고가 종목</span>
        <div style="display:flex;gap:4px;margin-left:auto">
          <button class="chip active" data-hgpr-tab="monitored" onclick="switchHgprTab('monitored')" style="font-size:11px;padding:2px 8px">⭐ 모니터링</button>
          <button class="chip"        data-hgpr-tab="all"       onclick="switchHgprTab('all')"       style="font-size:11px;padding:2px 8px">전체 종목</button>
        </div>
      </div>
      <div id="hgpr-body" style="padding:.5rem 0">
        <div style="padding:1rem;color:var(--text3);font-size:12px;text-align:center">
          <span class="loading"></span> 신고가 데이터 로딩 중...
        </div>
      </div>
    </div>

    <!-- 💰 기관/외국인 수급 -->
    <div class="card" style="margin-bottom:12px">
      <div class="card-header" style="display:flex;align-items:center;gap:8px">
        <span class="card-title">💰 기관/외국인 수급</span>
        <span style="font-size:11px;color:var(--text3)">장중 집계 기준 (09:35·11:25·13:25·14:35)</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border-top:1px solid var(--border)">
        <div>
          <div style="padding:6px 10px;font-size:11px;font-weight:600;color:var(--text2);background:var(--bg2);border-bottom:1px solid var(--border)">
            🔀 동시매수 <span style="font-size:10px;color:var(--text3);font-weight:400">외국인+기관</span>
          </div>
          <div id="flow-body-both"><div style="padding:1.5rem;text-align:center;color:var(--text3)"><span class="loading"></span></div></div>
        </div>
        <div style="border-left:1px solid var(--border)">
          <div style="padding:6px 10px;font-size:11px;font-weight:600;color:var(--tg);background:var(--bg2);border-bottom:1px solid var(--border)">
            🌏 외국인 순매수
          </div>
          <div id="flow-body-frgn"><div style="padding:1.5rem;text-align:center;color:var(--text3)"><span class="loading"></span></div></div>
        </div>
        <div style="border-left:1px solid var(--border)">
          <div style="padding:6px 10px;font-size:11px;font-weight:600;color:var(--yellow);background:var(--bg2);border-bottom:1px solid var(--border)">
            🏢 기관 순매수
          </div>
          <div id="flow-body-orgn"><div style="padding:1.5rem;text-align:center;color:var(--text3)"><span class="loading"></span></div></div>
        </div>
      </div>
    </div>

    <!-- 🔴🔵 급등/급락 — 2×2 그리드 (코스피 행 / 코스닥 행) -->
    <div class="surge-drop-grid">
      <div class="card" style="margin-bottom:0">
        <div class="card-header"><span class="card-title">🔴 코스피 급등</span></div>
        <div id="inv-surge-kospi" style="padding:.5rem 0"></div>
      </div>
      <div class="card" style="margin-bottom:0">
        <div class="card-header"><span class="card-title">🔵 코스피 급락</span></div>
        <div id="inv-drop-kospi" style="padding:.5rem 0"></div>
      </div>
      <div class="card" style="margin-bottom:0">
        <div class="card-header"><span class="card-title">🔴 코스닥 급등</span></div>
        <div id="inv-surge-kosdaq" style="padding:.5rem 0"></div>
      </div>
      <div class="card" style="margin-bottom:0">
        <div class="card-header"><span class="card-title">🔵 코스닥 급락</span></div>
        <div id="inv-drop-kosdaq" style="padding:.5rem 0"></div>
      </div>
    </div>

    <!-- 🇰🇷 산업 동향 — 별도 카드 -->
    <div class="card" style="margin-bottom:12px">
      <div class="card-header" style="flex-wrap:wrap;gap:4px;padding-bottom:6px">
        <span class="card-title">🇰🇷 산업 동향</span>
        <!-- US ETF 배너 -->
        <div id="inv-etf-banner" style="display:flex;gap:10px;align-items:center;margin-left:auto;font-size:12px;flex-wrap:wrap">
          <span style="color:var(--text3)"><span class="loading"></span></span>
        </div>
      </div>
      <!-- KR 모니터링 현황 -->
      <div id="inv-industry-banner" style="padding:4px 1rem 6px;border-bottom:1px solid var(--border);font-size:12px;display:flex;gap:10px;color:var(--text3)">
        <span><span class="loading"></span></span>
      </div>
      <div id="inv-industry-chart"></div>
    </div>

    <!-- 📈 산업별 흐름 비교 -->
    <div class="card" style="margin-bottom:12px">
      <div class="card-header" style="flex-wrap:wrap;gap:6px">
        <span class="card-title">📈 산업별 흐름 비교</span>
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

    <!-- 🌐 US vs KR 산업 비교 차트 -->
    <div class="card" style="margin-bottom:12px">
      <div class="card-header" style="flex-wrap:wrap;gap:6px">
        <span class="card-title">🌐 US vs KR 산업 비교</span>
        <div style="display:flex;gap:4px;margin-left:auto">
          ${[{d:7,l:'1주'},{d:30,l:'1달'},{d:90,l:'3달'}].map(({d,l})=>`
            <button class="chip ${d===7?'active':''}" data-uskr-period="${d}"
              onclick="setUskrPeriod(${d})" style="font-size:11px;padding:2px 8px">${l}</button>
          `).join('')}
        </div>
      </div>
      <!-- 산업 선택 (하나 선택 → KR+US 1:1 비교) -->
      <div style="padding:.5rem 1rem;border-bottom:1px solid var(--border);display:flex;flex-wrap:wrap;gap:6px;align-items:center">
        ${KR_INDUSTRIES.map((ind,i)=>`
          <button class="chip ${i===0?'active':''}" id="uskr-btn-${ind}"
            onclick="selectUskrInd('${ind}')"
            style="font-size:12px;padding:3px 10px">${ind}</button>
        `).join('')}
      </div>
      <!-- 모드 전환 버튼 -->
      <div style="padding:.4rem 1rem;border-bottom:1px solid var(--border);display:flex;gap:6px;align-items:center">
        <span style="font-size:11px;color:var(--text3)">표시 방식</span>
        <button class="chip active" id="uskr-mode-avg" onclick="setUskrMode('avg')"
          style="font-size:11px;padding:2px 8px">KR vs US 평균</button>
        <button class="chip" id="uskr-mode-all" onclick="setUskrMode('all')"
          style="font-size:11px;padding:2px 8px">KR + 개별 ETF 전체</button>
      </div>
      <div style="padding:1rem;position:relative;height:320px">
        <canvas id="uskr-chart"></canvas>
      </div>
    </div>

  </div>

  <!-- 공시 탭 -->
  <div id="inv-tab-disclosure" style="display:${window._invTab==='disclosure'?'block':'none'}">

    <!-- 오늘 실적 공시 -->
    <div class="card" style="margin-bottom:1.25rem">
      <div class="card-header">
        <span class="card-title">📋 오늘 실적 공시 종목</span>
        <span id="inv-disclosure-date" style="font-size:11px;color:var(--text3);margin-left:8px"></span>
        <button id="inv-disclosure-expand-btn" class="btn btn-sm" style="margin-left:auto;font-size:12px"
          onclick="toggleAllDisclosures()">+ 전체 공시</button>
      </div>
      <div id="inv-disclosure-list" style="padding:.5rem 0">
        <div style="padding:1.5rem;text-align:center;color:var(--text3);font-size:12px"><span class="loading"></span></div>
      </div>
      <!-- 전체 공시 펼침 영역 -->
      <div id="inv-all-disclosure" style="display:none;border-top:1px solid var(--border)">
        <div id="inv-all-disclosure-list" style="padding:.5rem 0">
          <div style="padding:1.5rem;text-align:center;color:var(--text3);font-size:12px"><span class="loading"></span></div>
        </div>
      </div>
    </div>

    <!-- 실적 급등 종목 -->
    <div class="card" style="margin-bottom:1.25rem">
      <div class="card-header" style="flex-wrap:wrap;gap:8px;align-items:center">
        <span class="card-title">🚀 실적 급등 종목</span>
        <div style="display:flex;align-items:center;gap:6px;margin-left:auto;flex-wrap:wrap">
          <div style="display:flex;gap:4px">
            <button class="chip active" data-surge-grade="all"   onclick="setSurgeGrade(this,'all')"  style="font-size:12px">전체</button>
            <button class="chip"        data-surge-grade="S"    onclick="setSurgeGrade(this,'S')"   style="font-size:12px">S급</button>
            <button class="chip"        data-surge-grade="A"    onclick="setSurgeGrade(this,'A')"   style="font-size:12px">A급</button>
            <button class="chip"        data-surge-grade="B"    onclick="setSurgeGrade(this,'B')"   style="font-size:12px">B급</button>
            <button class="chip"        data-surge-grade="관찰"    onclick="setSurgeGrade(this,'관찰')"   style="font-size:12px">관찰</button>
          </div>
          <select class="form-select" id="inv-earnings-quarter" style="width:130px;padding:3px 8px;font-size:12px"
            onchange="loadEarningsSurge()">
            <option value="">로딩 중...</option>
          </select>
        </div>
      </div>
      <div id="inv-earnings-list" style="padding:.5rem 0">
        <div style="padding:1.5rem;text-align:center;color:var(--text3);font-size:12px"><span class="loading"></span></div>
      </div>
    </div>
  </div>`;
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
    <div style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--text2);margin-bottom:3px;font-weight:500">
      ${rs ? `<span style="font-size:11px">${rs.icon}</span>` : ''}
      <span>${label}</span>
    </div>
    <div style="font-size:15px;font-weight:700;color:${rs?'var(--text1)':'var(--text1)'};line-height:1.2">${val}</div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px">
      <div style="font-size:12px;color:${cc};font-weight:600">${cs}</div>
      ${sub ? `<div style="font-size:10px;color:var(--text2)">${sub}</div>` : ''}
    </div>
  </div>`;
}

// ── 탭 전환 ──
function setInvTab(tab) {
  window._invTab = tab;
  document.querySelectorAll('.chip[onclick*="setInvTab"]').forEach(b =>
    b.classList.toggle('active', b.textContent.includes(tab === 'market' ? '시황' : '공시')));
  document.getElementById('inv-tab-market').style.display     = tab === 'market'     ? 'block' : 'none';
  document.getElementById('inv-tab-disclosure').style.display = tab === 'disclosure' ? 'block' : 'none';
  if (tab === 'disclosure') {
    _allDiscLoaded = false;  // 탭 재진입 시 전체공시 재로드 허용
    loadTodayDisclosures();
    loadEarningsSurge();
  }
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

  // 공시 탭이 활성화된 경우에만 로드
  if (window._invTab === 'disclosure') {
    _allDiscLoaded = false;  // 새로고침 시 전체공시 재로드 허용
    loadTodayDisclosures();
    loadEarningsSurge();
  }

  const maxDate = await getLatestMarketDate();
  if (!maxDate) return;

  // 전체 종목 + 산업별 동향 (내부에서 window._allMarketRows 세팅)
  await loadMarketOverview(maxDate);

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
      `<span style="color:var(--text3)">모니터링 ${rows.length}개</span>`,
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
  const _all = (window._allMarketRows || []).filter(r => r.price_change_rate != null);
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
    <div style="display:flex;align-items:center;gap:8px;padding:6px 12px;border-bottom:1px solid var(--border)">
      <span style="width:16px;font-size:11px;color:var(--text3);font-weight:600">${i+1}</span>
      <span style="flex:1;font-size:13px;font-weight:500">${r.corp_name}</span>
      <span style="font-size:13px;font-weight:600;color:${chgColor(r.price_change_rate)}">${chgStr(r.price_change_rate)}</span>
    </div>`;

  const setCard = (id, data) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = (data || []).map(rankRow).join('') || '<div style="padding:12px;color:var(--text3);font-size:12px;text-align:center">데이터 없음</div>';
  };
  setCard('inv-surge-kospi',  surgeKospi  || []);
  setCard('inv-drop-kospi',   dropKospi   || []);
  setCard('inv-surge-kosdaq', surgeKosdaq || []);
  setCard('inv-drop-kosdaq',  dropKosdaq  || []);
}


// ── 시황/공시/급등 로직은 분리된 파일에서 로드 ──
// market-overview.js : loadMacroData, loadTrendChart, loadMarketOverview
// disclosure.js      : loadTodayDisclosures, loadAllDisclosures, toggleAllDisclosures
// earnings-surge.js  : loadEarningsSurge, renderSurgeList, setSurgeGrade 등
