// report.js — 기업 분석 리포트 페이지
// 20년+ 수석 펀드매니저 관점의 투자 의사결정 중심 구성
// 의존: config.js (sb, fmtNum, fmtCap 등)

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
  const chgColor = chg > 0 ? 'var(--red)' : chg < 0 ? 'var(--blue)' : 'var(--text3)';
  const chgStr   = (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%';

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
          <span style="font-size:20px;font-weight:600;color:${chgColor}">${chgStr}</span>
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
              <div style="font-size:10px;color:#f87171;font-weight:700;
                background:var(--bg2);padding:2px 5px;border-radius:3px;
                border:1px solid #f8717150;line-height:1.4">
                ▲ ${fmtNum(maxP)}<br>
                <span style="font-weight:400;font-size:9px">${maxDate}</span>
              </div>
            </div>

            <!-- 저점 라벨 (가격 + 날짜) -->
            <div style="position:absolute;bottom:18px;left:${minLabelLeft};right:${minLabelRight};
              pointer-events:none;white-space:nowrap">
              <div style="font-size:10px;color:#60a5fa;font-weight:700;
                background:var(--bg2);padding:2px 5px;border-radius:3px;
                border:1px solid #60a5fa50;line-height:1.4">
                ▼ ${fmtNum(minP)}<br>
                <span style="font-weight:400;font-size:9px">${minDate}</span>
              </div>
            </div>

            <!-- 현재가 라벨 -->
            ${showCurrentLabel ? `
            <div style="position:absolute;right:2px;
              top:calc(${((lastYc/H)*100).toFixed(1)}% - 10px);pointer-events:none">
              <div style="font-size:10px;color:${lineColor};font-weight:700;
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
                <div style="font-size:9px;color:var(--text1)">${t.date.slice(0,7)}</div>
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
  if (chgBadge) chgBadge.innerHTML = `<span style="color:${chgColor}">${chgStr}</span>`;

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

// ── 서브 컴포넌트 ─────────────────────────────────────────────────────────────

// 인라인 배지 (가로 레이아웃용 — 작고 컴팩트)
function _rpOpinionBadgeInline(opinion) {
  const map = {
    'buy':'#22c55e','적극매수':'#22c55e','매수':'#22c55e',
    'hold':'#f59e0b','보유':'#f59e0b','중립':'#f59e0b',
    'sell':'#ef4444','매도':'#ef4444',
  };
  const label = { 'buy':'BUY','매수':'BUY','적극매수':'BUY','hold':'HOLD','보유':'HOLD','중립':'HOLD','sell':'SELL','매도':'SELL' };
  const key = opinion?.toLowerCase();
  const col = map[key] || 'var(--text3)';
  const lbl = label[key] || (opinion || '—');
  return `<span style="font-size:12px;font-weight:800;color:${col};padding:3px 10px;
    border-radius:100px;background:${col}20;border:1px solid ${col}50">${lbl}</span>`;
}

// 증권사 목표주가 세로 목록 (카드 우측 배치용)
function _rpAnalystList(analysts, currentPrice) {
  const opMap = { '매수':'BUY','적극매수':'BUY','중립':'HOLD','보유':'HOLD','매도':'SELL' };
  const colMap = { BUY:'#22c55e', HOLD:'#f59e0b', SELL:'#ef4444' };

  if (!analysts?.length) return `
    <div style="display:flex;align-items:center;justify-content:center;color:var(--text1);font-size:12px">
      증권사 의견 없음
    </div>`;

  const seen = new Set();
  const items = analysts.filter(a => { if (seen.has(a.firm_name)) return false; seen.add(a.firm_name); return true; });
  const tps   = items.filter(a => a.target_price > 0).map(a => a.target_price);
  const avgTp = tps.length ? Math.round(tps.reduce((s,v)=>s+v,0)/tps.length) : null;
  const avgGap = avgTp && currentPrice ? ((avgTp - currentPrice) / currentPrice * 100) : null;

  return `<div style="display:flex;flex-direction:column;gap:0;min-width:0;height:100%">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
      <span style="font-size:11px;font-weight:700;color:var(--text1)">증권사 목표주가</span>
      ${avgTp ? `<span style="font-size:11px;color:var(--text1)">
        평균 <b style="color:var(--text1)">${fmtNum(avgTp)}원</b>
        ${avgGap != null ? `<span style="font-weight:700;color:${avgGap>0?'var(--red)':'var(--blue)'}">
          ${avgGap>0?'▲':'▼'}${Math.abs(avgGap).toFixed(1)}%</span>` : ''}
      </span>` : ''}
    </div>
    <div style="display:flex;flex-direction:column;gap:4px;overflow-y:auto;flex:1">
      ${items.map(a => {
        const op   = opMap[a.opinion] || a.opinion || '—';
        const col  = colMap[op] || 'var(--text2)';
        // 가격: 만원 단위로 압축 (480,000 → 48만)
        const tp   = a.target_price ? Math.round(a.target_price/10000)+'만원' : '—';
        const gap  = a.gap_rate;
        const gCol = gap > 0 ? 'var(--red)' : gap < 0 ? 'var(--blue)' : 'var(--text2)';
        const gStr = gap != null ? (gap>=0?'+':'')+gap.toFixed(1)+'%' : '';
        return `<div style="display:grid;grid-template-columns:34px 1fr 42px 44px;
          align-items:center;gap:5px;padding:5px 8px;
          border-radius:var(--radius-sm);background:var(--bg3)">
          <span style="font-size:11px;font-weight:800;color:${col}">${op}</span>
          <span style="font-size:12px;color:var(--text1);min-width:0;overflow:hidden;
            text-overflow:ellipsis;white-space:nowrap">${a.firm_name||''}</span>
          <span style="font-size:12px;font-weight:700;color:var(--text1);
            text-align:right;white-space:nowrap">${tp}</span>
          <span style="font-size:12px;font-weight:700;color:${gCol};
            text-align:right;white-space:nowrap">${gStr}</span>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

// 증권사 목표주가 가로 그리드
function _rpAnalystGrid(analysts, currentPrice) {
  const opMap = { '매수':'BUY','적극매수':'BUY','중립':'HOLD','보유':'HOLD','매도':'SELL' };
  const colMap = { BUY:'#22c55e', HOLD:'#f59e0b', SELL:'#ef4444' };

  if (!analysts?.length) return `
    <div style="border-top:1px solid var(--border);padding-top:10px">
      <div style="font-size:11px;font-weight:700;color:var(--text1);margin-bottom:6px">증권사 목표주가</div>
      <div style="font-size:12px;color:var(--text1);padding:8px 0">등록된 증권사 의견이 없습니다</div>
    </div>`;

  // 증권사별 최신 1건만
  const seen = new Set();
  const latest = analysts.filter(a => { if (seen.has(a.firm_name)) return false; seen.add(a.firm_name); return true; });

  // 평균 목표주가
  const tps = latest.filter(a => a.target_price > 0).map(a => a.target_price);
  const avgTp = tps.length ? Math.round(tps.reduce((s,v) => s+v, 0) / tps.length) : null;
  const avgGap = avgTp && currentPrice ? ((avgTp - currentPrice) / currentPrice * 100) : null;

  return `
    <div style="border-top:1px solid var(--border);padding-top:10px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <span style="font-size:11px;font-weight:700;color:var(--text1)">증권사 목표주가</span>
        ${avgTp ? `<span style="font-size:11px;color:var(--text1)">
          평균 <b style="color:var(--text1)">${fmtNum(avgTp)}원</b>
          ${avgGap != null ? `<span style="margin-left:4px;font-weight:700;
            color:${avgGap>0?'var(--red)':'var(--blue)'}">${avgGap>0?'▲':'▼'}${Math.abs(avgGap).toFixed(1)}%</span>` : ''}
        </span>` : ''}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(82px,1fr));gap:6px">
        ${latest.map(a => {
          const op  = opMap[a.opinion] || a.opinion || '—';
          const col = colMap[op] || 'var(--text2)';
          const tp  = a.target_price ? fmtNum(a.target_price) : '—';
          const gap = a.gap_rate;
          const gCol = gap > 0 ? 'var(--red)' : gap < 0 ? 'var(--blue)' : 'var(--text2)';
          const gStr = gap != null ? (gap >= 0 ? '▲+' : '▼') + Math.abs(gap).toFixed(1) + '%' : '';
          const dt  = a.opinion_date ? a.opinion_date.slice(2,10).replace(/-/g,'.') : '';
          return `<div style="padding:8px 6px;border-radius:var(--radius-sm);background:var(--bg3);
            border:1px solid ${col}30;text-align:center">
            <div style="font-size:10px;color:var(--text1);overflow:hidden;text-overflow:ellipsis;
              white-space:nowrap;margin-bottom:4px">${a.firm_name||''}</div>
            <div style="font-size:11px;font-weight:800;color:${col};margin-bottom:3px">${op}</div>
            <div style="font-size:13px;font-weight:700;color:var(--text1);margin-bottom:2px">${tp}</div>
            ${tp !== '—' ? `<div style="font-size:10px;color:var(--text1);margin-bottom:1px">원</div>` : ''}
            ${gStr ? `<div style="font-size:11px;font-weight:700;color:${gCol}">${gStr}</div>` : ''}
            <div style="font-size:9px;color:var(--text1);margin-top:3px;opacity:.7">${dt}</div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
}

function _rpOpinionBadge(opinion) {
  const map = {
    'buy':    { label: 'BUY',    color: '#22c55e', bg: '#22c55e20', icon: '★' },
    'hold':   { label: 'HOLD',   color: '#f59e0b', bg: '#f59e0b20', icon: '◆' },
    'sell':   { label: 'SELL',   color: '#ef4444', bg: '#ef444420', icon: '▼' },
    '매수':   { label: 'BUY',    color: '#22c55e', bg: '#22c55e20', icon: '★' },
    '보유':   { label: 'HOLD',   color: '#f59e0b', bg: '#f59e0b20', icon: '◆' },
    '매도':   { label: 'SELL',   color: '#ef4444', bg: '#ef444420', icon: '▼' },
  };
  const o = map[opinion?.toLowerCase()] || map['hold'];
  return `<div style="text-align:center;padding:12px 8px;border-radius:var(--radius-sm);
    background:${o.bg};border:1.5px solid ${o.color}40">
    <div style="font-size:24px;color:${o.color};margin-bottom:2px">${o.icon}</div>
    <div style="font-size:18px;font-weight:800;color:${o.color};letter-spacing:1px">${o.label}</div>
  </div>`;
}

function _rpFormatNote(note) {
  if (!note) return '';
  return note.split('\n').filter(l => l.trim()).slice(0, 5).map(line =>
    `<div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:4px">
      <span style="color:#4ade80;font-weight:700;font-size:12px;margin-top:1px">•</span>
      <span>${line.trim()}</span>
    </div>`
  ).join('');
}

function _rpEarningsCard(fin) {
  if (!fin?.length) return `
    <div class="card" style="padding:16px">
      <div style="font-size:14px;font-weight:700;margin-bottom:12px;color:var(--text1)">📊 실적 트렌드</div>
      <div style="padding:20px;text-align:center;color:var(--text2);font-size:12px">재무 데이터 없음</div>
    </div>`;

  // 최신순으로 정렬된 fin → 오래된 것부터 표시
  const items = [...fin].reverse();
  const maxRev = Math.max(...items.map(f => f.revenue || 0));
  const maxOp  = Math.max(...items.map(f => Math.abs(f.operating_profit || 0)));
  const CHART_H = 100; // 차트 높이(px)

  const yoy    = fin.length >= 2 && fin[0].revenue && fin[1].revenue
    ? (fin[0].revenue - fin[1].revenue) / fin[1].revenue * 100 : null;
  const opYoy  = fin.length >= 2 && fin[1].operating_profit
    ? (fin[0].operating_profit - fin[1].operating_profit) / Math.abs(fin[1].operating_profit) * 100 : null;
  const opMargin = fin[0]?.revenue > 0
    ? (fin[0].operating_profit || 0) / fin[0].revenue * 100 : null;

  // 핵심 KPI chips 생성
  const chip = (label, value, color) => value != null ? `
    <span style="display:inline-flex;align-items:center;gap:4px;padding:3px 9px;
      border-radius:100px;background:${color}18;border:1px solid ${color}40;white-space:nowrap">
      <span style="font-size:11px;color:var(--text1)">${label}</span>
      <span style="font-size:12px;font-weight:700;color:${color}">${value}</span>
    </span>` : '';

  return `<div class="card" style="padding:16px">

    <!-- ① 타이틀 + KPI chips -->
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px">
      <span style="font-size:14px;font-weight:700;color:var(--text1);white-space:nowrap">📊 실적 트렌드</span>
      ${chip('매출 YoY', yoy != null ? (yoy>=0?'+':'')+yoy.toFixed(1)+'%' : null, yoy>=0?'var(--red)':'var(--blue)')}
      ${chip('영업이익 YoY', opYoy != null ? (opYoy>=0?'+':'')+opYoy.toFixed(1)+'%' : null, opYoy>=0?'var(--red)':'var(--blue)')}
      ${chip('영업이익률', opMargin != null ? opMargin.toFixed(1)+'%' : null, opMargin >= 15 ? '#4ade80' : opMargin >= 5 ? 'var(--text2)' : 'var(--red)')}
      ${chip('최근 매출', fmtCap(fin[0].revenue||0), 'var(--text2)')}
    </div>

    <!-- ② 바 차트 -->
    <div style="display:flex;align-items:flex-end;gap:6px;height:${CHART_H}px">
      ${items.map(f => {
        const rev  = f.revenue || 0;
        const op   = f.operating_profit || 0;
        const revH = maxRev > 0 ? Math.max(4, Math.round(rev / maxRev * CHART_H)) : 4;
        const opH  = maxOp  > 0 ? Math.max(4, Math.round(Math.abs(op) / maxOp * CHART_H)) : 4;
        const opC  = op >= 0 ? '#2AABEE' : '#f5365c';
        return `<div style="flex:1;min-width:0;display:flex;gap:2px;align-items:flex-end;height:${CHART_H}px">
          <div style="flex:1;min-width:0;background:#4a9eff44;border-radius:3px 3px 0 0;height:${revH}px"
            title="매출 ${fmtCap(rev)}"></div>
          <div style="flex:1;min-width:0;background:${opC};opacity:.8;border-radius:3px 3px 0 0;height:${opH}px"
            title="영업이익 ${op<0?'▼':''}${fmtCap(Math.abs(op))}"></div>
        </div>`;
      }).join('')}
    </div>

    <!-- 기간 라벨 -->
    <div style="display:flex;gap:6px;margin-top:6px">
      ${items.map(f => `
        <div style="flex:1;min-width:0;text-align:center">
          <div style="font-size:11px;font-weight:600;color:var(--text1)">${f.bsns_year||''}</div>
          <div style="font-size:12px;color:var(--text1)">${f.quarter||''}</div>
        </div>`).join('')}
    </div>

    <!-- 범례 -->
    <div style="display:flex;gap:12px;font-size:11px;color:var(--text1);margin-top:8px">
      <span style="display:flex;align-items:center;gap:4px">
        <span style="width:9px;height:9px;background:#4a9eff55;border-radius:2px;display:inline-block"></span>매출
      </span>
      <span style="display:flex;align-items:center;gap:4px">
        <span style="width:9px;height:9px;background:#2AABEE;border-radius:2px;display:inline-block"></span>영업이익
      </span>
    </div>

    <!-- 실적 수치 테이블 -->
    <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border);overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12px;white-space:nowrap">
        <thead>
          <tr style="background:var(--bg3)">
            <th style="padding:6px 8px;text-align:left;color:var(--text1);font-weight:600;
              border-bottom:1px solid var(--border);width:80px">항목</th>
            ${items.map(f => `
              <th style="padding:6px 8px;text-align:right;color:var(--text1);font-weight:600;
                border-bottom:1px solid var(--border)">
                <div>${f.bsns_year||''}</div>
                <div style="color:var(--tg);font-weight:700">${f.quarter||''}</div>
              </th>`).join('')}
          </tr>
        </thead>
        <tbody>
          <!-- 매출 -->
          <tr>
            <td style="padding:6px 8px;color:var(--text1);border-bottom:1px solid var(--border)10;
              display:flex;align-items:center;gap:5px">
              <span style="width:8px;height:8px;border-radius:2px;background:#4a9eff55;flex-shrink:0"></span>매출
            </td>
            ${items.map(f => `
              <td style="padding:6px 8px;text-align:right;color:var(--text1);font-weight:600;
                border-bottom:1px solid var(--border)10">
                ${fmtCap(f.revenue||0)}
              </td>`).join('')}
          </tr>
          <!-- 영업이익 -->
          <tr>
            <td style="padding:6px 8px;color:var(--text1);border-bottom:1px solid var(--border)10;
              display:flex;align-items:center;gap:5px">
              <span style="width:8px;height:8px;border-radius:2px;background:#2AABEE;flex-shrink:0"></span>영업이익
            </td>
            ${items.map(f => {
              const op = f.operating_profit || 0;
              const col = op >= 0 ? 'var(--text1)' : 'var(--blue)';
              return `<td style="padding:6px 8px;text-align:right;color:${col};font-weight:600;
                border-bottom:1px solid var(--border)10">
                ${op < 0 ? '▼' : ''}${fmtCap(Math.abs(op))}
              </td>`;
            }).join('')}
          </tr>
          <!-- 순이익 -->
          ${items.some(f => f.net_income != null) ? `
          <tr>
            <td style="padding:6px 8px;color:var(--text1);border-bottom:1px solid var(--border)10;
              display:flex;align-items:center;gap:5px">
              <span style="width:8px;height:8px;border-radius:2px;background:#a78bfa;flex-shrink:0"></span>순이익
            </td>
            ${items.map(f => {
              const ni = f.net_income;
              if (ni == null) return `<td style="padding:6px 8px;text-align:right;color:var(--text1);
                border-bottom:1px solid var(--border)10">—</td>`;
              const col = ni >= 0 ? 'var(--text1)' : 'var(--blue)';
              return `<td style="padding:6px 8px;text-align:right;color:${col};font-weight:600;
                border-bottom:1px solid var(--border)10">
                ${ni < 0 ? '▼' : ''}${fmtCap(Math.abs(ni))}
              </td>`;
            }).join('')}
          </tr>` : ''}
          <!-- 영업이익률 -->
          <tr>
            <td style="padding:6px 8px;color:var(--text1);display:flex;align-items:center;gap:5px">
              <span style="width:8px;height:8px;border-radius:2px;background:var(--border);flex-shrink:0"></span>영업이익률
            </td>
            ${items.map(f => {
              const m = f.revenue > 0 ? (f.operating_profit||0) / f.revenue * 100 : null;
              const col = m == null ? 'var(--text2)' : m >= 10 ? '#4ade80' : m >= 0 ? 'var(--text1)' : 'var(--blue)';
              return `<td style="padding:6px 8px;text-align:right;color:${col};font-weight:600">
                ${m != null ? m.toFixed(1)+'%' : '—'}
              </td>`;
            }).join('')}
          </tr>
        </tbody>
      </table>
    </div>
  </div>`;
}

// ── 종합 투자 판단 (펀드매니저 관점) ─────────────────────────────────────────
function _rpSynthesis(latestF, latest, fin) {
  const per = latest?.per, pbr = latest?.pbr;
  const roe = latestF?.roe, roa = latestF?.roa;
  const opm = latestF?.operating_margin, npm = latestF?.net_margin;
  const debt = latestF?.debt_ratio;
  const prev = fin?.[1];

  // QoQ 추세
  const roeTrend = roe != null && prev?.roe != null ? roe - prev.roe : null;
  const opmTrend = opm != null && prev?.operating_margin != null ? opm - prev.operating_margin : null;

  const signals = [];

  // 퀄리티 프리미엄 — 고PER + 고ROE (비싸지만 근거 있는 프리미엄)
  if (per != null && per > 20 && roe != null && roe > 15 && opm != null && opm > 10)
    signals.push({ type:'good', icon:'💎',
      msg: `PER ${per?.toFixed(1)}x + ROE ${roe?.toFixed(1)}% — 퀄리티 프리미엄. 높은 수익성이 고평가를 정당화 (PEG 관점 추가 확인 권장)` });

  // Value Trap 경고 — 수익성 대비 고평가
  if (per > 15 && roe != null && roe < 5)
    signals.push({ type:'warn', icon:'⚠️',
      msg: `PER ${per?.toFixed(1)}x 대비 ROE ${roe?.toFixed(1)}% — 수익성 대비 고평가, 가치함정(Value Trap) 주의` });

  // 저평가 가치주
  if (per != null && per < 10 && pbr != null && pbr < 1)
    signals.push({ type:'good', icon:'✅',
      msg: `PER ${per?.toFixed(1)}x · PBR ${pbr?.toFixed(2)}x — 저평가 가치주 구간` });

  // 고수익 우량주
  if (roe != null && roe > 20 && opm != null && opm > 15)
    signals.push({ type:'good', icon:'✅',
      msg: `ROE ${roe?.toFixed(1)}% · 영업이익률 ${opm?.toFixed(1)}% — 고수익성 우량주` });

  // 자본배분 여력 — 저부채 + 고마진 = 추가 투자/환원 여력
  if (debt != null && debt < 60 && opm != null && opm > 15 && npm != null && npm > 10)
    signals.push({ type:'good', icon:'🏗️',
      msg: `부채비율 ${debt?.toFixed(0)}% · 순이익률 ${npm?.toFixed(1)}% — 저부채+고마진, 자본배분 여력 충분 (배당·자사주·M&A 잠재력)` });

  // 부채 과다
  if (debt != null && debt > 200)
    signals.push({ type:'bad', icon:'🔴',
      msg: `부채비율 ${debt?.toFixed(0)}% — 레버리지 과다, 금리 위험 노출` });

  // ROE 추세
  if (roeTrend != null && Math.abs(roeTrend) >= 1.5)
    signals.push({
      type: roeTrend > 0 ? 'good' : 'warn', icon: roeTrend > 0 ? '📈' : '📉',
      msg: `ROE ${roeTrend > 0 ? '개선' : '악화'} (${roeTrend > 0 ? '+' : ''}${roeTrend.toFixed(1)}%p QoQ) — 수익성 ${roeTrend > 0 ? '회복 신호' : '훼손 주의'}` });

  // 영업이익률 추세
  if (opmTrend != null && Math.abs(opmTrend) >= 2)
    signals.push({
      type: opmTrend > 0 ? 'good' : 'warn', icon: opmTrend > 0 ? '📈' : '📉',
      msg: `영업이익률 ${opmTrend > 0 ? '상승' : '하락'} (${opmTrend > 0 ? '+' : ''}${opmTrend.toFixed(1)}%p QoQ)` });

  if (!signals.length)
    signals.push({ type:'neutral', icon:'ℹ️', msg: '특이 신호 없음 — 추가 정성 분석 필요' });

  return signals;
}

// ── 신호등 헬퍼 ──────────────────────────────────────────────────────────────
// 반환: { color, bg, icon, grade } — 강(녹)/중(황)/약(적)
function _rpSignal(type, val) {
  if (val == null) return null;
  const rules = {
    // 낮을수록 좋음
    per:      val < 10  ? 'strong' : val < 20  ? 'mid' : 'weak',
    pbr:      val < 1   ? 'strong' : val < 2.5 ? 'mid' : 'weak',
    debt:     val < 50  ? 'strong' : val < 100 ? 'mid' : 'weak',
    // 높을수록 좋음
    roe:      val > 20  ? 'strong' : val > 10  ? 'mid' : 'weak',
    roa:      val > 10  ? 'strong' : val > 5   ? 'mid' : 'weak',
    opm:      val > 15  ? 'strong' : val > 5   ? 'mid' : 'weak',
    npm:      val > 10  ? 'strong' : val > 3   ? 'mid' : 'weak',
    equity:   'mid',  // 절대값은 신호등 없음
    assets:   'mid',
  };
  const grade = rules[type] || 'mid';
  const map = {
    strong: { color:'#22c55e', bg:'#22c55e18', icon:'●', label:'양호' },
    mid:    { color:'#f59e0b', bg:'#f59e0b18', icon:'●', label:'보통' },
    weak:   { color:'#ef4444', bg:'#ef444418', icon:'●', label:'주의' },
  };
  return { ...map[grade], grade };
}

// ── 제품/사업부별 매출 트렌드 카드 ────────────────────────────────────────────
function _rpSegmentCard(rows) {
  _rpSegSel = null; // 카드 재생성 시 선택 초기화
  if (!rows?.length) return `
    <div class="card" style="padding:16px">
      <div style="font-size:14px;font-weight:700;color:var(--text1)">📦 제품·사업부별 매출</div>
      <div style="color:var(--text1);font-size:12px;padding:20px;text-align:center">
        DART 파일을 업로드하면 제품별 매출 데이터가 표시됩니다
      </div>
    </div>`;

  // ── 기간 / 세그먼트 / 팔레트 ──────────────────────────────────────────────
  const periodSet = [];
  const seen = new Set();
  for (const r of rows) {
    const key = `${r.bsns_year}.${r.quarter}`;
    if (!seen.has(key)) { seen.add(key); periodSet.push({ key, bsns_year: r.bsns_year, quarter: r.quarter }); }
  }
  const periods = periodSet.slice(-6);

  const dataMap = {};
  for (const r of rows) {
    const key = `${r.bsns_year}.${r.quarter}`;
    if (!dataMap[key]) dataMap[key] = {};
    dataMap[key][r.category] = { revenue: r.revenue, ratio: r.revenue_ratio };
  }

  const latestKey   = periods[periods.length - 1]?.key;
  const latestData  = latestKey ? (dataMap[latestKey] || {}) : {};
  const latestTotal = Object.values(latestData).reduce((s, v) => s + (v.revenue || 0), 0);
  const prevKey     = periods.length >= 2 ? periods[periods.length - 2].key : null;

  const _allSegs = [...new Set(rows.filter(r => r.category !== '합계').map(r => r.category))];
  const segNames = _allSegs.sort((a, b) =>
    ((latestData[b]?.revenue) || 0) - ((latestData[a]?.revenue) || 0)
  );
  const COLORS = ['#2AABEE','#4ade80','#fb923c','#a78bfa','#f59e0b','#34d399','#f87171','#60a5fa'];

  // 캐시 저장
  _rpSegCache = { periods, dataMap, segNames, COLORS, latestKey, latestData, latestTotal, prevKey };

  return `<div class="card" style="padding:16px;display:flex;flex-direction:column;gap:12px">
    <div style="font-size:14px;font-weight:700;color:var(--text1)">📦 제품·사업부별 매출</div>
    <div id="rp-seg-inner">${_rpSegInner(_rpSegCache, null)}</div>
  </div>`;
}

// ── 세그먼트 카드 내부 (필터 적용 가능) ──────────────────────────────────────
function _rpSegInner(cache, selected) {
  if (!cache) return '';
  const { periods, dataMap, segNames, COLORS, latestKey, latestData, latestTotal, prevKey } = cache;
  const CHART_H = 160;

  // 스파크라인
  const sparkline = (segName, color) => {
    const vals = periods.map(p => (dataMap[p.key]?.[segName]?.revenue) || 0);
    if (vals.every(v => v === 0)) return '';
    const max = Math.max(...vals, 1);
    const W = 52, H = 20;
    const pts = vals.map((v, i) => {
      const x = vals.length > 1 ? (i / (vals.length - 1)) * W : W / 2;
      const y = H - 2 - Math.round((v / max) * (H - 4));
      return x.toFixed(1) + ',' + y;
    }).join(' ');
    const lastX = vals.length > 1 ? W : W / 2;
    const lastY = H - 2 - Math.round((vals[vals.length - 1] / max) * (H - 4));
    return `<svg width="${W}" height="${H}" style="flex-shrink:0;overflow:visible">`
      + `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" opacity=".85"/>`
      + `<circle cx="${lastX}" cy="${lastY}" r="2.5" fill="${color}"/></svg>`;
  };

  // ── 차트 ────────────────────────────────────────────────────────────────
  let chartHTML = '';
  if (selected) {
    // 단일 세그먼트 바 차트
    const si    = segNames.indexOf(selected);
    const color = COLORS[si % COLORS.length];
    const vals  = periods.map(p => (dataMap[p.key]?.[selected]?.revenue) || 0);
    const max   = Math.max(...vals, 1);
    chartHTML = `
      <div style="display:flex;align-items:flex-end;gap:5px;height:${CHART_H}px">
        ${periods.map((p, pi) => {
          const v    = vals[pi];
          const barH = max > 0 ? Math.max(4, Math.round(v / max * CHART_H)) : 4;
          const isLatest = pi === periods.length - 1;
          return `<div style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:stretch;justify-content:flex-end;height:${CHART_H}px">
            <div style="font-size:10px;font-weight:600;color:${color};text-align:center;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${fmtCap(v*1e6)}</div>
            <div style="height:${barH}px;border-radius:3px 3px 0 0;background:${color};opacity:${isLatest?1:.7};
              ${isLatest?'box-shadow:0 0 0 2px '+color+'60':''}"></div>
          </div>`;
        }).join('')}
      </div>`;
  } else {
    // 전체 누적 바
    const periodTotals = periods.map(p => segNames.reduce((s, n) => s + ((dataMap[p.key]?.[n]?.revenue) || 0), 0));
    const maxTotal = Math.max(...periodTotals, 1);
    chartHTML = `
      <div style="display:flex;align-items:flex-end;gap:5px;height:${CHART_H}px">
        ${periods.map((p, pi) => {
          const total  = periodTotals[pi];
          const barH   = maxTotal > 0 ? Math.max(4, Math.round(total / maxTotal * CHART_H)) : 4;
          const isLatest = pi === periods.length - 1;
          const segs = segNames.map((name, si) => {
            const rev   = (dataMap[p.key]?.[name]?.revenue) || 0;
            const ratio = total > 0 ? (rev / total * 100) : 0;
            return { name, rev, ratio, color: COLORS[si % COLORS.length] };
          }).filter(s => s.rev > 0).reverse();
          return `<div style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:stretch;justify-content:flex-end;height:${CHART_H}px">
            <div style="font-size:10px;font-weight:600;color:var(--text1);text-align:center;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${fmtCap(total*1e6)}</div>
            <div style="height:${barH}px;border-radius:3px 3px 0 0;overflow:hidden;display:flex;flex-direction:column;
              ${isLatest?'box-shadow:0 0 0 2px rgba(255,255,255,.22)':''}">
              ${segs.map(s => `<div style="flex:${s.ratio};background:${s.color};min-height:2px"
                title="${s.name}: ${fmtCap(s.rev*1e6)} (${s.ratio.toFixed(1)}%)"></div>`).join('')}
            </div>
          </div>`;
        }).join('')}
      </div>`;
  }

  // 기간 라벨
  const periodLabels = `
    <div style="display:flex;gap:5px;margin-top:5px">
      ${periods.map((p, pi) => `
        <div style="flex:1;min-width:0;text-align:center">
          <div style="font-size:10px;font-weight:${pi===periods.length-1?700:500};
            color:${pi===periods.length-1?'var(--text1)':'var(--text2)'}">${p.bsns_year}</div>
          <div style="font-size:10px;color:${pi===periods.length-1?'var(--tg)':'var(--text2)'}">${p.quarter}</div>
        </div>`).join('')}
    </div>`;

  // ── 세그먼트 목록 ────────────────────────────────────────────────────────
  const listHTML = segNames.filter(n => latestData[n]?.revenue).map((name, si) => {
    const { revenue, ratio } = latestData[name] || {};
    const pct      = ratio ?? (latestTotal > 0 ? revenue / latestTotal * 100 : 0);
    const color    = COLORS[si % COLORS.length];
    const isTop    = si === 0;
    const isSel    = selected === name;
    const prevRev  = prevKey ? (dataMap[prevKey]?.[name]?.revenue ?? null) : null;
    const qoq      = prevRev != null && prevRev > 0 ? ((revenue - prevRev) / prevRev * 100) : null;
    const trendIcon  = qoq == null ? '—' : qoq > 3 ? '▲' : qoq < -3 ? '▼' : '→';
    const trendColor = qoq == null ? 'var(--text2)' : qoq > 0 ? '#f87171' : qoq < 0 ? '#60a5fa' : 'var(--text2)';
    const qoqStr   = qoq == null ? '' : (qoq >= 0 ? '+' : '') + qoq.toFixed(1) + '%';
    // 선택됐으면 테두리 강조, 아니면 흐리게
    const opacity  = selected && !isSel ? 'opacity:.4;' : '';
    const border   = isSel ? `border:1.5px solid ${color}` : `border:1px solid ${isTop ? color+'40' : 'transparent'}`;
    const bg       = isSel ? color+'22' : (isTop ? color+'14' : 'var(--bg3)');
    return `<div onclick="rpSegFilter('${name.replace(/'/g,"\\'")}',this)"
      style="padding:7px 10px;border-radius:var(--radius-sm);background:${bg};${border};
        cursor:pointer;transition:opacity .2s;${opacity}user-select:none"
      onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity=''">
      <div style="display:flex;align-items:center;gap:7px">
        <span style="font-size:10px;font-weight:800;color:${color};min-width:18px;text-align:center;
          background:${color}22;border-radius:3px;padding:1px 4px">${si+1}</span>
        <span style="font-size:${isTop?'13px':'12px'};font-weight:${isTop||isSel?700:500};color:var(--text1);
          flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${name}</span>
        ${sparkline(name, color)}
        <span style="font-size:12px;color:var(--text1);white-space:nowrap">${fmtCap(revenue*1e6)}</span>
        <span style="font-size:${isTop?'13px':'12px'};font-weight:700;color:${color};min-width:38px;text-align:right">${pct.toFixed(1)}%</span>
        <span style="font-size:12px;font-weight:700;color:${trendColor};min-width:56px;text-align:right;white-space:nowrap">${trendIcon} ${qoqStr}</span>
      </div>
      <div style="height:3px;border-radius:2px;background:${color}22;overflow:hidden;margin-top:5px">
        <div style="height:100%;width:${pct}%;background:${color};border-radius:2px"></div>
      </div>
    </div>`;
  }).join('');

  const headerRight = selected
    ? `<button onclick="rpSegFilter(null)" style="font-size:11px;padding:2px 10px;border:1px solid var(--border);
        border-radius:100px;background:var(--bg3);color:var(--text1);cursor:pointer">전체 보기</button>`
    : `<span style="font-size:10px;color:var(--text1)">스파크라인 · QoQ</span>`;

  return `
    <div>${chartHTML}</div>
    ${periodLabels}
    <div style="border-top:1px solid var(--border);padding-top:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-size:11px;color:var(--text1)">최신 (${latestKey?.replace('.',' ')}) 구성</span>
        ${headerRight}
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">${listHTML}</div>
    </div>`;
}

// ── 세그먼트 필터 토글 ─────────────────────────────────────────────────────────
function rpSegFilter(name) {
  if (!_rpSegCache) return;
  _rpSegSel = (_rpSegSel === name || name == null) ? null : name;
  const el = document.getElementById('rp-seg-inner');
  if (el) el.innerHTML = _rpSegInner(_rpSegCache, _rpSegSel);
}

function _rpValuationCard(latestF, latest) {
  const ps     = _rpData.peerStats || null;
  const fin    = _rpData.fin || [];
  const prev   = fin[1] || {};
  const prices = _rpData.price || [];

  // QoQ 추세 화살표
  const trend = (cur, old) => {
    if (cur == null || old == null) return '';
    const d = cur - old;
    if (Math.abs(d) < 0.1) return `<span style="font-size:10px;color:var(--text1)"> →</span>`;
    return d > 0
      ? `<span style="font-size:10px;color:#f87171"> ▲${d.toFixed(1)}</span>`
      : `<span style="font-size:10px;color:#60a5fa"> ▼${Math.abs(d).toFixed(1)}</span>`;
  };

  // PER/PBR 역사적 추세 (시장 데이터 기준)
  const prevMkt = prices[1] || {};
  const metrics = [
    { key:'per', label:'PER', desc:'주가수익비율',   val: latest?.per,   peer: ps?.per, unit:'x', fmt: v=>v.toFixed(1), lowerBetter:true,  prevVal: prevMkt?.per },
    { key:'pbr', label:'PBR', desc:'주가순자산비율', val: latest?.pbr,   peer: ps?.pbr, unit:'x', fmt: v=>v.toFixed(2), lowerBetter:true,  prevVal: prevMkt?.pbr },
    { key:'roe', label:'ROE', desc:'자기자본이익률', val: latestF?.roe,  peer: ps?.roe, unit:'%', fmt: v=>v.toFixed(1), lowerBetter:false, prevVal: prev?.roe },
    { key:'roa', label:'ROA', desc:'총자산이익률',  val: latestF?.roa,  peer: ps?.roa, unit:'%', fmt: v=>v.toFixed(1), lowerBetter:false, prevVal: prev?.roa },
  ];

  // ── PER·PBR 12분기 밸류에이션 밴드 차트 ──
  const _rpValBandChart = () => {
    // 분기별 데이터 (오래된 순 정렬) — per/pbr이 있는 항목만
    const qFin = [...fin].reverse().filter(r => r.quarter); // 분기만, 오래된→최신
    const perQ  = qFin.filter(r => r.per  != null && r.per  > 0 && r.per  < 500);
    const pbrQ  = qFin.filter(r => r.pbr  != null && r.pbr  > 0 && r.pbr  < 50);

    const curPer = latest?.per;
    const curPbr = latest?.pbr;

    // 두 지표 모두 분기 데이터 없으면 일봉 fallback
    if (perQ.length < 3 && pbrQ.length < 3) {
      // 일봉 기반 간소 PER 차트 (기존 로직 유지)
      const perHistory = prices.filter(p => p.per != null && p.per > 0 && p.per < 200).map(p => p.per);
      if (perHistory.length < 10 || curPer == null) return '';
      const mn = Math.min(...perHistory), mx = Math.max(...perHistory);
      const avg = perHistory.reduce((s,v)=>s+v,0)/perHistory.length;
      const range = mx - mn || 1;
      const W=200,H=32,pts=perHistory.slice(0,120).reverse();
      const xs=pts.map((_,i)=>(i/(pts.length-1))*W);
      const ys=pts.map(v=>H-((v-mn)/range)*H);
      const path=xs.map((x,i)=>`${i===0?'M':'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
      const avgY=(H-((avg-mn)/range)*H).toFixed(1);
      const curY=(H-((curPer-mn)/range)*H).toFixed(1);
      const pctPos=((curPer-mn)/range*100).toFixed(0);
      const bandColor=curPer>avg*1.3?'#f87171':curPer<avg*0.8?'#4ade80':'#f59e0b';
      return `<div style="margin-bottom:10px;padding:10px 14px;background:var(--bg3);border-radius:var(--radius-sm)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <span style="font-size:11px;font-weight:700;color:var(--text1)">PER 히스토리 (최근 ${pts.length}거래일)</span>
          <div style="display:flex;gap:10px;font-size:10px;color:var(--text1)">
            <span>최저 <b style="color:#4ade80">${mn.toFixed(1)}x</b></span>
            <span>평균 <b style="color:#f59e0b">${avg.toFixed(1)}x</b></span>
            <span>최고 <b style="color:#f87171">${mx.toFixed(1)}x</b></span>
          </div>
        </div>
        <svg width="100%" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="display:block;height:32px">
          <line x1="0" y1="${avgY}" x2="${W}" y2="${avgY}" stroke="#f59e0b" stroke-width="1" stroke-dasharray="3,2" opacity="0.6"/>
          <path d="${path}" fill="none" stroke="var(--border)" stroke-width="1.2" opacity="0.7"/>
          <circle cx="${xs[xs.length-1].toFixed(1)}" cy="${curY}" r="3" fill="${bandColor}" stroke="var(--bg3)" stroke-width="1.5"/>
        </svg>
        <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text1);margin-top:3px">
          <span>← ${pts.length}거래일 전</span>
          <span style="color:${bandColor};font-weight:700">현재 ${curPer.toFixed(1)}x (하위 ${pctPos}%)</span>
          <span>현재 →</span>
        </div>
      </div>`;
    }

    // ── 분기별 밴드 차트 생성 헬퍼 ──
    const makeBandChart = (data, curVal, label, unit, maxCap) => {
      if (data.length < 2) return '';
      const vals   = data.map(r => r[label === 'PER' ? 'per' : 'pbr']);
      const labels = data.map(r => `${String(r.bsns_year).slice(2)}/${r.quarter||'Y'}`);
      const mn     = Math.min(...vals);
      const mx     = Math.max(...vals);
      const avg    = vals.reduce((s,v)=>s+v,0)/vals.length;
      const range  = mx - mn || 1;
      const W = 360, H = 60, PAD = 4;
      const n = vals.length;
      const barW  = Math.floor((W - PAD * 2) / n) - 2;
      const barGap = Math.floor((W - PAD * 2) / n);

      // y 좌표 (아래=0, 위=H)
      const toY = v => PAD + (H - PAD * 2) * (1 - (v - mn) / range);
      const avgY = toY(avg).toFixed(1);
      const minY = toY(mn).toFixed(1);
      const maxY = toY(mx).toFixed(1);

      const pct  = curVal != null ? ((curVal - mn) / range * 100).toFixed(0) : null;
      const curColor = curVal == null ? '#888'
        : (label === 'PER' || label === 'PBR')
          ? (curVal > avg * 1.2 ? '#f87171' : curVal < avg * 0.85 ? '#4ade80' : '#f59e0b')
          : (curVal > avg * 1.1 ? '#4ade80' : curVal < avg * 0.9 ? '#f87171' : '#f59e0b');

      const bars = vals.map((v, i) => {
        const x   = PAD + i * barGap;
        const y   = toY(v);
        const bH  = Math.max(2, (H - PAD) - y);
        const isLast = i === n - 1;
        const col = isLast ? curColor : 'rgba(255,255,255,0.12)';
        return `<rect x="${x}" y="${y.toFixed(1)}" width="${barW}" height="${bH.toFixed(1)}"
          rx="1" fill="${col}" opacity="${isLast ? 1 : 0.8}"/>`;
      }).join('');

      // x축 레이블 (첫/중간/마지막만)
      const xLabels = [0, Math.floor(n/2), n-1].map(i => {
        const x = PAD + i * barGap + barW / 2;
        return `<text x="${x.toFixed(1)}" y="${H + 10}" font-size="7" fill="var(--text2)"
          text-anchor="middle">${labels[i]||''}</text>`;
      }).join('');

      return `
      <div style="margin-bottom:8px;padding:10px 14px;background:var(--bg3);border-radius:var(--radius-sm)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;flex-wrap:wrap;gap:4px">
          <span style="font-size:11px;font-weight:700;color:var(--text1)">${label} 분기별 밴드 (${n}분기)</span>
          <div style="display:flex;gap:10px;font-size:10px;color:var(--text1)">
            <span>최저 <b style="color:#4ade80">${mn.toFixed(unit==='x'?1:2)}${unit}</b></span>
            <span>평균 <b style="color:#f59e0b">${avg.toFixed(unit==='x'?1:2)}${unit}</b></span>
            <span>최고 <b style="color:#f87171">${mx.toFixed(unit==='x'?1:2)}${unit}</b></span>
          </div>
        </div>
        <svg width="100%" viewBox="0 0 ${W} ${H+14}" style="display:block;overflow:visible">
          <!-- 밴드 배경 (min~max) -->
          <rect x="${PAD}" y="${maxY}" width="${W - PAD*2}" height="${((H - PAD) - parseFloat(maxY)).toFixed(1)}"
            fill="rgba(255,255,255,0.03)" rx="2"/>
          <!-- 바 -->
          ${bars}
          <!-- 평균선 -->
          <line x1="${PAD}" y1="${avgY}" x2="${W-PAD}" y2="${avgY}"
            stroke="#f59e0b" stroke-width="1" stroke-dasharray="4,3" opacity="0.7"/>
          <!-- 최저선 -->
          <line x1="${PAD}" y1="${minY}" x2="${W-PAD}" y2="${minY}"
            stroke="#4ade80" stroke-width="0.7" stroke-dasharray="2,3" opacity="0.5"/>
          <!-- 최고선 -->
          <line x1="${PAD}" y1="${maxY}" x2="${W-PAD}" y2="${maxY}"
            stroke="#f87171" stroke-width="0.7" stroke-dasharray="2,3" opacity="0.5"/>
          <!-- x축 레이블 -->
          ${xLabels}
        </svg>
        ${curVal != null ? `
        <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text1);margin-top:2px">
          <span>← ${n}분기 이전</span>
          <span style="color:${curColor};font-weight:700">
            현재 ${curVal.toFixed(unit==='x'?1:2)}${unit}
            ${pct != null ? `(역사적 하위 ${pct}%)` : ''}
          </span>
          <span>최근 →</span>
        </div>` : ''}
      </div>`;
    };

    return `
      ${makeBandChart(perQ, curPer, 'PER', 'x', 200)}
      ${makeBandChart(pbrQ, curPbr, 'PBR', 'x', 50)}
    `;
  };

  // 종합 판단
  const synthesis = _rpSynthesis(latestF, latest, fin);

  // peer 대비 평가: lowerBetter → 낮을수록 저평가 / 높을수록 고평가
  const peerJudge = (val, peer, lowerBetter) => {
    if (val == null || peer == null) return null;
    const diff = (val - peer) / peer * 100;
    const isGood = lowerBetter ? diff < -15 : diff > 15;
    const isBad  = lowerBetter ? diff > 15  : diff < -15;
    return {
      diff,
      color: isGood ? '#4ade80' : isBad ? '#f87171' : '#f59e0b',
      label: isGood ? '업종 대비 유리' : isBad ? '업종 대비 불리' : '업종 수준',
      diffStr: (diff >= 0 ? '+' : '') + diff.toFixed(1) + '%',
    };
  };

  const peerHeader = ps
    ? `<div style="font-size:11px;color:var(--text1)">
        ${ps.industry} 동종 ${ps.count}개사 중앙값 비교
        <span style="color:var(--text1);margin-left:4px">|</span>
        <span style="color:var(--text1);margin-left:4px">🟢 유리 🟡 중립 🔴 불리</span>
      </div>`
    : `<div style="font-size:11px;color:var(--text1);opacity:.6">업종 비교 로딩 중...</div>`;

  return `<div id="rp-val-card" class="card" style="padding:16px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:6px">
      <span style="font-size:14px;font-weight:700;color:var(--text1)">💎 밸류에이션 & 수익성</span>
      ${peerHeader}
    </div>

    <!-- 종합 투자 판단 -->
    <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:12px;
      padding:10px 12px;background:var(--bg3);border-radius:var(--radius-sm);
      border-left:3px solid var(--tg)">
      <div style="font-size:10px;font-weight:700;color:var(--tg);letter-spacing:.6px;margin-bottom:2px">
        펀드매니저 종합 판단
      </div>
      ${synthesis.map(s => {
        const col = s.type==='good'?'#4ade80' : s.type==='bad'?'#f87171' : s.type==='warn'?'#f59e0b' : 'var(--text2)';
        return `<div style="font-size:12px;color:${col};line-height:1.5">${s.icon} ${s.msg}</div>`;
      }).join('')}
    </div>

    <!-- PER·PBR 밸류에이션 밴드 -->
    ${_rpValBandChart()}

    <div style="display:flex;flex-direction:column;gap:8px">
      ${metrics.map(m => {
        const sig   = _rpSignal(m.key, m.val);
        const judge = peerJudge(m.val, m.peer, m.lowerBetter);
        // 포지션 바: 업종 내 상대 위치 (0~100%)
        const barPct = m.val != null && m.peer != null
          ? Math.min(100, Math.max(0, m.lowerBetter
              ? (1 - m.val / (m.peer * 2)) * 100        // 낮을수록 왼쪽 = 좋음
              : (m.val / (m.peer * 2)) * 100))           // 높을수록 오른쪽 = 좋음
          : null;
        const jColor = judge?.color || sig?.color || 'var(--border)';
        return `<div style="padding:10px 14px;background:var(--bg3);border-radius:var(--radius-sm);
          border-left:3px solid ${jColor}">

          <!-- 1줄: 지표 + 현재값 + 화살표 + 중앙값 + 판단 배지 -->
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <span style="font-size:12px;font-weight:700;color:var(--text1);min-width:28px">${m.label}</span>
            <span style="font-size:20px;font-weight:800;color:var(--text1)">${m.val != null ? m.fmt(m.val)+m.unit : '—'}</span>${trend(m.val, m.prevVal)}
            ${m.peer != null ? `
              <span style="font-size:12px;color:var(--text1)">vs</span>
              <div>
                <div style="font-size:10px;color:var(--text1)">업종 중앙</div>
                <div style="font-size:15px;font-weight:700;color:var(--text1)">${m.fmt(m.peer)}${m.unit}</div>
              </div>
              ${judge ? `
              <span style="margin-left:auto;font-size:11px;font-weight:700;
                padding:3px 8px;border-radius:100px;
                background:${judge.color}20;color:${judge.color};
                border:1px solid ${judge.color}40;white-space:nowrap">
                ${judge.diffStr}&nbsp;${judge.label.replace('업종 대비 ','')}
              </span>` : ''}` : `
              <span style="flex:1;font-size:11px;color:var(--text1)">${m.desc}</span>
              ${sig ? `<span style="font-size:11px;font-weight:700;color:${sig.color}">${sig.label}</span>` : ''}`}
          </div>

          <!-- 2줄: 포지션 바 -->
          ${barPct != null ? `
          <div style="position:relative;height:4px;border-radius:2px;background:var(--border)">
            <!-- 중앙값 기준선 -->
            <div style="position:absolute;left:50%;top:-3px;bottom:-3px;width:1.5px;
              background:var(--text2);opacity:.5;border-radius:1px"></div>
            <!-- 채움 바 -->
            <div style="position:absolute;top:0;height:100%;border-radius:2px;
              background:${jColor};opacity:.6;
              left:${Math.min(barPct,50).toFixed(1)}%;
              width:${Math.abs(barPct-50).toFixed(1)}%"></div>
            <!-- 현재 위치 마커 -->
            <div style="position:absolute;top:50%;left:${barPct.toFixed(1)}%;
              transform:translate(-50%,-50%);width:10px;height:10px;
              border-radius:50%;background:${jColor};
              border:2px solid var(--bg3)"></div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:10px;
            color:var(--text1);margin-top:3px">
            <span>${m.lowerBetter ? '◀ 저평가' : '◀ 저수익'}</span>
            <span style="opacity:.6">│ 업종 중앙</span>
            <span>${m.lowerBetter ? '고평가 ▶' : '고수익 ▶'}</span>
          </div>` : ''}
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

function _rpFinHealthCard(f) {
  const fin  = _rpData.fin || [];
  const prev = fin[1] || {};
  const ps   = _rpData.peerStats || null;

  const trend = (cur, old) => {
    if (cur == null || old == null) return '';
    const d = cur - old;
    if (Math.abs(d) < 0.1) return '';
    return d > 0
      ? `<span style="font-size:10px;color:#f87171">▲${d.toFixed(1)}</span>`
      : `<span style="font-size:10px;color:#60a5fa">▼${Math.abs(d).toFixed(1)}</span>`;
  };

  // 이자보상배율 근사 (영업이익 / 금융비용 — 금융비용 없으면 skip)
  const icr = null; // 별도 데이터 필요

  // EBITDA/FCF (financials에서)
  const ebitda = f.ebitda;
  const fcf    = f.fcf;
  const mktCap = _rpData.price?.[0]?.market_cap;
  const fcfYield = fcf != null && mktCap > 0 ? (fcf / mktCap * 100) : null;

  const rows = [
    { key:'debt', label:'부채비율',   val: f.debt_ratio,       prev: prev?.debt_ratio,       unit:'%',  fmt: v=>v.toFixed(0),
      hint: f.debt_ratio > 200 ? '레버리지 과다' : f.debt_ratio > 100 ? '보통 수준' : '안정적' },
    { key:'opm',  label:'영업이익률', val: f.operating_margin, prev: prev?.operating_margin,  unit:'%',  fmt: v=>v.toFixed(1),
      hint: f.operating_margin > 20 ? '고마진 사업' : f.operating_margin > 10 ? '양호' : '마진 압박' },
    { key:'npm',  label:'순이익률',   val: f.net_margin,       prev: prev?.net_margin,        unit:'%',  fmt: v=>v.toFixed(1),
      hint: null },
    ...(fcfYield != null ? [{ key:'fcf', label:'FCF 수익률', val: fcfYield, prev: null, unit:'%', fmt: v=>v.toFixed(1),
      hint: fcfYield > 5 ? '현금창출 우수' : fcfYield > 2 ? '양호' : '현금창출 부족' }] : []),
    ...(ebitda != null ? [{ key:'ebitda', label:'EBITDA', val: ebitda, prev: null, unit:'', fmt: v=>fmtCap(v),
      hint: null }] : []),
    { key:'equity', label:'자기자본', val: f.total_equity, prev: null, unit:'', fmt: v=>fmtCap(v), hint:null },
  ].filter(k => k.val != null);

  if (!rows.length) return `<div class="card" style="padding:16px">
    <div style="font-size:14px;font-weight:700;margin-bottom:12px;color:var(--text1)">🏦 재무 건전성</div>
    <div style="color:var(--text1);font-size:12px;text-align:center;padding:12px">재무 데이터 없음</div>
  </div>`;

  // 재무 → 투자 연결 스토리
  const _finStory = () => {
    const debt = f.debt_ratio, opm = f.operating_margin, npm = f.net_margin;
    const stories = [];
    if (debt != null && opm != null && debt < 60 && opm > 15)
      stories.push({ icon:'🏗️', color:'#4ade80',
        text:`저부채(${debt.toFixed(0)}%) + 고마진(${opm.toFixed(1)}%) → 자본배분 여력: 추가 투자·배당·자사주 소각 가능` });
    if (debt != null && debt > 150 && opm != null && opm < 10)
      stories.push({ icon:'⚠️', color:'#f87171',
        text:`고부채(${debt.toFixed(0)}%) + 저마진(${opm.toFixed(1)}%) → 이자비용 부담 구간, 금리 상승 시 실적 훼손 위험` });
    if (npm != null && opm != null && opm - npm > 10)
      stories.push({ icon:'🔍', color:'#f59e0b',
        text:`영업이익률(${opm.toFixed(1)}%) vs 순이익률(${npm.toFixed(1)}%) 괴리 ${(opm-npm).toFixed(1)}%p — 금융비용·세금 구조 점검 필요` });
    if (!stories.length) return '';
    return `<div style="display:flex;flex-direction:column;gap:4px;margin-top:10px;
      padding:8px 12px;background:var(--bg3);border-radius:var(--radius-sm);
      border-left:3px solid var(--border)">
      <div style="font-size:10px;font-weight:700;color:var(--text1);letter-spacing:.5px;margin-bottom:2px">투자 연결 시사점</div>
      ${stories.map(s => `<div style="font-size:11px;color:${s.color};line-height:1.5">${s.icon} ${s.text}</div>`).join('')}
    </div>`;
  };

  return `<div class="card" style="padding:16px">
    <div style="font-size:14px;font-weight:700;margin-bottom:12px;color:var(--text1)">🏦 재무 건전성</div>
    <div style="display:flex;flex-direction:column;gap:6px">
      ${rows.map(k => {
        const sig  = _rpSignal(k.key, k.val);
        const disp = k.fmt(k.val) + k.unit;
        return `<div style="display:flex;align-items:center;gap:10px;padding:7px 12px;
          border-radius:var(--radius-sm);border-left:3px solid ${sig?.color||'var(--border)'};
          background:var(--bg3)">
          <div style="min-width:64px">
            <div style="font-size:12px;color:var(--text1)">${k.label}</div>
          </div>
          <div style="flex:1;min-width:0">
            ${k.hint ? `<div style="font-size:10px;color:${sig?.color||'var(--text2)'}">${k.hint}</div>` : ''}
          </div>
          <div style="display:flex;align-items:center;gap:6px;white-space:nowrap">
            ${trend(k.val, k.prev)}
            ${sig ? `<span style="font-size:10px;padding:1px 6px;border-radius:100px;
              background:${sig.color}20;color:${sig.color};font-weight:700">${sig.label}</span>` : ''}
            <span style="font-size:15px;font-weight:800;color:var(--text1)">${disp}</span>
          </div>
        </div>`;
      }).join('')}
    </div>
    ${_finStory()}
  </div>`;
}

function _rpFlowCard(latest) {
  const fr   = latest.foreign_hold_rate;
  const vol  = latest.volume;
  const tv   = latest.trading_value;

  return `<div class="card" style="padding:16px">
    <div style="font-size:14px;font-weight:700;margin-bottom:12px;color:var(--text1)">🔄 수급 현황</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px">
      ${fr != null ? `
      <div style="padding:10px 12px;background:var(--bg3);border-radius:var(--radius-sm)">
        <div style="font-size:12px;color:var(--text1);margin-bottom:4px">외국인 보유율</div>
        <div style="font-size:16px;font-weight:700">${fr.toFixed(1)}%</div>
        <div style="margin-top:5px;height:4px;border-radius:2px;background:var(--border);overflow:hidden">
          <div style="height:100%;width:${Math.min(100,fr)}%;background:var(--tg);border-radius:2px"></div>
        </div>
      </div>` : ''}
      ${vol ? `
      <div style="padding:10px 12px;background:var(--bg3);border-radius:var(--radius-sm)">
        <div style="font-size:12px;color:var(--text1);margin-bottom:4px">당일 거래량</div>
        <div style="font-size:16px;font-weight:700">${fmtNum(vol)}</div>
      </div>` : ''}
      ${tv ? `
      <div style="padding:10px 12px;background:var(--bg3);border-radius:var(--radius-sm)">
        <div style="font-size:12px;color:var(--text1);margin-bottom:4px">당일 거래대금</div>
        <div style="font-size:16px;font-weight:700">${fmtCap(tv)}</div>
      </div>` : ''}
      <div style="padding:10px 12px;background:var(--bg3);border-radius:var(--radius-sm)">
        <div style="font-size:12px;color:var(--text1);margin-bottom:4px">기관 누적</div>
        <div style="font-size:13px;color:var(--text2)">별도 데이터 필요</div>
      </div>
    </div>
  </div>`;
}

function _rpCatalystCard() {
  const catalysts = [
    { horizon: '단기 (1M)',  color: '#f59e0b', items: ['분기 실적 발표', '주요 수주 발표'] },
    { horizon: '중기 (3M)',  color: '#22d3ee', items: ['신제품 출시', '설비 가동률 개선'] },
    { horizon: '장기 (12M)', color: '#60a5fa', items: ['시장 점유율 확대', '해외 매출 성장'] },
  ];
  return `<div class="card" style="padding:16px">
    <div style="font-size:14px;font-weight:700;margin-bottom:12px;color:var(--text1)">⚡ 카탈리스트</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
      ${catalysts.map(c => `
      <div style="padding:10px;border-radius:var(--radius-sm);border:1px solid ${c.color}30;background:${c.color}08">
        <div style="font-size:10px;font-weight:700;color:${c.color};margin-bottom:8px">${c.horizon}</div>
        ${c.items.map(item => `
        <div style="display:flex;align-items:flex-start;gap:5px;margin-bottom:5px">
          <span style="color:${c.color};font-size:10px;margin-top:2px">◦</span>
          <span style="font-size:12px;color:var(--text1)">${item}</span>
        </div>`).join('')}
      </div>`).join('')}
    </div>
    <div style="margin-top:8px;font-size:12px;color:var(--text1);text-align:center">
      투자노트에 카탈리스트를 직접 입력하면 여기에 반영됩니다
    </div>
  </div>`;
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

// ── DART 탭: lazy fetch + 펀드매니저 리포트 렌더 ─────────────────────────────
async function _rpLoadAndRenderDart(body) {
  if (!_rpStock) return;

  const { data, error } = await sb.from('dart_reports')
    .select('report_type,receive_date,raw_md,summary')
    .eq('stock_code', _rpStock.code)
    .order('receive_date', { ascending: false })
    .limit(1).maybeSingle();

  if (error || !data) {
    body.innerHTML = `
      <div style="padding:32px;text-align:center;color:var(--text2);font-size:13px">
        <div style="margin-bottom:12px;font-size:28px">📄</div>
        <div style="font-weight:600;margin-bottom:6px;font-size:15px">DART 분석 리포트 없음</div>
        <div style="font-size:12px;margin-bottom:16px">사업보고서 분석 MD 파일을 업로드하면 여기에 표시됩니다</div>
        <button onclick="document.getElementById('rp-dart-file').click()"
          style="padding:8px 18px;border:1px solid var(--tg);border-radius:var(--radius-sm);
            background:none;color:var(--tg);font-size:13px;cursor:pointer">DART 업로드</button>
      </div>`;
    return;
  }

  const s   = data.summary || {};
  const dp  = _mdDeepParse(data.raw_md || '');
  const pts  = s.investment_points || [];
  const risks = s.risk_points || [];
  const watch = _rpData.watch;

  // ── 헬퍼 ──
  const esc = t => String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const kv  = (k, v, c) => v ? `
    <div style="padding:10px 14px;background:var(--bg3);border-radius:var(--radius-sm);
      border:1px solid var(--border);min-width:0">
      <div style="font-size:12px;color:var(--text1);margin-bottom:3px;white-space:nowrap">${k}</div>
      <div style="font-size:13px;font-weight:700;color:${c||'var(--text1)'}; word-break:break-all">${esc(v)}</div>
    </div>` : '';
  const sectionTitle = t => `
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;
      color:var(--text2);margin-bottom:10px">${t}</div>`;
  const bullet = (text, color) => `
    <div style="display:flex;align-items:flex-start;gap:8px;padding:7px 10px;margin-bottom:4px;
      background:${color}08;border-radius:var(--radius-sm);border-left:2px solid ${color}50">
      <span style="font-size:13px;color:var(--text1);line-height:1.6">${esc(text)}</span>
    </div>`;

  body.innerHTML = `
  <div style="display:flex;flex-direction:column;gap:18px">

  <!-- ① 리포트 헤더 ─────────────────────────────── -->
  <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:10px;
    padding-bottom:14px;border-bottom:2px solid var(--tg)40">
    <div>
      <div style="font-size:20px;font-weight:800;color:var(--text1)">${esc(dp.stockName || _rpStock?.name || '')}</div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:4px;flex-wrap:wrap">
        <span style="font-size:12px;color:var(--text2)">${esc(dp.stockCode || _rpStock?.code || '')}</span>
        <span style="font-size:12px;padding:2px 9px;border-radius:100px;
          background:var(--tg)20;color:var(--tg);font-weight:600">${esc(data.report_type||'')}</span>
        <span style="font-size:12px;color:var(--text2)">접수 ${esc(data.receive_date||'')}</span>
        ${dp.listedDate ? `<span style="font-size:12px;color:var(--text2)">상장 ${esc(dp.listedDate)}</span>` : ''}
      </div>
    </div>
    <button onclick="document.getElementById('rp-dart-file').click()"
      style="padding:5px 12px;font-size:11px;border:1px solid var(--border);
        border-radius:var(--radius-sm);background:var(--bg3);color:var(--text2);cursor:pointer;white-space:nowrap">
      최신 업로드
    </button>
  </div>

  <!-- ② 핵심 지표 대시보드 ──────────────────────── -->
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px">
    ${kv('주식 희석률',
      s.dilution_ratio != null ? s.dilution_ratio.toFixed(2)+'%' : null,
      (s.dilution_ratio||0) > 5 ? 'var(--red)' : '#4ade80')}
    ${kv('보호예수 비율', s.lockup_ratio ? s.lockup_ratio.toFixed(1)+'%' : null)}
    ${kv('보호예수 해제일', s.lockup_end)}
    ${kv('최대주주+특관 지분',
      s.related_party_ratio ? s.related_party_ratio.toFixed(1)+'%' : null,
      (s.related_party_ratio||0) >= 30 ? '#4ade80' : 'var(--red)')}
    ${kv('최대주주', dp.majorShareholder)}
    ${kv('계열사', dp.subsidiaries?.length ? dp.subsidiaries.length+'개사' : null)}
  </div>

  <!-- ③ 투자 포인트 | 리스크 ────────────────────── -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
    <div style="background:var(--bg2);border:1px solid #4ade8030;border-radius:var(--radius-sm);padding:14px">
      ${sectionTitle('핵심 투자 포인트')}
      ${pts.length
        ? pts.map(t => bullet(t,'#4ade80')).join('')
        : `<div style="font-size:12px;color:var(--text2);padding:8px">투자판단 항목 없음</div>`}
    </div>
    <div style="background:var(--bg2);border:1px solid #f8717130;border-radius:var(--radius-sm);padding:14px">
      ${sectionTitle('주요 리스크')}
      ${risks.length
        ? risks.map(t => bullet(t,'#f87171')).join('')
        : `<div style="font-size:12px;color:var(--text2);padding:8px">리스크 항목 없음</div>`}
    </div>
  </div>

  <!-- ④ 기업 개요 | 주주 구조 ─────────────────── -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">

    <!-- 기업 개요 -->
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px">
      ${sectionTitle('기업 개요')}
      <div style="display:flex;flex-direction:column;gap:6px">
        ${dp.mainBusiness ? `
          <div style="font-size:12px;color:var(--text1);line-height:1.6;padding:8px;
            background:var(--bg3);border-radius:var(--radius-sm)">${esc(dp.mainBusiness)}</div>` : ''}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:4px">
          ${dp.established ? `<div style="font-size:12px;color:var(--text1)">설립 <span style="color:var(--text1);font-weight:600">${esc(dp.established)}</span></div>` : ''}
          ${dp.listedDate  ? `<div style="font-size:12px;color:var(--text1)">상장 <span style="color:var(--text1);font-weight:600">${esc(dp.listedDate)}</span></div>` : ''}
          ${dp.location    ? `<div style="font-size:12px;color:var(--text1);grid-column:1/-1">소재 <span style="color:var(--text1)">${esc(dp.location)}</span></div>` : ''}
        </div>
      </div>
    </div>

    <!-- 주주 구조 -->
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px">
      ${sectionTitle('주주 구조')}
      <div style="display:flex;flex-direction:column;gap:6px">
        ${dp.majorShareholder ? `
          <div style="display:flex;justify-content:space-between;align-items:center;
            padding:7px 10px;background:var(--bg3);border-radius:var(--radius-sm)">
            <div>
              <div style="font-size:13px;font-weight:700;color:var(--text1)">${esc(dp.majorShareholder)}</div>
              <div style="font-size:12px;color:var(--text1)">최대주주</div>
            </div>
            ${dp.majorShareholderRatio ? `<div style="font-size:16px;font-weight:800;color:var(--tg)">${esc(dp.majorShareholderRatio)}</div>` : ''}
          </div>` : ''}
        ${s.related_party_ratio ? `
          <div style="display:flex;justify-content:space-between;padding:6px 10px;
            font-size:12px;color:var(--text1)">
            <span>최대주주+특수관계인</span>
            <span style="font-weight:700;color:var(--text1)">${s.related_party_ratio.toFixed(1)}%</span>
          </div>` : ''}
        ${s.lockup_ratio ? `
          <div style="display:flex;justify-content:space-between;padding:6px 10px;
            font-size:12px;color:var(--text1)">
            <span>보호예수 (해제 ${esc(s.lockup_end||'-')})</span>
            <span style="font-weight:700;color:var(--text1)">${s.lockup_ratio.toFixed(1)}%</span>
          </div>` : ''}
        ${dp.majorShareholder ? `
          <!-- 지분율 바 -->
          ${(() => {
            const total = Math.min(s.related_party_ratio||0, 100);
            return `<div style="margin-top:4px">
              <div style="height:6px;border-radius:3px;background:var(--border);position:relative;overflow:hidden">
                <div style="position:absolute;left:0;top:0;height:100%;width:${total}%;
                  background:linear-gradient(90deg,var(--tg),var(--tg)80);border-radius:3px"></div>
              </div>
              <div style="display:flex;justify-content:space-between;margin-top:3px;font-size:12px;color:var(--text1)">
                <span>0%</span><span style="color:var(--tg);font-weight:600">${total.toFixed(1)}%</span><span>100%</span>
              </div>
            </div>`;
          })()}` : ''}
      </div>
    </div>
  </div>

  <!-- ⑤ 계열사 현황 ───────────────────────────── -->
  ${dp.subsidiaries?.length ? `
  <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px">
    ${sectionTitle('계열사 현황')}
    <div style="display:flex;flex-direction:column;gap:6px">
      ${dp.subsidiaries.map(sub => {
        const isLoss    = sub.netIncome != null && sub.netIncome < 0;
        const isInsolvent = sub.note?.includes('자본잠식');
        const badge = isInsolvent
          ? `<span style="font-size:10px;padding:2px 6px;border-radius:100px;background:#ef444420;color:#ef4444;font-weight:700">자본잠식</span>`
          : isLoss
          ? `<span style="font-size:10px;padding:2px 6px;border-radius:100px;background:#f5a62320;color:#f5a623;font-weight:700">순손실</span>`
          : `<span style="font-size:10px;padding:2px 6px;border-radius:100px;background:#4ade8020;color:#4ade80;font-weight:700">정상</span>`;
        return `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;
          background:var(--bg3);border-radius:var(--radius-sm);flex-wrap:wrap">
          <div style="min-width:120px">
            <div style="font-size:13px;font-weight:700;color:var(--text1)">${esc(sub.name)}</div>
            ${sub.role ? `<div style="font-size:12px;color:var(--text1)">${esc(sub.role)}</div>` : ''}
          </div>
          ${badge}
          <div style="margin-left:auto;display:flex;gap:16px;font-size:12px;flex-wrap:wrap">
            ${sub.revenue    != null ? `<span style="color:var(--text2)">매출 <b style="color:var(--text1)">${_fmtBillions(sub.revenue)}</b></span>` : ''}
            ${sub.netIncome  != null ? `<span style="color:var(--text2)">순손익 <b style="color:${isLoss?'var(--blue)':'var(--red)'}">${_fmtBillions(sub.netIncome)}</b></span>` : ''}
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>` : ''}

  <!-- ⑥ 섹션별 상세 분석 (아코디언) ─────────── -->
  <div>
    ${sectionTitle('섹션별 상세 분석')}
    <div style="display:flex;flex-direction:column;gap:4px">
      ${_mdToAccordion(data.raw_md||'')}
    </div>
  </div>

  </div>`;
}

// ── MD 깊은 파싱 (렌더 전용) ──────────────────────────────────────────────────
function _mdDeepParse(md) {
  const lines = md.split('\n');

  function secLines(h2keyword) {
    const si = lines.findIndex(l => l.startsWith('## ') && l.includes(h2keyword));
    if (si < 0) return [];
    const ei = lines.findIndex((l,i) => i > si && /^## /.test(l));
    return lines.slice(si+1, ei > 0 ? ei : lines.length);
  }
  function subLines(keyword, src) {
    const si = src.findIndex(l => l.startsWith('### ') && l.includes(keyword));
    if (si < 0) return [];
    const ei = src.findIndex((l,i) => i > si && /^#{2,3} /.test(l));
    return src.slice(si+1, ei > 0 ? ei : src.length);
  }
  function lv(keyword, src) {
    const l = (src||lines).find(l => new RegExp(`[-*]\\s*${keyword}[:：]`).test(l));
    return l ? l.replace(new RegExp(`.*${keyword}[:：]\\s*`), '').trim() : null;
  }

  // 문서 개요
  const stockCode = (() => {
    const l = lines.find(l => /\|\s*종목코드\s*\|/.test(l));
    return l ? l.split('|')[2]?.trim() : null;
  })();
  const stockName = (() => {
    const l = lines.find(l => /\|\s*회사명\s*\|/.test(l));
    return l ? l.split('|')[2]?.trim() : null;
  })();

  // 2-1 기본정보
  const sec2 = secLines('2. 기업정보');
  const basic = subLines('2-1', sec2);
  const mainBusinessRaw = lv('주요사업', basic);
  const mainBusiness = mainBusinessRaw?.slice(0, 120) + (mainBusinessRaw?.length > 120 ? '...' : '');

  // 2-4 계열회사
  const subSec = subLines('2-4', sec2);
  const subsidiaries = [];
  let cur = null;
  for (const l of subSec) {
    const h5 = l.match(/^##### (.+)/);
    if (h5) {
      if (cur) subsidiaries.push(cur);
      cur = { name: h5[1].trim(), role: null, revenue: null, netIncome: null, note: null };
    } else if (cur) {
      const rev = l.match(/매출\s+([\d,]+)/);   if (rev) cur.revenue   = parseInt(rev[1].replace(/,/g,''));
      const net = l.match(/순손[실익]\s*([-]?[\d,]+)/); if (net) cur.netIncome = parseInt(net[1].replace(/,/g,'')) * (l.includes('순손실') ? -1 : 1);
      const role = l.match(/역할[:：]\s*(.+?)[\s/]/); if (role) cur.role = role[1];
      if (l.includes('자본잠식')) cur.note = '자본잠식';
    }
  }
  if (cur) subsidiaries.push(cur);

  // 3-1 주주
  const sec3 = secLines('3. 주주');
  const sh = subLines('3-1', sec3);
  const majorRaw = lv('최대주주', sh);
  const majorShareholder   = majorRaw?.split('(')[0]?.trim() || majorRaw;
  const majorShRatioRaw    = lv('최대주주', sh)?.match(/([\d.]+)%/);
  const majorShareholderRatio = majorShRatioRaw ? majorShRatioRaw[1]+'%' : null;

  return {
    stockCode, stockName,
    mainBusiness,
    established: lv('설립일', basic),
    listedDate:  lv('상장일', basic),
    location:    lv('소재지', basic),
    subsidiaries,
    majorShareholder,
    majorShareholderRatio,
  };
}

// ── 사업 섹션 파서 (4-1 ~ 4-5) ───────────────────────────────────────────────
function _rpParseBusinessSections(md, stockCode) {
  const lines = md.split('\n');

  // "25.1Q" → {bsns_year:2025, quarter:'Q1'}
  const parsePeriod = s => {
    const m = s.trim().match(/^(\d{2})\.(\d)Q$/);
    return m ? { bsns_year: 2000 + parseInt(m[1]), quarter: 'Q' + m[2] } : null;
  };

  // "3,596 (42%)" → {amount:3596, ratio:42.00} / "3,596" → {amount:3596, ratio:null}
  const parseAmtRatio = s => {
    const str = (s||'').trim();
    if (!str || str === '-') return { amount: null, ratio: null };
    const rm = str.match(/\((\d+\.?\d*)%\)/);
    const ratio = rm ? parseFloat(rm[1]) : null;
    const n = parseInt(str.replace(/\(.*?\)/,'').replace(/,/g,'').replace(/-/g,'').trim());
    const neg = /^-/.test(str.replace(/\(.*?\)/,'').trim());
    const amount = isNaN(n) ? null : (neg ? -n : n);
    return { amount, ratio };
  };

  // "8,222,688" or "27%" or "-" → {value, isPct}
  const parseNumOrPct = s => {
    const str = (s||'').trim();
    if (!str || str === '-') return { value: null, isPct: false };
    const pm = str.match(/^(\d+\.?\d*)%$/);
    if (pm) return { value: parseFloat(pm[1]), isPct: true };
    const n = parseInt(str.replace(/,/g,''));
    return { value: isNaN(n) ? null : n, isPct: false };
  };

  // 특정 h3 섹션의 테이블 행 추출
  const getSectionTable = h3 => {
    const si = lines.findIndex(l => l.startsWith('### ') && l.includes(h3));
    if (si < 0) return [];
    const ei = lines.findIndex((l,i) => i > si && /^#{2,3} /.test(l));
    return lines.slice(si, ei > 0 ? ei : lines.length)
      .filter(l => /^\|/.test(l) && !/^\|[-:\s|]+$/.test(l));
  };

  const parseRow = r => r.split('|').slice(1,-1).map(c => c.trim());

  const result = { segmentRevenue: [], rawMaterial: [], production: [] };

  // ── 4-1. 매출(제품별) ────────────────────────────────────────────────────
  const t41 = getSectionTable('4-1');
  if (t41.length >= 2) {
    const periods = parseRow(t41[0]).slice(1).map(parsePeriod);
    for (const row of t41.slice(1)) {
      const cols = parseRow(row);
      const seg = cols[0];
      if (!seg || seg === '합계') continue;
      cols.slice(1).forEach((v, pi) => {
        if (!periods[pi]) return;
        const { amount, ratio } = parseAmtRatio(v);
        if (amount == null) return;
        result.segmentRevenue.push({
          stock_code: stockCode, ...periods[pi],
          segment_type: 'product', category: seg, subcategory: '',
          revenue: amount, revenue_ratio: ratio,
        });
      });
    }
  }

  // ── 4-2. 매출(국내/해외) ─────────────────────────────────────────────────
  const t42 = getSectionTable('4-2');
  if (t42.length >= 2) {
    const periods = parseRow(t42[0]).slice(2).map(parsePeriod);
    for (const row of t42.slice(1)) {
      const cols = parseRow(row);
      const category = cols[0], sub = cols[1];
      if (!category || category === '합계' || sub === '합계') continue;
      cols.slice(2).forEach((v, pi) => {
        if (!periods[pi]) return;
        const str = v.replace(/,/g,'').trim();
        if (!str || str === '-') return;
        const n = parseInt(str);
        if (isNaN(n)) return;
        result.segmentRevenue.push({
          stock_code: stockCode, ...periods[pi],
          segment_type: 'region', category, subcategory: sub||'',
          revenue: n, revenue_ratio: null,
        });
      });
    }
  }

  // ── 4-3. 원재료 ──────────────────────────────────────────────────────────
  const t43 = getSectionTable('4-3');
  if (t43.length >= 2) {
    const periods = parseRow(t43[0]).slice(2).map(parsePeriod);
    for (const row of t43.slice(1)) {
      const cols = parseRow(row);
      const pname = cols[0], mname = cols[1];
      if (!mname || pname === '합계') continue;
      cols.slice(2).forEach((v, pi) => {
        if (!periods[pi]) return;
        const n = parseInt(v.replace(/,/g,'').trim());
        if (isNaN(n)) return;
        result.rawMaterial.push({
          stock_code: stockCode, ...periods[pi],
          data_type: 'usage', product_name: pname||'', material_name: mname,
          origin: '', amount: n,
        });
      });
    }
  }

  // ── 4-4. 원재료 가격변동추이 ─────────────────────────────────────────────
  const t44 = getSectionTable('4-4');
  if (t44.length >= 2) {
    const periods = parseRow(t44[0]).slice(2).map(parsePeriod);
    for (const row of t44.slice(1)) {
      const cols = parseRow(row);
      const mname = cols[0], origin = cols[1];
      if (!mname) continue;
      cols.slice(2).forEach((v, pi) => {
        if (!periods[pi]) return;
        const n = parseInt(v.replace(/,/g,'').trim());
        if (isNaN(n)) return;
        result.rawMaterial.push({
          stock_code: stockCode, ...periods[pi],
          data_type: 'price', product_name: '', material_name: mname,
          origin: origin||'', amount: n,
        });
      });
    }
  }

  // ── 4-5. 생산능력 및 생산실적 ─────────────────────────────────────────────
  const t45 = getSectionTable('4-5');
  if (t45.length >= 2) {
    const periods = parseRow(t45[0]).slice(1).map(parsePeriod);
    const metricMap = { '생산능력':'capacity', '생산실적':'actual', '가동률':'utilization_rate' };
    const temp = {};
    for (const row of t45.slice(1)) {
      const cols = parseRow(row);
      const [factory, metricKr] = cols[0].split('/').map(s => s.trim());
      const metricEn = metricMap[metricKr];
      if (!factory || !metricEn) continue;
      cols.slice(1).forEach((v, pi) => {
        if (!periods[pi]) return;
        const p = periods[pi];
        const key = `${stockCode}_${p.bsns_year}_${p.quarter}_${factory}`;
        if (!temp[key]) temp[key] = {
          stock_code: stockCode, ...p, factory_name: factory,
          capacity: null, actual: null, utilization_rate: null,
        };
        const { value } = parseNumOrPct(v);
        if (value != null) temp[key][metricEn] = value;
      });
    }
    result.production = Object.values(temp).filter(r =>
      r.capacity != null || r.actual != null || r.utilization_rate != null
    );
  }

  return result;
}

// ── 금액 포맷 (억/조) ─────────────────────────────────────────────────────────
function _fmtBillions(won) {
  if (won == null) return '—';
  const abs = Math.abs(won);
  const sign = won < 0 ? '-' : '';
  if (abs >= 1e12) return sign + (abs/1e12).toFixed(1) + '조';
  if (abs >= 1e8)  return sign + (abs/1e8).toFixed(1) + '억';
  if (abs >= 1e4)  return sign + Math.round(abs/1e4) + '만';
  return sign + abs.toLocaleString('ko-KR');
}

// ── MD → 아코디언 섹션 HTML ───────────────────────────────────────────────────
function _mdToAccordion(md) {
  const lines = md.split('\n');
  const esc  = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const inl  = s => esc(s)
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/`(.+?)`/g,'<code style="background:var(--bg3);padding:1px 4px;border-radius:3px;font-size:11px">$1</code>');
  const keyword = t => {
    if (/^투자판단[:：]/.test(t)) return `<span style="color:#4ade80;font-weight:600">${inl(t)}</span>`;
    if (/^리스크[:：]/.test(t))   return `<span style="color:#f87171;font-weight:600">${inl(t)}</span>`;
    if (/^검토의견[:：]/.test(t)) return `<span style="color:#60a5fa;font-weight:600">${inl(t)}</span>`;
    if (/^중요도[:：]/.test(t))   return `<span style="color:#f59e0b;font-weight:600">${inl(t)}</span>`;
    return inl(t);
  };

  let html = '', i = 0, secOpen = false, secN = 0;

  const parseTable = tableLines => {
    const rows = tableLines.filter(l => !/^\|[-:\s|]+$/.test(l));
    if (!rows.length) return '';
    const cols = r => r.split('|').slice(1,-1).map(c => c.trim());
    const hdr = cols(rows[0]);
    return `<div style="overflow-x:auto;margin:4px 0">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="background:var(--bg2)">
          ${hdr.map(h=>`<th style="padding:5px 8px;text-align:left;font-weight:600;color:var(--text1);
            border-bottom:1px solid var(--border);white-space:nowrap">${inl(h)}</th>`).join('')}
        </tr></thead>
        <tbody>
          ${rows.slice(1).map((r,ri)=>`<tr style="background:${ri%2?'var(--bg3)20':''}">
            ${cols(r).map(c=>`<td style="padding:4px 8px;color:var(--text1);
              border-bottom:1px solid var(--border)10;line-height:1.5;font-size:12px">${inl(c)}</td>`).join('')}
          </tr>`).join('')}
        </tbody>
      </table></div>`;
  };

  while (i < lines.length) {
    const line = lines[i].trimEnd();

    if (/^# /.test(line)) { i++; continue; }

    if (/^## /.test(line)) {
      if (secOpen) html += '</div></div>';
      secN++;
      const title = line.replace(/^## /,'').trim();
      const sid = `dac-${secN}`;
      // 1번 섹션(문서 개요)은 기본 닫힘, 나머지는 기본 닫힘
      html += `
        <div style="border:1px solid var(--border);border-radius:var(--radius-sm);overflow:hidden">
          <div onclick="(function(b,a){b.style.display=b.style.display==='none'?'flex':'none';
              a.style.transform=b.style.display==='none'?'rotate(0)':'rotate(90deg)'})(
              document.getElementById('${sid}'),this.querySelector('span'))"
            style="padding:9px 14px;background:var(--bg2);cursor:pointer;display:flex;
              align-items:center;gap:8px;font-size:13px;font-weight:700;color:var(--text1);user-select:none">
            <span style="font-size:9px;color:var(--text2);transition:transform .15s">▶</span>
            ${esc(title)}
          </div>
          <div id="${sid}" style="display:none;padding:12px 14px;flex-direction:column;gap:6px">`;
      secOpen = true;
      i++; continue;
    }

    if (/^### /.test(line)) {
      html += `<div style="font-size:12px;font-weight:700;color:var(--tg);margin-top:10px;margin-bottom:4px;
        padding-bottom:3px;border-bottom:1px solid var(--border)30">${esc(line.replace(/^### /,'').trim())}</div>`;
      i++; continue;
    }
    if (/^#### /.test(line)) {
      html += `<div style="font-size:12px;font-weight:700;color:var(--text1);margin-top:6px">${esc(line.replace(/^#### /,'').trim())}</div>`;
      i++; continue;
    }
    if (/^##### /.test(line)) {
      html += `<div style="font-size:11px;font-weight:600;color:var(--text2);margin-top:4px">${esc(line.replace(/^##### /,'').trim())}</div>`;
      i++; continue;
    }
    if (/^---+$/.test(line.trim())) { i++; continue; }

    if (/^\|/.test(line)) {
      const tbl = [];
      while (i < lines.length && /^\|/.test(lines[i].trimEnd())) { tbl.push(lines[i].trimEnd()); i++; }
      html += parseTable(tbl);
      continue;
    }

    if (/^[-*] /.test(line)) {
      const t = line.replace(/^[-*] /,'').trim();
      html += `<div style="display:flex;align-items:flex-start;gap:6px;padding:1px 0">
        <span style="color:var(--text2);font-size:9px;margin-top:5px;flex-shrink:0">◦</span>
        <span style="font-size:12px;color:var(--text1);line-height:1.6">${keyword(t)}</span>
      </div>`;
      i++; continue;
    }

    if (!line.trim()) { i++; continue; }
    html += `<div style="font-size:12px;color:var(--text1);line-height:1.6">${inl(line.trim())}</div>`;
    i++;
  }

  if (secOpen) html += '</div></div>';
  return html;
}

// ── DART MD 파서 ─────────────────────────────────────────────────────────────
function _rpParseMd(text) {
  const lines = text.split('\n');

  function tableVal(sectionKeyword, key) {
    const si = lines.findIndex(l => l.includes(sectionKeyword));
    if (si < 0) return null;
    for (let i = si; i < Math.min(si + 40, lines.length); i++) {
      const m = lines[i].match(/\|\s*(.+?)\s*\|\s*(.+?)\s*\|/);
      if (m && m[1].trim() === key) return m[2].trim();
    }
    return null;
  }

  function lineVal(keyword) {
    const l = lines.find(l => l.match(new RegExp(`[-*]\\s*${keyword}[:：]`)));
    return l ? l.replace(new RegExp(`.*${keyword}[:：]\\s*`), '').trim() : null;
  }

  function allTagged(tag) {
    return lines
      .filter(l => l.match(new RegExp(`^[-*]\\s*${tag}[:：]`)))
      .map(l => l.replace(new RegExp(`^[-*]\\s*${tag}[:：]\\s*`), '').trim())
      .filter(Boolean);
  }

  const stockCode  = tableVal('문서 개요', '종목코드') || '';
  const stockName  = tableVal('문서 개요', '회사명') || '';
  const reportType = tableVal('문서 개요', '원문 기준') || '';
  const receiveDate = tableVal('문서 개요', '접수일') || '';

  const dilutionRatioRaw = lineVal('전체 잠재 물량');
  const dilutionRatio = dilutionRatioRaw ? parseFloat(dilutionRatioRaw.match(/([\d.]+)%/)?.[1] ?? '0') : 0;

  const lockupRaw = lineVal('보호예수 물량');
  const lockupRatio = lockupRaw ? parseFloat(lockupRaw.match(/([\d.]+)%/)?.[1] ?? '0') : 0;
  const lockupEnd = lineVal('주요 반환예정일');

  const majorRaw = lineVal('최대주주 및 특수관계인 지분');
  const relatedPartyRatio = majorRaw ? parseFloat(majorRaw.match(/([\d.]+)%/)?.[1] ?? '0') : 0;

  return {
    stock_code:   stockCode,
    stock_name:   stockName,
    report_type:  reportType,
    receive_date: receiveDate,
    summary: {
      dilution_ratio:     dilutionRatio,
      lockup_ratio:       lockupRatio,
      lockup_end:         lockupEnd,
      related_party_ratio: relatedPartyRatio,
      investment_points:  allTagged('투자판단'),
      risk_points:        allTagged('리스크'),
      review_points:      allTagged('검토의견'),
    },
  };
}

// ── DART 업로드 ───────────────────────────────────────────────────────────────
async function rpUploadDart(input) {
  const file = input.files?.[0];
  if (!file) return;

  let text;
  try { text = await file.text(); } catch(e) { toast('파일 읽기 실패', 'error'); return; }

  let parsed;
  try { parsed = _rpParseMd(text); } catch(e) { toast('MD 파싱 실패: ' + e.message, 'error'); return; }

  if (!parsed.stock_code) { toast('종목코드를 파싱할 수 없습니다 (문서 개요 섹션 확인)', 'warn'); return; }

  toast('저장 중...', 'info');
  const { error } = await sb.from('dart_reports').upsert({
    stock_code:   parsed.stock_code,
    stock_name:   parsed.stock_name,
    report_type:  parsed.report_type,
    receive_date: parsed.receive_date,
    raw_md:       text,
    summary:      parsed.summary,
  }, { onConflict: 'stock_code,report_type' });

  if (error) { toast('저장 실패: ' + error.message, 'error'); return; }

  // 4-1 ~ 4-5 사업 섹션 파싱 & 저장
  try {
    const biz = _rpParseBusinessSections(text, parsed.stock_code);
    const saves = [];
    if (biz.segmentRevenue.length)
      saves.push(sb.from('dart_segment_revenue').upsert(biz.segmentRevenue,
        { onConflict: 'stock_code,bsns_year,quarter,segment_type,category,subcategory' }));
    if (biz.rawMaterial.length)
      saves.push(sb.from('dart_raw_material').upsert(biz.rawMaterial,
        { onConflict: 'stock_code,bsns_year,quarter,data_type,product_name,material_name,origin' }));
    if (biz.production.length)
      saves.push(sb.from('dart_production').upsert(biz.production,
        { onConflict: 'stock_code,bsns_year,quarter,factory_name' }));
    await Promise.all(saves);
    const counts = `세그먼트 ${biz.segmentRevenue.length}건 / 원재료 ${biz.rawMaterial.length}건 / 생산 ${biz.production.length}건`;
    toast(`${parsed.stock_name} DART 저장 완료 (${counts})`, 'success');
  } catch(e) {
    toast(`DART 기본 저장 완료, 사업 섹션 저장 실패: ${e.message}`, 'warn');
  }
  input.value = '';

  const dartPayload = { report_type: parsed.report_type, receive_date: parsed.receive_date, summary: parsed.summary };

  if (_rpStock?.code === parsed.stock_code) {
    // 같은 종목 선택 중 → 데이터 갱신 후 DART 탭으로 이동
    _rpData.dart = dartPayload;
    rpRenderReport();
    setTimeout(() => rpSetTab(3), 50);
  } else {
    // 종목 미선택이거나 다른 종목 → 해당 종목 리포트 로드 후 DART 탭
    _rpStock = { code: parsed.stock_code, name: parsed.stock_name };
    const el = document.getElementById('content');
    if (el) el.innerHTML = pReport();
    const body = document.getElementById('rp-body');
    if (body) body.innerHTML = _rpSkeleton();
    try {
      const [priceRes, finRes, watchRes] = await Promise.all([
        sb.from('market_data').select('price,price_change_rate,market_cap,volume,trading_value,foreign_hold_rate,w52_high,w52_low')
          .eq('stock_code', parsed.stock_code).order('base_date', { ascending: false }).limit(60),
        sb.from('financials').select('bsns_year,quarter,revenue,operating_profit,net_income,total_assets,total_equity,debt_ratio,roe,roa,operating_margin,net_margin')
          .eq('stock_code', parsed.stock_code).eq('fs_div','CFS').order('bsns_year', { ascending: false }).order('quarter', { ascending: false }).limit(8),
        sb.from('watchlist').select('note,target_price,opinion,buy_price,created_at')
          .eq('stock_code', parsed.stock_code).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ]);
      _rpData = { price: priceRes.data || [], fin: finRes.data || [], watch: watchRes.data || null, dart: dartPayload };
      rpRenderReport();
      setTimeout(() => rpSetTab(3), 50);
    } catch(e) {
      // DB 데이터 없어도 DART는 보여주기
      _rpData = { price: [], fin: [], watch: null, dart: dartPayload };
      rpRenderReport();
      setTimeout(() => rpSetTab(3), 50);
    }
  }
}

// ── fmtNum 호환 헬퍼 ──────────────────────────────────────────────────────────
function fmtNum(v) {
  if (v == null) return '—';
  return Math.round(v).toLocaleString('ko-KR');
}
