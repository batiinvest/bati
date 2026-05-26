// company.js — 모니터링 종목 관리 페이지
// DB: companies (code, name, industry, sub_industry, is_monitored)

// ── 변경사항 추적 ──────────────────────────────
let _monDirty = false;

function _monMarkDirty() {
  _monDirty = true;
  const btn = document.getElementById('mon-apply-btn');
  if (btn) { btn.style.opacity='1'; btn.disabled=false; }
  const badge = document.getElementById('mon-dirty-badge');
  if (badge) badge.style.display='inline-flex';
}

let _companyTab = 'monitoring';  // 'monitoring' | 'etf'

// ── 모니터링 탭 컨텐츠 ──
function _renderMonitoringTab() {
  return `
  <div id="company-tab-monitoring" style="display:grid;
    grid-template-columns:320px 1fr;gap:0;min-height:calc(100vh - 96px);align-items:start">
    <div style="border-right:1px solid var(--border);padding:1.25rem;position:sticky;top:45px;
      height:calc(100vh - 45px);overflow-y:auto;background:var(--bg2)">
      <div style="font-size:12px;font-weight:700;color:var(--text2);margin-bottom:12px">🔍 기업 검색</div>
      <div style="position:relative;margin-bottom:8px">
        <input type="text" id="mon-search" class="form-input"
          placeholder="종목명 또는 코드..."
          oninput="monSearch(this.value)"
          style="width:100%;box-sizing:border-box;padding-left:32px">
        <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text3)">🔍</span>
      </div>
      <div id="mon-search-results" style="margin-bottom:12px"></div>
      <div id="mon-add-panel" style="display:none;padding:12px;background:var(--bg3);border-radius:8px;margin-bottom:12px">
        <div style="font-size:12px;font-weight:600;margin-bottom:8px">추가할 위치 선택</div>
        <select id="mon-sel-industry" class="form-input" style="width:100%;margin-bottom:6px;font-size:13px"
          onchange="monUpdateSubSel()">
          <option value="">산업 선택...</option>
        </select>
        <select id="mon-sel-sub" class="form-input" style="width:100%;margin-bottom:8px;font-size:13px">
          <option value="">서브섹터 선택...</option>
        </select>
        <button class="btn btn-sm" style="width:100%;background:var(--tg);color:#fff" onclick="monAddSelected()">
          ✚ 모니터링에 추가
        </button>
        <div id="mon-sel-label" style="font-size:11px;color:var(--text3);margin-top:6px;text-align:center"></div>
      </div>
      <hr style="border:none;border-top:1px solid var(--border);margin:16px 0">
      <div style="font-size:12px;font-weight:700;color:var(--text2);margin-bottom:10px">🏗 산업 추가</div>
      <div style="display:flex;gap:6px;margin-bottom:8px">
        <input type="text" id="mon-new-industry" class="form-input" placeholder="새 산업명..."
          style="flex:1;font-size:12px" onkeydown="if(event.key==='Enter')monAddIndustry()">
        <button class="btn btn-sm" onclick="monAddIndustry()">추가</button>
      </div>
    </div>
    <div style="padding:1.25rem" id="mon-main">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px">
        <h2 style="font-size:16px;font-weight:700;margin:0">⭐ 모니터링 종목 관리</h2>
        <div style="display:flex;align-items:center;gap:10px">
          <span id="mon-dirty-badge" style="display:none;align-items:center;gap:4px;
            font-size:11px;padding:3px 8px;border-radius:100px;
            background:rgba(255,193,7,0.15);color:#ffc107;border:1px solid rgba(255,193,7,0.3)">
            ● 미적용 변경사항
          </span>
          <div style="font-size:12px;color:var(--text3)" id="mon-summary"></div>
          <button id="mon-apply-btn" onclick="monApply()"
            style="font-size:12px;font-weight:700;padding:6px 16px;border-radius:6px;
              border:none;cursor:pointer;background:var(--tg);color:#fff;
              opacity:0.4;transition:opacity .2s" disabled>
            ✅ 적용
          </button>
        </div>
      </div>
      <div id="mon-board">
        <div style="color:var(--text3);font-size:13px;padding:40px;text-align:center"><span class="loading"></span> 로딩 중...</div>
      </div>
    </div>
  </div>`;
}

// ── US 종목 관리 탭 컨텐츠 ──
function _renderEtfTab() {
  return `
  <div id="company-tab-etf" style="display:none;padding:1.25rem">
    <div class="card">
      <div class="card-header" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span class="card-title">🌐 US 종목 관리</span>
        <span style="font-size:12px;color:var(--text3)">KR 산업별 대응 US 종목 추가·삭제</span>
        <div style="display:flex;align-items:center;gap:8px;margin-left:auto">
          <span id="etf-dirty-badge" style="display:none;align-items:center;gap:4px;
            font-size:11px;padding:3px 8px;border-radius:100px;
            background:rgba(255,193,7,0.15);color:#ffc107;border:1px solid rgba(255,193,7,0.3)">
            ● 미적용 변경사항
          </span>
          <button id="etf-apply-btn" onclick="etfApply()"
            style="font-size:12px;font-weight:700;padding:6px 16px;border-radius:6px;
              border:none;cursor:pointer;background:var(--tg);color:#fff;
              opacity:0.4;transition:opacity .2s" disabled>
            ✅ 데이터 수집 적용
          </button>
        </div>
      </div>
      <div class="card-body" style="padding:0">
        <div id="etf-map-wrap">
          <div style="padding:1rem;color:var(--text3);font-size:13px">로딩 중...</div>
        </div>
      </div>
    </div>
  </div>`;
}

// ── 수집 스케줄 탭 ──────────────────────────────────────
function _renderScheduleTab() {
  const schedules = [
    // 장중
    { time:'06:10', job:'collect_macro',              label:'글로벌 매크로 수집 (미국 장 마감 직후)', group:'장전', color:'var(--tg)' },
    { time:'06:15', job:'collect_us_etf',             label:'US ETF 수집 (미국 장 마감 직후)',       group:'장전', color:'var(--tg)' },
    { time:'08:50', job:'naver_report',               label:'네이버 리포트 수집',                    group:'장전', color:'var(--text3)' },
    { time:'09:05', job:'kind_ir',                   label:'KIND IR자료 수집',                       group:'장전', color:'var(--text3)' },
    { time:'09:30', job:'collect_market',             label:'모니터링 종목 시장 데이터',     group:'장중', color:'#2dce89' },
    { time:'09:35', job:'collect_foreign_institution',label:'기관/외국인 가집계 (1차)',      group:'장중', color:'#fb923c' },
    { time:'11:25', job:'collect_foreign_institution',label:'기관/외국인 가집계 (2차)',      group:'장중', color:'#fb923c' },
    { time:'11:30', job:'lunch_briefing',             label:'점심 브리핑',                 group:'장중', color:'var(--text3)' },
    { time:'12:00', job:'collect_market',             label:'모니터링 종목 시장 데이터',     group:'장중', color:'#2dce89' },
    { time:'13:25', job:'collect_foreign_institution',label:'기관/외국인 가집계 (3차)',      group:'장중', color:'#fb923c' },
    { time:'14:35', job:'collect_foreign_institution',label:'기관/외국인 가집계 (4차)',      group:'장중', color:'#fb923c' },
    // 장후
    { time:'16:10', job:'collect_macro',              label:'매크로 수집 (장 마감 후)',      group:'장후', color:'var(--tg)' },
    { time:'16:20', job:'collect_us_etf',             label:'US ETF 수집 (미장 전일 종가)', group:'장후', color:'var(--tg)' },
    { time:'16:30', job:'collect_new_high',           label:'52주 신고가 종목 수집',         group:'장후', color:'#f5a623' },
    { time:'17:00', job:'collect_market_closing',     label:'전체 상장사 확정 시세 (외국인 집계 완료 후)', group:'장후', color:'#f5365c', badge:'핵심' },
    { time:'18:00', job:'naver_report',               label:'네이버 리포트 수집',            group:'장후', color:'var(--text3)' },
    { time:'18:05', job:'kind_ir',                   label:'KIND IR자료 수집',               group:'장후', color:'var(--text3)' },
    { time:'18:30', job:'daily_closing',              label:'일일 마감 브리핑',             group:'장후', color:'var(--text3)' },
    { time:'18:30', job:'collect_financials',         label:'재무제표 수집 (공시 기반)',      group:'장후', color:'#2dce89' },
    // 주말
    { time:'토 00:30', job:'cleanup_market_data',    label:'market_data 정리 (90일/28일 보존)', group:'주간', color:'var(--text3)' },
    { time:'토 01:00', job:'sync_listed_companies',  label:'상장사 동기화',                group:'주간', color:'var(--text3)' },
    { time:'토 10:00', job:'saturday_main_ranking',  label:'주간 랭킹 리포트',             group:'주간', color:'var(--text3)' },
    { time:'토 10:30', job:'saturday_industry',      label:'주간 산업별 리포트',           group:'주간', color:'var(--text3)' },
    { time:'일 10:00', job:'sunday_industry_recap',  label:'주간 업종 리뷰',              group:'주간', color:'var(--text3)' },
    { time:'일 10:30', job:'sunday_company',         label:'주간 기업 진단',              group:'주간', color:'var(--text3)' },
  ];

  const groups = ['장전','장중','장후','주간'];
  const groupColor = { '장전':'rgba(42,171,238,.1)', '장중':'rgba(45,206,137,.1)', '장후':'rgba(245,54,92,.08)', '주간':'rgba(255,255,255,.03)' };
  const groupLabel = { '장전':'🌅 장 시작 전', '장중':'📈 장중 (09:00~15:30)', '장후':'📊 장 마감 후', '주간':'📅 주간 정기' };

  const rows = groups.map(g => {
    const items = schedules.filter(s => s.group === g);
    return `
    <div style="margin-bottom:1rem">
      <div style="padding:6px 1rem;font-size:11px;font-weight:700;color:var(--text3);
        letter-spacing:.08em;background:${groupColor[g]};border-radius:6px 6px 0 0;
        border:1px solid rgba(255,255,255,.06);border-bottom:none">
        ${groupLabel[g]}
      </div>
      <div style="border:1px solid rgba(255,255,255,.06);border-radius:0 0 6px 6px;overflow:hidden">
        ${items.map((s, i) => `
          <div style="display:grid;grid-template-columns:80px 1fr auto;
            align-items:center;gap:12px;padding:9px 1rem;
            background:${i%2===0?'transparent':'rgba(255,255,255,.02)'};
            border-bottom:${i<items.length-1?'1px solid rgba(255,255,255,.04)':'none'}">
            <span style="font-family:monospace;font-size:13px;font-weight:600;color:${s.color}">${s.time}</span>
            <span style="font-size:13px;color:var(--text)">${s.label}</span>
            <div style="display:flex;align-items:center;gap:6px">
              ${s.badge ? `<span style="font-size:10px;padding:1px 6px;border-radius:3px;
                background:rgba(245,54,92,.2);color:#f5365c;font-weight:700">${s.badge}</span>` : ''}
              <span style="font-size:10px;color:var(--text3);font-family:monospace">${s.job}</span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>`;
  }).join('');

  return `
  <div id="company-tab-schedule" style="display:none;padding:1.25rem">
    <div class="card">
      <div class="card-header" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span class="card-title">📅 수집 스케줄</span>
        <span style="font-size:12px;color:var(--text3)">평일 자동 실행 기준 · 주말/공휴일 자동 스킵</span>
        <div style="margin-left:auto;font-size:11px;color:var(--text3)">
          market_data 보존: 모니터링 <b style="color:var(--tg)">90일</b> / 전체 <b style="color:var(--text2)">28일</b>
        </div>
      </div>
      <div class="card-body">${rows}</div>
    </div>
  </div>`;
}

// ── pCompany: 탭 껍데기만 반환 ──
function pCompany() {
  return `
  <div style="min-height:calc(100vh - 56px)">
  <!-- 탭 헤더 -->
  <div style="display:flex;gap:0;border-bottom:2px solid var(--border);padding:0 1.25rem;background:var(--bg);position:sticky;top:0;z-index:20;box-shadow:0 2px 8px rgba(0,0,0,.3)">
    <button class="company-tab ${_companyTab==='monitoring'?'active':''}"
      data-tab="monitoring" onclick="switchCompanyTab('monitoring')"
      style="padding:12px 20px;font-size:13px;font-weight:600;background:none;border:none;
        cursor:pointer;border-bottom:2px solid ${_companyTab==='monitoring'?'var(--tg)':'transparent'};
        color:${_companyTab==='monitoring'?'var(--text)':'var(--text3)'};margin-bottom:-1px">
      ⭐ 모니터링 종목
    </button>
    <button class="company-tab ${_companyTab==='etf'?'active':''}"
      data-tab="etf" onclick="switchCompanyTab('etf');setTimeout(loadEtfMapUI,50)"
      style="padding:12px 20px;font-size:13px;font-weight:600;background:none;border:none;
        cursor:pointer;border-bottom:2px solid ${_companyTab==='etf'?'var(--tg)':'transparent'};
        color:${_companyTab==='etf'?'var(--text)':'var(--text3)'};margin-bottom:-1px">
      🌐 US 종목 관리
    </button>
    <button class="company-tab ${_companyTab==='schedule'?'active':''}"
      data-tab="schedule" onclick="switchCompanyTab('schedule')"
      style="padding:12px 20px;font-size:13px;font-weight:600;background:none;border:none;
        cursor:pointer;border-bottom:2px solid ${_companyTab==='schedule'?'var(--tg)':'transparent'};
        color:${_companyTab==='schedule'?'var(--text)':'var(--text3)'};margin-bottom:-1px">
      📅 수집 스케줄
    </button>
  </div>

  ${_renderMonitoringTab()}
  ${_renderEtfTab()}
  ${_renderScheduleTab()}
  </div>`;
}

function switchCompanyTab(tab) {
  _companyTab = tab;
  const monEl = document.getElementById('company-tab-monitoring');
  const etfEl = document.getElementById('company-tab-etf');
  const schEl = document.getElementById('company-tab-schedule');
  if (monEl) monEl.style.display = tab === 'monitoring' ? 'grid' : 'none';
  if (etfEl) etfEl.style.display = tab === 'etf' ? 'block' : 'none';
  if (schEl) schEl.style.display = tab === 'schedule' ? 'block' : 'none';
  // 탭 버튼 스타일
  document.querySelectorAll('.company-tab').forEach(btn => {
    const isActive = btn.dataset.tab === tab;
    btn.style.borderBottomColor = isActive ? 'var(--tg)' : 'transparent';
    btn.style.color = isActive ? 'var(--text)' : 'var(--text3)';
  });
  if (tab === 'etf') loadEtfMapUI();
}

// ── 상태 ──────────────────────────────────────
let _monData     = {};
let _monInds     = [];
let _monSelStock = null;

async function loadCompanyPage() {
  await _monLoadBoard();
}

// ── 보드 로드 ───────────────────────────────────
async function _monLoadBoard() {
  const board = document.getElementById('mon-board');
  const sumEl = document.getElementById('mon-summary');

  const { data: companies } = await sb.from('companies')
    .select('code,name,industry,sub_industry,is_monitored,market')
    .eq('is_monitored', true)
    .order('name');

  if (!companies?.length) {
    if (board) board.innerHTML = '<div style="color:var(--text3);padding:40px;text-align:center">모니터링 종목이 없습니다</div>';
    return;
  }
  if (sumEl) sumEl.textContent = `총 ${companies.length}개 종목`;

  const grouped = {};
  companies.forEach(c => {
    const ind = (c.industry && c.industry.trim()) ? c.industry.trim() : '미분류';
    const sub = (c.sub_industry && c.sub_industry.trim()) ? c.sub_industry.trim() : '기타';
    if (!grouped[ind]) grouped[ind] = {};
    if (!grouped[ind][sub]) grouped[ind][sub] = [];
    grouped[ind][sub].push(c);
  });
  _monData = grouped;
  _monInds = Object.keys(grouped).sort((a,b) => a === '미분류' ? 1 : b === '미분류' ? -1 : a.localeCompare(b));

  if (board) board.innerHTML = _monInds.map(ind => _renderIndustryCard(ind, grouped[ind])).join('');
  _monInitDnd();
  _monUpdateSelects();
}

function _renderIndustryCard(ind, subs) {
  const total = Object.values(subs).reduce((s, arr) => s + arr.length, 0);
  const subKeys = Object.keys(subs).sort();
  return `
  <div class="card" style="margin-bottom:16px;border-left:3px solid var(--tg)" data-industry="${ind}">
    <div class="card-header" style="flex-wrap:wrap;gap:8px;background:rgba(42,171,238,0.06);border-bottom:1px solid var(--border)">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:15px;font-weight:800;color:var(--text1)">${ind}</span>
        <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:100px;background:var(--tg);color:#fff">${total}개</span>
      </div>
      <div style="margin-left:auto;display:flex;gap:6px;align-items:center">
        <input type="text" placeholder="서브섹터 추가..." class="form-input"
          id="mon-new-sub-${CSS.escape(ind)}" style="font-size:11px;padding:3px 8px;width:130px"
          onkeydown="if(event.key==='Enter')monAddSub('${ind.replace(/'/g,"\\'")}')">
        <button class="btn btn-sm" onclick="monAddSub('${ind.replace(/'/g,"\\'")}')">추가</button>
        <button class="btn btn-sm" onclick="monDeleteIndustry('${ind.replace(/'/g,"\\'")}')}"
          style="color:var(--text3);background:none;border-color:var(--border)">✕</button>
      </div>
    </div>
    <div style="padding:.75rem 1rem 1.25rem;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px">
      ${subKeys.map(sub => _renderSubCard(ind, sub, subs[sub])).join('')}
      <div class="mon-drop-zone" data-industry="${ind}" data-sub=""
        style="border:2px dashed var(--border);border-radius:8px;padding:12px;min-height:60px;
          text-align:center;color:var(--text3);font-size:11px;display:flex;align-items:center;justify-content:center">
        ＋ 서브섹터 없이 추가
      </div>
    </div>
  </div>`;
}

function _renderSubCard(ind, sub, stocks) {
  const safeInd = ind.replace(/'/g, "\\'");
  const safeSub = sub.replace(/'/g, "\\'");
  return `
  <div class="mon-sub-card" data-industry="${ind}" data-sub="${sub}"
    style="background:var(--bg3);border-radius:8px;padding:10px;border:1px solid var(--border)">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;padding-bottom:7px;border-bottom:1px solid var(--border)">
      <span class="mon-sub-label" style="font-size:12px;font-weight:700;color:var(--text1);cursor:pointer;flex:1"
        title="더블클릭으로 이름 수정"
        ondblclick="monEditSub(this,'${safeInd}','${safeSub}')">${sub}</span>
      <div style="display:flex;gap:6px;align-items:center">
        <button onclick="monEditSub(this.closest('.mon-sub-card').querySelector('.mon-sub-label'),'${safeInd}','${safeSub}')"
          style="background:none;border:none;cursor:pointer;font-size:12px;padding:0 2px;color:var(--text3)"
          title="이름 수정"
          onmouseenter="this.style.color='var(--tg)'"
          onmouseleave="this.style.color='var(--text3)'">✎</button>
        <span style="font-size:11px;color:var(--text2);font-weight:600">${stocks.length}개</span>
        <button onclick="monDeleteSub('${safeInd}','${safeSub}')"
          style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:11px;padding:0"
          onmouseenter="this.style.color='var(--red)'"
          onmouseleave="this.style.color='var(--text3)'">✕</button>
      </div>
    </div>
    <div class="mon-drop-zone" data-industry="${ind}" data-sub="${sub}"
      style="display:flex;flex-direction:column;gap:4px;min-height:32px;padding:8px">
      ${stocks.map(s => _renderStockChip(s)).join('')}
    </div>
  </div>`;
}

function _renderStockChip(s) {
  const code = s.code.replace(/\.(KS|KQ)$/, '');
  const mkt  = s.code.endsWith('.KS') ? 'KOSPI' : 'KOSDAQ';
  const safeName = s.name.replace(/'/g, "\\'");
  return `
  <div class="mon-stock-chip" draggable="true"
    data-code="${code}" data-name="${s.name}"
    data-industry="${s.industry||''}" data-sub="${s.sub_industry||''}"
    style="display:flex;align-items:center;justify-content:space-between;padding:5px 8px;
      background:var(--bg3);border-radius:4px;cursor:grab;border:1px solid transparent;
      font-size:12px;transition:border-color .15s;gap:6px"
    onmouseenter="this.style.borderColor='var(--tg)'"
    onmouseleave="this.style.borderColor='var(--border)'">
    <div style="display:flex;flex-direction:column;gap:1px;overflow:hidden;flex:1">
      <span style="font-size:13px;font-weight:600;color:var(--text1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.name}</span>
      <span style="font-size:10px;color:var(--text2)">${code} · ${mkt}</span>
    </div>
    <button onclick="monRemoveStock('${code}','${safeName}')"
      style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:13px;
        padding:0 2px;flex-shrink:0;line-height:1;border-radius:3px"
      onmouseenter="this.style.color='var(--red)';this.style.background='rgba(245,54,92,0.1)'"
      onmouseleave="this.style.color='var(--text3)';this.style.background='none'">✕</button>
  </div>`;
}

// ── 드래그앤드롭 ────────────────────────────────
function _monInitDnd() {
  let dragging = null;

  document.querySelectorAll('.mon-stock-chip').forEach(chip => {
    chip.addEventListener('dragstart', e => {
      dragging = chip;
      setTimeout(() => chip.style.opacity = '0.4', 0);
      e.dataTransfer.effectAllowed = 'move';
    });
    chip.addEventListener('dragend', () => {
      chip.style.opacity = '1';
      dragging = null;
    });
  });

  document.querySelectorAll('.mon-drop-zone').forEach(zone => {
    zone.addEventListener('dragover', e => {
      e.preventDefault();
      zone.style.outline = '2px solid var(--tg)';
    });
    zone.addEventListener('dragleave', () => zone.style.outline = '');
    zone.addEventListener('drop', async e => {
      e.preventDefault();
      zone.style.outline = '';
      if (!dragging) return;
      const code   = dragging.dataset.code;
      const name   = dragging.dataset.name;
      const newInd = zone.dataset.industry;
      const newSub = zone.dataset.sub;
      if (dragging.dataset.industry === newInd && dragging.dataset.sub === newSub) return;
      await _monMoveStock(code, name, newInd, newSub);
    });
  });
}

async function _monMoveStock(code, name, newInd, newSub) {
  try {
    for (const c of [code, code+'.KS', code+'.KQ']) {
      await sb.from('companies').update({ industry: newInd||null, sub_industry: newSub||null })
        .eq('code', c);
    }
    await _monLoadBoard();
    toast(`✅ ${name} → ${newInd}${newSub ? '/'+newSub : ''}`, 'success');
  } catch(e) { toast('이동 실패: '+e.message, 'error'); }
}

// ── 종목 삭제 ───────────────────────────────────
async function monRemoveStock(code, name) {
  if (!confirm(`'${name}'을(를) 모니터링에서 제거할까요?\n(기업 데이터는 유지됩니다)`)) return;
  try {
    for (const c of [code, code+'.KS', code+'.KQ']) {
      await sb.from('companies').update({ is_monitored: false, monitoring_level: 'data' }).eq('code', c)
    }
    _monMarkDirty();
    await _monLoadBoard();
    toast(`🗑 ${name} 모니터링 제거`, 'success');
  } catch(e) { toast('삭제 실패: '+e.message, 'error'); }
}

// ── 검색 ────────────────────────────────────────
async function monSearch(q) {
  const el = document.getElementById('mon-search-results');
  if (!el) return;
  if (!q) { el.innerHTML=''; _monSelStock=null; document.getElementById('mon-add-panel').style.display='none'; return; }

  const { data } = await sb.from('companies')
    .select('code,name,industry,sub_industry,is_monitored,market')
    .or(`name.ilike.%${q}%,code.ilike.%${q}%`)
    .order('is_monitored', { ascending:false }).limit(12);

  if (!data?.length) { el.innerHTML='<div style="font-size:12px;color:var(--text3);padding:6px">검색 결과 없음</div>'; return; }

  el.innerHTML = data.map(c => {
    const code = c.code.replace(/\.(KS|KQ)$/, '');
    const mon  = c.is_monitored;
    return `<div style="display:flex;align-items:center;justify-content:space-between;
        padding:6px 10px;border-radius:6px;cursor:pointer;font-size:12px;margin-bottom:2px;
        background:${mon?'rgba(42,171,238,0.08)':'var(--bg3)'}"
        onclick="monSelectStock('${code}','${c.name.replace(/'/g,"\\'")}','${c.industry||''}','${c.sub_industry||''}')">
      <div>
        <span style="color:var(--text3);font-size:10px;margin-right:4px">${code}</span>
        <span style="font-weight:600">${c.name}</span>
      </div>
      <span style="font-size:10px;color:${mon?'var(--tg)':'var(--text3)'}">${mon?'✓모니터링':'+ 추가'}</span>
    </div>`;
  }).join('');
}

function monSelectStock(code, name, industry, sub) {
  _monSelStock = { code, name, industry, sub };
  const panel = document.getElementById('mon-add-panel');
  const label = document.getElementById('mon-sel-label');
  if (panel) panel.style.display = 'block';
  if (label) label.textContent   = `선택: ${name} (${code})`;
  const indSel = document.getElementById('mon-sel-industry');
  if (indSel && industry) {
    indSel.value = industry;
    monUpdateSubSel();
    const subSel = document.getElementById('mon-sel-sub');
    if (subSel && sub) subSel.value = sub;
  }
}

function _monUpdateSelects() {
  const indSel = document.getElementById('mon-sel-industry');
  if (!indSel) return;
  indSel.innerHTML = '<option value="">산업 선택...</option>' +
    _monInds.map(ind => `<option value="${ind}">${ind}</option>`).join('');
}

function monUpdateSubSel() {
  const ind    = document.getElementById('mon-sel-industry')?.value;
  const subSel = document.getElementById('mon-sel-sub');
  if (!subSel) return;
  const subs = ind && _monData[ind] ? Object.keys(_monData[ind]).sort() : [];
  subSel.innerHTML = '<option value="">서브섹터 선택...</option>' +
    subs.map(s => `<option value="${s}">${s}</option>`).join('');
}

async function monAddSelected() {
  if (!_monSelStock) { toast('종목을 먼저 선택하세요', 'error'); return; }
  const ind = document.getElementById('mon-sel-industry')?.value;
  const sub = document.getElementById('mon-sel-sub')?.value;
  if (!ind) { toast('산업을 선택하세요', 'error'); return; }
  const { code, name } = _monSelStock;
  try {
    for (const c of [code, code+'.KS', code+'.KQ']) {
      await sb.from('companies').update({ is_monitored:true, monitoring_level:'news', industry:ind, sub_industry:sub||null })
        .eq('code', c)
    }
    _monMarkDirty();
    document.getElementById('mon-add-panel').style.display = 'none';
    document.getElementById('mon-search').value = '';
    document.getElementById('mon-search-results').innerHTML = '';
    _monSelStock = null;
    await _monLoadBoard();
    toast(`✅ ${name} → ${ind}${sub?'/'+sub:''} 추가`, 'success');
  } catch(e) { toast('추가 실패: '+e.message, 'error'); }
}

// ── 산업/서브섹터 관리 ─────────────────────────
async function monAddIndustry() {
  const input = document.getElementById('mon-new-industry');
  const val   = input?.value.trim();
  if (!val) return;
  if (_monInds.includes(val)) { toast('이미 존재합니다', 'error'); return; }
  _monData[val] = {};
  _monInds = Object.keys(_monData).sort();
  document.getElementById('mon-board').innerHTML = _monInds.map(i => _renderIndustryCard(i, _monData[i])).join('');
  _monInitDnd(); _monUpdateSelects();
  input.value = '';
  toast(`✅ '${val}' 추가 (종목 추가 시 저장)`, 'success');
}

async function monDeleteIndustry(ind) {
  const stocks = Object.values(_monData[ind]||{}).flat();
  const msg = stocks.length
    ? `'${ind}' 산업의 ${stocks.length}개 종목을 모두 모니터링에서 제거할까요?`
    : `'${ind}' 산업을 삭제할까요?`;
  if (!confirm(msg)) return;
  for (const s of stocks) {
    for (const c of [s.code, s.code+'.KS', s.code+'.KQ']) {
      await sb.from('companies').update({ is_monitored:false, monitoring_level:'data' }).eq('code',c)
    }
  }
  if (stocks.length) {
    _monMarkDirty();
  }
  delete _monData[ind];
  _monInds = Object.keys(_monData).sort();
  await _monLoadBoard();
  toast(`🗑 산업 '${ind}' 삭제`, 'success');
}

async function monAddSub(ind) {
  const input = document.getElementById(`mon-new-sub-${CSS.escape(ind)}`);
  const val   = input?.value.trim();
  if (!val) return;
  if (_monData[ind]?.[val]) { toast('이미 존재합니다', 'error'); return; }
  if (!_monData[ind]) _monData[ind] = {};
  _monData[ind][val] = [];
  document.getElementById('mon-board').innerHTML = _monInds.map(i => _renderIndustryCard(i, _monData[i])).join('');
  _monInitDnd(); _monUpdateSelects();
  toast(`✅ 서브섹터 '${val}' 추가`, 'success');
}

// ── 서브섹터 이름 인라인 편집 ────────────────
function monEditSub(labelEl, ind, oldSub) {
  if (labelEl.querySelector('input')) return; // 이미 편집 중

  const currentText = labelEl.textContent.trim();
  const input = document.createElement('input');
  input.value = currentText;
  input.style.cssText = 'font-size:12px;font-weight:700;background:var(--bg1);border:1px solid var(--tg);' +
    'border-radius:4px;padding:1px 6px;width:100%;color:var(--text1);outline:none;box-sizing:border-box';

  labelEl.textContent = '';
  labelEl.appendChild(input);
  input.focus();
  input.select();

  async function commit() {
    const newSub = input.value.trim();
    labelEl.textContent = newSub || oldSub;
    if (!newSub || newSub === oldSub) return;

    // DB 업데이트 - 해당 서브섹터 종목들 일괄 변경
    const stocks = _monData[ind]?.[oldSub] || [];
    for (const s of stocks) {
      for (const c of [s.code, s.code+'.KS', s.code+'.KQ']) {
        await sb.from('companies').update({ sub_industry: newSub }).eq('code', c);
      }
    }
    // 내부 상태 업데이트
    if (_monData[ind]) {
      _monData[ind][newSub] = _monData[ind][oldSub] || [];
      delete _monData[ind][oldSub];
    }
    _monMarkDirty();
    // 카드 data-sub 속성 업데이트
    const card = labelEl.closest('.mon-sub-card');
    if (card) {
      card.dataset.sub = newSub;
      card.querySelectorAll('.mon-drop-zone').forEach(z => z.dataset.sub = newSub);
    }
    toast(`✅ '${oldSub}' → '${newSub}'`, 'success');
  }

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { input.value = oldSub; input.blur(); }
  });
}

async function monDeleteSub(ind, sub) {
  const stocks = _monData[ind]?.[sub] || [];
  if (stocks.length && !confirm(`'${sub}'의 ${stocks.length}개 종목을 서브섹터에서 제거할까요?\n(모니터링은 유지)`)) return;
  for (const s of stocks) {
    for (const c of [s.code, s.code+'.KS', s.code+'.KQ']) {
      await sb.from('companies').update({ sub_industry:null }).eq('code',c)
    }
  }
  delete _monData[ind][sub];
  document.getElementById('mon-board').innerHTML = _monInds.map(i => _renderIndustryCard(i, _monData[i])).join('');
  _monInitDnd();
  toast(`🗑 서브섹터 '${sub}' 삭제`, 'success');
}

// ── 적용 버튼 ─────────────────────────────────
async function monApply() {
  const btn = document.getElementById('mon-apply-btn');
  const badge = document.getElementById('mon-dirty-badge');

  // 로딩 상태
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 적용 중...'; btn.style.opacity = '1'; }
  if (badge) badge.innerHTML = '⏳ 봇 반영 중...';

  try {
    // reload_flag 트리거
    await sb.from('app_config').upsert({
      key: 'reload_flag',
      value: String(Date.now()),
      description: '모니터링 종목 변경 - 대시보드'
    }, { onConflict: 'key' });

    toast('📡 봇에 변경사항 전송 완료 — 약 1분 후 반영됩니다', 'success');

    // 1분 카운트다운
    let sec = 60;
    const timer = setInterval(() => {
      sec--;
      if (btn) btn.textContent = `⏳ 반영 중 (${sec}초)`;
      if (sec <= 0) {
        clearInterval(timer);
        _monDirty = false;
        if (btn) { btn.textContent = '✅ 적용'; btn.style.opacity = '0.4'; btn.disabled = true; }
        if (badge) badge.style.display = 'none';
        // 시황 페이지 캐시 초기화 → 다음 진입 시 최신 데이터 반영
        if (typeof _latestMarketDate !== 'undefined') _latestMarketDate = null;
        if (typeof window._industryMapCache !== 'undefined') window._industryMapCache = null;
        // 보드 새로고침
        _monLoadBoard();
        // 현재 시황 페이지가 열려있으면 즉시 재로드
        if (typeof A !== 'undefined' && A.page === 'investment' && typeof loadInvestment === 'function') {
          loadInvestment();
        }
        toast('✅ 적용 완료', 'success');
      }
    }, 1000);

  } catch(e) {
    toast('적용 실패: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '✅ 적용'; }
    if (badge) badge.innerHTML = '● 미적용 변경사항';
  }
}


// ══════════════════════════════════════════
//  🌐 US 종목 관리
// ══════════════════════════════════════════

// KR_INDUSTRIES — config.js에서 전역 정의

async function loadEtfMapUI() {
  const wrap = document.getElementById('etf-map-wrap');
  if (!wrap) return;
  wrap.innerHTML = '<div style="padding:1rem;color:var(--text3);font-size:13px">로딩 중...</div>';

  const { data: rows, error } = await sb.from('us_etf_map')
    .select('industry,ticker')
    .order('industry').order('ticker');

  if (error) {
    wrap.innerHTML = '<div style="padding:1rem;color:var(--red);font-size:13px">오류: ' + error.message + '</div>';
    return;
  }

  // 산업별 그룹핑
  const map = {};
  KR_INDUSTRIES.forEach(ind => { map[ind] = []; });
  (rows || []).forEach(r => {
    if (map[r.industry] && !map[r.industry].includes(r.ticker))
      map[r.industry].push(r.ticker);
  });

  const rows_html = KR_INDUSTRIES.map((ind, idx) => {
    const tickers = map[ind] || [];
    const isLast = idx === KR_INDUSTRIES.length - 1;
    const border = isLast ? 'none' : '0.5px solid rgba(255,255,255,.08)';
    return `
    <div style="display:grid;grid-template-columns:100px 1fr;border-bottom:${border};align-items:start">
      <div style="padding:13px 16px;font-size:13px;font-weight:500;color:rgba(255,255,255,.5)">${ind}</div>
      <div style="padding:9px 12px;display:flex;flex-wrap:wrap;gap:6px;align-items:center">
        ${tickers.map(t => `
          <span style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;
            border-radius:6px;font-size:12px;font-weight:500;
            background:rgba(255,255,255,.06);border:0.5px solid rgba(255,255,255,.15);
            color:rgba(255,255,255,.9)">
            ${t}
            <button onclick="removeEtfTicker('${ind}','${t}')"
              style="display:flex;align-items:center;background:none;border:none;
                cursor:pointer;color:rgba(255,255,255,.35);padding:0;font-size:12px;line-height:1"
              title="${t} 제거">&#x2715;</button>
          </span>
        `).join('')}
        <button onclick="showAddEtfInput('${ind}')"
          style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;
            border-radius:6px;font-size:12px;cursor:pointer;
            color:rgba(255,255,255,.3);background:none;
            border:0.5px dashed rgba(255,255,255,.2)">&#43; 추가</button>
        <span id="etf-input-${ind}" style="display:none;align-items:center;gap:6px">
          <input id="etf-new-${ind}" placeholder="SOXX" maxlength="10"
            style="width:76px;padding:4px 8px;border:0.5px solid rgba(255,255,255,.2);
              border-radius:6px;background:rgba(255,255,255,.06);
              color:rgba(255,255,255,.9);font-size:12px"
            onkeydown="if(event.key===\'Enter\')addEtfTicker(\'${ind}\')">
          <button onclick="addEtfTicker(\'${ind}\')"
            style="padding:4px 10px;font-size:12px;background:#2AABEE;color:#fff;
              border:none;border-radius:6px;cursor:pointer;font-weight:500">추가</button>
          <button onclick="document.getElementById(\'etf-input-${ind}\').style.display=\'none\'"
            style="padding:4px 8px;font-size:12px;background:none;
              border:0.5px solid rgba(255,255,255,.2);border-radius:6px;
              cursor:pointer;color:rgba(255,255,255,.4)">취소</button>
        </span>
      </div>
    </div>`;
  }).join('');
  const finalHtml = rows_html;  // 실제값 직접 사용하므로 치환 불필요

  wrap.innerHTML = `
    <div style="display:grid;grid-template-columns:100px 1fr;
      background:rgba(255,255,255,.03);border-bottom:0.5px solid rgba(255,255,255,.08)">
      <div style="padding:8px 16px;font-size:11px;color:rgba(255,255,255,.3);font-weight:500">KR 산업</div>
      <div style="padding:8px 12px;font-size:11px;color:rgba(255,255,255,.3);font-weight:500">매핑 ETF</div>
    </div>
    ${finalHtml}`;
}

function showAddEtfInput(ind) {
  const el = document.getElementById('etf-input-' + ind);
  if (el) { el.style.display = 'flex'; document.getElementById('etf-new-' + ind)?.focus(); }
}

async function addEtfTicker(ind) {
  const input = document.getElementById('etf-new-' + ind);
  const ticker = input?.value.trim().toUpperCase();
  if (!ticker) return;

  const { error } = await sb.from('us_etf_map')
    .upsert({ industry: ind, ticker }, { onConflict: 'industry,ticker' });

  if (error) { alert('추가 실패: ' + error.message); return; }

  if (window.USKR_MAP?.[ind] && !window.USKR_MAP[ind].includes(ticker))
    window.USKR_MAP[ind].push(ticker);
  _etfMarkDirty();
  toast(ind + ' ← ' + ticker + ' 추가됨', 'success');
  loadEtfMapUI();
}

async function removeEtfTicker(ind, ticker) {
  if (!confirm(ind + '에서 ' + ticker + '를 제거할까요?')) return;

  const { error } = await sb.from('us_etf_map')
    .delete().eq('industry', ind).eq('ticker', ticker);

  if (error) { alert('삭제 실패: ' + error.message); return; }

  if (window.USKR_MAP?.[ind])
    window.USKR_MAP[ind] = window.USKR_MAP[ind].filter(t => t !== ticker);
  _etfMarkDirty();
  toast(ind + ' ← ' + ticker + ' 제거됨', 'info');
  loadEtfMapUI();
}


function _etfMarkDirty() {
  const badge = document.getElementById('etf-dirty-badge');
  const btn   = document.getElementById('etf-apply-btn');
  if (badge) { badge.style.display = 'flex'; badge.innerHTML = '● 미적용 변경사항'; }
  if (btn)   { btn.disabled = false; btn.style.opacity = '1'; btn.textContent = '✅ 데이터 수집 적용'; }
}

async function etfApply() {
  const btn   = document.getElementById('etf-apply-btn');
  const badge = document.getElementById('etf-dirty-badge');

  if (btn) { btn.disabled = true; btn.textContent = '⏳ 적용 중...'; btn.style.opacity = '1'; }
  if (badge) badge.innerHTML = '⏳ 수집 트리거 중...';

  try {
    // collect_us_etf 수집 트리거
    await sb.from('app_config').upsert({
      key: 'etf_collect_flag',
      value: String(Date.now()),
      description: 'US ETF 데이터 수집 트리거 - 대시보드'
    }, { onConflict: 'key' });

    toast('📡 US ETF 수집 트리거 완료 — 약 1분 후 데이터가 갱신됩니다', 'success');

    // 카운트다운
    let sec = 60;
    const timer = setInterval(() => {
      sec--;
      if (btn) btn.textContent = `⏳ 수집 중 (${sec}초)`;
      if (sec <= 0) {
        clearInterval(timer);
        if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.textContent = '✅ 데이터 수집 적용'; }
        if (badge) { badge.style.display = 'none'; }
        toast('✅ US ETF 데이터 수집 완료', 'success');
      }
    }, 1000);

  } catch(e) {
    toast('❌ 트리거 실패: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.textContent = '✅ 데이터 수집 적용'; }
    if (badge) badge.innerHTML = '● 미적용 변경사항';
  }
}
