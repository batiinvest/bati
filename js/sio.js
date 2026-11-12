// sio.js — 오늘의 시황 '과매도·과매수(SIO)' 카드 (11-12)
// [원본] 태린이아빠 Market Dashboard '한국 과매도 과매수 점검' (공개 소스 app.py _sio_calculate · render_korea_sio_result)
//   코스피200 · 코스닥150 · 코스피대형주 구성종목을 그날 오른 종목과 내린 종목으로 나눠
//     상승평균 = (상승 종목 거래량 비중 + 상승 종목 등락폭 비중) ÷ 2, 하락평균 = 같은 식을 내린 종목으로
//     SIO = 상승평균이 크면 +상승평균, 아니면 −하락평균 (−100% ~ +100%)
//   원본 색: ≤ −80% 과매도 파랑 · ≥ +80% 과매수 빨강 · ≥ +90% 강한 과매수 진빨강.
//   Bottom 통과 = 과매도(≤ −80%) 뒤 1~5거래일 안에 +80% 이상 — 원본은 계산만 하고 표에는 안 보여 준다(여기선 ◆).
// [원본과 다른 점] 원본은 날짜가 세로인 표, 여기는 날짜가 가로인 띠(최근 SIO_SHOW거래일) + 오늘 값 세 칸.
//   계산은 백엔드 collect_sio.py — 원본 16거래일 × 3군 대조: 평균 오차 0.12%p, 판정 47 / 48칸 같음.
// 데이터: sio_daily(base_date, grp, sio −1~+1, up_cnt, down_cnt, n, up_vol, up_pt) — 평일 16:02 · 18:46
// 의존: config.js (sb, escapeHtml, escAttr, setAsOf, _ICO)

const SIO_GROUPS = [['k200', '코스피200'], ['kq150', '코스닥150'], ['klarge', '코스피대형주']];
const SIO_OVERSOLD = -0.8, SIO_OVERBOUGHT = 0.8, SIO_STRONG = 0.9, SIO_BOTTOM_WIN = 5;   // 원본 상수
const SIO_SHOW = 24;    // 띠에 보이는 거래일 수
const SIO_FETCH = 40;   // Bottom 판정에 앞 날짜가 필요해 조금 더 받는다

function pSio() {
  return `
  <div class="card" id="sio-card" style="margin-bottom:1rem">
    <div class="card-header" style="flex-wrap:wrap;gap:6px">
      <span class="card-title">${typeof _ICO !== 'undefined' && _ICO.temp ? _ICO.temp : ''}과매도·과매수</span>
      <span class="card-sub">SIO — 종목군 안에서 오른 쪽과 내린 쪽의 쏠림</span>
      <span id="sio-date" style="font-size:calc(11px*var(--m-label));color:var(--text2);margin-left:auto"></span>
    </div>
    <div id="sio-body"><div class="sio-msg">불러오는 중...</div></div>
  </div>`;
}

async function loadSio() {
  const body = document.getElementById('sio-body');
  if (!body) return;
  try {
    const { data, error } = await sb.from('sio_daily')
      .select('base_date,grp,sio,up_cnt,down_cnt,n,up_vol,up_pt')
      .order('base_date', { ascending: false }).order('grp').limit(SIO_FETCH * SIO_GROUPS.length);
    if (error) {
      if (['PGRST205', '42P01'].includes(error.code)) {   // 테이블 없음 — sql/sio_daily.sql 실행 전
        body.innerHTML = '<div class="sio-msg">준비 중 — 데이터 테이블이 아직 없습니다.</div>';
        return;
      }
      throw error;
    }
    if (!document.getElementById('sio-body')) return;
    sioRender(data || []);
  } catch (e) {
    console.warn('[SIO]', e);
    body.innerHTML = `<div class="sio-msg">불러오지 못했습니다 — ${escapeHtml(e.message || '조회 실패')}</div>`;
  }
}

// 원본 판정 — series: 오름차순 [{date, sio(−1~+1)}] → 같은 길이 [{state, bottom}]
//   state: os 과매도 · ob 과매수 · sob 강한 과매수 · '' 중립
function sioStates(series) {
  let lastOs = null;
  return series.map((r, i) => {
    const v = r.sio;
    let bottom = false;
    if (lastOs != null && i - lastOs > SIO_BOTTOM_WIN) lastOs = null;
    if (v != null) {
      if (v <= SIO_OVERSOLD) lastOs = i;
      else if (lastOs != null && v >= SIO_OVERBOUGHT && i - lastOs >= 1 && i - lastOs <= SIO_BOTTOM_WIN) { bottom = true; lastOs = null; }
    }
    const state = v == null ? '' : v <= SIO_OVERSOLD ? 'os' : v >= SIO_STRONG ? 'sob' : v >= SIO_OVERBOUGHT ? 'ob' : '';
    return { state, bottom };
  });
}
const SIO_STATE_LABEL = { os: '과매도', ob: '과매수', sob: '강한 과매수', '': '중립' };

function sioRender(rows) {
  const body = document.getElementById('sio-body');
  if (!body) return;
  if (!rows.length) { body.innerHTML = '<div class="sio-msg">아직 계산된 날이 없습니다 — 장 마감 뒤 16시에 채워집니다.</div>'; return; }
  const dates = [...new Set(rows.map(r => r.base_date))].sort();
  const by = {};
  rows.forEach(r => { (by[r.grp] = by[r.grp] || {})[r.base_date] = r; });
  const show = dates.slice(-SIO_SHOW), last = dates[dates.length - 1];
  setAsOf('sio-date', last);

  const pct = v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v * 100).toFixed(1) + '%';
  const tip = (name, d, r, st) => !r || r.sio == null ? `${name} ${d} — 값 없음`
    : `${name} ${d} · ${pct(r.sio)} ${SIO_STATE_LABEL[st.state]}${st.bottom ? ' · Bottom 통과' : ''}`
      + ` — 오른 종목 ${r.up_cnt} · 내린 종목 ${r.down_cnt}`
      + (r.up_vol != null ? ` · 오른 쪽 거래량 ${Math.round(r.up_vol * 100)}% · 등락폭 ${Math.round(r.up_pt * 100)}%` : '');

  const groups = SIO_GROUPS.map(([key, name]) => {
    const series = dates.map(d => ({ date: d, sio: by[key]?.[d]?.sio == null ? null : +by[key][d].sio }));
    const st = sioStates(series);
    const at = d => { const i = dates.indexOf(d); return { r: by[key]?.[d], st: st[i] }; };
    return { key, name, at };
  });

  // 오늘 세 칸
  const tiles = groups.map(g => {
    const { r, st } = g.at(last);
    if (!r || r.sio == null) return `<div class="sio-tile"><div class="sio-tile-n">${g.name}</div><div class="sio-tile-v">—</div></div>`;
    const v = +r.sio;
    return `<div class="sio-tile${st.state ? ' sio-' + st.state : ''}" title="${escAttr(tip(g.name, last, r, st))}">
      <div class="sio-tile-n">${g.name}</div>
      <div class="sio-tile-v" style="color:${v > 0 ? 'var(--up)' : 'var(--down)'}">${pct(v)}</div>
      <div class="sio-tile-s"><b class="sio-tag">${SIO_STATE_LABEL[st.state]}</b>${st.bottom ? '<b class="sio-tag sio-tag-b">◆ Bottom 통과</b>' : ''}
        <span>오른 ${r.up_cnt} · 내린 ${r.down_cnt}</span></div>
    </div>`;
  }).join('');

  // 날짜 띠 — 달이 바뀌는 칸만 월/일, 나머지는 일
  const head = show.map((d, i) => {
    const m = +d.slice(5, 7), dd = +d.slice(8, 10);
    const mon = i === 0 || d.slice(5, 7) !== show[i - 1].slice(5, 7);
    return `<div class="sio-h${d === last ? ' sio-last' : ''}">${mon ? m + '/' : ''}${dd}</div>`;
  }).join('');
  const lines = groups.map(g => `<div class="sio-g">${g.name}</div>` + show.map(d => {
    const { r, st } = g.at(d);
    if (!r || r.sio == null) return `<div class="sio-c${d === last ? ' sio-last' : ''}">·</div>`;
    const v = +r.sio, n = Math.round(Math.abs(v * 100));
    return `<div class="sio-c${st.state ? ' sio-' + st.state : v > 0 ? ' sio-up' : ' sio-dn'}${d === last ? ' sio-last' : ''}" title="${escAttr(tip(g.name, d, r, st))}">`
      + `${v < 0 ? '−' : ''}${n}${st.bottom ? '<i class="sio-b">◆</i>' : ''}</div>`;
  }).join('')).join('');

  body.innerHTML = `
    <div class="sio-tiles">${tiles}</div>
    <div class="sio-strip-wrap" id="sio-strip-wrap">
      <div class="sio-strip" style="grid-template-columns:auto repeat(${show.length}, minmax(34px, 1fr))">
        <div class="sio-g sio-gh">최근 ${show.length}거래일</div>${head}${lines}
      </div>
    </div>
    <div class="sio-foot">
      <span><i class="sio-sw sio-os"></i>과매도 −80% 이하</span>
      <span><i class="sio-sw sio-ob"></i>과매수 +80% 이상</span>
      <span><i class="sio-sw sio-sob"></i>강한 과매수 +90% 이상</span>
      <span><i class="sio-b">◆</i> Bottom 통과 — 과매도 뒤 5거래일 안에 +80% 이상</span>
      <div class="sio-note">SIO = 그날 오른 종목의 거래량 비중과 등락폭 비중의 평균. 내린 쪽이 더 크면 그 값을 음수로 적습니다(단위 %).
        지수 등락이 아니라 종목군 안의 투매·추격매수 쏠림을 봅니다. 태린이아빠 '한국 과매도 과매수 점검'과 같은 계산(구성종목 KRX, 정규장 마감 시세).</div>
    </div>`;
  const wrap = document.getElementById('sio-strip-wrap');
  if (wrap) wrap.scrollLeft = wrap.scrollWidth;   // 좁은 화면에선 오늘 쪽이 먼저 보이게
}
