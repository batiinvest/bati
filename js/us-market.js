// us-market.js — MARKET '미국 지표' 페이지 (11-12)
// [원본] 태린이아빠 Market Dashboard(공개 소스 app.py)의 미국 지표 세 화면을 한 페이지로 옮김
//   ① 미국 위험신호 canary()  — QQQ · TIP 각각 21 · 63 · 126 · 252거래일 수익률의 평균. 둘 다 양수면 공격, 아니면 방어.
//   ② 미국 피어앤그리드 FG_SRC — 125일 이격 · HYG÷IEF · VIX(역방향) · 10년−5년 금리 · RSI 10일 각 20%
//        → 2024-01부터 전체 구간 MinMax → EMA20, 오실레이터 = MACD(12, 26) − 시그널 9. 그래프는 최근 6개월.
//        계산·그림은 한국 피어앤그리드(fear-greed.js)의 공용 함수(fgComputeCore · fgDrawCharts · _fgScaleHTML)를 그대로 쓴다.
//   ③ 미국 유동성 체크 LIQ_SRC — 계산은 백엔드 collect_us_liquidity.py(FRED 15종), 여기서는 판정 코드에 문장을 붙여 보여 준다.
// [원본과 다른 점] 원본은 ①카드 3칸 ②그림 2장 ③글 출력. 여기는 ①에 기간별 수익률과 최근 120거래일 신호 띠,
//   ②에 오늘 위치 띠·구성 요소 점수, ③은 표·점검 목록으로 정리했다(숫자·판정 기준은 원본 그대로, 2026-11-12 대조 일치).
// 데이터: us_index_daily(평일 06:50 · 08:10) · us_liquidity_daily(매일 07:10 · 12:10)
// 의존: config.js (sb, fetchAllPages, escapeHtml, escAttr, setAsOf, _ICO), fear-greed.js, Chart.js

const USM = {
  rows: null,                    // us_index_daily 오름차순
  fg: { spx: [], ndx: [] },      // 피어앤그리드 계산 결과
  market: 'spx',
  liq: null,                     // us_liquidity_daily 최신 줄
  chart: null, oscChart: null,
  missing: false,                // 테이블 없음 (sql/us_indicators.sql 실행 전)
};

const USM_HORIZONS = [[21, '1개월'], [63, '3개월'], [126, '6개월'], [252, '12개월']];   // 원본 canary()
const USM_STRIP = 120;           // 위험신호 띠에 보이는 거래일 수
const USM_FG_MONTHS = 6;         // 원본 DISPLAY_MONTHS
const USM_FG_NEED = ['spx', 'ndx', 'vix', 'tnx', 'fvx', 'hyg', 'ief', 'qqq'];   // 원본 data.dropna() — 하나라도 비면 그날은 뺀다
const USM_FG_NAME = { spx: 'S&P500', ndx: '나스닥' };

function pUsMarket() {
  const lbl = 'font-size:calc(11px*var(--m-label));color:var(--text2)';
  return `
  <div class="usm-head">
    <div class="usm-lede">미국 장이 끝난 뒤의 <b>위험신호 · 시장 심리 · 달러 유동성</b>을 한 화면에서 점검합니다.
      지표 하나로 판단하기보다 서로 다른 자료가 같은 방향을 가리키는지 보는 용도입니다.</div>
  </div>

  <div class="card" id="usm-canary" style="margin-bottom:1rem">
    <div class="card-header" style="flex-wrap:wrap;gap:6px">
      <span class="card-title">${_ICO.flag || ''}위험신호</span>
      <span class="card-sub">QQQ · TIP 1 · 3 · 6 · 12개월 평균 모멘텀</span>
      <span id="usc-date" style="${lbl};margin-left:auto"></span>
    </div>
    <div id="usc-body"><div class="usm-msg">불러오는 중...</div></div>
  </div>

  <div class="card" style="margin-bottom:1rem">
    <div class="card-header" style="flex-wrap:wrap;gap:6px">
      <span class="card-title">${_ICO.temp || ''}미국 피어앤그리드</span>
      <span class="card-sub">시장 심리 0~100</span>
      <span id="usfg-date" style="${lbl};margin-left:auto"></span>
      <div style="display:flex;gap:4px">
        <button class="chip chip-sm active" data-usfg-market="spx" onclick="setUsFgMarket('spx')">S&amp;P500</button>
        <button class="chip chip-sm"        data-usfg-market="ndx" onclick="setUsFgMarket('ndx')">나스닥</button>
      </div>
    </div>
    <div id="usfg-scale" class="fg-scale"></div>
    <div class="fg-grid">
      <div class="fg-col-chart">
        <div id="usfg-charts">
          <div style="padding:.75rem 1rem 0;position:relative;height:240px"><canvas id="usfg-chart"></canvas></div>
          <div style="padding:0 1rem .5rem;position:relative;height:70px"><canvas id="usfg-osc-chart"></canvas></div>
          <div id="usfg-legend" class="fg-legend"></div>
        </div>
        <div id="usfg-empty" class="usm-msg" style="display:none"></div>
      </div>
      <div class="fg-col-side">
        <div id="usfg-facts"></div>
        <div style="padding:.6rem 1rem .75rem">
          <div style="${lbl};margin-bottom:4px">구성 요소별 탐욕 점수 (각 20%)</div>
          <div id="usfg-comp"></div>
          <div style="font-size:calc(11px*var(--m-label));color:var(--text3);margin-top:8px;line-height:1.5">
            2024년 1월부터 지금까지의 범위 안에서 각 요소를 0~100으로 맞춘 상대 점수라, 새 고점·저점이 생기면 과거 값도 조금 바뀝니다. 그래프는 최근 ${USM_FG_MONTHS}개월.
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="card" id="usm-liq">
    <div class="card-header" style="flex-wrap:wrap;gap:6px">
      <span class="card-title">${_ICO.flow || ''}유동성 체크</span>
      <span class="card-sub">Fed·재무부 유동성 · 민간 신용 · 엔캐리</span>
      <span id="usl-date" style="${lbl};margin-left:auto"></span>
    </div>
    <div id="usl-body"><div class="usm-msg">불러오는 중...</div></div>
  </div>`;
}

const _usmMissing = e => /42P01|PGRST205|does not exist|Could not find/.test(`${e?.code} ${e?.message}`);

async function loadUsMarket() {
  if (!document.getElementById('usc-body')) return;
  const [idx, liq] = await Promise.allSettled([
    fetchAllPages(sb.from('us_index_daily').select('base_date,spx,ndx,vix,tnx,fvx,hyg,ief,qqq,tip').order('base_date')),
    sb.from('us_liquidity_daily').select('base_date,payload').order('base_date', { ascending: false }).limit(1)
      .then(r => { if (r.error) throw r.error; return r.data; }),
  ]);
  if (!document.getElementById('usc-body')) return;   // 그 사이 다른 페이지로 넘어감

  // ①② 지수·ETF 종가
  if (idx.status === 'fulfilled') {
    USM.rows = idx.value || [];
    USM.fg = { spx: computeUsFearGreed(USM.rows, 'spx'), ndx: computeUsFearGreed(USM.rows, 'ndx') };
    USM.missing = false;
    usCanaryRender();
  } else {
    USM.rows = []; USM.fg = { spx: [], ndx: [] };
    USM.missing = _usmMissing(idx.reason);
    if (!USM.missing) console.warn('[미국 지표] 지수 로드 실패', idx.reason);
    document.getElementById('usc-body').innerHTML = `<div class="usm-msg">${USM.missing
      ? '준비 중 — 데이터 테이블이 아직 없습니다.' : '불러오지 못했습니다 — ' + escapeHtml(idx.reason?.message || '조회 실패')}</div>`;
  }
  renderUsFg();

  // ③ 유동성
  const body = document.getElementById('usl-body');
  if (liq.status === 'fulfilled') {
    USM.liq = (liq.value || [])[0] || null;
    usLiqRender();
  } else {
    if (!_usmMissing(liq.reason)) console.warn('[미국 지표] 유동성 로드 실패', liq.reason);
    body.innerHTML = `<div class="usm-msg">${_usmMissing(liq.reason)
      ? '준비 중 — 데이터 테이블이 아직 없습니다.' : '불러오지 못했습니다 — ' + escapeHtml(liq.reason?.message || '조회 실패')}</div>`;
  }
}

function unloadUsMarket() {
  ['chart', 'oscChart'].forEach(k => { if (USM[k]) { USM[k].destroy(); USM[k] = null; } });
}

const _usmPct = (v, d = 2) => v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d) + '%';
const _usmSignColor = v => v > 0 ? 'var(--up)' : v < 0 ? 'var(--down)' : 'var(--text1)';
const _usmMD = d => d ? `${+d.slice(5, 7)}/${+d.slice(8, 10)}` : '—';

// ── ① 위험신호 ─────────────────────────────────────────────────────────

// 종목별(원본은 종목마다 dropna) 기간 수익률 평균 → {date: {avg, rets[4]}}
function usCanarySeries(rows, col) {
  const rs = rows.filter(r => r[col] != null);
  const c = rs.map(r => +r[col]);
  const need = USM_HORIZONS[USM_HORIZONS.length - 1][0];
  const out = {};
  for (let i = need; i < rs.length; i++) {
    const rets = USM_HORIZONS.map(([n]) => c[i] / c[i - n] - 1);
    out[rs[i].base_date] = { avg: rets.reduce((s, v) => s + v, 0) / rets.length, rets };
  }
  return out;
}

function usCanaryRender() {
  const body = document.getElementById('usc-body');
  if (!body) return;
  const q = usCanarySeries(USM.rows, 'qqq'), t = usCanarySeries(USM.rows, 'tip');
  const dates = Object.keys(q).filter(d => t[d]).sort();
  if (!dates.length) {
    body.innerHTML = '<div class="usm-msg">아직 계산할 자료가 없습니다 — 평일 아침 7시쯤 채워집니다.</div>';
    setAsOf('usc-date', null);
    return;
  }
  const on = d => q[d].avg > 0 && t[d].avg > 0;      // 공격 = 둘 다 양수
  const last = dates[dates.length - 1], mode = on(last);
  let run = 1;
  while (dates.length - 1 - run >= 0 && on(dates[dates.length - 1 - run]) === mode) run++;
  const since = dates[dates.length - run];
  const whole = run === dates.length;                 // 계산 가능한 첫날부터 줄곧 같은 신호
  setAsOf('usc-date', last);

  const maxAbs = Math.max(...[q[last], t[last]].flatMap(x => x.rets.map(Math.abs)), 0.0001);
  const tile = (name, desc, x) => `
    <div class="usm-tile">
      <div class="usm-tile-n">${name} <span>${desc}</span></div>
      <div class="usm-tile-v" style="color:${_usmSignColor(x.avg)}">${_usmPct(x.avg * 100)}</div>
      <div class="usm-bars">${USM_HORIZONS.map(([, label], i) => {
        const v = x.rets[i], w = (Math.abs(v) / maxAbs * 50).toFixed(1);
        return `<div class="usm-bar-row"><span>${label}</span>
          <span class="usm-bar"><i style="${v >= 0 ? 'left:50%' : 'right:50%'};width:${w}%;background:${_usmSignColor(v)}"></i></span>
          <b style="color:${_usmSignColor(v)}">${_usmPct(v * 100, 1)}</b></div>`;
      }).join('')}</div>
    </div>`;

  const show = dates.slice(-USM_STRIP);
  const cells = show.map(d => `<i class="${on(d) ? 'on' : 'off'}" title="${escAttr(`${d} · ${on(d) ? '공격' : '방어'} — QQQ ${_usmPct(q[d].avg * 100)} · TIP ${_usmPct(t[d].avg * 100)}`)}"></i>`).join('');

  body.innerHTML = `
    <div class="usm-tiles">
      <div class="usm-tile usm-mode ${mode ? 'on' : 'off'}">
        <div class="usm-tile-n">현재 신호</div>
        <div class="usm-tile-v">${mode ? '공격 모드' : '방어 모드'}</div>
        <div class="usm-tile-s">${whole ? `${_usmMD(since)} 이전부터` : `${_usmMD(since)}부터`} ${run}거래일째</div>
        <div class="usm-tile-s">${mode ? 'QQQ · TIP 모멘텀이 둘 다 양수입니다.'
          : `${[q[last].avg <= 0 ? 'QQQ' : '', t[last].avg <= 0 ? 'TIP' : ''].filter(Boolean).join(' · ')} 모멘텀이 0 이하입니다.`}</div>
      </div>
      ${tile('QQQ', '나스닥100', q[last])}
      ${tile('TIP', '물가연동국채', t[last])}
    </div>
    <div class="usm-strip-wrap">
      <div class="usm-strip-h"><span>최근 ${show.length}거래일 신호</span><span>${_usmMD(show[0])} → ${_usmMD(last)}</span></div>
      <div class="usm-strip">${cells}</div>
    </div>
    <div class="usm-foot">
      <span><i class="usm-sw on"></i>공격 — 둘 다 양수</span>
      <span><i class="usm-sw off"></i>방어 — 하나라도 0 이하</span>
      <div class="usm-note">모멘텀 = 1 · 3 · 6 · 12개월(21 · 63 · 126 · 252거래일) 수익률의 평균. QQQ는 성장주 모멘텀, TIP는 금리·물가 환경을 봅니다.
        한쪽이라도 꺾이면 위험자산 비중을 늘리기 전에 한 번 더 점검하는 신호로 씁니다. 배당을 반영하지 않은 종가 기준(원본과 같음).</div>
    </div>`;
}

// ── ② 미국 피어앤그리드 ────────────────────────────────────────────────

// rows: us_index_daily 오름차순, col: 'spx' | 'ndx' → fear-greed.js 공용 계산
function computeUsFearGreed(rows, col) {
  const rs = rows.filter(r => USM_FG_NEED.every(k => r[k] != null));
  const price = rs.map(r => +r[col]);
  const ma125 = _fgRolling(price, 125, _fgMean);
  const feat = {
    mom:  price.map((p, i) => ma125[i] == null ? null : (p - ma125[i]) / ma125[i] * 100),
    risk: rs.map(r => +r.ief ? r.hyg / r.ief : null),
    vol:  rs.map(r => +r.vix),
    bond: rs.map(r => r.tnx - r.fvx),
    rsi:  _fgRsi(price, 10),
  };
  return fgComputeCore(rs.map(r => r.base_date), price, feat, ['vol']);   // VIX만 뒤집는다(낮을수록 탐욕)
}

function setUsFgMarket(m) {
  USM.market = m;
  document.querySelectorAll('[data-usfg-market]').forEach(b => b.classList.toggle('active', b.dataset.usfgMarket === m));
  renderUsFg();
}

function renderUsFg() {
  const canvas = document.getElementById('usfg-chart');
  if (!canvas) return;
  const el = id => document.getElementById(id);
  const res = USM.fg[USM.market] || [];
  if (res.length < 2) {
    el('usfg-charts').style.display = 'none';
    el('usfg-empty').style.display = 'block';
    el('usfg-empty').textContent = USM.missing ? '준비 중 — 데이터 테이블이 아직 없습니다.' : '데이터 수집 중... (평일 아침 7시쯤 업데이트)';
    ['usfg-scale', 'usfg-comp', 'usfg-facts'].forEach(id => { el(id).innerHTML = ''; });
    setAsOf('usfg-date', null);
    return;
  }
  el('usfg-charts').style.display = '';
  el('usfg-empty').style.display = 'none';
  const last = res[res.length - 1], prev = res[res.length - 2];
  const name = USM_FG_NAME[USM.market];
  setAsOf('usfg-date', last.date);

  el('usfg-scale').innerHTML = _fgScaleHTML(res);
  _fgPlaceScale(el('usfg-scale'));
  el('usfg-legend').innerHTML = _fgLegendHTML(name);

  // 오실레이터 흐름 — 같은 방향으로 며칠째인지(사실만)
  const up = last.osc > prev.osc;
  let run = 1;
  for (let i = res.length - 2; i > 0 && (res[i].osc > res[i - 1].osc) === up; i--) run++;
  const fs = 'font-size:calc(11px*var(--m-label))';
  el('usfg-facts').innerHTML = `<div style="padding:.5rem 1rem .55rem;border-bottom:1px solid var(--border);${fs};color:var(--text1);line-height:1.75">
    <div>${name} 종가 <b>${last.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</b></div>
    <div>피어앤그리드 <b>${last.fg.toFixed(1)}</b> · EMA20 <b>${last.ema20.toFixed(1)}</b></div>
    <div>오실레이터 <b>${_fgSigned(last.osc)}</b> (전날 ${_fgSigned(prev.osc)}) — ${run}일째 ${up ? '오름' : '내림'} · 0선 ${last.osc > 0 ? '위' : last.osc < 0 ? '아래' : ''}</div>
  </div>`;

  el('usfg-comp').innerHTML = fgCompHTML([
    { k: 'mom',  name: '125일 모멘텀' },
    { k: 'risk', name: '위험 선호 HYG÷IEF' },
    { k: 'vol',  name: 'VIX (낮을수록 탐욕)' },
    { k: 'bond', name: '10년 − 5년 금리' },
    { k: 'rsi',  name: 'RSI 10일' },
  ], last.comp);

  // 그래프는 최근 6개월(원본 DISPLAY_MONTHS) — 계산은 전체 구간
  const cut = new Date(last.date + 'T00:00:00Z');
  cut.setUTCMonth(cut.getUTCMonth() - USM_FG_MONTHS);
  const from = cut.toISOString().slice(0, 10);
  fgDrawCharts(USM, canvas, el('usfg-osc-chart'), res.filter(r => r.date >= from), name);
}

// ── ③ 유동성 체크 — 백엔드 판정 코드 → 문장(원본 판정을 줄여 옮김) ──────────────

const USL_STARS = n => `<span class="usm-stars" aria-label="별 ${n}개 / 5">${'★'.repeat(n)}<i>${'★'.repeat(5 - n)}</i></span>`;
const USL_REGIME = [[1, '긴축적'], [2, '비우호적'], [3, '혼조'], [4, '우호적'], [5, '매우 우호적']];   // Liquidity Score 0~4
const USL_CREDIT = [[1, '민간 신용 위축'], [3, '민간 신용 혼조'], [5, '민간 신용 강한 확장']];           // Private Credit 0~2
const USL_TOTAL = {
  best:   [5, '매우 우호적', '금융여건과 민간 신용이 함께 넓어지고 있습니다.'],
  worst:  [1, '매우 비우호적', 'Fed·재무부 환경과 민간 신용이 함께 약해지고 있습니다.'],
  shift:  [3, '체제 전환형 혼조', 'Fed·재무부 지표는 약하지만 은행 신용이 받쳐 줍니다.'],
  policy: [3, '정책 완화 선행', '시장금리·Fed 환경은 좋아지지만 민간 신용 확산은 아직 확인되지 않았습니다.'],
  good:   [4, '우호적', 'Fed·재무부 유동성은 혼조지만 민간 신용 확장이 강합니다.'],
  mixed:  [3, '혼조', 'Fed·재무부와 민간 신용 신호가 엇갈립니다.'],
};
const USL_MACRO = {
  riskon:       '금리 환경과 Fed·재무부 유동성이 함께 좋아지고 있습니다.',
  easing_noliq: 'Fed 완화 기대와 실질금리 하락은 보이지만 Fed·재무부 유동성은 아직 늘지 않았습니다.',
  tight:        '실질금리가 오르고 Fed·재무부 유동성도 줄어 위험자산에 불리한 환경입니다.',
  offset:       '유동성은 늘지만 실질금리 상승이 일부를 상쇄합니다.',
  mixed:        '금리와 Fed·재무부 유동성 신호가 엇갈립니다.',
};
const USL_STEEP = {
  good: '2년 금리가 내리며 벌어짐 — 금융여건 완화',
  bad:  '10년 금리가 오르며 벌어짐 — 재정·기간 프리미엄 부담',
  none: '완화형으로 벌어지는 모습 없음',
};
const USL_LOAN = { up: '증가 — 민간 신용창출 확대', slow: '1년 전보다는 늘었지만 최근 4주는 둔화', down: '감소·부진 — 민간 신용창출 약화' };
const USL_M2 = { up: '증가 — 광의통화 확장', slow: '1년 전보다는 늘었지만 최근 3개월은 둔화', down: '1년 전보다 감소 — 광의통화 위축' };
const USL_RESERVE = {
  warn:    ['warn', '경고', '최근 4주 급감 — 단기 자금시장 스트레스 점검'],
  caution: ['soft', '주의', '감소 중 — 당장 위험 신호는 아니지만 추세 점검'],
  ok:      ['', '양호', '안정·증가 — 은행 시스템 유동성 부담 제한적'],
};
const USL_RRP = {
  empty: ['warn', '거의 소진', '완충 여력이 없어 은행대출·M2·지급준비금이 더 중요해집니다.'],
  low:   ['soft', '낮음', '예전보다 완충 능력이 크게 줄었습니다.'],
  ok:    ['', '여력 있음', '일부 유동성 완충 여력이 있습니다.'],
};
const USL_LONG = {
  best:    [5, '매우 긍정적', '30년 금리 하락 + 30년−10년 축소 — 초장기 물가·재정 부담 완화'],
  good:    [4, '긍정적', '10년·30년 금리 동반 하락 — 장기 금융여건 완화'],
  caution: [2, '주의', '10년은 내리는데 30년은 버팀 — 초장기 재정 부담 지속'],
  bad:     [1, '부정적', '30년 금리 상승 + 30년−10년 확대 — 장기 물가·재정 부담 증가'],
  neutral: [3, '중립', '초장기 금리 방향을 더 확인해야 합니다.'],
};
const USL_STRUCT = {
  all_ease:  '단기·실질·초장기 금리가 함께 내려, 완화 기대와 장기 위험 프리미엄 완화가 같이 나타납니다.',
  no30:      '2년·10년 금리는 내리지만 30년이 따라오지 않습니다. 초장기 재정·국채 공급 부담이 남아 있습니다.',
  split:     'Fed 완화 기대와 초장기 재정 부담이 함께 나타나는 갈라진 금리시장입니다.',
  all_tight: '단기·실질·초장기 금리가 모두 올라 긴축 압력이 강합니다.',
  mixed:     '금리곡선 안의 신호가 섞여 있습니다.',
};
const USL_ASSET = {
  gold:  { best: ['매우 우호적', '실질금리 하락 + 초장기금리 하락'], good: ['우호적', '실질금리 하락'], bad: ['부담', '실질금리 상승'] },
  btc:   { best: ['매우 우호적', '금리 환경 개선 + 유동성·민간 신용 확장'], good: ['우호적', '금리 환경 개선, 유동성 확산은 더 확인'],
           caution: ['주의', 'Fed·재무부 유동성과 민간 신용 모두 약화'], neutral: ['중립', '뚜렷한 방향 확인 필요'] },
  small: { best: ['매우 우호적', '단기금리 하락 + 민간 신용 확장 + 장기금리 안정'], good: ['우호적', '단기금리 하락 + 은행 신용·M2 확장'],
           maybe: ['개선 가능', '금융여건 완화 기대가 먼저 나타남'], wait: ['확인 필요', '아직 뚜렷한 신호 없음'] },
};
const USL_CARRY = {
  low:       ['', '낮음', '엔화 급등 신호가 없습니다.'],
  watch:     ['soft', '관찰', '엔화 강세는 있으나 금리차 축소·시장 스트레스는 확인이 필요합니다.'],
  rising:    ['soft', '높아지는 중', '엔화 강세와 금리차 축소가 함께 나타납니다.'],
  high:      ['warn', '높음', '엔화 강세 + 금리차 축소 + 위험자산 스트레스가 확인됩니다.'],
  very_high: ['warn', '매우 높음', '엔화 급등 + 금리차 축소 + VIX·일본 증시 스트레스가 동시에 나타납니다.'],
};
const USL_SIM = { very: '2024년 8월 청산 국면과 매우 비슷', rising: '2024년 8월과 유사성 상승', some: '일부 비슷한 신호', low: '2024년 8월과 유사성 낮음' };

function usLiqRender() {
  const body = document.getElementById('usl-body');
  if (!body) return;
  const p = USM.liq?.payload;
  if (!p) {
    body.innerHTML = '<div class="usm-msg">아직 계산된 날이 없습니다 — 매일 아침 7시쯤 채워집니다.</div>';
    setAsOf('usl-date', null);
    return;
  }
  setAsOf('usl-date', p.data_date);
  const n = p.now, c = p.chg, cy = p.carry, cn = cy.now, cr = cy.ref;
  const f = (v, d = 2) => v == null ? '—' : (+v).toFixed(d);
  const sg = (v, d = 2, unit = '') => {
    if (v == null) return '—';
    const r = +(+v).toFixed(d);          // 반올림해 0이면 부호·색을 붙이지 않는다
    return `<span style="color:${_usmSignColor(r)}">${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toFixed(d)}${unit}</span>`;
  };
  const usd = (v, d = 2) => v == null ? '—' : `${(+v).toFixed(d)}조 달러`;
  const tag = (cls, text) => `<b class="usm-tag${cls ? ' ' + cls : ''}">${text}</b>`;
  const pt = met => `<b class="usm-pt${met ? ' on' : ''}">${met ? '+1' : '0'}</b>`;
  const hit = met => `<b class="usm-hit${met ? ' on' : ''}">${met ? '충족' : '—'}</b>`;

  const [totalStar, totalName, totalDesc] = USL_TOTAL[p.total] || USL_TOTAL.mixed;
  const [regStar, regName] = USL_REGIME[p.score] || USL_REGIME[2];
  const [crdStar, crdName] = USL_CREDIT[p.credit] || USL_CREDIT[1];
  const [carCls, carName, carDesc] = USL_CARRY[cy.regime] || USL_CARRY.low;
  const [resCls, resName, resDesc] = USL_RESERVE[p.reserve] || USL_RESERVE.ok;
  const [rrpCls, rrpName, rrpDesc] = USL_RRP[p.rrp] || USL_RRP.ok;
  const [longStar, longName, longDesc] = USL_LONG[p.long_rate] || USL_LONG.neutral;

  const summary = `
    <div class="usm-sum">
      <div class="usm-sum-main">
        <div class="usm-tile-n">종합 유동성</div>
        <div class="usm-sum-v">${USL_STARS(totalStar)}<b>${totalName}</b></div>
        <div class="usm-tile-s">${totalDesc}</div>
      </div>
      <div><div class="usm-tile-n">Fed·재무부 유동성</div>
        <div class="usm-sum-v"><b>${p.score}</b><small>/ 4</small></div><div class="usm-tile-s">${USL_STARS(regStar)} ${regName}</div></div>
      <div><div class="usm-tile-n">민간 신용</div>
        <div class="usm-sum-v"><b>${p.credit}</b><small>/ 2</small></div><div class="usm-tile-s">${USL_STARS(crdStar)} ${crdName}</div></div>
      <div><div class="usm-tile-n">엔캐리 청산 위험</div>
        <div class="usm-sum-v"><b>${cy.score}</b><small>/ 6</small></div><div class="usm-tile-s">${tag(carCls, carName)} 2024-08 유사도 ${f(cy.similarity, 0)}%</div></div>
    </div>`;

  // 점검 목록 한 줄: 점수 · 항목 · 판정 문장 · 수치
  const row = (mark, name, desc, nums) => `
    <div class="usm-row">${mark}<div class="usm-row-t"><b>${name}</b><span>${desc}</span></div><div class="usm-row-n">${nums}</div></div>`;

  const fedBlock = `
    <div class="usm-block">
      <div class="usm-block-h"><b>Fed·재무부 유동성</b><span>최근 4주 변화로 4점</span></div>
      ${row(pt(p.sig.real), '10년 실질금리', p.sig.real ? '하락 — 위험자산 할인율 부담 완화' : '상승 — 위험자산 할인율 부담',
        `${f(n.real10y)}% <small>4주 ${sg(c.real10y, 2, '%p')}</small>`)}
      ${row(pt(p.sig.y2), '2년 금리', p.sig.y2 ? '하락 — Fed 완화 기대 강화' : '상승 — 긴축·고금리 기대',
        `${f(n.y2)}% <small>4주 ${sg(c.y2, 2, '%p')}</small>`)}
      ${row(pt(p.sig.steep === 'good'), '10년 − 2년 금리차', USL_STEEP[p.sig.steep] || USL_STEEP.none,
        `${f(n.sp10_2)}%p <small>4주 ${sg(c.sp10_2, 2, '%p')}</small>`)}
      ${row(pt(p.sig.liq), '유동성 대용치', `${p.sig.liq ? '증가' : '감소'} — Fed 자산 − 재무부 계좌(TGA) − 역레포(RRP)`,
        `${usd(n.netliq)} <small>4주 ${sg(c.netliq, 3, '조')}</small>`)}
      <div class="usm-sub">Fed 자산 ${usd(n.fed)} · TGA ${usd(n.tga)} · RRP ${usd(n.rrp, 3)}</div>
      <div class="usm-say">${USL_MACRO[p.macro] || USL_MACRO.mixed}</div>
    </div>`;

  const creditBlock = `
    <div class="usm-block">
      <div class="usm-block-h"><b>민간 신용</b><span>은행대출 · 광의통화로 2점</span></div>
      ${row(pt(p.credit_sig.loan === 'up'), '은행대출', USL_LOAN[p.credit_sig.loan] || '',
        `${usd(n.loans)} <small>4주 ${sg(c.loan_4w_pct, 2, '%')} · 1년 ${sg(c.loan_yoy, 2, '%')}</small>`)}
      ${row(pt(p.credit_sig.m2 === 'up'), `M2 <small>${+n.m2_date.slice(5, 7)}월</small>`, USL_M2[p.credit_sig.m2] || '',
        `${usd(n.m2)} <small>3개월 연율 ${sg(c.m2_3m_ann, 2, '%')} · 1년 ${sg(c.m2_yoy, 2, '%')}</small>`)}
      <div class="usm-block-h usm-block-h2"><b>경고등</b><span>점수에는 넣지 않음</span></div>
      ${row(tag(resCls, resName), '은행 지급준비금', resDesc,
        `${usd(n.reserves)} <small>4주 ${sg(c.reserve_4w, 3, '조')} (${sg(c.reserve_4w_pct, 2, '%')})</small>`)}
      ${row(tag(rrpCls, rrpName), '역레포(RRP) 완충', rrpDesc, usd(n.rrp, 3))}
    </div>`;

  const rateBlock = `
    <div class="usm-block">
      <div class="usm-block-h"><b>금리</b><span>현재 · 최근 4주 변화</span></div>
      <table class="usm-tbl"><thead><tr><th></th><th>현재</th><th>4주 변화</th></tr></thead><tbody>
        ${[['10년 실질금리', n.real10y, c.real10y, '%'], ['2년', n.y2, c.y2, '%'], ['10년', n.y10, c.y10, '%'], ['30년', n.y30, c.y30, '%'],
           ['10년 − 2년', n.sp10_2, c.sp10_2, '%p'], ['30년 − 10년', n.sp30_10, c.sp30_10, '%p']]
          .map(([name, v, d, u]) => `<tr><td>${name}</td><td>${f(v)}${u}</td><td>${sg(d, 2, '%p')}</td></tr>`).join('')}
      </tbody></table>
    </div>`;

  const asset = (name, key) => {
    const [label, why] = (USL_ASSET[key] || {})[p[key]] || ['—', ''];
    return `<div class="usm-asset"><div class="usm-tile-n">${name}</div><div class="usm-asset-v">${label}</div><div class="usm-tile-s">${why}</div></div>`;
  };
  const assetBlock = `
    <div class="usm-block">
      <div class="usm-block-h"><b>초장기 금리</b><span>재정 · 기간 프리미엄</span></div>
      <div class="usm-say" style="margin-top:0"><span>${USL_STARS(longStar)} <b>${longName}</b></span> — ${longDesc}</div>
      <div class="usm-say">${USL_STRUCT[p.rate_struct] || USL_STRUCT.mixed}</div>
      <div class="usm-block-h usm-block-h2"><b>자산별 해석</b><span>위 신호를 자산에 대 보면</span></div>
      <div class="usm-assets">${asset('금', 'gold')}${asset('비트코인', 'btc')}${asset('중소형주', 'small')}</div>
    </div>`;

  // 엔캐리 — 조건 여섯 개: 현재 · 2024-08-05 · 당시 대비 스트레스
  const part = k => cy.parts && cy.parts[k] != null ? `${Math.round(cy.parts[k] * 100)}%` : '';
  const cRow = (met, name, rule, cur, ref, ratio) =>
    `<tr class="${met ? 'on' : ''}"><td>${hit(met)}</td><td><b>${name}</b><small>${rule}</small></td><td>${cur}</td><td>${ref}</td><td>${ratio}</td></tr>`;
  const carryBlock = `
    <div class="usm-block usm-block-wide">
      <div class="usm-block-h"><b>엔캐리 청산 위험</b><span>${tag(carCls, carName)} ${carDesc}</span></div>
      <div class="table-wrap"><table class="usm-tbl usm-carry">
        <thead><tr><th></th><th>신호 · 조건</th><th>현재</th><th>2024-08-05</th><th>당시 대비</th></tr></thead><tbody>
        ${cRow(cy.trig.yen, '엔화 급등', '달러/엔 5일 −2.5% 이하 또는 4주 −5% 이하',
          `5일 ${sg(cn.JPY_5D, 2, '%')} · 4주 ${sg(cn.JPY_4W, 2, '%')}<small>달러/엔 ${f(cn.USDJPY)}</small>`,
          `5일 ${sg(cr.JPY_5D, 2, '%')} · 4주 ${sg(cr.JPY_4W, 2, '%')}`, part('JPY'))}
        ${cRow(cy.trig.rate, '미국 2년 금리 급락', '4주 −0.30%p 이하',
          `${sg(cn.US2Y_4W, 2, '%p')}<small>${f(cn.US2Y)}%</small>`, sg(cr.US2Y_4W, 2, '%p'), part('US2Y'))}
        ${cRow(cy.trig.gap, '미·일 단기금리차 축소', '4주 −0.25%p 이하 (일본 금리는 월간 — 보조 신호)',
          `${sg(cn.CarryGapChange, 2, '%p')}<small>금리차 ${f(cn.CarryGap)}%p</small>`, sg(cr.CarryGapChange, 2, '%p'), '')}
        ${cRow(cy.trig.vol, 'VIX 급등', '25 이상 또는 5일 +50% 이상',
          `${f(cn.VIX)}<small>5일 ${sg(cn.VIX_5D, 1, '%')}</small>`, `${f(cr.VIX)}<small>5일 ${sg(cr.VIX_5D, 1, '%')}</small>`, part('VIX'))}
        ${cRow(cy.trig.nikkei, '닛케이 급락', '5일 −7% 이하', sg(cn.Nikkei_5D, 2, '%'), sg(cr.Nikkei_5D, 2, '%'), part('Nikkei'))}
        ${cRow(cy.trig.growth, '미국 경기 둔화', 'Sahm 지표 0.40 이상', f(cn.Sahm), f(cr.Sahm), part('Sahm'))}
      </tbody></table></div>
      <div class="usm-sim">
        <div class="usm-sim-n"><b>${f(cy.similarity, 0)}%</b><span>2024-08-05 유사도 — ${USL_SIM[cy.sim_view] || ''}</span></div>
        <div class="usm-sim-bar" role="img" aria-label="유사도 ${f(cy.similarity, 0)}%"><i style="width:${Math.max(0, Math.min(100, cy.similarity || 0)).toFixed(1)}%"></i>
          <span style="left:25%"></span><span style="left:50%"></span><span style="left:75%"></span></div>
        <div class="usm-sim-s"><span>0</span><span>25 일부</span><span>50 상승</span><span>75 매우 비슷</span><span>100</span></div>
      </div>
      <div class="usm-say">엔화가 강해지지 않으면 VIX나 닛케이가 흔들려도 엔캐리 청산으로 보지 않습니다.
        유사도는 '당시 대비' 다섯 칸을 엔 30 · 미 2년 25 · VIX 20 · 닛케이 15 · Sahm 10의 비중으로 더한 값입니다(VIX는 15를 넘는 만큼만 셉니다).</div>
    </div>`;

  const a = p.asof || {};
  body.innerHTML = `${summary}
    <div class="usm-grid">${fedBlock}${creditBlock}${rateBlock}${assetBlock}${carryBlock}</div>
    <div class="usm-foot"><div class="usm-note">자료 FRED — 금리 ${_usmMD(a.Treasury2Y)} · Fed 자산·TGA·지급준비금 ${_usmMD(a.FedAssets)}(주간) · RRP ${_usmMD(a.RRP)} ·
      은행대출 ${_usmMD(a.BankLoans)}(주간) · 달러/엔 ${_usmMD(a.USDJPY)} · VIX ${_usmMD(a.VIX)} · 닛케이 ${_usmMD(a.Nikkei225)} · Sahm ${a.Sahm ? +a.Sahm.slice(5, 7) + '월' : '—'} ·
      일본 단기금리 ${a.JapanCall ? +a.JapanCall.slice(5, 7) + '월' : '—'}. 주간 값은 금요일로 끝나는 주의 마지막 값, 4주 변화는 4주 전 주와 비교합니다.
      계산은 태린이아빠 '미국 유동성 체크'와 같습니다(${escapeHtml(USM.liq.base_date)} 계산).</div></div>`;
}
