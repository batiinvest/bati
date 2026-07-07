// report.js — 기업 분석 리포트 페이지 (상태·검색·데이터 로드·메인 렌더·탭 전환)
// 20년+ 수석 펀드매니저 관점의 투자 의사결정 중심 구성
// 분할: report-cards.js(서브 컴포넌트 카드), report-dart.js(DART 분석 탭·MD 파서·업로드)
// 의존: config.js (sb, fmtCap 등)

// ── 상태 ──────────────────────────────────────────────────────────────────────
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
        <span style="font-size:18px;font-weight:700">${_rpStock.name}</span>
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
        <button class="btn btn-sm" onclick="openFinTrend&&openFinTrend('${_rpStock.code}','${_rpStock.name}')">재무추이</button>
        <button class="btn btn-sm" onclick="go('comparison')">기업비교에 추가</button>
        <button class="btn btn-sm" onclick="scAddToWatchlist&&scAddToWatchlist('${_rpStock.code}','${_rpStock.name}')">투자노트에 추가</button>
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
        밸류에이션 · 실적 · 재무 · 수급 · 리스크를 한 화면에
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
      <div onclick="rpSelectStock('${r.code}','${r.name}')"
        style="padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--border);
          display:flex;align-items:center;gap:8px"
        onmouseover="this.style.background='var(--bg3)'"
        onmouseout="this.style.background=''">
        <span style="font-size:13px;font-weight:500">${r.name}</span>
        <span style="font-size:12px;color:var(--text1)">${r.code}</span>
        <span style="font-size:12px;color:var(--text1);margin-left:auto">${r.industry||''}</span>
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
    const [priceRes, finRes, watchRes, dartRes, analystRes, segRes] = await Promise.all([
      sb.from('market_data').select('price,price_change_rate,market_cap,volume,trading_value,foreign_hold_rate,w52_high,w52_low,per,pbr,base_date')
        .eq('stock_code', _rpStock.code).order('base_date', { ascending: false }).limit(500),
      sb.from('financials').select('bsns_year,quarter,revenue,operating_profit,net_income,total_assets,total_equity,debt_ratio,roe,roa,operating_margin,net_margin,ebitda,fcf,da,per,pbr')
        .eq('stock_code', _rpStock.code).eq('fs_div','CFS').order('bsns_year', { ascending: false }).order('quarter', { ascending: false }).limit(12),
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
    ]);

    _rpData = {
      price:    priceRes.data   || [],
      fin:      finRes.data     || [],
      watch:    watchRes.data   || null,
      dart:     dartRes.data    || null,
      analyst:  analystRes.data || [],
      segment:  segRes.data     || [],
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

  // 6. 밸류에이션 카드만 재렌더
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
  const mktCap  = latest.market_cap || 0;
  const fr      = latest.foreign_hold_rate;
  const chgCol = chg > 0 ? 'var(--red)' : chg < 0 ? 'var(--blue)' : 'var(--text3)';
  const chgTxt   = (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%';

  // 52주 고/저 — DB w52_high/w52_low 컬럼 사용 (최신 기준)
  const high52 = latest.w52_high || 0;
  const low52  = latest.w52_low  || 0;
  const pos52  = high52 > low52 ? Math.round((price - low52) / (high52 - low52) * 100) : 50;

  // 목표주가 (투자노트에서)
  const targetP = watch?.target_price || 0;
  const upside  = targetP && price ? ((targetP - price) / price * 100) : null;
  const opinion = watch?.opinion || null;

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
          <div style="font-size:12px;color:var(--text1);margin-top:2px">DART 분석 기반 자동 추출</div>
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

  try {
  body.innerHTML = `

  <!-- ① 종목 헤더 ──────────────────────────────────────────────────── -->
  <div class="card" style="padding:16px 20px">
    <div style="display:flex;align-items:flex-start;gap:20px;flex-wrap:wrap">

      <!-- 좌: 종목 기본 정보 -->
      <div style="min-width:0;flex-shrink:0">
        <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:4px">
          <span style="font-size:26px;font-weight:800">${_rpStock.name}</span>
          <span style="font-size:15px;color:var(--text1)">${_rpStock.code}</span>
          ${latest.per  ? `<span style="font-size:13px;padding:2px 9px;border-radius:100px;background:var(--bg3);color:var(--text1)">PER ${latest.per?.toFixed(1)}x</span>` : ''}
          ${latest.pbr  ? `<span style="font-size:13px;padding:2px 9px;border-radius:100px;background:var(--bg3);color:var(--text1)">PBR ${latest.pbr?.toFixed(2)}x</span>` : ''}
        </div>
        <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap">
          <span style="font-size:34px;font-weight:700">${price ? fmtNum(price) + '원' : '—'}</span>
          <span style="font-size:20px;font-weight:600;color:${chgCol}">${chgTxt}</span>
        </div>
        <div style="display:flex;gap:16px;margin-top:8px;flex-wrap:wrap">
          ${mktCap ? `<span style="font-size:14px;color:var(--text1)">시총 <b style="color:var(--text1)">${fmtCap(mktCap)}</b></span>` : ''}
          ${fr != null ? `<span style="font-size:14px;color:var(--text1)">외국인 <b style="color:var(--text1)">${fr.toFixed(1)}%</b></span>` : ''}
          ${latestF.roe ? `<span style="font-size:14px;color:var(--text1)">ROE <b style="color:var(--text1)">${latestF.roe?.toFixed(1)}%</b></span>` : ''}
          ${latest.trading_value ? `<span style="font-size:14px;color:var(--text1)">거래대금 <b style="color:var(--text1)">${fmtCap(latest.trading_value)}</b></span>` : ''}
          ${latest.volume ? `<span style="font-size:14px;color:var(--text1)">거래량 <b style="color:var(--text1)">${fmtNum(latest.volume)}</b></span>` : ''}
        </div>
        <!-- 52주 가격 위치 (시총 아래) -->
        ${high52 > 0 ? `
        <div style="margin-top:10px;width:200px">
          <div style="font-size:11px;color:var(--text1);margin-bottom:5px">52주 가격 위치</div>
          <div style="height:5px;border-radius:3px;background:var(--border);position:relative;margin:0 2px">
            <div style="position:absolute;left:0;top:0;height:100%;width:${pos52}%;
              background:linear-gradient(90deg,var(--blue),var(--tg));border-radius:3px"></div>
            <div style="position:absolute;top:-4px;left:calc(${pos52}% - 6px);width:12px;height:12px;
              border-radius:50%;background:white;border:2px solid var(--tg);box-shadow:0 1px 4px rgba(0,0,0,.3)"></div>
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:4px;font-size:11px;color:var(--text1)">
            <span>저 ${fmtNum(low52)}</span>
            <span style="font-weight:700;color:var(--tg)">${pos52}%</span>
            <span>고 ${fmtNum(high52)}</span>
          </div>
        </div>` : ''}
      </div>

      <!-- 중: 내 투자의견 + 증권사 목록 -->
      <div style="display:grid;grid-template-columns:140px 1fr;gap:12px;min-width:460px;
        padding:0 16px;border-left:1px solid var(--border);border-right:1px solid var(--border)">

        <!-- 내 의견 -->
        <div style="display:flex;flex-direction:column;gap:8px;border-right:1px solid var(--border);padding-right:12px">
          <div style="font-size:11px;font-weight:700;color:var(--text1);text-transform:uppercase;letter-spacing:.8px">내 투자 의견</div>
          ${_rpOpinionBadge(opinion)}
          ${targetP ? `
            <div style="text-align:center">
              <div style="font-size:11px;color:var(--text1)">목표주가</div>
              <div style="font-size:17px;font-weight:800;margin:2px 0">${fmtNum(targetP)}<span style="font-size:11px">원</span></div>
              ${upside != null ? `
              <div style="font-size:13px;font-weight:700;color:${upside>0?'var(--red)':'var(--blue)'}">
                ${upside>0?'▲':'▼'} ${Math.abs(upside).toFixed(1)}% ${upside>0?'상승여력':'하락위험'}
              </div>` : ''}
            </div>` :
            `<div style="text-align:center;padding:6px;border-radius:var(--radius-sm);background:var(--bg3);
              color:var(--text1);font-size:11px;line-height:1.5">
              투자노트에서<br>목표주가 설정
            </div>`}
          <a onclick="go('watchlist')" style="font-size:11px;text-align:center;color:var(--tg);
            cursor:pointer;margin-top:auto">투자노트 편집 →</a>
        </div>

        <!-- 증권사 목록 -->
        ${_rpAnalystList(_rpData.analyst || [], price)}

      </div>

      <!-- 우: 주가 미니 차트 -->
      ${(() => {
        const pts = [...prices].reverse().filter(r => r.price > 0);
        if (!pts.length) return '';
        const W = 220, H = 70;
        const pxVals = pts.map(r => r.price);
        const minP = Math.min(...pxVals);
        const maxP = Math.max(...pxVals);
        const range = maxP - minP || 1;
        const coords = pxVals.map((v, i) => {
          const x = (i / (pxVals.length - 1)) * W;
          const y = H - 4 - Math.round((v - minP) / range * (H - 8));
          return `${x.toFixed(1)},${y}`;
        }).join(' ');
        const firstP = pxVals[0], lastP = pxVals[pxVals.length - 1];
        const lineColor = lastP >= firstP ? '#f87171' : '#60a5fa';
        const n = pxVals.length;
        // 차트 내부 상하 패딩 (라벨 공간 확보)
        const PAD = 22;
        const getY = v => PAD + Math.round((1 - (v - minP) / range) * (H - PAD*2));

        // 좌표 재계산 (패딩 적용)
        const coordsPad = pxVals.map((v, i) => {
          const x = n > 1 ? (i / (n-1)) * W : W/2;
          return `${x.toFixed(1)},${getY(v)}`;
        }).join(' ');
        const fillPathPad = `M0,${H} L${coordsPad.split(' ').join(' L')} L${W},${H} Z`;

        const minIdx = pxVals.indexOf(minP);
        const maxIdx = pxVals.indexOf(maxP);
        const minX  = n > 1 ? (minIdx / (n-1)) * W : W/2;
        const maxX  = n > 1 ? (maxIdx / (n-1)) * W : W/2;
        const lastXc = n > 1 ? W : W/2;
        const minYc = getY(minP);
        const maxYc = getY(maxP);
        const lastYc = getY(lastP);

        // 오버레이 라벨 X% (가장자리 보정)
        const minXPct = n > 1 ? (minIdx / (n-1)) * 100 : 50;
        const maxXPct = n > 1 ? (maxIdx / (n-1)) * 100 : 50;
        // 고점 라벨: 우측 치우치면 왼쪽 정렬
        const maxLabelAlign = maxXPct > 70 ? 'right' : maxXPct < 30 ? 'left' : 'center';
        const maxLabelLeft  = maxLabelAlign === 'right'  ? 'auto' : `${Math.max(maxXPct,3)}%`;
        const maxLabelRight = maxLabelAlign === 'right'  ? `${Math.max(100-maxXPct,3)}%` : 'auto';
        // 저점 라벨: 우측 치우치면 왼쪽 정렬
        const minLabelAlign = minXPct > 70 ? 'right' : minXPct < 30 ? 'left' : 'center';
        const minLabelLeft  = minLabelAlign === 'right'  ? 'auto' : `${Math.max(minXPct,3)}%`;
        const minLabelRight = minLabelAlign === 'right'  ? `${Math.max(100-minXPct,3)}%` : 'auto';

        // 현재가가 고점과 X상 가까우면(15% 이내) 현재가 라벨 숨김 (겹침 방지)
        const showCurrentLabel = Math.abs(100 - maxXPct) > 12;

        // 저점 대비 현재가 수익률
        const periodRet = minP > 0 ? ((lastP - minP) / minP * 100) : null;
        const retCol = periodRet == null ? 'var(--text2)' : periodRet >= 0 ? '#f87171' : '#60a5fa';
        const retStr = periodRet != null ? '저점 대비 '+(periodRet>=0?'+':'')+periodRet.toFixed(1)+'%' : '';

        // X축 날짜 눈금 (최대 5개 균등 분배)
        const tickCount = Math.min(5, n);
        const ticks = Array.from({ length: tickCount }, (_, i) => {
          const idx = Math.round(i / (tickCount - 1) * (n - 1));
          return { idx, xPct: (idx / (n - 1)) * 100, date: pts[idx]?.base_date || '' };
        });

        // 저점/고점 날짜
        const minDate = pts[minIdx]?.base_date?.slice(2, 10) || '';
        const maxDate = pts[maxIdx]?.base_date?.slice(2, 10) || '';

        return `<div style="flex:1;min-width:160px;display:flex;flex-direction:column;gap:0">
          <!-- 헤더: 타이틀 + 저점대비 등락률 -->
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
            <span style="font-size:12px;font-weight:700;color:var(--text1)">주가 추이</span>
            ${retStr ? `<span style="font-size:12px;font-weight:700;color:${retCol}">${retStr}</span>` : ''}
          </div>

          <!-- SVG 차트 -->
          <div style="position:relative;flex:1;min-height:90px">
            <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"
              style="width:100%;height:100%;display:block">
              <defs>
                <linearGradient id="hdr-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="${lineColor}" stop-opacity="0.3"/>
                  <stop offset="100%" stop-color="${lineColor}" stop-opacity="0"/>
                </linearGradient>
              </defs>
              <path d="${fillPathPad}" fill="url(#hdr-fill)"/>
              <polyline points="${coordsPad}" fill="none" stroke="${lineColor}"
                stroke-width="2" stroke-linejoin="round" stroke-linecap="round"
                vector-effect="non-scaling-stroke"/>
              <circle cx="${minX}" cy="${minYc}" r="4" fill="#60a5fa" vector-effect="non-scaling-stroke"/>
              <circle cx="${maxX}" cy="${maxYc}" r="4" fill="#f87171" vector-effect="non-scaling-stroke"/>
              <circle cx="${lastXc}" cy="${lastYc}" r="5" fill="white"
                stroke="${lineColor}" stroke-width="2" vector-effect="non-scaling-stroke"/>
            </svg>

            <!-- 고점 라벨 (가격 + 날짜) -->
            <div style="position:absolute;top:0;left:${maxLabelLeft};right:${maxLabelRight};
              pointer-events:none;white-space:nowrap">
              <div style="font-size:11px;color:#f87171;font-weight:700;
                background:var(--bg2);padding:2px 5px;border-radius:3px;
                border:1px solid #f8717150;line-height:1.4">
                ▲ ${fmtNum(maxP)}<br>
                <span style="font-weight:400;font-size:11px">${maxDate}</span>
              </div>
            </div>

            <!-- 저점 라벨 (가격 + 날짜) -->
            <div style="position:absolute;bottom:18px;left:${minLabelLeft};right:${minLabelRight};
              pointer-events:none;white-space:nowrap">
              <div style="font-size:11px;color:#60a5fa;font-weight:700;
                background:var(--bg2);padding:2px 5px;border-radius:3px;
                border:1px solid #60a5fa50;line-height:1.4">
                ▼ ${fmtNum(minP)}<br>
                <span style="font-weight:400;font-size:11px">${minDate}</span>
              </div>
            </div>

            <!-- 현재가 라벨 -->
            ${showCurrentLabel ? `
            <div style="position:absolute;right:2px;
              top:calc(${((lastYc/H)*100).toFixed(1)}% - 10px);pointer-events:none">
              <div style="font-size:11px;color:${lineColor};font-weight:700;
                background:var(--bg2);padding:2px 5px;border-radius:3px;
                border:1px solid ${lineColor}50;white-space:nowrap">${fmtNum(lastP)}</div>
            </div>` : ''}
          </div>

          <!-- X축 날짜 눈금 -->
          <div style="position:relative;height:16px;margin-top:2px">
            ${ticks.map(t => `
              <div style="position:absolute;left:${t.xPct.toFixed(1)}%;
                transform:translateX(-50%);text-align:center;white-space:nowrap">
                <div style="width:1px;height:3px;background:var(--border);margin:0 auto 1px"></div>
                <div style="font-size:11px;color:var(--text1)">${t.date.slice(0,7)}</div>
              </div>`).join('')}
          </div>
        </div>`;
      })()}
    </div>
  </div>

  <!-- ② 핵심 투자 논거 (전체 너비) ──────────────────────────────── -->
  <div class="card" style="padding:16px">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">

        <!-- Bull case -->
        <div>
          <div style="font-size:13px;font-weight:700;color:#4ade80;margin-bottom:8px;display:flex;align-items:center;gap:6px">
            <span style="width:6px;height:6px;border-radius:50%;background:#4ade80;display:inline-block"></span>
            핵심 투자포인트 (Bull Case)
          </div>
          ${bullHTML}
        </div>

        <!-- Bear case -->
        <div style="border-top:1px solid var(--border);padding-top:10px">
          <div style="font-size:13px;font-weight:700;color:#f87171;margin-bottom:8px;display:flex;align-items:center;gap:6px">
            <span style="width:6px;height:6px;border-radius:50%;background:#f87171;display:inline-block"></span>
            주요 리스크 (Bear Case)
          </div>
          ${bearHTML}
        </div>

    </div>
  </div>

  <!-- ③ 실적 트렌드 (좌: 전체, 우: 제품별) ──────────────────────── -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
    ${_rpEarningsCard(_rpData.fin)}
    ${_rpSegmentCard(_rpData.segment)}
  </div>

  <!-- ④ 밸류에이션 + 재무 건전성 (같은 행) ──────────────────────── -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
    ${_rpValuationCard(latestF, latest)}
    ${_rpFinHealthCard(latestF)}
  </div>


  <!-- ⑥ 카탈리스트 타임라인 ──────────────────────────────────────── -->
  ${_rpCatalystCard()}

  <!-- ⑦ 탭 (상세 데이터) ──────────────────────────────────────────── -->
  <div class="card" style="padding:0;overflow:hidden">
    <div style="display:flex;border-bottom:1px solid var(--border);background:var(--bg2)">
      ${['재무제표','수급흐름','공시/뉴스','DART 분석'].map((t,i) => `
        <button onclick="rpSetTab(${i})" id="rp-tab-${i}"
          style="flex:1;padding:10px 4px;font-size:14px;font-weight:600;border:none;
            background:none;cursor:pointer;border-bottom:2px solid ${i===0?'var(--tg)':'transparent'};
            color:${i===0?'var(--tg)':'var(--text3)'};transition:all .2s">${t}</button>`).join('')}
    </div>
    <div id="rp-tab-body" style="padding:14px">
      <div style="text-align:center;color:var(--text2);padding:40px"><span class="loading"></span></div>
    </div>
  </div>

  `;
  } catch(err) {
    console.error('[rpRenderReport] 렌더 에러:', err);
    body.innerHTML = `<div style="padding:20px;color:var(--red);font-size:13px">
      렌더 오류: ${err.message}<br>
      <small style="color:var(--text2)">콘솔에서 상세 확인</small>
    </div>`;
    return;
  }

  // 재무제표 탭 자동 로드
  rpSetTab(0);

  // 종목 헤더 바 업데이트
  const priceBadge = document.getElementById('rp-price-badge');
  const chgBadge   = document.getElementById('rp-chg-badge');
  if (priceBadge && price) priceBadge.textContent = fmtNum(price) + '원';
  if (chgBadge) chgBadge.innerHTML = `<span style="color:${chgCol}">${chgTxt}</span>`;

  // 헤더 바 추가 정보 (시총, PER, PBR, ROE, 산업, 시장)
  try {
    const { data: mkt } = await sb.from('market_data')
      .select('market_cap,per,pbr,market')
      .eq('stock_code', _rpStock.code)
      .order('base_date', { ascending: false }).limit(1);
    if (mkt?.[0]) {
      const m = mkt[0];
      const _set = (id, txt) => { const el = document.getElementById(id); if(el) el.textContent = txt; };
      _set('rp-cap-val', m.market_cap ? fmtCap(m.market_cap) : '—');
      _set('rp-per-val', m.per ? m.per.toFixed(1)+'x' : '—');
      _set('rp-pbr-val', m.pbr ? m.pbr.toFixed(2) : '—');
      const mktBadge = document.getElementById('rp-market-badge');
      if (mktBadge && m.market) mktBadge.textContent = m.market;
    }
    const { data: fin } = await sb.from('financials')
      .select('roe').eq('stock_code', _rpStock.code)
      .order('bsns_year', { ascending: false }).order('quarter', { ascending: false }).limit(1);
    if (fin?.[0]?.roe != null) {
      const el = document.getElementById('rp-roe-val');
      if (el) el.textContent = fin[0].roe.toFixed(1) + '%';
    }
    const { data: comp } = await sb.from('companies')
      .select('industry').eq('code', _rpStock.code).limit(1);
    if (comp?.[0]?.industry) {
      const el = document.getElementById('rp-industry-badge');
      if (el) el.textContent = comp[0].industry;
    }
  } catch(e) {}
}

// ── 탭 전환 ───────────────────────────────────────────────────────────────────
async function rpSetTab(idx) {
  document.querySelectorAll('[id^="rp-tab-"]').forEach((b, i) => {
    b.style.borderBottomColor = i === idx ? 'var(--tg)' : 'transparent';
    b.style.color = i === idx ? 'var(--tg)' : 'var(--text3)';
  });
  const body = document.getElementById('rp-tab-body');
  if (!body) return;

  // 재무제표(0) → financials.js의 _renderFinancialTab 재활용
  if (idx === 0) {
    body.innerHTML = '<div style="text-align:center;color:var(--text2);padding:40px"><span class="loading"></span></div>';
    await _renderFinancialTab(body, _rpStock.code, _rpStock.name);
    return;
  }

  if (idx === 3) {
    body.innerHTML = '<div style="text-align:center;color:var(--text2);padding:40px"><span class="loading"></span> DART 리포트 로딩 중...</div>';
    await _rpLoadAndRenderDart(body);
    return;
  }

  const fns = [
    null,
    () => _rpTabFlow(_rpData.price),
    () => _rpTabNews(),
  ];
  body.innerHTML = fns[idx]?.() || '';
}

function _rpTabFlow(prices) {
  if (!prices?.length) return `<div style="padding:20px;text-align:center;color:var(--text2);font-size:12px">수급 데이터 없음</div>`;
  const recent = prices.slice(0, 20).reverse();
  const maxTV  = Math.max(...recent.map(r => r.trading_value || 0));
  return `
  <div style="font-size:12px;color:var(--text1);margin-bottom:8px">최근 20일 거래대금</div>
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
  <div style="margin-top:12px;padding:10px;background:var(--bg3);border-radius:var(--radius-sm);
    font-size:12px;color:var(--text2);text-align:center">
    외국인/기관 상세 수급은 수급 분석 기능 연동 예정
  </div>`;
}

function _rpTabNews() {
  return `<div style="padding:20px;text-align:center;color:var(--text2);font-size:12px">
    공시/뉴스 연동 예정 — 공시 탭 또는 기업 분석 페이지에서 확인 가능
  </div>`;
}

// ── fmtNum 호환 헬퍼 ──────────────────────────────────────────────────────────
function fmtNum(v) {
  if (v == null) return '—';
  return Math.round(v).toLocaleString('ko-KR');
}
