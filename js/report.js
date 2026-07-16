// report.js — 기업 분석 리포트 페이지 (상태·검색·데이터 로드·메인 렌더·탭 전환)
// FnGuide 기업현황 스타일 구성: 지표밴드 → 시세/차트 → 투자논거 → 컨센서스 → 연간실적 → 밸류에이션 → 실적트렌드 → 탭
// 분할: report-cards.js(서브 컴포넌트 카드), report-dart.js(DART 분석 탭·MD 파서·업로드)
// 의존: config.js (sb, fmtCap 등)

// ── 상태 ──────────────────────────────────────────────────────────────────────
// FnGuide식 메인 탭 (인덱스 하드코딩 금지 — RP_TABS.indexOf('...')로 참조)
const RP_TABS = ['기업현황','기업개요','재무분석','투자지표','재무제표','지분현황','최근리포트','금감원공시','수급흐름','DART 분석'];
let _rpStock     = null;   // 선택된 종목 { code, name }
let _rpTab       = 'overview';  // 현재 탭
let _rpData      = {};     // 로드된 데이터 캐시
let _rpSegCache  = null;   // 제품별 차트 캐시
let _rpSegSel    = null;   // 선택된 세그먼트명 (null = 전체)

// ── 페이지 진입점 ─────────────────────────────────────────────────────────────
function pReport() {
  return `
  <div style="display:flex;flex-direction:column;gap:0;min-height:100%">

    <!-- 검색 바 -->
    <div style="padding:10px 14px;border-bottom:1px solid var(--border);background:var(--bg2);display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <input type="file" id="rp-dart-file" accept=".md" style="display:none" onchange="rpUploadDart(this)">
      <div style="position:relative;flex:1;max-width:320px">
        <input id="rp-search" type="text" placeholder="종목명 또는 코드 입력 (예: 삼성전자, 005930)"
          oninput="rpSearchInput(this.value)"
          style="width:100%;padding:6px 30px 6px 10px;border:1px solid var(--border);
            border-radius:var(--radius-sm);background:var(--bg3);color:var(--text);font-size:13px">
        <svg style="position:absolute;right:8px;top:50%;transform:translateY(-50%);width:13px;height:13px;color:var(--text3);pointer-events:none"
          viewBox="0 0 16 16" fill="none">
          <circle cx="6.5" cy="6.5" r="4" stroke="currentColor" stroke-width="1.5"/>
          <path d="M10 10l3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        <div id="rp-dropdown" style="display:none;position:absolute;top:calc(100%+4px);left:0;right:0;
          background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-sm);
          z-index:100;max-height:240px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,.3)"></div>
      </div>
      <button onclick="rpLoadReport()" class="btn btn-primary btn-sm">분석 리포트</button>
      <button onclick="document.getElementById('rp-dart-file').click()" class="btn btn-sm">DART 업로드</button>
    </div>

    ${_rpStock ? `
    <!-- 종목 헤더 바 -->
    <div id="rp-stock-header" style="padding:12px 16px;border-bottom:1px solid var(--border);background:var(--bg2)">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px">
        <span style="font-size:18px;font-weight:700">${escapeHtml(_rpStock.name)}</span>
        <span style="font-size:12px;color:var(--text3);font-family:monospace">${_rpStock.code}</span>
        <span id="rp-industry-badge" style="font-size:11px;padding:2px 8px;border-radius:100px;background:var(--bg3);color:var(--text2)">—</span>
        <span id="rp-market-badge"   style="font-size:11px;padding:2px 8px;border-radius:100px;background:var(--bg3);color:var(--text2)">—</span>
        <div style="margin-left:auto;display:flex;align-items:center;gap:8px">
          <span id="rp-price-badge" style="font-size:var(--fs-value);font-weight:700;font-variant-numeric:tabular-nums">—</span>
          <span id="rp-chg-badge"   style="font-size:12px">—</span>
        </div>
      </div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:10px">
        <span style="font-size:11px;color:var(--text3)">시총 <span id="rp-cap-val" style="color:var(--text);font-weight:600">—</span></span>
        <span style="font-size:11px;color:var(--text3)">PER <span id="rp-per-val" style="color:var(--text);font-weight:600">—</span></span>
        <span style="font-size:11px;color:var(--text3)">PBR <span id="rp-pbr-val" style="color:var(--text);font-weight:600">—</span></span>
        <span style="font-size:11px;color:var(--text3)">ROE <span id="rp-roe-val" style="color:var(--text);font-weight:600">—</span></span>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-sm btn-primary" onclick="rpLoadReport()">분석 리포트</button>
        <button class="btn btn-sm" onclick="openFinTrend&&openFinTrend('${_rpStock.code}','${escJsStr(_rpStock.name)}')">재무추이</button>
        <button class="btn btn-sm" onclick="go('comparison')">기업비교에 추가</button>
        <button class="btn btn-sm" onclick="scAddToWatchlist&&scAddToWatchlist('${_rpStock.code}','${escJsStr(_rpStock.name)}')">투자노트에 추가</button>
      </div>
    </div>` : ''}

    <!-- 리포트 본문 -->
    <div id="rp-body" style="flex:1;padding:16px;display:flex;flex-direction:column;gap:14px">
      ${_rpStock ? _rpSkeleton() : _rpLanding()}
    </div>

  </div>`;
}

function _rpLanding() {
  const examples = ['삼성전자', 'SK하이닉스', 'NAVER', 'LG에너지솔루션', '현대자동차'];
  return `
  <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
    padding:60px 20px;gap:20px;text-align:center">
    <div style="width:56px;height:56px;border-radius:50%;background:var(--tg)20;
      display:flex;align-items:center;justify-content:center">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <path d="M9 17l3-3-3-3M13 17h3M4 6h16M4 10h8" stroke="var(--tg)" stroke-width="1.8" stroke-linecap="round"/>
      </svg>
    </div>
    <div>
      <div style="font-size:18px;font-weight:700;margin-bottom:6px">기업 분석 리포트</div>
      <div style="font-size:13px;color:var(--text2);line-height:1.6">
        20년+ 수석 펀드매니저 관점의 투자 분석<br>
        시세 · 컨센서스 · 실적 · 밸류에이션 · 재무를 한 화면에
      </div>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;max-width:400px">
      ${examples.map(n => `
        <button onclick="rpQuickSearch('${n}')"
          style="padding:5px 12px;border:1px solid var(--border);border-radius:100px;
            background:var(--bg3);color:var(--text1);font-size:12px;cursor:pointer">
          ${n}
        </button>`).join('')}
    </div>
  </div>`;
}

function _rpSkeleton() {
  return `<div style="text-align:center;padding:40px;color:var(--text2);font-size:13px">
    <span class="loading"></span> 데이터 로딩 중...
  </div>`;
}

// ── 검색 ──────────────────────────────────────────────────────────────────────
let _rpSearchTimer = null;

function rpQuickSearch(name) {
  const inp = document.getElementById('rp-search');
  if (inp) { inp.value = name; rpSearchInput(name); }
}

async function rpSearchInput(q) {
  clearTimeout(_rpSearchTimer);
  const dd = document.getElementById('rp-dropdown');
  if (!dd) return;
  if (!q || q.length < 1) { dd.style.display = 'none'; return; }

  _rpSearchTimer = setTimeout(async () => {
    const { data } = await searchCompanies(q, { limit: 10 });

    if (!data?.length) { dd.style.display = 'none'; return; }

    dd.innerHTML = data.map(r => `
      <div onclick="rpSelectStock('${r.code}','${escJsStr(r.name)}')"
        style="padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--border);
          display:flex;align-items:center;gap:8px"
        onmouseover="this.style.background='var(--bg3)'"
        onmouseout="this.style.background=''">
        <span style="font-size:13px;font-weight:500">${escapeHtml(r.name)}</span>
        <span style="font-size:12px;color:var(--text1)">${r.code}</span>
        <span style="font-size:12px;color:var(--text1);margin-left:auto">${escapeHtml(r.industry||'')}</span>
      </div>`).join('');
    dd.style.display = 'block';
  }, 200);
}

function rpSelectStock(code, name) {
  _rpStock = { code, name };
  const dd = document.getElementById('rp-dropdown');
  const inp = document.getElementById('rp-search');
  if (dd)  dd.style.display = 'none';
  if (inp) inp.value = name;
  rpLoadReport();
}

// 외부(종목 상세 모달 등)에서 리포트로 진입 — 종목 프리셋 후 페이지 이동·로드
function openReportFor(code, name) {
  _rpStock = { code, name };
  if (typeof go === 'function') go('report'); // 라우팅 상태·네비·타이틀 동기화 (draw()가 pReport 렌더)
  rpLoadReport();                             // #content 재렌더 + 데이터 로드
}

// ── 리포트 로드 ───────────────────────────────────────────────────────────────
async function rpLoadReport() {
  const inp = document.getElementById('rp-search');
  if (!_rpStock && inp?.value?.trim()) {
    const q = inp.value.trim();
    const { data } = await searchCompanies(q, { cols: 'code,name', limit: 1, orderBy: null });
    if (data?.[0]) _rpStock = { code: data[0].code, name: data[0].name };
  }
  if (!_rpStock) { toast('종목을 선택해주세요.', 'warn'); return; }

  // 페이지 재렌더링
  const el = document.getElementById('content');
  if (el) el.innerHTML = pReport();

  const body = document.getElementById('rp-body');
  if (body) body.innerHTML = _rpSkeleton();

  // 병렬 데이터 로드
  try {
    const [priceRes, finRes, watchRes, dartRes, analystRes, segRes, compRes] = await Promise.all([
      sb.from('market_data').select('price,price_change,price_change_rate,market_cap,volume,trading_value,foreign_hold_rate,w52_high,w52_low,per,pbr,base_date,week_return,month_return,quarter_return,year_return')
        .eq('stock_code', _rpStock.code).order('base_date', { ascending: false }).limit(500),
      sb.from('financials').select('bsns_year,quarter,revenue,operating_profit,net_income,total_assets,total_equity,debt_ratio,roe,roa,operating_margin,net_margin,ebitda,fcf,da')
        .eq('stock_code', _rpStock.code).eq('fs_div','CFS').order('bsns_year', { ascending: false }).order('quarter', { ascending: false }).limit(24),
      sb.from('watchlist').select('note,target_price,opinion,buy_price,created_at')
        .eq('stock_code', _rpStock.code).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      sb.from('dart_reports').select('report_type,receive_date,summary')
        .eq('stock_code', _rpStock.code).order('receive_date', { ascending: false }).limit(1).maybeSingle(),
      sb.from('analyst_opinions').select('firm_name,opinion,target_price,gap_rate,opinion_date')
        .eq('stock_code', _rpStock.code).in('opinion_code',['1','2'])
        .order('opinion_date', { ascending: false }).limit(6),
      sb.from('dart_segment_revenue')
        .select('bsns_year,quarter,segment_type,category,revenue,revenue_ratio')
        .eq('stock_code', _rpStock.code).eq('segment_type','product')
        .order('bsns_year', { ascending: true }).order('quarter', { ascending: true }),
      sb.from('companies').select('market,sector,product,industry,sub_industry')
        .eq('code', _rpStock.code).maybeSingle(),
    ]);

    // financials의 Q4는 분기 순액 — 연간은 4분기 합산(_rpAggAnnual)으로 파생
    const finRows = finRes.data || [];
    _rpData = {
      price:    priceRes.data   || [],
      fin:      finRows.slice(0, 12),
      watch:    watchRes.data   || null,
      dart:     dartRes.data    || null,
      analyst:  analystRes.data || [],
      segment:  segRes.data     || [],
      annual:   _rpAggAnnual(finRows).reverse(), // 최신 연도 먼저
      company:  compRes.data    || null,
    };
    rpRenderReport();
    // peer 비교 데이터 비동기 로드 (렌더 후)
    _rpLoadPeerStats().catch(() => {});
  } catch (e) {
    if (body) body.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--red);font-size:13px">데이터 로드 실패: ${e.message}</div>`;
  }
}

// ── 동종업체 밸류에이션 비교 (비동기) ────────────────────────────────────────
async function _rpLoadPeerStats() {
  if (!_rpStock) return;

  // 1. 현재 종목 industry 조회
  const { data: comp } = await sb.from('companies')
    .select('industry').eq('code', _rpStock.code).maybeSingle();
  if (!comp?.industry) return;

  // 2. 같은 industry 종목 코드 조회 (본인 제외, 최대 50개)
  const { data: peerList } = await sb.from('companies')
    .select('code').eq('industry', comp.industry).neq('code', _rpStock.code).limit(50);
  if (!peerList?.length) return;

  const codes = peerList.map(p => p.code);

  // 3. 최신 PER/PBR (market_data) + ROE/ROA/영업이익률 (financials) 병렬 조회
  const [mktRes, finRes] = await Promise.all([
    sb.from('market_data').select('stock_code,per,pbr')
      .in('stock_code', codes).order('base_date', { ascending: false }),
    sb.from('financials').select('stock_code,roe,roa,operating_margin')
      .in('stock_code', codes).eq('fs_div','CFS')
      .order('bsns_year', { ascending: false }).order('quarter', { ascending: false }),
  ]);

  // 4. 종목별 최신 1건만 추출
  const latestMkt = {}, latestFin = {};
  for (const r of (mktRes.data || [])) {
    if (!latestMkt[r.stock_code]) latestMkt[r.stock_code] = r;
  }
  for (const r of (finRes.data || [])) {
    if (!latestFin[r.stock_code]) latestFin[r.stock_code] = r;
  }

  // 5. 중앙값 계산
  const median = arr => {
    const s = arr.filter(v => v != null && v > 0 && isFinite(v)).sort((a,b) => a-b);
    if (!s.length) return null;
    const m = Math.floor(s.length / 2);
    return s.length % 2 === 0 ? (s[m-1] + s[m]) / 2 : s[m];
  };

  _rpData.peerStats = {
    industry: comp.industry,
    count: peerList.length,
    per: median(Object.values(latestMkt).map(r => r.per)),
    pbr: median(Object.values(latestMkt).map(r => r.pbr)),
    roe: median(Object.values(latestFin).map(r => r.roe)),
    roa: median(Object.values(latestFin).map(r => r.roa)),
    opm: median(Object.values(latestFin).map(r => r.operating_margin)),
  };

  // 6. 스냅샷 밴드 업종PER + 밸류에이션 카드 재렌더
  const ip = document.getElementById('rp-snap-indper');
  if (ip && _rpData.peerStats.per != null) ip.textContent = _rpData.peerStats.per.toFixed(2);
  const el = document.getElementById('rp-val-card');
  if (el) el.outerHTML = _rpValuationCard(_rpData.fin?.[0] || {}, _rpData.price?.[0] || {});
}

// ── 리포트 렌더링 ─────────────────────────────────────────────────────────────
async function rpRenderReport() {
  const body = document.getElementById('rp-body');
  if (!body || !_rpStock) return;

  const latest  = _rpData.price?.[0]  || {};
  const latestF = _rpData.fin?.[0]    || {};
  const watch   = _rpData.watch;
  const prices  = _rpData.price       || [];

  const price   = latest.price   || 0;
  const chg     = latest.price_change_rate ?? 0;
  const chgCol = chg > 0 ? 'var(--red)' : chg < 0 ? 'var(--blue)' : 'var(--text3)';
  const chgTxt   = (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%';

  try {
  body.innerHTML = `

  <!-- ① 지표 스냅샷 밴드 (EPS·BPS·PER·업종PER·PBR·현재가) ─────────── -->
  ${_rpSnapshotBand(latest, _rpData.annual, _rpData.company)}

  <!-- ② FnGuide식 메인 탭 네비게이션 (지표밴드 바로 아래·sticky) ──── -->
  <div class="card" style="padding:0;overflow:hidden;position:sticky;top:0;z-index:var(--z-sticky)">
    <div style="display:flex;background:var(--bg2);overflow-x:auto;scrollbar-width:none">
      ${RP_TABS.map((t,i) => `
        <button onclick="rpSetTab(${i})" id="rp-tabbtn-${i}"
          style="flex:1 0 auto;padding:11px 14px;font-size:14px;font-weight:600;border:none;white-space:nowrap;
            background:none;cursor:pointer;border-bottom:2px solid ${i===0?'var(--tg)':'transparent'};
            color:${i===0?'var(--tg)':'var(--text3)'};transition:all .2s">${t}</button>`).join('')}
    </div>
  </div>

  <!-- ③ 탭 컨텐츠 ─────────────────────────────────────────────────── -->
  <div id="rp-tab-body" style="display:flex;flex-direction:column;gap:14px"></div>

  `;
  } catch(err) {
    console.error('[rpRenderReport] 렌더 에러:', err);
    body.innerHTML = `<div style="padding:20px;color:var(--red);font-size:13px">
      렌더 오류: ${err.message}<br>
      <small style="color:var(--text2)">콘솔에서 상세 확인</small>
    </div>`;
    return;
  }

  // 기업현황 탭 자동 로드
  rpSetTab(0);

  // 종목 헤더 바 업데이트
  const priceBadge = document.getElementById('rp-price-badge');
  const chgBadge   = document.getElementById('rp-chg-badge');
  if (priceBadge && price) priceBadge.textContent = fmtNum(price) + '원';
  if (chgBadge) chgBadge.innerHTML = `<span style="color:${chgCol}">${chgTxt}</span>`;

  // 헤더 바 추가 정보 (시총, PER, PBR, ROE, 산업, 시장) — 이미 로드된 데이터 재사용
  try {
    const _set = (id, txt) => { const el = document.getElementById(id); if(el) el.textContent = txt; };
    _set('rp-cap-val', latest.market_cap ? fmtCap(latest.market_cap) : '—');
    _set('rp-per-val', latest.per ? latest.per.toFixed(1)+'x' : '—');
    _set('rp-pbr-val', latest.pbr ? latest.pbr.toFixed(2) : '—');
    if (latestF.roe != null) _set('rp-roe-val', latestF.roe.toFixed(1) + '%');
    const comp = _rpData.company;
    if (comp?.market)   _set('rp-market-badge', comp.market);
    if (comp?.industry) _set('rp-industry-badge', comp.industry);
  } catch(e) {}
}

// ── 기업현황 탭 (FnGuide c1010001 — 시세·논거·컨센서스·연간실적·밸류·트렌드) ──
function _rpTabOverview() {
  const latest  = _rpData.price?.[0]  || {};
  const latestF = _rpData.fin?.[0]    || {};
  const watch   = _rpData.watch;
  const prices  = _rpData.price       || [];
  const price   = latest.price   || 0;

  // Bull / Bear HTML — 템플릿 리터럴 밖에서 미리 계산
  const dartPts  = _rpData.dart?.summary?.investment_points || [];
  const dartRisks = _rpData.dart?.summary?.risk_points || [];

  const bullHTML = watch?.note
    ? `<div id="rp-bull-points" style="font-size:14px;color:var(--text1);line-height:1.7">${_rpFormatNote(watch.note)}</div>`
    : dartPts.length
      ? `<div style="display:flex;flex-direction:column;gap:5px" id="rp-bull-points">
          ${dartPts.slice(0,4).map(t => `<div style="display:flex;align-items:flex-start;gap:8px">
            <span style="color:#4ade80;font-weight:700;font-size:14px;margin-top:1px">•</span>
            <span style="font-size:13px;color:var(--text1);line-height:1.5">${t}</span>
          </div>`).join('')}
          <div style="font-size:11px;color:var(--text3);margin-top:2px">* DART 분석 기반 자동 추출</div>
        </div>`
      : `<div style="display:flex;flex-direction:column;gap:6px" id="rp-bull-points">
          ${['핵심 투자포인트를 투자노트에 작성해주세요','예) HBM 수주 확대로 데이터센터 모멘텀 강화','예) 하반기 ASP 상승 + 원가 하락 → 마진 개선']
            .map((t,i) => `<div style="display:flex;align-items:flex-start;gap:8px">
              <span style="color:#4ade80;font-weight:700;font-size:14px;margin-top:1px">•</span>
              <span style="font-size:14px;color:${i===0?'var(--text3)':'var(--border)'}">${t}</span>
            </div>`).join('')}
        </div>`;

  const bearHTML = dartRisks.length
    ? `<div style="display:flex;flex-direction:column;gap:5px">
        ${dartRisks.slice(0,4).map(t => `<div style="display:flex;align-items:flex-start;gap:8px">
          <span style="color:#f87171;font-weight:700;font-size:14px;margin-top:1px">•</span>
          <span style="font-size:13px;color:var(--text1);line-height:1.5">${t}</span>
        </div>`).join('')}
      </div>`
    : `<div style="display:flex;flex-direction:column;gap:6px">
        ${['투자노트에 리스크 요인을 추가하세요','예) 미중 무역분쟁 재확대 시 수출 타격','예) 경쟁사 공격적 증설로 공급과잉 우려']
          .map((t,i) => `<div style="display:flex;align-items:flex-start;gap:8px">
            <span style="color:#f87171;font-weight:700;font-size:14px;margin-top:1px">•</span>
            <span style="font-size:14px;color:${i===0?'var(--text3)':'var(--border)'}">${t}</span>
          </div>`).join('')}
      </div>`;

  return `
  <!-- 시세 및 주주현황 + 주가/거래량 차트 -->
  ${_rpQuoteCard(latest, prices)}

  <!-- 핵심 투자 논거 (Bull/Bear) -->
  <div class="card" style="padding:16px">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div>
          <div style="font-size:13px;font-weight:700;color:var(--text1);margin-bottom:10px;display:flex;align-items:center;gap:7px">
            <span style="width:3px;height:13px;border-radius:2px;background:#4ade80;display:inline-block"></span>
            핵심 투자포인트 (Bull Case)
          </div>
          ${bullHTML}
        </div>
        <div style="border-left:1px solid var(--border);padding-left:16px">
          <div style="font-size:13px;font-weight:700;color:var(--text1);margin-bottom:10px;display:flex;align-items:center;gap:7px">
            <span style="width:3px;height:13px;border-radius:2px;background:#f87171;display:inline-block"></span>
            주요 리스크 (Bear Case)
          </div>
          ${bearHTML}
        </div>
    </div>
  </div>

  <!-- 투자의견 컨센서스 -->
  ${_rpConsensusCard(_rpData.analyst || [], price, watch)}

  <!-- 연간 실적 요약 -->
  ${_rpAnnualTable(_rpData.annual, latest)}

  <!-- 밸류에이션(밴드차트 포함) + 재무 건전성 -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
    ${_rpValuationCard(latestF, latest)}
    ${_rpFinHealthCard(latestF)}
  </div>

  <!-- 분기 실적 트렌드 + 제품별 매출 -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
    ${_rpEarningsCard(_rpData.fin)}
    ${_rpSegmentCard(_rpData.segment)}
  </div>

  <!-- 카탈리스트 -->
  ${_rpCatalystCard()}`;
}

// ── 탭 전환 (RP_TABS 순서 기준) ───────────────────────────────────────────────
async function rpSetTab(idx) {
  document.querySelectorAll('[id^="rp-tabbtn-"]').forEach((b, i) => {
    b.style.borderBottomColor = i === idx ? 'var(--tg)' : 'transparent';
    b.style.color = i === idx ? 'var(--tg)' : 'var(--text3)';
  });
  const body = document.getElementById('rp-tab-body');
  if (!body || !_rpStock) return;

  // 기업현황(0) — 이미 로드된 _rpData로 즉시 렌더 (카드 나열, 래퍼 없음)
  if (idx === 0) {
    body.innerHTML = _rpTabOverview();
    return;
  }

  // 나머지 탭 — 카드 래퍼 안에 로딩 후 각 로더가 채움
  const name = RP_TABS[idx] || '';
  body.innerHTML = `<div class="card" style="padding:14px" id="rp-tab-card">
    <div style="text-align:center;color:var(--text2);padding:40px">
      <span class="loading"></span> ${name} 로딩 중...</div></div>`;
  const card = document.getElementById('rp-tab-card');

  switch (name) {
    case '기업개요':   await _rpLoadAndRenderProfile(card); return;      // FnGuide c1020001
    case '재무분석':   await _rpLoadAndRenderFinAnalysis(card); return;  // FnGuide c1030001
    case '투자지표':   await _rpLoadAndRenderInvMetrics(card); return;   // FnGuide c1040001
    case '재무제표':   await _renderFinancialTab(card, _rpStock.code, _rpStock.name); return;
    case '지분현황':   await _rpLoadAndRenderOwnership(card); return;    // FnGuide c1070001
    case '최근리포트': await _rpLoadAndRenderReports(card); return;      // FnGuide c1080001
    case '금감원공시': await _rpLoadAndRenderFss(card); return;
    case '수급흐름':   card.innerHTML = _rpTabFlow(_rpData.price); return;
    case 'DART 분석':  await _rpLoadAndRenderDart(card); return;
  }
}

function _rpTabFlow(prices) {
  if (!prices?.length) return `<div style="padding:20px;text-align:center;color:var(--text3);font-size:12px">수급 데이터 없음</div>`;
  const recent = prices.slice(0, 20).reverse();
  const maxTV  = Math.max(...recent.map(r => r.trading_value || 0));
  return `
  <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px">
    ${_rpSecT('거래대금 추이', '* 최근 20거래일 · 색상=등락 방향')}
    <div style="display:flex;gap:2px;align-items:flex-end;height:60px">
      ${recent.map(r => {
        const tv  = r.trading_value || 0;
        const h   = maxTV > 0 ? Math.round(tv / maxTV * 54) + 4 : 4;
        const chg = r.price_change_rate ?? 0;
        const c   = chg > 0 ? 'var(--red)' : chg < 0 ? 'var(--blue)' : 'var(--text3)';
        return `<div style="flex:1;background:${c};opacity:.7;border-radius:1px 1px 0 0;
          height:${h}px" title="${r.base_date||''} ${fmtCap(tv)}"></div>`;
      }).join('')}
    </div>
    <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text3);margin-top:4px">
      <span>${(recent[0]?.base_date || '').slice(2)}</span>
      <span>${(recent[recent.length-1]?.base_date || '').slice(2)}</span>
    </div>
    <div style="font-size:11px;color:var(--text3);margin-top:8px">
      * 외국인/기관 상세 수급은 수급 분석 기능 연동 예정</div>
  </div>`;
}

// ── fmtNum 호환 헬퍼 ──────────────────────────────────────────────────────────
function fmtNum(v) {
  if (v == null) return '—';
  return Math.round(v).toLocaleString('ko-KR');
}
