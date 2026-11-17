// us-52w.js — STRATEGY '미국 52주 전략' 페이지 (11-17)
// [원본] 태린이아빠 Market Dashboard '미국 52주 신고가 전략 점검'(공개 소스 app.py ROT_SRC · run_rotation · render_rotation_simple)
//   미국 업종 ETF 57개에서 6개월 SPY 대비 RS 상위 20 ∩ 52주 신고가 돌파를 최대 4종목 × 25% 사고, 20일선 아래로 내려가면 판다(52W FIXED).
//   이 순수 전략이 최근 20거래일 SPY와 QQQ 둘 다에 1%p 넘게 뒤지면 '안통함'(WEAK_ROTATION) — 그동안 빈 자리는
//   5일 RS · 20일 순위 개선 · 20일 고점 돌파 후보(Rotation_B)로 채운다. 기존 보유는 국면이 바뀌어도 20일선 이탈 때만 판다.
// [원본과 다른 점] 원본 화면은 상태 · 현재 포트 · 오늘 매매 · 성과표 · 자산 곡선만 보인다. 여기서는 원본 Colab이 출력하는
//   연도별 수익 · 국면 일수 · 최근 거래와 판정 근거(오늘 RS 상위 20의 돌파 여부, 보유 종목의 20일선 거리, 약세 후보),
//   국면을 가른 20일 초과수익 추이도 보여 준다. 계산은 백엔드 collect_us_52w.py — 원본 대조(11-16 종가) 전 항목 일치.
// 데이터: market_snapshot(kind = 'us_52w', payload) — 매일 07:30 · 08:40
// 의존: config.js (sb, escapeHtml, escAttr, chartTheme, SERIES_PAL), Chart.js

const U52 = {
  p: null,
  range: 0,        // 그림 범위(거래일): 126 | 252 | 0(전체)
  charts: [],
};

const U52_ORIGIN = { '52W': ['52주 신고가', 'u5-o-52'], ROTATION_B: ['약세 교체', 'u5-o-rot'] };
const U52_REASON = { ma: '20일선 이탈', rs52: 'RS 상위 20 · 52주 돌파', rot: '20일 돌파 · 5일 RS · 순위 10계단↑' };
const U52_REGIME = {
  NORMAL_52W:    ['통함', '빈 자리는 52주 신고가 후보(RS 상위 20 중 52주 고점 돌파)로 채웁니다.'],
  WEAK_ROTATION: ['안통함', '빈 자리는 약세 교체 후보(5일 RS 강함 · 20일 순위 10계단 개선 · 20일 고점 돌파)로 채웁니다.'],
};
const U52_SERIES = [['final', '최종 전략 (52W + 약세 교체)', 1], ['base', '순수 52W', 0], ['spy', 'SPY 보유', 9]];

function pUs52w() {
  return `
  <div class="u5-head">
    <div class="u5-lede">미국 업종 ETF 가운데 <b>SPY보다 강하면서 52주 신고가를 뚫은 것</b>을 최대 4개 들고, 20일선이 깨지면 파는 규칙입니다.
      이 규칙이 요즘 시장에서 <b>통하는지</b>, 지금 무엇을 들고 있는지, 과거에 어땠는지를 봅니다.</div>
    <div id="u5-asof" class="u5-asof"></div>
  </div>
  <div id="u5-body"><div class="u5-msg">불러오는 중...</div></div>`;
}

async function loadUs52w() {
  const body = document.getElementById('u5-body');
  if (!body) return;
  try {
    const { data, error } = await sb.from('market_snapshot').select('base_date,payload')
      .eq('kind', 'us_52w').order('base_date', { ascending: false }).limit(1);
    if (error) throw error;
    if (!document.getElementById('u5-body')) return;
    U52.p = data?.[0]?.payload || null;
    if (!U52.p) { body.innerHTML = '<div class="u5-msg">아직 계산된 날이 없습니다 — 매일 아침 7시 30분에 채워집니다.</div>'; return; }
    u5Render();
  } catch (e) {
    const missing = /42P01|PGRST205|does not exist|Could not find/.test(`${e?.code} ${e?.message}`);
    if (!missing) console.warn('[미국 52주 전략]', e);
    body.innerHTML = `<div class="u5-msg">${missing ? '준비 중 — 데이터 테이블이 아직 없습니다.'
      : '불러오지 못했습니다 — ' + escapeHtml(e.message || '조회 실패')}</div>`;
  }
}

function unloadUs52w() {
  U52.charts.forEach(c => c.destroy());
  U52.charts = [];
}

const _u5Num = (v, d = 2) => v == null ? '—' : (+v).toFixed(d);
const _u5Signed = (v, d = 2, unit = '') => v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d) + unit;
const _u5Color = v => v == null ? 'var(--text2)' : v > 0 ? 'var(--up)' : v < 0 ? 'var(--down)' : 'var(--text1)';
const _u5MD = d => d ? `${+d.slice(5, 7)}/${+d.slice(8, 10)}` : '—';
const _u5Name = t => U52.p?.names?.[t] || '';
const _u5Etf = t => `<b>${escapeHtml(t)}</b><small>${escapeHtml(_u5Name(t))}</small>`;
const _u5Origin = o => { const [n, c] = U52_ORIGIN[o] || [o || '—', '']; return `<span class="u5-tag ${c}">${escapeHtml(n)}</span>`; };

// 0을 가운데 둔 막대 — 기준선(−1%)과 함께. max = 막대 양끝 값
function _u5ExBar(v, th, max) {
  const pos = x => (50 + Math.max(-1, Math.min(1, x / max)) * 50).toFixed(2);
  if (v == null) return '<span class="u5-exbar"></span>';
  const a = pos(Math.min(v, 0)), b = pos(Math.max(v, 0));
  return `<span class="u5-exbar"><i style="left:${a}%;width:${(b - a).toFixed(2)}%;background:${_u5Color(v)}"></i><u style="left:${pos(th)}%" title="기준 ${th}%"></u><s style="left:50%"></s></span>`;
}

function u5Render() {
  const p = U52.p, body = document.getElementById('u5-body');
  if (!body || !p) return;
  unloadUs52w();
  const asof = document.getElementById('u5-asof');
  if (asof) asof.innerHTML = `<b>${escapeHtml(p.asof)} 미국 종가 기준</b> · ETF ${p.n} / ${p.total}${Object.keys(p.quarantined || {}).length ? ` · 가격 오류로 제외 ${Object.keys(p.quarantined).map(escapeHtml).join(', ')}` : ''}`;

  const [stName, stDesc] = U52_REGIME[p.regime] || ['판정 대기', '최근 20거래일 자료가 모자라 판정하지 않았습니다.'];
  const stCls = p.status === '통함' ? 'up' : p.status === '안통함' ? 'down' : '';
  const exMax = Math.max(3, Math.abs(p.ex_spy ?? 0), Math.abs(p.ex_qqq ?? 0)) * 1.15;
  const near = Math.min(p.ex_spy ?? 99, p.ex_qqq ?? 99) - (p.threshold ?? -1);   // 약세 판정까지 남은 여유(%p)
  const pf = p.perf || {};
  const fin = pf.final || {}, spy = pf.spy || {};

  body.innerHTML = `
    <div class="u5-top">
      <div class="card u5-state">
        <div class="u5-k">지금 이 전략</div>
        <div class="u5-status ${stCls}">${escapeHtml(p.status)}</div>
        <div class="u5-sub">${p.regime === 'WEAK_ROTATION' ? '약세 국면' : '정상 국면'} — ${escapeHtml(stDesc)}</div>
        <div class="u5-ex">
          <div class="u5-ex-h">순수 52W 전략의 최근 20거래일 초과수익 <span>둘 다 ${p.threshold}% 이하이면 '안통함'</span></div>
          ${[['SPY 대비', p.ex_spy], ['QQQ 대비', p.ex_qqq]].map(([n, v]) => `
            <div class="u5-ex-row"><span>${n}</span>${_u5ExBar(v, p.threshold, exMax)}<b style="color:${_u5Color(v)}">${_u5Signed(v, 2, '%p')}</b></div>`).join('')}
          <div class="u5-ex-f">${near >= 0 ? `더 약한 쪽이 기준선보다 <b>${_u5Num(near, 2)}%p</b> 위 — 이만큼 더 뒤지면 '안통함'으로 바뀝니다.` : '두 기준 모두 기준선 아래 — 약세 교체 후보로 빈 자리를 채웁니다.'}</div>
        </div>
      </div>
      <div class="card u5-port">
        <div class="card-header" style="flex-wrap:wrap;gap:6px">
          <span class="card-title">현재 포트</span><span class="card-sub">최대 4종목 · 종목당 25%</span>
          <span class="u5-cash">투자 <b>${_u5Num(p.invested, 1)}%</b> · 현금 <b>${_u5Num(p.cash, 1)}%</b></span>
        </div>
        ${p.portfolio?.length ? `<table class="u5-tbl">
          <thead><tr><th>ETF</th><th>들어온 이유</th><th>비중</th><th title="종가가 20일선보다 몇 % 위 — 0 아래로 내려가면 판다">20일선 위</th><th title="6개월 SPY 대비 RS 순위">RS 순위</th></tr></thead>
          <tbody>${p.portfolio.map(x => `<tr>
            <td class="u5-name">${_u5Etf(x.t)}</td><td>${_u5Origin(x.o)}</td>
            <td class="u5-n"><b>${_u5Num(x.w, 1)}%</b></td>
            <td class="u5-n" style="color:${_u5Color(x.ma_gap)}">${_u5Signed(x.ma_gap, 2, '%')}</td>
            <td class="u5-n">${x.rs_rank ?? '—'}위</td></tr>`).join('')}</tbody></table>`
          : '<div class="u5-msg">보유 종목이 없습니다 — 현금 100%.</div>'}
        <div class="u5-acts"><span>오늘 매매</span>${p.actions?.length ? p.actions.map(a => `<b class="u5-act ${a.a === 'BUY' ? 'buy' : 'sell'}">${a.a === 'BUY' ? '매수' : '매도'} ${escapeHtml(a.t)}</b>`).join('') : '<em>없음</em>'}</div>
      </div>
    </div>

    <div class="card u5-perf-card">
      <div class="card-header" style="flex-wrap:wrap;gap:6px">
        <span class="card-title">백테스트</span>
        <span class="card-sub">${_u5MD(p.start)} 시작(두 전략이 처음 거래한 날 중 늦은 날) · 1달러가 얼마가 됐나 · 파란 띠 = 약세 국면</span>
        <div class="u5-range">${[[126, '6개월'], [252, '1년'], [0, '전체']].map(([n, name]) => `<button class="chip chip-sm${U52.range === n ? ' active' : ''}" data-u5-range="${n}">${name}</button>`).join('')}</div>
      </div>
      <div class="u5-chart u5-chart-lg"><canvas id="u5-c-eq" role="img" aria-label="최종 전략·순수 52W·SPY 자산 곡선"></canvas></div>
      <div class="u5-legend">${U52_SERIES.map(([k, n, ci]) => `<span><i style="background:${k === 'spy' ? 'var(--text2)' : SERIES_PAL[ci]}"></i>${n}</span>`).join('')}<span><i class="u5-band"></i>약세 국면</span></div>
      <div class="u5-chart"><canvas id="u5-c-ex" role="img" aria-label="순수 52W의 20일 초과수익(SPY·QQQ 대비)"></canvas></div>
      <div class="u5-legend"><span><i style="background:${SERIES_PAL[0]}"></i>SPY 대비 20일 초과수익</span><span><i style="background:${SERIES_PAL[4]}"></i>QQQ 대비</span><span><i style="height:0;border-top:1px dashed var(--warn)"></i>기준 ${p.threshold}%</span></div>
      <div class="u5-perf">
        <table class="u5-tbl">
          <thead><tr><th>전략</th><th>연수익(CAGR)</th><th>최대 낙폭</th><th>Sharpe</th><th>Sortino</th><th>Calmar</th><th>배수</th></tr></thead>
          <tbody>${U52_SERIES.map(([k, n]) => { const s = pf[k] || {}; return `<tr class="${k === 'final' ? 'u5-hl' : ''}">
            <td class="u5-name"><b>${n}</b></td><td class="u5-n" style="color:${_u5Color(s.cagr)}">${_u5Signed(s.cagr, 2, '%')}</td>
            <td class="u5-n" style="color:var(--down)">${_u5Num(s.mdd, 2)}%</td><td class="u5-n">${_u5Num(s.sharpe)}</td><td class="u5-n">${_u5Num(s.sortino)}</td>
            <td class="u5-n">${_u5Num(s.calmar)}</td><td class="u5-n"><b>${_u5Num(s.mult, 2)}x</b></td></tr>`; }).join('')}</tbody>
        </table>
        <div class="u5-side">
          <table class="u5-tbl">
            <thead><tr><th>연도</th>${U52_SERIES.map(([, n]) => `<th>${n.replace(' (52W + 약세 교체)', '')}</th>`).join('')}</tr></thead>
            <tbody>${(p.yearly?.years || []).map((y, i) => `<tr><td>${y}${i === 0 ? '<small> (일부)</small>' : i === p.yearly.years.length - 1 ? '<small> (연중)</small>' : ''}</td>${U52_SERIES.map(([k]) => `<td class="u5-n" style="color:${_u5Color(p.yearly[k][i])}">${_u5Signed(p.yearly[k][i], 1, '%')}</td>`).join('')}</tr>`).join('')}</tbody>
          </table>
          ${(() => { const r = p.regime_days || {}, tot = (r.NORMAL_52W || 0) + (r.WEAK_ROTATION || 0) || 1; return `<div class="u5-share">
            <div class="u5-share-bar"><i class="n" style="flex:${r.NORMAL_52W || 0}"></i><i class="w" style="flex:${r.WEAK_ROTATION || 0}"></i></div>
            <span>정상 <b>${r.NORMAL_52W || 0}일</b> (${Math.round((r.NORMAL_52W || 0) / tot * 100)}%)</span><span>약세 <b>${r.WEAK_ROTATION || 0}일</b> (${Math.round((r.WEAK_ROTATION || 0) / tot * 100)}%)</span></div>`; })()}
          <div class="u5-note">최종 전략이 SPY보다 ${(fin.cagr ?? 0) >= (spy.cagr ?? 0) ? '연수익이 높고' : '연수익이 낮고'} 최대 낙폭은 ${(fin.mdd ?? 0) >= (spy.mdd ?? 0) ? '얕았습니다' : '깊었습니다'}.
            표본 안의 결과이며 거래비용 0.1%를 뺐습니다.</div>
        </div>
      </div>
    </div>

    <div class="u5-grid">
      <div class="card">
        <div class="card-header" style="flex-wrap:wrap;gap:6px">
          <span class="card-title">오늘 판정 근거</span><span class="card-sub">6개월 SPY 대비 RS 상위 20 — 이 가운데 52주 고점을 뚫은 것만 정상 국면 매수 후보</span>
        </div>
        <div class="u5-scroll"><table class="u5-tbl">
          <thead><tr><th>순위</th><th>ETF</th><th title="(ETF÷SPY)가 126거래일 전보다 몇 % 올랐나">RS 6개월</th><th title="종가 ÷ 직전 252거래일 최고 − 1">52주 고점 대비</th><th>돌파</th><th></th></tr></thead>
          <tbody>${(p.rs_top || []).map(x => `<tr class="${x.held ? 'u5-held' : ''}">
            <td class="u5-n u5-rk">${x.rank}</td><td class="u5-name">${_u5Etf(x.t)}${x.g ? `<em title="같은 묶음은 하나만 보유">${escapeHtml(x.g === 'Mining' ? '광산 묶음' : x.g === 'Clean_Energy' ? '클린에너지 묶음' : x.g)}</em>` : ''}</td>
            <td class="u5-n" style="color:${_u5Color(x.rs)}">${_u5Signed(x.rs, 1, '%')}</td>
            <td class="u5-n" style="color:${_u5Color(x.to_high)}">${_u5Signed(x.to_high, 2, '%')}</td>
            <td class="u5-n u5-dot" style="color:${x.brk ? 'var(--up)' : 'var(--text3)'}">${x.brk ? '●' : '○'}</td>
            <td>${x.held ? '<span class="u5-tag u5-o-held">보유</span>' : ''}</td></tr>`).join('')}</tbody>
        </table></div>
        ${(() => {   // 52주 돌파했지만 들고 있지 않은 것 — 왜 오늘 안 샀는지
          const free = (p.rs_top || []).filter(x => x.brk && !x.held).map(x => x.t);
          if (!free.length) return '';
          const bought = new Set((p.actions || []).filter(a => a.a === 'BUY').map(a => a.t));
          const left = free.filter(t => !bought.has(t));
          if (!left.length) return '';
          const why = p.regime === 'WEAK_ROTATION' ? '지금은 약세 국면이라 52주 돌파 후보를 쓰지 않습니다.'
            : (p.portfolio || []).length >= 4 ? '4자리가 모두 차 있어 오늘은 사지 않습니다(자리가 비면 RS 순서로 채움).'
            : '같은 묶음을 이미 들고 있거나 남은 현금이 없어 빠졌습니다.';
          return `<div class="u5-why-line">돌파했지만 들고 있지 않은 ETF <b>${left.map(escapeHtml).join(', ')}</b> — ${why}</div>`;
        })()}
        <div class="u5-cands">
          <span>약세 교체 후보${p.regime === 'WEAK_ROTATION' ? '' : ' <small>(지금은 정상 국면이라 쓰지 않음)</small>'}</span>
          ${p.rot_cands?.length ? p.rot_cands.map(c => `<b title="${escAttr(`20일 순위 ${c.rank20}위 · 10일 동안 ${c.imp}계단 개선 · 5일 SPY 대비 ${_u5Signed(c.rs5, 2, '%p')}`)}">${escapeHtml(c.t)} <i>▲${c.imp}</i></b>`).join('') : '<em>오늘 조건을 모두 맞춘 ETF 없음</em>'}
        </div>
      </div>
      <div class="card">
        <div class="card-header" style="flex-wrap:wrap;gap:6px"><span class="card-title">최근 거래</span><span class="card-sub">최종 전략 · 최신 순 ${p.trades?.length || 0}건</span></div>
        <div class="u5-scroll"><table class="u5-tbl">
          <thead><tr><th>체결일</th><th>ETF</th><th>매매</th><th>이유</th><th>비중</th></tr></thead>
          <tbody>${[...(p.trades || [])].reverse().map(t => `<tr>
            <td class="u5-n u5-rk">${_u5MD(t.ed)}${t.sd === t.ed ? '<small title="최신일 신호 — 자산 곡선에는 아직 반영 안 됨">신호</small>' : ''}</td>
            <td class="u5-name"><b>${escapeHtml(t.t)}</b></td>
            <td><b class="u5-act ${t.a === 'BUY' ? 'buy' : 'sell'}">${t.a === 'BUY' ? '매수' : '매도'}</b></td>
            <td class="u5-why">${t.a === 'BUY' ? _u5Origin(t.o) : ''} ${escapeHtml(U52_REASON[t.r] || '')}</td>
            <td class="u5-n">${_u5Num(Math.abs(t.w ?? 0), 1)}%</td></tr>`).join('')}</tbody>
        </table></div>
      </div>
    </div>

    <div class="u5-foot">
      <b>규칙</b> — RS = (ETF ÷ SPY)가 126거래일 전보다 몇 % 올랐나. 52주 돌파 = 종가가 직전 252거래일 종가 최고보다 높음. 매도 = 종가가 20일선 아래.
      전일 종가로 신호를 보고 그 종가에 체결한다고 가정하며, 수익은 다음 거래일부터 셉니다. 비어 있는 자리만 새로 채우고(최대 4개, 종목당 25%·남은 현금까지), 같은 묶음(광산·클린에너지)은 하나만 듭니다.<br>
      <b>국면</b> — 순수 52W 전략의 20거래일 수익이 SPY와 QQQ 둘 다보다 1%p 넘게 뒤지면 '안통함'. 이때 빈 자리는 약세 교체 후보로 채우고, 이미 든 종목은 국면과 상관없이 20일선 이탈 때만 팝니다.
      야후 수정 종가 3년, 거래비용 0.1%. 태린이아빠 '미국 52주 신고가 전략 점검'과 같은 계산입니다.
    </div>`;

  body.querySelectorAll('[data-u5-range]').forEach(b => b.addEventListener('click', () => {
    U52.range = +b.dataset.u5Range;
    body.querySelectorAll('[data-u5-range]').forEach(x => x.classList.toggle('active', x === b));
    u5DrawCharts();
  }));
  u5DrawCharts();
}

function u5DrawCharts() {
  const p = U52.p, c = p?.curve;
  unloadUs52w();
  if (!c?.dates?.length) return;
  const n = c.dates.length, from = U52.range ? Math.max(0, n - U52.range) : 0;
  const cut = a => (a || []).slice(from);
  const labels = cut(c.dates), weak = cut(c.weak);
  const t = chartTheme(), css = getComputedStyle(document.documentElement);
  const rgba = (hex, a) => { const h = (hex || '#4a9eff').replace('#', ''); const v = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
    return `rgba(${parseInt(v.slice(0, 2), 16)},${parseInt(v.slice(2, 4), 16)},${parseInt(v.slice(4, 6), 16)},${a})`; };
  const bandColor = rgba(css.getPropertyValue('--down').trim(), 0.12);
  // 약세 국면 날을 세로 띠로 — 연속 구간마다 한 번 칠한다
  const weakBands = {
    id: 'u5weak',
    beforeDatasetsDraw(chart) {
      const { ctx, chartArea: a, scales: { x } } = chart;
      if (!a) return;
      const half = labels.length > 1 ? (x.getPixelForValue(1) - x.getPixelForValue(0)) / 2 : 0;
      ctx.save();
      ctx.fillStyle = bandColor;
      for (let i = 0; i < weak.length; i++) {
        if (!weak[i]) continue;
        let j = i;
        while (j + 1 < weak.length && weak[j + 1]) j++;
        const x0 = Math.max(a.left, x.getPixelForValue(i) - half), x1 = Math.min(a.right, x.getPixelForValue(j) + half);
        ctx.fillRect(x0, a.top, x1 - x0, a.bottom - a.top);
        i = j;
      }
      ctx.restore();
    },
  };
  const xAxis = { ticks: { color: t.tick, font: { size: 10 }, maxTicksLimit: 8, maxRotation: 0,
    callback: function (v) { const d = this.getLabelForValue(v); return U52.range && U52.range <= 252 ? _u5MD(d) : d.slice(2, 7).replace('-', '.'); } }, grid: { color: t.grid } };
  const line = (label, data, color, w = 1.8, extra = {}) => ({ label, data, borderColor: color, backgroundColor: color, borderWidth: w,
    pointRadius: 0, pointHoverRadius: 4, tension: 0.1, spanGaps: true, fill: false, ...extra });
  const base = { responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false } };

  // ① 자산 곡선 — 비교 시작 전날 = 1. 범위를 줄이면 그 첫날을 1로 다시 맞춘다
  const rebase = a => { const s = cut(a), b = s.find(v => v != null) || 1; return s.map(v => v == null ? null : v / b); };
  const eq = document.getElementById('u5-c-eq');
  if (eq) U52.charts.push(new Chart(eq.getContext('2d'), {
    type: 'line',
    data: { labels, datasets: U52_SERIES.map(([k, name, ci]) => line(name, from ? rebase(c[k]) : cut(c[k]),
      k === 'spy' ? (css.getPropertyValue('--text2').trim() || '#b3b8cd') : SERIES_PAL[ci], k === 'final' ? 2.4 : 1.6)) },
    options: { ...base,
      plugins: { legend: { display: false }, tooltip: { callbacks: {
        afterTitle: items => weak[items[0]?.dataIndex] ? '약세 국면' : '정상 국면',
        label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(3)} (${_u5Signed((ctx.parsed.y - 1) * 100, 1, '%')})` } } },
      scales: { x: xAxis, y: { ticks: { color: t.tick, font: { size: 10 }, maxTicksLimit: 6, callback: v => (+v).toFixed(2) }, grid: { color: t.grid } } } },
    plugins: [weakBands],
  }));

  // ② 국면을 가른 값 — 순수 52W의 20일 초과수익(그날 국면을 정한 전일 값)
  const ex = document.getElementById('u5-c-ex');
  const th = p.threshold ?? -1;
  if (ex) U52.charts.push(new Chart(ex.getContext('2d'), {
    type: 'line',
    data: { labels, datasets: [
      line('SPY 대비', cut(c.ex_spy), SERIES_PAL[0], 1.5),
      line('QQQ 대비', cut(c.ex_qqq), SERIES_PAL[4], 1.5),
      line('_기준', labels.map(() => th), css.getPropertyValue('--warn').trim() || '#f0a500', 1, { borderDash: [5, 4], pointHoverRadius: 0 }),
    ] },
    options: { ...base,
      plugins: { legend: { display: false }, tooltip: { filter: it => !it.dataset.label.startsWith('_'),
        callbacks: { label: ctx => `${ctx.dataset.label}: ${_u5Signed(ctx.parsed.y, 2, '%p')}` } } },
      scales: { x: xAxis, y: { ticks: { color: t.tick, font: { size: 10 }, maxTicksLimit: 5, callback: v => v + '%' },
        grid: { color: ctx => ctx.tick.value === 0 ? 'rgba(168,173,196,.5)' : t.grid } } } },
    plugins: [weakBands],
  }));
}
