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

    <!-- 🇰🇷 산업 동향 — 별도 카드 -->
    <div class="card" style="margin-bottom:12px">
      <div class="card-header" style="flex-wrap:wrap;gap:6px">
        <span class="card-title">🇰🇷 산업 동향</span>
        <div id="inv-industry-banner" style="display:flex;gap:14px;align-items:center;margin-left:auto;font-size:12px">
          <span style="color:var(--text3)"><span class="loading"></span></span>
        </div>
      </div>
      <div id="inv-industry-chart"></div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
      <div class="card">
        <div class="card-header"><span class="card-title">🔴 코스피 급등</span></div>
        <div id="inv-surge-kospi" style="padding:.5rem 0"></div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">🔵 코스피 급락</span></div>
        <div id="inv-drop-kospi" style="padding:.5rem 0"></div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">🔴 코스닥 급등</span></div>
        <div id="inv-surge-kosdaq" style="padding:.5rem 0"></div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">🔵 코스닥 급락</span></div>
        <div id="inv-drop-kosdaq" style="padding:.5rem 0"></div>
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
function mkIndexCard(label, value, chg, unit, sub) {
  const cc  = chg != null ? chgColor(chg) : 'var(--text2)';
  const cs  = chg != null ? chgStr(chg) : '—';
  const val = value != null ? Number(value).toLocaleString() + (unit||'') : '—';
  return `
  <div class="card" style="padding:10px 12px">
    <div style="font-size:10px;color:var(--text2);margin-bottom:3px;font-weight:500">${label}</div>
    <div style="font-size:15px;font-weight:700;color:var(--text1);line-height:1.2">${val}</div>
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
  const date = now.toLocaleDateString('ko-KR', {year:'2-digit',month:'2-digit',day:'2-digit'}).replace(/\. /g,'-').replace('.','');
  const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  el.textContent = `기준: ${date} ${time}`;
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
      try {
        await Promise.all([
          sb.from('app_config').upsert({
            key: 'run_macro_flag', value: String(Date.now()),
            description: '대시보드 매크로 수동 수집 트리거'
          }, { onConflict: 'key' }),
          sb.from('app_config').upsert({
            key: 'run_market_all_flag', value: String(Date.now()),
            description: '대시보드 전체 종목 시장 데이터 수집 트리거'
          }, { onConflict: 'key' }),
        ]);
        toast('📡 서버 수집 요청 완료 — 약 1분 후 자동 반영됩니다', 'info');
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
        _updateInvTimestamp();
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
  _updateInvTimestamp();

  // 우상단 날짜 — 오늘 날짜 즉시 표시 (market_data 조회 전에도 보임)
  const _today = new Date();
  const todayStr = `${_today.getFullYear()}-${String(_today.getMonth()+1).padStart(2,'0')}-${String(_today.getDate()).padStart(2,'0')}`;
  const dateEl = document.getElementById('inv-date');
  if (dateEl) dateEl.textContent = `기준: ${todayStr}`;

  // 공시 탭이 활성화된 경우에만 로드
  if (window._invTab === 'disclosure') {
    _allDiscLoaded = false;  // 새로고침 시 전체공시 재로드 허용
    loadTodayDisclosures();
    loadEarningsSurge();
  }

  const maxDate = await getLatestMarketDate();
  if (!maxDate) return;

  // 전체 종목 + 산업별 동향
  loadMarketOverview(maxDate);

  // 모니터링 종목만 조회 — stock_code로 직접 필터
  const { data: monCodes } = await sb.from('companies')
    .select('code').eq('is_monitored', true);
  const monList = (monCodes || []).map(r => r.code.replace(/\.(KS|KQ)$/, ''));

  if (!monList.length) return;

  // Supabase in() 500개 제한 대응 — 청크로 분할 조회
  let mktRows = [];
  const chunk = 200;
  for (let i = 0; i < monList.length; i += chunk) {
    const { data } = await sb.from('market_data')
      .select('stock_code,corp_name,price,price_change_rate,market_cap,market')
      .eq('base_date', maxDate)
      .in('stock_code', monList.slice(i, i + chunk));
    if (data) mktRows = mktRows.concat(data);
  }

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

  // 전체 상장사 급등/급락 — 상위/하위 5개씩 별도 조회
  const [{ data: surgeKospi }, { data: dropKospi }, { data: surgeKosdaq }, { data: dropKosdaq }] =
    await Promise.all([
      sb.from('market_data').select('stock_code,corp_name,price_change_rate,market')
        .eq('base_date', maxDate).eq('market','KOSPI').not('price_change_rate','is',null)
        .order('price_change_rate', {ascending:false}).limit(5),
      sb.from('market_data').select('stock_code,corp_name,price_change_rate,market')
        .eq('base_date', maxDate).eq('market','KOSPI').not('price_change_rate','is',null)
        .order('price_change_rate', {ascending:true}).limit(5),
      sb.from('market_data').select('stock_code,corp_name,price_change_rate,market')
        .eq('base_date', maxDate).eq('market','KOSDAQ').not('price_change_rate','is',null)
        .order('price_change_rate', {ascending:false}).limit(5),
      sb.from('market_data').select('stock_code,corp_name,price_change_rate,market')
        .eq('base_date', maxDate).eq('market','KOSDAQ').not('price_change_rate','is',null)
        .order('price_change_rate', {ascending:true}).limit(5),
    ]);

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
  setCard('inv-surge-kospi',  surgeKospi);
  setCard('inv-drop-kospi',   dropKospi);
  setCard('inv-surge-kosdaq', surgeKosdaq);
  setCard('inv-drop-kosdaq',  dropKosdaq);
}


// ── 시황/공시/급등 로직은 분리된 파일에서 로드 ──
// market-overview.js : loadMacroData, loadTrendChart, loadMarketOverview
// disclosure.js      : loadTodayDisclosures, loadAllDisclosures, toggleAllDisclosures
// earnings-surge.js  : loadEarningsSurge, renderSurgeList, setSurgeGrade 등
