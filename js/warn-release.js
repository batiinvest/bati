// warn-release.js — DISCOVER '투자경고 해제' 페이지 (10-05)
// [원본] 태린이아빠 「투경해제 공식.xlsx」 — 판단일(T) 종가로 세 가지를 보고, 모두 1이면 '다음날 해제 가능',
//   하나라도 아니면 '다음날로 이연'(원본 메모: "3가지 다 1 이어야 다음날 해제가능 이번에 안되면 다음날로 이연")
//     ① T 종가 < T−5 종가 × 1.45(코스피 시트) / 1.6(코스닥 시트)
//     ② T 종가 < T−15 종가 × 1.75(코스피) / 2(코스닥)
//     ③ T 종가가 직전 15거래일(T−15 ~ T−1) 종가 최고가보다 낮음 — 코스피 시트는 '<', 코스닥 시트는 '≤'(원본 수식 그대로)
//   시장별 수치는 원본 시트 그대로. 실제 거래소 공시도 같다(10-05 확인: 유가 SK하이닉스·한화에어로스페이스 2025-12 45%·75%,
//   코스닥 피델릭스 2026-06 60%·100%).
// [원본에 없는 사실 — 거래소 공시 문구] 판단일은 '지정일부터 계산하여 10일째 이후'(지정일 = 1일째) — 그 전엔 판단하지 않는다.
// 데이터: market_data(market_warn_code '02' = 투자경고, 정규장 종가 price), 거래일 = fear_greed_daily 날짜(휴장일 제외),
//   지정일 = 최근 '02' 연속 구간의 첫 거래일(데이터 시작 전부터 경고면 '확인 불가').
// 검증(10-05): 7월~10월 끝난 경고 구간 57건 중 데이터로 판정 가능한 22건 — 21건 실제 해제일 일치, 1건(KS인더스트리) 지정일이 하루 이르게
//   기록돼(경고 코드가 지정 전날 행에 찍힘) 하루 빠름. 35건은 8월 이전 시세가 부분이라 판정 불가.
// '내일 기준가' = 다음 거래일을 T로 둔 원본 기준가(①②: 그날의 T−5·T−15 종가 × 배수, ③: 그날 직전 15일 최고가) 중 가장 낮은 값.
// 의존: config.js (sb, fetchAllPages, escapeHtml, escAttr, loadingHTML, emptyHTML, errorHTML, offsetDate, setAsOf)

const WR_RULE = {
  KOSPI:  { k1: 1.45, k2: 1.75, le: false, label: '코스피' },
  KOSDAQ: { k1: 1.6,  k2: 2,    le: true,  label: '코스닥' },
};
const WR_FIRST_DAY = 10;   // 지정일부터 10일째(지정일 = 1일째)부터 판단 — 거래소 공시 문구

function pWarnRelease() {
  return `
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem;flex-wrap:wrap;gap:8px">
    <span style="font-size:calc(12px*var(--m-sub));color:var(--text2)">지금 투자경고 종목의 해제 요건 — 태린이아빠 「투경해제 공식」</span>
    <span id="wr-date" style="font-size:calc(11px*var(--m-label));color:var(--text2)"></span>
  </div>
  <div class="card" style="margin-bottom:.75rem"><div class="card-body" style="font-size:calc(11px*var(--m-label));color:var(--text2);line-height:1.7">
    판단일(T) 종가로 <b style="color:var(--text1)">① T−5 종가 대비 45%(코스피)·60%(코스닥) 이상 오르지 않음</b> ·
    <b style="color:var(--text1)">② T−15 종가 대비 75%·100% 이상 오르지 않음</b> ·
    <b style="color:var(--text1)">③ 직전 15거래일 종가 중 최고가가 아님</b> — 셋 다 충족하면 다음날 해제, 하나라도 아니면 다음날로 이연(원본 시트).
    판단은 지정일부터 10거래일째(지정일 = 1일째)부터 매일(거래소 공시). '내일 기준가' = 내일 종가가 이 값보다 낮으면 세 요건을 모두 충족하는 값.
  </div></div>
  <div id="wr-body">${loadingHTML('불러오는 중...')}</div>`;
}

async function loadWarnRelease() {
  const body = document.getElementById('wr-body');
  if (!body) return;
  try {
    const { data: cal } = await sb.from('fear_greed_daily').select('base_date')
      .gte('base_date', offsetDate(-200)).order('base_date');
    const days = (cal || []).map(r => r.base_date);
    const { data: last } = await sb.from('market_data').select('base_date').order('base_date', { ascending: false }).limit(1);
    const T = last?.[0]?.base_date;
    if (!T) { body.innerHTML = emptyHTML('시세 데이터가 없습니다'); return; }
    if (!days.includes(T)) days.push(T);
    days.sort();
    setAsOf('wr-date', T);
    const { data: warn } = await sb.from('market_data').select('stock_code').eq('base_date', T).eq('market_warn_code', '02');
    const codes = (warn || []).map(r => r.stock_code);
    if (!codes.length) { body.innerHTML = emptyHTML('지금 투자경고 종목이 없습니다'); return; }
    const [hist, comp] = await Promise.all([
      fetchAllPages((a, b) => sb.from('market_data').select('stock_code,base_date,price,market_warn_code')
        .in('stock_code', codes).gte('base_date', days[0]).order('stock_code').order('base_date').range(a, b)),
      sb.from('companies').select('code,name,market').in('code', codes),
    ]);
    const cm = Object.fromEntries((comp.data || []).map(c => [c.code, c]));
    const by = {};
    hist.forEach(r => { (by[r.stock_code] = by[r.stock_code] || {})[r.base_date] = r; });
    const rows = codes.map(c => _wrRow(c, cm[c] || {}, by[c] || {}, days, T))
      .sort((a, b) => (b.rank - a.rank) || (b.n || 0) - (a.n || 0));
    body.innerHTML = _wrTable(rows, T);
  } catch (e) {
    console.warn('[투자경고 해제]', e);
    body.innerHTML = errorHTML(e.message || '조회 실패');
  }
}

// 한 종목 판정 — days: 거래일(오름차순), h: {날짜: {price, market_warn_code}}
function _wrRow(code, c, h, days, T) {
  const rule = WR_RULE[c.market] || WR_RULE.KOSDAQ;
  const ti = days.indexOf(T);
  const close = i => (i >= 0 && h[days[i]]?.price) || null;
  // 지정일 — T에서 거꾸로 '02'가 이어지는 첫 거래일
  let s = ti;
  while (s - 1 >= 0 && h[days[s - 1]]?.market_warn_code === '02') s--;
  const known = s > 0 && h[days[s - 1]] != null;          // 그 앞날 기록이 있어야 '여기서 시작'이 확실
  const n = known ? ti - s + 1 : null;                      // 지정일 = 1일째
  const judge = i => {                                      // 거래일 i를 판단일로 둔 원본 세 요건
    const cT = close(i), c5 = close(i - 5), c15 = close(i - 15);
    const prev = Array.from({ length: 15 }, (_, k) => close(i - 15 + k));
    if (cT == null || c5 == null || c15 == null || prev.some(v => v == null)) return null;
    const max15 = Math.max(...prev);
    return { cT, c5, c15, max15, b1: c5 * rule.k1, b2: c15 * rule.k2,
             ok1: cT < c5 * rule.k1, ok2: cT < c15 * rule.k2, ok3: rule.le ? cT <= max15 : cT < max15 };
  };
  const t = judge(ti);
  // 내일(T+1)의 기준가 — T+1을 판단일로 두면 T−5 = 오늘 기준 4거래일 전, T−15 = 14거래일 전, 직전 15일 = 오늘 포함 15일
  const c4 = close(ti - 4), c14 = close(ti - 14);
  const prev15 = Array.from({ length: 15 }, (_, k) => close(ti - 14 + k));
  const tm = c4 != null && c14 != null && !prev15.some(v => v == null)
    ? { b1: c4 * rule.k1, b2: c14 * rule.k2, b3: Math.max(...prev15) } : null;
  let verdict, rank;
  if (n == null) { verdict = '지정일 확인 불가'; rank = 0; }
  else if (n < WR_FIRST_DAY) { verdict = `판단 전 — ${WR_FIRST_DAY}일째부터`; rank = 1; }
  else if (!t) { verdict = '시세 빠짐'; rank = 0; }
  else if (t.ok1 && t.ok2 && t.ok3) { verdict = '다음날 해제 가능'; rank = 3; }
  else { verdict = '다음날로 이연'; rank = 2; }
  return { code, name: c.name || code, mkt: rule.label, rule, start: known ? days[s] : null, n, t, tm, verdict, rank,
           tmOk: n != null && n + 1 >= WR_FIRST_DAY };
}

function _wrTable(rows, T) {
  const won = v => v == null ? '—' : Math.round(v).toLocaleString();
  const md = d => d ? d.slice(5).replace('-', '/') : '—';
  const mark = (ok, a, b, le) => ok == null ? '<td></td>'
    : `<td class="ae-num" title="${escAttr(`${won(a)} ${ok ? (le ? '≤' : '<') : (le ? '>' : '≥')} ${won(b)}`)}">`
      + `<span style="color:${ok ? 'var(--text1)' : 'var(--up)'};font-weight:${ok ? 400 : 700}">${ok ? '충족' : '미충족'}</span>`
      + `<div style="font-size:calc(10.5px*var(--m-label));color:var(--text3)">기준 ${won(b)}</div></td>`;
  const vcol = v => v === '다음날 해제 가능' ? '#2dce89' : v === '다음날로 이연' ? '#fb6340' : 'var(--text2)';
  return `<div class="card"><div class="table-wrap"><table class="pb-mini wr-tbl">
    <thead><tr><th>시장</th><th>종목명</th><th>지정일</th><th class="ae-num">경과</th><th class="ae-num">종가(${md(T)})</th>
      <th class="ae-num">① T−5 대비</th><th class="ae-num">② T−15 대비</th><th class="ae-num">③ 15일 최고가</th>
      <th>판정</th><th class="ae-num">내일 기준가</th></tr></thead>
    <tbody>${rows.map(r => {
      const t = r.t, tm = r.tm;
      const tmMin = tm ? Math.min(tm.b1, tm.b2, tm.b3) : null;
      const tmTip = tm ? `① ${won(tm.b1)} 미만 · ② ${won(tm.b2)} 미만 · ③ ${won(tm.b3)} ${r.rule.le ? '이하' : '미만'}` : '';
      return `<tr class="stock-row" data-stock-open="${escAttr(r.code)}" data-stock-name="${escAttr(r.name)}" data-stock-tab="market">
        <td style="color:var(--text3)">${r.mkt}</td>
        <td style="font-weight:600;color:var(--text1)">${escapeHtml(r.name)}</td>
        <td>${r.start ? md(r.start) : '—'}</td>
        <td class="ae-num">${r.n != null ? r.n + '일째' : '—'}</td>
        <td class="ae-num">${t ? won(t.cT) : '—'}</td>
        ${t ? mark(t.ok1, t.cT, t.b1, false) + mark(t.ok2, t.cT, t.b2, false) + mark(t.ok3, t.cT, t.max15, r.rule.le) : '<td></td><td></td><td></td>'}
        <td style="font-weight:700;color:${vcol(r.verdict)};white-space:nowrap">${escapeHtml(r.verdict)}</td>
        <td class="ae-num" title="${escAttr(tmTip)}">${tm && r.tmOk ? won(tmMin) + (r.rule.le && tmMin === tm.b3 ? ' 이하' : ' 미만') : '—'}</td>
      </tr>`;
    }).join('')}</tbody></table></div>
    <div style="padding:6px 12px 8px;font-size:calc(11px*var(--m-label));color:var(--text3);line-height:1.6;border-top:1px solid var(--border)">
      칸에 마우스를 올리면 비교한 값이 보입니다. 지정일은 시세 기록의 경고 표시(KIS 시장경고 코드)가 시작된 날로 추정 — 기록 시작 전부터 경고면 '확인 불가'.
      지난 경고 해제 22건으로 맞춰 보니 21건은 실제 해제일과 같았고, 1건(9월 KS인더스트리)은 경고 표시가 하루 먼저 기록돼 하루 일찍 '해제 가능'으로 나왔습니다.
      내일 기준가는 내일이 판단일일 때만 표시합니다. 판정은 정규장 종가 기준이며, 실제 해제는 거래소 공시로 확정됩니다.
    </div></div>`;
}
