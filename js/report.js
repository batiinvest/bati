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
    const { data } = await sb.from('monitored_stocks')
      .select('stock_code,corp_name,market')
      .or(`corp_name.ilike.%${q}%,stock_code.ilike.%${q}%`)
      .limit(10);

    if (!data?.length) { dd.style.display = 'none'; return; }

    dd.innerHTML = data.map(r => `
      <div onclick="rpSelectStock('${r.stock_code}','${r.corp_name}')"
        style="padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--border);
          display:flex;align-items:center;gap:8px"
        onmouseover="this.style.background='var(--bg3)'"
        onmouseout="this.style.background=''">
        <span style="font-size:13px;font-weight:500">${r.corp_name}</span>
        <span style="font-size:11px;color:var(--text3)">${r.stock_code}</span>
        <span style="font-size:10px;color:var(--text3);margin-left:auto">${r.market||''}</span>
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
    const { data } = await sb.from('monitored_stocks')
      .select('stock_code,corp_name,market')
      .or(`corp_name.ilike.%${q}%,stock_code.ilike.%${q}%`)
      .limit(1)
      .maybeSingle();
    if (data) _rpStock = { code: data.stock_code, name: data.corp_name };
  }
  if (!_rpStock) { toast('종목을 선택해주세요.', 'warn'); return; }

  // 페이지 재렌더링
  const el = document.getElementById('content');
  if (el) el.innerHTML = pReport();

  const body = document.getElementById('rp-body');
  if (body) body.innerHTML = _rpSkeleton();

  // 병렬 데이터 로드
  try {
    const [priceRes, finRes, watchRes] = await Promise.all([
      sb.from('market_data').select('price,price_change_rate,market_cap,volume,trading_value,foreign_hold_rate')
        .eq('stock_code', _rpStock.code).order('base_date', { ascending: false }).limit(60),
      sb.from('financials').select('period,revenue,operating_income,net_income,total_assets,total_equity,total_debt,per,pbr,roe,roa')
        .eq('stock_code', _rpStock.code).order('period', { ascending: false }).limit(8),
      sb.from('watchlist').select('note,target_price,opinion,buy_price,created_at')
        .eq('stock_code', _rpStock.code).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);

    _rpData = {
      price:   priceRes.data  || [],
      fin:     finRes.data    || [],
      watch:   watchRes.data  || null,
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

  // 52주 고/저
  const recentPrices = prices.map(r => r.price).filter(Boolean);
  const high52 = recentPrices.length ? Math.max(...recentPrices) : 0;
  const low52  = recentPrices.length ? Math.min(...recentPrices) : 0;
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
          <span style="font-size:22px;font-weight:800">${_rpStock.name}</span>
          <span style="font-size:13px;color:var(--text3)">${_rpStock.code}</span>
          ${latestF.per  ? `<span style="font-size:11px;padding:2px 7px;border-radius:100px;background:var(--bg3);color:var(--text2)">PER ${latestF.per?.toFixed(1)}x</span>` : ''}
          ${latestF.pbr  ? `<span style="font-size:11px;padding:2px 7px;border-radius:100px;background:var(--bg3);color:var(--text2)">PBR ${latestF.pbr?.toFixed(2)}x</span>` : ''}
        </div>
        <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap">
          <span style="font-size:28px;font-weight:700">${price ? fmtNum(price) + '원' : '—'}</span>
          <span style="font-size:16px;font-weight:600;color:${chgColor}">${chgStr}</span>
        </div>
        <div style="display:flex;gap:16px;margin-top:8px;flex-wrap:wrap">
          ${mktCap ? `<span style="font-size:12px;color:var(--text3)">시총 <b style="color:var(--text1)">${fmtCap(mktCap)}</b></span>` : ''}
          ${fr != null ? `<span style="font-size:12px;color:var(--text3)">외국인 <b style="color:var(--text1)">${fr.toFixed(1)}%</b></span>` : ''}
          ${latestF.roe ? `<span style="font-size:12px;color:var(--text3)">ROE <b style="color:var(--text1)">${latestF.roe?.toFixed(1)}%</b></span>` : ''}
        </div>
      </div>

      <!-- 52주 가격 위치 -->
      ${high52 > 0 ? `
      <div style="min-width:160px">
        <div style="font-size:10px;color:var(--text3);margin-bottom:6px;text-align:center">52주 가격 위치</div>
        <div style="height:6px;border-radius:3px;background:var(--border);position:relative;margin:0 4px">
          <div style="position:absolute;left:0;top:0;height:100%;width:${pos52}%;
            background:linear-gradient(90deg,var(--blue),var(--tg));border-radius:3px;transition:width .4s"></div>
          <div style="position:absolute;top:-4px;left:calc(${pos52}% - 7px);width:14px;height:14px;
            border-radius:50%;background:white;border:2px solid var(--tg);box-shadow:0 2px 6px rgba(0,0,0,.3)"></div>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:10px;color:var(--text3)">
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
      <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.8px">투자 의견</div>
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
          color:var(--text3);font-size:11px;line-height:1.5">
          투자노트에서<br>목표주가 설정
        </div>`}
      <a onclick="go('watchlist')" style="font-size:11px;text-align:center;color:var(--tg);cursor:pointer">
        투자노트 편집 →
      </a>
    </div>

    <!-- 핵심 투자 논거 -->
    <div class="card" style="padding:16px">
      <div style="display:grid;grid-template-rows:1fr 1fr;gap:12px;height:100%">

        <!-- Bull case -->
        <div>
          <div style="font-size:11px;font-weight:700;color:#4ade80;margin-bottom:8px;display:flex;align-items:center;gap:6px">
            <span style="width:6px;height:6px;border-radius:50%;background:#4ade80;display:inline-block"></span>
            핵심 투자포인트 (Bull Case)
          </div>
          ${watch?.note ? `
            <div id="rp-bull-points" style="font-size:12px;color:var(--text2);line-height:1.7">
              ${_rpFormatNote(watch.note)}
            </div>` : `
            <div style="display:flex;flex-direction:column;gap:6px" id="rp-bull-points">
              ${[
                '핵심 투자포인트를 투자노트에 작성해주세요',
                '예) HBM 수주 확대로 데이터센터 모멘텀 강화',
                '예) 하반기 ASP 상승 + 원가 하락 → 마진 개선'
              ].map((t,i) => `
              <div style="display:flex;align-items:flex-start;gap:8px">
                <span style="color:#4ade80;font-weight:700;font-size:12px;margin-top:1px">•</span>
                <span style="font-size:12px;color:${i===0?'var(--text3)':'var(--border)'}">${t}</span>
              </div>`).join('')}
            </div>`}
        </div>

        <!-- Bear case -->
        <div style="border-top:1px solid var(--border);padding-top:10px">
          <div style="font-size:11px;font-weight:700;color:#f87171;margin-bottom:8px;display:flex;align-items:center;gap:6px">
            <span style="width:6px;height:6px;border-radius:50%;background:#f87171;display:inline-block"></span>
            주요 리스크 (Bear Case)
          </div>
          <div style="display:flex;flex-direction:column;gap:6px">
            ${[
              '투자노트에 리스크 요인을 추가하세요',
              '예) 미중 무역분쟁 재확대 시 수출 타격',
              '예) 경쟁사 공격적 증설로 공급과잉 우려'
            ].map((t,i) => `
            <div style="display:flex;align-items:flex-start;gap:8px">
              <span style="color:#f87171;font-weight:700;font-size:12px;margin-top:1px">•</span>
              <span style="font-size:12px;color:${i===0?'var(--text3)':'var(--border)'}">${t}</span>
            </div>`).join('')}
          </div>
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
      ${['실적상세','재무상세','수급흐름','공시/뉴스'].map((t,i) => `
        <button onclick="rpSetTab(${i})" id="rp-tab-${i}"
          style="flex:1;padding:10px 4px;font-size:12px;font-weight:600;border:none;
            background:none;cursor:pointer;border-bottom:2px solid ${i===0?'var(--tg)':'transparent'};
            color:${i===0?'var(--tg)':'var(--text3)'};transition:all .2s">${t}</button>`).join('')}
    </div>
    <div id="rp-tab-body" style="padding:14px">
      ${_rpTabEarnings(_rpData.fin)}
    </div>
  </div>

  `;

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
      <div style="font-size:12px;font-weight:700;margin-bottom:12px;color:var(--text2)">📊 실적 트렌드</div>
      <div style="padding:20px;text-align:center;color:var(--text3);font-size:12px">재무 데이터 없음</div>
    </div>`;

  const items = [...fin].reverse().slice(-6);
  const maxRev = Math.max(...items.map(f => f.revenue || 0));
  const maxOp  = Math.max(...items.map(f => Math.abs(f.operating_income || 0)));

  return `<div class="card" style="padding:16px">
    <div style="font-size:12px;font-weight:700;margin-bottom:12px;color:var(--text2)">📊 실적 트렌드</div>
    <div style="display:flex;gap:3px;align-items:flex-end;height:80px;margin-bottom:8px">
      ${items.map(f => {
        const rev  = f.revenue || 0;
        const op   = f.operating_income || 0;
        const revH = maxRev > 0 ? Math.round(rev / maxRev * 72) : 4;
        const opH  = maxOp  > 0 ? Math.round(Math.abs(op) / maxOp * 72) : 4;
        const opC  = op >= 0 ? 'var(--tg)' : 'var(--red)';
        const period = (f.period || '').replace(/(\d{4})-?(\d{2})?/, '$1' + (f.period?.includes('Q') || f.period?.includes('q') ? '' : '연간'));
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
      const opYoy = fin[1].operating_income ? (fin[0].operating_income - fin[1].operating_income) / Math.abs(fin[1].operating_income) * 100 : null;
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
          <div style="font-size:13px;font-weight:700;color:var(--text1)">${fin[0].revenue > 0 ? ((fin[0].operating_income||0)/fin[0].revenue*100).toFixed(1) : '—'}%</div>
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
    <div style="font-size:12px;font-weight:700;margin-bottom:12px;color:var(--text2)">💎 밸류에이션 & 수익성</div>
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
            height:${h}px" title="PER ${f.per?.toFixed(1)}x (${f.period})"></div>`;
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
    <div style="font-size:12px;font-weight:700;margin-bottom:12px;color:var(--text2)">🏦 재무 건전성</div>
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
    <div style="font-size:12px;font-weight:700;margin-bottom:12px;color:var(--text2)">🔄 수급 현황</div>
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
    <div style="font-size:12px;font-weight:700;margin-bottom:12px;color:var(--text2)">⚡ 카탈리스트</div>
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
function rpSetTab(idx) {
  document.querySelectorAll('[id^="rp-tab-"]').forEach((b, i) => {
    b.style.borderBottomColor = i === idx ? 'var(--tg)' : 'transparent';
    b.style.color = i === idx ? 'var(--tg)' : 'var(--text3)';
  });
  const body = document.getElementById('rp-tab-body');
  if (!body) return;
  const fns = [
    () => _rpTabEarnings(_rpData.fin),
    () => _rpTabFinDetail(_rpData.fin),
    () => _rpTabFlow(_rpData.price),
    () => _rpTabNews(),
  ];
  body.innerHTML = fns[idx]?.() || '';
}

function _rpTabEarnings(fin) {
  if (!fin?.length) return `<div style="padding:20px;text-align:center;color:var(--text3);font-size:12px">재무 데이터 없음</div>`;
  return `
  <div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead>
        <tr style="border-bottom:2px solid var(--border)">
          <th style="padding:6px 10px;text-align:left;color:var(--text3);font-weight:600">기간</th>
          <th style="padding:6px 10px;text-align:right;color:var(--text3);font-weight:600">매출액</th>
          <th style="padding:6px 10px;text-align:right;color:var(--text3);font-weight:600">영업이익</th>
          <th style="padding:6px 10px;text-align:right;color:var(--text3);font-weight:600">영업이익률</th>
          <th style="padding:6px 10px;text-align:right;color:var(--text3);font-weight:600">순이익</th>
        </tr>
      </thead>
      <tbody>
        ${fin.map((f, i) => {
          const opm = f.revenue > 0 ? (f.operating_income / f.revenue * 100) : null;
          const prevRev = fin[i+1]?.revenue;
          const yoy = prevRev > 0 && f.revenue ? ((f.revenue - prevRev) / prevRev * 100) : null;
          return `<tr style="border-bottom:1px solid var(--border)${i===0?';background:var(--bg3)':''}">
            <td style="padding:7px 10px;font-weight:${i===0?700:400}">${f.period || '—'}</td>
            <td style="padding:7px 10px;text-align:right">${f.revenue ? fmtCap(f.revenue) : '—'}
              ${yoy != null ? `<span style="font-size:10px;color:${yoy>=0?'var(--red)':'var(--blue)'};margin-left:3px">${yoy>=0?'+':''}${yoy.toFixed(0)}%</span>` : ''}
            </td>
            <td style="padding:7px 10px;text-align:right;color:${(f.operating_income||0)>=0?'var(--red)':'var(--blue)'}">${f.operating_income != null ? fmtCap(f.operating_income) : '—'}</td>
            <td style="padding:7px 10px;text-align:right">${opm != null ? opm.toFixed(1)+'%' : '—'}</td>
            <td style="padding:7px 10px;text-align:right;color:${(f.net_income||0)>=0?'var(--red)':'var(--blue)'}">${f.net_income != null ? fmtCap(f.net_income) : '—'}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>`;
}

function _rpTabFinDetail(fin) {
  if (!fin?.length) return `<div style="padding:20px;text-align:center;color:var(--text3);font-size:12px">재무 데이터 없음</div>`;
  return `
  <div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead>
        <tr style="border-bottom:2px solid var(--border)">
          <th style="padding:6px 10px;text-align:left;color:var(--text3);font-weight:600">기간</th>
          <th style="padding:6px 10px;text-align:right;color:var(--text3)">총자산</th>
          <th style="padding:6px 10px;text-align:right;color:var(--text3)">자기자본</th>
          <th style="padding:6px 10px;text-align:right;color:var(--text3)">부채비율</th>
          <th style="padding:6px 10px;text-align:right;color:var(--text3)">ROE</th>
          <th style="padding:6px 10px;text-align:right;color:var(--text3)">PER</th>
          <th style="padding:6px 10px;text-align:right;color:var(--text3)">PBR</th>
        </tr>
      </thead>
      <tbody>
        ${fin.map((f, i) => {
          const dr = f.total_equity > 0 && f.total_debt != null ? (f.total_debt / f.total_equity * 100) : null;
          return `<tr style="border-bottom:1px solid var(--border)${i===0?';background:var(--bg3)':''}">
            <td style="padding:7px 10px;font-weight:${i===0?700:400}">${f.period||'—'}</td>
            <td style="padding:7px 10px;text-align:right">${f.total_assets ? fmtCap(f.total_assets) : '—'}</td>
            <td style="padding:7px 10px;text-align:right">${f.total_equity ? fmtCap(f.total_equity) : '—'}</td>
            <td style="padding:7px 10px;text-align:right;color:${dr!=null&&dr>200?'var(--red)':''}">${dr != null ? dr.toFixed(0)+'%' : '—'}</td>
            <td style="padding:7px 10px;text-align:right;color:${f.roe>10?'var(--tg)':''}">${f.roe != null ? f.roe.toFixed(1)+'%' : '—'}</td>
            <td style="padding:7px 10px;text-align:right">${f.per != null ? f.per.toFixed(1)+'x' : '—'}</td>
            <td style="padding:7px 10px;text-align:right">${f.pbr != null ? f.pbr.toFixed(2)+'x' : '—'}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>`;
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

// ── fmtNum 호환 헬퍼 ──────────────────────────────────────────────────────────
function fmtNum(v) {
  if (v == null) return '—';
  return Math.round(v).toLocaleString('ko-KR');
}
