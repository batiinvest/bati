/**
 * sector-lead.js — 오늘의 시황 '주도 업종 · 돈이 몰리는 곳' 카드
 *
 * 태린이아빠 2026-09-25 영상 「미장 투자방식 일부 개선 신고가전략 + 빈집매수 보완」(1:00~1:35)의
 * 국내 주도 업종 선정을 옮겼다.
 *   ① 6개월 수익률 ÷ 하방 표준편차가 센 업종(모멘텀)
 *   ② 장 마감 후 기관·외국인 수급으로 최근 꾸준히 매수가 발생한 업종(꾸준한 매수)
 *   주도 업종 = ① 상위 25% ∩ ② 상위 25%
 * 계산은 백엔드(sector_lead.py, 평일 18:50)가 하고 flow_concepts에 적는다. 이 카드는 읽기만 한다.
 * 같은 행의 '매수 강도'는 2024-10 영상 방식(사모·투신·연금·외국인 매수 순위)으로, 빈집 필터의 기준이다.
 *
 * 의존: sb, fetchPagesParallel, chgColor, escapeHtml, escAttr, escJsStr, loadingHTML, _ICO (config.js)
 *       FIN, _finCatSel (financials.js — 업종 클릭 시 기업분석 표를 그 업종으로 걸러 연다)
 */

// ── 상태 네임스페이스 (window._* 금지 규약) ─────────────────────────────────
const SL = {
  rows:    null,    // flow_concepts 행 (판정일 1일치)
  date:    null,    // 판정일
  spark:   {},      // {grp: [누적 지수 …]} — 6개월 추이
  showAll: false,   // 전체 업종 보기
  sortCol: 'lead',  // 정렬 기준
  sortDir: 1,
};

const _SL_TAG = {
  lead: { txt: '주도',   color: '#f59e0b', bg: 'rgba(245,158,11,.16)', tip: '모멘텀 상위 25% ∩ 꾸준한 매수 상위 25% — 태린이아빠 주도 업종' },
  mom:  { txt: '모멘텀', color: 'var(--tg)', bg: 'rgba(42,171,238,.12)', tip: '6개월 수익률 ÷ 하방 표준편차 상위 25%' },
  flow: { txt: '매수',   color: '#2dce89', bg: 'rgba(45,206,137,.13)', tip: '최근 20거래일 기관·외국인 꾸준한 순매수 상위 25%' },
};
const _slFlowColor = v => v > 0 ? '#2dce89' : v < 0 ? '#f5365c' : 'var(--text3)';
const _slName = g => (g || '').split(':').pop();

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
    const { data: d, error: e1 } = await sb.from('flow_concepts').select('base_date')
      .order('base_date', { ascending: false }).limit(1);
    if (e1) throw e1;
    const date = d?.[0]?.base_date;
    if (!date) { el.innerHTML = _slMsg('아직 계산된 업종 순위가 없습니다'); return; }

    const { data: rows, error } = await sb.from('flow_concepts')
      .select('grp,rank,n_groups,supplied,n_stocks,mom_6m,down_dev,mom_score,mom_rank,pos_days,net_ratio,flow_rank,lead,n_fill,n_start,data_from,data_to')
      .eq('base_date', date);
    // 주도 업종 컬럼은 sql/sector_lead.sql 실행 후 생긴다 — 그 전엔 준비 중 안내
    if (error?.code === '42703') { el.innerHTML = _slMsg('주도 업종 계산을 준비하고 있습니다'); return; }
    if (error) throw error;
    SL.rows = rows || [];
    SL.date = date;
    if (!SL.rows.some(r => r.mom_rank != null || r.flow_rank != null)) {
      el.innerHTML = _slMsg('주도 업종 계산을 준비하고 있습니다 (평일 18:50 갱신)');
      return;
    }
    _renderSectorLead();
    _loadSlSpark(date);   // 6개월 추이 스파크라인은 뒤따라 채운다(표를 먼저 보여 준다)
  } catch (e) {
    console.warn('[주도업종]', e);
    el.innerHTML = _slMsg('주도 업종을 불러오지 못했습니다');
  }
}

const _slMsg = msg =>
  `<div style="padding:1.5rem 1rem;text-align:center;color:var(--text2);font-size:calc(13px*var(--m-body))">${escapeHtml(msg)}</div>`;

// 6개월 추이 — sector_index 누적(126거래일)
async function _loadSlSpark(date) {
  try {
    const since = new Date(new Date(date).getTime() - 200 * 864e5).toISOString().slice(0, 10);
    const q = (s, e) => sb.from('sector_index').select('grp,base_date,ret')
      .gte('base_date', since).lte('base_date', date).order('grp').order('base_date').range(s, e);
    const rows = await fetchPagesParallel(q, sb.from('sector_index').select('grp', { count: 'exact', head: true })
      .gte('base_date', since).lte('base_date', date));
    const by = {};
    rows.forEach(r => { (by[r.grp] = by[r.grp] || []).push(Number(r.ret)); });
    SL.spark = {};
    Object.entries(by).forEach(([g, rets]) => {
      const w = rets.slice(-126);
      let lv = 1;
      SL.spark[g] = [1, ...w.map(r => (lv *= 1 + r))];
    });
    if (SL.date === date) _renderSectorLead();
  } catch (e) { console.warn('[주도업종] 추이', e); }
}

function _slSparkSvg(vals, color) {
  if (!vals || vals.length < 2) return '<span style="color:var(--text3)">—</span>';
  const W = 72, H = 20, lo = Math.min(...vals), hi = Math.max(...vals), rg = (hi - lo) || 1;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1) * W).toFixed(1)},${(H - 1 - (v - lo) / rg * (H - 2)).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="display:block" xmlns="http://www.w3.org/2000/svg">`
    + `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.3"/></svg>`;
}

function _slTag(r, mCut, fCut) {
  const m = r.mom_rank != null && r.mom_rank <= mCut, f = r.flow_rank != null && r.flow_rank <= fCut;
  return r.lead ? 'lead' : m ? 'mom' : f ? 'flow' : null;
}

function _renderSectorLead() {
  const el = document.getElementById('sl-body');
  if (!el || !SL.rows) return;
  const rows = SL.rows;
  const nM = rows.filter(r => r.mom_rank != null).length, nF = rows.filter(r => r.flow_rank != null).length;
  const mCut = Math.max(1, Math.round(nM * 0.25)), fCut = Math.max(1, Math.round(nF * 0.25));
  rows.forEach(r => { r._tag = _slTag(r, mCut, fCut); });

  const dEl = document.getElementById('sl-date');
  const any = rows[0];
  if (dEl) dEl.textContent = `판정 ${SL.date}` + (any?.data_to ? ` · 매수 ~${any.data_to.slice(5)}` : '');
  const btn = document.getElementById('sl-all-btn');
  if (btn) { btn.classList.toggle('active', SL.showAll); btn.textContent = SL.showAll ? '상위만' : `전체 업종 ${rows.length}`; }

  const leads = rows.filter(r => r.lead).sort((a, b) => a.mom_rank - b.mom_rank);
  const topM  = rows.filter(r => r.mom_rank != null && r.mom_rank <= mCut).sort((a, b) => a.mom_rank - b.mom_rank);
  const topF  = rows.filter(r => r.flow_rank != null && r.flow_rank <= fCut).sort((a, b) => a.flow_rank - b.flow_rank);
  const nameBtn = r => `<span style="cursor:pointer;text-decoration:underline dotted;text-underline-offset:3px" `
    + `onclick="goSectorStocks('${escJsStr(r.grp)}')" title="기업분석 표에서 이 업종 종목 보기">${escapeHtml(_slName(r.grp))}</span>`;
  const summary = `
    <div style="padding:8px 12px 6px;font-size:calc(12.5px*var(--m-sub));line-height:1.7">
      <div><b style="color:${_SL_TAG.lead.color}">주도 업종</b>
        <span style="color:var(--text3)">(모멘텀 상위 ∩ 꾸준한 매수 상위)</span>
        ${leads.length ? leads.map(r => `<b style="color:var(--text1)">${nameBtn(r)}</b>`).join(' · ')
                       : '<span style="color:var(--text2)">교집합 없음 — 아래 두 목록을 따로 보세요</span>'}</div>
      <div style="color:var(--text2)"><span style="color:${_SL_TAG.mom.color}">모멘텀 상위 ${topM.length}</span> ${topM.map(nameBtn).join(' · ')}</div>
      <div style="color:var(--text2)"><span style="color:${_SL_TAG.flow.color}">꾸준한 매수 상위 ${topF.length}</span> ${topF.map(nameBtn).join(' · ')}</div>
    </div>`;

  // 표 — 기본은 주도·모멘텀·매수 상위만, '전체 업종'이면 전부
  const list = (SL.showAll ? rows.slice() : rows.filter(r => r._tag)).sort(_slCmp);
  const th = (key, label, tip, align = 'right') =>
    `<th onclick="sortSl('${key}')" title="${escAttr(tip || '')}" style="cursor:pointer;text-align:${align};padding:6px 8px;white-space:nowrap;font-weight:600;color:var(--text2);font-size:calc(11px*var(--m-label))">${label}${SL.sortCol === key ? (SL.sortDir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
  const td = (html, align = 'right', extra = '') => `<td style="padding:5px 8px;text-align:${align};white-space:nowrap;${extra}">${html}</td>`;
  const pct = (v, d = 1) => v == null ? '—' : `${v >= 0 ? '+' : ''}${Number(v).toFixed(d)}%`;
  const body = list.map(r => {
    const t = r._tag ? _SL_TAG[r._tag] : null;
    return `<tr style="border-top:1px solid var(--border)">
      ${td(t ? `<span title="${escAttr(t.tip)}" style="font-size:calc(10.5px*var(--m-label));font-weight:700;color:${t.color};background:${t.bg};border-radius:4px;padding:1px 6px">${t.txt}</span>` : '', 'center')}
      ${td(nameBtn(r), 'left', 'font-weight:600;color:var(--text1)')}
      ${td(_slSparkSvg(SL.spark[r.grp], chgColor(r.mom_6m)), 'center')}
      ${td(`<span style="color:${chgColor(r.mom_6m)}">${pct(r.mom_6m)}</span>`)}
      ${td(r.mom_rank != null ? `${r.mom_rank}<span style="color:var(--text3)">/${nM}</span>` : '—', 'right', `title="수익률 ÷ 하방 표준편차 = ${r.mom_score ?? '—'} (하방 표준편차 ${r.down_dev ?? '—'}%)"`)}
      ${td(r.pos_days != null ? `${r.pos_days}<span style="color:var(--text3)">/20일</span>` : '—')}
      ${td(`<span style="color:${_slFlowColor(r.net_ratio)}">${pct(r.net_ratio, 2)}</span>`)}
      ${td(r.flow_rank != null ? `${r.flow_rank}<span style="color:var(--text3)">/${nF}</span>` : '—')}
      ${td(`${r.rank}<span style="color:var(--text3)">/${r.n_groups}</span>${r.supplied ? ' <span style="color:#f59e0b" title="빈집 필터의 공급 업종">●</span>' : ''}`)}
      ${td(`${r.n_fill ?? '—'}<span style="color:var(--text3)"> · </span><span style="color:#2dce89">${r.n_start ?? '—'}</span>`, 'right', 'title="빈집 종목 · 이제 시작 종목"')}
      ${td(r.n_stocks ?? '—', 'right', 'color:var(--text3)')}
    </tr>`;
  }).join('');

  el.innerHTML = summary + `
    <div style="overflow-x:auto">
      <table style="width:100%;min-width:760px;border-collapse:collapse;font-size:calc(12px*var(--m-sub))">
        <thead><tr>
          ${th('lead', '구분', '주도 = 모멘텀 상위 ∩ 꾸준한 매수 상위', 'center')}
          ${th('name', '업종', 'WICS 업종(10종목 미만은 중분류·섹터) — 누르면 기업분석 표에서 이 업종 종목', 'left')}
          <th style="padding:6px 8px;font-weight:600;color:var(--text2);font-size:calc(11px*var(--m-label))">6개월 추이</th>
          ${th('mom_6m', '6개월', '업종 지수(시가총액 가중·수정주가) 126거래일 수익률')}
          ${th('mom_rank', '모멘텀', '6개월 수익률 ÷ 하방 표준편차 순위 (원본: 하방 표준편차 대비 수익률이 센 업종)')}
          ${th('pos_days', '순매수일', '최근 20거래일 중 업종 전체 기관+외국인이 순매수한 날')}
          ${th('net_ratio', '순매수/시총', '최근 20거래일 기관+외국인 순매수 합 ÷ 업종 시가총액')}
          ${th('flow_rank', '꾸준한 매수', '순매수일·순매수/시총 백분위 평균 순위 (원본: 최근 꾸준하게 매수가 발생한 섹터)')}
          ${th('rank', '매수 강도', '사모·투신·연금·외국인 매수 순위(2024-10 영상 방식, 20거래일) — ●는 빈집 필터의 공급 업종')}
          ${th('n_fill', '빈집·시작', '이 업종의 빈집 종목 수 · 수급 단계 \'이제 시작\' 종목 수')}
          ${th('n_stocks', '종목', '업종 종목 수')}
        </tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
    <div style="padding:8px 12px;font-size:calc(11px*var(--m-label));color:var(--text2);line-height:1.6">
      출처 — 유튜브 <b>태린이아빠</b> 2026-09-25 영상: 국내 주도 업종은 6개월 수익률을 하방 표준편차로 나눈 값이 센 업종과,
      장 마감 후 기관·외국인 수급에서 최근 꾸준히 매수가 발생한 업종의 교집합으로 고른다.
      기간(126·20거래일)과 상위 25%는 원본에 수치가 없어 정한 값이고, 업종 지수는 WICS 업종 종목의 시가총액 가중 일별 수익률로 만들었다.
    </div>`;
}

function _slCmp(a, b) {
  const k = SL.sortCol, dir = SL.sortDir;
  const ord = { lead: 0, mom: 1, flow: 2 };
  if (k === 'lead') {
    const x = a._tag ? ord[a._tag] : 9, y = b._tag ? ord[b._tag] : 9;
    return (x - y) * dir || ((a.mom_rank ?? 999) + (a.flow_rank ?? 999)) - ((b.mom_rank ?? 999) + (b.flow_rank ?? 999));
  }
  if (k === 'name') return _slName(a.grp).localeCompare(_slName(b.grp), 'ko') * dir;
  const va = a[k], vb = b[k];
  if (va == null && vb == null) return 0;
  if (va == null) return 1;
  if (vb == null) return -1;
  // 순위 컬럼은 작을수록 위, 값 컬럼은 클수록 위가 기본
  const rankCol = ['mom_rank', 'flow_rank', 'rank'].includes(k);
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

// 업종 클릭 → 기업분석 표를 그 업종으로 걸러 연다(빈집·수급단계를 바로 본다)
function goSectorStocks(grp) {
  const [lvl, name] = String(grp).split(':');
  const col = { '업종': '_wics', '중분류': '_wmid', '섹터': '_wsec' }[lvl];
  if (!col || !name) return;
  FIN.pendingCat = { [col]: [name] };
  go('financials');
}
