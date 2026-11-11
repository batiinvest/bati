// flow-rank.js — DISCOVER '일별 수급' 페이지 (11-11)
// [원본] 태린이아빠 Market Dashboard '한국 일별 수급 동향 점검' (공개 소스 app.py run_korea_daily_flow)
//   그날 사모·투신·연기금·외국인이 '산 금액'(거래대금_매수 — 순매수가 아니다)을 종목 시가총액과 견준다.
//   대상 = 코스피·코스닥 보통주(스팩, 이름이 '리츠'로 끝나는 종목, 인프라·부동산 펀드 4개, 우선주 제외).
//   투자자마다 두 가지 순위를 전 종목에 매긴다 — 시총 대비(매수대금 ÷ 시가총액) · 절대 매수금액.
//     같은 값은 같은 순위(앞선 자리), 원본 make_rank_map 그대로.
//   기관 평균순위 = 사모·투신·연기금 세 순위의 산술평균(다시 순위 매기지 않음) → 평균이 작은 순, 같으면 시총 큰 순으로 50개.
//   나머지 표는 그 순위가 50위 안인 종목(같은 순위가 걸치면 50개를 넘을 수 있다 — 원본과 같다).
//   표 10개: ① 외국인 금액 ② 기관 시총 대비 평균 ③ 기관 금액 평균 / 사모·투신·연기금·외국인 시총 대비 4 + 사모·투신·연기금 금액 3.
// [원본과 다른 점] 업종 = WICS 업종(원본은 KRX 업종분류). 외국인 = 외국인 + 기타외국인(KIS와 같은 범위 —
//   원본은 KRX '외국인'만. 11-11 금액 50위 구성 같음, 시총 대비 50위 49 / 50). 원본은 장 마감 직후(16:20) 잠정치를
//   올리고, 우리는 18:42 · 20:40에 받아 시간외·대량매매까지 든 값이다.
// [추가 — 원본에 없음] 등락률 열, 표마다 '50위 안 업종' 한 줄(같은 표의 업종 개수를 센 것뿐), 날짜 고르기.
// 데이터: market_data(pef/trust/pension/foreign_buy_amt 백만원, market_cap 원, price_change_rate) ·
//   companies(name, market, wics_industry). 당일분 = 백엔드 collect_krx_buy.py(KRX), 전일까지 = collect_flow_empty.sync_buy(KIS).
// 의존: config.js (sb, fetchAllPages, escapeHtml, escAttr, loadingHTML, emptyHTML, errorHTML, fmtCap, chgColor,
//   wlBadge, loadWatchlistCodes, setAsOf)

const FR = {
  dates: [],      // 매수대금이 있는 거래일, 최신 → 과거
  date: null,
  comp: null,     // code → {name, market, ind}
  byDate: {},     // 날짜 → 계산 결과(Promise)
  who: 'pef',     // 투자자별 표: pef · trust · pension · foreign
  basis: 'cap',   // cap 시총 대비 · amt 매수 금액
};
const FR_WHO = {
  pef:     { label: '사모',   col: 'pef_buy_amt' },
  trust:   { label: '투신',   col: 'trust_buy_amt' },
  pension: { label: '연기금', col: 'pension_buy_amt' },
  foreign: { label: '외국인', col: 'foreign_buy_amt' },
};
const FR_INST = ['pef', 'trust', 'pension'];
const FR_TOP = 50;
const FR_PROBE = '005930';   // 날짜 목록용 — 매수대금이 늘 있는 종목
const FR_EXCLUDED = new Set(['KB발해인프라', '맥쿼리인프라', '맵스리얼티', '이리츠코크렙']);   // 원본 excluded_funds
const FR_PREF = /\d*우(?:B|C)?(?:\(전환\))?$/;                                              // 원본 preferred_ending

function pFlowRank() {
  return `
  <div class="fr-head">
    <span class="fr-lede">그날 사모·투신·연기금·외국인이 <b>산 금액</b>을 시가총액과 견줘, 돈이 세게 들어온 종목을 봅니다 — 순매수가 아닙니다.</span>
    <span class="fr-dates">
      <button class="btn btn-sm" id="fr-prev" onclick="stepFrDate(1)" title="하루 전">◀</button>
      <select id="fr-date" onchange="setFrDate(this.value)" aria-label="기준일"></select>
      <button class="btn btn-sm" id="fr-next" onclick="stepFrDate(-1)" title="하루 뒤">▶</button>
    </span>
  </div>
  <div id="fr-body">${loadingHTML('불러오는 중...')}</div>`;
}

async function loadFlowRank() {
  const body = document.getElementById('fr-body');
  if (!body) return;
  try {
    if (!FR.comp) {
      const [ds, comp] = await Promise.all([
        sb.from('market_data').select('base_date').eq('stock_code', FR_PROBE)
          .not('foreign_buy_amt', 'is', null).order('base_date', { ascending: false }).limit(120),
        fetchAllPages((a, b) => sb.from('companies').select('code,name,market,wics_industry')
          .eq('active', true).order('code').range(a, b)),
        loadWatchlistCodes(),
      ]);
      if (ds.error) throw ds.error;
      FR.dates = (ds.data || []).map(r => r.base_date);
      FR.comp = Object.fromEntries(comp.map(c => [c.code, { name: c.name, market: c.market, ind: c.wics_industry || '' }]));
    }
    if (!FR.dates.length) { body.innerHTML = emptyHTML('매수대금 데이터가 아직 없습니다'); return; }
    if (!FR.dates.includes(FR.date)) FR.date = FR.dates[0];
    _frDateUi();
    const date = FR.date;
    body.innerHTML = loadingHTML('불러오는 중...');
    const res = await _frLoadDate(date);
    if (date !== FR.date || !document.getElementById('fr-body')) return;   // 그사이 다른 날짜를 골랐거나 페이지를 떠남
    _frRender(res);
  } catch (e) {
    console.warn('[일별 수급]', e);
    body.innerHTML = errorHTML(e.message || '조회 실패');
  }
}

function setFrDate(d) { FR.date = d; loadFlowRank(); }
function stepFrDate(step) {
  const i = FR.dates.indexOf(FR.date) + step;   // dates는 최신 → 과거
  if (i >= 0 && i < FR.dates.length) setFrDate(FR.dates[i]);
}
function setFrWho(w) { FR.who = w; _frRenderBy(); }
function setFrBasis(b) { FR.basis = b; _frRenderBy(); }

function _frDateUi() {
  const sel = document.getElementById('fr-date');
  if (!sel) return;
  const wd = d => '일월화수목금토'[new Date(d + 'T00:00:00').getDay()];
  sel.innerHTML = FR.dates.map(d => `<option value="${d}"${d === FR.date ? ' selected' : ''}>${d} (${wd(d)})</option>`).join('');
  const i = FR.dates.indexOf(FR.date);
  const prev = document.getElementById('fr-prev'), next = document.getElementById('fr-next');
  if (prev) prev.disabled = i >= FR.dates.length - 1;
  if (next) next.disabled = i <= 0;
}

function _frLoadDate(date) {
  if (!FR.byDate[date]) {
    FR.byDate[date] = fetchAllPages((a, b) => sb.from('market_data')
      .select('stock_code,market_cap,price_change_rate,pef_buy_amt,trust_buy_amt,pension_buy_amt,foreign_buy_amt')
      .eq('base_date', date).order('stock_code').range(a, b))
      .then(rows => frCompute(rows, FR.comp))
      .catch(e => { delete FR.byDate[date]; throw e; });
  }
  return FR.byDate[date];
}

// 원본 keep_stock — 코스피·코스닥 보통주만
function _frKeep(code, name, market) {
  if (market !== 'KOSPI' && market !== 'KOSDAQ') return false;
  if (name.includes('스팩') || name.endsWith('리츠') || FR_EXCLUDED.has(name)) return false;
  if (FR_PREF.test(name) && '579KL'.includes(code.slice(-1))) return false;
  return true;
}

// 원본 make_rank_map — 큰 값이 1위, 같은 값은 같은 순위(앞선 자리)
function _frRankMap(vals) {
  const m = new Map();
  [...vals].sort((a, b) => b - a).forEach((v, i) => { if (!m.has(v)) m.set(v, i + 1); });
  return m;
}

// rows: market_data 한 날짜 전 종목, comp: code → {name, market, ind}
// 반환: { n, stocks: [{code, name, ind, cap, chg, buy:{who: 원}, pct:{who: %}, rc:{who}, ra:{who}, avgCap, avgAmt}] }
function frCompute(rows, comp) {
  const st = [];
  for (const r of rows) {
    const c = comp[r.stock_code], cap = +r.market_cap;
    if (!c || !(cap > 0) || !_frKeep(r.stock_code, c.name || '', c.market)) continue;
    const buy = {}, pct = {};
    for (const w in FR_WHO) {
      buy[w] = (+r[FR_WHO[w].col] || 0) * 1e6;   // 백만원 → 원
      pct[w] = buy[w] / cap * 100;
    }
    st.push({ code: r.stock_code, name: c.name, ind: c.ind, cap, chg: r.price_change_rate == null ? null : +r.price_change_rate,
              buy, pct, rc: {}, ra: {} });
  }
  for (const w in FR_WHO) {
    const rc = _frRankMap(st.map(s => s.pct[w])), ra = _frRankMap(st.map(s => s.buy[w]));
    st.forEach(s => { s.rc[w] = rc.get(s.pct[w]); s.ra[w] = ra.get(s.buy[w]); });
  }
  st.forEach(s => {
    s.avgCap = FR_INST.reduce((a, w) => a + s.rc[w], 0) / FR_INST.length;
    s.avgAmt = FR_INST.reduce((a, w) => a + s.ra[w], 0) / FR_INST.length;
  });
  return { n: st.length, stocks: st };
}

// 표에 올릴 종목 — 원본 top_avg_cap · top_avg_amt · top_ratio · top_amount
function frTopAvg(stocks, key) {
  return [...stocks].sort((a, b) => (a[key] - b[key]) || (b.cap - a.cap)).slice(0, FR_TOP);
}
function frTopBy(stocks, who, basis) {
  const rk = basis === 'cap' ? 'rc' : 'ra', vk = basis === 'cap' ? 'pct' : 'buy';
  return stocks.filter(s => s[rk][who] <= FR_TOP).sort((a, b) => (a[rk][who] - b[rk][who]) || (b[vk][who] - a[vk][who]));
}

// ── 그리기 ──────────────────────────────────────────────────────────────────
const _frEok = won => (won / 1e8).toLocaleString('ko-KR', { maximumFractionDigits: won >= 1e10 ? 0 : 1 });
// 시가총액 — 표 네 개가 나란히 놓여 칸이 좁다. 1조 이상은 '932.8조', 아래는 '9,270억'
const _frCap = won => won >= 1e12 ? (won / 1e12).toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '조'
  : Math.round(won / 1e8).toLocaleString('ko-KR') + '억';
const _frChg = v => v == null ? '<td class="ae-num">—</td>'
  : `<td class="ae-num" style="color:${chgColor(v)}">${v > 0 ? '+' : ''}${v.toFixed(2)}%</td>`;
// 순위 칸 — 1위가 가장 진하고 100위에서 사라진다(원본 표의 붉은 농도)
function _frRankTd(rank, digits = 0) {
  const a = rank <= 100 ? Math.round(8 + 47 * (1 - (rank - 1) / 99)) : 0;
  const bg = a ? `background:color-mix(in srgb, var(--up) ${a}%, transparent)` : '';
  return `<td class="fr-rank" style="${bg}">${digits ? rank.toFixed(digits) : rank}</td>`;
}
function _frNameTds(s) {
  return `<td class="ae-name" title="${escAttr(s.name)}"><span class="fr-nm">${escapeHtml(s.name)}</span>${wlBadge(s.code)}</td>
    <td class="fr-ind" title="${escAttr(s.ind)}">${escapeHtml(s.ind || '—')}</td>
    <td class="ae-num" title="${escAttr(fmtCap(s.cap))}">${_frCap(s.cap)}</td>`;
}
const _frTr = (s, cells) =>
  `<tr class="stock-row" data-stock-open="${escAttr(s.code)}" data-stock-name="${escAttr(s.name)}" data-stock-tab="market">${cells}</tr>`;

// 표에 오른 종목의 업종 개수 — 많은 순 5개
function _frSectors(list) {
  const cnt = {};
  list.forEach(s => { if (s.ind) cnt[s.ind] = (cnt[s.ind] || 0) + 1; });
  const top = Object.entries(cnt).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko')).slice(0, 5);
  if (!top.length) return '';
  return `<div class="fr-sec"><span class="fr-sec-k">이 표에 많은 업종</span>${top.map(([k, n]) =>
    `<span class="fr-sec-i">${escapeHtml(k)} <b>${n}</b></span>`).join('')}</div>`;
}

function _frCard(title, sub, list, head, row) {
  return `<div class="card fr-card">
    <div class="card-header"><span class="card-title">${title}</span><span class="card-sub">${sub}</span></div>
    ${_frSectors(list)}
    <div class="fr-scroll"><table class="ae-tbl fr-tbl"><thead><tr>${head}</tr></thead>
      <tbody>${list.map(row).join('')}</tbody></table></div>
  </div>`;
}

function _frRender(res) {
  const body = document.getElementById('fr-body');
  if (!body) return;
  FR.res = res;
  if (!res.n) { body.innerHTML = emptyHTML('이 날짜의 수급 데이터가 없습니다'); return; }
  const st = res.stocks;
  const TH = '<th>종목명</th><th class="fr-ind">업종</th><th class="ae-num">시가총액</th>';
  const fAmt = frTopBy(st, 'foreign', 'amt');
  const avgHead = TH + FR_INST.map(w => `<th class="fr-rank">${FR_WHO[w].label}</th>`).join('') + '<th class="fr-rank">평균</th>';
  const avgRow = (rk, key) => s => _frTr(s, _frNameTds(s) + FR_INST.map(w => _frRankTd(s[rk][w])).join('') + _frRankTd(s[key], 2));
  body.innerHTML = `
    <div class="fr-grid">
      ${_frCard('외국인 매수 금액', '절대 금액 50위', fAmt,
        '<th class="fr-rank">순위</th>' + TH + '<th class="ae-num">매수(억)</th><th class="ae-num">등락률</th>',
        s => _frTr(s, _frRankTd(s.ra.foreign) + _frNameTds(s) + `<td class="ae-num">${_frEok(s.buy.foreign)}</td>` + _frChg(s.chg)))}
      ${_frCard('기관 시총 대비 평균 순위', '사모·투신·연기금 세 순위의 평균', frTopAvg(st, 'avgCap'), avgHead, avgRow('rc', 'avgCap'))}
      ${_frCard('기관 매수 금액 평균 순위', '사모·투신·연기금 세 순위의 평균', frTopAvg(st, 'avgAmt'), avgHead, avgRow('ra', 'avgAmt'))}
      <div id="fr-by" class="fr-cell"></div>
    </div>
    <div class="fr-foot">
      매수대금 = 그날 그 투자자가 산 금액(판 금액은 빼지 않음). 시총 대비 = 매수대금 ÷ 시가총액. 순위는 코스피·코스닥 보통주
      ${res.n.toLocaleString()}종목(스팩·리츠·우선주 제외) 전체에서 매기고, 같은 값은 같은 순위입니다.
      기관 평균 순위는 사모·투신·연기금 세 순위를 그대로 평균한 값이라 소수가 나옵니다. 순위 칸은 1위에 가까울수록 붉습니다.
      외국인 = 외국인 + 기타외국인. 출처 KRX — 당일분은 18:42·20:40에 들어오고, 이후 거래소가 고친 값은 다음 날 반영됩니다.
      계산은 태린이아빠 대시보드 '한국 일별 수급 동향 점검'과 같습니다(업종만 WICS 분류).
    </div>`;
  _frRenderBy();
}

// 투자자별 표 — 투자자 × 기준 고르기
function _frRenderBy() {
  const el = document.getElementById('fr-by');
  if (!el || !FR.res) return;
  const who = FR.who, basis = FR.basis, W = FR_WHO[who];
  const rk = basis === 'cap' ? 'rc' : 'ra';
  const list = frTopBy(FR.res.stocks, who, basis);
  const chips = Object.keys(FR_WHO).map(w =>
    `<button class="chip chip-sm${w === who ? ' active' : ''}" onclick="setFrWho('${w}')">${FR_WHO[w].label}</button>`).join('');
  const bchips = [['cap', '시총 대비'], ['amt', '매수 금액']].map(([b, l]) =>
    `<button class="chip chip-sm${b === basis ? ' active' : ''}" onclick="setFrBasis('${b}')">${l}</button>`).join('');
  el.innerHTML = `<div class="card fr-card">
    <div class="card-header" style="flex-wrap:wrap;gap:6px 8px">
      <span class="card-title">투자자별 50위</span>
      <span class="fr-chips">${chips}<i class="fr-sep"></i>${bchips}</span>
    </div>
    ${_frSectors(list)}
    <div class="fr-scroll"><table class="ae-tbl fr-tbl"><thead><tr>
      <th class="fr-rank">순위</th><th>종목명</th><th class="fr-ind">업종</th><th class="ae-num">시가총액</th>
      <th class="ae-num">${W.label} 매수(억)</th><th class="ae-num">시총 대비</th><th class="ae-num">등락률</th></tr></thead>
      <tbody>${list.map(s => _frTr(s, _frRankTd(s[rk][who]) + _frNameTds(s)
        + `<td class="ae-num${basis === 'amt' ? ' fr-key' : ''}">${_frEok(s.buy[who])}</td>`
        + `<td class="ae-num${basis === 'cap' ? ' fr-key' : ''}">${s.pct[who].toFixed(3)}%</td>` + _frChg(s.chg))).join('')}</tbody>
    </table></div>
  </div>`;
}
