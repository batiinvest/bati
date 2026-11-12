// tw-revenue.js — RESEARCH '대만 월매출' 페이지 (11-12)
// [원본] 태린이아빠 Market Dashboard '대만 월별 매출'(공개 소스 app.py render_taiwan_revenue · TW_AI_UNIVERSE)
//   AI·반도체 공급망 밸류체인 26개의 대만 기업 월매출(MOPS 공식 공시), 올해 포함 최근 4개 연도.
//   · 요약 표: 밸류체인별 기업수(최신 달 신고 수 / 전체)와 합산 YoY
//       합산 YoY = 최신 달에 신고한 기업들의 매출 합 ÷ 그 기업들의 1년 전 같은 달 매출 합 − 1
//   · 밸류체인을 고르면 기업마다 연도를 겹친 월매출 선 그래프 + 최신 매출 · 전월비 · 전년비
// [원본과 다른 점] 원본은 표 + 선택 상자. 여기는 밸류체인 목록(막대 · 정렬)을 왼쪽에 두고 눌러서 고른다. 숫자·식은 원본 그대로.
// 데이터: tw_monthly_revenue(ticker, ym, revenue 천 TWD, mom, yoy) · tw_revenue_universe — 백엔드 collect_tw_revenue.py 매일 21:10
// 의존: config.js (sb, fetchAllPages, escapeHtml, escAttr, chartTheme, SERIES_PAL), Chart.js

const TWR = {
  cats: [],          // [{name, members:[{ticker, name}]}] 원본 순서
  by: {},            // ticker → [{ym, rev(백만 TWD), mom, yoy}] 오름차순
  latest: null,      // 가장 최근 실적 달 'YYYY-MM-01'
  years: [],         // 표시 연도(오름차순, 최대 4개)
  sum: {},           // 밸류체인 이름 → {present, total, yoy}
  cat: null,         // 고른 밸류체인
  sort: 'orig',      // orig | yoy
  charts: [],
};

function pTwRevenue() {
  return `
  <div class="twr-head">
    <div class="twr-lede">대만 AI·반도체 공급망 기업은 <b>매달 10일까지 전달 매출</b>을 공시합니다. 분기 실적을 기다리지 않고
      공급망의 매출 방향을 달마다 봅니다. 한 회사보다 <b>같은 밸류체인의 여러 회사가 함께 좋아지는지</b>가 더 중요한 신호입니다.</div>
    <div id="twr-asof" class="twr-asof"></div>
  </div>
  <div class="twr-layout">
    <div class="card twr-side">
      <div class="card-header" style="flex-wrap:wrap;gap:6px">
        <span class="card-title">밸류체인</span>
        <span class="card-sub">합산 매출 전년비</span>
        <div style="display:flex;gap:4px;margin-left:auto">
          <button class="chip chip-sm active" data-twr-sort="orig" onclick="setTwrSort('orig')">공급망 순</button>
          <button class="chip chip-sm" data-twr-sort="yoy" onclick="setTwrSort('yoy')">전년비 순</button>
        </div>
      </div>
      <div id="twr-cats"><div class="twr-msg">불러오는 중...</div></div>
    </div>
    <div class="twr-main" id="twr-detail"></div>
  </div>`;
}

async function loadTwRevenue() {
  const box = document.getElementById('twr-cats');
  if (!box) return;
  try {
    const [uni, rows] = await Promise.all([
      sb.from('tw_revenue_universe').select('category,cat_ord,ord,ticker,name').order('cat_ord').order('ord')
        .then(r => { if (r.error) throw r.error; return r.data || []; }),
      fetchAllPages(sb.from('tw_monthly_revenue').select('ticker,ym,revenue,mom,yoy').order('ticker').order('ym')),
    ]);
    if (!document.getElementById('twr-cats')) return;
    twrSetData(uni, rows);
    twrRender();
  } catch (e) {
    const missing = /42P01|PGRST205|does not exist|Could not find/.test(`${e?.code} ${e?.message}`);
    if (!missing) console.warn('[대만 월매출]', e);
    box.innerHTML = `<div class="twr-msg">${missing ? '준비 중 — 데이터 테이블이 아직 없습니다.'
      : '불러오지 못했습니다 — ' + escapeHtml(e.message || '조회 실패')}</div>`;
  }
}

function unloadTwRevenue() {
  TWR.charts.forEach(c => c.destroy());
  TWR.charts = [];
}

// 받은 줄을 상태로 정리하고 밸류체인 요약을 계산한다(원본 render_taiwan_revenue의 summary_rows)
function twrSetData(uni, rows) {
  const cats = [];
  uni.forEach(u => {
    let c = cats.find(x => x.name === u.category);
    if (!c) cats.push(c = { name: u.category, members: [] });
    c.members.push({ ticker: String(u.ticker), name: u.name });
  });
  const by = {};
  rows.forEach(r => {
    if (r.revenue == null) return;
    (by[r.ticker] = by[r.ticker] || []).push({
      ym: r.ym, rev: r.revenue / 1000,                       // 천 TWD → 백만 TWD
      mom: r.mom == null ? null : +r.mom, yoy: r.yoy == null ? null : +r.yoy,
    });
  });
  // 공식 증감률이 빈 달은 저장된 매출로 계산(원본: 공식 값이 없을 때만 시계열에서 계산)
  const shift = (ym, n) => { const d = new Date(ym + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - n); return d.toISOString().slice(0, 10); };
  Object.values(by).forEach(list => {
    const at = Object.fromEntries(list.map(x => [x.ym, x.rev]));
    list.forEach(x => {
      const p1 = at[shift(x.ym, 1)], p12 = at[shift(x.ym, 12)];
      if (x.mom == null && p1) x.mom = (x.rev / p1 - 1) * 100;
      if (x.yoy == null && p12) x.yoy = (x.rev / p12 - 1) * 100;
    });
  });
  const latest = rows.reduce((m, r) => (r.revenue != null && r.ym > m ? r.ym : m), '');
  const yEnd = latest ? +latest.slice(0, 4) : new Date().getFullYear();
  const prevYm = latest ? shift(latest, 12) : null;
  const revAt = (t, ym) => (by[t] || []).find(x => x.ym === ym)?.rev;

  const sum = {};
  cats.forEach(c => {
    const cur = c.members.map(m => [m.ticker, revAt(m.ticker, latest)]).filter(([, v]) => v != null);
    const curSum = cur.reduce((s, [, v]) => s + v, 0);
    const prev = cur.map(([t]) => revAt(t, prevYm)).filter(v => v != null);
    const prevSum = prev.reduce((s, v) => s + v, 0);
    sum[c.name] = {
      present: cur.length, total: c.members.length,
      yoy: cur.length && prev.length && prevSum !== 0 ? (curSum / prevSum - 1) * 100 : null,
    };
  });
  Object.assign(TWR, { cats, by, latest: latest || null, sum, years: [yEnd - 3, yEnd - 2, yEnd - 1, yEnd] });
  if (!TWR.cat || !cats.some(c => c.name === TWR.cat)) TWR.cat = (cats.find(c => c.members.some(m => by[m.ticker])) || cats[0])?.name || null;
}

const _twrNum = v => v == null ? '—' : Math.round(v).toLocaleString();
const _twrPct = (v, d = 1) => v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d) + '%';
const _twrColor = v => v == null ? 'var(--text2)' : v > 0 ? 'var(--up)' : v < 0 ? 'var(--down)' : 'var(--text1)';
const _twrYm = ym => ym ? `${ym.slice(0, 4)}.${ym.slice(5, 7)}` : '—';

function setTwrSort(s) {
  TWR.sort = s;
  document.querySelectorAll('[data-twr-sort]').forEach(b => b.classList.toggle('active', b.dataset.twrSort === s));
  twrRenderCats();
}

function setTwrCat(name) {
  TWR.cat = name;
  twrRenderCats();
  twrRenderDetail();
}

function twrRender() {
  const asof = document.getElementById('twr-asof');
  if (!TWR.cats.length || !TWR.latest) {
    document.getElementById('twr-cats').innerHTML = '<div class="twr-msg">아직 받은 자료가 없습니다 — 매일 21시 10분에 채워집니다.</div>';
    if (asof) asof.textContent = '';
    return;
  }
  const all = new Set(TWR.cats.flatMap(c => c.members.map(m => m.ticker)));
  const filed = [...all].filter(t => (TWR.by[t] || []).some(x => x.ym === TWR.latest)).length;
  if (asof) asof.innerHTML = `<b>${_twrYm(TWR.latest)} 실적</b> · 신고 ${filed} / ${all.size}종목 · ${TWR.years[0]}~${TWR.years[3]} · 단위 백만 대만달러`;
  twrRenderCats();
  twrRenderDetail();
}

// 밸류체인 목록 — 합산 전년비 막대(가운데 0), 누르면 오른쪽에 기업 그래프
function twrRenderCats() {
  const box = document.getElementById('twr-cats');
  if (!box) return;
  const list = TWR.cats.map(c => ({ ...c, ...TWR.sum[c.name] }));
  if (TWR.sort === 'yoy') list.sort((a, b) => (b.yoy ?? -Infinity) - (a.yoy ?? -Infinity));
  // 막대 길이는 ±100%에서 꽉 찬다 — 몇 배씩 뛴 밸류체인 하나가 나머지를 눌러 버리지 않게
  const w = v => (Math.min(Math.abs(v), 100) / 100 * 50).toFixed(1);
  box.innerHTML = `<div class="twr-list" role="listbox" aria-label="밸류체인">${list.map(c => `
    <button type="button" class="twr-cat${c.name === TWR.cat ? ' on' : ''}" role="option" aria-selected="${c.name === TWR.cat}"
      data-twr-cat="${escAttr(c.name)}" ${c.present ? '' : 'disabled'}>
      <span class="twr-cat-n" title="${escAttr(c.name)}">${escapeHtml(c.name)}</span>
      <span class="twr-cat-c" title="최신 달 매출을 신고한 기업 수 / 전체">${c.present}/${c.total}</span>
      <span class="twr-cat-bar">${c.yoy == null ? '' : `<i style="${c.yoy >= 0 ? 'left:50%' : 'right:50%'};width:${w(c.yoy)}%;background:${_twrColor(c.yoy)}"></i>`}</span>
      <b class="twr-cat-v" style="color:${_twrColor(c.yoy)}">${_twrPct(c.yoy)}</b>
    </button>`).join('')}</div>
    <div class="twr-foot">합산 전년비 = 최신 달에 신고한 기업들의 매출 합을 그 기업들의 1년 전 같은 달 매출 합과 비교. 막대는 ±100%에서 끝까지 찹니다.</div>`;
  box.querySelectorAll('[data-twr-cat]').forEach(b => b.addEventListener('click', () => setTwrCat(b.dataset.twrCat)));
}

function twrRenderDetail() {
  const box = document.getElementById('twr-detail');
  if (!box) return;
  unloadTwRevenue();
  const cat = TWR.cats.find(c => c.name === TWR.cat);
  if (!cat) { box.innerHTML = ''; return; }
  const s = TWR.sum[cat.name] || {};
  const present = cat.members.filter(m => (TWR.by[m.ticker] || []).length);
  const absent = cat.members.filter(m => !(TWR.by[m.ticker] || []).length);
  const lastOf = m => TWR.by[m.ticker][TWR.by[m.ticker].length - 1];
  const upCnt = present.filter(m => lastOf(m).yoy > 0).length;

  box.innerHTML = `
    <div class="twr-dhead">
      <h3>${escapeHtml(cat.name)}</h3>
      <span>합산 전년비 <b style="color:${_twrColor(s.yoy)}">${_twrPct(s.yoy)}</b></span>
      <span>전년보다 늘어난 기업 <b>${upCnt}</b> / ${present.length}</span>
    </div>
    <div class="twr-grid">${present.map((m, i) => {
      const last = lastOf(m);
      return `<div class="card twr-co">
        <div class="twr-co-h">
          <b>${escapeHtml(m.name)}</b><code>${escapeHtml(m.ticker)}</code>
          <span class="twr-co-v">${_twrNum(last.rev)}</span>
        </div>
        <div class="twr-co-s">
          <span>${last.ym === TWR.latest ? '' : `<em>${_twrYm(last.ym)} 실적(최신 달 미신고)</em> · `}전월비 <b style="color:${_twrColor(last.mom)}">${_twrPct(last.mom)}</b></span>
          <span>전년비 <b style="color:${_twrColor(last.yoy)}">${_twrPct(last.yoy)}</b></span>
        </div>
        <div class="twr-co-c"><canvas id="twr-cv-${i}" role="img" aria-label="${escAttr(m.name)} 연도별 월매출"></canvas></div>
      </div>`;
    }).join('')}</div>
    <div class="twr-legend">${TWR.years.map((y, i) => `<span><i style="background:${SERIES_PAL[i]}"></i>${y}</span>`).join('')}
      <span class="twr-legend-n">가로축 1~12월 · 세로축 백만 대만달러${absent.length ? ` · 자료 없음: ${absent.map(m => `${escapeHtml(m.name)}(${escapeHtml(m.ticker)})`).join(', ')}` : ''}</span></div>`;

  const t = chartTheme();
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  present.forEach((m, i) => {
    const cv = document.getElementById(`twr-cv-${i}`);
    if (!cv) return;
    const list = TWR.by[m.ticker];
    const datasets = TWR.years.map((y, yi) => {
      const cur = yi === TWR.years.length - 1;
      return {
        label: String(y),
        data: months.map(mo => list.find(x => x.ym === `${y}-${String(mo).padStart(2, '0')}-01`)?.rev ?? null),
        borderColor: SERIES_PAL[yi] + (cur ? '' : 'b3'), backgroundColor: SERIES_PAL[yi],
        borderWidth: cur ? 2.4 : 1.4, pointRadius: cur ? 2.6 : 1.6, pointHoverRadius: 4, tension: 0.15, spanGaps: false,
      };
    }).filter(d => d.data.some(v => v != null));
    TWR.charts.push(new Chart(cv.getContext('2d'), {
      type: 'line',
      data: { labels: months, datasets },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: {
            title: items => `${items[0].label}월`,
            label: ctx => `${ctx.dataset.label}년: ${_twrNum(ctx.parsed.y)}`,
          } },
        },
        scales: {
          x: { ticks: { color: t.tick, font: { size: 10 }, maxRotation: 0, callback: (v, idx) => (idx % 2 === 0 ? months[idx] : '') }, grid: { color: t.grid } },
          y: { ticks: { color: t.tick, font: { size: 10 }, maxTicksLimit: 5, callback: v => (+v).toLocaleString() }, grid: { color: t.grid } },
        },
      },
    }));
  });
}
