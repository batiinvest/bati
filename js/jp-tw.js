// jp-tw.js — RESEARCH '일본·대만 시세' 페이지 (11-12)
// [원본] 태린이아빠 Market Dashboard '일본과 대만 시세점검'(공개 소스 app.py JP_TW_MARKET_SRC)
//   일본 40 · 대만 57 = 97종목(AI·반도체 공급망)의 일간 · 5일 · 20일 수익률을 글로벌 테마 16개 · 나라별 업종 27개로 묶어
//   Breadth(오른 종목 비율)와 Strength Score = 0.4·일간 + 0.3·5일 + 0.2·20일 + 0.1·(Breadth − 50) ÷ 10 순으로 본다.
//   신호(커버리지 80% 이상 테마만): NEW ROTATION? 일간 > 1.5 ∧ 5일 ≤ 0 / HOT 일간 > 1 ∧ 5일 > 2 ∧ Breadth ≥ 70 /
//                                  STRONG TREND 5일 > 3 ∧ 20일 > 5.  테마마다 같이 볼 한국 관련주(Korea Watchlist).
// [원본과 다른 점] 원본은 표 여러 장 + 막대 그림. 여기는 테마 표를 눌러 구성 종목 · 한국 관련주를 옆에서 본다.
//   원본 '특별 감시판' 6개는 같은 이름의 테마와 종목이 같아 테마 상세로 대신한다(★ 표시). 계산은 백엔드 collect_jp_tw.py(원본 대조 일치).
// 데이터: market_snapshot(kind = 'jp_tw', payload) — 평일 16:40 · 18:20
// 의존: config.js (sb, escapeHtml, escAttr, chartTheme, SERIES_PAL, setAsOf), Chart.js

const JPTW = {
  p: null,            // payload
  theme: null,        // 고른 테마(영문 키)
  country: 'all',     // 종목 표 필터: all | Japan | Taiwan
  sort: ['d', -1],    // 종목 표 정렬: [키, 방향]
  kr: {},             // 한국 관련주 이름 → 종목 코드
  chart: null,
};

const JPTW_THEME_KO = {
  'MLCC / Electronic Components': 'MLCC·전자부품', 'Wafer Fab Equipment': '전공정 장비', 'AI Semiconductor Test': 'AI 반도체 테스트',
  'Advanced Packaging / Back-End': '첨단 패키징·후공정', 'Memory': '메모리', 'Custom ASIC / SoC': '맞춤형 ASIC·SoC',
  'AI Server': 'AI 서버', 'PCB / Substrate': 'PCB·기판', 'Optical / CPO': '광통신·CPO', 'Network': '네트워크',
  'Power Semiconductor': '전력 반도체', 'Data Center Power': '데이터센터 전력', 'Data Center Cooling': '데이터센터 냉각',
  'Foundry / IC': '파운드리·IC', 'Semiconductor Materials': '반도체 소재', 'Server Components': '서버 부품',
};
const JPTW_SECTOR_KO = {
  'MLCC / Components': 'MLCC·부품', 'Semiconductor Equipment': '반도체 장비', 'Semiconductor Test': '반도체 테스트',
  'Advanced Packaging / Back-End': '첨단 패키징·후공정', 'Optical / Cable': '광통신·케이블', 'Semiconductor Materials': '반도체 소재',
  'AI Substrate / PCB': 'AI 기판·PCB', 'Memory': '메모리', 'ASIC / SoC': 'ASIC·SoC', 'Power Semiconductor': '전력 반도체',
  'Data Center Power / Cooling': '데이터센터 전력·냉각', 'Foundry / IC': '파운드리·IC', 'OSAT / Packaging': 'OSAT·패키징',
  'AI Server ODM': 'AI 서버 ODM', 'PCB / Substrate': 'PCB·기판', 'Network': '네트워크', 'Optical / CPO': '광통신·CPO',
  'Server Power': '서버 전원', 'Advanced Cooling': '첨단 냉각', 'ASIC / Custom Silicon': 'ASIC·맞춤형 칩', 'Server Components': '서버 부품',
};
// 신호 코드 → [이름, 꾸밈 클래스, 조건]
const JPTW_SIGNAL = {
  NEW_ROTATION: ['새 순환 조짐?', 'rot', '일간 +1.5% 초과인데 5일은 0 이하'],
  HOT:          ['HOT', 'hot', '일간 +1% 초과 · 5일 +2% 초과 · Breadth 70% 이상'],
  STRONG_TREND: ['강한 추세', 'trend', '5일 +3% 초과 · 20일 +5% 초과'],
  NEUTRAL:      ['중립', '', ''],
};

function pJpTw() {
  return `
  <div class="jt-head">
    <div class="jt-lede">일본·대만의 <b>AI·반도체 공급망 97종목</b>을 테마로 묶어 어느 고리가 먼저 움직이는지 봅니다.
      한국 장과 같은 날 움직이는 이웃 시장이라, 테마가 강해지면 옆의 <b>한국 관련주</b>를 같이 확인합니다.</div>
    <div id="jt-asof" class="jt-asof"></div>
  </div>
  <div id="jt-body"><div class="jt-msg">불러오는 중...</div></div>`;
}

async function loadJpTw() {
  const body = document.getElementById('jt-body');
  if (!body) return;
  try {
    const { data, error } = await sb.from('market_snapshot').select('base_date,payload')
      .eq('kind', 'jp_tw').order('base_date', { ascending: false }).limit(1);
    if (error) throw error;
    if (!document.getElementById('jt-body')) return;
    JPTW.p = data?.[0]?.payload || null;
    if (!JPTW.p) {
      body.innerHTML = '<div class="jt-msg">아직 계산된 날이 없습니다 — 평일 16시 40분에 채워집니다.</div>';
      return;
    }
    if (!JPTW.theme || !JPTW.p.themes.some(t => t.theme === JPTW.theme)) JPTW.theme = JPTW.p.themes[0]?.theme || null;
    jtRender();
    jtLoadKorea();   // 한국 관련주 이름 → 코드(눌러서 종목 창 열기) — 늦게 와도 화면은 먼저 그린다
  } catch (e) {
    const missing = /42P01|PGRST205|does not exist|Could not find/.test(`${e?.code} ${e?.message}`);
    if (!missing) console.warn('[일본·대만 시세]', e);
    body.innerHTML = `<div class="jt-msg">${missing ? '준비 중 — 데이터 테이블이 아직 없습니다.'
      : '불러오지 못했습니다 — ' + escapeHtml(e.message || '조회 실패')}</div>`;
  }
}

function unloadJpTw() {
  if (JPTW.chart) { JPTW.chart.destroy(); JPTW.chart = null; }
}

async function jtLoadKorea() {
  const names = [...new Set(JPTW.p.themes.flatMap(t => t.korea || []))];
  if (!names.length) return;
  try {
    const { data } = await sb.from('companies').select('code,name').in('name', names);
    JPTW.kr = Object.fromEntries((data || []).map(r => [r.name, r.code]));
    if (document.getElementById('jt-detail')) jtRenderDetail();
  } catch (e) { /* 코드가 없어도 이름은 보인다 */ }
}

const _jtPct = (v, d = 2) => v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d) + '%';
const _jtNum = (v, d = 2) => v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d);
const _jtColor = v => v == null ? 'var(--text2)' : v > 0 ? 'var(--up)' : v < 0 ? 'var(--down)' : 'var(--text1)';
const _jtTd = (v, d = 2) => `<td class="jt-n" style="color:${_jtColor(v)}">${_jtPct(v, d)}</td>`;
const _jtMD = d => d ? `${+d.slice(5, 7)}/${+d.slice(8, 10)}` : '—';
const _jtCountry = c => `<i class="jt-c jt-${c === 'Japan' ? 'jp' : 'tw'}" title="${c === 'Japan' ? '일본' : '대만'}">${c === 'Japan' ? '일' : '대'}</i>`;
const _jtSector = s => { const k = s.replace(/^(Japan|Taiwan) - /, ''); return JPTW_SECTOR_KO[k] || k; };
const _jtSignal = code => {
  if (!code) return '<span class="jt-sig jt-sig-na" title="유효 종목이 80% 미만이라 신호를 매기지 않습니다">＊</span>';
  const [name, cls, rule] = JPTW_SIGNAL[code] || JPTW_SIGNAL.NEUTRAL;
  return `<span class="jt-sig${cls ? ' jt-sig-' + cls : ''}"${rule ? ` title="${escAttr(rule)}"` : ''}>${name}</span>`;
};
// 가운데 0 막대 — max는 그 열의 가장 큰 절댓값
const _jtBar = (v, max) => v == null ? '' :
  `<span class="jt-bar"><i style="${v >= 0 ? 'left:50%' : 'right:50%'};width:${(Math.min(Math.abs(v) / (max || 1), 1) * 50).toFixed(1)}%;background:${_jtColor(v)}"></i></span>`;

function jtRender() {
  const p = JPTW.p, body = document.getElementById('jt-body');
  if (!body || !p) return;
  const asof = document.getElementById('jt-asof');
  if (asof) asof.innerHTML = `<b>일본 ${_jtMD(p.asof.Japan)} · 대만 ${_jtMD(p.asof.Taiwan)} 종가</b> · 유효 ${p.valid} / ${p.total}종목`;
  const special = new Set(Object.values(p.special || {}).map(names => [...names].sort().join('|')));
  const isSpecial = t => special.has([...(t.members || [])].sort().join('|'));
  const maxScore = Math.max(...p.themes.map(t => Math.abs(t.score ?? 0)), 0.01);
  const hot = p.themes.filter(t => t.signal && t.signal !== 'NEUTRAL');

  body.innerHTML = `
    <div class="jt-top">
      <div class="card">
        <div class="card-header" style="flex-wrap:wrap;gap:6px">
          <span class="card-title">테마 강도</span>
          <span class="card-sub">Strength Score 높은 순 · 눌러서 구성 종목 보기</span>
          <span class="jt-hot">${hot.length ? hot.map(t => `${escapeHtml(JPTW_THEME_KO[t.theme] || t.theme)} ${_jtSignal(t.signal)}`).join(' ') : '오늘 신호가 켜진 테마 없음'}</span>
        </div>
        <div class="table-wrap"><table class="jt-tbl jt-themes">
          <thead><tr><th>테마</th><th>신호</th><th>일간</th><th>5일</th><th>20일</th><th title="일간 수익률이 오른 종목 비율">Breadth</th><th colspan="2">Strength</th><th>종목</th></tr></thead>
          <tbody>${p.themes.map(t => `
            <tr class="${t.theme === JPTW.theme ? 'on' : ''}${t.complete ? '' : ' jt-part'}" data-jt-theme="${escAttr(t.theme)}" tabindex="0" role="button" aria-pressed="${t.theme === JPTW.theme}">
              <td class="jt-name">${escapeHtml(JPTW_THEME_KO[t.theme] || t.theme)}${isSpecial(t) ? '<sup title="원본 특별 감시판">★</sup>' : ''}</td>
              <td>${_jtSignal(t.signal)}</td>
              ${_jtTd(t.d)}${_jtTd(t.f)}${_jtTd(t.m)}
              <td class="jt-n">${t.b == null ? '—' : `<span class="jt-br"><i style="width:${t.b.toFixed(0)}%"></i></span>${t.b.toFixed(0)}%`}</td>
              <td class="jt-barcell">${_jtBar(t.score, maxScore)}</td>
              <td class="jt-n" style="color:${_jtColor(t.score)}"><b>${_jtNum(t.score)}</b></td>
              <td class="jt-n jt-cnt">${t.n}/${t.total}</td>
            </tr>`).join('')}</tbody>
        </table></div>
      </div>
      <div class="card" id="jt-detail"></div>
    </div>

    <div class="card" style="margin-top:1rem">
      <div class="card-header" style="flex-wrap:wrap;gap:6px">
        <span class="card-title">테마 추세</span>
        <span class="card-sub">Strength 상위 8개 · 최근 ${p.curve?.dates?.length || 0}거래일 · 첫날 = 100</span>
      </div>
      <div id="jt-curve-wrap">${p.curve?.dates?.length ? `<div class="jt-curve"><canvas id="jt-curve" role="img" aria-label="상위 테마의 최근 주가 흐름"></canvas></div><div class="jt-legend" id="jt-legend"></div>`
        : '<div class="jt-msg">추세를 그릴 테마가 없습니다(유효 종목 80% 이상인 테마가 필요).</div>'}</div>
    </div>

    <div class="jt-bottom">
      <div class="card">
        <div class="card-header" style="flex-wrap:wrap;gap:6px">
          <span class="card-title">종목</span>
          <span class="card-sub">열 이름을 누르면 정렬</span>
          <div style="display:flex;gap:4px;margin-left:auto">
            ${[['all', '전체'], ['Japan', '일본'], ['Taiwan', '대만']].map(([k, n]) =>
              `<button class="chip chip-sm${JPTW.country === k ? ' active' : ''}" data-jt-country="${k}">${n}</button>`).join('')}
          </div>
        </div>
        <div class="jt-scroll" id="jt-stocks"></div>
      </div>
      <div class="card">
        <div class="card-header" style="flex-wrap:wrap;gap:6px">
          <span class="card-title">나라별 업종</span>
          <span class="card-sub">Strength Score 높은 순</span>
        </div>
        <div class="jt-scroll"><table class="jt-tbl">
          <thead><tr><th>업종</th><th>일간</th><th>5일</th><th>20일</th><th>Breadth</th><th>Strength</th><th>종목</th></tr></thead>
          <tbody>${p.sectors.map(s => `<tr class="${s.complete ? '' : 'jt-part'}">
            <td class="jt-name">${_jtCountry(s.country)}${escapeHtml(_jtSector(s.sector))}</td>
            ${_jtTd(s.d)}${_jtTd(s.f)}${_jtTd(s.m)}
            <td class="jt-n">${s.b == null ? '—' : s.b.toFixed(0) + '%'}</td>
            <td class="jt-n" style="color:${_jtColor(s.score)}"><b>${_jtNum(s.score)}</b></td>
            <td class="jt-n jt-cnt">${s.n}/${s.total}</td></tr>`).join('')}</tbody>
        </table></div>
      </div>
    </div>
    <div class="jt-foot">
      <b>읽는 법</b> — 5일 · 20일 = 그 나라의 5번째 · 20번째 앞 거래일 종가 대비. Breadth = 그날 오른 종목 비율.
      Strength Score = 0.4 × 일간 + 0.3 × 5일 + 0.2 × 20일 + 0.1 × (Breadth − 50) ÷ 10.<br>
      <b>신호</b> — ${Object.values(JPTW_SIGNAL).filter(s => s[2]).map(s => `<span class="jt-sig jt-sig-${s[1]}">${s[0]}</span> ${s[2]}`).join(' · ')}.
      유효 종목이 80%에 못 미치는 테마·업종은 흐리게 두고 신호를 매기지 않습니다(＊). ★ = 원본 특별 감시판과 같은 종목 묶음.
      야후 일봉(배당 미반영 종가) 기준, 장이 끝난 뒤 계산합니다. 태린이아빠 '일본과 대만 시세점검'과 같은 계산.
    </div>`;

  body.querySelectorAll('[data-jt-theme]').forEach(tr => {
    const pick = () => { JPTW.theme = tr.dataset.jtTheme; body.querySelectorAll('[data-jt-theme]').forEach(x => { const on = x === tr; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); }); jtRenderDetail(); };
    tr.addEventListener('click', pick);
    tr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
  });
  body.querySelectorAll('[data-jt-country]').forEach(b => b.addEventListener('click', () => {
    JPTW.country = b.dataset.jtCountry;
    body.querySelectorAll('[data-jt-country]').forEach(x => x.classList.toggle('active', x === b));
    jtRenderStocks();
  }));
  jtRenderDetail();
  jtRenderStocks();
  jtRenderCurve();
}

// 종목 표 한 줄 — withSector: 업종 열을 넣을지
function _jtStockRow(s, withSector) {
  return `<tr class="${s.ok ? '' : 'jt-part'}"${s.ok ? '' : ` title="${escAttr(`기준일 ${s.asof || '없음'} — 최신 거래일 값이 없어 평균·순위에서 뺐습니다`)}"`}>
    <td class="jt-name">${_jtCountry(s.c)}${escapeHtml(s.n)}<small>${escapeHtml(s.t.replace(/\.(TWO|TW|T)$/, ''))}</small></td>
    ${withSector ? `<td class="jt-sec">${escapeHtml(_jtSector(s.s))}</td>` : ''}
    <td class="jt-n">${s.last == null ? '—' : s.last.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
    ${_jtTd(s.d)}${_jtTd(s.f)}${_jtTd(s.m)}</tr>`;
}

function jtRenderDetail() {
  const box = document.getElementById('jt-detail'), p = JPTW.p;
  if (!box || !p) return;
  const t = p.themes.find(x => x.theme === JPTW.theme);
  if (!t) { box.innerHTML = ''; return; }
  const members = (t.members || []).map(n => p.stocks.find(s => s.n === n)).filter(Boolean)
    .sort((a, b) => (b.d ?? -Infinity) - (a.d ?? -Infinity));        // 원본 특별 감시판: 일간 높은 순
  const up = members.filter(s => s.ok && s.d > 0).length;
  box.innerHTML = `
    <div class="card-header" style="flex-wrap:wrap;gap:6px">
      <span class="card-title">${escapeHtml(JPTW_THEME_KO[t.theme] || t.theme)}</span>
      <span class="card-sub">${escapeHtml(t.theme)}</span>
      <span style="margin-left:auto">${_jtSignal(t.signal)}</span>
    </div>
    <div class="jt-kpis">
      ${[['일간', _jtPct(t.d), t.d], ['5일', _jtPct(t.f), t.f], ['20일', _jtPct(t.m), t.m], ['Strength', _jtNum(t.score), t.score]]
        .map(([k, v, raw]) => `<div><span>${k}</span><b style="color:${_jtColor(raw)}">${v}</b></div>`).join('')}
      <div><span>오른 종목</span><b>${up} / ${t.n}</b></div>
    </div>
    <div class="jt-kr">
      <span class="jt-kr-h">같이 볼 한국 관련주</span>
      ${(t.korea || []).map(n => JPTW.kr[n]
        ? `<span class="jt-chip jt-chip-link" role="button" tabindex="0" data-stock-open="${escAttr(JPTW.kr[n])}" data-stock-name="${escAttr(n)}">${escapeHtml(n)}</span>`
        : `<span class="jt-chip">${escapeHtml(n)}</span>`).join('') || '<span class="jt-chip">—</span>'}
    </div>
    <div class="table-wrap"><table class="jt-tbl">
      <thead><tr><th>구성 종목 (일간 높은 순)</th><th>종가</th><th>일간</th><th>5일</th><th>20일</th></tr></thead>
      <tbody>${members.map(s => _jtStockRow(s, false)).join('')}</tbody>
    </table></div>`;
  // 관련주 칩은 span이라(종목 열기 위임이 button 안쪽 클릭은 건너뛴다) Enter·Space로도 열리게 한다
  box.querySelectorAll('.jt-chip-link').forEach(c => c.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); c.click(); }
  }));
}

function jtRenderStocks() {
  const box = document.getElementById('jt-stocks'), p = JPTW.p;
  if (!box || !p) return;
  const [key, dir] = JPTW.sort;
  const rows = p.stocks.filter(s => JPTW.country === 'all' || s.c === JPTW.country)
    .sort((a, b) => ((a[key] ?? (dir < 0 ? -Infinity : Infinity)) - (b[key] ?? (dir < 0 ? -Infinity : Infinity))) * dir);
  const th = (k, name) => `<th class="jt-sort${key === k ? ' on' : ''}" data-jt-sort="${k}" tabindex="0" role="button" aria-label="${name} 정렬">${name}${key === k ? (dir < 0 ? ' ↓' : ' ↑') : ''}</th>`;
  box.innerHTML = `<table class="jt-tbl">
    <thead><tr><th>종목 ${rows.length}</th><th>업종</th><th>종가</th>${th('d', '일간')}${th('f', '5일')}${th('m', '20일')}</tr></thead>
    <tbody>${rows.map(s => _jtStockRow(s, true)).join('')}</tbody></table>`;
  box.querySelectorAll('[data-jt-sort]').forEach(h => {
    const go = () => { const k = h.dataset.jtSort; JPTW.sort = [k, JPTW.sort[0] === k ? -JPTW.sort[1] : -1]; jtRenderStocks(); };
    h.addEventListener('click', go);
    h.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
}

function jtRenderCurve() {
  const cv = document.getElementById('jt-curve'), p = JPTW.p;
  unloadJpTw();
  if (!cv || !p?.curve?.dates?.length) return;
  const names = Object.keys(p.curve.series);
  const t = chartTheme();
  JPTW.chart = new Chart(cv.getContext('2d'), {
    type: 'line',
    data: {
      labels: p.curve.dates,
      datasets: names.map((n, i) => ({
        label: JPTW_THEME_KO[n] || n, data: p.curve.series[n],
        borderColor: SERIES_PAL[i % SERIES_PAL.length], backgroundColor: SERIES_PAL[i % SERIES_PAL.length],
        borderWidth: 1.8, pointRadius: 0, pointHoverRadius: 4, tension: 0.15, spanGaps: true,
      })),
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { itemSort: (a, b) => b.parsed.y - a.parsed.y, callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}` } },
      },
      scales: {
        x: { ticks: { color: t.tick, font: { size: 10 }, maxTicksLimit: 8, maxRotation: 0, callback: function (v) { return _jtMD(this.getLabelForValue(v)); } }, grid: { color: t.grid } },
        y: { ticks: { color: t.tick, font: { size: 10 }, maxTicksLimit: 6 }, grid: { color: ctx => ctx.tick.value === 100 ? 'rgba(168,173,196,.55)' : t.grid } },
      },
    },
  });
  const lg = document.getElementById('jt-legend');
  if (lg) lg.innerHTML = names.map((n, i) => {
    const s = p.curve.series[n], last = s[s.length - 1];
    return `<span><i style="background:${SERIES_PAL[i % SERIES_PAL.length]}"></i>${escapeHtml(JPTW_THEME_KO[n] || n)} <b style="color:${_jtColor(last == null ? null : last - 100)}">${last == null ? '—' : last.toFixed(1)}</b></span>`;
  }).join('');
}
