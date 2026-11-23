// us-inverse.js — STRATEGY '미국 인버스 혼용' 페이지 (11-23)
// [원본] 태린이아빠 Market Dashboard '미국 인버스 혼용 전략'(공개 소스 app.py US_INVERSE_MIXED_SRC, v11.60~62 · 11-21 신설)
//   매달 마지막 거래일 종가로 QQQ와 TIP이 월봉 6개월선 위면 상승장, 아니면 하락장. 다음 달 비중을 고정한다(월중 매매 없음).
//   상승장: QQQ 3개월 수익 > 0이면 QLD 20%, SOXX가 6개월선 위면 SOXX 35% — QQQ45/QLD20/SOXX35 · QQQ80/QLD20 · QQQ60/SOXX35/현금5 · QQQ60/현금40,
//     QQQ 20일 변동성 ≥ 과거 3년 중앙값 × 2면 QQQ50/현금50(안전핀). 하락장: SPMO50/PSQ50, QQQ 낙폭 ≤ −30% ∧ 변동성 하락이면 PSQ 대신 현금.
// [원본과 다른 점] 원본은 글 카드 · 표 · 그림 1장. 여기는 국내 · 미국 월 리밸런싱과 같은 틀(확정 · 예상 카드)로 보이고 낙폭 그림을 따로 둔다.
//   계산은 백엔드 collect_us_inverse.py — 원본 대조(11-20 종가): 확정 · 예상 판단값 · 월중 보유 추정 · 최근 13개월 흐름 · 성과(MDD · 배수 · 일별 MDD)가 같고,
//   2023년 이전 QQQ 연도별만 수정종가 차이로 0.1~0.2%p 다르다.
// 데이터: market_snapshot(kind = 'us_inverse', payload)
// 의존: config.js (sb, escapeHtml, escAttr, chartTheme, SERIES_PAL), Chart.js, kr-monthly.js(_km* 카드 · 그림 · 숫자 도우미), u5-* · km-* 꾸밈

const UINV = {
  p: null,
  charts: [],
};

const UINV_NAME = { QQQ: '나스닥100', QLD: '나스닥100 2배', SOXX: '반도체', SPMO: 'S&P500 모멘텀', PSQ: '나스닥100 인버스', 현금: '현금', TIP: '물가연동국채' };
const UINV_ASSETS = ['QQQ', 'QLD', 'SOXX', 'SPMO', 'PSQ', '현금'];
const UINV_SERIES = [['final', '최종 조건부 전략', 1, 2.4], ['orig', '기존 원본 전략', 4, 1.3], ['qqq', 'QQQ 보유', -1, 1.5]];

function pUsInverse() {
  return `
  <div class="u5-head">
    <div class="u5-lede"><b>QQQ와 TIP(물가연동 국채)의 월봉 6개월선</b>으로 상승장 · 하락장을 나누고, <b>매달 말 한 번</b> 다음 달 비중을 정하는 규칙입니다.
      상승장에는 QQQ에 QLD(2배) · SOXX(반도체)를 조건에 따라 더하고, 하락장에는 SPMO(모멘텀) 50% + PSQ(나스닥 인버스) 50%를 듭니다.</div>
    <div id="uinv-asof" class="u5-asof"></div>
  </div>
  <div id="uinv-body"><div class="u5-msg">불러오는 중...</div></div>`;
}

async function loadUsInverse() {
  const body = document.getElementById('uinv-body');
  if (!body) return;
  try {
    const { data, error } = await sb.from('market_snapshot').select('base_date,payload')
      .eq('kind', 'us_inverse').order('base_date', { ascending: false }).limit(1);
    if (error) throw error;
    if (!document.getElementById('uinv-body')) return;
    UINV.p = data?.[0]?.payload || null;
    if (!UINV.p) { body.innerHTML = '<div class="u5-msg">아직 계산된 날이 없습니다 — 매일 아침 미국 장 마감 뒤 채워집니다.</div>'; return; }
    uinvRender();
  } catch (e) {
    const missing = /42P01|PGRST205|does not exist|Could not find/.test(`${e?.code} ${e?.message}`);
    if (!missing) console.warn('[미국 인버스 혼용]', e);
    body.innerHTML = `<div class="u5-msg">${missing ? '준비 중 — 데이터 테이블이 아직 없습니다.'
      : '불러오지 못했습니다 — ' + escapeHtml(e.message || '조회 실패')}</div>`;
  }
}

function unloadUsInverse() {
  UINV.charts.forEach(c => c.destroy());
  UINV.charts = [];
}

const _uinvW = w => UINV_ASSETS.filter(a => (w?.[a] || 0) > 1e-8).map(a => `${a} ${Math.round(w[a] * 100)}%`).join(' / ') || '현금 100%';
const _uinvYM = m => m ? `${m.slice(0, 4)}년 ${+m.slice(5, 7)}월` : '—';
const _uinvOk = (ok, yes, no) => ok ? `<b class="km-on">${yes}</b>` : `<span class="km-off">${no}</span>`;

function _uinvCard(s, title, sub, isPreview) {
  const name = !s.valid ? '신호 준비' : s.up ? '상승장' : '하락장';
  const cls = !s.valid ? '' : s.up ? 'up' : 'down';
  const hold = UINV_ASSETS.filter(a => a !== '현금' && (s.w?.[a] || 0) > 1e-8)
    .map(a => `<b class="km-chip" title="${escAttr(UINV_NAME[a])}">${escapeHtml(a)} ${Math.round(s.w[a] * 100)}%<small style="font-weight:500"> ${escapeHtml(UINV_NAME[a])}</small></b>`).join('') || '<em>없음 — 현금</em>';
  const vs = (px, ma) => px == null || ma == null ? '—' : `${_kmNum(px, 2)} <small>/ ${_kmNum(ma, 2)}</small>`;
  const rows = [
    ['QQQ 종가 / 6개월선', `${vs(s.qqq, s.ma6_qqq)} ${_uinvOk(s.up_qqq, '상회', '이탈')}`, '월말 종가와 최근 6개 월말 종가 평균'],
    ['TIP 종가 / 6개월선', `${vs(s.tip, s.ma6_tip)} ${_uinvOk(s.up_tip, '상회', '이탈')}`, '물가연동 국채 — 둘 다 상회해야 상승장'],
    ['QQQ 최근 3개월', `<span style="color:${_kmColor(s.qqq_3m)}">${_kmSignedPct(s.qqq_3m, 2)}</span> ${s.up ? _uinvOk(s.qld_ok, 'QLD 적격', 'QLD 제외') : ''}`, '0보다 크면 상승장에서 QLD 20%'],
    ['SOXX 종가 / 6개월선', `${vs(s.soxx, s.ma6_soxx)} ${s.up ? _uinvOk(s.soxx_ok, 'SOXX 적격', 'SOXX 제외') : ''}`, '6개월선 위면 상승장에서 SOXX 35%'],
    ['QQQ 20일 변동성', `${_kmPct(s.vol, 1)} <small>3년 중앙값 ${_kmPct(s.vol_med, 1)} · <i style="color:${(s.vol_ratio ?? 0) >= 2 ? 'var(--down)' : 'var(--text2)'}">${_kmNum(s.vol_ratio, 2)}배</i></small>`,
      s.up ? (s.safety ? '안전핀 발동 — QQQ50/현금50' : '2배 이상이면 상승장 안전핀(QQQ50/현금50)') : '하락장에서는 안전핀을 쓰지 않음'],
    ['QQQ 252일 고점 대비', `<span style="color:${_kmColor(s.dd)}">${_kmSignedPct(s.dd)}</span> <small>직전 월말 변동성 ${_kmPct(s.prev_vol, 1)}</small>`,
      s.up ? '하락장에서 −30% 이하 ∧ 변동성 하락이면 PSQ 뺌' : (s.psq_off ? 'PSQ 제거 발동 — SPMO50/현금50' : (s.dd != null && s.dd <= -0.3 ? '변동성이 직전 월말보다 낮지 않아 PSQ 유지' : '낙폭 −30% 조건 미달 — PSQ 유지'))],
  ];
  return _kmCardHtml({ title, sub, preview: isPreview, name, cls, desc: s.why, exp: 1 - (s.w?.['현금'] || 0), cash: s.w?.['현금'] || 0, hold, rows, lists: [] });
}

function _uinvComments(c, v, p) {
  const out = [];
  if (!v) { out.push('최신 자료가 월말이라 다음 달 임시 신호가 따로 없습니다 — 위 확정 비중이 다음 운용 달 목표입니다.'); return out; }
  const a = _uinvW(c.w), b = _uinvW(v.w);
  out.push(a === b ? `지금 자료로는 다음 달에도 <b>${escapeHtml(b)}</b> 유지 예상입니다.` : `포지션이 <b>${escapeHtml(a)}</b>에서 <b>${escapeHtml(b)}</b>(으)로 바뀌는 신호입니다.`);
  if (c.up !== v.up) out.push(`시장 상태가 ${c.up ? '상승장' : '하락장'}에서 <b>${v.up ? '상승장' : '하락장'}</b>으로 바뀌었습니다.`);
  out.push(`QQQ 252일 낙폭 ${_kmSignedPct(c.dd)} → ${_kmSignedPct(v.dd)}, 변동성 배수 ${_kmNum(c.vol_ratio, 2)}배 → ${_kmNum(v.vol_ratio, 2)}배.`);
  if (p.drift) out.push(`${_uinvYM(c.apply)} 월중 실제 보유 추정(월말 목표를 그대로 두고 ${_kmMD(p.drift.to)} 종가로 평가): <b>${escapeHtml(_uinvW(p.drift.w))}</b>.`);
  out.push('임시 신호는 실제 매매 신호가 아닙니다 — 실제 리밸런싱은 월말 확정 신호로 합니다.');
  return out;
}

function uinvRender() {
  const p = UINV.p, body = document.getElementById('uinv-body');
  if (!body || !p) return;
  unloadUsInverse();
  const asof = document.getElementById('uinv-asof');
  if (asof) asof.innerHTML = `<b>${escapeHtml(p.asof)} 미국 종가 기준</b> · 자료 ${escapeHtml(p.start)}부터 ${p.n_days}거래일 · 평가 ${escapeHtml(p.eval?.from || '')} ~ ${escapeHtml(p.eval?.to || '')} (${p.eval?.months || 0}개월)`;
  const c = p.confirmed, v = p.preview, pf = p.perf || {}, yr = p.yearly || {};

  body.innerHTML = `
    <div class="km-top2">
      ${_uinvCard(c, `${_uinvYM(c.apply)} 실제 운용 · 확정`, `${_kmMD(c.sd)} 월말 신호로 확정 — 월중 매매 없음`, false)}
      ${v ? _uinvCard(v, `${_uinvYM(v.apply)} 예상 · 임시`, `${_kmMD(v.sd)}을 월말로 친 신호 — 월말까지 바뀔 수 있음`, true) : '<div class="card km-pos preview"><div class="u5-msg">다음 달 임시 신호 없음 — 최신 자료가 이미 월말입니다.</div></div>'}
    </div>
    <div class="card km-read">
      <div class="card-header" style="flex-wrap:wrap;gap:6px"><span class="card-title">지금 → 다음 달</span><span class="card-sub">원본의 '현재 포지션 → 다음 달 예상 포지션 해석'</span></div>
      <ol class="km-cmt">${_uinvComments(c, v, p).map(t => `<li>${t}</li>`).join('')}</ol>
      <div class="u5-scroll" style="padding:0 18px 14px"><table class="u5-tbl">
        <thead><tr><th>자산</th><th>이번 달 확정 목표</th><th>다음 달 예비 목표</th><th>변화</th>${p.drift ? '<th title="월말 목표를 그대로 두고 최신 종가로 평가">지금 보유 추정</th>' : ''}</tr></thead>
        <tbody>${UINV_ASSETS.map(a => { const x = c.w?.[a] || 0, y = v ? (v.w?.[a] || 0) : null, d = y == null ? null : (y - x); return `<tr>
          <td class="u5-name"><b>${escapeHtml(a)}</b><small>${escapeHtml(UINV_NAME[a])}</small></td><td class="u5-n">${_kmPct(x, 0)}</td>
          <td class="u5-n">${y == null ? '—' : _kmPct(y, 0)}</td><td class="u5-n" style="color:${_kmColor(d)}">${d == null || Math.abs(d) < 1e-9 ? '—' : _kmSignedPct(d, 0, '%p')}</td>
          ${p.drift ? `<td class="u5-n">${_kmPct(p.drift.w?.[a] || 0, 1)}</td>` : ''}</tr>`; }).join('')}</tbody>
      </table></div>
    </div>

    <div class="card u5-perf-card">
      <div class="card-header" style="flex-wrap:wrap;gap:6px">
        <span class="card-title">백테스트</span><span class="card-sub">${escapeHtml(p.eval?.from || '')} ~ ${escapeHtml(p.eval?.to || '')} 완료된 달만 · 월말 신호 종가 → 다음 달 고정 비중 · 편도 0.1% · 로그 눈금</span>
      </div>
      <div class="u5-chart u5-chart-lg"><canvas id="uinv-c-eq" role="img" aria-label="최종 · 원본 · QQQ 누적 성과"></canvas></div>
      <div class="u5-legend">${UINV_SERIES.map(([k, n, ci]) => `<span><i style="background:${ci < 0 ? 'var(--text2)' : SERIES_PAL[ci]}"></i>${n}</span>`).join('')}</div>
      <div class="u5-chart"><canvas id="uinv-c-dd" role="img" aria-label="월말 고점 대비 낙폭"></canvas></div>
      <div class="u5-legend"><span>월말 고점 대비 낙폭(%) — 같은 색</span></div>
      <div class="u5-perf">
        <table class="u5-tbl">
          <thead><tr><th>전략</th><th>연수익</th><th>월말 최대 낙폭</th><th>연율 변동성</th><th>배수</th><th>월 승률</th><th title="월중 비중 변경 없이 매일 평가했을 때">일별 최대 낙폭</th></tr></thead>
          <tbody>${UINV_SERIES.map(([k, n]) => { const s = pf[k] || {}; return `<tr class="${k === 'final' ? 'u5-hl' : ''}">
            <td class="u5-name"><b>${n}</b></td><td class="u5-n" style="color:${_kmColor(s.cagr)}">${_kmSignedPct(s.cagr, 2)}</td>
            <td class="u5-n" style="color:var(--down)">${_kmPct(s.mdd, 2)}</td><td class="u5-n">${_kmPct(s.vol, 2)}</td>
            <td class="u5-n"><b>${_kmNum(s.mult, 2)}배</b></td><td class="u5-n">${_kmPct(s.win, 1)}</td>
            <td class="u5-n" style="color:var(--down)">${s.dmdd == null ? '—' : _kmPct(s.dmdd, 2)}</td></tr>`; }).join('')}</tbody>
        </table>
        <div class="u5-side">
          <table class="u5-tbl">
            <thead><tr><th>연도</th><th>최종</th><th>원본</th><th>QQQ</th><th title="최종 − QQQ">QQQ 대비</th></tr></thead>
            <tbody>${(yr.years || []).map((y, i) => { const a = yr.final?.[i], b = yr.orig?.[i], q = yr.qqq?.[i], d = a == null || q == null ? null : a - q; return `<tr><td>${y}${i === 0 ? '<small> (일부)</small>' : i === yr.years.length - 1 ? '<small> (연중)</small>' : ''}</td>
              <td class="u5-n" style="color:${_kmColor(a)}">${_kmSignedPct(a, 1)}</td><td class="u5-n" style="color:${_kmColor(b)}">${_kmSignedPct(b, 1)}</td>
              <td class="u5-n" style="color:${_kmColor(q)}">${_kmSignedPct(q, 1)}</td><td class="u5-n" style="color:${_kmColor(d)}">${_kmSignedPct(d, 1, '%p')}</td></tr>`; }).join('')}</tbody>
          </table>
          <div class="u5-note">원본(기존) 전략 = 상승장 QQQ60/QLD15/SOXX25, 하락장 SPMO50/PSQ50. 최종 = 위 조건부 규칙. 월말 종가에 바로 체결한다고 가정하므로
            실제로 그 가격에 살 수 있는지는 따로 봐야 합니다. 표본 안의 결과입니다.</div>
        </div>
      </div>
    </div>

    <div class="card u5-perf-card">
      <div class="card-header" style="flex-wrap:wrap;gap:6px"><span class="card-title">최근 ${p.history?.length || 0}개월 월말 신호 · 포지션 흐름</span><span class="card-sub">맨 위 줄이 최신(임시는 오늘을 월말로 친 예비 신호)</span></div>
      <div class="u5-scroll"><table class="u5-tbl">
        <thead><tr><th>신호일</th><th>운용 달</th><th>시장</th>${UINV_ASSETS.map(a => `<th>${escapeHtml(a)}</th>`).join('')}<th title="QQQ 20일 변동성 ÷ 3년 중앙값">변동성 배수</th><th>QQQ 낙폭</th><th style="text-align:left">판단</th></tr></thead>
        <tbody>${[...(p.history || [])].reverse().map(h => `<tr${h.done ? '' : ' class="u5-hl"'}>
          <td class="u5-n u5-rk">${escapeHtml(h.sd.slice(2).replace(/-/g, '.'))}${h.done ? '' : '<small>임시</small>'}</td><td class="u5-n">${escapeHtml(h.apply.slice(2).replace('-', '.'))}</td>
          <td><span class="km-mode ${h.up ? 'up' : 'down'}">${h.up ? '상승' : '하락'}</span></td>
          ${UINV_ASSETS.map(a => `<td class="u5-n">${(h.w?.[a] || 0) > 1e-8 ? `<b>${Math.round(h.w[a] * 100)}%</b>` : '<span style="color:var(--text3)">—</span>'}</td>`).join('')}
          <td class="u5-n" style="color:${(h.vol_ratio ?? 0) >= 2 ? 'var(--down)' : 'var(--text1)'}">${_kmNum(h.vol_ratio, 2)}배</td>
          <td class="u5-n" style="color:${_kmColor(h.dd)}">${_kmSignedPct(h.dd)}</td><td class="u5-why">${escapeHtml(h.why || '')}</td></tr>`).join('')}</tbody>
      </table></div>
    </div>

    <div class="u5-foot">
      <b>상승 · 하락</b> — 월말 종가가 QQQ와 TIP 모두 월봉 6개월 이동평균(최근 6개 월말 종가 평균) 위면 상승장, 아니면 하락장. 6개월선 자료가 모자라면 현금 대기.<br>
      <b>상승장</b> — QQQ 최근 3개월 수익 > 0이면 QLD 20%, SOXX가 6개월선 위면 SOXX 35%: 둘 다 QQQ45/QLD20/SOXX35, SOXX만 탈락 QQQ80/QLD20, QLD만 탈락 QQQ60/SOXX35/현금5, 둘 다 탈락 QQQ60/현금40.
      먼저 QQQ 20거래일 연율 변동성이 과거 3년(최근 63거래일 뺀 756거래일) 중앙값의 2배 이상이면 QQQ50/현금50(안전핀, 자료 252일 미만이면 안 씀).<br>
      <b>하락장</b> — SPMO50/PSQ50. QQQ 252일 고점 대비 −30% 이하이고 20일 변동성이 직전 월말보다 낮아지면 PSQ를 빼고 SPMO50/현금50.<br>
      <b>자료</b> — 야후 수정 종가 TIP · QQQ · QLD · SOXX · SPMO · PSQ, ${escapeHtml(p.start)}부터(원본 HTS 엑셀과 같은 1,500거래일). 최신 달이 진행 중이면 그 신호는 다음 달 임시 신호로만 쓰고 성과에서 뺍니다.
      태린이아빠 '미국 인버스 혼용 전략'과 같은 계산입니다.
    </div>`;
  uinvDrawCharts();
}

function uinvDrawCharts() {
  const p = UINV.p, mo = p?.monthly;
  unloadUsInverse();
  if (!mo?.m?.length) return;
  const t = chartTheme(), css = getComputedStyle(document.documentElement);
  const gray = css.getPropertyValue('--text2').trim() || '#b3b8cd';
  const color = ci => ci < 0 ? gray : SERIES_PAL[ci];
  const labels = mo.m.map(m => `${m}-01`);
  const withStart = a => [1, ...(a || [])];                       // 첫 달 시작 = 1
  const lab = [`${(() => { const [y, m] = mo.m[0].split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; })()}-01`, ...labels];
  const base = { responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false } };
  const xAxis = _kmXAxis(t, lab);
  _kmChart(UINV.charts, 'uinv-c-eq', {
    type: 'line',
    data: { labels: lab, datasets: UINV_SERIES.map(([k, n, ci, w]) => _kmLine(n, withStart(mo[k]), color(ci), w)) },
    options: { ...base,
      plugins: { legend: { display: false }, tooltip: { callbacks: { title: it => (it[0]?.label || '').slice(0, 7), label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)}배` } } },
      scales: { x: xAxis, y: { type: 'logarithmic', ticks: { color: t.tick, font: { size: 10 }, callback: v => { const r = +(+v).toPrecision(2); return [0.7, 1, 1.5, 2, 3, 4, 5, 7, 10].includes(r) ? r + '배' : ''; } }, grid: { color: t.grid } } } },
  });
  _kmChart(UINV.charts, 'uinv-c-dd', {
    type: 'line',
    data: { labels: lab, datasets: UINV_SERIES.map(([k, n, ci]) => _kmLine(n, _kmDD(withStart(mo[k])), color(ci), k === 'final' ? 1.6 : 1, k === 'final' ? { fill: 'origin', backgroundColor: SERIES_PAL[1] + '22' } : {})) },
    options: { ...base,
      plugins: { legend: { display: false }, tooltip: { callbacks: { title: it => (it[0]?.label || '').slice(0, 7), label: ctx => ctx.parsed.y == null ? null : `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}%` } } },
      scales: { x: xAxis, y: { max: 0, ticks: { color: t.tick, font: { size: 10 }, maxTicksLimit: 5, callback: v => v + '%' }, grid: { color: t.grid } } } },
  });
}
