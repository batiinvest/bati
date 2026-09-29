/**
 * sector-lead.js — 오늘의 시황 '주도 업종 · 돈이 몰리는 곳' 카드
 *
 * 태린이아빠 국내 전략 ① 주도 업종 — 2026-09-19 영상 「1년간 미장에서 52주 신고가 전략…업그레이드」
 * 1:30~7:00, 2026-09-25 영상 1:00~1:35.
 *   ① 모멘텀 = 6개월 수익률 ÷ 하방 표준편차 (FnGuide WICS 중분류 지수)
 *   ② 매수   = 사모·투신·연금·외국인 매수 순위, 최근 20거래일 (2024-10 영상 "이때 매수만 본다")
 *   주도 업종 = ① 상위 10 ∩ ② 상위 10 (WICS 중분류 28개)
 * 계산은 백엔드(collect_leading.py, 평일 18:50)가 하고 leading_sectors에 적는다. 이 카드는 읽기만 한다.
 * 기업분석 표의 '주도 업종' 보드·'빈집' 열과 같은 데이터다.
 *
 * '업종 수급' 열 = 업종 수급 오실레이터(collect_sector_flow.py → sector_flow_osc) — 원본 「외국인기관수급
 *   오실레이터 (업종)」: 업종 5일 (외국인+기관) 순매수 ÷ 시가총액의 MACD − 시그널, 63거래일 안 수급 칸.
 *   칸을 누르면 원본 차트처럼 업종 시가총액 + 오실레이터를 펼친다.
 *
 * 09-29 업종 보드 통일(WICS 중분류 28개) — 옛 '산업별 수급동향'(자체 산업 분류·4사분면) 카드를 없애고
 * 태린이아빠 자료로 대체한 줄·열을 이 카드에 모았다.
 *   머리 줄: 업종 쏠림지수(「특정업종 쏠림지수 국내」) · 업종 국면(120일선 위 업종 비율 —
 *            「업종지수 활용한 추세 및 비추세 전략」)  ← sector_market_daily (collect_sector_market.py)
 *   열: 오늘(WICS 지수 등락) · 거래대금·연·사·투(「외국인기관수급오실레이터 (업종)」 업종비중 = 관심도)
 *       ← leading_sectors 확장 컬럼 (collect_leading.py)
 *
 * 의존: sb, chgColor, escapeHtml, escAttr, escJsStr, loadingHTML, _ICO, fmtTV, flowGauge·flowGaugeBar·
 *       flowGaugeTip·FLOW_LEVEL_NAMES·chartTheme (config.js), Chart.js
 *       FIN (financials.js — 업종 클릭 시 기업분석 표를 그 중분류로 걸러 연다)
 */

// ── 상태 네임스페이스 (window._* 금지 규약) ─────────────────────────────────
const SL = {
  rows:    null,    // leading_sectors 행 (판정일 1일치)
  date:    null,    // 판정일
  showAll: false,   // 전체 업종 보기
  sortCol: 'lead',  // 정렬 기준
  sortDir: 1,
  osc:     null,    // 업종 수급 오실레이터 {mid_code: {ALL|KOSPI|KOSDAQ: sector_flow_osc 행}} (최신일)
  oscDate: null,
  open:    null,    // 차트를 펼친 중분류 코드
  oscMkt:  'ALL',   // 펼친 차트의 시장
  chart:   null,
  mkt:     null,    // sector_market_daily 최근 행들(오름차순) — 쏠림지수·국면
  ext:     false,   // leading_sectors 확장 컬럼(오늘·관심도)이 채워져 있나
  ncol:    12,      // 표 열 수 — 펼친 차트 행의 colspan
};

// 업종 국면 — 120일선 위 업종 비율 (원본 전략 v2.1의 Breadth 구간)
const _SL_REGIME = {
  trend:   { label: '추세',   color: '#f5365c', tip: '120일선 위 업종 60% 이상 — 원본 전략: 6개월 상대강도 상위 업종을 따라가는 국면' },
  range:   { label: '비추세', color: '#fb6340', tip: '40~60% — 원본 전략: 상대강도 상위 업종의 강도에 따라 비중을 나누는 국면' },
  recover: { label: '회복',   color: '#2AABEE', tip: '30~40% — 원본 전략: 과거 주도 업종 중 120일선 위로 올라와 눌린 업종을 보는 국면' },
  contra:  { label: '역추세', color: '#4a9eff', tip: '30% 미만 — 원본 전략: 과매도 반등을 보는 국면' },
};

const _SL_TOP = 10;   // collect_leading LEAD_MOM_TOP·LEAD_BUY_TOP과 같게 — 바꾸면 둘 다
const _SL_TAG = {
  lead: { txt: '주도',   color: '#f59e0b', bg: 'rgba(245,158,11,.16)', tip: `모멘텀 상위 ${_SL_TOP} ∩ 매수 상위 ${_SL_TOP} — 태린이아빠 주도 업종` },
  mom:  { txt: '모멘텀', color: 'var(--tg)', bg: 'rgba(42,171,238,.12)', tip: `6개월 수익률 ÷ 하방 표준편차 상위 ${_SL_TOP}` },
  buy:  { txt: '매수',   color: '#2dce89', bg: 'rgba(45,206,137,.13)', tip: `사모·투신·연금·외국인 매수 상위 ${_SL_TOP} (최근 20거래일)` },
};

function pSectorLead() {
  return `
  <div class="card" style="margin-bottom:12px">
    <div class="card-header" style="flex-wrap:wrap;gap:6px">
      <span class="card-title">${_ICO.chart}주도 업종 · 돈이 몰리는 곳</span>
      <span id="sl-date" class="card-sub"></span>
      <button id="sl-all-btn" class="chip chip-sm" style="margin-left:auto" onclick="toggleSlAll()">전체 업종</button>
    </div>
    <div id="sl-body">${loadingHTML('주도 업종 불러오는 중...')}</div>
  </div>`;
}

async function loadSectorLead() {
  const el = document.getElementById('sl-body');
  if (!el) return;
  try {
    const { data: d, error: e1 } = await sb.from('leading_sectors').select('base_date')
      .order('base_date', { ascending: false }).limit(1);
    // 테이블은 sql/leading_sectors.sql 실행 후 생긴다 — 그 전엔 준비 중 안내
    if (e1?.code === 'PGRST205' || e1?.code === '42P01') { el.innerHTML = _slMsg('주도 업종 계산을 준비하고 있습니다'); return; }
    if (e1) throw e1;
    const date = d?.[0]?.base_date;
    if (!date) { el.innerHTML = _slMsg('주도 업종 계산을 준비하고 있습니다 (평일 18:50 갱신)'); return; }

    const { data: rows, error } = await sb.from('leading_sectors').select('*').eq('base_date', date);
    if (error) throw error;
    SL.rows = rows || [];
    SL.date = date;
    SL.ext = SL.rows.some(r => r.tv_now != null);
    await Promise.all([_slLoadOsc(), _slLoadMkt()]);
    _renderSectorLead();
  } catch (e) {
    console.warn('[주도업종]', e);
    el.innerHTML = _slMsg('주도 업종을 불러오지 못했습니다');
  }
}

// 업종 수급 오실레이터 — 최신일 전 업종·시장. 표가 없으면(sql/sector_flow.sql 전) 열만 비운다
async function _slLoadOsc() {
  SL.osc = null;
  try {
    const { data: d, error } = await sb.from('sector_flow_osc').select('base_date')
      .order('base_date', { ascending: false }).limit(1);
    if (error || !d?.[0]) return;
    const { data: rows, error: e2 } = await sb.from('sector_flow_osc')
      .select('mid_code,market,osc,pct,gauge,stage,cover').eq('base_date', d[0].base_date);
    if (e2) return;
    SL.osc = {};
    (rows || []).forEach(r => { (SL.osc[r.mid_code] ||= {})[r.market] = r; });
    SL.oscDate = d[0].base_date;
  } catch (e) { console.warn('[업종수급]', e); }
}

// 업종 쏠림지수·국면 — 최근 60거래일(스파크라인·방향). 표가 없으면(sql/sector_board.sql 전) 줄만 뺀다
async function _slLoadMkt() {
  SL.mkt = null;
  try {
    const { data, error } = await sb.from('sector_market_daily')
      .select('base_date,osc,corr30,breadth,n_above,n_sectors,regime,top5')
      .order('base_date', { ascending: false }).limit(60);
    if (error || !data?.length) return;
    SL.mkt = data.reverse();
  } catch (e) { console.warn('[업종쏠림]', e); }
}

// 카드 머리 두 줄 — 업종 쏠림지수 · 업종 국면
function _slMarketLines(nameOf) {
  const rows = (SL.mkt || []).filter(r => r.osc != null);
  if (!rows.length) return '';
  const last = rows[rows.length - 1], prev = rows[rows.length - 2];
  const up = prev && last.osc > prev.osc;
  const sign = v => (v >= 0 ? '+' : '') + Number(v).toFixed(2);
  const spTip = '원본 「특정업종 쏠림지수 국내」: 매일 업종 등락률 1~5위 합 − 나머지 합을 누적한 선의 MACD − 시그널. '
    + '선이 오르면 특정 업종으로 자금이 쏠리는 것, 내리면 여러 업종이 돌아가며 오르는 장(수익 내기 쉬운 장). '
    + '지나치게 내려가면 다시 특정 업종 쏠림 가능성을, 시장이 빠지는데 일부 업종만 버텨도 오른다.'
    + (last.corr30 != null ? ` · 업종·시장(코스피200 동일가중) 30일 상관 평균 ${Number(last.corr30).toFixed(2)}` : '');
  const top = (last.top5 || []).map(c => nameOf[c] || c).join(' · ');
  const rg = _SL_REGIME[last.regime];
  const pctA = last.n_sectors ? Math.round(last.n_above / last.n_sectors * 100) : null;
  return `
    <div style="padding:8px 12px 2px;font-size:calc(12.5px*var(--m-sub));line-height:1.8;border-bottom:1px dashed var(--border)">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap" title="${escAttr(spTip)}">
        <b style="color:var(--text1)">업종 쏠림지수</b>
        <span style="display:inline-block">${_slSparkSvg(rows.map(r => Number(r.osc)), up ? '#f59e0b' : '#2AABEE')}</span>
        <b style="font-variant-numeric:tabular-nums;color:${up ? '#f59e0b' : '#2AABEE'}">${sign(last.osc)} ${up ? '↑' : '↓'}</b>
        <span style="color:var(--text1)">${up ? '특정 업종으로 쏠리는 중' : '여러 업종이 돌아가며 오르는 중'}</span>
        ${top ? `<span style="color:var(--text3)">· 오늘 등락 상위 5 ${escapeHtml(top)}</span>` : ''}
      </div>
      ${rg ? `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap" title="${escAttr(rg.tip + ' (원본 「업종지수 활용한 추세 및 비추세 전략」 — 구간 60·40·30%)')}">
        <b style="color:var(--text1)">업종 국면</b>
        <span style="color:${rg.color};font-weight:700">${rg.label}</span>
        <span style="color:var(--text2)">120일선 위 업종 ${last.n_above}/${last.n_sectors}${pctA != null ? ` (${pctA}%)` : ''}</span>
        <span style="color:var(--text3)">${last.base_date} 기준</span>
      </div>` : ''}
    </div>`;
}

const _SL_MKT = { ALL: '합산', KOSPI: '코스피', KOSDAQ: '코스닥' };

function _slGauge(mid, mkt = 'ALL') {
  const o = SL.osc?.[mid]?.[mkt];
  return o?.gauge ? { o, gg: flowGauge(o.gauge) } : null;
}

const _slMsg = msg =>
  `<div style="padding:1.5rem 1rem;text-align:center;color:var(--text2);font-size:calc(13px*var(--m-body))">${escapeHtml(msg)}</div>`;

function _slSparkSvg(vals, color) {
  if (!Array.isArray(vals) || vals.length < 2) return '<span style="color:var(--text3)">—</span>';
  const W = 72, H = 20, lo = Math.min(...vals), hi = Math.max(...vals), rg = (hi - lo) || 1;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1) * W).toFixed(1)},${(H - 1 - (v - lo) / rg * (H - 2)).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="display:block" xmlns="http://www.w3.org/2000/svg">`
    + `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.3"/></svg>`;
}

function _slTag(r) {
  const m = r.mom_rank != null && r.mom_rank <= _SL_TOP, b = r.buy_rank != null && r.buy_rank <= _SL_TOP;
  return r.leading ? 'lead' : m ? 'mom' : b ? 'buy' : null;
}

function _renderSectorLead() {
  const el = document.getElementById('sl-body');
  if (!el || !SL.rows) return;
  const rows = SL.rows;
  rows.forEach(r => { r._tag = _slTag(r); });
  const nM = rows[0]?.n_sectors || rows.length;
  const nB = rows.filter(r => r.buy_rank != null).length;

  const dEl = document.getElementById('sl-date');
  if (dEl) dEl.textContent = `판정 ${SL.date}`;
  const btn = document.getElementById('sl-all-btn');
  if (btn) { btn.classList.toggle('active', SL.showAll); btn.textContent = SL.showAll ? '상위만' : `전체 업종 ${rows.length}`; }

  const leads = rows.filter(r => r.leading).sort((a, b) => a.mom_rank - b.mom_rank);
  const topM  = rows.filter(r => r.mom_rank != null && r.mom_rank <= _SL_TOP).sort((a, b) => a.mom_rank - b.mom_rank);
  const topB  = rows.filter(r => r.buy_rank != null && r.buy_rank <= _SL_TOP).sort((a, b) => a.buy_rank - b.buy_rank);
  const nameBtn = r => `<span style="cursor:pointer;text-decoration:underline dotted;text-underline-offset:3px" `
    + `onclick="goSectorStocks('${escJsStr(r.name)}')" title="기업분석 표에서 이 업종 종목 보기">${escapeHtml(r.name)}</span>`;
  const nameOf = Object.fromEntries(rows.map(r => [r.mid_code, r.name]));
  rows.forEach(r => {
    r._tv5  = r.tv_now != null && r.tv_avg5 ? r.tv_now / r.tv_avg5 - 1 : null;
    r._buy5 = r.buy3_now != null && r.buy3_avg5 ? r.buy3_now / r.buy3_avg5 - 1 : null;
  });
  const summary = _slMarketLines(nameOf) + `
    <div style="padding:8px 12px 6px;font-size:calc(12.5px*var(--m-sub));line-height:1.7">
      <div><b style="color:${_SL_TAG.lead.color}">주도 업종</b>
        <span style="color:var(--text3)">(모멘텀 상위 ${_SL_TOP} ∩ 매수 상위 ${_SL_TOP})</span>
        ${leads.length ? leads.map(r => `<b style="color:var(--text1)">${nameBtn(r)}</b>`).join(' · ')
                       : '<span style="color:var(--text2)">교집합 없음 — 아래 두 목록을 따로 보세요</span>'}</div>
      <div style="color:var(--text2)"><span style="color:${_SL_TAG.mom.color}">모멘텀 상위 ${topM.length}</span> ${topM.map(nameBtn).join(' · ')}</div>
      <div style="color:var(--text2)"><span style="color:${_SL_TAG.buy.color}">매수 상위 ${topB.length}</span> ${topB.map(nameBtn).join(' · ')}</div>
    </div>`;

  // 표 — 기본은 주도·모멘텀·매수 상위만, '전체 업종'이면 전부
  const list = (SL.showAll ? rows.slice() : rows.filter(r => r._tag)).sort(_slCmp);
  const th = (key, label, tip, align = 'right') =>
    `<th onclick="sortSl('${key}')" title="${escAttr(tip || '')}" style="cursor:pointer;text-align:${align};padding:6px 8px;white-space:nowrap;font-weight:600;color:var(--text2);font-size:calc(11px*var(--m-label))">${label}${SL.sortCol === key ? (SL.sortDir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
  const td = (html, align = 'right', extra = '') => `<td style="padding:5px 8px;text-align:${align};white-space:nowrap;${extra}">${html}</td>`;
  const pct = (v, d = 1) => v == null ? '—' : `${v >= 0 ? '+' : ''}${Number(v).toFixed(d)}%`;
  const ma = v => v ? '<span style="color:var(--text1)">●</span>' : '<span style="color:var(--text3)">○</span>';
  const body = list.map(r => {
    const t = r._tag ? _SL_TAG[r._tag] : null;
    return `<tr style="border-top:1px solid var(--border)">
      ${td(t ? `<span title="${escAttr(t.tip)}" style="font-size:calc(10.5px*var(--m-label));font-weight:700;color:${t.color};background:${t.bg};border-radius:4px;padding:1px 6px">${t.txt}</span>` : '', 'center')}
      ${td(nameBtn(r), 'left', 'font-weight:600;color:var(--text1)')}
      ${SL.ext ? td(`<span style="color:${chgColor(r.ret_1d)}">${pct(r.ret_1d, 2)}</span>`) : ''}
      ${td(_slSparkSvg(r.spark, chgColor(r.ret_6m)), 'center')}
      ${td(`<span style="color:${chgColor(r.ret_6m)}">${pct(r.ret_6m)}</span>`)}
      ${td(r.mom_rank != null ? `${r.mom_rank}<span style="color:var(--text3)">/${nM}</span>` : '—', 'right',
           `title="${escAttr(`수익률 ÷ 하방 표준편차 = ${r.score ?? '—'} (하방 표준편차 ${r.down_dev ?? '—'}%)`)}"`)}
      ${td(r.buy_rank != null ? `${r.buy_rank}<span style="color:var(--text3)">/${nB}</span>` : '—')}
      ${SL.ext ? td(_slTvCell(r), 'right', `title="${escAttr(_slTvTip(r))}"`) : ''}
      ${SL.ext ? td(_slBuyCell(r), 'right', `title="${escAttr(_slBuyTip(r))}"`) : ''}
      ${td(`${ma(r.above_ma11)} ${ma(r.above_ma20)} ${ma(r.above_ma50)}`, 'center')}
      ${td(r.flow_pos_days != null ? `${r.flow_pos_days}<span style="color:var(--text3)">/${r.flow_days ?? 20}일</span>` : '—')}
      ${td(r.newhigh_5d ?? 0)}
      ${SL.osc ? td(_slFlowCell(r), 'left') : ''}
      ${td(`${r.n_empty ?? '—'}<span style="color:var(--text3)"> · </span><span style="color:#2dce89">${r.n_start ?? '—'}</span>`, 'right', 'title="빈집 종목 · 이제 시작 종목"')}
      ${td(r.n_stocks ?? '—', 'right', 'color:var(--text3)')}
    </tr>${SL.open === r.mid_code ? _slOscRow(r) : ''}`;
  }).join('');

  SL.ncol = 11 + (SL.osc ? 1 : 0) + (SL.ext ? 3 : 0);
  el.innerHTML = summary + `
    <div style="overflow-x:auto">
      <table style="width:100%;min-width:${760 + (SL.osc ? 120 : 0) + (SL.ext ? 200 : 0)}px;border-collapse:collapse;font-size:calc(12px*var(--m-sub))">
        <thead><tr>
          ${th('lead', '구분', `주도 = 모멘텀 상위 ${_SL_TOP} ∩ 매수 상위 ${_SL_TOP}`, 'center')}
          ${th('name', '업종', 'WICS 중분류 — 누르면 기업분석 표에서 이 업종 종목', 'left')}
          ${SL.ext ? th('ret_1d', '오늘', 'WICS 중분류 지수 전일 대비') : ''}
          <th style="padding:6px 8px;font-weight:600;color:var(--text2);font-size:calc(11px*var(--m-label))">6개월 추이</th>
          ${th('ret_6m', '6개월', 'FnGuide WICS 중분류 지수 6개월 수익률')}
          ${th('mom_rank', '모멘텀', '6개월 수익률 ÷ 하방 표준편차 순위 (원본: 하방 표준편차 대비 수익률이 센 업종)')}
          ${th('buy_rank', '매수', '사모·투신·연금·외국인 매수 순위, 최근 20거래일 (원본: 장 마감 후 수급을 쪼개 보아 꾸준히 매수가 들어오는 업종)')}
          ${SL.ext ? th('_tv5', '거래대금', '관심도 — 판정일 업종 거래대금이 최근 5거래일 평균보다 얼마나 많은가 (아래 작은 글씨: 20일 평균 대비). 원본 「외국인기관수급오실레이터 (업종)」 업종비중 시트') : ''}
          ${SL.ext ? th('_buy5', '연·사·투', '관심도 — 연기금·사모·투신 매수대금 합(원본 \'1일 유동성 투여\')과 최근 5거래일 평균 대비. KIS가 전일까지만 줘 하루 늦다(원본도 전일 값)') : ''}
          <th title="지수가 11일선 · 20일선 · 50일선(10주선) 위면 ●" style="padding:6px 8px;font-weight:600;color:var(--text2);font-size:calc(11px*var(--m-label))">11·20·50일선</th>
          ${th('flow_pos_days', '순매수일', '참고 — 최근 20거래일 중 업종 전체 기관+외국인이 순매수한 날')}
          ${th('newhigh_5d', '신고가', '최근 5거래일 52주 신고가 종목 수 (군집)')}
          ${SL.osc ? th('fstage', '업종 수급', '업종 수급 오실레이터(외국인+기관 5일 순매수 ÷ 시가총액의 MACD − 시그널)의 최근 63거래일 안 칸 — 원본 「외국인기관수급오실레이터 (업종)」. 누르면 차트', 'left') : ''}
          ${th('n_empty', '빈집·시작', '이 업종에서 수급 오실레이터가 자기 이력 하위 50%인 종목 수 · 수급 단계 \'이제 시작\' 종목 수')}
          ${th('n_stocks', '종목', '업종 종목 수')}
        </tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
    <div style="padding:8px 12px;font-size:calc(11px*var(--m-label));color:var(--text2);line-height:1.6">
      출처 — 유튜브 <b>태린이아빠</b> 2026-09-19·09-25 영상: 국내 주도 업종은 6개월 수익률을 하방 표준편차로 나눈 값이 센 업종과,
      장 마감 후 기관·외국인 수급을 쪼개 보아 꾸준히 매수가 들어오는 업종의 교집합으로 고른다.
      '매수'는 2024-10 영상의 방식(사모·투신·연금·외국인 매수 — "이때 매수만 본다")이다.
      업종은 WICS 중분류, 지수는 FnGuide WICS 지수이며, 상위 ${_SL_TOP}은 원본에 수치가 없어 정한 값이다.
      ${SL.osc ? `'업종 수급'은 같은 채널의 「외국인기관수급오실레이터 (업종)」을 WICS 중분류로 옮긴 것이다 (${SL.oscDate} 기준, 표는 코스피+코스닥 합산).` : ''}
      ${SL.mkt ? `업종 쏠림지수는 「특정업종 쏠림지수 국내」, 업종 국면은 「업종지수 활용한 추세 및 비추세 전략」을 WI26 대신 WICS 중분류 28개로 계산한 것이다.` : ''}
    </div>`;
  if (SL.open) _slRenderOscChart();
}

// 관심도 칸 — 평균 대비 %(굵게 = 30% 이상 증가). 원본은 '최근일 − 평균'(억원)을 본다 → 툴팁에 금액 차
const _slRatio = (v, strong = 0.3) => v == null ? '—'
  : `<span style="color:${v >= 0 ? 'var(--text1)' : 'var(--text3)'};font-weight:${v >= strong ? 700 : 400}">${v >= 0 ? '+' : ''}${(v * 100).toFixed(0)}%</span>`;

function _slTvCell(r) {
  const r20 = r.tv_now != null && r.tv_avg20 ? r.tv_now / r.tv_avg20 - 1 : null;
  return `${_slRatio(r._tv5)}<div style="font-size:calc(10.5px*var(--m-label));color:var(--text3)">20일 ${r20 == null ? '—' : (r20 >= 0 ? '+' : '') + (r20 * 100).toFixed(0) + '%'}</div>`;
}
function _slTvTip(r) {
  if (r.tv_now == null) return '';
  const d = (a, b) => b == null ? '—' : `${a - b >= 0 ? '+' : '−'}${fmtTV(Math.abs(a - b))}`;
  return `거래대금 ${fmtTV(r.tv_now)} · 5일 평균 ${r.tv_avg5 != null ? fmtTV(r.tv_avg5) : '—'} (${d(r.tv_now, r.tv_avg5)}) · 20일 평균 ${r.tv_avg20 != null ? fmtTV(r.tv_avg20) : '—'} (${d(r.tv_now, r.tv_avg20)})`;
}
function _slBuyCell(r) {
  if (r.buy3_now == null) return '—';
  return `${fmtTV(r.buy3_now)}<div style="font-size:calc(10.5px*var(--m-label))">${_slRatio(r._buy5)}</div>`;
}
function _slBuyTip(r) {
  if (r.buy3_now == null) return '';
  return `연기금·사모·투신 매수대금 ${fmtTV(r.buy3_now)} (${r.buy_date} 하루) · 최근 5거래일 평균 ${r.buy3_avg5 != null ? fmtTV(r.buy3_avg5) : '—'}`;
}

// 표의 '업종 수급' 칸 — 칸 그림 + 단계, 누르면 차트
function _slFlowCell(r) {
  const g = _slGauge(r.mid_code);
  if (!g?.gg) return '<span style="color:var(--text3)">—</span>';
  return `<span onclick="toggleSlOsc('${escJsStr(r.mid_code)}')" style="cursor:pointer;white-space:nowrap" `
    + `title="${escAttr(flowGaugeTip(g.o.gauge, g.gg) + ' — 누르면 차트')}">`
    + `${flowGaugeBar(g.gg)} <span style="color:${g.gg.color};font-weight:600">${g.gg.label}</span></span>`;
}

// 펼친 행 — 시장 전환 + 차트 캔버스 + 원본 '그래프뽑기' 칸 표
function _slOscRow(r) {
  const chips = Object.entries(_SL_MKT).map(([k, lbl]) => {
    const g = _slGauge(r.mid_code, k);
    const st = g?.gg ? ` <span style="color:${g.gg.color}">${g.gg.label}</span>` : '';
    return `<button class="chip chip-sm ${SL.oscMkt === k ? 'active' : ''}" onclick="setSlOscMkt('${k}')">${lbl}${st}</button>`;
  }).join('');
  return `<tr><td colspan="${SL.ncol}" style="padding:8px 12px 12px;background:var(--bg2);border-top:1px solid var(--border)">
    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:6px">
      <b style="color:var(--text1);font-size:calc(12.5px*var(--m-sub))">${escapeHtml(r.name)} · 업종 수급 오실레이터</b>
      <span style="display:flex;gap:4px;flex-wrap:wrap">${chips}</span>
      <span id="sl-osc-info" style="margin-left:auto;color:var(--text2);font-size:calc(11px*var(--m-label))"></span>
    </div>
    <div style="position:relative;height:230px"><canvas id="sl-osc-chart"></canvas></div>
    <div id="sl-osc-levels" style="margin-top:6px;font-size:calc(11px*var(--m-label));color:var(--text2);line-height:1.6"></div>
  </td></tr>`;
}

function toggleSlOsc(mid) {
  SL.open = SL.open === mid ? null : mid;
  _renderSectorLead();
}

function setSlOscMkt(m) {
  SL.oscMkt = m;
  _renderSectorLead();
}

// 원본 차트와 같게 — 업종 시가총액(원본도 가격 대신 시총) 선 + 오실레이터 막대 + 칸 기준선
async function _slRenderOscChart() {
  const mid = SL.open, mkt = SL.oscMkt;
  if (!mid || !document.getElementById('sl-osc-chart')) return;
  if (SL.chart) { SL.chart.destroy(); SL.chart = null; }
  const info = document.getElementById('sl-osc-info');
  try {
    const qo = sb.from('sector_flow_osc').select('base_date,osc,gauge,pct')
      .eq('mid_code', mid).eq('market', mkt).order('base_date').limit(1000);
    let qd = sb.from('sector_flow_daily').select('base_date,cap')
      .like('wics_code', `${mid}%`).order('base_date').limit(5000);
    if (mkt !== 'ALL') qd = qd.eq('market', mkt);
    const [{ data: orows, error: e1 }, { data: drows, error: e2 }] = await Promise.all([qo, qd]);
    if (e1 || e2) throw (e1 || e2);
    const canvas = document.getElementById('sl-osc-chart');
    if (SL.open !== mid || SL.oscMkt !== mkt || !canvas) return;   // 그새 바뀜
    const cap = {};
    (drows || []).forEach(r => { cap[r.base_date] = (cap[r.base_date] || 0) + (r.cap || 0); });
    const rows = (orows || []).filter(r => r.osc != null);
    if (!rows.length) { if (info) info.textContent = '이력이 아직 없습니다'; return; }
    const labels = rows.map(r => r.base_date);
    const last = rows[rows.length - 1];
    const lv = last.gauge?.lv || [];
    const t = chartTheme(), css = getComputedStyle(document.documentElement);
    const upC = css.getPropertyValue('--up').trim() || '#f5365c', dnC = css.getPropertyValue('--down').trim() || '#4a9eff';
    const lvColor = ['#f5365c', '#fb6340', '#8898aa', '#4a9eff', '#2AABEE'];
    const lvSets = lv.map((v, i) => ({
      type: 'line', label: `_${FLOW_LEVEL_NAMES[i]}`, data: labels.map(() => v), yAxisID: 'y1',
      borderColor: lvColor[i] + '99', borderDash: [4, 4], borderWidth: 1, pointRadius: 0, pointHoverRadius: 0,
    }));
    SL.chart = new Chart(canvas.getContext('2d'), {
      data: {
        labels,
        datasets: [
          { type: 'line', label: '시가총액', data: labels.map(d => cap[d] ? cap[d] / 1e12 : null), yAxisID: 'y',
            borderColor: '#8590ad', borderWidth: 1.5, pointRadius: 0, tension: 0.2, spanGaps: true, order: 0 },
          { type: 'bar', label: '오실레이터', data: rows.map(r => r.osc), yAxisID: 'y1',
            backgroundColor: rows.map(r => (r.osc >= 0 ? upC : dnC) + 'cc'), borderWidth: 0,
            barPercentage: 1, categoryPercentage: 0.9, order: 1 },
          ...lvSets,
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            filter: it => !it.dataset.label.startsWith('_'),
            callbacks: { label: ctx => ctx.dataset.yAxisID === 'y'
              ? `시가총액 ${ctx.parsed.y?.toFixed(1)}조`
              : `오실레이터 ${ctx.parsed.y >= 0 ? '+' : ''}${ctx.parsed.y?.toFixed(4)}%` },
          },
        },
        scales: {
          x:  { ticks: { color: t.tick, maxTicksLimit: 6, maxRotation: 0, font: { size: 10 } }, grid: { color: t.grid } },
          y:  { position: 'left', ticks: { color: '#8590ad', maxTicksLimit: 5, font: { size: 10 }, callback: v => v + '조' },
                grid: { drawOnChartArea: false } },
          y1: { position: 'right', ticks: { color: t.tick, maxTicksLimit: 5, font: { size: 10 }, callback: v => v.toFixed(3) + '%' },
                grid: { color: t.grid } },
        },
      },
    });
    if (info) info.textContent = `${last.base_date} · 최근 63거래일 안 위치 ${last.pct ?? '—'}%`;
    const g = last.gauge ? flowGauge(last.gauge) : null;
    const lvEl = document.getElementById('sl-osc-levels');
    const f = v => (v >= 0 ? '+' : '') + v.toFixed(4) + '%';
    if (lvEl && g) lvEl.innerHTML = FLOW_LEVEL_NAMES.map((n, i) =>
        `<span style="color:${lvColor[i]}">${n}</span> ${f(lv[i])}${last.gauge.cur >= lv[i] ? '■' : '□'}`).join(' · ')
      + ` · <b style="color:var(--text1)">현재 ${f(last.gauge.cur)}</b>`
      + ` <span style="color:${g.color};font-weight:600">${flowGaugeBar(g)} ${g.label}</span>`
      + `<br><span style="color:var(--text3)">회색 선 = 업종 시가총액(원본처럼 지수 대신) · 막대 = 오실레이터 · 점선 = 최근 63거래일 칸 기준선(원본 '그래프뽑기' 표)</span>`;
  } catch (e) {
    console.warn('[업종수급] 차트', e);
    if (info) info.textContent = '차트를 불러오지 못했습니다';
  }
}

function _slCmp(a, b) {
  const k = SL.sortCol, dir = SL.sortDir;
  const ord = { lead: 0, mom: 1, buy: 2 };
  if (k === 'lead') {
    const x = a._tag ? ord[a._tag] : 9, y = b._tag ? ord[b._tag] : 9;
    return (x - y) * dir || ((a.mom_rank ?? 999) + (a.buy_rank ?? 999)) - ((b.mom_rank ?? 999) + (b.buy_rank ?? 999));
  }
  if (k === 'name') return (a.name || '').localeCompare(b.name || '', 'ko') * dir;
  if (k === 'fstage') {   // 이제 시작 → 채우는 중 → 비우는 중 → 다 찼다 → 꺾임, 같은 단계면 칸 수 적은 쪽
    const ga = _slGauge(a.mid_code)?.gg, gb = _slGauge(b.mid_code)?.gg;
    if (!ga || !gb) return ga ? -1 : gb ? 1 : 0;
    return ((gb.prio - ga.prio) || (ga.fill - gb.fill)) * dir;
  }
  const va = a[k], vb = b[k];
  if (va == null && vb == null) return 0;
  if (va == null) return 1;
  if (vb == null) return -1;
  // 순위 컬럼은 작을수록 위, 값 컬럼은 클수록 위가 기본
  const rankCol = ['mom_rank', 'buy_rank'].includes(k);
  return (rankCol ? va - vb : vb - va) * dir;
}

function sortSl(col) {
  if (SL.sortCol === col) SL.sortDir = -SL.sortDir;
  else { SL.sortCol = col; SL.sortDir = 1; }
  _renderSectorLead();
}

function toggleSlAll() {
  SL.showAll = !SL.showAll;
  _renderSectorLead();
}

// 업종 클릭 → 기업분석 표를 그 중분류로 걸러 연다(빈집·수급단계·태린 후보를 바로 본다)
function goSectorStocks(name) {
  if (!name) return;
  FIN.pendingCat = { _wmid: [name] };
  go('financials');
}
