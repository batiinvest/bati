// report.js — 기업 분석 리포트 페이지 (상태·검색·데이터 로드·메인 렌더·탭 전환)
// FnGuide 기업현황 스타일 구성: 지표밴드 → 시세/차트 → 투자논거 → 컨센서스 → 연간실적 → 밸류에이션 → 실적트렌드 → 탭
// 분할: report-cards.js(서브 컴포넌트 카드), report-dart.js(DART 분석 탭·MD 파서·업로드)
// 의존: config.js (sb, fmtCap 등)

// ── 상태 ──────────────────────────────────────────────────────────────────────
// FnGuide식 메인 탭 (인덱스 하드코딩 금지 — RP_TABS.indexOf('...')로 참조)
const RP_TABS = ['기업현황','기업개요','사업분석','재무분석','동종비교','투자지표','지분현황','최근리포트','금감원공시','수급흐름','DART 분석'];
let _rpStock     = null;   // 선택된 종목 { code, name }
let _rpData      = {};     // 로드된 데이터 캐시
let _rpSegCache  = null;   // 제품별 차트 캐시
let _rpSegSel    = null;   // 선택된 세그먼트명 (null = 전체)
let _rpSegMode   = 'quarter'; // 매출 트렌드 축: 'quarter'(분기·기본) | 'year'(연간)

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
            border-radius:var(--radius-sm);background:var(--bg3);color:var(--text);font-size:calc(13px*var(--m-body))">
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
        <span style="font-size:calc(18px*var(--m-title));font-weight:700">${escapeHtml(_rpStock.name)}</span>
        <span style="font-size:calc(12px*var(--m-sub));color:var(--text3);font-family:monospace">${_rpStock.code}</span>
        <span id="rp-industry-badge" style="font-size:calc(11px*var(--m-label));padding:2px 8px;border-radius:100px;background:var(--bg3);color:var(--text2)">—</span>
        <span id="rp-market-badge"   style="font-size:calc(11px*var(--m-label));padding:2px 8px;border-radius:100px;background:var(--bg3);color:var(--text2)">—</span>
        <div style="margin-left:auto;display:flex;align-items:center;gap:8px">
          <span id="rp-price-badge" style="font-size:var(--fs-value);font-weight:700;font-variant-numeric:tabular-nums">—</span>
          <span id="rp-chg-badge"   style="font-size:calc(12px*var(--m-sub))">—</span>
        </div>
      </div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:10px">
        <span style="font-size:calc(11px*var(--m-label));color:var(--text3)">시총 <span id="rp-cap-val" style="color:var(--text);font-weight:600">—</span></span>
        <span style="font-size:calc(11px*var(--m-label));color:var(--text3)">PER <span id="rp-per-val" style="color:var(--text);font-weight:600">—</span></span>
        <span style="font-size:calc(11px*var(--m-label));color:var(--text3)">PBR <span id="rp-pbr-val" style="color:var(--text);font-weight:600">—</span></span>
        <span style="font-size:calc(11px*var(--m-label));color:var(--text3)">ROE <span id="rp-roe-val" style="color:var(--text);font-weight:600">—</span></span>
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
    <div style="width:56px;height:56px;border-radius:50%;background:color-mix(in srgb, var(--tg) 12%, transparent);
      display:flex;align-items:center;justify-content:center">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <path d="M9 17l3-3-3-3M13 17h3M4 6h16M4 10h8" stroke="var(--tg)" stroke-width="1.8" stroke-linecap="round"/>
      </svg>
    </div>
    <div>
      <div style="font-size:calc(18px*var(--m-title));font-weight:700;margin-bottom:6px">기업 분석 리포트</div>
      <div style="font-size:calc(13px*var(--m-body));color:var(--text2);line-height:1.6">
        20년+ 수석 펀드매니저 관점의 투자 분석<br>
        시세 · 컨센서스 · 실적 · 밸류에이션 · 재무를 한 화면에
      </div>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;max-width:400px">
      ${examples.map(n => `
        <button onclick="rpQuickSearch('${n}')"
          style="padding:5px 12px;border:1px solid var(--border);border-radius:100px;
            background:var(--bg3);color:var(--text1);font-size:calc(12px*var(--m-sub));cursor:pointer">
          ${n}
        </button>`).join('')}
    </div>
  </div>`;
}

function _rpSkeleton() {
  return `<div style="text-align:center;padding:40px;color:var(--text2);font-size:calc(13px*var(--m-body))">
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
        <span style="font-size:calc(13px*var(--m-body));font-weight:500">${escapeHtml(r.name)}</span>
        <span style="font-size:calc(12px*var(--m-sub));color:var(--text1)">${r.code}</span>
        <span style="font-size:calc(12px*var(--m-sub));color:var(--text1);margin-left:auto">${escapeHtml(r.industry||'')}</span>
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

// ── 종목 리포트 요청 기억 ─────────────────────────────────────────────────────────
// 같은 종목에서 같은 DB 요청은 한 번만(탭끼리 공유) — 10-24 측정: 탭 11개 한 바퀴에 요청 53번 중 약 14번이
// 똑같은 요청의 반복(공시·내부자 거래·사업 데이터·재무·수급 판정), companies는 칸 목록만 바꿔 11번.
// rpLoadReport(종목 열기·업로드 뒤 다시 그리기)에서 비움. 실패한 요청은 기억하지 않음.
// 받는 쪽이 배열을 고쳐도(정렬·덧붙이기) 다른 탭에 번지지 않게 data 배열은 매번 얕은 복사로 건넴
const RPQ = { code: null, m: new Map() };
function _rpQ(key, make) {
  const code = _rpStock?.code || '';
  if (RPQ.code !== code) { RPQ.code = code; RPQ.m.clear(); }
  let p = RPQ.m.get(key);
  if (!p) {
    p = Promise.resolve(make()).then(r => { if (r?.error) throw r.error; return r; });
    RPQ.m.set(key, p);
    p.catch(() => { if (RPQ.m.get(key) === p) RPQ.m.delete(key); });
  }
  return p.then(r => r && Array.isArray(r.data) ? { ...r, data: r.data.slice() } : r);
}
const _rpQReset = () => RPQ.m.clear();
// 이 종목 companies 한 줄 — 탭마다 필요한 칸을 합쳐 한 번만
const _RP_COMP_COLS = 'code,name,corp_code,market,sector,product,industry,sub_industry,wics_sector';
const _rpCompany = code => _rpQ('companies:' + code, () => sb.from('companies').select(_RP_COMP_COLS).eq('code', code).maybeSingle());
// 증권사 의견 최근 100건 — 기업현황·최근리포트·DART 분석 공용(계산은 report-tabs.js _rpConsensusSummary)
const _rpAnalyst = code => _rpQ('analyst:' + code, () => sb.from('analyst_opinions')
  .select('firm_name,opinion,prev_opinion,target_price,gap_rate,opinion_date,opinion_code')
  .eq('stock_code', code).order('opinion_date', { ascending: false }).limit(100));
// 공시 최근 150건(금감원공시·DART 분석·기업개요 최근 8건) · 지분 공시 40건(지분현황·DART 분석)
const _RP_DISC_COLS = 'base_date,report_nm,category,rcept_no,insider_summary';
const _rpDiscAll = cc => _rpQ('disc:' + cc, () => sb.from('daily_disclosures').select(_RP_DISC_COLS)
  .eq('corp_code', cc).order('base_date', { ascending: false }).limit(150));
const _rpDiscOwn = cc => _rpQ('discOwn:' + cc, () => sb.from('daily_disclosures').select(_RP_DISC_COLS)
  .eq('corp_code', cc).in('category', typeof _RP_OWN_CATS !== 'undefined' ? _RP_OWN_CATS : []).order('base_date', { ascending: false }).limit(40));

// ── 리포트 로드 ───────────────────────────────────────────────────────────────
async function rpLoadReport() {
  const inp = document.getElementById('rp-search');
  if (!_rpStock && inp?.value?.trim()) {
    const q = inp.value.trim();
    const { data } = await searchCompanies(q, { cols: 'code,name', limit: 1, orderBy: null });
    if (data?.[0]) _rpStock = { code: data[0].code, name: data[0].name };
  }
  if (!_rpStock) { toast('종목을 선택해주세요.', 'warn'); return; }
  _rpQReset();   // 리포트를 새로 열면 기억한 요청을 비우고 새로 받음

  // 페이지 재렌더링
  const el = document.getElementById('content');
  if (el) el.innerHTML = pReport();

  const body = document.getElementById('rp-body');
  if (body) body.innerHTML = _rpSkeleton();

  // 병렬 데이터 로드
  try {
    const [priceRes, finRes, dartRes, analystRes, segRes, compRes, summaryRes] = await Promise.all([
      sb.from('market_data').select('price,price_change,price_change_rate,market_cap,volume,trading_value,foreign_hold_rate,w52_high,w52_low,per,pbr,base_date,week_return,month_return,quarter_return,year_return')
        .eq('stock_code', _rpStock.code).order('base_date', { ascending: false }).limit(500),
      loadFinPreferred(_rpStock.code, 'bsns_year,quarter,revenue,operating_profit,net_income,total_assets,total_equity,debt_ratio,roe,roa,operating_margin,net_margin,ebitda,fcf,da', { limit: 24 }),
      sb.from('dart_reports').select('report_type,receive_date,summary')
        .eq('stock_code', _rpStock.code).order('receive_date', { ascending: false }).limit(1).maybeSingle(),
      // 모든 의견(매수만 6건 받던 것 → 의견 분포가 늘 매수뿐이었다) — 계산은 _rpConsensusSummary(3개월·증권사별 마지막)
      _rpAnalyst(_rpStock.code),
      sb.from('dart_segment_revenue')
        .select('bsns_year,quarter,segment_type,category,subcategory,revenue,revenue_ratio')
        .eq('stock_code', _rpStock.code).eq('segment_type','product')
        .order('bsns_year', { ascending: true }).order('quarter', { ascending: true }),
      _rpCompany(_rpStock.code),
      // 오늘의 공시·뉴스 요약 (백엔드 18:55 생성 — 최신 1건)
      sb.from('daily_summaries').select('base_date,disclosure_cnt,news_cnt,is_major,ai_summary,items')
        .eq('stock_code', _rpStock.code).order('base_date', { ascending: false }).limit(1).maybeSingle(),
    ]);

    // financials의 Q4는 분기 순액 — 연간은 4분기 합산(_rpAggAnnual)으로 파생
    const finRows = finRes.data || [];
    _rpData = {
      price:    priceRes.data   || [],
      fin:      finRows.slice(0, 12),
      dart:     dartRes.data    || null,
      analyst:  analystRes.data || [],
      segment:  (segRes.data || []).filter(r => r.segment_type === 'product'),
      annual:   _rpAggAnnual(finRows).reverse(), // 최신 연도 먼저
      company:  compRes.data    || null,
      summary:  summaryRes.data || null,
    };
    rpRenderReport();
    // peer 비교 데이터 비동기 로드 (렌더 후)
    _rpLoadPeerStats().catch(() => {});
  } catch (e) {
    if (body) body.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--red);font-size:calc(13px*var(--m-body))">데이터 로드 실패: ${e.message}</div>`;
  }
}

// ── 동종업체 밸류에이션 비교 (비동기) ────────────────────────────────────────
async function _rpLoadPeerStats() {
  if (!_rpStock) return;
  const code = _rpStock.code;

  // 1. 비교 집단 — 같은 소분류(예: 전공정장비) 전체, 5곳 미만이면 같은 업종 전체.
  //    예전엔 업종에서 조회 순서상 앞 50곳(반도체 228곳 중 사실상 무작위 — 장비·소재·팹리스가 섞임)
  const { data: comp } = await _rpCompany(code);
  if (!comp?.industry) return;
  const members = col => fetchAllPages((s, e) => sb.from('companies').select('code')
    .eq(col, comp[col]).eq('active', true).neq('code', code).order('code').range(s, e)).then(d => d.map(r => r.code));
  let codes = comp.sub_industry ? await members('sub_industry') : [];
  let label = `${comp.sub_industry} 동종`;
  if (codes.length < 5) { codes = await members('industry'); label = `${comp.industry} 업종`; }
  if (!codes.length) return;

  // 2·3. 최신 거래일 PER·PBR·시총 (market_data) + 최근 2년 재무(최근 4분기 ROE·ROA·순이익용, 페이지로 다 받음)
  const baseDate = _rpData.price?.[0]?.base_date;
  const yFrom = Number(String(baseDate || new Date().getFullYear()).slice(0, 4)) - 2;
  const [mktRes, finRows] = await Promise.all([
    baseDate
      ? sb.from('market_data').select('stock_code,per,pbr,market_cap').in('stock_code', codes).eq('base_date', baseDate)
      : sb.from('market_data').select('stock_code,per,pbr,market_cap').in('stock_code', codes).order('base_date', { ascending: false }),
    fetchAllPages((s, e) => sb.from('financials')
      .select('stock_code,fs_div,is_cumulative,bsns_year,quarter,net_income,total_equity,total_assets,operating_margin')
      .in('stock_code', codes).gte('bsns_year', yFrom)
      .order('stock_code').order('bsns_year', { ascending: false }).order('quarter', { ascending: false })
      .order('fs_div').range(s, e)),
  ]);

  // 4. 종목별 최신 1건
  const latestMkt = {}, latestFin = {};
  for (const r of (mktRes.data || [])) {
    if (!latestMkt[r.stock_code]) latestMkt[r.stock_code] = r;
  }
  // 종목별 CFS 우선·OFS 폴백 + 4분기 연간값 행 정리 → 최신 행(영업이익률)·최근 4분기 ROE·ROA·순이익(이 종목과 같은 기준)
  const finBy = {};
  for (const r of finNormalizeQuarters(finPreferFs(finRows))) (finBy[r.stock_code] ||= []).push(r);
  for (const [c, rows] of Object.entries(finBy)) {
    rows.sort((x, y) => String(y.bsns_year).localeCompare(String(x.bsns_year)) || String(y.quarter).localeCompare(String(x.quarter)));
    latestFin[c] = { ...rows[0], ..._rpTtmRatios(rows), niTtm: _rpTtmSum(rows, 'net_income') };
  }

  // 5. 중앙값 계산
  const median = arr => {
    const s = arr.filter(v => v != null && v > 0 && isFinite(v)).sort((a,b) => a-b);
    if (!s.length) return null;
    const m = Math.floor(s.length / 2);
    return s.length % 2 === 0 ? (s[m-1] + s[m]) / 2 : s[m];
  };

  _rpData.peerStats = {
    industry: comp.industry, label,
    count: codes.length,
    per: median(Object.values(latestMkt).map(r => r.per)),
    // 최근 4분기 이익 기준 PER(이 종목 카드의 두 번째 PER과 같은 기준) — 시총 ÷ 최근 4분기 순이익, 적자는 빼고
    perTtm: median(Object.entries(latestMkt).map(([c, m]) => m.market_cap > 0 && latestFin[c]?.niTtm > 0 ? m.market_cap / latestFin[c].niTtm : null)),
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
  <div class="card" data-capture-off style="padding:0;overflow:hidden;position:sticky;top:0;z-index:var(--z-sticky)">
    <div style="display:flex;background:var(--bg2);overflow-x:auto;scrollbar-width:none">
      ${RP_TABS.map((t,i) => `
        <button onclick="rpSetTab(${i})" id="rp-tabbtn-${i}"
          style="flex:1 0 auto;padding:11px 14px;font-size:calc(14px*var(--m-body));font-weight:600;border:none;white-space:nowrap;
            background:none;cursor:pointer;border-bottom:2px solid ${i===0?'var(--tg)':'transparent'};
            color:${i===0?'var(--tg)':'var(--text3)'};transition:all .2s">${t}</button>`).join('')}
    </div>
  </div>

  <!-- ③ 탭 컨텐츠 ─────────────────────────────────────────────────── -->
  <div id="rp-tab-body" style="display:flex;flex-direction:column;gap:14px"></div>

  `;
  } catch(err) {
    console.error('[rpRenderReport] 렌더 에러:', err);
    body.innerHTML = `<div style="padding:20px;color:var(--red);font-size:calc(13px*var(--m-body))">
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
    const ttm = _rpTtmRatios(_rpData.fin);   // 최근 4분기 순이익 기준(연간)
    if (ttm.roe != null) _set('rp-roe-val', ttm.roe.toFixed(1) + '%');
    const comp = _rpData.company;
    if (comp?.market)   _set('rp-market-badge', comp.market);
    if (comp?.industry) _set('rp-industry-badge', comp.industry);
  } catch(e) {}
}

// ── 기업현황 탭 (FnGuide c1010001 — 시세·논거·컨센서스·연간실적·밸류·트렌드) ──
// 핵심 투자포인트·리스크(Bull/Bear) 카드 — 기업현황·DART 분석 탭 공용 (DART 업로드 시 요약 summary의 제목 목록)
function _rpBullBearCard(dartPts = [], dartRisks = []) {
  dartPts = dartPts || []; dartRisks = dartRisks || [];

  const bullHTML = dartPts.length
      ? `<div style="display:flex;flex-direction:column;gap:5px" id="rp-bull-points">
          ${dartPts.slice(0,4).map(t => `<div style="display:flex;align-items:flex-start;gap:8px">
            <span style="color:#4ade80;font-weight:700;font-size:calc(14px*var(--m-body));margin-top:1px">•</span>
            <span style="font-size:calc(13px*var(--m-body));color:var(--text1);line-height:1.5">${escapeHtml(t)}</span>
          </div>`).join('')}
          <div style="font-size:calc(11px*var(--m-label));color:var(--text3);margin-top:2px">* DART 분석 기반 자동 추출</div>
        </div>`
      : `<div id="rp-bull-points" style="font-size:calc(13px*var(--m-body));color:var(--text3)">DART 분석 투자포인트가 아직 없습니다</div>`;

  const bearHTML = dartRisks.length
    ? `<div style="display:flex;flex-direction:column;gap:5px">
        ${dartRisks.slice(0,4).map(t => `<div style="display:flex;align-items:flex-start;gap:8px">
          <span style="color:#f87171;font-weight:700;font-size:calc(14px*var(--m-body));margin-top:1px">•</span>
          <span style="font-size:calc(13px*var(--m-body));color:var(--text1);line-height:1.5">${escapeHtml(t)}</span>
        </div>`).join('')}
      </div>`
    : `<div style="font-size:calc(13px*var(--m-body));color:var(--text3)">DART 분석 리스크가 아직 없습니다</div>`;

  return `
  <div class="card" style="padding:16px">
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:12px">
        <div style="background:var(--bg3);border-radius:var(--radius-sm);padding:12px">
          <div style="font-size:calc(13px*var(--m-body));font-weight:700;color:var(--text1);margin-bottom:10px;display:flex;align-items:center;gap:7px">
            <span style="width:3px;height:13px;border-radius:2px;background:#4ade80;display:inline-block"></span>
            핵심 투자포인트 (Bull Case)
          </div>
          ${bullHTML}
        </div>
        <div style="background:var(--bg3);border-radius:var(--radius-sm);padding:12px">
          <div style="font-size:calc(13px*var(--m-body));font-weight:700;color:var(--text1);margin-bottom:10px;display:flex;align-items:center;gap:7px">
            <span style="width:3px;height:13px;border-radius:2px;background:#f87171;display:inline-block"></span>
            주요 리스크 (Bear Case)
          </div>
          ${bearHTML}
        </div>
    </div>
  </div>`;
}

function _rpTabOverview() {
  const latest  = _rpData.price?.[0]  || {};
  const latestF = _rpData.fin?.[0]    || {};
  const prices  = _rpData.price       || [];
  const price   = latest.price   || 0;

  return `
  <!-- 시세 및 주주현황 + 주가/거래량 차트 -->
  ${_rpQuoteCard(latest, prices)}

  <!-- 오늘의 공시·뉴스 요약 (있을 때만) -->
  ${_rpSummaryCard(_rpData.summary)}

  <!-- 핵심 투자 논거 (Bull/Bear) -->
  ${_rpBullBearCard(_rpData.dart?.summary?.investment_points, _rpData.dart?.summary?.risk_points)}

  <!-- 투자의견 컨센서스 -->
  ${_rpConsensusCard(_rpData.analyst || [], price)}

  <!-- 연간 실적 요약 -->
  ${_rpAnnualTable(_rpData.annual, latest, _rpData.dart?.summary?.consensus)}

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
`;
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
  body.innerHTML = `<div class="card" data-capture-off style="padding:14px" id="rp-tab-card">
    <div style="text-align:center;color:var(--text2);padding:40px">
      <span class="loading"></span> ${name} 로딩 중...</div></div>`;
  const card = document.getElementById('rp-tab-card');

  switch (name) {
    case '기업개요':   await _rpLoadAndRenderProfile(card); return;      // FnGuide c1020001
    case '사업분석':   await _rpLoadAndRenderBiz(card); return;          // DART 4-1~4-6 그래프+표
    case '재무분석':   await _rpLoadAndRenderFinAnalysis(card); return;  // 차트(Chart.js·GPM/판관비 필터) + 상세표 통합
    case '동종비교':   await _rpLoadAndRenderPeers(card); return;        // 같은 세부 섹터 실적·수주잔고 (report-peers.js)
    case '투자지표':   await _rpLoadAndRenderInvMetrics(card); return;   // FnGuide c1040001
    case '지분현황':   await _rpLoadAndRenderOwnership(card); return;    // FnGuide c1070001
    case '최근리포트': await _rpLoadAndRenderReports(card); return;      // FnGuide c1080001
    case '금감원공시': await _rpLoadAndRenderFss(card); return;
    case '수급흐름':   await _rpLoadAndRenderFlow(card); return;
    case 'DART 분석':  await _rpLoadAndRenderDart(card); return;
  }
}

// ── 수급흐름 탭 ─────────────────────────────────────────────────────────────────
// 다른 화면에 있는 수급 기능을 모음: 수급 단계(기업분석 표·수급 지도와 같은 판정 — config.js flowGauge·flowIsEmpty·
// taerinEval, financials.js _finFlowQ) + 거래대금 추이 + 외국인·기관·프로그램 수급(종목 상세 창 수급 탭 _sdSupply)

// 판정(collect_flow_empty, 평일 18:50)이 있는 가장 최근 행 — 장중엔 오늘 행에 판정이 아직 없다(getFlowVerdicts와 같은 이유)
// 수급흐름 탭·DART 분석 공용 — 같은 종목은 한 번만(_rpQ)
function _rpFlowVerdict(code) {
  return _rpQ('flow:' + code, async () => {
    for (const cols of ['base_date,flow_gauge,flow_pctl,lead_flags', 'base_date,flow_pctl']) {   // 칸·주도 컬럼은 SQL 실행 후 생김
      const { data, error } = await sb.from('market_data').select(cols).eq('stock_code', code)
        .not('flow_quad', 'is', null).order('base_date', { ascending: false }).limit(1).maybeSingle();
      if (!error) return { data: data || null };
      if (error.code !== '42703') throw error;
    }
    return { data: null };
  }).then(r => r.data);
}

// 수급 단계 카드 — 수급 칸(바닥→상단 5칸·방향·단계 이름)·빈집·태린이아빠 후보. 이름·기준은 기업분석 표와 같음
function _rpFlowStageCard(v) {
  const gg = v?.flow_gauge && typeof flowGauge === 'function' ? flowGauge(v.flow_gauge) : null;
  const q  = v && typeof _finFlowQ === 'function' ? _finFlowQ(v) : null;
  const te = v?.lead_flags && typeof taerinEval === 'function' ? taerinEval(v.flow_gauge, v.lead_flags, v.flow_pctl) : null;
  const row = (k, val, tip) => `<tr${tip ? ` title="${escAttr(tip)}"` : ''}>
    <td style="padding:7px 10px;background:var(--bg3);color:var(--text2);white-space:nowrap;border-bottom:1px solid var(--border);width:130px">${k}</td>
    <td style="padding:7px 10px;color:var(--text1);border-bottom:1px solid var(--border)">${val}</td></tr>`;
  const rows = [
    gg && row('수급 칸', `${flowGaugeBar(gg)} <b style="color:${gg.color}">${gg.label}</b> <span style="color:var(--text2)">· ${gg.fill}/5칸 — ${escapeHtml(gg.tip)}</span>`,
      flowGaugeTip(v.flow_gauge, gg)),
    q && row('빈집', `<b>${q.label}</b> <span style="color:var(--text2)">· 칸 2개 이하가 빈집, 주도 업종 안이면 '빈집'</span>`),
    v?.lead_flags && row('주도 업종', v.lead_flags.lead ? '<b style="color:#f59e0b">주도 업종</b>' : '주도 업종 아님'),
    v?.lead_flags?.rs != null && row('RS', `${v.lead_flags.rs}`),
    te && row('태린이아빠 후보', te.label ? `<b style="color:#f59e0b">${te.label}</b>` : '해당 없음'),
  ].filter(Boolean);
  return `<div data-capture style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px">
    ${_rpSecT('수급 단계', v?.base_date ? `기준 ${escapeHtml(v.base_date)} · 기업분석 표와 같은 판정` : '')}
    ${rows.length ? `<table style="width:100%;border-collapse:collapse;font-size:calc(12px*var(--m-sub))">${rows.join('')}</table>`
      : `<div style="font-size:calc(12px*var(--m-sub));color:var(--text3);padding:10px 0;text-align:center">수급 판정 없음(수급 수집 대상 밖이거나 판정 전)</div>`}
  </div>`;
}

async function _rpLoadAndRenderFlow(body) {
  if (!_rpStock || !body) return;
  const v = await _rpFlowVerdict(_rpStock.code).catch(() => null);
  body.innerHTML = `<div style="display:flex;flex-direction:column;gap:12px">
    ${_rpFlowStageCard(v)}
    ${_rpTabFlow(_rpData.price)}
    <div data-capture style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px">
      ${_rpSecT('외국인 · 기관 · 프로그램 수급', '단위 주 · 종목 상세 창 수급 탭과 같음')}
      <div class="rp-flow-sd"></div>
    </div>
  </div>`;
  const el = body.querySelector('.rp-flow-sd');
  if (el && typeof _sdSupply === 'function') await _sdSupply(el, _rpStock.code, _rpStock.name);
}

function _rpTabFlow(prices) {
  if (!prices?.length) return `<div style="padding:20px;text-align:center;color:var(--text3);font-size:calc(12px*var(--m-sub))">수급 데이터 없음</div>`;
  const recent = prices.slice(0, 20).reverse();
  const maxTV  = Math.max(...recent.map(r => r.trading_value || 0));
  return `
  <div data-capture style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px">
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
    <div style="display:flex;justify-content:space-between;font-size:calc(11px*var(--m-label));color:var(--text3);margin-top:4px">
      <span>${(recent[0]?.base_date || '').slice(2)}</span>
      <span>${(recent[recent.length-1]?.base_date || '').slice(2)}</span>
    </div>
  </div>`;
}

// ── fmtNum 호환 헬퍼 ──────────────────────────────────────────────────────────
function fmtNum(v) {
  if (v == null) return '—';
  return Math.round(v).toLocaleString('ko-KR');
}
