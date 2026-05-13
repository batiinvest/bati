// company.js — 기업정보 페이지
// 의존: config.js (sb, fmtCap, chgColor, chgStr, getLatestMarketDate, getIndustryMap)
// DB: company_info, company_analysis, financials, market_data, companies

// ── 상태 ──────────────────────────────────────
let _cmpCode = null;   // 현재 조회 중인 종목코드
let _cmpData = {};     // 섹션별 로드 데이터 캐시

// ── 페이지 진입점 ─────────────────────────────
function pCompany() {
  return `
  <div style="display:grid;grid-template-columns:300px 1fr;gap:0;min-height:calc(100vh - 56px);align-items:start">

    <!-- 좌측: 검색 + 목록 -->
    <div style="border-right:1px solid var(--border);padding:1.25rem;position:sticky;top:56px;height:calc(100vh - 56px);overflow-y:auto;background:var(--bg2)">
      <div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px">기업 검색</div>

      <div style="position:relative;margin-bottom:16px">
        <input type="text" id="cmp-search" class="form-input"
          placeholder="종목명 또는 코드..."
          oninput="cmpSearch(this.value)"
          style="width:100%;box-sizing:border-box;padding-left:32px">
        <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text3);font-size:14px">🔍</span>
        <div id="cmp-dropdown" style="display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;
          background:var(--bg1);border:1px solid var(--border2);border-radius:8px;
          z-index:99;max-height:240px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,.4)"></div>
      </div>

      <!-- 최근 조회 / 투자노트 종목 -->
      <div id="cmp-sidebar-list">
        <div style="font-size:11px;color:var(--text3);margin-bottom:8px">투자노트 종목</div>
        <div id="cmp-watchlist-shortcuts" style="display:flex;flex-direction:column;gap:2px">
          <div style="color:var(--text3);font-size:12px;padding:8px 0"><span class="loading"></span></div>
        </div>
      </div>
    </div>

    <!-- 우측: 기업정보 본문 -->
    <div id="cmp-main" style="padding:0;min-height:calc(100vh - 56px)">
      <div style="display:flex;align-items:center;justify-content:center;height:100%;min-height:400px;color:var(--text3);flex-direction:column;gap:12px">
        <div style="font-size:32px">🏢</div>
        <div style="font-size:14px">종목을 검색하거나 좌측 목록에서 선택하세요</div>
      </div>
    </div>
  </div>`;
}

function loadCompanyPage() {
  _loadWatchlistShortcuts();
}

// ── 투자노트 종목 바로가기 ──────────────────────
async function _loadWatchlistShortcuts() {
  const el = document.getElementById('cmp-watchlist-shortcuts');
  if (!el) return;

  // watchlist + company_info 수집 종목 병합
  const [{ data: wlData }, { data: ciData }] = await Promise.all([
    sb.from('watchlist').select('stock_code,corp_name,group_name').order('group_name').order('corp_name').limit(100),
    sb.from('company_info').select('stock_code,corp_name').order('corp_name').limit(100),
  ]);

  // stock_code 기준으로 합치기 (watchlist 우선)
  const map = {};
  (ciData || []).forEach(r => {
    if (r.stock_code) map[r.stock_code] = { stock_code: r.stock_code, corp_name: r.corp_name, group_name: '' };
  });
  (wlData || []).forEach(r => {
    if (r.stock_code) map[r.stock_code] = { stock_code: r.stock_code, corp_name: r.corp_name, group_name: r.group_name || '관심' };
  });

  const items = Object.values(map).sort((a, b) => (a.corp_name || '').localeCompare(b.corp_name || '', 'ko'));

  if (!items.length) {
    el.innerHTML = '<div style="font-size:12px;color:var(--text3);padding:4px 0">종목 없음</div>';
    return;
  }

  el.innerHTML = items.map(w => `
    <div onclick="loadCompany('${w.stock_code}','${w.corp_name || w.stock_code}')"
      style="padding:7px 10px;border-radius:6px;cursor:pointer;display:flex;align-items:center;gap:8px"
      id="cmp-sc-${w.stock_code}"
      onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${w.corp_name || w.stock_code}</div>
        <div style="font-size:10px;color:var(--text3)">${w.stock_code}${w.group_name ? ' · ' + w.group_name : ''}</div>
      </div>
    </div>`).join('');
}

// ── DART 자동수집 트리거 ────────────────────────────────────
async function collectCmpInfo(code) {
  const btn = document.getElementById('cmp-collect-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 수집 중...'; }
  try {
    await sb.from('app_config').upsert({
      key:         'collect_company_info_request',
      value:       JSON.stringify({ code, requested_at: new Date().toISOString() }),
      description: `기업정보 수집 요청: ${code}`,
    }, { onConflict: 'key' });
    toast('수집 요청 전송 완료. 잠시 후 새로고침 해주세요.', 'success');
    setTimeout(() => { if (_cmpCode === code) cmpTab('overview'); }, 30000);
  } catch(e) {
    toast('요청 실패: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🔄 DART 자동수집'; }
  }
}

// ── 종목 검색 ──────────────────────────────────
let _coSearchTimer = null;
async function cmpSearch(q) {
  const dd = document.getElementById('cmp-dropdown');
  if (!dd) return;
  clearTimeout(_coSearchTimer);
  if (!q?.trim()) { dd.style.display = 'none'; return; }
  _coSearchTimer = setTimeout(async () => {
    const { data } = await sb.from('companies')
      .select('code,name,market,industry')
      .or(`name.ilike.%${q}%,code.ilike.%${q}%`)
      .limit(12);
    if (!data?.length) { dd.style.display = 'none'; return; }
    dd.innerHTML = data.map(c => `
      <div onclick="loadCompany('${c.code}','${c.name}');document.getElementById('cmp-dropdown').style.display='none';document.getElementById('cmp-search').value='${c.name}'"
        style="padding:9px 12px;cursor:pointer;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px"
        onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:500">${c.name}</div>
          <div style="font-size:11px;color:var(--text3)">${c.code} · ${c.market || ''} · ${c.industry || ''}</div>
        </div>
      </div>`).join('');
    dd.style.display = 'block';
  }, 200);
}

// ── 기업 로드 (메인) ───────────────────────────
async function loadCompany(code, name) {
  _cmpCode = code;
  _cmpData = {};

  // 사이드바 active 표시
  document.querySelectorAll('[id^="cmp-sc-"]').forEach(el =>
    el.style.borderLeft = el.id === `cmp-sc-${code}` ? '2px solid var(--tg)' : '');

  const main = document.getElementById('cmp-main');
  if (!main) return;

  // 헤더 + 섹션 탭 구조 렌더링
  main.innerHTML = `
    <div style="border-bottom:1px solid var(--border);background:var(--bg2);padding:1.25rem 1.5rem">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <div>
          <div style="font-size:20px;font-weight:700" id="cmp-h-name">${name}</div>
          <div style="font-size:12px;color:var(--text3);margin-top:2px" id="cmp-h-sub">
            ${code} · <span class="loading" style="font-size:11px"></span>
          </div>
        </div>
        <div style="margin-left:auto;display:flex;gap:8px;align-items:center" id="cmp-h-actions">
          <button class="btn btn-sm" onclick="collectCmpInfo('${code}')" id="cmp-collect-btn">🔄 DART 자동수집</button>
          <button class="btn btn-sm" onclick="openCmpAnalysisModal('${code}','${name}')">✏️ 분석 작성</button>
        </div>
      </div>

      <!-- 핵심 지표 바 -->
      <div id="cmp-kpi-bar" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:12px;margin-top:14px;padding-top:14px;border-top:1px solid var(--border)">
        ${[1,2,3,4,5].map(()=>`<div style="height:36px;background:var(--bg3);border-radius:6px;animation:pulse 1.2s infinite"></div>`).join('')}
      </div>
    </div>

    <!-- 섹션 탭 -->
    <div style="display:flex;gap:0;border-bottom:1px solid var(--border);background:var(--bg2);padding:0 1.5rem;overflow-x:auto" id="cmp-tabs">
      ${[
        ['overview',   '🏢 개요'],
        ['business',   '📦 사업'],
        ['financials', '📊 재무'],
        ['valuation',  '💰 밸류에이션'],
        ['analysis',   '📝 기업분석'],
      ].map(([k,l]) => `
        <div onclick="cmpTab('${k}')" data-tab="${k}"
          style="padding:10px 16px;font-size:13px;cursor:pointer;white-space:nowrap;
            border-bottom:2px solid transparent;color:var(--text3);transition:all .15s"
          onmouseover="if(!this.classList.contains('active'))this.style.color='var(--text)'"
          onmouseout="if(!this.classList.contains('active'))this.style.color='var(--text3)'"
          class="cmp-tab-btn">${l}</div>`).join('')}
    </div>

    <div id="cmp-tab-body" style="padding:1.5rem">
      <div style="color:var(--text3);font-size:13px"><span class="loading"></span> 데이터 로딩 중...</div>
    </div>`;

  // 병렬 데이터 로드
  await Promise.all([
    _loadCmpHeader(code),
    _loadCmpKpi(code),
  ]);

  // 기본 탭 (개요)
  cmpTab('overview');
}

// ── 헤더 서브텍스트 ────────────────────────────
async function _loadCmpHeader(code) {
  const [{ data: co }, { data: ci }] = await Promise.all([
    sb.from('companies').select('market,industry,sub_industry,corp_code,name').eq('code', code).single(),
    sb.from('company_info').select('ceo_nm,est_dt,hm_url').eq('stock_code', code).single(),
  ]);
  const el = document.getElementById('cmp-h-sub');
  if (!el) return;
  _cmpData.company = co || {};
  _cmpData.info    = ci || {};
  el.innerHTML = [
    code,
    co?.market || '',
    co?.industry || '',
    ci?.ceo_nm ? `대표 ${ci.ceo_nm}` : '',
    ci?.est_dt ? `설립 ${ci.est_dt.slice(0,4)}` : '',
  ].filter(Boolean).join(' · ');
}

// ── KPI 바 ─────────────────────────────────────
async function _loadCmpKpi(code) {
  const maxDate = await getLatestMarketDate();
  const [{ data: mkt }, { data: fin }] = await Promise.all([
    sb.from('market_data').select('price,price_change_rate,market_cap,per,pbr').eq('stock_code', code).eq('base_date', maxDate).single(),
    sb.from('financials').select('revenue,operating_profit,operating_margin,revenue_yoy,op_profit_yoy,bsns_year,quarter').eq('stock_code', code).eq('fs_div','CFS').order('bsns_year',{ascending:false}).order('quarter',{ascending:false}).limit(1).single(),
  ]);
  _cmpData.mkt = mkt || {};
  _cmpData.latestFin = fin || {};
  const el = document.getElementById('cmp-kpi-bar');
  if (!el) return;

  const kpis = [
    { label:'현재가',     val: mkt?.price ? mkt.price.toLocaleString()+'원' : '—',
      sub: mkt?.price_change_rate != null ? `<span style="color:${chgColor(mkt.price_change_rate)}">${chgStr(mkt.price_change_rate)}</span>` : '' },
    { label:'시가총액',   val: fmtCap(mkt?.market_cap) },
    { label:'PER',        val: mkt?.per?.toFixed(1) || '—',  sub: `PBR ${mkt?.pbr?.toFixed(2)||'—'}` },
    { label:'매출(최근)', val: fmtCap(fin?.revenue),
      sub: fin?.revenue_yoy != null ? `<span style="color:${chgColor(fin.revenue_yoy)}">YoY ${fin.revenue_yoy>0?'+':''}${fin.revenue_yoy.toFixed(1)}%</span>` : '' },
    { label:'영업이익률', val: fin?.operating_margin != null ? fin.operating_margin.toFixed(1)+'%' : '—',
      sub: fin ? `${fin.bsns_year} ${fin.quarter}` : '' },
  ];

  el.innerHTML = kpis.map(k => `
    <div style="background:var(--bg3);border-radius:8px;padding:8px 12px">
      <div style="font-size:10px;color:var(--text3);margin-bottom:3px">${k.label}</div>
      <div style="font-size:15px;font-weight:700">${k.val}</div>
      ${k.sub ? `<div style="font-size:11px;margin-top:1px">${k.sub}</div>` : ''}
    </div>`).join('');
}

// ── 섹션 탭 전환 ──────────────────────────────
async function cmpTab(tab) {
  document.querySelectorAll('.cmp-tab-btn').forEach(btn => {
    const active = btn.dataset.tab === tab;
    btn.style.borderBottom = active ? '2px solid var(--tg)' : '2px solid transparent';
    btn.style.color = active ? 'var(--tg)' : 'var(--text3)';
  });
  const body = document.getElementById('cmp-tab-body');
  if (!body) return;
  body.innerHTML = `<div style="color:var(--text3);font-size:13px"><span class="loading"></span></div>`;

  const code = _cmpCode;
  switch (tab) {
    case 'overview':   await _renderOverview(code, body); break;
    case 'business':   await _renderBusiness(code, body); break;
    case 'financials': await _renderFinancials(code, body); break;
    case 'valuation':  await _renderValuation(code, body); break;
    case 'analysis':   await _renderAnalysis(code, body); break;
  }
}

// ══════════════════════════════════════════
//  섹션 1: 개요
// ══════════════════════════════════════════
async function _renderOverview(code, el) {
  const [{ data: ci }, { data: co }, { data: wl }] = await Promise.all([
    sb.from('company_info').select('*').eq('stock_code', code).single(),
    sb.from('companies').select('*').eq('code', code).single(),
    sb.from('watchlist').select('*').eq('stock_code', code).single(),
  ]);

  const row = (label, val) => val ? `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;
      padding:9px 0;border-bottom:1px solid var(--border);font-size:13px;gap:12px">
      <span style="color:var(--text3);flex-shrink:0;min-width:90px">${label}</span>
      <span style="text-align:right;word-break:break-all">${val}</span>
    </div>` : '';

  const overviewRows = [
    ['설립일',    ci?.est_dt ? ci.est_dt.slice(0,4)+'년 '+ci.est_dt.slice(4,6)+'월' : ''],
    ['대표이사',  ci?.ceo_nm || ''],
    ['결산월',    ci?.acc_mt ? ci.acc_mt+'월' : ''],
    ['시장구분',  co?.market || ''],
    ['업종',      co?.industry || ''],
    ['주소',      ci?.adres || ''],
    ['홈페이지',  ci?.hm_url ? `<a href="${ci.hm_url}" target="_blank" style="color:var(--tg)">${ci.hm_url}</a>` : ''],
    ['IR',        ci?.ir_url ? `<a href="${ci.ir_url}" target="_blank" style="color:var(--tg)">IR 페이지 ↗</a>` : ''],
  ].filter(([,v])=>v);

  // 주주 / 투자포인트 / 리스크 (watchlist에서)
  const thesisList = [wl?.thesis_1, wl?.thesis_2, wl?.thesis_3].filter(Boolean);
  const riskList   = [wl?.risk_1,   wl?.risk_2,   wl?.risk_3].filter(Boolean);

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start">

      <!-- 기업 개황 -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">기업 개황</span>
          <button class="btn btn-sm" onclick="openCmpInfoModal('${code}')">편집</button>
        </div>
        <div style="padding:.75rem 1rem">
          ${overviewRows.length ? overviewRows.map(([l,v]) => row(l,v)).join('') :
            `<div style="color:var(--text3);font-size:13px;padding:.5rem 0">
              기업 정보가 없습니다.
              <button class="btn btn-sm btn-primary" style="margin-left:8px" onclick="openCmpInfoModal('${code}')">정보 입력</button>
            </div>`}
        </div>
      </div>

      <!-- 투자 요약 (투자노트에서) -->
      <div style="display:flex;flex-direction:column;gap:16px">
        ${thesisList.length ? `
        <div class="card">
          <div class="card-header"><span class="card-title">💡 투자포인트</span></div>
          <div style="padding:.75rem 1rem;display:flex;flex-direction:column;gap:6px">
            ${thesisList.map(t => `
              <div style="display:flex;gap:8px;font-size:13px">
                <span style="color:var(--green);flex-shrink:0;font-weight:700">✓</span>
                <span>${t}</span>
              </div>`).join('')}
          </div>
        </div>` : ''}

        ${riskList.length ? `
        <div class="card">
          <div class="card-header"><span class="card-title">⚠️ 리스크</span></div>
          <div style="padding:.75rem 1rem;display:flex;flex-direction:column;gap:6px">
            ${riskList.map(r => `
              <div style="display:flex;gap:8px;font-size:13px">
                <span style="color:var(--red);flex-shrink:0">•</span>
                <span>${r}</span>
              </div>`).join('')}
          </div>
        </div>` : ''}

        ${wl?.break_condition ? `
        <div style="background:rgba(245,54,92,.06);border:1px solid rgba(245,54,92,.2);border-radius:10px;padding:12px 14px">
          <div style="font-size:11px;font-weight:600;color:var(--red);margin-bottom:4px">🚫 논리 붕괴 조건</div>
          <div style="font-size:13px;color:var(--text2)">${wl.break_condition}</div>
        </div>` : ''}

        ${wl?.catalyst ? `
        <div style="background:rgba(42,171,238,.06);border:1px solid rgba(42,171,238,.2);border-radius:10px;padding:12px 14px">
          <div style="font-size:11px;font-weight:600;color:var(--tg);margin-bottom:4px">⚡ 다음 트리거</div>
          <div style="font-size:13px;color:var(--text2)">${wl.catalyst}</div>
        </div>` : ''}

        ${(!thesisList.length && !riskList.length) ? `
        <div class="card" style="padding:1.25rem;text-align:center;color:var(--text3);font-size:13px">
          투자노트 데이터 없음
          <div style="margin-top:8px">
            <button class="btn btn-sm btn-primary" onclick="openWatchlistModal(null)">투자노트 추가</button>
          </div>
        </div>` : ''}
      </div>
    </div>`;
}

// ══════════════════════════════════════════
//  섹션 2: 사업 내용
// ══════════════════════════════════════════
async function _renderBusiness(code, el) {
  const { data: ci } = await sb.from('company_info')
    .select('business_summary,main_products,main_customers,competitors,business_detail_md')
    .eq('stock_code', code).single();

  const hasData = ci && (ci.business_summary || ci.main_products || ci.business_detail_md);

  el.innerHTML = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
      <button class="btn btn-sm btn-primary" onclick="openCmpInfoModal('${code}','business')">✏️ 사업 내용 편집</button>
    </div>
    ${hasData ? `
    <div style="display:flex;flex-direction:column;gap:20px">
      ${ci.business_summary ? `
      <div class="card">
        <div class="card-header"><span class="card-title">핵심 사업</span></div>
        <div style="padding:.75rem 1rem;font-size:13px;line-height:1.8;color:var(--text2)">${ci.business_summary}</div>
      </div>` : ''}

      ${(ci.main_products || ci.main_customers || ci.competitors) ? `
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px">
        ${ci.main_products ? _infoCard('📦 주요 제품/서비스', ci.main_products) : ''}
        ${ci.main_customers ? _infoCard('🏭 주요 고객사', ci.main_customers) : ''}
        ${ci.competitors ? _infoCard('🏢 경쟁사', ci.competitors) : ''}
      </div>` : ''}

      ${ci.business_detail_md ? `
      <div class="card">
        <div class="card-header"><span class="card-title">상세 사업 내용</span></div>
        <div style="padding:1rem 1.25rem;font-size:13px;line-height:1.8">
          ${renderMarkdown(ci.business_detail_md)}
        </div>
      </div>` : ''}
    </div>` : `
    <div style="text-align:center;padding:3rem;color:var(--text3)">
      <div style="font-size:32px;margin-bottom:12px">📦</div>
      <div style="font-size:14px;margin-bottom:16px">사업 내용이 등록되지 않았습니다</div>
      <button class="btn btn-primary" onclick="openCmpInfoModal('${code}','business')">사업 내용 입력</button>
    </div>`}`;
}

function _infoCard(title, content) {
  const lines = content.split(/[\n,、]/g).map(s=>s.trim()).filter(Boolean);
  return `
    <div class="card">
      <div class="card-header"><span class="card-title">${title}</span></div>
      <div style="padding:.75rem 1rem;display:flex;flex-direction:column;gap:6px">
        ${lines.map(l=>`<div style="font-size:13px;display:flex;gap:6px"><span style="color:var(--tg);flex-shrink:0">·</span><span>${l}</span></div>`).join('')}
      </div>
    </div>`;
}

// ══════════════════════════════════════════
//  섹션 3: 재무 현황
// ══════════════════════════════════════════
async function _renderFinancials(code, el) {
  const { data: rows } = await sb.from('financials')
    .select('bsns_year,quarter,revenue,operating_profit,net_income,operating_margin,revenue_yoy,op_profit_yoy,roe,roa,debt_ratio')
    .eq('stock_code', code).eq('fs_div','CFS')
    .order('bsns_year',{ascending:false}).order('quarter',{ascending:false})
    .limit(12);

  if (!rows?.length) {
    el.innerHTML = `<div style="text-align:center;padding:3rem;color:var(--text3)">재무 데이터 없음</div>`;
    return;
  }

  const sorted = [...rows].reverse();
  const labels = sorted.map(r => `${r.bsns_year.slice(2)}Q${r.quarter.slice(1)}`);
  const revs   = sorted.map(r => (r.revenue || 0) / 1e8);
  const ops    = sorted.map(r => (r.operating_profit || 0) / 1e8);
  const nets   = sorted.map(r => (r.net_income || 0) / 1e8);

  const fmtN = v => v == null ? '—' : (v/1e8).toFixed(0)+'억';
  const fmtP = v => v == null ? '—' : (v>0?'+':'')+v.toFixed(1)+'%';
  const clr  = v => v == null ? '' : v >= 0 ? 'color:var(--green)' : 'color:var(--red)';

  el.innerHTML = `
    <!-- 차트 -->
    <div class="card" style="margin-bottom:20px">
      <div class="card-header"><span class="card-title">분기별 실적 추이</span></div>
      <div style="padding:.75rem 1rem">
        <canvas id="cmp-fin-chart" height="160"></canvas>
      </div>
    </div>

    <!-- 테이블 -->
    <div class="card" style="margin-bottom:20px">
      <div class="card-header"><span class="card-title">분기별 실적 (최근 ${rows.length}분기)</span></div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>분기</th><th>매출</th><th>YoY</th>
            <th>영업이익</th><th>YoY</th><th>순이익</th><th>영업이익률</th>
          </tr></thead>
          <tbody>
            ${rows.map(r=>`<tr>
              <td style="font-weight:600">${r.bsns_year} ${r.quarter}</td>
              <td>${fmtN(r.revenue)}</td>
              <td style="${clr(r.revenue_yoy)}">${fmtP(r.revenue_yoy)}</td>
              <td style="${(r.operating_profit||0)>=0?'color:var(--green)':'color:var(--red)'}">${fmtN(r.operating_profit)}</td>
              <td style="${clr(r.op_profit_yoy)}">${fmtP(r.op_profit_yoy)}</td>
              <td style="${(r.net_income||0)>=0?'color:var(--green)':'color:var(--red)'}">${fmtN(r.net_income)}</td>
              <td>${r.operating_margin!=null?r.operating_margin.toFixed(1)+'%':'—'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- 재무 건전성 -->
    ${rows[0] ? `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px">
      ${[
        ['ROE', rows[0].roe != null ? rows[0].roe.toFixed(1)+'%' : '—'],
        ['ROA', rows[0].roa != null ? rows[0].roa.toFixed(1)+'%' : '—'],
        ['부채비율', rows[0].debt_ratio != null ? rows[0].debt_ratio.toFixed(1)+'%' : '—'],
      ].map(([l,v]) => `
        <div class="card" style="padding:14px 16px">
          <div style="font-size:11px;color:var(--text3)">${l}</div>
          <div style="font-size:20px;font-weight:700;margin-top:4px">${v}</div>
        </div>`).join('')}
    </div>` : ''}`;

  // 차트 (Chart.js — config.js에서 이미 CDN 로드 여부 확인 후)
  _drawFinChart('cmp-fin-chart', labels, revs, ops, nets);
}

function _drawFinChart(canvasId, labels, revs, ops, nets) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (window.Chart) {
    new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label:'매출(억)', data:revs, backgroundColor:'rgba(42,171,238,.5)', borderColor:'rgba(42,171,238,1)', borderWidth:1 },
          { label:'영업이익(억)', data:ops, backgroundColor:ops.map(v=>v>=0?'rgba(45,206,137,.5)':'rgba(245,54,92,.4)'), borderWidth:1, type:'bar' },
        ]
      },
      options: {
        responsive:true, interaction:{mode:'index'},
        plugins:{ legend:{labels:{color:'#a8adc4',font:{size:11}}}, tooltip:{backgroundColor:'#1a1d27',titleColor:'#f0f2f8',bodyColor:'#a8adc4'} },
        scales:{
          x:{ticks:{color:'#6e7491',font:{size:11}},grid:{color:'rgba(255,255,255,.05)'}},
          y:{ticks:{color:'#6e7491',font:{size:11},callback:v=>v+'억'},grid:{color:'rgba(255,255,255,.05)'}}
        }
      }
    });
  } else {
    // Chart.js 없으면 텍스트 바 차트
    canvas.style.display = 'none';
  }
}

// ══════════════════════════════════════════
//  섹션 4: 밸류에이션
// ══════════════════════════════════════════
async function _renderValuation(code, el) {
  const [{ data: mkt }, { data: wl }, { data: ci }] = await Promise.all([
    sb.from('market_data').select('price,market_cap,per,pbr').eq('stock_code', code)
      .order('base_date',{ascending:false}).limit(1).single(),
    sb.from('watchlist').select('target_price,watch_price,avg_price,quantity,peer_per,valuation_note').eq('stock_code',code).single(),
    sb.from('company_info').select('valuation_md').eq('stock_code',code).single(),
  ]);

  const capEok = mkt?.market_cap ? Math.round(mkt.market_cap / 1e8) : null;
  const targetCapEok = wl?.target_price && mkt?.market_cap && mkt?.price
    ? Math.round((wl.target_price / mkt.price) * (mkt.market_cap / 1e8)) : null;

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start">

      <!-- 현재 밸류 -->
      <div class="card">
        <div class="card-header"><span class="card-title">현재 밸류에이션</span></div>
        <div style="padding:.75rem 1rem">
          ${[
            ['현재가',   mkt?.price ? mkt.price.toLocaleString()+'원' : '—'],
            ['시가총액', capEok ? capEok.toLocaleString()+'억' : '—'],
            ['PER',      mkt?.per?.toFixed(1) || '—'],
            ['PBR',      mkt?.pbr?.toFixed(2) || '—'],
            ['업계 평균 PER', wl?.peer_per?.toFixed(1) || '—'],
          ].map(([l,v]) => `
            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px">
              <span style="color:var(--text3)">${l}</span>
              <span style="font-weight:600">${v}</span>
            </div>`).join('')}
        </div>
      </div>

      <!-- 목표 밸류 -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">목표 밸류에이션</span>
          <button class="btn btn-sm" onclick="openWatchlistModal(null)">편집</button>
        </div>
        <div style="padding:.75rem 1rem">
          ${[
            ['적정가',   wl?.target_price ? wl.target_price.toLocaleString()+'원' : '—'],
            ['적정 시총',targetCapEok ? targetCapEok.toLocaleString()+'억' : '—'],
            ['관심가',   wl?.watch_price ? wl.watch_price.toLocaleString()+'원' : '—'],
            ['평균 매수가', wl?.avg_price ? wl.avg_price.toLocaleString()+'원' : '—'],
          ].map(([l,v]) => `
            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px">
              <span style="color:var(--text3)">${l}</span>
              <span style="font-weight:600">${v}</span>
            </div>`).join('')}

          ${capEok && targetCapEok ? (() => {
            const upside = ((targetCapEok - capEok) / capEok * 100).toFixed(1);
            const color  = upside > 0 ? 'var(--green)' : 'var(--red)';
            return `<div style="margin-top:10px;padding:10px;background:var(--bg3);border-radius:8px;text-align:center">
              <div style="font-size:11px;color:var(--text3)">상승 여력</div>
              <div style="font-size:22px;font-weight:800;color:${color}">${upside > 0 ? '+' : ''}${upside}%</div>
            </div>`;
          })() : ''}
        </div>
      </div>
    </div>

    <!-- 밸류에이션 근거 -->
    ${wl?.valuation_note || ci?.valuation_md ? `
    <div class="card" style="margin-top:20px">
      <div class="card-header"><span class="card-title">밸류에이션 근거</span></div>
      <div style="padding:1rem 1.25rem;font-size:13px;line-height:1.8;color:var(--text2)">
        ${ci?.valuation_md ? renderMarkdown(ci.valuation_md) : wl?.valuation_note || ''}
      </div>
    </div>` : ''}`;
}

// ══════════════════════════════════════════
//  섹션 5: 기업분석 노트
// ══════════════════════════════════════════
async function _renderAnalysis(code, el) {
  const { data: analyses } = await sb.from('company_analysis')
    .select('*').eq('stock_code', code)
    .order('created_at', {ascending: false}).limit(20);

  const report  = analyses?.find(a => a.type === 'report');
  const updates = analyses?.filter(a => a.type === 'update') || [];

  el.innerHTML = `
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:16px">
      <button class="btn btn-sm btn-primary" onclick="openCmpAnalysisModal('${code}','${_cmpData.company?.corp_name || ''}','report')">📋 종합 리포트 작성</button>
      <button class="btn btn-sm" onclick="openCmpAnalysisModal('${code}','${_cmpData.company?.corp_name || ''}','update')">📌 업데이트 노트 추가</button>
    </div>

    <!-- 종합 리포트 -->
    <div class="card" style="margin-bottom:20px">
      <div class="card-header">
        <span class="card-title">📋 종합 리포트</span>
        ${report ? `<span style="font-size:11px;color:var(--text3)">${new Date(report.updated_at).toLocaleDateString('ko-KR')}</span>` : ''}
      </div>
      <div style="padding:1rem 1.25rem">
        ${report ? `
          <div style="font-size:13px;line-height:1.8">${renderMarkdown(report.content_md)}</div>
          ${report.blog_url ? `
          <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
            <a href="${report.blog_url}" target="_blank"
              style="font-size:12px;color:var(--tg);text-decoration:none">
              📰 블로그 원본 보기 ↗
            </a>
          </div>` : ''}
          <div style="display:flex;gap:6px;justify-content:flex-end;margin-top:12px">
            <button class="btn btn-sm" onclick="openCmpAnalysisModal('${code}','','report','${report.id}')">수정</button>
            <button class="btn btn-sm" style="color:var(--red)" onclick="deleteCmpAnalysis(${report.id})">삭제</button>
          </div>
        ` : `
          <div style="text-align:center;padding:2rem;color:var(--text3)">
            <div style="font-size:14px;margin-bottom:12px">작성된 종합 리포트가 없습니다</div>
            <button class="btn btn-primary btn-sm" onclick="openCmpAnalysisModal('${code}','','report')">종합 리포트 작성</button>
          </div>`}
      </div>
    </div>

    <!-- 업데이트 노트 타임라인 -->
    <div class="card">
      <div class="card-header">
        <span class="card-title">📌 업데이트 노트</span>
        <span style="font-size:11px;color:var(--text3)">${updates.length}건</span>
      </div>
      <div style="padding:.5rem 0">
        ${updates.length ? updates.map(u => `
          <div style="padding:14px 1.25rem;border-bottom:1px solid var(--border);position:relative">
            <div style="display:flex;align-items:flex-start;gap:12px">
              <div style="width:2px;background:var(--tg);border-radius:2px;position:absolute;left:1.25rem;top:0;bottom:0;opacity:.3"></div>
              <div style="flex:1;padding-left:16px">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                  <span style="font-size:12px;color:var(--text3)">${new Date(u.created_at).toLocaleDateString('ko-KR')}</span>
                  ${u.title ? `<span style="font-size:13px;font-weight:600">${u.title}</span>` : ''}
                </div>
                <div style="font-size:13px;line-height:1.7;color:var(--text2)">${renderMarkdown(u.content_md)}</div>
                ${u.blog_url ? `<a href="${u.blog_url}" target="_blank" style="font-size:11px;color:var(--tg);margin-top:6px;display:inline-block">📰 원본 ↗</a>` : ''}
                <div style="display:flex;gap:6px;justify-content:flex-end;margin-top:8px">
                  <button class="btn btn-sm" onclick="openCmpAnalysisModal('${code}','','update','${u.id}')">수정</button>
                  <button class="btn btn-sm" style="color:var(--red)" onclick="deleteCmpAnalysis(${u.id})">삭제</button>
                </div>
              </div>
            </div>
          </div>`).join('') :
          `<div style="text-align:center;padding:2rem;color:var(--text3);font-size:13px">업데이트 노트 없음</div>`}
      </div>
    </div>`;
}

// ══════════════════════════════════════════
//  기업 기본정보 편집 모달
// ══════════════════════════════════════════
async function openCmpInfoModal(code, section = 'overview') {
  const { data: ci } = await sb.from('company_info').select('*').eq('stock_code', code).single();
  const d = ci || {};

  const existing = document.getElementById('m-cmp-info');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'm-cmp-info';
  overlay.className = 'modal-overlay open';
  overlay.innerHTML = `
    <div class="modal" style="width:680px;max-width:96vw;max-height:90vh;overflow-y:auto">
      <div class="modal-header">
        <span class="modal-title">기업 정보 편집</span>
        <button class="modal-close" onclick="document.getElementById('m-cmp-info').remove()">×</button>
      </div>
      <div style="padding:1.25rem;display:flex;flex-direction:column;gap:14px">

        <div style="font-size:11px;font-weight:600;color:var(--text3);border-bottom:1px solid var(--border);padding-bottom:6px">기업 개황</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          ${_cmpInp('ceo_nm',    '대표이사',  d.ceo_nm    || '')}
          ${_cmpInp('est_dt',    '설립일 (YYYYMMDD)', d.est_dt || '')}
          ${_cmpInp('acc_mt',    '결산월',     d.acc_mt    || '')}
          ${_cmpInp('hm_url',    '홈페이지',   d.hm_url    || '')}
          ${_cmpInp('ir_url',    'IR URL',     d.ir_url    || '')}
          ${_cmpInp('adres',     '주소',       d.adres     || '')}
        </div>

        <div style="font-size:11px;font-weight:600;color:var(--text3);border-bottom:1px solid var(--border);padding-bottom:6px">사업 내용</div>
        ${_cmpTa('business_summary', '핵심 사업 요약', d.business_summary || '', 3)}
        ${_cmpTa('main_products',    '주요 제품/서비스 (쉼표 또는 줄바꿈 구분)', d.main_products || '', 3)}
        ${_cmpTa('main_customers',   '주요 고객사', d.main_customers || '', 2)}
        ${_cmpTa('competitors',      '경쟁사', d.competitors || '', 2)}
        ${_cmpTa('business_detail_md', '상세 사업 내용 (마크다운)', d.business_detail_md || '', 8)}

        <div style="font-size:11px;font-weight:600;color:var(--text3);border-bottom:1px solid var(--border);padding-bottom:6px">밸류에이션</div>
        ${_cmpTa('valuation_md', '밸류에이션 근거 (마크다운)', d.valuation_md || '', 4)}

        <div style="display:flex;justify-content:flex-end;gap:8px">
          <button class="btn" onclick="document.getElementById('m-cmp-info').remove()">취소</button>
          <button class="btn btn-primary" onclick="saveCmpInfo('${code}')">저장</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

function _cmpInp(id, label, val) {
  return `<div>
    <div style="font-size:12px;color:var(--text2);margin-bottom:4px">${label}</div>
    <input class="form-input" id="cmpf-${id}" value="${val.replace(/"/g,'&quot;')}" style="width:100%;box-sizing:border-box">
  </div>`;
}
function _cmpTa(id, label, val, rows = 4) {
  return `<div>
    <div style="font-size:12px;color:var(--text2);margin-bottom:4px">${label}</div>
    <textarea class="form-input" id="cmpf-${id}" rows="${rows}"
      style="width:100%;box-sizing:border-box;resize:vertical;font-size:13px;line-height:1.6">${val}</textarea>
  </div>`;
}

async function saveCmpInfo(code) {
  const g = id => document.getElementById(`cmpf-${id}`)?.value?.trim() || null;
  const payload = {
    stock_code:          code,
    ceo_nm:              g('ceo_nm'),
    est_dt:              g('est_dt'),
    acc_mt:              g('acc_mt'),
    hm_url:              g('hm_url'),
    ir_url:              g('ir_url'),
    adres:               g('adres'),
    business_summary:    g('business_summary'),
    main_products:       g('main_products'),
    main_customers:      g('main_customers'),
    competitors:         g('competitors'),
    business_detail_md:  g('business_detail_md'),
    valuation_md:        g('valuation_md'),
    updated_at:          new Date().toISOString(),
  };
  await sb.from('company_info').upsert(payload, {onConflict:'stock_code'});
  document.getElementById('m-cmp-info').remove();
  toast('저장됐습니다', 'success');
  cmpTab('overview');
}

// ══════════════════════════════════════════
//  기업분석 노트 작성/수정 모달
// ══════════════════════════════════════════
async function openCmpAnalysisModal(code, corpName, type = 'report', editId = null) {
  let existing_data = {};
  if (editId) {
    const { data } = await sb.from('company_analysis').select('*').eq('id', editId).single();
    existing_data = data || {};
    type = existing_data.type || type;
  }

  const isReport = type === 'report';
  const m = document.getElementById('m-cmp-analysis');
  if (m) m.remove();

  const overlay = document.createElement('div');
  overlay.id = 'm-cmp-analysis';
  overlay.className = 'modal-overlay open';
  overlay.style.zIndex = '1100';
  overlay.innerHTML = `
    <div class="modal" style="width:780px;max-width:96vw;max-height:92vh;display:flex;flex-direction:column">
      <div class="modal-header" style="flex-shrink:0">
        <span class="modal-title">${isReport ? '📋 종합 리포트' : '📌 업데이트 노트'} ${editId ? '수정' : '작성'}</span>
        <button class="modal-close" onclick="document.getElementById('m-cmp-analysis').remove()">×</button>
      </div>
      <div style="padding:1.25rem;display:flex;flex-direction:column;gap:12px;overflow-y:auto;flex:1">
        <input class="form-input" id="cmpan-title" placeholder="${isReport ? '리포트 제목 (선택)' : '업데이트 제목 (예: Q1 실적 발표 리뷰)'}"
          value="${existing_data.title || ''}" style="width:100%;box-sizing:border-box">
        <input class="form-input" id="cmpan-blog_url" placeholder="블로그 원본 URL (선택)"
          value="${existing_data.blog_url || ''}" style="width:100%;box-sizing:border-box">

        <div style="display:flex;align-items:center;justify-content:space-between">
          <div style="font-size:12px;color:var(--text2)">
            본문 <span style="color:var(--text3);font-size:11px"># 제목  **굵게**  - 목록  > 인용</span>
          </div>
          <button onclick="wlToggleAnalysisPreview()" style="font-size:11px;padding:3px 10px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;color:var(--text2)">미리보기</button>
        </div>
        <textarea class="form-input" id="wl-analysis_md"
          placeholder="## 핵심 요약&#10;...&#10;&#10;## 투자 포인트&#10;- ...&#10;&#10;## 리스크&#10;- ..."
          oninput="wlLivePreview()"
          style="width:100%;box-sizing:border-box;height:340px;resize:vertical;font-family:monospace;font-size:13px;line-height:1.6">${existing_data.content_md || ''}</textarea>
        <div id="wl-analysis-preview" style="display:none;padding:14px 16px;background:var(--bg2);border:1px solid var(--border);border-radius:8px;font-size:13px;line-height:1.8;max-height:340px;overflow-y:auto"></div>
      </div>
      <div style="padding:1rem 1.25rem;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px;flex-shrink:0">
        <button class="btn" onclick="document.getElementById('m-cmp-analysis').remove()">취소</button>
        <button class="btn btn-primary" onclick="saveCmpAnalysis('${code}','${corpName}','${type}',${editId||'null'})">저장</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

async function saveCmpAnalysis(code, corpName, type, editId) {
  const title   = document.getElementById('cmpan-title')?.value?.trim() || null;
  const blogUrl = document.getElementById('cmpan-blog_url')?.value?.trim() || null;
  const content = document.getElementById('wl-analysis_md')?.value?.trim() || null;
  if (!content) { toast('본문을 입력하세요', 'error'); return; }

  const payload = {
    stock_code: code, corp_name: corpName,
    type, title, blog_url: blogUrl, content_md: content,
    updated_at: new Date().toISOString(),
  };
  if (editId) {
    await sb.from('company_analysis').update(payload).eq('id', editId);
  } else {
    // 종합 리포트는 1개만 유지 (기존 삭제 후 삽입)
    if (type === 'report') {
      await sb.from('company_analysis').delete().eq('stock_code', code).eq('type', 'report');
    }
    await sb.from('company_analysis').insert({...payload, created_at: new Date().toISOString()});
  }
  document.getElementById('m-cmp-analysis').remove();
  toast('저장됐습니다', 'success');
  cmpTab('analysis');
}

async function deleteCmpAnalysis(id) {
  if (!confirm('삭제하시겠습니까?')) return;
  await sb.from('company_analysis').delete().eq('id', id);
  toast('삭제됐습니다', 'success');
  cmpTab('analysis');
}
