// fear-greed.js — 오늘의 시황: 한국 피어앤그리드(Fear & Greed) 카드 (코스피·코스닥)
// [원본] 태린이아빠 「한국 피어앤그리드오실레이터」(2026-09-18 자료) 계산을 그대로 옮김
//   5요소 × 20%: ① 125일 모멘텀 ② ATM 풋/콜(5일 평균 매수 거래량, 역방향) ③ VKOSPI(역방향)
//               ④ 10년 − 5년 국채선물지수 ⑤ RSI 10일
//   각 요소를 계산 구간 안에서 MinMax(0~1)로 맞춘 뒤 가중합 → 0~100.
//   EMA20 = 지수의 20일 지수이동평균, 오실레이터 = 지수(0~1)의 MACD(12,26) − 시그널(9).
//   계산 구간 = 최근 1년 원자료(원본이 1년치 엑셀로 돌리는 것과 같게). 125일 이동평균이
//   앞 반년을 쓰므로 지수는 뒤 반년쯤만 나온다(원본과 같음).
// 데이터: fear_greed_daily (백엔드 collect_fear_greed.py가 평일 18:22 수집)
// 의존: config.js (sb, chartTheme, setAsOf), Chart.js

const FG = {
  market: 'kospi',   // kospi | kosdaq
  rows: null,        // 원자료 (오름차순)
  result: null,      // { kospi: [...], kosdaq: [...] } 계산 결과 캐시
  chart: null,
  oscChart: null,
  missing: false,    // 테이블 미생성 (sql/fear_greed.sql 실행 전)
};

const FG_WINDOW_DAYS = 365;      // 계산 구간(원자료)
const FG_COLORS = { fg: '#1565C0', ema: '#F57C00', price: '#8590ad' };
// 두 차트의 x축을 맞추려고 좌·우 축 폭을 고정한다
const FG_AXIS_L = 40, FG_AXIS_R = 46;
const _fgFixW = w => ({ afterFit: sc => { sc.width = w; } });

// 원본 그래프 기준선(20·50·80)으로 나눈 구간
function fgZone(v) {
  if (v == null) return { label: '—', color: 'var(--text2)' };
  if (v < 20) return { label: '극단적 공포', color: 'var(--down)' };
  if (v < 50) return { label: '공포',       color: 'var(--down)' };
  if (v < 80) return { label: '탐욕',       color: 'var(--up)' };
  return             { label: '극단적 탐욕', color: 'var(--up)' };
}

// ── 순수 계산 (원본 pandas 코드와 같은 식) ──────────────────────────────

function _fgRolling(arr, w, fn) {
  return arr.map((_, i) => {
    if (i < w - 1) return null;
    const win = arr.slice(i - w + 1, i + 1);
    return win.some(v => v == null) ? null : fn(win);
  });
}
const _fgMean = a => a.reduce((s, v) => s + v, 0) / a.length;

// pandas ewm(span, adjust=False): 첫 유효값에서 시작, 빈 값은 직전 값을 잇는다
function _fgEwm(arr, span) {
  const a = 2 / (span + 1);
  let prev = null;
  return arr.map(v => {
    if (v == null) return prev;
    prev = prev == null ? v : a * v + (1 - a) * prev;
    return prev;
  });
}

// pandas rolling mean RSI (원본 calculate_rsi)
function _fgRsi(close, w = 10) {
  const d = close.map((v, i) => (i && v != null && close[i - 1] != null) ? v - close[i - 1] : null);
  const gain = _fgRolling(d.map(x => x == null ? null : Math.max(x, 0)), w, _fgMean);
  const loss = _fgRolling(d.map(x => x == null ? null : Math.max(-x, 0)), w, _fgMean);
  return gain.map((g, i) => {
    const l = loss[i];
    if (g == null || l == null) return null;
    if (l === 0) return g > 0 ? 100 : null;
    return 100 - 100 / (1 + g / l);
  });
}

// ATM 풋/콜 = 5일 평균 매수 거래량 비율. 빠진 날이 있어도 5일 중 3일 이상이면 평균
function _fgMa5Loose(arr) {
  return arr.map((_, i) => {
    const win = arr.slice(Math.max(0, i - 4), i + 1).filter(v => v != null && v > 0);
    return (i >= 4 && win.length >= 3) ? _fgMean(win) : null;
  });
}

// rows: 오름차순 원자료, col: 'kospi' | 'kosdaq'
// 반환: [{date, price, fg, ema20, osc, comp:{mom,pc,vol,bond,rsi}}] (fg 있는 날만)
function computeFearGreed(rows, col) {
  const rs = rows.filter(r => r[col] != null);
  const price = rs.map(r => +r[col]);
  const ma125 = _fgRolling(price, 125, _fgMean);
  const feat = {
    mom:  price.map((p, i) => ma125[i] == null ? null : (p - ma125[i]) / ma125[i] * 100),
    pc:   (() => {
      const put = _fgMa5Loose(rs.map(r => r.put_vol == null ? null : +r.put_vol));
      const call = _fgMa5Loose(rs.map(r => r.call_vol == null ? null : +r.call_vol));
      return put.map((p, i) => (p == null || !call[i]) ? null : p / call[i]);
    })(),
    vol:  rs.map(r => r.vkospi == null ? null : +r.vkospi),
    bond: rs.map(r => (r.bond10 == null || r.bond5 == null) ? null : r.bond10 - r.bond5),
    rsi:  _fgRsi(price, 10),
  };
  const keys = Object.keys(feat);
  const valid = rs.map((_, i) => keys.every(k => feat[k][i] != null && isFinite(feat[k][i])));

  // MinMax: 유효 행 전체 기준 (원본 MinMaxScaler.fit_transform)
  const scaled = {};
  keys.forEach(k => {
    const vs = feat[k].filter((_, i) => valid[i]);
    const lo = Math.min(...vs), hi = Math.max(...vs);
    scaled[k] = feat[k].map((v, i) => !valid[i] ? null : (hi > lo ? (v - lo) / (hi - lo) : 0));
  });

  // 탐욕 쪽이 1이 되게 — 풋/콜·변동성은 뒤집는다
  const comp = i => ({
    mom:  scaled.mom[i],
    pc:   1 - scaled.pc[i],
    vol:  1 - scaled.vol[i],
    bond: scaled.bond[i],
    rsi:  scaled.rsi[i],
  });
  const idx = rs.map((_, i) => {
    if (!valid[i]) return null;
    const c = comp(i);
    return (c.mom + c.pc + c.vol + c.bond + c.rsi) * 0.2;
  });

  const e12 = _fgEwm(idx, 12), e26 = _fgEwm(idx, 26);
  const macd = idx.map((_, i) => (e12[i] == null || e26[i] == null) ? null : e12[i] - e26[i]);
  const sig = _fgEwm(macd, 9);
  const ema20 = _fgEwm(idx, 20);

  const out = [];
  rs.forEach((r, i) => {
    if (idx[i] == null) return;
    const c = comp(i);
    out.push({
      date:  r.base_date,
      price: price[i],
      fg:    idx[i] * 100,
      ema20: ema20[i] * 100,
      osc:   macd[i] - sig[i],
      comp:  { mom: c.mom * 100, pc: c.pc * 100, vol: c.vol * 100, bond: c.bond * 100, rsi: c.rsi * 100 },
    });
  });
  return out;
}

// ── 원저자 시장 매매 규칙 — 태린이아빠 「외국인기관수급오실레이터(700)」 '일관성' 시트 (10-03) ──
//  시장 매도: 피어앤그리드 오실레이터가 피크치면 기계적 비중 축소 · 인버스는 시장이 크게 망가질 가능성이
//            있을 때만 · 평소에는 현금 30% 확보
//  시장 매수: 피어앤그리드 오실레이터가 과매도 영역 + 코스닥 지수 3일선 오후장 회복
//  판정(원본에 수치가 없어 정함) — 오실레이터를 수급 칸과 같은 방식으로 칸을 매긴다
//   (그날까지 최근 63거래일의 [상위10, 상위25, 평균, 하위25, 하위10] — config.js flowLevels·flowGauge)
//   피크 = 전날이 4칸 이상(상위 25% 위)이면서 꼭대기(그 전날보다 높고 오늘은 내림)
//   과매도 = 0칸(하위 10% 아래)인 날이 최근 5거래일 안
//   3일선 회복 = 코스닥 종가가 3일 이동평균 위로 올라선 날(전날은 아래) — 오후장 대신 종가로 본다
const FG_LV_DAYS = 63, FG_LV_MIN = 20, FG_OVERSOLD_DAYS = 5, FG_HOT_FILL = 4;
const FG_MARK = { peak: '#fb6340', buy: '#2dce89' };

// res: computeFearGreed 결과, rows: 원자료(코스닥 종가) → 날짜마다 {date, osc, gg, kq, peak, oversold, kqUp, buy}
function fgSignals(res, rows) {
  const kq = (rows || []).filter(r => r.kosdaq != null).map(r => ({ d: r.base_date, c: +r.kosdaq }));
  const kqBy = {};
  kq.forEach((r, i) => {
    const ma3 = i >= 2 ? (r.c + kq[i - 1].c + kq[i - 2].c) / 3 : null;
    kqBy[r.d] = { c: r.c, ma3, above: ma3 != null && r.c >= ma3 };
  });
  const out = res.map((r, i) => {
    const hist = res.slice(Math.max(0, i - FG_LV_DAYS + 1), i + 1).map(x => x.osc);
    const lv = i > 0 && hist.length >= FG_LV_MIN ? flowLevels(hist) : null;
    return { date: r.date, osc: r.osc, lv, gg: lv ? flowGauge({ lv, cur: r.osc, prev: res[i - 1].osc }) : null,
             kq: kqBy[r.date] || null };
  });
  out.forEach((s, i) => {
    const p = out[i - 1], pp = out[i - 2];
    s.peak = !!(p?.gg && pp && p.gg.fill >= FG_HOT_FILL && p.osc >= pp.osc && s.osc < p.osc);
    s.oversold = out.slice(Math.max(0, i - FG_OVERSOLD_DAYS + 1), i + 1).some(x => x.gg && x.gg.fill === 0);
    s.kqUp = !!(s.kq?.above && p?.kq && p.kq.ma3 != null && !p.kq.above);
    s.buy = s.oversold && s.kqUp;
  });
  return out;
}

function _fgRulesHTML(sig) {
  const last = sig[sig.length - 1];
  if (!last?.gg) return '';
  const fs = 'font-size:calc(11px*var(--m-label))';
  // 매도 — 오늘 피크이거나, 최근 피크 뒤로 계속 내리는 중
  let pk = -1;
  for (let i = sig.length - 1; i > 0; i--) {
    if (sig[i].peak) { pk = i; break; }
    if (sig[i].osc >= sig[i - 1].osc) break;   // 한 번이라도 올랐으면 피크 뒤 하락 구간이 끝남
  }
  const sellOn = pk >= 0;
  const sellTxt = !sellOn ? `아님 — 오실레이터 ${last.gg.up ? '오르는 중' : '내리는 중'}`
    : pk === sig.length - 1 ? '해당 — 오늘 피크에서 꺾임'
    : `해당 — ${sig[pk - 1].date.slice(5).replace('-', '/')} 피크 뒤 ${sig.length - pk}일째 하락`;
  const k = last.kq;
  const kqTxt = !k?.ma3 ? '코스닥 3일선 —'
    : `코스닥 ${k.c.toLocaleString(undefined, { maximumFractionDigits: 2 })} · 3일선 ${k.ma3.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
      + ` ${last.kqUp ? '위로 회복' : k.above ? '위' : '아래'}`;
  const mark = (ok, t) => `<span style="color:${ok ? 'var(--text1)' : 'var(--text3)'}">${ok ? '●' : '○'} ${t}</span>`;
  const row = (name, on, txt, color) => `
    <div style="display:flex;align-items:baseline;gap:8px;${fs};padding:2px 0">
      <span style="color:var(--text2);flex-shrink:0;width:88px">${name}</span>
      <span style="color:${on ? color : 'var(--text2)'};font-weight:${on ? 700 : 400};min-width:0">${txt}</span>
    </div>`;
  return `<div style="padding:.5rem 1rem .55rem;border-bottom:1px solid var(--border)">
    <div style="display:flex;align-items:center;gap:6px;${fs};color:var(--text2);margin-bottom:3px"
      title="${escAttr(`오실레이터 칸 — 최근 ${FG_LV_DAYS}거래일 분포: `
        + FLOW_LEVEL_NAMES.map((n, i) => `${n} ${_fgSigned(last.lv[i])}${last.osc >= last.lv[i] ? '■' : '□'}`).join(' · ')
        + ` | 오늘 ${_fgSigned(last.osc)}`)}">
      <b style="color:var(--text1)">원저자 시장 규칙</b>
      <span style="margin-left:auto;white-space:nowrap">오실레이터 칸 ${flowGaugeBar(last.gg)} ${last.gg.fill}/5</span>
    </div>
    ${row('매도 조건', sellOn, sellTxt, FG_MARK.peak)}
    <div style="${fs};color:var(--text3);padding:0 0 2px 96px">피크치면 비중 축소 · 평소 현금 30% · 인버스는 시장이 크게 망가질 가능성이 있을 때만</div>
    ${row('매수 조건', last.buy, last.buy ? '해당 — 과매도 영역 + 코스닥 3일선 회복' : '아님', FG_MARK.buy)}
    <div style="${fs};padding:0 0 0 96px;display:flex;flex-wrap:wrap;gap:2px 10px">
      ${mark(last.oversold, '과매도 영역(최근 5일 안 0칸)')}${mark(last.kqUp, kqTxt)}
    </div>
  </div>`;
}

// ── 로드·렌더 ──────────────────────────────────────────────────────────

async function loadFearGreed() {
  if (!document.getElementById('fg-chart')) return;
  try {
    const { data, error } = await sb.from('fear_greed_daily')
      .select('base_date,kospi,kosdaq,vkospi,bond10,bond5,call_vol,put_vol')
      .order('base_date', { ascending: false })
      .limit(600);
    if (error) throw error;
    const all = (data || []).reverse();
    const last = all.length ? all[all.length - 1].base_date : null;
    const from = last ? new Date(new Date(last).getTime() - FG_WINDOW_DAYS * 86400e3).toISOString().slice(0, 10) : null;
    FG.rows = last ? all.filter(r => r.base_date > from) : [];
    FG.result = { kospi: computeFearGreed(FG.rows, 'kospi'), kosdaq: computeFearGreed(FG.rows, 'kosdaq') };
    FG.missing = false;
  } catch (e) {
    // 42P01/PGRST205 = 테이블 없음 (sql/fear_greed.sql 실행 전)
    FG.missing = /42P01|PGRST205|does not exist|Could not find/.test(`${e?.code} ${e?.message}`);
    if (!FG.missing) console.warn('[피어앤그리드] 로드 실패', e);
    FG.rows = [];
    FG.result = { kospi: [], kosdaq: [] };
  }
  renderFearGreed();
}

function setFgMarket(m) {
  FG.market = m;
  document.querySelectorAll('[data-fg-market]').forEach(b =>
    b.classList.toggle('active', b.dataset.fgMarket === m));
  renderFearGreed();
}

function _fgSigned(v, d = 4) {
  return v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(d);
}

function renderFearGreed() {
  const canvas  = document.getElementById('fg-chart');
  const oscCv   = document.getElementById('fg-osc-chart');
  const empty   = document.getElementById('fg-empty');
  const summary = document.getElementById('fg-summary');
  const compEl  = document.getElementById('fg-comp');
  const rulesEl = document.getElementById('fg-rules');
  if (!canvas) return;

  const res = (FG.result || {})[FG.market] || [];
  if (res.length < 2) {
    document.getElementById('fg-charts').style.display = 'none';
    if (empty) {
      empty.style.display = 'block';
      empty.textContent = FG.missing ? '준비 중 — 데이터 표를 만드는 중입니다.'
        : '데이터 수집 중... (평일 18:22 업데이트)';
    }
    if (summary) summary.innerHTML = '';
    if (compEl) compEl.innerHTML = '';
    if (rulesEl) rulesEl.innerHTML = '';
    setAsOf('fg-date', null);
    return;
  }
  document.getElementById('fg-charts').style.display = '';
  if (empty) empty.style.display = 'none';

  const last = res[res.length - 1], prev = res[res.length - 2];
  setAsOf('fg-date', last.date);
  const zone = fgZone(last.fg);
  const d1 = last.fg - prev.fg;
  const aboveEma = last.fg >= last.ema20;
  const oscTurn = prev.osc <= 0 && last.osc > 0 ? '0선 위로 올라섬'
    : prev.osc >= 0 && last.osc < 0 ? '0선 아래로 내려섬'
    : last.osc > prev.osc ? '오르는 중' : '내리는 중';
  const mktName = FG.market === 'kospi' ? '코스피' : '코스닥';

  // ── 요약: 지수 · EMA20 · 오실레이터 ──
  if (summary) {
    const cell = (label, main, sub, color = 'var(--text)') => `
      <div style="padding:8px 12px">
        <div style="font-size:calc(11px*var(--m-label));color:var(--text2)">${label}</div>
        <div style="font-size:calc(15px*var(--m-title));font-weight:700;font-variant-numeric:tabular-nums;color:${color}">${main}</div>
        <div style="font-size:calc(11px*var(--m-label));color:var(--text2);margin-top:2px">${sub}</div>
      </div>`;
    summary.innerHTML =
      cell(`${mktName} 지수`, `${last.fg.toFixed(1)} <span style="font-size:calc(12px*var(--m-sub))">${zone.label}</span>`,
        `전일 ${d1 > 0 ? '+' : ''}${d1.toFixed(1)}`, zone.color)
      + cell('EMA20', last.ema20.toFixed(1),
        `지수가 EMA20 ${aboveEma ? '위' : '아래'}`)
      + cell('오실레이터', _fgSigned(last.osc), oscTurn,
        last.osc > 0 ? 'var(--up)' : last.osc < 0 ? 'var(--down)' : 'var(--text)');
  }

  // ── 원저자 시장 규칙 (피크 → 비중 축소 / 과매도 + 코스닥 3일선 회복 → 매수 조건) ──
  const sig = fgSignals(res, FG.rows);
  if (rulesEl) rulesEl.innerHTML = _fgRulesHTML(sig);

  // ── 구성 요소: 탐욕 쪽 점수(0~100) — 무엇이 지수를 끌어올리고 내리나 ──
  if (compEl) {
    const items = [
      { k: 'mom',  name: '125일 모멘텀' },
      { k: 'pc',   name: '풋/콜 (낮을수록 탐욕)' },
      { k: 'vol',  name: 'VKOSPI (낮을수록 탐욕)' },
      { k: 'bond', name: '10년−5년 국채선물' },
      { k: 'rsi',  name: 'RSI 10일' },
    ];
    compEl.innerHTML = items.map(({ k, name }) => {
      const v = last.comp[k];
      const color = v >= 50 ? 'var(--up)' : 'var(--down)';
      return `
      <div style="display:grid;grid-template-columns:minmax(0,1fr) 90px 34px;align-items:center;gap:8px;padding:3px 0">
        <span style="font-size:calc(11px*var(--m-label));color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</span>
        <span style="height:6px;background:var(--bg2);border-radius:3px;overflow:hidden">
          <span style="display:block;height:100%;width:${Math.max(0, Math.min(100, v)).toFixed(0)}%;background:${color}"></span>
        </span>
        <span style="font-size:calc(11px*var(--m-label));text-align:right;font-variant-numeric:tabular-nums;color:var(--text1)">${v.toFixed(0)}</span>
      </div>`;
    }).join('');
  }

  // ── 차트 ① 지수·EMA20(좌 0~100) + 시장 지수(우) ──
  const t = chartTheme();
  const labels = res.map(r => r.date);
  const guide = lv => ({
    label: `_${lv}`, data: labels.map(() => lv), yAxisID: 'y',
    borderColor: 'rgba(168,173,196,.35)', borderDash: [4, 4], borderWidth: 1,
    pointRadius: 0, pointHoverRadius: 0, fill: false,
  });
  const line = (label, data, color, axis, width = 2) => ({
    label, data, yAxisID: axis, borderColor: color, backgroundColor: color + '15',
    borderWidth: width, pointRadius: 0, pointHoverRadius: 4, tension: 0.2, fill: false, spanGaps: true,
  });
  if (FG.chart) { FG.chart.destroy(); FG.chart = null; }
  FG.chart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        line('피어앤그리드', res.map(r => r.fg), FG_COLORS.fg, 'y', 2.2),
        line('EMA20', res.map(r => r.ema20), FG_COLORS.ema, 'y', 1.8),
        line(mktName, res.map(r => r.price), FG_COLORS.price, 'y1', 1.4),
        guide(20), guide(50), guide(80),
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          filter: it => !it.dataset.label.startsWith('_'),
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${ctx.dataset.yAxisID === 'y1'
              ? ctx.parsed.y.toLocaleString(undefined, { maximumFractionDigits: 2 })
              : ctx.parsed.y.toFixed(1)}`,
          },
        },
      },
      scales: {
        x:  { ticks: { color: t.tick, maxTicksLimit: 6, maxRotation: 0, font: { size: 10 } }, grid: { color: t.grid } },
        y:  { position: 'left', min: 0, max: 100, ticks: { color: FG_COLORS.fg, stepSize: 20, font: { size: 10 } }, grid: { color: t.grid }, ..._fgFixW(FG_AXIS_L) },
        y1: { position: 'right', ticks: { color: t.tick, maxTicksLimit: 5, font: { size: 10 } }, grid: { drawOnChartArea: false }, ..._fgFixW(FG_AXIS_R) },
      },
    },
  });

  // ── 차트 ② 오실레이터 (0선 위=빨강 / 아래=파랑, 한국식 색) ──
  if (FG.oscChart) { FG.oscChart.destroy(); FG.oscChart = null; }
  if (oscCv) {
    const upC = getComputedStyle(document.documentElement).getPropertyValue('--up').trim() || '#f5365c';
    const dnC = getComputedStyle(document.documentElement).getPropertyValue('--down').trim() || '#4a9eff';
    FG.oscChart = new Chart(oscCv.getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: '오실레이터',
          data: res.map(r => r.osc),
          backgroundColor: res.map(r => r.osc >= 0 ? upC : dnC),
          borderWidth: 0,
          barPercentage: 1,
          categoryPercentage: 0.9,
          order: 2,
        },
        // 원저자 규칙 표시 — ▼ 피크(전날 꼭대기, 비중 축소) · ▲ 매수 조건(과매도 + 코스닥 3일선 회복)
        ...[['피크', 'peak', 180], ['매수 조건', 'buy', 0]].map(([label, k, rot]) => ({
          type: 'line', label, order: 1, showLine: false,
          // 피크는 꼭대기 막대에(판정은 다음 날 내려온 걸 보고 나온다)
          data: sig.map((s, i) => (k === 'peak' ? sig[i + 1]?.peak : s.buy) ? s.osc : null),
          pointStyle: 'triangle', rotation: rot, pointRadius: 4, pointHoverRadius: 5,
          pointBackgroundColor: FG_MARK[k], pointBorderColor: FG_MARK[k],
        }))],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { right: FG_AXIS_R } },
        plugins: {
          legend: { display: false },
          tooltip: { filter: it => it.parsed.y != null,
                     callbacks: { label: ctx => ctx.dataset.type === 'line' ? `▶ ${ctx.dataset.label}`
                                                 : `오실레이터: ${_fgSigned(ctx.parsed.y)}` } },
        },
        scales: {
          x: { display: false, offset: false },   // 선 차트와 같은 위치에 막대
          y: { position: 'left', ticks: { color: t.tick, maxTicksLimit: 3, font: { size: 10 },
                 callback: v => v.toFixed(3) }, grid: { color: t.grid }, ..._fgFixW(FG_AXIS_L) },
        },
      },
    });
  }
}
