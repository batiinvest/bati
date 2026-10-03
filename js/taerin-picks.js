/**
 * taerin-picks.js — 오늘의 시황 '오늘의 아이디어' = 태린이아빠 후보 (10-03 사용자 결정: 태린 후보로만)
 *
 * 원본 규칙 (태린이아빠 2026-09-19 영상 · 09-19 회원 영상 「수급 빈집 체크」)
 *   A = 주도 업종 ∧ 수급 오실레이터 빈집 ∧ (거래대금 상위이면서 상승 ∨ 컨센 상향 ∨ 250일 신고가 ∨ 신고가 군집)
 *   B = RS 70 이상 ∧ (그날 거래대금 ∨ 기관·외국인 순매수 상위 150) ∧ 수급 빈집     (일일 스크린)
 *   빈집 = 수급 칸 2개 이하(config.js flowIsEmpty), 판정은 config.js taerinEval — 기업분석 표 '태린 후보' 열과 같다.
 * 원자료: getFlowVerdicts()(수급 칸·lead_flags — 백엔드 collect_flow_empty·collect_leading, 평일 18:50)
 *         + 기업 이름(_msCompanies, investment.js) + 시세(INV.allMarketRows — 등락률·거래대금, 늦게 오면 다시 그림)
 *
 * 의존: sb, escapeHtml, escAttr, escJsStr, chgColor, chgStr, fmtTV, flowGauge, flowGaugeBar, flowGaugeTip,
 *       taerinEval, TAERIN_TAGS, getFlowVerdicts (config.js), _msCompanies·_skelList (investment.js)
 */

// ── 상태 네임스페이스 (window._* 금지 규약) ─────────────────────────────────
const TP = {
  rows:   null,   // 후보 [{code, name, te, gg, gauge, sec, f}]
  date:   null,   // 판정일
  filter: 'all',  // all | A | B
  more:   false,  // 전부 보기
};
const _TP_SHOW = 15;          // 기본으로 보이는 줄 수
const _TP_LEAD_TOP = 10;      // collect_leading LEAD_MOM_TOP·LEAD_BUY_TOP과 같게

async function loadTaerinPicks() {
  const el = document.getElementById('tp-body');
  if (!el) return;
  try {
    const [fv, comp] = await Promise.all([getFlowVerdicts(), _msCompanies()]);
    if (!fv) { el.innerHTML = _tpMsg('수급 판정이 아직 없습니다 (평일 18:50 갱신)'); return; }
    const secOf = Object.fromEntries((fv.sectors || []).map(s => [s.mid_code, s]));
    const rows = [];
    for (const v of Object.values(fv.byCode)) {
      const te = taerinEval(v.flow_gauge, v.lead_flags, v.flow_pctl);
      if (!te || !(te.a || te.b)) continue;
      const f = v.lead_flags || {};
      rows.push({
        code: v.stock_code, name: comp?.[v.stock_code]?.name || v.stock_code,
        te, f, gauge: v.flow_gauge, gg: v.flow_gauge ? flowGauge(v.flow_gauge) : null,
        sec: f.mid ? secOf[f.mid] : null,
      });
    }
    // A·B → A → B, 같은 등급이면 '이제 시작' 먼저 → 칸이 덜 찬 순 → RS 높은 순
    const grade = t => (t.a ? 2 : 0) + (t.b ? 1 : 0);
    rows.sort((x, y) => grade(y.te) - grade(x.te)
      || ((y.gg?.key === 'start') - (x.gg?.key === 'start'))
      || (x.gg?.fill ?? 9) - (y.gg?.fill ?? 9)
      || (y.f.rs ?? 0) - (x.f.rs ?? 0));
    TP.rows = rows;
    TP.date = fv.date;
    renderTaerinPicks();
  } catch (e) {
    console.warn('[태린후보]', e);
    el.innerHTML = _tpMsg('태린 후보를 불러오지 못했습니다');
  }
}

const _tpMsg = msg =>
  `<div style="padding:1.5rem 1rem;text-align:center;color:var(--text2);font-size:calc(12px*var(--m-sub))">${escapeHtml(msg)}</div>`;

function setTpFilter(f) {
  TP.filter = f;
  TP.more = false;
  document.querySelectorAll('[data-tp-filter]').forEach(b => b.classList.toggle('active', b.dataset.tpFilter === f));
  renderTaerinPicks();
}

function toggleTpMore() {
  TP.more = !TP.more;
  renderTaerinPicks();
}

// 업종 태그 — 주도 업종 보드와 같은 기준(주도 · 모멘텀 상위 · 매수 상위)
function _tpSecTag(s) {
  if (!s) return '';
  const k = s.leading ? ['주도', '#f59e0b'] : (s.mom_rank != null && s.mom_rank <= _TP_LEAD_TOP) ? ['모멘텀', 'var(--tg)']
    : (s.buy_rank != null && s.buy_rank <= _TP_LEAD_TOP) ? ['매수', '#2dce89'] : null;
  return `<span title="${escAttr(`중분류 ${s.name} — 모멘텀 ${s.mom_rank ?? '—'}위 · 매수 ${s.buy_rank ?? '—'}위 / ${s.n_sectors}`)}" `
    + `style="font-size:calc(11px*var(--m-label));color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0">`
    + `${escapeHtml(s.name)}${k ? ` <b style="color:${k[1]}">${k[0]}</b>` : ''}</span>`;
}

function renderTaerinPicks() {
  const el = document.getElementById('tp-body');
  if (!el || !TP.rows) return;
  const mkt = {};
  (INV.allMarketRows || []).forEach(r => { mkt[r.stock_code] = r; });
  const nA = TP.rows.filter(r => r.te.a).length, nB = TP.rows.filter(r => r.te.b).length;
  const cnt = document.getElementById('tp-count');
  if (cnt) cnt.textContent = `A ${nA} · B ${nB}${TP.date ? ` · ${TP.date} 판정` : ''}`;

  const list = TP.rows.filter(r => TP.filter === 'all' || (TP.filter === 'A' ? r.te.a : r.te.b));
  if (!list.length) { el.innerHTML = _tpMsg('조건에 맞는 종목이 없습니다'); return; }
  const shown = TP.more ? list : list.slice(0, _TP_SHOW);

  const badge = t => `<span title="${escAttr(t.a && t.b ? 'A·B 둘 다' : t.a ? 'A — 주도 업종 빈집 + 확률 조건' : 'B — RS 70 일일 스크린')}" `
    + `style="font-size:calc(10.5px*var(--m-label));font-weight:800;padding:0 5px;border-radius:3px;flex-shrink:0;`
    + `background:rgba(245,158,11,.18);color:#f59e0b">${t.label}</span>`;
  const tags = r => {
    const t = [];
    if (r.te.a) r.te.extra.forEach(k => t.push(TAERIN_TAGS[k]));
    if (r.f.rs != null && r.f.rs >= 70) t.push(`RS ${r.f.rs}`);
    if (r.te.b && !r.te.a) t.push(...['tv', 'nb'].filter(k => r.f[k]).map(k => TAERIN_TAGS[k]));
    return t.join(' · ');
  };

  el.innerHTML = shown.map(r => {
    const m = mkt[r.code];
    const chg = m?.price_change_rate;
    const tv = m?.trading_value;
    return `
    <div class="stock-row" data-stock-open="${r.code}" data-stock-name="${escAttr(r.name)}" data-stock-tab="market"
      style="display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr) auto;gap:2px 8px;align-items:center;padding:6px 12px;border-bottom:1px solid var(--border)">
      <span style="display:flex;align-items:center;gap:5px;min-width:0">
        ${badge(r.te)}
        <span style="font-size:calc(12px*var(--m-sub));font-weight:600;color:var(--text1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(r.name)}</span>
      </span>
      ${_tpSecTag(r.sec)}
      <span style="font-size:calc(12px*var(--m-sub));font-weight:700;text-align:right;color:${chg != null ? chgColor(chg) : 'var(--text3)'}">${chg != null ? chgStr(chg) : '—'}</span>
      <span style="font-size:calc(11px*var(--m-label));white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0" title="${escAttr(r.gg ? flowGaugeTip(r.gauge, r.gg) : '')}">
        ${r.gg ? `${flowGaugeBar(r.gg)} <span style="color:${r.gg.color};font-weight:600">${r.gg.label}</span>` : ''}
      </span>
      <span style="font-size:calc(11px*var(--m-label));color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0">${escapeHtml(tags(r))}</span>
      <span style="font-size:calc(11px*var(--m-label));color:var(--text3);text-align:right;white-space:nowrap">${tv ? fmtTV(tv) : ''}</span>
    </div>`;
  }).join('')
  + (list.length > _TP_SHOW ? `<div style="padding:6px 12px;text-align:center">
      <button class="chip chip-sm" onclick="toggleTpMore()">${TP.more ? '접기' : `전부 보기 (+${list.length - _TP_SHOW})`}</button></div>` : '')
  + `<div style="padding:7px 12px;font-size:calc(11px*var(--m-label));color:var(--text3);line-height:1.6;border-top:1px solid var(--border)">
      <b style="color:var(--text2)">A</b> = 주도 업종 ∧ 수급 빈집(칸 2개 이하) ∧ (거래대금 상위·상승 ∨ 컨센 상향 ∨ 250일 신고가 ∨ 신고가 군집) ·
      <b style="color:var(--text2)">B</b> = RS 70 이상 ∧ (거래대금 ∨ 기관·외국인 순매수 상위 150) ∧ 수급 빈집 —
      유튜브 태린이아빠 09-19 영상의 방식. 기업분석 표 '태린 후보' 열과 같은 판정.
    </div>`;
}
