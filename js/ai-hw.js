// ai-hw.js — RESEARCH 'AI 하드웨어' 페이지 (11-14)
// [원본] 태린이아빠 Market Dashboard 'AI하드웨어 주가 모멘텀 점검'(공개 소스 app.py AI_SRC — AI Tech Breadth & Peak-out)
//   AI 하드웨어 41종목(미국 26 · 한국 3 · 일본 8 · 대만/ADR 4)이 얼마나 넓게 오르고 있는지(Breadth)와
//   지수는 고점인데 오르는 종목은 줄어드는 '피크아웃'을 본다.
//     Breadth Score = 20일선 위 20% + 60일선 위 35% + 200일선 위 25% + 60일 수익률 플러스 20% (각각 종목 비율)
//     MA5 = Score의 5일 평균, 기울기 = MA5 − n일 전 MA5, 동일가중 지수 = 종목마다 첫 값 100으로 맞춘 평균
//     다이버전스 = 지수가 20일 고점의 1% 안 ∧ MA5가 20일 고점보다 10점(강한 것은 20점) 넘게 낮음 ∧ 기울기 내림
// [원본과 다른 점] 원본 화면은 그림 5장만 보인다. 여기서는 원본이 계산만 하고 숨긴 현재 요약 · 위험 단계 · 최근 30일 표와
//   종목별 위치(어느 종목이 선 위인지)도 보여 준다. 계산은 백엔드 collect_ai_hw.py — 단계 기준은 원본 classify_risk 그대로.
// 데이터: market_snapshot(kind = 'ai_hw', payload) — 매일 07:00 · 08:20
// 의존: config.js (sb, escapeHtml, escAttr, chartTheme, SERIES_PAL), Chart.js

const AIHW = {
  p: null,
  range: 252,          // 그림 범위(거래일): 126 | 252 | 0(전체)
  sort: [null, -1],    // 종목 표 정렬 [키, 방향] — null이면 원본 순서
  charts: [],
};

// 단계 코드 → [이름, 꾸밈, 조건(원본 classify_risk)]
const AIHW_RISK = {
  peak_strong:     ['피크아웃 강경고', 'warn',  '지수는 20일 고점권인데 Breadth는 20일 고점보다 20점 넘게 낮고 10일 기울기도 내림'],
  peak_warn:       ['피크아웃 경고',   'soft',  '지수는 20일 고점권인데 Breadth는 20일 고점보다 10점 넘게 낮고 5일 기울기가 내림'],
  strong:          ['강세',            'up',    'Breadth 70 이상 · 5일 기울기 오름'],
  top_watch:       ['고점 경계',       'soft',  'Breadth 70 이상이지만 5일 기울기 내림'],
  normal:          ['정상',            '',      'Breadth 60 ~ 70'],
  caution:         ['주의',            'soft',  'Breadth 50 ~ 60 · 5일 기울기 내림'],
  neutral:         ['중립',            '',      'Breadth 50 ~ 60 · 5일 기울기 오름'],
  risk:            ['위험',            'down',  'Breadth 35 ~ 50 · 10일 기울기 내림'],
  weak_rebound:    ['약세 반등',       'dnsoft', 'Breadth 35 ~ 50 · 10일 기울기 오름'],
  selloff:         ['투매 진행',       'down',  'Breadth 35 미만 · 5일 기울기 내림'],
  selloff_rebound: ['투매 후 반등',    'dnsoft', 'Breadth 35 미만 · 5일 기울기 오름'],
  nodata:          ['데이터 부족',     '',      ''],
};
// 점수 띠 구간(원본 단계 경계 35 · 50 · 60 · 70)
const AIHW_ZONES = [[0, 35, '투매'], [35, 50, '약세'], [50, 60, '중립'], [60, 70, '정상'], [70, 100, '강세']];
const AIHW_NAME = {
  Samsung: '삼성전자', SKHynix: 'SK하이닉스', SamsungElectroMechanics: '삼성전기',
  WesternDigital: 'Western Digital', AsteraLabs: 'Astera Labs', TokyoElectron: 'Tokyo Electron', SiliconMotion: 'Silicon Motion',
};
const AIHW_REGION = { US: ['미', '미국'], KR: ['한', '한국'], JP: ['일', '일본'], TW: ['대', '대만 · ADR'] };

function pAiHw() {
  return `
  <div class="ah-head">
    <div class="ah-lede">AI 하드웨어 <b>41종목이 얼마나 넓게 오르고 있는지</b>를 봅니다. 지수는 고점인데 오르는 종목이 줄면
      <b>피크아웃</b>, 대부분이 선 아래로 떨어졌다가 돌아서면 <b>투매 후 반등</b> 신호로 읽습니다.</div>
    <div id="ah-asof" class="ah-asof"></div>
  </div>
  <div id="ah-body"><div class="ah-msg">불러오는 중...</div></div>`;
}

async function loadAiHw() {
  const body = document.getElementById('ah-body');
  if (!body) return;
  try {
    const { data, error } = await sb.from('market_snapshot').select('base_date,payload')
      .eq('kind', 'ai_hw').order('base_date', { ascending: false }).limit(1);
    if (error) throw error;
    if (!document.getElementById('ah-body')) return;
    AIHW.p = data?.[0]?.payload || null;
    if (!AIHW.p) {
      body.innerHTML = '<div class="ah-msg">아직 계산된 날이 없습니다 — 매일 아침 7시에 채워집니다.</div>';
      return;
    }
    ahRender();
  } catch (e) {
    const missing = /42P01|PGRST205|does not exist|Could not find/.test(`${e?.code} ${e?.message}`);
    if (!missing) console.warn('[AI 하드웨어]', e);
    body.innerHTML = `<div class="ah-msg">${missing ? '준비 중 — 데이터 테이블이 아직 없습니다.'
      : '불러오지 못했습니다 — ' + escapeHtml(e.message || '조회 실패')}</div>`;
  }
}

function unloadAiHw() {
  AIHW.charts.forEach(c => c.destroy());
  AIHW.charts = [];
}

const _ahNum = (v, d = 1) => v == null ? '—' : (+v).toFixed(d);
const _ahSigned = (v, d = 1) => v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d);
const _ahColor = v => v == null ? 'var(--text2)' : v > 0 ? 'var(--up)' : v < 0 ? 'var(--down)' : 'var(--text1)';
const _ahMD = d => d ? `${+d.slice(5, 7)}/${+d.slice(8, 10)}` : '—';
const _ahRisk = code => { const [name, cls, rule] = AIHW_RISK[code] || AIHW_RISK.nodata; return `<span class="ah-tag${cls ? ' ah-' + cls : ''}"${rule ? ` title="${escAttr(rule)}"` : ''}>${name}</span>`; };

function ahRender() {
  const p = AIHW.p, body = document.getElementById('ah-body');
  if (!body || !p) return;
  const la = p.latest;
  const [riskName, riskCls, riskRule] = AIHW_RISK[la.risk] || AIHW_RISK.nodata;
  const asof = document.getElementById('ah-asof');
  if (asof) asof.innerHTML = `<b>${escapeHtml(p.asof)} 기준</b> · 분석 ${p.n} / ${p.total}종목${p.excluded?.length ? ` · 자료 부족 제외: ${p.excluded.map(escapeHtml).join(', ')}` : ''}`;

  const pin = Math.max(0, Math.min(100, la.ma5 ?? 0));
  const kpi = (name, value, sub = '') => `<div><span>${name}</span><b>${value}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
  const slope = v => `<b style="color:${_ahColor(v)}">${_ahSigned(v)}</b>`;
  const maxCnt = Math.max(...p.counts.map(c => c.total), 1);

  body.innerHTML = `
    <div class="card ah-now">
      <div class="ah-now-l">
        <div class="ah-k">현재 단계</div>
        <div class="ah-stage ah-${riskCls || 'plain'}">${riskName}</div>
        <div class="ah-rule">${escapeHtml(riskRule)}</div>
        <div class="ah-band-wrap" role="img" aria-label="Breadth Score 5일 평균 ${_ahNum(la.ma5)}점">
          <div class="ah-read" style="left:clamp(0px, calc(${pin}% - 24px), calc(100% - 48px))"><b>${_ahNum(la.ma5)}</b></div>
          <div class="ah-band">${AIHW_ZONES.map(([lo, hi], i) => `<span class="ah-seg ah-seg-${i}${pin >= lo && (pin < hi || hi === 100) ? ' on' : ''}" style="flex:${hi - lo}"></span>`).join('')}</div>
          <span class="ah-pin" style="left:${pin}%"></span>
          <div class="ah-zones">${AIHW_ZONES.map(([lo, hi, name]) => `<div style="flex:${hi - lo}"><span>${name}</span><small>${lo}–${hi}</small></div>`).join('')}</div>
        </div>
        <div class="ah-facts">
          <span>5일 기울기 ${slope(la.s5)}</span><span>10일 기울기 ${slope(la.s10)}</span>
          <span>최근 10일 중 내린 날 <b>${_ahNum(la.fall10, 0)}</b></span>
        </div>
      </div>
      <div class="ah-kpis">
        ${kpi('20일선 위', _ahNum(la.a20) + '%', '비중 20%')}
        ${kpi('60일선 위', _ahNum(la.a60) + '%', '비중 35%')}
        ${kpi('200일선 위', _ahNum(la.a200) + '%', '비중 25%')}
        ${kpi('60일 수익률 플러스', _ahNum(la.p60) + '%', '비중 20%')}
        ${kpi('오늘 점수', _ahNum(la.score), `5일 평균과 ${_ahSigned(la.diff)}`)}
        ${kpi('20일 고점 대비', `<i style="font-style:normal;color:${_ahColor(la.from_high)}">${_ahSigned(la.from_high)}</i>`, 'Breadth 5일 평균')}
        ${kpi('동일가중 지수', _ahNum(la.index), `20일 ${_ahSigned(la.index_20d)}% · 60일 ${_ahSigned(la.index_60d)}%`)}
        ${kpi('다이버전스', la.sdiv ? '강한 약세' : la.div ? '약세' : '없음', la.near_high ? '지수 20일 고점권' : '지수 고점권 아님')}
      </div>
    </div>

    <div class="ah-range">
      <span>그림 범위</span>
      ${[[126, '6개월'], [252, '1년'], [0, '3년']].map(([n, name]) => `<button class="chip chip-sm${AIHW.range === n ? ' active' : ''}" data-ah-range="${n}">${name}</button>`).join('')}
    </div>

    <div class="card">
      <div class="card-header" style="flex-wrap:wrap;gap:6px">
        <span class="card-title">지수와 Breadth</span>
        <span class="card-sub">지수가 오르는데 Breadth가 꺾이면 피크아웃 · ▼ 강한 약세 다이버전스 · ● 약세 다이버전스</span>
      </div>
      <div class="ah-chart ah-chart-lg"><canvas id="ah-c-index" role="img" aria-label="동일가중 지수와 Breadth Score 5일 평균"></canvas></div>
      <div class="ah-legend"><span><i style="background:var(--text1)"></i>동일가중 지수 (왼쪽)</span><span><i style="background:${SERIES_PAL[1]}"></i>Breadth Score 5일 평균 (오른쪽)</span></div>
    </div>

    <div class="ah-grid">
      <div class="card">
        <div class="card-header" style="flex-wrap:wrap;gap:6px"><span class="card-title">이동평균선 위 종목 비율</span><span class="card-sub">기준선 70 · 50 · 30</span></div>
        <div class="ah-chart"><canvas id="ah-c-ma" role="img" aria-label="20·60·200일선 위 종목 비율"></canvas></div>
        <div class="ah-legend">${[['20일선', 0], ['60일선', 1], ['200일선', 2]].map(([n, i]) => `<span><i style="background:${SERIES_PAL[i]}"></i>${n}</span>`).join('')}</div>
      </div>
      <div class="card">
        <div class="card-header" style="flex-wrap:wrap;gap:6px"><span class="card-title">Breadth Score</span><span class="card-sub">기준선 70 · 60 · 50 · 35</span></div>
        <div class="ah-chart"><canvas id="ah-c-score" role="img" aria-label="Breadth Score와 5일 평균"></canvas></div>
        <div class="ah-legend"><span><i style="background:${SERIES_PAL[0]}66"></i>하루 점수</span><span><i style="background:${SERIES_PAL[1]}"></i>5일 평균</span></div>
      </div>
      <div class="card">
        <div class="card-header" style="flex-wrap:wrap;gap:6px"><span class="card-title">Breadth 기울기</span><span class="card-sub">5일 평균의 변화 · 기준선 0 · ±10</span></div>
        <div class="ah-chart"><canvas id="ah-c-slope" role="img" aria-label="Breadth 5일·10일 기울기"></canvas></div>
        <div class="ah-legend"><span><i style="background:${SERIES_PAL[0]}"></i>5일</span><span><i style="background:${SERIES_PAL[1]}"></i>10일</span></div>
      </div>
      <div class="card">
        <div class="card-header" style="flex-wrap:wrap;gap:6px"><span class="card-title">기간별 상승 · 하락 종목 수</span><span class="card-sub">${p.n}종목</span></div>
        <div class="ah-counts">${p.counts.map(c => `
          <div class="ah-cnt">
            <span class="ah-cnt-p">${c.p.replace('M', '개월')}</span>
            <span class="ah-cnt-bar" role="img" aria-label="상승 ${c.pos} 하락 ${c.neg}">
              <i class="up" style="flex:${c.pos}"></i><i class="zero" style="flex:${c.zero + (maxCnt - c.total)}"></i><i class="dn" style="flex:${c.neg}"></i>
            </span>
            <span class="ah-cnt-n"><b style="color:var(--up)">${c.pos}</b> · <b style="color:var(--down)">${c.neg}</b></span>
          </div>`).join('')}
          <div class="ah-note">빨강 = 그 기간 수익률이 플러스인 종목, 파랑 = 마이너스. 1 · 2 · 3 · 6개월 = 21 · 42 · 63 · 126거래일.</div>
        </div>
      </div>
    </div>

    <div class="ah-grid ah-grid-wide">
      <div class="card">
        <div class="card-header" style="flex-wrap:wrap;gap:6px"><span class="card-title">최근 ${p.recent.length}거래일</span><span class="card-sub">최신 순</span></div>
        <div class="ah-scroll"><table class="ah-tbl">
          <thead><tr><th>날짜</th><th>단계</th><th>5일 평균</th><th>오늘 − 평균</th><th>5일 기울기</th><th>10일 기울기</th><th>고점 대비</th><th>20일선</th><th>60일선</th><th>200일선</th><th>60일 +</th></tr></thead>
          <tbody>${[...p.recent].reverse().map(r => `<tr>
            <td>${_ahMD(r.d)}</td><td>${_ahRisk(r.risk)}${r.sdiv ? ' ▼' : r.div ? ' ●' : ''}</td>
            <td class="ah-n"><b>${_ahNum(r.ma5)}</b></td>
            ${[r.diff, r.s5, r.s10, r.from_high].map(v => `<td class="ah-n" style="color:${_ahColor(v)}">${_ahSigned(v)}</td>`).join('')}
            ${[r.a20, r.a60, r.a200, r.p60].map(v => `<td class="ah-n">${_ahNum(v)}</td>`).join('')}</tr>`).join('')}</tbody>
        </table></div>
      </div>
      <div class="card">
        <div class="card-header" style="flex-wrap:wrap;gap:6px"><span class="card-title">종목</span><span class="card-sub">열 이름을 누르면 정렬 · ● 선 위 ○ 선 아래</span></div>
        <div class="ah-scroll" id="ah-stocks"></div>
      </div>
    </div>

    <div class="ah-foot">
      <b>읽는 법</b> — Breadth Score = 20일선 위 종목 비율 × 0.20 + 60일선 × 0.35 + 200일선 × 0.25 + 60일 수익률 플러스 비율 × 0.20.
      기울기 = 5일 평균이 n일 전보다 얼마나 올랐는지. 동일가중 지수 = 종목마다 3년 전 첫 값을 100으로 맞춘 평균.<br>
      <b>단계</b> — ${['strong', 'top_watch', 'normal', 'caution', 'neutral', 'risk', 'weak_rebound', 'selloff', 'selloff_rebound'].map(k => `${_ahRisk(k)} ${AIHW_RISK[k][2]}`).join(' · ')}.<br>
      <b>피크아웃</b> — ${_ahRisk('peak_warn')} ${AIHW_RISK.peak_warn[2]} · ${_ahRisk('peak_strong')} ${AIHW_RISK.peak_strong[2]}. 피크아웃이 먼저 판정됩니다.
      야후 수정 종가(배당 반영) 3년, 나라별 휴장일은 앞 값으로 5일까지 메웁니다. 태린이아빠 'AI하드웨어 주가 모멘텀 점검'과 같은 계산.
    </div>`;

  body.querySelectorAll('[data-ah-range]').forEach(b => b.addEventListener('click', () => {
    AIHW.range = +b.dataset.ahRange;
    body.querySelectorAll('[data-ah-range]').forEach(x => x.classList.toggle('active', x === b));
    ahRenderCharts();
  }));
  ahRenderStocks();
  ahRenderCharts();
}

function ahRenderStocks() {
  const box = document.getElementById('ah-stocks'), p = AIHW.p;
  if (!box || !p) return;
  const [key, dir] = AIHW.sort;
  const rows = [...p.stocks];
  if (key) rows.sort((a, b) => ((a[key] ?? (dir < 0 ? -Infinity : Infinity)) - (b[key] ?? (dir < 0 ? -Infinity : Infinity))) * dir);
  const th = (k, name) => `<th class="ah-sort${key === k ? ' on' : ''}" data-ah-sort="${k}" tabindex="0" role="button" aria-label="${name} 정렬">${name}${key === k ? (dir < 0 ? ' ↓' : ' ↑') : ''}</th>`;
  const dot = v => v == null ? '<td class="ah-n ah-dot">·</td>' : `<td class="ah-n ah-dot" title="${v ? '선 위' : '선 아래'}" style="color:${v ? 'var(--up)' : 'var(--text3)'}">${v ? '●' : '○'}</td>`;
  box.innerHTML = `<table class="ah-tbl">
    <thead><tr><th>종목 ${rows.length}</th><th>종가</th>${th('1M', '1개월')}${th('2M', '2개월')}${th('3M', '3개월')}${th('6M', '6개월')}<th title="20일선">20</th><th title="60일선">60</th><th title="200일선">200</th></tr></thead>
    <tbody>${rows.map(s => {
      const [tag, region] = AIHW_REGION[s.r] || ['', ''];
      const name = AIHW_NAME[s.n] || s.n;
      const code = s.r === 'KR' ? s.t.replace('.KS', '') : null;
      const open = code ? ` data-stock-open="${escAttr(code)}" data-stock-name="${escAttr(name)}" style="cursor:pointer"` : '';
      if (s.excluded) return `<tr class="ah-part"><td class="ah-name"><i class="ah-c ah-${s.r.toLowerCase()}" title="${region}">${tag}</i>${escapeHtml(name)}<small>${escapeHtml(s.t)}</small></td><td colspan="8" class="ah-n">자료 부족으로 제외</td></tr>`;
      return `<tr${open}>
        <td class="ah-name"><i class="ah-c ah-${s.r.toLowerCase()}" title="${region}">${tag}</i>${escapeHtml(name)}${s.t === s.n ? '' : `<small>${escapeHtml(s.t.replace(/\.(KS|T)$/, ''))}</small>`}</td>
        <td class="ah-n">${s.last == null ? '—' : s.last.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
        ${['1M', '2M', '3M', '6M'].map(k => `<td class="ah-n" style="color:${_ahColor(s[k])}">${s[k] == null ? '—' : _ahSigned(s[k]) + '%'}</td>`).join('')}
        ${dot(s.m20)}${dot(s.m60)}${dot(s.m200)}</tr>`;
    }).join('')}</tbody></table>`;
  box.querySelectorAll('[data-ah-sort]').forEach(h => {
    const go = () => { const k = h.dataset.ahSort; AIHW.sort = [k, AIHW.sort[0] === k ? -AIHW.sort[1] : -1]; ahRenderStocks(); };
    h.addEventListener('click', go);
    h.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
}

function ahRenderCharts() {
  const p = AIHW.p;
  unloadAiHw();
  if (!p?.series?.dates?.length) return;
  const s = p.series, n = s.dates.length, from = AIHW.range ? Math.max(0, n - AIHW.range) : 0;
  const cut = a => a.slice(from);
  const labels = cut(s.dates);
  const t = chartTheme();
  const css = getComputedStyle(document.documentElement);
  const idxColor = css.getPropertyValue('--text1').trim() || '#cfd4e4';   // 지수 선 = 본문 글자색
  const guide = (lv, axis = 'y') => ({
    label: `_${lv}`, data: labels.map(() => lv), yAxisID: axis, borderColor: 'rgba(168,173,196,.35)', borderDash: [4, 4],
    borderWidth: 1, pointRadius: 0, pointHoverRadius: 0, fill: false,
  });
  const line = (label, data, color, opt = {}) => ({
    label, data, borderColor: color, backgroundColor: color, borderWidth: 1.8, pointRadius: 0, pointHoverRadius: 4,
    tension: 0.15, spanGaps: true, fill: false, yAxisID: 'y', ...opt,
  });
  const xAxis = { ticks: { color: t.tick, font: { size: 10 }, maxTicksLimit: 8, maxRotation: 0,
    callback: function (v) { const d = this.getLabelForValue(v); return AIHW.range && AIHW.range <= 252 ? _ahMD(d) : d.slice(2, 7).replace('-', '.'); } }, grid: { color: t.grid } };
  const base = (extraScales, tip) => ({
    responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false },
    plugins: { legend: { display: false }, tooltip: { filter: it => !it.dataset.label.startsWith('_'), callbacks: { label: tip } } },
    scales: { x: xAxis, ...extraScales },
  });
  const pct = { min: 0, max: 100, ticks: { color: t.tick, font: { size: 10 }, stepSize: 20 }, grid: { color: t.grid } };
  const make = (id, datasets, options) => {
    const cv = document.getElementById(id);
    if (cv) AIHW.charts.push(new Chart(cv.getContext('2d'), { type: 'line', data: { labels, datasets }, options }));
  };

  // ① 지수(왼쪽) vs Breadth 5일 평균(오른쪽) + 다이버전스 표시
  const mark = dates => { const set = new Set(dates); return labels.map((d, i) => set.has(d) ? cut(s.index)[i] : null); };
  make('ah-c-index', [
    line('동일가중 지수', cut(s.index), idxColor, { yAxisID: 'y', borderWidth: 1.6 }),
    line('Breadth 5일 평균', cut(s.ma5), SERIES_PAL[1], { yAxisID: 'y1' }),
    { label: '강한 약세 다이버전스', data: mark(s.sdiv), yAxisID: 'y', showLine: false, pointStyle: 'triangle', rotation: 180, pointRadius: 6, pointHoverRadius: 7,
      borderColor: 'transparent', backgroundColor: css.getPropertyValue('--warn').trim() || '#f0a500' },
    { label: '약세 다이버전스', data: mark(s.div.filter(d => !s.sdiv.includes(d))), yAxisID: 'y', showLine: false, pointRadius: 3, pointHoverRadius: 5,
      borderColor: 'transparent', backgroundColor: 'rgba(240,165,0,.75)' },
  ], base({
    y: { position: 'left', ticks: { color: t.tick, font: { size: 10 }, maxTicksLimit: 6 }, grid: { color: t.grid } },
    y1: { position: 'right', min: 0, max: 100, ticks: { color: SERIES_PAL[1], font: { size: 10 }, stepSize: 20 }, grid: { drawOnChartArea: false } },
  }, ctx => ctx.parsed.y == null ? null : `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}`));

  // ② 이동평균선 위 종목 비율
  make('ah-c-ma', [
    line('20일선 위', cut(s.a20), SERIES_PAL[0], { borderWidth: 1.3 }), line('60일선 위', cut(s.a60), SERIES_PAL[1]), line('200일선 위', cut(s.a200), SERIES_PAL[2]),
    guide(70), guide(50), guide(30),
  ], base({ y: pct }, ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}%`));

  // ③ Breadth Score
  make('ah-c-score', [
    line('하루 점수', cut(s.score), SERIES_PAL[0] + '66', { borderWidth: 1.1 }), line('5일 평균', cut(s.ma5), SERIES_PAL[1], { borderWidth: 2.2 }),
    guide(70), guide(60), guide(50), guide(35),
  ], base({ y: pct }, ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}`));

  // ④ 기울기
  make('ah-c-slope', [
    line('5일 기울기', cut(s.s5), SERIES_PAL[0]), line('10일 기울기', cut(s.s10), SERIES_PAL[1]),
    guide(0), guide(10), guide(-10),
  ], base({ y: { ticks: { color: t.tick, font: { size: 10 }, maxTicksLimit: 7 }, grid: { color: t.grid } } },
    ctx => `${ctx.dataset.label}: ${_ahSigned(ctx.parsed.y)}`));
}
