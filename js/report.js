// report.js — 기업 분석 리포트 페이지
// 20년+ 수석 펀드매니저 관점의 투자 의사결정 중심 구성
// 의존: config.js (sb, fmtNum, fmtCap 등)

// ── 상태 ──────────────────────────────────────────────────────────────────────
let _rpStock     = null;   // 선택된 종목 { code, name }
let _rpTab       = 'overview';  // 현재 탭
let _rpData      = {};     // 로드된 데이터 캐시

// ── 페이지 진입점 ─────────────────────────────────────────────────────────────
function pReport() {
  return `
  <div style="display:flex;flex-direction:column;gap:0;min-height:100%">

    <!-- 종목 검색 헤더 -->
    <div style="padding:12px 16px;border-bottom:1px solid var(--border);
      background:var(--bg2);display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <input type="file" id="rp-dart-file" accept=".md" style="display:none" onchange="rpUploadDart(this)">
      <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:200px">
        <div style="position:relative;flex:1;max-width:320px">
          <input id="rp-search" type="text" placeholder="종목명 또는 코드 입력 (예: 삼성전자, 005930)"
            oninput="rpSearchInput(this.value)"
            style="width:100%;padding:7px 32px 7px 10px;border:1px solid var(--border);
              border-radius:var(--radius-sm);background:var(--bg3);color:var(--text1);font-size:13px">
          <svg style="position:absolute;right:8px;top:50%;transform:translateY(-50%);
            width:14px;height:14px;color:var(--text3);pointer-events:none"
            viewBox="0 0 16 16" fill="none">
            <circle cx="6.5" cy="6.5" r="4" stroke="currentColor" stroke-width="1.5"/>
            <path d="M10 10l3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <div id="rp-dropdown" style="display:none;position:absolute;top:calc(100%+4px);left:0;right:0;
            background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-sm);
            z-index:100;max-height:240px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,.3)"></div>
        </div>
        <button onclick="rpLoadReport()" class="btn-primary"
          style="padding:7px 14px;font-size:12px;white-space:nowrap">분석 리포트</button>
        <button onclick="document.getElementById('rp-dart-file').click()"
          style="padding:7px 12px;font-size:12px;white-space:nowrap;border:1px solid var(--border);
            border-radius:var(--radius-sm);background:var(--bg3);color:var(--text2);cursor:pointer"
          title="사업보고서 MD 파일 업로드">DART 업로드</button>
      </div>
      ${_rpStock ? `
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-weight:700;font-size:14px">${_rpStock.name}</span>
        <span style="font-size:11px;color:var(--text3)">${_rpStock.code}</span>
        <span id="rp-price-badge" style="font-size:12px;color:var(--text2)">로딩중...</span>
      </div>` : ''}
    </div>

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
      <div style="font-size:13px;color:var(--text3);line-height:1.6">
        20년+ 수석 펀드매니저 관점의 투자 분석<br>
        밸류에이션 · 실적 · 재무 · 수급 · 리스크를 한 화면에
      </div>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;max-width:400px">
      ${examples.map(n => `
        <button onclick="rpQuickSearch('${n}')"
          style="padding:5px 12px;border:1px solid var(--border);border-radius:100px;
            background:var(--bg3);color:var(--text2);font-size:12px;cursor:pointer">
          ${n}
        </button>`).join('')}
    </div>
  </div>`;
}

function _rpSkeleton() {
  return `<div style="text-align:center;padding:40px;color:var(--text3);font-size:13px">
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
    const { data } = await sb.from('companies')
      .select('code,name,industry')
      .or(`name.ilike.%${q}%,code.ilike.%${q}%`)
      .order('name')
      .limit(10);

    if (!data?.length) { dd.style.display = 'none'; return; }

    dd.innerHTML = data.map(r => `
      <div onclick="rpSelectStock('${r.code}','${r.name}')"
        style="padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--border);
          display:flex;align-items:center;gap:8px"
        onmouseover="this.style.background='var(--bg3)'"
        onmouseout="this.style.background=''">
        <span style="font-size:13px;font-weight:500">${r.name}</span>
        <span style="font-size:11px;color:var(--text3)">${r.code}</span>
        <span style="font-size:10px;color:var(--text3);margin-left:auto">${r.industry||''}</span>
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
    const { data } = await sb.from('companies')
      .select('code,name')
      .or(`name.ilike.%${q}%,code.ilike.%${q}%`)
      .limit(1)
      .maybeSingle();
    if (data) _rpStock = { code: data.code, name: data.name };
  }
  if (!_rpStock) { toast('종목을 선택해주세요.', 'warn'); return; }

  // 페이지 재렌더링
  const el = document.getElementById('content');
  if (el) el.innerHTML = pReport();

  const body = document.getElementById('rp-body');
  if (body) body.innerHTML = _rpSkeleton();

  // 병렬 데이터 로드
  try {
    const [priceRes, finRes, watchRes, dartRes] = await Promise.all([
      sb.from('market_data').select('price,price_change_rate,market_cap,volume,trading_value,foreign_hold_rate,w52_high,w52_low')
        .eq('stock_code', _rpStock.code).order('base_date', { ascending: false }).limit(60),
      sb.from('financials').select('bsns_year,quarter,revenue,operating_profit,net_income,total_assets,total_equity,total_debt,per,pbr,roe,roa')
        .eq('stock_code', _rpStock.code).order('bsns_year', { ascending: false }).order('quarter', { ascending: false }).limit(8),
      sb.from('watchlist').select('note,target_price,opinion,buy_price,created_at')
        .eq('stock_code', _rpStock.code).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      sb.from('dart_reports').select('report_type,receive_date,summary')
        .eq('stock_code', _rpStock.code).order('receive_date', { ascending: false }).limit(1).maybeSingle(),
    ]);

    _rpData = {
      price:   priceRes.data  || [],
      fin:     finRes.data    || [],
      watch:   watchRes.data  || null,
      dart:    dartRes.data   || null,
    };
    rpRenderReport();
  } catch (e) {
    if (body) body.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--red);font-size:13px">데이터 로드 실패: ${e.message}</div>`;
  }
}

// ── 리포트 렌더링 ─────────────────────────────────────────────────────────────
function rpRenderReport() {
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

  body.innerHTML = `

  <!-- ① 종목 헤더 ──────────────────────────────────────────────────── -->
  <div class="card" style="padding:16px 20px">
    <div style="display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap">
      <div style="flex:1;min-width:200px">
        <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:4px">
          <span style="font-size:26px;font-weight:800">${_rpStock.name}</span>
          <span style="font-size:15px;color:var(--text3)">${_rpStock.code}</span>
          ${latestF.per  ? `<span style="font-size:13px;padding:2px 9px;border-radius:100px;background:var(--bg3);color:var(--text2)">PER ${latestF.per?.toFixed(1)}x</span>` : ''}
          ${latestF.pbr  ? `<span style="font-size:13px;padding:2px 9px;border-radius:100px;background:var(--bg3);color:var(--text2)">PBR ${latestF.pbr?.toFixed(2)}x</span>` : ''}
        </div>
        <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap">
          <span style="font-size:34px;font-weight:700">${price ? fmtNum(price) + '원' : '—'}</span>
          <span style="font-size:20px;font-weight:600;color:${chgColor}">${chgStr}</span>
        </div>
        <div style="display:flex;gap:16px;margin-top:8px;flex-wrap:wrap">
          ${mktCap ? `<span style="font-size:14px;color:var(--text3)">시총 <b style="color:var(--text1)">${fmtCap(mktCap)}</b></span>` : ''}
          ${fr != null ? `<span style="font-size:14px;color:var(--text3)">외국인 <b style="color:var(--text1)">${fr.toFixed(1)}%</b></span>` : ''}
          ${latestF.roe ? `<span style="font-size:14px;color:var(--text3)">ROE <b style="color:var(--text1)">${latestF.roe?.toFixed(1)}%</b></span>` : ''}
        </div>
      </div>

      <!-- 52주 가격 위치 -->
      ${high52 > 0 ? `
      <div style="min-width:160px">
        <div style="font-size:12px;color:var(--text3);margin-bottom:6px;text-align:center">52주 가격 위치</div>
        <div style="height:6px;border-radius:3px;background:var(--border);position:relative;margin:0 4px">
          <div style="position:absolute;left:0;top:0;height:100%;width:${pos52}%;
            background:linear-gradient(90deg,var(--blue),var(--tg));border-radius:3px;transition:width .4s"></div>
          <div style="position:absolute;top:-4px;left:calc(${pos52}% - 7px);width:14px;height:14px;
            border-radius:50%;background:white;border:2px solid var(--tg);box-shadow:0 2px 6px rgba(0,0,0,.3)"></div>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:12px;color:var(--text3)">
          <span>저 ${fmtNum(low52)}</span>
          <span style="font-weight:600;color:var(--text1)">${pos52}%</span>
          <span>고 ${fmtNum(high52)}</span>
        </div>
      </div>` : ''}
    </div>
  </div>

  <!-- ② 투자 의견 + 핵심 논거 ──────────────────────────────────────── -->
  <div style="display:grid;grid-template-columns:200px 1fr;gap:12px">

    <!-- 투자 의견 카드 -->
    <div class="card" style="padding:16px;display:flex;flex-direction:column;gap:10px">
      <div style="font-size:13px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.8px">투자 의견</div>
      ${_rpOpinionBadge(opinion)}
      ${targetP ? `
        <div style="text-align:center;margin-top:4px">
          <div style="font-size:11px;color:var(--text3)">목표주가</div>
          <div style="font-size:20px;font-weight:700;margin:2px 0">${fmtNum(targetP)}<span style="font-size:12px">원</span></div>
          ${upside != null ? `
          <div style="font-size:13px;font-weight:700;color:${upside > 0 ? 'var(--red)' : 'var(--blue)'}">
            ${upside > 0 ? '▲' : '▼'} ${Math.abs(upside).toFixed(1)}% ${upside > 0 ? '상승여력' : '하락위험'}
          </div>` : ''}
        </div>` :
        `<div style="text-align:center;padding:8px;border-radius:var(--radius-sm);background:var(--bg3);
          color:var(--text3);font-size:13px;line-height:1.5">
          투자노트에서<br>목표주가 설정
        </div>`}
      <a onclick="go('watchlist')" style="font-size:13px;text-align:center;color:var(--tg);cursor:pointer">
        투자노트 편집 →
      </a>
    </div>

    <!-- 핵심 투자 논거 -->
    <div class="card" style="padding:16px">
      <div style="display:grid;grid-template-rows:1fr 1fr;gap:12px;height:100%">

        <!-- Bull case -->
        <div>
          <div style="font-size:13px;font-weight:700;color:#4ade80;margin-bottom:8px;display:flex;align-items:center;gap:6px">
            <span style="width:6px;height:6px;border-radius:50%;background:#4ade80;display:inline-block"></span>
            핵심 투자포인트 (Bull Case)
          </div>
          ${watch?.note ? `
            <div id="rp-bull-points" style="font-size:14px;color:var(--text2);line-height:1.7">
              ${_rpFormatNote(watch.note)}
            </div>` : (() => {
              const dartPts = _rpData.dart?.summary?.investment_points || [];
              if (dartPts.length) return `
                <div style="display:flex;flex-direction:column;gap:5px" id="rp-bull-points">
                  ${dartPts.slice(0,4).map(t => `
                  <div style="display:flex;align-items:flex-start;gap:8px">
                    <span style="color:#4ade80;font-weight:700;font-size:14px;margin-top:1px">•</span>
                    <span style="font-size:13px;color:var(--text2);line-height:1.5">${t}</span>
                  </div>`).join('')}
                  <div style="font-size:11px;color:var(--text3);margin-top:2px">DART 분석 기반 자동 추출</div>
                </div>`;
              return `<div style="display:flex;flex-direction:column;gap:6px" id="rp-bull-points">
                ${['핵심 투자포인트를 투자노트에 작성해주세요','예) HBM 수주 확대로 데이터센터 모멘텀 강화','예) 하반기 ASP 상승 + 원가 하락 → 마진 개선']
                  .map((t,i) => `
                  <div style="display:flex;align-items:flex-start;gap:8px">
                    <span style="color:#4ade80;font-weight:700;font-size:14px;margin-top:1px">•</span>
                    <span style="font-size:14px;color:${i===0?'var(--text3)':'var(--border)'}">${t}</span>
                  </div>`).join('')}
              </div>`;
            })()}
        </div>

        <!-- Bear case -->
        <div style="border-top:1px solid var(--border);padding-top:10px">
          <div style="font-size:13px;font-weight:700;color:#f87171;margin-bottom:8px;display:flex;align-items:center;gap:6px">
            <span style="width:6px;height:6px;border-radius:50%;background:#f87171;display:inline-block"></span>
            주요 리스크 (Bear Case)
          </div>
          ${(() => {
            const dartRisks = _rpData.dart?.summary?.risk_points || [];
            if (dartRisks.length) return `
              <div style="display:flex;flex-direction:column;gap:5px">
                ${dartRisks.slice(0,4).map(t => `
                <div style="display:flex;align-items:flex-start;gap:8px">
                  <span style="color:#f87171;font-weight:700;font-size:14px;margin-top:1px">•</span>
                  <span style="font-size:13px;color:var(--text2);line-height:1.5">${t}</span>
                </div>`).join('')}
              </div>`;
            return `<div style="display:flex;flex-direction:column;gap:6px">
              ${['투자노트에 리스크 요인을 추가하세요','예) 미중 무역분쟁 재확대 시 수출 타격','예) 경쟁사 공격적 증설로 공급과잉 우려']
                .map((t,i) => `
                <div style="display:flex;align-items:flex-start;gap:8px">
                  <span style="color:#f87171;font-weight:700;font-size:14px;margin-top:1px">•</span>
                  <span style="font-size:14px;color:${i===0?'var(--text3)':'var(--border)'}">${t}</span>
                </div>`).join('')}
            </div>`;
          })()}
        </div>

      </div>
    </div>
  </div>

  <!-- ③ 실적 트렌드 + 밸류에이션 ──────────────────────────────────── -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
    ${_rpEarningsCard(_rpData.fin)}
    ${_rpValuationCard(latestF, _rpData.fin)}
  </div>

  <!-- ④ 재무 건전성 지표 ───────────────────────────────────────────── -->
  ${_rpFinHealthCard(latestF)}

  <!-- ⑤ 수급 요약 ────────────────────────────────────────────────── -->
  ${_rpFlowCard(latest)}

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
      <div style="text-align:center;color:var(--text3);padding:40px"><span class="loading"></span></div>
    </div>
  </div>

  `;

  // 재무제표 탭 자동 로드
  rpSetTab(0);

  // 주가 배지 업데이트
  const badge = document.getElementById('rp-price-badge');
  if (badge && price) {
    badge.innerHTML = `<span style="font-weight:600">${fmtNum(price)}원</span>
      <span style="color:${chgColor};margin-left:4px">${chgStr}</span>`;
  }
}

// ── 서브 컴포넌트 ─────────────────────────────────────────────────────────────

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
      <div style="font-size:14px;font-weight:700;margin-bottom:12px;color:var(--text2)">📊 실적 트렌드</div>
      <div style="padding:20px;text-align:center;color:var(--text3);font-size:12px">재무 데이터 없음</div>
    </div>`;

  const items = [...fin].reverse().slice(-6);
  const maxRev = Math.max(...items.map(f => f.revenue || 0));
  const maxOp  = Math.max(...items.map(f => Math.abs(f.operating_profit || 0)));

  return `<div class="card" style="padding:16px">
    <div style="font-size:14px;font-weight:700;margin-bottom:12px;color:var(--text2)">📊 실적 트렌드</div>
    <div style="display:flex;gap:3px;align-items:flex-end;height:80px;margin-bottom:8px">
      ${items.map(f => {
        const rev  = f.revenue || 0;
        const op   = f.operating_profit || 0;
        const revH = maxRev > 0 ? Math.round(rev / maxRev * 72) : 4;
        const opH  = maxOp  > 0 ? Math.round(Math.abs(op) / maxOp * 72) : 4;
        const opC  = op >= 0 ? 'var(--tg)' : 'var(--red)';
        const period = f.bsns_year ? `${f.bsns_year} ${f.quarter || ''}`.trim() : '—';
        return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:1px">
          <div style="display:flex;gap:1px;align-items:flex-end;height:72px">
            <div style="width:45%;background:var(--blue)40;border-radius:2px 2px 0 0;height:${revH}px;transition:height .4s" title="매출 ${fmtCap(rev)}"></div>
            <div style="width:45%;background:${opC};border-radius:2px 2px 0 0;height:${opH}px;opacity:.85;transition:height .4s" title="영업이익 ${fmtCap(Math.abs(op))}"></div>
          </div>
          <div style="font-size:9px;color:var(--text3);white-space:nowrap;overflow:hidden;max-width:100%;text-overflow:ellipsis">${period}</div>
        </div>`;
      }).join('')}
    </div>
    <div style="display:flex;gap:12px;font-size:10px;color:var(--text3)">
      <span style="display:flex;align-items:center;gap:3px"><span style="width:8px;height:8px;background:var(--blue)40;border-radius:1px"></span>매출</span>
      <span style="display:flex;align-items:center;gap:3px"><span style="width:8px;height:8px;background:var(--tg);border-radius:1px"></span>영업이익</span>
    </div>
    <!-- 최근 YoY -->
    ${fin.length >= 2 && fin[0].revenue && fin[1].revenue ? (() => {
      const yoy = (fin[0].revenue - fin[1].revenue) / fin[1].revenue * 100;
      const opYoy = fin[1].operating_profit ? (fin[0].operating_profit - fin[1].operating_profit) / Math.abs(fin[1].operating_profit) * 100 : null;
      return `<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);
        display:flex;gap:16px;flex-wrap:wrap">
        <div>
          <div style="font-size:10px;color:var(--text3)">매출 YoY</div>
          <div style="font-size:13px;font-weight:700;color:${yoy>=0?'var(--red)':'var(--blue)'}">${yoy>=0?'+':''}${yoy.toFixed(1)}%</div>
        </div>
        ${opYoy != null ? `<div>
          <div style="font-size:10px;color:var(--text3)">영업이익 YoY</div>
          <div style="font-size:13px;font-weight:700;color:${opYoy>=0?'var(--red)':'var(--blue)'}">${opYoy>=0?'+':''}${opYoy.toFixed(1)}%</div>
        </div>` : ''}
        <div>
          <div style="font-size:10px;color:var(--text3)">영업이익률</div>
          <div style="font-size:13px;font-weight:700;color:var(--text1)">${fin[0].revenue > 0 ? ((fin[0].operating_profit||0)/fin[0].revenue*100).toFixed(1) : '—'}%</div>
        </div>
      </div>`;
    })() : ''}
  </div>`;
}

function _rpValuationCard(f, fin) {
  const metrics = [
    { label: 'PER',  val: f.per,  unit: 'x',  desc: '주가수익비율' },
    { label: 'PBR',  val: f.pbr,  unit: 'x',  desc: '주가순자산비율' },
    { label: 'ROE',  val: f.roe,  unit: '%', desc: '자기자본이익률' },
    { label: 'ROA',  val: f.roa,  unit: '%', desc: '총자산이익률' },
  ];

  return `<div class="card" style="padding:16px">
    <div style="font-size:14px;font-weight:700;margin-bottom:12px;color:var(--text2)">💎 밸류에이션 & 수익성</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      ${metrics.map(m => `
      <div style="padding:10px;background:var(--bg3);border-radius:var(--radius-sm)">
        <div style="font-size:10px;color:var(--text3);margin-bottom:3px">${m.desc}</div>
        <div style="font-size:20px;font-weight:700;color:var(--text1)">
          ${m.val != null ? m.val.toFixed(m.unit==='x'?1:2) + m.unit : '—'}
        </div>
        <div style="font-size:10px;font-weight:700;color:var(--text3)">${m.label}</div>
      </div>`).join('')}
    </div>
    <!-- PER 히스토리 미니 -->
    ${fin?.length >= 2 ? `
    <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
      <div style="font-size:10px;color:var(--text3);margin-bottom:6px">PER 추이</div>
      <div style="display:flex;gap:4px;align-items:flex-end;height:32px">
        ${[...fin].reverse().filter(f => f.per > 0 && f.per < 200).slice(-6).map(f => {
          const h = Math.min(28, Math.round(f.per * 28 / 60));
          return `<div style="flex:1;background:var(--tg)60;border-radius:2px 2px 0 0;
            height:${h}px" title="PER ${f.per?.toFixed(1)}x (${f.bsns_year} ${f.quarter||''})"></div>`;
        }).join('')}
      </div>
    </div>` : ''}
  </div>`;
}

function _rpFinHealthCard(f) {
  const debtRatio = f.total_equity > 0 && f.total_debt != null
    ? (f.total_debt / f.total_equity * 100) : null;

  const kpis = [
    { label: '부채비율',   val: debtRatio,   unit: '%', good: v => v < 100, fmt: v => v.toFixed(0) },
    { label: '자기자본',   val: f.total_equity, unit: '', good: () => true, fmt: v => fmtCap(v) },
    { label: '총자산',     val: f.total_assets, unit: '', good: () => true, fmt: v => fmtCap(v) },
    { label: 'ROE',        val: f.roe,    unit: '%', good: v => v > 10,  fmt: v => v.toFixed(1) },
  ].filter(k => k.val != null);

  return `<div class="card" style="padding:16px">
    <div style="font-size:14px;font-weight:700;margin-bottom:12px;color:var(--text2)">🏦 재무 건전성</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px">
      ${kpis.map(k => {
        const good = k.good(k.val);
        const disp = k.fmt(k.val) + k.unit;
        return `<div style="padding:10px 12px;border-radius:var(--radius-sm);
          background:var(--bg3);border-left:3px solid ${good?'var(--tg)':'var(--red)'}">
          <div style="font-size:10px;color:var(--text3);margin-bottom:4px">${k.label}</div>
          <div style="font-size:15px;font-weight:700">${disp}</div>
        </div>`;
      }).join('')}
      ${kpis.length === 0 ? `<div style="color:var(--text3);font-size:12px;grid-column:1/-1;text-align:center;padding:12px">재무 데이터 없음</div>` : ''}
    </div>
  </div>`;
}

function _rpFlowCard(latest) {
  const fr   = latest.foreign_hold_rate;
  const vol  = latest.volume;
  const tv   = latest.trading_value;

  return `<div class="card" style="padding:16px">
    <div style="font-size:14px;font-weight:700;margin-bottom:12px;color:var(--text2)">🔄 수급 현황</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px">
      ${fr != null ? `
      <div style="padding:10px 12px;background:var(--bg3);border-radius:var(--radius-sm)">
        <div style="font-size:10px;color:var(--text3);margin-bottom:4px">외국인 보유율</div>
        <div style="font-size:16px;font-weight:700">${fr.toFixed(1)}%</div>
        <div style="margin-top:5px;height:4px;border-radius:2px;background:var(--border);overflow:hidden">
          <div style="height:100%;width:${Math.min(100,fr)}%;background:var(--tg);border-radius:2px"></div>
        </div>
      </div>` : ''}
      ${vol ? `
      <div style="padding:10px 12px;background:var(--bg3);border-radius:var(--radius-sm)">
        <div style="font-size:10px;color:var(--text3);margin-bottom:4px">당일 거래량</div>
        <div style="font-size:16px;font-weight:700">${fmtNum(vol)}</div>
      </div>` : ''}
      ${tv ? `
      <div style="padding:10px 12px;background:var(--bg3);border-radius:var(--radius-sm)">
        <div style="font-size:10px;color:var(--text3);margin-bottom:4px">당일 거래대금</div>
        <div style="font-size:16px;font-weight:700">${fmtCap(tv)}</div>
      </div>` : ''}
      <div style="padding:10px 12px;background:var(--bg3);border-radius:var(--radius-sm)">
        <div style="font-size:10px;color:var(--text3);margin-bottom:4px">기관 누적</div>
        <div style="font-size:13px;color:var(--text3)">별도 데이터 필요</div>
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
    <div style="font-size:14px;font-weight:700;margin-bottom:12px;color:var(--text2)">⚡ 카탈리스트</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
      ${catalysts.map(c => `
      <div style="padding:10px;border-radius:var(--radius-sm);border:1px solid ${c.color}30;background:${c.color}08">
        <div style="font-size:10px;font-weight:700;color:${c.color};margin-bottom:8px">${c.horizon}</div>
        ${c.items.map(item => `
        <div style="display:flex;align-items:flex-start;gap:5px;margin-bottom:5px">
          <span style="color:${c.color};font-size:10px;margin-top:2px">◦</span>
          <span style="font-size:11px;color:var(--text3)">${item}</span>
        </div>`).join('')}
      </div>`).join('')}
    </div>
    <div style="margin-top:8px;font-size:11px;color:var(--text3);text-align:center">
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
    body.innerHTML = '<div style="text-align:center;color:var(--text3);padding:40px"><span class="loading"></span></div>';
    await _renderFinancialTab(body, _rpStock.code, _rpStock.name);
    return;
  }

  if (idx === 3) {
    body.innerHTML = '<div style="text-align:center;color:var(--text3);padding:40px"><span class="loading"></span> DART 리포트 로딩 중...</div>';
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
  if (!prices?.length) return `<div style="padding:20px;text-align:center;color:var(--text3);font-size:12px">수급 데이터 없음</div>`;
  const recent = prices.slice(0, 20).reverse();
  const maxTV  = Math.max(...recent.map(r => r.trading_value || 0));
  return `
  <div style="font-size:11px;color:var(--text3);margin-bottom:8px">최근 20일 거래대금</div>
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
    font-size:12px;color:var(--text3);text-align:center">
    외국인/기관 상세 수급은 수급 분석 기능 연동 예정
  </div>`;
}

function _rpTabNews() {
  return `<div style="padding:20px;text-align:center;color:var(--text3);font-size:12px">
    공시/뉴스 연동 예정 — 공시 탭 또는 기업 분석 페이지에서 확인 가능
  </div>`;
}

// ── DART 탭: lazy fetch + 리포트 렌더 ────────────────────────────────────────
async function _rpLoadAndRenderDart(body) {
  if (!_rpStock) return;

  // raw_md lazy fetch
  const { data, error } = await sb.from('dart_reports')
    .select('report_type,receive_date,raw_md,summary')
    .eq('stock_code', _rpStock.code)
    .order('receive_date', { ascending: false })
    .limit(1).maybeSingle();

  if (error || !data) {
    body.innerHTML = `
      <div style="padding:32px;text-align:center;color:var(--text3);font-size:13px">
        <div style="margin-bottom:12px;font-size:20px">📄</div>
        <div style="font-weight:600;margin-bottom:6px">DART 분석 리포트 없음</div>
        <div style="font-size:12px;margin-bottom:16px">사업보고서 분석 MD 파일을 업로드하면 여기에 표시됩니다</div>
        <button onclick="document.getElementById('rp-dart-file').click()"
          style="padding:8px 18px;border:1px solid var(--tg);border-radius:var(--radius-sm);
            background:none;color:var(--tg);font-size:13px;cursor:pointer">DART 업로드</button>
      </div>`;
    return;
  }

  const s = data.summary || {};
  const chip = (label, val, color) => val != null ? `
    <div style="padding:10px 14px;background:var(--bg3);border-radius:var(--radius-sm);border:1px solid var(--border)">
      <div style="font-size:10px;color:var(--text3);margin-bottom:3px">${label}</div>
      <div style="font-size:13px;font-weight:700;color:${color||'var(--text1)'}">${val}</div>
    </div>` : '';

  body.innerHTML = `
  <div style="display:flex;flex-direction:column;gap:16px">

    <!-- 리포트 헤더 -->
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;
      padding-bottom:12px;border-bottom:1px solid var(--border)">
      <span style="font-size:12px;padding:3px 10px;border-radius:100px;
        background:var(--tg)20;color:var(--tg);font-weight:600">${data.report_type || '분기/사업보고서'}</span>
      <span style="font-size:12px;color:var(--text3)">접수 ${data.receive_date || ''}</span>
      <button onclick="document.getElementById('rp-dart-file').click()"
        style="margin-left:auto;padding:4px 10px;font-size:11px;border:1px solid var(--border);
          border-radius:var(--radius-sm);background:var(--bg3);color:var(--text3);cursor:pointer">
        최신 업로드
      </button>
    </div>

    <!-- 핵심 지표 칩 -->
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px">
      ${chip('주식 희석률', s.dilution_ratio != null ? s.dilution_ratio.toFixed(2)+'%' : null,
        (s.dilution_ratio||0) > 5 ? 'var(--red)' : '#4ade80')}
      ${chip('보호예수 비율', s.lockup_ratio ? s.lockup_ratio.toFixed(1)+'%' : null)}
      ${chip('보호예수 해제일', s.lockup_end)}
      ${chip('최대주주+특관 지분', s.related_party_ratio ? s.related_party_ratio.toFixed(1)+'%' : null,
        (s.related_party_ratio||0) >= 30 ? '#4ade80' : 'var(--red)')}
    </div>

    <!-- MD 리포트 본문 -->
    <div id="dart-report-body">
      ${data.raw_md ? _mdToReport(data.raw_md) : '<div style="color:var(--text3);padding:20px;text-align:center">원문 없음</div>'}
    </div>

  </div>`;
}

// ── MD → 리포트 HTML 변환 ──────────────────────────────────────────────────────
function _mdToReport(md) {
  const lines = md.split('\n');
  let html = '';
  let i = 0;
  let sectionOpen = false;
  let sectionIdx = 0;

  const escHtml = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  // 인라인 마크다운 처리 (볼드, 코드)
  const inline = s => escHtml(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code style="background:var(--bg3);padding:1px 4px;border-radius:3px;font-size:11px">$1</code>');

  // 투자판단/리스크/검토의견 키워드에 색상
  const colorTag = text => {
    if (/^투자판단[:：]/.test(text)) return `<span style="color:#4ade80;font-weight:600">${inline(text)}</span>`;
    if (/^리스크[:：]/.test(text))   return `<span style="color:#f87171;font-weight:600">${inline(text)}</span>`;
    if (/^검토의견[:：]/.test(text)) return `<span style="color:#60a5fa;font-weight:600">${inline(text)}</span>`;
    if (/^중요도[:：]/.test(text))   return `<span style="color:#f59e0b;font-weight:600">${inline(text)}</span>`;
    return inline(text);
  };

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trimEnd();

    // H1
    if (/^# /.test(line)) {
      i++; continue; // 제목은 헤더 칩에 있으므로 스킵
    }

    // H2 → 접이식 섹션
    if (/^## /.test(line)) {
      if (sectionOpen) html += '</div></div>';
      sectionIdx++;
      const title = line.replace(/^## /, '').trim();
      const sid = `dart-sec-${sectionIdx}`;
      html += `
        <div style="border:1px solid var(--border);border-radius:var(--radius-sm);overflow:hidden;margin-bottom:2px">
          <div onclick="var b=document.getElementById('${sid}');var a=this.querySelector('.dart-arrow');
            b.style.display=b.style.display==='none'?'block':'none';a.style.transform=b.style.display==='none'?'rotate(0deg)':'rotate(90deg)';"
            style="padding:10px 14px;background:var(--bg2);cursor:pointer;display:flex;align-items:center;gap:8px;
              font-size:14px;font-weight:700;color:var(--text1);user-select:none">
            <span class="dart-arrow" style="font-size:10px;color:var(--text3);transition:transform .2s;transform:rotate(90deg)">▶</span>
            ${escHtml(title)}
          </div>
          <div id="${sid}" style="display:block;padding:12px 14px;display:flex;flex-direction:column;gap:8px">`;
      sectionOpen = true;
      i++; continue;
    }

    // H3
    if (/^### /.test(line)) {
      const title = line.replace(/^### /, '').trim();
      html += `<div style="font-size:13px;font-weight:700;color:var(--tg);margin-top:8px;margin-bottom:4px;
        padding-bottom:4px;border-bottom:1px solid var(--border)20">${escHtml(title)}</div>`;
      i++; continue;
    }

    // H4
    if (/^#### /.test(line)) {
      const title = line.replace(/^#### /, '').trim();
      html += `<div style="font-size:12px;font-weight:700;color:var(--text2);margin-top:6px">${escHtml(title)}</div>`;
      i++; continue;
    }

    // H5
    if (/^##### /.test(line)) {
      const title = line.replace(/^##### /, '').trim();
      html += `<div style="font-size:12px;font-weight:600;color:var(--text3);margin-top:4px">${escHtml(title)}</div>`;
      i++; continue;
    }

    // 구분선 ---
    if (/^---+$/.test(line.trim())) {
      i++; continue; // 섹션 구분은 H2/H3로 처리하므로 스킵
    }

    // 테이블 감지 (현재 + 다음 줄이 | 포함)
    if (/^\|/.test(line)) {
      // 테이블 수집
      const tableLines = [];
      while (i < lines.length && /^\|/.test(lines[i].trimEnd())) {
        tableLines.push(lines[i].trimEnd());
        i++;
      }
      // 헤더 구분선(|---|) 제거
      const rows = tableLines.filter(l => !/^\|[-:\s|]+$/.test(l));
      if (!rows.length) continue;

      const parseRow = r => r.split('|').slice(1,-1).map(c => c.trim());
      const header = parseRow(rows[0]);
      const body   = rows.slice(1);

      html += `<div style="overflow-x:auto;margin:4px 0">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead>
            <tr style="background:var(--bg3)">
              ${header.map(h => `<th style="padding:6px 10px;text-align:left;font-weight:600;
                color:var(--text2);border-bottom:1px solid var(--border);white-space:nowrap">${inline(h)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${body.map((r,ri) => `
            <tr style="background:${ri%2===0?'transparent':'var(--bg3)20'}">
              ${parseRow(r).map(c => `<td style="padding:5px 10px;color:var(--text2);
                border-bottom:1px solid var(--border)10;line-height:1.5">${inline(c)}</td>`).join('')}
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
      continue;
    }

    // 리스트 항목 (- 또는 *)
    if (/^[-*] /.test(line)) {
      const text = line.replace(/^[-*] /, '').trim();
      html += `<div style="display:flex;align-items:flex-start;gap:6px;padding:2px 0">
        <span style="color:var(--text3);font-size:10px;margin-top:4px;flex-shrink:0">◦</span>
        <span style="font-size:13px;color:var(--text2);line-height:1.6">${colorTag(text)}</span>
      </div>`;
      i++; continue;
    }

    // 빈 줄
    if (!line.trim()) { i++; continue; }

    // 일반 텍스트
    html += `<div style="font-size:13px;color:var(--text2);line-height:1.6">${inline(line.trim())}</div>`;
    i++;
  }

  if (sectionOpen) html += '</div></div>';
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
  toast(`${parsed.stock_name}(${parsed.stock_code}) DART 리포트 저장 완료`, 'success');
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
        sb.from('financials').select('bsns_year,quarter,revenue,operating_profit,net_income,total_assets,total_equity,total_debt,per,pbr,roe,roa')
          .eq('stock_code', parsed.stock_code).order('bsns_year', { ascending: false }).order('quarter', { ascending: false }).limit(8),
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
