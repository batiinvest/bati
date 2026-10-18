// 기업 분석 리포트 — DART 분석 탭 (lazy 로드·MD 딥파싱·사업섹션 파서·아코디언·업로드) (report.js에서 분할)

// ── DART 탭: 블로그 기업분석 글 순서로 카드 배치 ─────────────────────────────
// 기업 정보(기본·주가 희석·보호예수·계열회사) → 주주(주주구성표·대표이사) → 사업(매출·고객 집중도·원재료·생산·수주)
// → 실적(핵심 지표·분기 실적 추이) → 투자 판단(종합판단·포인트/리스크·증권사 전망·이벤트) → 상세 분석(MD 전문).
// 카드 하나 = 블로그 이미지 하나(이미지 저장 버튼으로 복사·저장). 순서 기준: blog.naver.com/bati_invest 기업분석 글
// DART 분석 = 종합분석 — 앞 탭들의 결과를 모아 맨 위 '종합분석 결과'로 요약하고, 아래에 근거 구역을 둔다.
// 구역은 그 탭의 함수를 그대로 씀(같은 내용을 따로 만들지 않음):
//   기업 정보 = 기업개요 · 주주·지분 = 지분현황 · 사업 = 사업분석 · 실적 = 재무분석 · 밸류에이션·지표 = 기업현황·투자지표
//   시장 평가 = 최근리포트 · 수급 = 수급흐름 · 공시·이벤트 = 금감원공시. 무거운 탭은 화면에 다가올 때 불러옴(_rpDartLazy).
// MD는 MD에만 있는 내용(주가 희석·보호예수·주주 명세·대표이사·고객 집중도·종합판단·증권사 추정·이벤트·상세)만 더하고
// '보고서 시점'으로 표기 — 같은 항목이 DB에도 있으면 DB(최신)를 앞에 둔다. MD가 없어도 DB 항목으로 종합은 나옴.
async function _rpLoadAndRenderDart(body) {
  if (!_rpStock) return;
  const code = _rpStock.code;
  const q = (pr, d) => Promise.resolve(pr).then(r => r?.data ?? d).catch(() => d);
  const [{ data }, biz, comp, stage, flowV, flow20, ana] = await Promise.all([
    Promise.resolve(sb.from('dart_reports').select('report_type,receive_date,raw_md,summary')
      .eq('stock_code', code).order('receive_date', { ascending: false }).limit(1).maybeSingle()).catch(() => ({ data: null })),
    typeof _rpBizFetch === 'function' ? _rpBizFetch(code).catch(() => null) : Promise.resolve(null),
    q(sb.from('companies').select('corp_code,market,sector,product,industry,sub_industry,wics_sector').eq('code', code).maybeSingle(), {}),
    q(sb.from('earnings_stage').select('period,stage,fs_div').eq('stock_code', code).maybeSingle(), null),
    typeof _rpFlowVerdict === 'function' ? _rpFlowVerdict(code).catch(() => null) : Promise.resolve(null),
    q(sb.from('market_data').select('base_date,price,foreign_net_buy,institution_net_buy,market_warn_code')
      .eq('stock_code', code).order('base_date', { ascending: false }).limit(20), []),
    q(sb.from('analyst_opinions').select('firm_name,opinion,target_price,opinion_date,opinion_code')
      .eq('stock_code', code).order('opinion_date', { ascending: false }).limit(100), []),
  ]);
  // 공시 — 금감원공시 탭과 같은 목록(150건) · 지분현황 탭과 같은 지분 공시(40건)
  const cc = comp?.corp_code;
  const since90 = new Date(Date.now() - 90 * 86400e3).toISOString().slice(0, 10);
  const [discAll, discOwn, own90] = cc ? await Promise.all([
    q(sb.from('daily_disclosures').select('base_date,report_nm,category,rcept_no,insider_summary')
      .eq('corp_code', cc).order('base_date', { ascending: false }).limit(150), []),
    q(sb.from('daily_disclosures').select('base_date,report_nm,category,rcept_no,insider_summary')
      .eq('corp_code', cc).in('category', typeof _RP_OWN_CATS !== 'undefined' ? _RP_OWN_CATS : []).order('base_date', { ascending: false }).limit(40), []),
    // 종합분석 '지분' 줄 — 최근 90일 건수는 count로 정확히(지분현황 목록 40건에서 세면 삼성전자 824건이 40건으로 잘림)
    Promise.resolve(sb.from('daily_disclosures').select('rcept_no,base_date,category,insider_summary', { count: 'exact' })
      .eq('corp_code', cc).in('category', typeof _RP_OWN_CATS !== 'undefined' ? _RP_OWN_CATS : []).gte('base_date', since90)
      .order('base_date', { ascending: false }).limit(1000)).then(r => ({ rows: r.data || [], count: r.count ?? (r.data || []).length })).catch(() => null),
  ]) : [[], [], null];
  // 지분 변동 = 지분현황 탭과 같은 목록(수집분 + 5월 이전 이력)
  const H = typeof _rpOwnHistory === 'function' ? await _rpOwnHistory(cc, discOwn).catch(() => null) : null;
  const ownList = H?.discs || discOwn, trades = H?.trades || {};
  if (_rpStock?.code !== code) return;   // 그 사이 다른 종목으로 바뀜

  const s   = data?.summary || {};
  const md  = data?.raw_md || '';
  const dp  = md ? _mdDeepParse(md, s) : {};
  const M   = _rpDartModel(md);
  const L   = md ? _rpStripRawSections(md).split('\n').map(l => l.replace(/\r$/, '')) : [];
  const esc = escapeHtml;
  const latest = _rpData?.price?.[0] || {};
  const latestF = _rpData?.fin?.[0] || {};
  if (data) RPP.sites.dart = { code, reportType: data.report_type, summary: s, dp, rerender: () => _rpLoadAndRenderDart(body) };

  // 사업: 데이터 있는 섹션만, 국내/해외 매출 다음에 고객 집중도(MD 4-2)
  const bizList = biz && typeof _rpBizSections === 'function' ? _rpBizSections(biz).list.filter(x => x.has) : [];
  const cust = _rpDartCustomers(L);
  const at = Math.max(bizList.findIndex(x => x.key === 'region'), bizList.findIndex(x => x.key === 'product'));
  // 차트(사업분석 탭) 바로 아래에 그 소절의 MD 해석(_rpDartBizNote)
  const withNote = x => x.html + _rpDartBizNote(L, x.key);
  const bizHtml = [...bizList.slice(0, at + 1).map(withNote), cust, ...bizList.slice(at + 1).map(withNote)].join('');

  const major = typeof _rpNormName === 'function' ? new Set([...(H?.majors || []), _rpNormName(dp.majorShareholder)].filter(Boolean)) : null;
  const ctx = { data, s, M, comp, stage, flowV, flow20, ana, discAll, discOwn: ownList, trades, major, own90, latest, latestF };
  const box = (inner, title) => `<div data-capture style="${_RPD_CARD}">${title ? _rpdT(title) : ''}${inner}</div>`;
  const lazy = (key, title) => box(`<div data-rpd-lazy="${key}"><div style="text-align:center;color:var(--text2);padding:20px"><span class="loading"></span> 불러오는 중...</div></div>`, title);
  const pts = s.investment_points?.length || s.risk_points?.length;
  // 주주·지분 = 지분현황 탭 카드 그대로, 순서만 '지금 구조 → 사람 → 변화'(구성·외국인 → 주주 명세 → 대표이사 → 차트 → 변동내역)
  const OP = typeof _rpOwnershipParts === 'function'
    ? _rpOwnershipParts({ discs: ownList, dp, s, dart: data, trades, majors: H?.majors, prices: _rpData?.price || [], latest }) : null;

  body.innerHTML = `
  <div style="display:flex;flex-direction:column;gap:14px">

  <!-- 리포트 헤더 -->
  <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:10px;
    padding-bottom:14px;border-bottom:2px solid color-mix(in srgb, var(--tg) 25%, transparent)">
    <div>
      <div style="font-size:calc(20px*var(--m-title));font-weight:800;color:var(--text1)">${esc(dp.stockName || _rpStock?.name || '')}</div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:4px;flex-wrap:wrap">
        <span style="font-size:calc(12px*var(--m-sub));color:var(--text2)">${esc(dp.stockCode || code)}</span>
        ${data ? `<span style="font-size:calc(12px*var(--m-sub));padding:2px 9px;border-radius:100px;
          background:color-mix(in srgb, var(--tg) 12%, transparent);color:var(--tg);font-weight:600">${esc(data.report_type||'')}</span>
        <span style="font-size:calc(12px*var(--m-sub));color:var(--text2)">MD 접수 ${esc(data.receive_date||'')}</span>
        ${dp.updated ? `<span style="font-size:calc(12px*var(--m-sub));color:var(--text2)">검토 ${esc(dp.updated)}</span>` : ''}
        ${dp.receiptNo ? `<a href="https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${dp.receiptNo}" target="_blank" rel="noopener"
          style="font-size:calc(12px*var(--m-sub));color:var(--tg);text-decoration:none">DART 원문 ↗</a>` : ''}`
        : `<span style="font-size:calc(12px*var(--m-sub));color:var(--text2)">DART 분석 MD 없음 — 업로드하면 MD 항목(희석·대표이사·종합판단 등)이 더해집니다</span>`}
      </div>
    </div>
    <button onclick="document.getElementById('rp-dart-file').click()"
      style="padding:5px 12px;font-size:calc(11px*var(--m-label));border:1px solid var(--border);
        border-radius:var(--radius-sm);background:var(--bg3);color:var(--text2);cursor:pointer;white-space:nowrap">
      ${data ? '최신 업로드' : 'DART 업로드'}
    </button>
  </div>

  ${_rpDartSecHead('종합분석 결과')}
  ${_rpDartOverview(ctx)}
  ${M.verdict ? _rpDartVerdict(M, data) : ''}
  ${pts && typeof _rpBullBearCard === 'function' ? `<div id="rpd-sec-risk" style="scroll-margin-top:70px">${_rpBullBearCard(s.investment_points, s.risk_points)}</div>` : ''}

  ${_rpDartSecHead('시세 · 주주현황', '', ['기업현황'], 'quote')}
  ${typeof _rpQuoteCard === 'function' ? _rpQuoteCard(latest, _rpData?.price || []) : ''}

  ${_rpDartSecHead('기업 정보', '', ['기업개요'], 'info')}
  ${_rpProfileInfoCard({ comp, dart: data, dp, latest }, 'dart')}
  ${_rpDartDilution(L)}
  ${_rpDartLockup(L)}
  ${dp.subsidiaries?.length ? _rpProfileSubsCard(dp) : ''}

  ${_rpDartSecHead('주주 · 지분', '', ['지분현황'], 'own')}
  ${OP ? _rpOwnPair(OP) : ''}
  ${_rpDartHolders(L)}
  ${_rpDartCeo(L)}
  ${OP ? OP.chart + OP.list : ''}

  ${_rpDartSecHead('사업', '산업·제품 설명은 블로그에서 직접 작성', ['사업분석'], 'biz')}
  ${bizHtml || box(`<div style="font-size:calc(12px*var(--m-sub));color:var(--text3);padding:10px 0;text-align:center">DART 업로드 시 사업 데이터가 표시됩니다</div>`)}

  ${_rpDartSecHead('실적', '표의 항목을 누르면 차트에 추가', ['재무분석'], 'perf')}
  ${lazy('fin')}

  ${_rpDartSecHead('밸류에이션 · 투자지표', '', ['기업현황', '투자지표'], 'val')}
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:12px">
    ${typeof _rpValuationCard === 'function' ? _rpValuationCard(latestF, latest) : ''}
    ${typeof _rpFinHealthCard === 'function' ? _rpFinHealthCard(latestF) : ''}
  </div>
  ${lazy('inv', '투자지표')}

  ${_rpDartSecHead('시장 평가', '증권사 의견·목표가', ['최근리포트'], 'mkt')}
  ${lazy('rep', '증권사 투자의견 이력')}
  ${_rpDartEstimates(M)}

  ${_rpDartSecHead('수급', '', ['수급흐름'], 'flow')}
  <div data-rpd-lazy="flow"><div style="text-align:center;color:var(--text2);padding:20px"><span class="loading"></span> 불러오는 중...</div></div>

  ${_rpDartSecHead('공시 · 이벤트', '', ['금감원공시'], 'disc')}
  ${lazy('fss', '공시 목록')}
  ${_rpDartEvents(M)}

  ${md ? `${_rpDartSecHead('상세 분석', 'MD 전문 · 섹션을 누르면 펼침')}
  <div style="display:flex;flex-direction:column;gap:4px">
    ${_mdToAccordion(md)}
  </div>` : ''}

  </div>`;

  _rpDartLazy(body);
}

// 화면에 다가오면 그 탭의 로더를 부름 — 탭 9개 데이터를 한꺼번에 받지 않게
const RPD_LAZY = {
  fin:  el => _rpLoadAndRenderFinAnalysis(el, { view: 'quarter' }),
  inv:  el => _rpLoadAndRenderInvMetrics(el),
  rep:  el => _rpLoadAndRenderReports(el),
  flow: el => _rpLoadAndRenderFlow(el),
  fss:  el => _rpLoadAndRenderFss(el),
};
function _rpDartLazy(root) {
  const els = [...root.querySelectorAll('[data-rpd-lazy]')];
  const run = el => {
    const fn = RPD_LAZY[el.dataset.rpdLazy];
    el.removeAttribute('data-rpd-lazy');
    if (typeof fn === 'function') Promise.resolve().then(() => fn(el)).catch(e => {
      el.innerHTML = `<div style="padding:16px;text-align:center;color:var(--red);font-size:calc(12px*var(--m-sub))">불러오기 실패: ${escapeHtml(e?.message || String(e))}</div>`;
    });
  };
  if (!('IntersectionObserver' in window)) { els.forEach(run); return; }
  const io = new IntersectionObserver(es => es.forEach(en => {
    if (!en.isIntersecting) return;
    io.unobserve(en.target);
    run(en.target);
  }), { rootMargin: '800px 0px' });
  els.forEach(el => io.observe(el));
}

// 전년 같은 분기 대비 — 둘 다 플러스면 증감률(상승 빨강·하락 파랑), 부호가 바뀌면 흑자/적자전환
function _rpdYoY(cur, prev) {
  if (cur == null || prev == null) return '';
  let t, c;
  if (prev > 0 && cur > 0) { const p = (cur - prev) / prev * 100; t = `YoY ${p >= 0 ? '+' : ''}${p.toFixed(1)}%`; c = p >= 0 ? 'var(--red)' : 'var(--blue)'; }
  else if (prev <= 0 && cur > 0) { t = '흑자전환'; c = 'var(--red)'; }
  else if (prev > 0 && cur <= 0) { t = '적자전환'; c = 'var(--blue)'; }
  else { t = cur > prev ? '적자축소' : cur < prev ? '적자확대' : '적자지속'; c = cur > prev ? 'var(--red)' : 'var(--blue)'; }
  return `<span style="color:${c};font-weight:600">${t}</span>`;
}

// ── 종합분석 결과 ──────────────────────────────────────────────────────────────
// 앞 탭들의 결과를 구분별 한 줄로 + 맨 위 '긍정 / 주의' — 앱에 이미 있는 판정만 모아 나눔(새 점수·가중치 없음):
//   신호등 양호/주의(_rpSignal, 보통은 뺌) · 종합 판단 신호 good/warn·bad(_rpSynthesis, 기업현황) · 실적 국면 원본 표시 매수/매도 ·
//   수급 단계 이제 시작·채우는 중 / 꺾임·다 찼다(원저자 말: 꺾이면 비중 축소, 다 찼다 = 과열권) · 주도 업종 빈집·태린이아빠 후보 ·
//   시장경고 · MD 리스크. ROE는 최근 4분기 순이익 기준(_rpTtmRatios), 금융업은 이익률·부채비율 판정 안 함(_rpIsFinancial)
function _rpDartOverview(x) {
  const e = escapeHtml, rows = [], pos = [], neg = [];
  const add = (key, label, fact, basis) => { if (fact) rows.push({ key, label, fact, basis: basis || '' }); };
  const JC = typeof RP_JUDGE_COLOR !== 'undefined' ? RP_JUDGE_COLOR : { good: '#22c55e', mid: '#8b90a7', caution: '#f59e0b' };
  const chip = sig => sig ? ` <span style="font-size:calc(11px*var(--m-label));padding:1px 6px;border-radius:100px;background:${sig.color}20;color:${sig.color};font-weight:700">${sig.label}</span>` : '';
  const none = t => ` <span style="color:var(--text3)">${t}</span>`;
  const sigOf = (k, v) => typeof _rpSignal === 'function' ? _rpSignal(k, v) : null;
  // 신호등 하나 — 값·칩을 그리고 양호/주의면 긍정/주의 목록에도
  const light = (name, val, sig) => {
    if (sig?.grade === 'strong') pos.push(`${name} ${val} 양호`);
    if (sig?.grade === 'weak') neg.push(`${name} ${val} 주의`);
    return `${name} <b>${val}</b>${chip(sig)}`;
  };
  const num = v => v == null ? '—' : Math.round(v).toLocaleString();
  const fin = _rpData?.fin || [];
  const f0 = fin.find(r => /^Q[1-4]$/.test(r.quarter));
  const fPer = f0 ? `${f0.bsns_year} ${f0.quarter}` : '';
  const finCo = typeof _rpIsFinancial === 'function' && _rpIsFinancial(x.comp);

  // 시세 — 현재가·시총·52주 위치·기간 수익률(기업현황 시세 및 주주현황 카드와 같은 값). 사실만, 판정 없음
  {
    const L = x.latest, parts = [];
    const pct = v => v == null ? '' : `<span style="color:${v > 0 ? 'var(--red)' : v < 0 ? 'var(--blue)' : 'var(--text3)'};font-weight:600">${v >= 0 ? '+' : ''}${v.toFixed(2)}%</span>`;
    if (L.price) parts.push(`현재가 <b>${num(L.price)}원</b> ${pct(L.price_change_rate)}`);
    if (L.market_cap) parts.push(`시총 <b>${fmtCap(L.market_cap)}</b>`);
    const p52 = typeof _rp52Pos === 'function' ? _rp52Pos(L) : null;
    if (p52 != null) parts.push(`52주 위치 <b>${p52}%</b>${none(`(저 ${num(L.w52_low)} · 고 ${num(L.w52_high)})`)}`);
    const rets = [['1M', L.month_return], ['3M', L.quarter_return], ['1Y', L.year_return]].filter(([, v]) => v != null);
    if (rets.length) parts.push('수익률 ' + rets.map(([k, v]) => `${k} ${pct(v)}`).join(' '));
    add('quote', '시세', parts.join(' · '), L.base_date || '');
  }

  // 사업 — 최근 분기 제품별 매출 구성(사업분석)
  const seg = (_rpData?.segment || []).filter(r => (r.category || '').trim() !== '합계' && (r.subcategory || '').trim() !== '합계');
  if (seg.length) {
    const pk = r => `${r.bsns_year} ${r.quarter}`, lastP = pk(seg[seg.length - 1]), by = {};
    for (const r of seg.filter(r => pk(r) === lastP)) {
      const n = typeof _rpSegLabel === 'function' ? _rpSegLabel(r) : (r.category || '').trim();
      if (n) by[n] = (by[n] || 0) + (+r.revenue || 0);
    }
    const tot = Object.values(by).reduce((a, v) => a + v, 0);
    const top = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (tot > 0) add('biz', '사업', '매출 구성 ' + top.map(([n, v]) => `${e(n)} <b>${(v / tot * 100).toFixed(0)}%</b>`).join(' · '), lastP);
  }

  // 실적 — 최근 분기 매출·영업이익 전년비(재무분석) + 실적 국면(실적 국면 페이지, 원본 '실적확인' 표시)
  if (f0) {
    const fy = fin.find(r => String(r.bsns_year) === String(Number(f0.bsns_year) - 1) && r.quarter === f0.quarter);
    const st = x.stage?.stage;
    let stTxt;
    if (st) {
      const buy = typeof ES_BUY === 'function' && ES_BUY(st), sell = typeof ES_SELL === 'function' && ES_SELL(st);
      if (buy) pos.push(`실적 국면 ${st} (원본 매수)`);
      if (sell) neg.push(`실적 국면 ${st} (원본 매도)`);
      stTxt = ` · 실적 국면 ${typeof _esChip === 'function' ? _esChip(st, x.stage.period) : e(st)}`
        + (buy ? ` <span style="color:${JC.good};font-weight:600">원본 표시 매수</span>` : sell ? ` <span style="color:${JC.caution};font-weight:600">원본 표시 매도</span>` : '')
        + (x.stage.period && x.stage.period !== `${f0.bsns_year}Q${String(f0.quarter).slice(1)}` ? none(`(${e(x.stage.period)})`) : '');
    } else stTxt = ` · 실적 국면${none(`판정 없음${x.stage?.period ? ` (${e(x.stage.period)})` : ''}`)}`;
    add('perf', '실적', `매출 <b>${fmtCap(f0.revenue)}</b> ${_rpdYoY(f0.revenue, fy?.revenue)} · 영업이익 <b>${fmtCap(f0.operating_profit)}</b> ${_rpdYoY(f0.operating_profit, fy?.operating_profit)}${stTxt}`, fPer);
  }

  // 수익성·건전성 — 신호등(기업현황 밸류에이션·재무 건전성 카드와 같은 기준)
  if (f0) {
    const t = typeof _rpTtmRatios === 'function' ? _rpTtmRatios(fin) : {};
    const opm = f0.revenue > 0 && f0.operating_profit != null ? f0.operating_profit / f0.revenue * 100 : null;
    const parts = [t.roe != null ? light('ROE(최근 4분기)', `${t.roe.toFixed(1)}%`, sigOf('roe', t.roe)) : `ROE(최근 4분기)${none('판정 없음 — 연속 4개 분기 없음')}`];
    if (finCo) {
      if (f0.debt_ratio != null) parts.push(`부채비율 <b>${f0.debt_ratio.toFixed(0)}%</b>`);
      parts.push(none('금융업 — 이익률·부채비율 판정 안 함'));
    } else {
      if (opm != null) parts.push(light('영업이익률(이번 분기)', `${opm.toFixed(1)}%`, sigOf('opm', opm)));
      if (f0.debt_ratio != null) parts.push(light('부채비율', `${f0.debt_ratio.toFixed(0)}%`, sigOf('debt', f0.debt_ratio)));
    }
    add('val', '수익성 · 건전성', parts.join(' · '), fPer);
  }

  // 밸류에이션 — PER·PBR 신호등 + 업종 중앙값(기업현황) + 종합 판단 신호(_rpSynthesis — 짧은 이름만, 문장은 아래 밸류에이션 카드)
  {
    const L = x.latest, ps = _rpData?.peerStats, parts = [];
    const peer = (v, d) => v ? ` <span style="color:var(--text2)">업종 ${v.toFixed(d)}x</span>` : '';
    // PER·PBR(시세)은 직전 결산 기준 — 최근 4분기 이익 기준 PER·현재 자본 PBR을 옆에(기업현황 밸류에이션 카드와 같은 값)
    const vb = typeof _rpValBasis === 'function' ? _rpValBasis(L, fin) : {};
    if (L.per != null) parts.push((L.per > 0 ? light('PER(직전 결산)', `${L.per.toFixed(1)}x`, sigOf('per', L.per)) : `PER(직전 결산) <b>적자</b>${none(`(${L.per.toFixed(1)}x)`)}`) + peer(ps?.per, 1)
      + (vb.perTtm != null ? ` <span style="color:var(--text2)">· 최근 4분기 ${vb.perTtm > 0 ? `<b style="color:var(--text1)">${vb.perTtm.toFixed(1)}x</b>${ps?.perTtm ? ` (업종 ${ps.perTtm.toFixed(1)}x)` : ''}` : '적자'}</span>` : ''));
    if (L.pbr != null) parts.push((L.pbr > 0 ? light('PBR(직전 결산)', `${L.pbr.toFixed(2)}x`, sigOf('pbr', L.pbr)) : `PBR <b>${L.pbr.toFixed(2)}x</b>`) + peer(ps?.pbr, 2)
      + (vb.pbrNow ? ` <span style="color:var(--text2)">· 현재 자본 <b style="color:var(--text1)">${vb.pbrNow.toFixed(2)}x</b></span>` : ''));
    const syn = typeof _rpSynthesis === 'function' && f0 ? _rpSynthesis(x.latestF, L, fin).filter(g => g.type !== 'neutral') : [];
    syn.forEach(g => (g.type === 'good' ? pos : neg).push(g.tag || g.msg));
    const synHtml = syn.length ? `<div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px 10px;font-size:calc(11.5px*var(--m-sub))">
      <span style="color:var(--text2)">종합 판단 신호</span>${syn.map(g => `<span title="${escAttr(g.msg)}" style="color:var(--text1)"><span style="color:${g.type === 'good' ? JC.good : JC.caution};font-weight:700">●</span> ${e(g.tag || g.msg)}</span>`).join('')}</div>` : '';
    if (parts.length || synHtml) add('val', '밸류에이션', parts.join(' · ') + synHtml, L.base_date || '');
  }

  // 시장 평가 — 3개월 컨센서스(최근리포트 탭과 같은 계산)
  if (x.ana?.length && typeof _rpConsensusSummary === 'function') {
    const c = _rpConsensusSummary(x.ana, x.latest.price);
    add('mkt', '시장 평가', c.recent.length
      ? `3개월 평균 목표가 <b>${num(c.avgTp)}원</b>${c.upside != null ? ` <span style="color:${c.upside >= 0 ? 'var(--red)' : 'var(--blue)'}">현재가 대비 ${c.upside >= 0 ? '+' : ''}${c.upside.toFixed(1)}%</span>` : ''} · 의견 ${c.recent.length}건(매수 ${c.buy})`
      : `최근 3개월 의견 없음${none(`· 마지막 ${e(x.ana[0].firm_name || '')} ${e(x.ana[0].opinion || '')}`)}`,
      x.ana[0]?.opinion_date || '');
  }

  // 수급 — 수급 칸·빈집·주도 업종·태린이아빠 후보(수급흐름 탭·기업분석 표와 같은 판정) + 20거래일 외국인·기관 누적
  {
    const v = x.flowV, parts = [];
    const gg = v?.flow_gauge && typeof flowGauge === 'function' ? flowGauge(v.flow_gauge) : null;
    const fq = v && typeof _finFlowQ === 'function' ? _finFlowQ(v) : null;
    const fk = v && typeof _finFlowKey === 'function' ? _finFlowKey(v) : null;
    const te = v?.lead_flags && typeof taerinEval === 'function' ? taerinEval(v.flow_gauge, v.lead_flags, v.flow_pctl) : null;
    if (gg) {
      parts.push(`수급 칸 ${flowGaugeBar(gg)} <b style="color:${gg.color}">${gg.label}</b>`);
      if (gg.key === 'start' || gg.key === 'fill') pos.push(`수급 ${gg.label}`);
      if (gg.key === 'top' || gg.key === 'turn') neg.push(`수급 ${gg.label}`);
    } else if (!v) parts.push(`수급${none('판정 없음(수집 대상 밖이거나 판정 전)')}`);
    if (fq) { parts.push(`<b>${fq.label}</b>`); if (fk === 'fill') pos.push('주도 업종 빈집'); }
    if (v?.lead_flags) parts.push(v.lead_flags.lead ? '<b style="color:#f59e0b">주도 업종</b>' : '주도 업종 아님');
    if (te?.label) { parts.push(`태린이아빠 후보 <b style="color:#f59e0b">${te.label}</b>`); pos.push(`태린이아빠 후보 ${te.label}`); }
    // 금액 = 순매수 주식 수 × 그날 종가(근사 — 오늘의 수급 메시지와 같은 방식). 주식 수는 칸에 마우스를 올리면
    const acc = k => { let w = 0, q = 0, n = 0; for (const r of x.flow20 || []) if (r[k] != null) { q += r[k]; n++; if (r.price) w += r[k] * r.price; } return n ? { w, q } : null; };
    const amt = a => a ? `<span title="${escAttr(`${a.q >= 0 ? '+' : ''}${a.q.toLocaleString()}주`)}" style="color:${a.w >= 0 ? 'var(--red)' : 'var(--blue)'};font-weight:600">${a.w >= 0 ? '+' : ''}${fmtCap(a.w)}</span>` : '—';
    const fa = acc('foreign_net_buy'), ia = acc('institution_net_buy');
    if (fa || ia) parts.push(`20거래일 외국인 ${amt(fa)} · 기관 ${amt(ia)}${none('(주식 수×종가)')}`);
    add('flow', '수급', parts.join(' · '), v?.base_date || x.flow20?.[0]?.base_date || '');
  }

  // 지분 — 최대주주측 지분(MD 요약) + 최근 90일 지분 공시 건수(종류별) + 임원·주요주주 취득/처분.
  // insider_summary: scope:'report'면 그 보고서 한 건 → 행마다 더함. scope 없는 옛 요약은 '그 회사 그날 전체 합계'를
  // 행마다 복사한 값이라 날짜마다 한 번만(삼성전자 07-21 761번 중복). 대량보유(5% 보유자)는 매매가 아니라 건수만
  {
    const parts = [];
    if (x.s.related_party_ratio != null) parts.push(`최대주주+특관 <b>${(+x.s.related_party_ratio).toFixed(1)}%</b>${none('(MD)')}`);
    const o = x.own90;
    if (o?.count) {
      const cnt = {};
      o.rows.forEach(d => { const c = d.category || '기타'; cnt[c] = (cnt[c] || 0) + 1; });
      const days = new Map();
      for (const d of o.rows) {
        const si = d.insider_summary;
        if (!si || d.category === '대량보유' || !(si.buy || si.sell)) continue;
        days.set(si.scope === 'report' ? `r|${d.rcept_no}` : `${d.base_date}|${si.type || ''}`, si);
      }
      let buy = 0, sell = 0;
      days.forEach(si => { buy += +si.buy || 0; sell += +si.sell || 0; });
      parts.push(`최근 90일 지분 공시 <b>${o.count.toLocaleString()}건</b>${none(`(${Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, n]) => `${e(c)} ${n}`).join(' · ')}${o.count > o.rows.length ? ` · 최근 ${o.rows.length}건 기준` : ''})`)}`
        + (buy || sell ? ` · 임원·주요주주 취득 <span style="color:var(--red)">${num(buy)}주</span> / 처분 <span style="color:var(--blue)">${num(sell)}주</span>` : ''));
    } else if (o) parts.push('최근 90일 지분 공시 없음');
    const lastOwn = (x.discOwn || []).find(d => x.trades?.[d.rcept_no]?.some(r => r.shares_change != null || r.hold_ratio_after != null));
    if (lastOwn && typeof _rpOwnLine === 'function') {
      const r = x.trades[lastOwn.rcept_no].find(t => t.shares_change != null || t.hold_ratio_after != null);
      parts.push(`최근 변동 <span style="color:var(--text2)">${e((lastOwn.base_date || '').slice(5))}</span> ${_rpOwnLine(r, x.major)}`);
    }
    add('own', '지분', parts.join(' · '), o?.rows?.[0]?.base_date || '');
  }

  // 공시 — 최근 30일 공시(금감원공시 탭과 같은 목록) + 시장경고(기업분석 표와 같은 이름)
  {
    const parts = [];
    const w = x.flow20?.[0]?.market_warn_code;
    if (w && w !== '00') {
      const wl = (typeof _FIN_WARN_LABEL !== 'undefined' && _FIN_WARN_LABEL[w]) || w;
      parts.push(`<b style="color:${JC.caution}">시장경고 ${e(wl)}</b>`);
      neg.push(`시장경고 ${wl}`);
    }
    const since = new Date(Date.now() - 30 * 86400e3).toISOString().slice(0, 10);
    const rec = (x.discAll || []).filter(d => (d.base_date || '') >= since);
    if (rec.length) {
      const cnt = {};
      rec.forEach(d => { const c = d.category || '기타'; cnt[c] = (cnt[c] || 0) + 1; });
      parts.push(`최근 30일 공시 <b>${rec.length}건</b>${none(`(${Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, n]) => `${e(c)} ${n}`).join(' · ')})`)}`);
    } else if (x.discAll) parts.push('최근 30일 공시 없음');
    add('disc', '공시', parts.join(' · '), rec[0]?.base_date || '');
  }

  // 리스크 — MD 1-2 제목(보고서 시점). 누르면 아래 투자포인트·리스크 카드로
  if (x.s.risk_points?.length) {
    add('risk', '리스크 (MD)', x.s.risk_points.slice(0, 2).map(t => e(t)).join(' · '), x.data?.receive_date ? `MD ${x.data.receive_date}` : '');
    neg.push(`MD 리스크 ${x.s.risk_points.length}건`);
  }

  if (!rows.length) return `<div data-capture style="${_RPD_CARD}"><div style="font-size:calc(12px*var(--m-sub));color:var(--text3);padding:10px 0;text-align:center">종합할 데이터가 없습니다</div></div>`;
  const side = (title, list, color) => `<div style="background:${color}12;border:1px solid ${color}40;border-radius:var(--radius-sm);padding:10px 12px">
    <div style="font-size:calc(12px*var(--m-sub));font-weight:800;color:${color};margin-bottom:6px">${title} ${list.length}</div>
    ${list.length ? `<div style="display:flex;flex-wrap:wrap;gap:4px 6px">${list.map(t => `<span style="font-size:calc(11.5px*var(--m-sub));color:var(--text1);background:var(--bg2);border:1px solid var(--border);border-radius:100px;padding:1px 8px">${e(t)}</span>`).join('')}</div>`
      : `<div style="font-size:calc(11.5px*var(--m-sub));color:var(--text3)">해당 없음</div>`}
  </div>`;
  return `<div data-capture style="${_RPD_CARD}">
    ${_rpdT('종합분석 결과', '줄을 누르면 근거로 · 줄 끝은 기준일')}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:8px;margin-bottom:10px">
      ${side('긍정', pos, JC.good)}${side('주의', neg, JC.caution)}
    </div>
    <table style="width:100%;table-layout:fixed;border-collapse:collapse;font-size:calc(12px*var(--m-sub))">
      <colgroup><col style="width:92px"><col></colgroup>
      ${rows.map(r => `<tr onclick="document.getElementById('rpd-sec-${r.key}')?.scrollIntoView({behavior:'smooth',block:'start'})" style="cursor:pointer">
        <td style="padding:8px 10px;background:var(--bg3);color:var(--text2);border-bottom:1px solid var(--border);vertical-align:top;font-weight:600;white-space:normal">${r.label}</td>
        <td style="padding:8px 10px;color:var(--text1);border-bottom:1px solid var(--border);line-height:1.6;overflow-wrap:anywhere;white-space:normal">${r.fact}${r.basis
          ? ` <span style="color:var(--text3);font-size:calc(11px*var(--m-label));white-space:nowrap">· ${e(r.basis)}</span>` : ''}</td>
      </tr>`).join('')}
    </table>
    <div style="font-size:calc(11px*var(--m-label));color:var(--text3);margin-top:6px">* 긍정·주의는 앱의 기존 판정(신호등 양호/주의·종합 판단 신호·실적 국면 원본 표시·수급 단계·시장경고·MD 리스크)을 모은 것 — 점수·가중치 없음 · ROE는 최근 4분기 순이익 기준 · (MD)는 보고서 시점</div>
  </div>`;
}

// ── 블로그 순서 카드 (기업 정보·주주·고객 집중도) ─────────────────────────────
// 블로그에 옮기는 사실 줄·표만 — '원문 대조 검토' 블록, 기준·검토 근거·원문 확인 줄은 뺌

// 큰 구역 제목(블로그 소제목 '기업 정보·주주·사업…'에 대응, 캡처 대상 아님)
// tabs = 이 구역이 가져온 원본 탭(버튼으로 이동), id = 종합분석 결과 줄에서 스크롤해 올 곳
const _rpDartSecHead = (t, sub, tabs, id) => `
  <div${id ? ` id="rpd-sec-${id}"` : ''} style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-top:12px;padding-bottom:6px;border-bottom:1px solid var(--border2);scroll-margin-top:70px">
    <span style="font-size:calc(17px*var(--m-title));font-weight:800;color:var(--text)">${t}</span>
    ${sub ? `<span style="font-size:calc(11px*var(--m-label));color:var(--text3)">${sub}</span>` : ''}
    ${(tabs || []).length ? `<span style="margin-left:auto;display:flex;gap:4px">${tabs.map(tb => `<button class="chip chip-sm"
      onclick="rpSetTab(RP_TABS.indexOf('${escJsStr(tb)}'))" title="${escAttr(tb)} 탭에서 보기">${escapeHtml(tb)} 탭 ↗</button>`).join('')}</span>` : ''}
  </div>`;
const _rpDartCard = (title, inner, right) => `<div data-capture style="${_RPD_CARD}">${_rpdT(title, right || '')}${inner}</div>`;

// '항목 | 내용' 표(블로그 '기본' 표 모양). 값은 호출하는 쪽에서 이스케이프한 HTML
const _rpKv = rows => !rows.length ? '' : `
  <table style="width:100%;border-collapse:collapse;font-size:calc(12px*var(--m-sub))">
    ${rows.map(([k, v]) => `<tr>
      <td style="padding:7px 10px;background:var(--bg3);color:var(--text2);white-space:nowrap;border-bottom:1px solid var(--border);width:130px;vertical-align:top">${escapeHtml(k)}</td>
      <td style="padding:7px 10px;color:var(--text1);border-bottom:1px solid var(--border);line-height:1.6;overflow-wrap:anywhere">${v}</td>
    </tr>`).join('')}
  </table>`;

// 소절 줄에서 검토·메타를 뺀 사실 줄. '#### 원문 대조 검토' 블록은 다음 제목 또는 빈 줄 두 개까지(생성기 양식)
function _rpMdFacts(sec) {
  const out = [];
  let skip = false, blank = 0;
  for (const l of sec || []) {
    if (/^#{3,6}\s/.test(l)) {
      skip = /^#{4,6}\s*(원문 대조 검토|원문·API)/.test(l);
      blank = 0;
      if (skip) continue;
    } else if (skip) {
      blank = l.trim() ? 0 : blank + 1;
      if (blank >= 2) skip = false;
      continue;
    }
    if (/^[-*]\s*(기준|검토 근거|원문 확인|판단 기준)[:：]/.test(l)) continue;
    if (/^\s*-{3,}\s*$/.test(l) || _RPD_DROP_LINE.test(l.trim())) continue;   // 가로줄·앵커
    out.push(l);
  }
  return out;
}
const _rpMdVal = (sec, key) => (sec || []).map(l => l.match(new RegExp(`^[-*]\\s*${key}[:：]\\s*(.+)$`))?.[1]?.trim()).find(Boolean) || null;
// 첫 표의 원문 줄(구분선 포함)과 그 위의 '단위:' 줄
function _rpMdTableRaw(sec) {
  const i = (sec || []).findIndex(l => /^\|/.test(l));
  if (i < 0) return { lines: [], unit: null };
  const lines = [];
  for (let j = i; j < sec.length && /^\|/.test(sec[j]); j++) lines.push(sec[j]);
  let unit = null;
  for (let j = i - 1; j >= 0 && j >= i - 4; j--) { const m = sec[j].match(/^단위[:：]\s*(.+)$/); if (m) { unit = m[1].trim(); break; } }
  return { lines, unit };
}
const _rpMdUnitLine = u => u ? `<div style="font-size:calc(11px*var(--m-label));color:var(--text3);margin:10px 0 4px">단위: ${escapeHtml(u)}</div>` : '';
const _rpFirstSentence = t => (String(t || '').match(/^.+?[.。](?=\s|$)/) || [t])[0];

// 주가 희석 — 발행주식수·잠재 물량·희석 리스크 + 희석 표(2-2)
function _rpDartDilution(L) {
  const sec = _rpMdSec(L, /^### 2-2\./);
  if (!sec) return '';
  const rows = ['현재 발행주식수', '전체 잠재 물량', '희석 리스크']
    .map(k => [k, _rpMdVal(sec, k)]).filter(([, v]) => v).map(([k, v]) => [k, _rpMdInline(v)]);
  const t = _rpMdTableRaw(sec);
  if (!rows.length && !t.lines.length) return '';
  return _rpDartCard('주가 희석', _rpKv(rows) + (t.lines.length ? _rpMdUnitLine(t.unit) + _rpMdTable(t.lines) : ''));
}

// 보호예수 및 매각제한(2-3) — 표가 없으면 '물량 없음' 한 줄
function _rpDartLockup(L) {
  const sec = _rpMdSec(L, /^### 2-3\./);
  if (!sec) return '';
  const f = _rpMdFacts(sec).filter(l => l.trim());
  if (!f.some(l => /^\|/.test(l))) {
    const t = f.map(l => l.trim().replace(/^[-*]\s*/, '').replace(/^상태[:：]\s*/, '')).join(' ').trim();
    const msg = !t ? '보고서 기준 보호예수·매각제한 물량 없음'
      : /미확인|미공시/.test(t) ? t                                   // '미확인 — 표가 추출되지 않음(물량이 없다는 뜻은 아님)'
      : /없습니다|없음/.test(t) ? '보고서 기준 보호예수·매각제한 물량 없음' : t;
    return _rpDartCard('보호예수 및 매각제한', `<div style="font-size:calc(12px*var(--m-sub));color:var(--text1);line-height:1.6">${_rpMdInline(msg)}</div>`);
  }
  return _rpDartCard('보호예수 및 매각제한', `<div style="display:flex;flex-direction:column;gap:4px">${_rpMdBlocks(f)}</div>`);
}

// 주주 명세(3-1) — 판단 첫 문장 + 주주 표. 최대주주·특관 합계는 '주주 구성' 카드(지분현황 탭과 공용)에 있음
function _rpDartHolders(L) {
  const sec = _rpMdSec(L, /^### 3-1\./);
  if (!sec) return '';
  const judge = _rpMdVal(sec, '투자판단');
  const t = _rpMdTableRaw(sec);
  if (!judge && !t.lines.length) return '';
  return _rpDartCard('주주 명세',
    (judge ? `<div style="font-size:calc(12px*var(--m-sub));color:var(--text1);line-height:1.6">${_rpMdInline(_rpFirstSentence(judge))}</div>` : '')
    + (t.lines.length ? `<div style="margin-top:${judge ? 10 : 0}px">${_rpMdTable(t.lines)}</div>` : ''));
}

// 대표이사(3-2) — 사람마다 '항목 | 내용' 표(블로그 대표이사 표 모양). '#### 이름 (직위)' + '- 항목: 값', 주요경력은 들여쓴 목록
function _rpDartCeo(L) {
  const sec = _rpMdSec(L, /^### 3-2\./);
  if (!sec) return '';
  const e = escapeHtml, people = [];
  let cur = null, inCareer = false;
  for (const l of _rpMdFacts(sec)) {
    const h = l.match(/^#{4,6}\s+(.+)$/);
    if (h) { cur = { name: h[1].trim(), rows: [], career: [] }; people.push(cur); inCareer = false; continue; }
    if (!cur) continue;
    const sub = l.match(/^\s{2,}[-*]\s+(.+)$/);
    if (sub && inCareer) { cur.career.push(sub[1].trim()); continue; }
    const kv = l.match(/^[-*]\s*([^:：]+?)[:：]\s*(.*)$/);
    if (kv) {
      inCareer = /경력/.test(kv[1]);
      if (inCareer) { if (kv[2]) cur.career.push(kv[2].trim()); }
      else if (kv[2]) cur.rows.push([kv[1].trim(), e(kv[2].trim())]);
    }
  }
  if (!people.length) {   // 양식이 다르면 MD 그대로
    const f = _rpMdFacts(sec);
    return f.some(l => l.trim()) ? _rpDartCard('대표이사', `<div style="display:flex;flex-direction:column;gap:4px">${_rpMdBlocks(f)}</div>`) : '';
  }
  return _rpDartCard('대표이사', people.map(p => _rpKv([
    ['성명', e(p.name)], ...p.rows,
    ...(p.career.length ? [['주요경력', p.career.map(e).join('<br>')]] : []),
  ])).join('<div style="height:10px"></div>'));
}

// 고객 집중도(4-2 '#### 고객사 및 매출 집중도')
// 사업 차트 아래 해석 — MD 4장 소절의 사실·해석 줄(근거 → 검토의견 → 판단 전환 조건 → 해석 한계·범위 유의·원문 차이).
// 차트는 사업분석 탭 것 그대로, 해석만 MD(보고서 시점). '#### 소제목' 아래(고객 집중도·증권사 추정·수주 스냅샷)와
// '기준'(계산 방법 메모) 줄은 뺀다. 차트의 이미지 저장 상자 밖에 두어 차트는 이미지로, 글은 복사로 따로 쓸 수 있게 함
const _RPD_BIZ_SEC = { product: '4-1', region: '4-2', raw: '4-3', price: '4-4', prod: '4-5', backlog: '4-6' };
const _RPD_NOTE_LABELS = ['근거', '검토의견', '판단 전환 조건', '해석 한계', '범위 유의', '원문 차이'];
function _rpDartBizNote(L, key) {
  const no = _RPD_BIZ_SEC[key];
  const sec = no && _rpMdSec(L, new RegExp('^### ' + no.replace('-', '\\-') + '\\.'));
  if (!sec) return '';
  const out = [];
  for (const l of sec) {
    if (/^#{4,6}\s/.test(l)) break;   // 소제목부터는 표·부속 내용
    const m = l.match(/^[-*]\s*([^:：]{1,12}?)\s*[:：]\s*(.+)$/);
    if (m && _RPD_NOTE_LABELS.includes(m[1].trim())) out.push(l.replace(/^[-*]\s*/, '').trim());
  }
  // 해석(근거·검토의견·판단 전환 조건)이 하나는 있어야 — 한계·원문 차이 메모만 있는 소절(4-2 등)은 띄우지 않음
  if (!out.some(t => /^(근거|검토의견|판단 전환 조건)\s*[:：]/.test(t))) return '';
  return `<div style="margin-top:-8px;padding:10px 14px;background:var(--bg2);border:1px solid var(--border);border-left:3px solid var(--tg);border-radius:var(--radius-sm)">
    <div style="font-size:calc(11px*var(--m-label));color:var(--text3);margin-bottom:6px">해석 · MD ${no} (보고서 시점)</div>
    <div style="display:flex;flex-direction:column;gap:5px">${out.map(t => `<div style="font-size:calc(12px*var(--m-sub));color:var(--text1);line-height:1.65;overflow-wrap:anywhere">${_rpMdLabeled(t)}</div>`).join('')}</div>
  </div>`;
}

function _rpDartCustomers(L) {
  const sec = _rpMdSec(L, /^#### 고객사 및 매출 집중도/);
  const f = _rpMdFacts(sec).filter(l => l.trim());
  if (!f.length) return '';
  return _rpDartCard('고객 집중도', `<div style="display:flex;flex-direction:column;gap:4px">${_rpMdBlocks(f)}</div>`);
}

// ── DART 탭 화면 모델 — 생성기 MD의 소절·표에서 카드용 데이터를 한곳에서 읽음 ─────────────
// 소제목 이름('#### 분기별 추이' 등)에 기대므로 생성기 양식이 바뀌면 여기만 고친다.
// 못 찾은 항목은 null → 그 카드는 숨김(06월 생성분 옛 양식 MD는 대부분 null = 예전 화면 그대로)

const _RPD_CARD = 'background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px';
const _rpdT = (t, right) => typeof _rpSecT === 'function' ? _rpSecT(t, right || '') : `
  <div style="font-size:calc(13px*var(--m-body));font-weight:700;color:var(--text1);margin-bottom:10px">${t}</div>`;

// 표 한 줄 → 칸 배열. \| (생성기가 \\|로 두 번 이스케이프한 것 포함)는 칸 구분이 아닌 글자 '|'
const _rpMdCells = r => r.replace(/\\+\|/g, '\u0001').split('|').slice(1, -1).map(c => c.trim().replace(/\u0001/g, '|'));

// 제목 줄(re)부터 같은·상위 단계 제목 전까지
function _rpMdSec(lines, re) {
  const si = lines.findIndex(l => re.test(l));
  if (si < 0) return null;
  const lv = (lines[si].match(/^#+/) || ['######'])[0].length;
  const ei = lines.findIndex((l, i) => i > si && /^#{1,6}\s/.test(l) && l.match(/^#+/)[0].length <= lv);
  return lines.slice(si + 1, ei > 0 ? ei : lines.length);
}
// 줄 묶음의 첫 표 → { hdr, rows } (구분선 제외)
function _rpMdFirstTable(sec) {
  const i = sec ? sec.findIndex(l => /^\|/.test(l)) : -1;
  if (i < 0) return null;
  const rows = [];
  for (let j = i; j < sec.length && /^\|/.test(sec[j]); j++)
    if (!/^\|[-:\s|]+$/.test(sec[j])) rows.push(_rpMdCells(sec[j]));
  return rows.length > 1 ? { hdr: rows[0], rows: rows.slice(1) } : null;
}
// 연도별로 나뉜 기간 표(MD reader-layout annual-tables-v1, 10-18~: '**2023년**' 표 · '**2024년**' 표 …)를 한 표로.
// sec[i] = 표 첫 줄. 표 사이에 빈 줄과 '**2024년**' 같은 연도 줄만 있고(연도 줄이 하나는 있어야), 첫 기간 열 앞의 열(항목·품목·
// 사업부문)이 같으면 같은 표의 다음 해로 보고 기간 열을 이어 붙인다. 예전 양식(한 표에 14개 분기)은 그대로.
// isPeriod(머리 칸) → 기간 열인지. 반환 { hdr, rows, end } (구분선 제외, rows = 처음 나온 행 순서)
const _RPD_YEAR_LINE = /^\*\*\s*\d{4}\s*년?\s*\*\*$/;
const _rpIsQ = h => /^\d{2}\.\dQ$/.test(String(h || '').trim());
function _rpMdPeriodTable(sec, i, isPeriod = _rpIsQ) {
  const read = k => {
    const t = [];
    for (; k < sec.length && /^\s*\|/.test(sec[k]); k++) if (!/^\s*\|[-:\s|]+$/.test(sec[k])) t.push(_rpMdCells(sec[k].trim()));
    return { t, k };
  };
  let { t, k } = read(i);
  if (!t.length) return null;
  const hdr = t[0], d = hdr.findIndex(isPeriod);
  if (d < 1) return { hdr, rows: t.slice(1), end: k };
  const dims = hdr.slice(0, d).join('|'), periods = [], order = [], map = new Map();
  const add = (P, rows) => {
    P.forEach(p => { if (!periods.includes(p)) periods.push(p); });
    for (const r of rows) {
      const key = r.slice(0, d).join('|');
      if (!map.has(key)) { map.set(key, { dims: r.slice(0, d), v: {} }); order.push(key); }
      P.forEach((p, j) => { map.get(key).v[p] = r[d + j] ?? ''; });
    }
  };
  add(hdr.slice(d), t.slice(1));
  for (;;) {
    let j = k, years = 0;
    for (; j < sec.length; j++) {
      const x = sec[j].trim();
      if (_RPD_YEAR_LINE.test(x)) years++;
      else if (x) break;
    }
    if (!years || j >= sec.length || !/^\s*\|/.test(sec[j])) break;
    const nx = read(j), h2 = nx.t[0] || [];
    if (h2.findIndex(isPeriod) !== d || h2.slice(0, d).join('|') !== dims) break;
    add(h2.slice(d), nx.t.slice(1));
    k = nx.k;
  }
  return { hdr: [...hdr.slice(0, d), ...periods], rows: order.map(key => [...map.get(key).dims, ...periods.map(p => map.get(key).v[p] ?? '')]), end: k };
}
// 줄 묶음에서 기간 열이 있는 첫 표(연도별로 나뉘었으면 합친 것) → { hdr, rows }
function _rpMdFirstPeriodTable(sec, isPeriod = _rpIsQ) {
  for (let i = 0; sec && i < sec.length; i++) {
    if (!/^\|/.test(sec[i]) || (i > 0 && /^\|/.test(sec[i - 1]))) continue;
    if (!_rpMdCells(sec[i]).some(isPeriod)) continue;
    const T = _rpMdPeriodTable(sec, i, isPeriod);
    return T && T.rows.length ? T : null;
  }
  return null;
}
// '1,234.5' '-12.3%' '268.9' → 수 / '산출 불가'·'-'·'' → null
const _rpNum = s => {
  const m = String(s ?? '').replace(/,/g, '').match(/^\s*(-?\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
};
// '[신한투자증권](url) (2026-10-08)' → { text, url, date }
const _rpMdLinkCell = c => {
  const m = String(c || '').match(/^\[((?:\\.|[^\]\\])+)\]\((https?:\/\/[^)\s]+)\)\s*(?:\((\d{4}-\d{2}-\d{2})\))?/);
  return m ? { text: m[1].replace(_RPD_ESC, '$1'), url: m[2], date: m[3] || null }
           : { text: String(c || '').replace(_RPD_ESC, '$1'), url: null, date: null };
};
// 억원 → '2,165억' / '1.49조'
const _rpEok = v => v == null ? '—' : Math.abs(v) >= 10000 ? `${(v / 10000).toFixed(2)}조` : `${Math.round(v).toLocaleString()}억`;
function _rpDartModel(md) {
  const L = (md || '').split('\n').map(l => l.replace(/\r$/, ''));
  const lab = (sec, key) => (sec || []).map(l => l.match(new RegExp(`^[-*]\\s*${key}[:：]\\s*(.+)$`))?.[1]?.trim()).find(Boolean) || null;
  const out = {};

  // 종합판단: 1-3 검토의견 → 없으면 2-9 '종합 검토의견' 첫 줄
  const s13 = _rpMdSec(L, /^### 1-3\./);
  out.verdict = lab(s13, '검토의견')
    || (_rpMdSec(L, /^#### 종합 검토의견/) || []).map(l => l.match(/^[-*]\s+(.+)$/)?.[1]?.trim()).find(Boolean) || null;
  out.scope = lab(s13, '판단 범위');

  // 분기 추이(2-7) 매출·영업이익 — 증권사 전망 카드의 '참고(공시 분기 합)' 줄에만 씀(개별 분기, 억원)
  const tr = _rpMdFirstPeriodTable(_rpMdSec(L, /^####\s*(?:2-7\.\d+\s+)?분기별 추이\s*$/));
  if (tr) {
    const row = re => { const r = tr.rows.find(r => re.test(r[0])); return r ? r.slice(1).map(_rpNum) : null; };
    const revenue = row(/^매출액/);
    out.trend = revenue && { periods: tr.hdr.slice(1), revenue, op: row(/^영업이익\(/) };
  }

  // 증권사 전망: 영업이익(2-7)·매출(4-1) 추정 표 + 리포트 표(2-9)를 증권사·발행일로 합침
  const est = re => {
    const t = _rpMdFirstTable(_rpMdSec(L, re));
    return t ? { cols: t.hdr.slice(1), rows: t.rows.map(r => ({ ..._rpMdLinkCell(r[0]), vals: r.slice(1).map(_rpNum) })) } : null;
  };
  const estOp = est(/^#### 증권사 영업이익 추정/), estRev = est(/^#### 증권사 매출 추정/);
  const rsec = _rpMdSec(L, /^#### 증권사 리포트/) || [];
  const rt = _rpMdFirstTable(rsec);
  const reports = (rt?.rows || []).map(r => ({ ..._rpMdLinkCell(r[1]), date: r[0], opinion: r[2] || '', tp: r[3] || '', change: r[4] || '' }));
  const rnote = {};   // '**신한투자증권 | 제목**' 아래 '- 자체 검토:'
  let cur = null;
  for (const l of rsec) {
    const b = l.trim().match(/^\*\*(.+?)\s*\|\s*(.+)\*\*$/);
    if (b) { cur = rnote[b[1].trim()] = { headline: b[2].trim(), review: null }; continue; }
    const rv = cur && l.match(/^[-*]\s*자체 검토[:：]\s*(.+)$/);
    if (rv) cur.review = rv[1].trim();
  }
  const bmap = new Map();
  const bget = (text, url, date) => {
    const k = `${text}|${date || ''}`;
    if (!bmap.has(k)) bmap.set(k, { broker: text, url, date, opinion: '', tp: '', change: '', rev: {}, op: {} });
    return bmap.get(k);
  };
  for (const [t, key] of [[estRev, 'rev'], [estOp, 'op']])
    for (const r of t?.rows || []) { const b = bget(r.text, r.url, r.date); t.cols.forEach((c, i) => { b[key][c] = r.vals[i]; }); }
  for (const r of reports) Object.assign(bget(r.text, r.url, r.date), { opinion: r.opinion, tp: r.tp, change: r.change, url: r.url || null });
  out.brokers = [...bmap.values()].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  out.estCols = [...new Set([...(estOp?.cols || []), ...(estRev?.cols || [])])];

  // 보고기간 이후 이벤트: 후속 공시(2-8) + 리포트·뉴스(2-9), 최근 순
  const events = [];
  out.eventRange = (lab(_rpMdSec(L, /^### 2-8\./), '조회 범위') || '').match(/\d{4}-\d{2}-\d{2}\s*~\s*\d{4}-\d{2}-\d{2}/)?.[0] || null;
  for (const r of _rpMdFirstTable(_rpMdSec(L, /^#### 후속 공시 목록/))?.rows || []) {
    const k = _rpMdLinkCell(r[1]);
    events.push({ date: r[0], kind: '공시', title: k.text, url: k.url, tag: r[2] || '', scope: r[3] || '', text: null, opinion: null });
  }
  // 같은 날 공시에 내용·검토의견을 붙임 — '원문 검토 반영' 공시 우선
  const attach = (date, text, opinion) => {
    const same = events.filter(e => e.kind === '공시' && e.date === date && !e.text);
    const ev = same.find(e => /원문 검토 반영/.test(e.scope)) || same[0];
    if (ev) { ev.text = text; ev.opinion = opinion; }
  };
  // 확인된 투자 영향(2-8): '- 날짜: 내용' + 다음 줄 '- 검토의견: …'
  const imp = _rpMdSec(L, /^#### 확인된 투자 영향/) || [];
  imp.forEach((l, i) => {
    const m = l.match(/^[-*]\s*(\d{4}-\d{2}-\d{2})[:：]\s*(.+)$/);
    if (m) attach(m[1], m[2], imp[i + 1]?.match(/^[-*]\s*검토의견[:：]\s*(.+)$/)?.[1] || null);
  });
  // 주요 뉴스(2-9): '**날짜 | 제목**' + 구분·확인 내용·자체 검토. '구분: 공시'는 같은 날 공시 항목에 합침(중복 표시 방지)
  let nv = null;
  const flush = () => {
    if (!nv) return;
    if (nv.isDisc && events.some(e => e.kind === '공시' && e.date === nv.date)) attach(nv.date, nv.text || nv.title, nv.opinion);
    else events.push(nv);
    nv = null;
  };
  for (const l of _rpMdSec(L, /^#### 주요 뉴스/) || []) {
    const b = l.trim().match(/^\*\*(\d{4}-\d{2}-\d{2})\s*\|\s*(.+)\*\*$/);
    if (b) { flush(); nv = { date: b[1], kind: '뉴스', title: b[2].trim(), url: null, tag: '', scope: '', text: null, opinion: null, isDisc: false }; continue; }
    if (!nv) continue;
    const g = l.match(/^[-*]\s*구분[:：]\s*(.+)$/);
    if (g) { nv.isDisc = /^공시/.test(g[1]); nv.url = g[1].match(/\]\((https?:\/\/[^)\s]+)\)/)?.[1] || null; nv.tag = g[1].split(/[.。]/)[0].trim(); continue; }
    const t = l.match(/^[-*]\s*확인 내용[:：]\s*(.+)$/);
    if (t) { nv.text = t[1].trim(); continue; }
    const o = l.match(/^[-*]\s*자체 검토[:：]\s*(.+)$/);
    if (o) nv.opinion = o[1].trim();
  }
  flush();
  for (const r of reports) {
    const n = rnote[r.text];
    const tp = r.tp && !/미확인|미제시/.test(r.tp) ? ` · 목표주가 ${r.tp}` : '';
    events.push({ date: r.date, kind: '리포트', title: `${r.text} ${r.opinion}${tp}`, url: r.url, tag: '', scope: r.change,
      text: n?.headline ? `「${n.headline}」` : null, opinion: n?.review || null });
  }
  out.events = events.filter(e => /^\d{4}-\d{2}-\d{2}$/.test(e.date)).sort((a, b) => b.date.localeCompare(a.date));
  return out;
}

// ── DART 탭 카드 ─────────────────────────────────────────────────────────────

// ② 종합판단
function _rpDartVerdict(m, data) {
  if (!m.verdict) return '';
  return `<div data-capture style="${_RPD_CARD};border-left:3px solid var(--tg)">
    ${_rpdT('MD 종합판단', data?.receive_date ? `보고서 시점 · ${escapeHtml(data.report_type || '')} 접수 ${escapeHtml(data.receive_date)}` : '보고서 시점')}
    <div style="font-size:calc(13px*var(--m-body));color:var(--text);line-height:1.7;overflow-wrap:anywhere">${_rpMdInline(m.verdict)}</div>
    ${m.scope ? `<div style="font-size:calc(11px*var(--m-label));color:var(--text3);margin-top:6px;line-height:1.5;overflow-wrap:anywhere">${_rpMdInline(m.scope)}</div>` : ''}
  </div>`;
}

// ⑥ 증권사 전망 — 증권사별 발행 당시 의견·목표주가·매출/영업이익 추정(억원)
function _rpDartEstimates(m) {
  const B = m.brokers;
  if (!B || !B.length) return '';
  const esc = escapeHtml, cols = m.estCols;
  const hasRev = B.some(b => Object.values(b.rev).some(v => v != null));
  const num = v => v == null ? '—' : Math.round(v).toLocaleString();
  // 첫 열(증권사) 고정 — 좁은 화면에서 추정 열을 가로로 넘겨도 어느 증권사인지 보이게
  const stick = 'position:sticky;left:0;z-index:1;background:inherit;';
  const th = (t, al, st) => `<th style="${st || ''}padding:6px 8px;text-align:${al || 'left'};color:var(--text2);font-weight:600;border-bottom:1px solid var(--border);white-space:nowrap;vertical-align:bottom">${t}</th>`;
  const td = (v, al, st) => `<td style="${st || ''}padding:6px 8px;text-align:${al || 'left'};border-bottom:1px solid var(--border);vertical-align:top;font-variant-numeric:tabular-nums">${v}</td>`;
  const head = `<tr style="background:var(--bg3)">${th('증권사 · 발행일', 'left', stick)}${th('의견')}${th('목표주가', 'right')}
    ${cols.map(c => th(`${esc(c)}<div style="font-weight:400;color:var(--text3);font-size:calc(10px*var(--m-label))">${hasRev ? '매출 / 영업이익' : '영업이익'}</div>`, 'right')).join('')}</tr>`;
  const rows = B.map(b => {
    const url = safeUrl(b.url);
    const name = url ? `<a href="${escAttr(url)}" target="_blank" rel="noopener" style="color:var(--text1);font-weight:600;text-decoration:none">${esc(b.broker)} <span style="color:var(--tg)">↗</span></a>`
                     : `<span style="color:var(--text1);font-weight:600">${esc(b.broker)}</span>`;
    return `<tr style="background:var(--bg2)">
      ${td(`${name}<div style="font-size:calc(11px*var(--m-label));color:var(--text3)">${esc(b.date || '')}</div>`, 'left', stick)}
      ${td(`<span style="color:var(--text1)">${esc(b.opinion || '—')}</span>`)}
      ${td(`<span style="color:var(--text1);white-space:nowrap">${esc(b.tp || '—')}</span>${b.change ? `<div style="font-size:calc(11px*var(--m-label));color:var(--text3);white-space:nowrap">${esc(b.change)}</div>` : ''}`, 'right')}
      ${cols.map(c => td(`${hasRev ? `<div style="color:var(--text1)">${num(b.rev[c])}</div>` : ''}<div style="color:${hasRev ? 'var(--text2)' : 'var(--text1)'}">${num(b.op[c])}</div>`, 'right')).join('')}
    </tr>`;
  }).join('');
  // 참고: 공시 분기 합(전년 4개 분기 완비 시) · 올해 누적 — 연간 추정과 비교용
  let ref = '';
  const t = m.trend;
  if (t) {
    const yy = t.periods.map(p => p.match(/^(\d{2})\.\dQ$/)?.[1]).filter(Boolean);
    const last = yy[yy.length - 1];
    const sumY = (arr, y) => {
      const idx = t.periods.map((p, i) => p.startsWith(`${y}.`) ? i : -1).filter(i => i >= 0);
      const vals = idx.map(i => arr?.[i]).filter(v => v != null);
      return { n: idx.length, ok: vals.length === idx.length && idx.length > 0, sum: vals.reduce((a, b) => a + b, 0) };
    };
    const parts = [];
    if (last) {
      const py = String(+last - 1).padStart(2, '0');
      const pr = sumY(t.revenue, py), po = sumY(t.op, py);
      if (pr.ok && pr.n === 4) parts.push(`20${py}년 매출 ${_rpEok(pr.sum)}${po.ok ? ` · 영업이익 ${_rpEok(po.sum)}` : ''}`);
      const cr = sumY(t.revenue, last), co = sumY(t.op, last);
      if (cr.ok && cr.n < 4) parts.push(`20${last}년 1~${cr.n}분기 매출 ${_rpEok(cr.sum)}${co.ok ? ` · 영업이익 ${_rpEok(co.sum)}` : ''}`);
    }
    if (parts.length) ref = `참고(공시 분기 합): ${parts.join(' / ')}`;
  }
  return `<div data-capture style="${_RPD_CARD}">
    ${_rpdT('증권사 전망', '발행 당시 추정 · 컨센서스 아님 · 단위 억원')}
    <div style="overflow-x:auto;border:1px solid var(--border);border-radius:var(--radius-sm)">
      <table style="width:100%;border-collapse:collapse;font-size:calc(12px*var(--m-sub))"><thead>${head}</thead><tbody>${rows}</tbody></table>
    </div>
    ${ref ? `<div style="font-size:calc(11px*var(--m-label));color:var(--text3);margin-top:6px">${ref}</div>` : ''}
  </div>`;
}

// ⑦ 보고기간 이후 이벤트 — 공시·리포트·뉴스 최근 순. 제목만 점검한 공시는 흐리게
function _rpDartEvents(m) {
  const E = m.events;
  if (!E || !E.length) return '';
  const esc = escapeHtml;
  const KC = { '공시': 'var(--tg)', '리포트': 'var(--warn)', '뉴스': 'var(--text2)' };
  const row = e => {
    const url = safeUrl(e.url), dim = /^제목 점검$/.test(e.scope);
    const title = `<span style="color:${dim ? 'var(--text2)' : 'var(--text1)'}">${esc(e.title)}</span>${url ? ' <span style="color:var(--tg)">↗</span>' : ''}`;
    const c = KC[e.kind] || 'var(--text2)';
    return `<div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
      <div style="flex-shrink:0;width:76px;font-size:calc(11px*var(--m-label));color:var(--text2);font-variant-numeric:tabular-nums">
        ${esc(e.date)}
        <div style="margin-top:3px"><span style="display:inline-block;padding:0 7px;border-radius:100px;font-size:calc(10px*var(--m-label));font-weight:600;
          background:color-mix(in srgb, ${c} 14%, transparent);color:${c}">${esc(e.kind)}</span></div>
      </div>
      <div style="min-width:0;flex:1">
        <div style="font-size:calc(12px*var(--m-sub));font-weight:600;line-height:1.5;overflow-wrap:anywhere">
          ${url ? `<a href="${escAttr(url)}" target="_blank" rel="noopener" style="text-decoration:none">${title}</a>` : title}
          ${e.tag ? `<span style="font-weight:400;font-size:calc(11px*var(--m-label));color:var(--text3);margin-left:4px">${esc(e.tag)}</span>` : ''}
          ${e.scope ? `<span style="font-weight:400;font-size:calc(11px*var(--m-label));color:var(--text3);margin-left:4px">· ${esc(e.scope)}</span>` : ''}
        </div>
        ${e.text ? `<div style="font-size:calc(12px*var(--m-sub));color:var(--text1);line-height:1.6;margin-top:2px;overflow-wrap:anywhere">${_rpMdInline(e.text)}</div>` : ''}
        ${e.opinion ? `<details style="margin-top:2px">
          <summary style="cursor:pointer;font-size:calc(11px*var(--m-label));color:var(--tg)">자체 검토</summary>
          <div style="font-size:calc(12px*var(--m-sub));color:var(--text2);line-height:1.6;margin-top:2px;overflow-wrap:anywhere">${_rpMdInline(e.opinion)}</div>
        </details>` : ''}
      </div>
    </div>`;
  };
  const N = 6, rest = E.slice(N);
  return `<div data-capture style="${_RPD_CARD}">
    ${_rpdT('보고기간 이후 이벤트', m.eventRange ? `${esc(m.eventRange)} · 공시·리포트·뉴스` : '공시·리포트·뉴스')}
    ${E.slice(0, N).map(row).join('')}
    ${rest.length ? `<details style="margin-top:6px">
      <summary style="cursor:pointer;font-size:calc(12px*var(--m-sub));color:var(--tg);padding:4px 0">이전 ${rest.length}건 더 보기</summary>
      ${rest.map(row).join('')}
    </details>` : ''}
  </div>`;
}

// ── MD 기본정보 수정 ───────────────────────────────────────────────────────────
// MD에서 읽은 기본정보(2-1 기본·3-1 최대주주)를 사용자가 고친 값은 dart_reports.summary.profile_edits({필드: 값})에 저장.
// 표시할 때 MD 값 대신 쓰고(_mdDeepParse), 새 MD를 올려도 이어받음(rpUploadDart). 빈 값 = 그 항목 숨김, 키 없음 = MD 값
const RP_PROFILE_FIELDS = [
  { k: 'legalName', label: '회사명' },
  { k: 'established', label: '설립일' },
  { k: 'listedDate', label: '상장일' },
  { k: 'location', label: '소재지' },
  { k: 'mainBusiness', label: '주요사업', multi: true },
  { k: 'majorShareholder', label: '최대주주' },
  { k: 'majorShareholderRatio', label: '최대주주 지분율', ph: '예: 32.90%' },
];
// 수정 창 상태 — 탭마다 { code, reportType, summary, dp, rerender } 등록(site: 'dart' | 'profile')
const RPP = { sites: {}, open: null };

// [수정] 버튼(관리자·에디터만, 캡처 이미지에서는 빠짐)
const _rpProfileEditBtn = site => (typeof isEditor === 'function' && isEditor())
  ? `<button data-no-capture class="btn btn-sm" onclick="rpProfileOpen('${site}')"
      style="padding:1px 9px;font-size:calc(11px*var(--m-label))">수정</button>`
  : '';

function rpProfileOpen(site) {
  const c = RPP.sites[site];
  if (!c) return;
  RPP.open = site;
  document.getElementById('m-rp-profile')?.remove();
  const esc = escapeHtml;
  const rows = RP_PROFILE_FIELDS.map(({ k, label, multi, ph }) => {
    const orig = c.dp.orig?.[k] || '', edited = (c.dp.edited || []).includes(k);
    const cur = edited ? (c.dp[k] || '') : orig;   // 고치지 않은 주요사업은 잘리기 전 전문으로
    const input = multi
      ? `<textarea id="rpp-${k}" class="form-input rpp-in" rows="3" placeholder="${escAttr(ph || '')}">${esc(cur)}</textarea>`
      : `<input id="rpp-${k}" class="form-input rpp-in" value="${escAttr(cur)}" placeholder="${escAttr(ph || '')}">`;
    return `<div class="form-group" style="margin-bottom:12px">
      <label class="form-label" for="rpp-${k}">${label}${edited ? ' <span style="color:var(--tg);font-weight:400">· 수정됨</span>' : ''}</label>
      ${input}
      <div style="display:flex;gap:8px;align-items:flex-start;margin-top:4px;font-size:calc(11px*var(--m-label));color:var(--text3);line-height:1.5">
        <span style="flex:1;min-width:0;overflow-wrap:anywhere">MD 원래 값: ${orig ? esc(orig) : '(없음)'}</span>
        <button type="button" class="btn btn-sm" data-orig="${escAttr(orig)}" style="padding:1px 8px;flex-shrink:0"
          onclick="this.closest('.form-group').querySelector('.rpp-in').value = this.dataset.orig">원래 값</button>
      </div>
    </div>`;
  }).join('');
  const ov = document.createElement('div');
  ov.id = 'm-rp-profile';
  ov.className = 'modal-overlay open';
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  ov.innerHTML = `
    <div class="modal" style="width:560px">
      <div class="modal-header"><span class="modal-title">기본정보 수정 · ${esc(c.dp.stockName || c.code)}</span>
        <button class="modal-close" onclick="document.getElementById('m-rp-profile').remove()" aria-label="닫기">×</button></div>
      <div style="font-size:calc(12px*var(--m-sub));color:var(--text2);line-height:1.6;margin-bottom:12px">
        업로드한 MD의 기본정보 대신 보여줄 값입니다. 비우면 그 항목을 숨기고, 새 MD를 올려도 고친 값은 유지됩니다.</div>
      ${rows}
      <div class="modal-footer">
        <button class="btn" style="margin-right:auto" onclick="document.querySelectorAll('#m-rp-profile [data-orig]').forEach(b => b.click())">전체 원래 값</button>
        <button class="btn" onclick="document.getElementById('m-rp-profile').remove()">취소</button>
        <button class="btn btn-primary" id="rpp-save" onclick="rpProfileSave()">저장</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
}

async function rpProfileSave() {
  const c = RPP.sites[RPP.open];
  if (!c) return;
  const edits = {};
  for (const { k } of RP_PROFILE_FIELDS) {
    const v = (document.getElementById(`rpp-${k}`)?.value || '').trim();
    if (v !== String(c.dp.orig?.[k] || '').trim()) edits[k] = v;   // MD 값과 같으면 수정 아님
  }
  const summary = { ...(c.summary || {}) };
  if (Object.keys(edits).length) summary.profile_edits = edits;
  else delete summary.profile_edits;
  const btn = document.getElementById('rpp-save');
  if (btn) { btn.disabled = true; btn.textContent = '저장 중…'; }
  // 권한이 없으면 오류 없이 0행이 갱신될 수 있어 갱신된 행을 돌려받아 확인
  const { data, error } = await sb.from('dart_reports').update({ summary })
    .eq('stock_code', c.code).eq('report_type', c.reportType).select('stock_code');
  if (error || !data?.length) {
    if (btn) { btn.disabled = false; btn.textContent = '저장'; }
    toast('저장 실패: ' + (error?.message || '권한이 없거나 리포트를 찾지 못했습니다'), 'error');
    return;
  }
  document.getElementById('m-rp-profile')?.remove();
  const n = Object.keys(edits).length;
  toast(n ? `기본정보 ${n}개 항목을 저장했습니다` : '기본정보를 MD 원래 값으로 되돌렸습니다', 'success');
  c.summary = summary;
  c.rerender?.();
}

// ── MD 깊은 파싱 (렌더 전용) ──────────────────────────────────────────────────
// summary를 넘기면 사용자가 고친 기본정보(profile_edits)를 적용 — orig: MD 원래 값, edited: 고친 항목
function _mdDeepParse(md, summary) {
  const lines = md.split('\n');

  function secLines(h2keyword) {
    const si = lines.findIndex(l => l.startsWith('## ') && l.includes(h2keyword));
    if (si < 0) return [];
    const ei = lines.findIndex((l,i) => i > si && /^## /.test(l));
    return lines.slice(si+1, ei > 0 ? ei : lines.length);
  }
  function subLines(keyword, src) {
    const si = src.findIndex(l => l.startsWith('### ') && l.includes(keyword));
    if (si < 0) return [];
    const ei = src.findIndex((l,i) => i > si && /^#{2,3} /.test(l));
    return src.slice(si+1, ei > 0 ? ei : src.length);
  }
  function lv(keyword, src) {
    const l = (src||lines).find(l => new RegExp(`[-*]\\s*${keyword}[:：]`).test(l));
    return l ? l.replace(new RegExp(`.*${keyword}[:：]\\s*`), '').trim() : null;
  }

  // 문서 개요
  const stockCode = (() => {
    const l = lines.find(l => /\|\s*종목코드\s*\|/.test(l));
    return l ? l.split('|')[2]?.trim() : null;
  })();
  const stockName = (() => {
    const l = lines.find(l => /\|\s*회사명\s*\|/.test(l));
    return l ? l.split('|')[2]?.trim() : null;
  })();
  const docVal = key => {   // 문서 개요 표 '| 키 | 값 |'
    const l = lines.find(l => new RegExp(`^\\|\\s*${key}\\s*\\|`).test(l));
    return l ? l.split('|')[2]?.trim() || null : null;
  };
  const receiptNo = (docVal('접수번호') || '').match(/^\d{14}$/)?.[0] || null;   // DART 원문 링크용
  const updated = docVal('업데이트');

  // 2-1 기본정보
  const sec2 = secLines('2. 기업정보');
  const basic = subLines('2-1', sec2);
  const mainBusinessRaw = lv('주요사업', basic);
  const mainBusiness = mainBusinessRaw
    ? mainBusinessRaw.slice(0, 120) + (mainBusinessRaw.length > 120 ? '...' : '')
    : null;   // 없으면 null — 'undefined' 문자열이 카드에 찍히던 문제

  // 2-4 계열회사 — 관계·지분율·역할·국가·매출·순손익·자본·자산·부채·검토의견. 금액은 천원으로 맞춰 둠(_rpSubsContent가 천원 기준)
  // 생성기 양식마다 단위가 다름: '매출 1,462천원'(옛 양식) · '매출 4.97억원'(새 양식, 원익IPS) · '매출 4,506,790,604원'(파두)
  // — 예전엔 천원만 읽어 새 양식은 표 숫자가 전부 '—'였음(10-18)
  const subSec = subLines('2-4', sec2);
  const subsidiaries = [];
  const UNIT_K = { '원': 1e-3, '천원': 1, '만원': 10, '백만원': 1e3, '억원': 1e5, '조원': 1e8 };
  const AMT = '(-?[\\d,]+(?:\\.\\d+)?)\\s*(조원|억원|백만원|만원|천원|원)';
  const toK = (n, u) => Math.round(parseFloat(n.replace(/,/g, '')) * UNIT_K[u]);
  const num천 = (s, kw) => {  // "kw 1,462천원" / "kw 4.97억원" / "kw -143,014원" → 천원 정수, 없으면 null("매출 -" 등)
    const m = (s || '').match(new RegExp(kw + '\\s*' + AMT));
    return m ? toK(m[1], m[2]) : null;
  };
  let cur = null;
  for (const l of subSec) {
    const h5 = l.match(/^##### (.+)/);
    if (h5) {
      if (cur) subsidiaries.push(cur);
      cur = { name: h5[1].trim(), relation: null, ownership: null, role: null, country: null,
        revenue: null, netIncome: null, equity: null, assets: null, liabilities: null,
        opinion: null, note: null };
      continue;
    }
    if (!cur) continue;
    const relM = l.match(/관계\/지분율[:：]\s*(.+)/);        // 종속기업 / 100%
    if (relM) { const p = relM[1].split('/').map(s => s.trim()); cur.relation = p[0] || null; cur.ownership = p[1] || null; }
    const roleM = l.match(/역할[:：]\s*(.+)/);               // 반도체장비 제조 및 판매 / 독일
    if (roleM) {
      const p = roleM[1].split('/').map(s => s.trim()).filter(Boolean);
      if (p.length >= 2) { cur.country = p[p.length - 1]; cur.role = p.slice(0, -1).join(' / '); }
      else cur.role = p[0] || null;
    }
    const rev = num천(l, '매출'); if (rev != null) cur.revenue = rev;          // "매출 -"는 null 유지
    const eq  = num천(l, '자본'); if (eq  != null) cur.equity = eq;
    const as  = num천(l, '자산'); if (as  != null) cur.assets = as;
    const li  = num천(l, '부채'); if (li  != null) cur.liabilities = li;
    const netM = l.match(new RegExp('순(이익|손실)\\s*' + AMT));
    if (netM) cur.netIncome = toK(netM[2], netM[3]) * (netM[1] === '손실' ? -1 : 1);
    const opM = l.match(/검토의견[:：]\s*(.+)/); if (opM) cur.opinion = opM[1].trim();
    if (l.includes('자본잠식')) cur.note = '자본잠식';
  }
  if (cur) subsidiaries.push(cur);
  for (const s of subsidiaries) if (s.equity != null && s.equity < 0 && !s.note) s.note = '자본잠식';

  const subsidiarySummary = {
    count:        lv('계열회사 수', subSec),
    revenueSum:   lv('계열회사 매출 합계', subSec),
    lossCount:    lv('손실 계열회사', subSec),
    financeCheck: lv('재무 체크', subSec),
  };

  // 3-1 주주
  const sec3 = secLines('3. 주주');
  const sh = subLines('3-1', sec3);
  const majorRaw = lv('최대주주', sh);
  // 끝의 '(32.90%)'만 떼어냄 — split('(')는 '(주)원익홀딩스'처럼 괄호로 시작하는 이름을 빈 값으로 만들었음
  const majorShareholder   = majorRaw?.replace(/\s*\(\s*[\d.]+\s*%\s*\)\s*$/, '').trim() || majorRaw;
  const majorShRatioRaw    = lv('최대주주', sh)?.match(/([\d.]+)%/);
  const majorShareholderRatio = majorShRatioRaw ? majorShRatioRaw[1]+'%' : null;

  const out = {
    stockCode, stockName, receiptNo, updated,
    legalName:   lv('회사명', basic),
    mainBusiness,
    established: lv('설립일', basic),
    listedDate:  lv('상장일', basic),
    location:    lv('소재지', basic),
    subsidiaries,
    subsidiarySummary,
    majorShareholder,
    majorShareholderRatio,
  };
  // 사용자 수정값 적용(주요사업 원래 값은 자르기 전 전문)
  out.orig = {}; out.edited = [];
  const edits = summary?.profile_edits || {};
  for (const { k } of RP_PROFILE_FIELDS) {
    out.orig[k] = (k === 'mainBusiness' ? mainBusinessRaw : out[k]) || null;
    if (typeof edits[k] === 'string') { out[k] = edits[k].trim() || null; out.edited.push(k); }
  }
  return out;
}

// ── 계열사 현황 상세 렌더 (2-4 파싱결과 공용 — 기업개요 탭·DART 탭) · 단위 천원 ──
function _rpSubsContent(subs, summary) {
  const esc = typeof escapeHtml === 'function' ? escapeHtml : (v => v ?? '');
  if (!subs || !subs.length) return '';
  const fmtKW = v => {  // v: 천원 → 억/만/원
    if (v == null) return '—';
    const won = v * 1000, abs = Math.abs(won), sg = won < 0 ? '-' : '';
    if (abs >= 1e12) return sg + (abs / 1e12).toFixed(1) + '조';
    if (abs >= 1e8)  return sg + (abs / 1e8).toFixed(abs < 1e10 ? 2 : 1) + '억';   // 100억 미만은 MD처럼 소수 둘째 자리(4.97억)
    if (abs >= 1e4)  return sg + Math.round(abs / 1e4).toLocaleString() + '만';
    if (abs === 0)   return '0';
    return sg + Math.round(abs).toLocaleString() + '원';
  };
  const relColor = r => /종속/.test(r || '') ? '#2AABEE' : /관계|공동/.test(r || '') ? '#a78bfa' : 'var(--text2)';

  // 요약 스트립
  let summaryHTML = '';
  if (summary && (summary.count || summary.revenueSum || summary.lossCount || summary.financeCheck)) {
    const chip = (label, val, col) => val ? `<span style="display:inline-flex;align-items:baseline;gap:4px">
      <span style="color:var(--text3)">${label}</span><b style="color:${col || 'var(--text1)'}">${esc(val)}</b></span>` : '';
    summaryHTML = `<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:baseline;font-size:calc(11px*var(--m-label));margin-bottom:10px;
      padding:8px 11px;background:var(--bg3);border-radius:var(--radius-sm)">
      ${chip('계열사', summary.count)}${chip('매출합계', summary.revenueSum)}${chip('손실', summary.lossCount, '#f5a623')}
      ${summary.financeCheck
        // '자본잠식 계열회사는 확인되지 않음'처럼 문제없음 문구는 경고색 없이(예전엔 항상 빨간 ⚠)
        ? (/확인되지 않|없음|없습니다/.test(summary.financeCheck)
          ? `<span style="color:var(--text2);flex-basis:100%;line-height:1.5">${esc(summary.financeCheck)}</span>`
          : `<span style="color:#ef4444;flex-basis:100%;line-height:1.5">⚠ ${esc(summary.financeCheck)}</span>`)
        : ''}</div>`;
  }

  // ── 단일 표 렌더 ──────────────────────────────────────────────────────────
  const th = (label, align) => `<th style="padding:7px 9px;text-align:${align || 'left'};color:var(--text2);
    font-weight:600;border-bottom:1px solid var(--border);white-space:nowrap">${label}</th>`;
  const td = (v, align, col, bold) => `<td style="padding:7px 9px;text-align:${align || 'left'};
    border-bottom:1px solid var(--border);color:${col || 'var(--text1)'};${bold ? 'font-weight:700;' : ''}
    font-variant-numeric:tabular-nums">${v}</td>`;
  const COLS = 11;

  // 3곳 이상·절반 이상이 같은 검토의견이면 표 위에 한 번만(원익IPS는 6곳 중 5곳이 같은 문장이었음)
  const opCount = {};
  subs.forEach(s => { if (s.opinion) opCount[s.opinion] = (opCount[s.opinion] || 0) + 1; });
  const common = Object.keys(opCount).find(o => opCount[o] >= 3 && opCount[o] * 2 >= subs.length) || null;
  if (common) summaryHTML += `<div style="font-size:calc(11px*var(--m-label));color:var(--text3);line-height:1.55;margin:-4px 0 10px">
    <span style="color:var(--text2)">공통 검토의견 (${opCount[common]}곳)</span> · ${esc(common)}</div>`;

  const rows = subs.map(s => {
    const insolvent = (s.note && s.note.includes('자본잠식')) || (s.equity != null && s.equity < 0);
    const isLoss = s.netIncome != null && s.netIncome < 0;
    const rc = relColor(s.relation);
    const badge = insolvent
      ? `<span style="font-size:calc(10px*var(--m-label));padding:1px 7px;border-radius:100px;background:#ef444420;color:#ef4444;font-weight:700">자본잠식</span>`
      : isLoss
      ? `<span style="font-size:calc(10px*var(--m-label));padding:1px 7px;border-radius:100px;background:#f5a62320;color:#f5a623;font-weight:700">순손실</span>`
      : `<span style="font-size:calc(10px*var(--m-label));padding:1px 7px;border-radius:100px;background:#4ade8020;color:#4ade80;font-weight:700">정상</span>`;
    const debtRatio = (s.equity != null && s.equity > 0 && s.liabilities != null) ? (s.liabilities / s.equity * 100) : null;
    const rowBg = insolvent ? 'background:#ef44440a' : '';
    return `<tr style="${rowBg}">
      ${td(esc(s.name), 'left', 'var(--text1)', true)}
      ${td(s.relation ? `<span style="font-size:calc(10px*var(--m-label));padding:1px 6px;border-radius:100px;background:${rc}1f;color:${rc};font-weight:600">${esc(s.relation)}</span>` : '—', 'left')}
      ${td(s.ownership ? esc(s.ownership) : '—', 'right')}
      ${td(s.country ? esc(s.country) : '—', 'center', 'var(--text2)')}
      ${td(s.role ? esc(s.role) : '—', 'left', 'var(--text2)')}
      ${td(s.revenue != null ? fmtKW(s.revenue) : '—', 'right')}
      ${td(s.netIncome != null ? fmtKW(s.netIncome) : '—', 'right', s.netIncome == null ? 'var(--text3)' : isLoss ? 'var(--blue)' : 'var(--red)', true)}
      ${td(s.equity != null ? fmtKW(s.equity) : '—', 'right', s.equity != null && s.equity < 0 ? '#ef4444' : 'var(--text1)')}
      ${td(s.assets != null ? fmtKW(s.assets) : '—', 'right', 'var(--text2)')}
      ${td(s.liabilities != null ? fmtKW(s.liabilities) : '—', 'right', 'var(--text2)')}
      ${td(debtRatio != null ? Math.round(debtRatio).toLocaleString() + '%' : '—', 'right', debtRatio != null && debtRatio > 200 ? '#f5a623' : 'var(--text1)')}
      ${td(badge, 'center')}
    </tr>${s.opinion && s.opinion !== common ? `<tr style="${rowBg}"><td colspan="${COLS + 1}" style="padding:2px 9px 9px;border-bottom:1px solid var(--border);
      font-size:calc(11px*var(--m-label));color:var(--text3);line-height:1.55;white-space:normal">
      <span style="color:var(--text2)">검토의견</span> · ${esc(s.opinion)}</td></tr>` : ''}`;
  }).join('');

  return summaryHTML + `<div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:calc(12px*var(--m-sub));white-space:nowrap">
      <thead><tr style="background:var(--bg3)">
        ${th('계열사')}${th('관계')}${th('지분', 'right')}${th('국가', 'center')}${th('역할')}
        ${th('매출', 'right')}${th('순손익', 'right')}${th('자본', 'right')}${th('자산', 'right')}${th('부채', 'right')}${th('부채비율', 'right')}${th('상태', 'center')}
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

// ── 사업 섹션 파서 (4-1 ~ 4-5) ───────────────────────────────────────────────
function _rpParseBusinessSections(md, stockCode) {
  const lines = md.split('\n');

  // "25.1Q" → {bsns_year:2025, quarter:'Q1'}
  const parsePeriod = s => {
    const m = s.trim().match(/^(\d{2})\.(\d)Q$/);
    return m ? { bsns_year: 2000 + parseInt(m[1]), quarter: 'Q' + m[2] } : null;
  };

  // "3,596 (42%)" → {amount:3596, ratio:42.00} / "3,596" → {amount:3596, ratio:null}
  // (소수까지 읽음 — 억원 표의 1,234.5를 백만원으로 바꿀 때 .5를 버리지 않게)
  const parseAmtRatio = s => {
    const str = (s||'').trim();
    if (!str || str === '-') return { amount: null, ratio: null };
    const rm = str.match(/\((\d+\.?\d*)%\)/);
    const ratio = rm ? parseFloat(rm[1]) : null;
    const n = parseFloat(str.replace(/\(.*?\)/,'').replace(/,/g,'').replace(/-/g,'').trim());
    const neg = /^-/.test(str.replace(/\(.*?\)/,'').trim());
    const amount = isNaN(n) ? null : (neg ? -n : n);
    return { amount, ratio };
  };

  // "8,222,688" or "27%" or "-" → {value, isPct}
  const parseNumOrPct = s => {
    const str = (s||'').trim();
    if (!str || str === '-') return { value: null, isPct: false };
    const pm = str.match(/^(\d+\.?\d*)%$/);
    if (pm) return { value: parseFloat(pm[1]), isPct: true };
    const n = parseInt(str.replace(/,/g,''));
    return { value: isNaN(n) ? null : n, isPct: false };
  };

  const parseRow = r => r.split('|').slice(1,-1).map(c => c.trim());

  // 특정 h3 섹션의 h3~다음 h2/h3 사이 줄
  const sectionLines = h3 => {
    const si = lines.findIndex(l => l.startsWith('### ') && l.includes(h3));
    if (si < 0) return [];
    const ei = lines.findIndex((l,i) => i > si && /^#{2,3} /.test(l));
    return lines.slice(si, ei > 0 ? ei : lines.length);
  };

  // 표 단위 → 백만원 배율. 사업분석 탭이 4-1·4-2·4-3·4-6을 '백만원'으로 그리므로 저장 전에 맞춤.
  // 외화가 섞였거나(천 USD 등) 금액이 아닌 단위(대수·천C/S·'천')는 환산할 수 없어 f=null → 저장하지 않음.
  // 단위 표기가 없는 표는 예전처럼 백만원으로 봄(f=1)
  const TO_MIL = { '원': 1e-6, '천원': 1e-3, '백만원': 1, '억원': 100, '십억원': 1e3, '조원': 1e6 };
  const unitFactor = ls => {   // 표 위쪽 줄(가까운 것부터)의 '단위: …'
    // 표 값의 단위는 '**표 기준: 별도 | … | 금액 억원; …; 원문 금액 백만원**'의 '금액 ○○'(표시 단위)가 먼저.
    // 같은 소절의 '원문 단위: 백만원'은 DART 원문 단위라 표와 다르다 — 이것만 읽어 원익IPS 4-1·4-2·4-3·4-6이 100배 작게
    // 저장됐음(10-17 업로드, 23.1Q 매출 1,503.68억 → 1,504백만원)
    for (let i = ls.length - 1; i >= 0; i--) {
      const m = /표 기준/.test(ls[i]) && ls[i].match(/(?<!원문\s?)금액\s*(조원|십억원|억원|백만원|천원|원)/);
      if (m) return { unit: m[1], f: TO_MIL[m[1]] };
    }
    for (let i = ls.length - 1; i >= 0; i--) {
      const m = ls[i].match(/단위[:：]\s*([^)|]+)/);
      if (!m) continue;
      const unit = m[1].trim(), raw = unit.replace(/\s+/g, '');
      if (/USD|JPY|EUR|CNY|CAD|GBP|HKD|달러|위안|엔화/i.test(raw)) return { unit, f: null };
      return { unit, f: TO_MIL[raw.split(/[,/·%]/)[0]] ?? null };
    }
    return { unit: null, f: 1 };
  };

  // 특정 h3 섹션에서 '기간 열(25.1Q)이 있는 첫 표'의 행만 추출(+ 그 표의 단위 uf).
  // 같은 섹션의 '증권사 매출 추정'(26.3QE·연간E) 표가 섞이면 추정치가 과거 분기 매출로 저장됐음
  // 연도별로 나뉜 표(새 양식)는 _rpMdPeriodTable로 합쳐 예전처럼 '한 표' 줄 목록으로. 맨 위 '최근 비교'(최근·전년 동기) 표는
  // 기간 열이 없어 건너뜀
  const isP = h => !!parsePeriod(h);
  const mergedAt = (ls, i) => {
    const T = _rpMdPeriodTable(ls, i, isP);
    return T ? [T.hdr, ...T.rows].map(c => '| ' + c.join(' | ') + ' |') : [];
  };
  const getSectionTable = h3 => {
    const sec = sectionLines(h3);
    for (let i = 1; i < sec.length; i++) {
      if (!/^\|/.test(sec[i]) || /^\|/.test(sec[i - 1])) continue;   // 표의 첫 줄에서만 시작
      if (!parseRow(sec[i]).some(isP)) continue;
      const tbl = mergedAt(sec, i);
      if (tbl.length) { tbl.uf = unitFactor(sec.slice(0, i)); return tbl; }
    }
    return [];
  };

  // 소제목(#### 생산능력 추이 등) 다음의 '첫 번째 연속 표'만 추출 — 한 섹션에 표 여러 개일 때 분리용.
  // 4장 안의 제목 줄에서만 찾음(요약 본문에 같은 낱말이 나와도 무시), 표 없이 다음 제목이 나오면 빈 값(다른 절 표를 집지 않음)
  const sec4 = Math.max(0, lines.findIndex(l => /^## 4\./.test(l)));
  const firstTableAfter = kw => {
    const h = lines.findIndex((l, j) => j >= sec4 && /^#{2,6}\s/.test(l) && l.includes(kw));
    if (h < 0) return [];
    // 기간 열이 있는 첫 표(새 양식의 '최근 비교' 표는 건너뜀) — 다음 제목이 먼저 나오면 빈 값
    for (let i = h + 1; i < lines.length; i++) {
      if (/^#{2,6}\s/.test(lines[i])) return [];
      if (!/^\s*\|/.test(lines[i]) || /^\s*\|/.test(lines[i - 1])) continue;
      if (!parseRow(lines[i].trim()).some(isP)) continue;
      const tbl = mergedAt(lines, i);
      tbl.uf = unitFactor(lines.slice(h, i));   // 제목 '(단위: 백만원)'·'표 기준 … 금액 억원' 등 제목~표 사이 줄
      return tbl;
    }
    return [];
  };

  // skipped: 단위를 백만원으로 바꿀 수 없어 저장하지 않은 표(업로드 알림용)
  const result = { segmentRevenue: [], rawMaterial: [], production: [], orderBacklog: [], skipped: [] };
  const toMil = (n, uf) => Math.round(n * uf.f);
  const usable = (tbl, label) => {
    if (tbl.length < 2) return false;
    if (tbl.uf?.f == null) { result.skipped.push(`${label}(${(tbl.uf?.unit || '단위 불명').slice(0, 20)})`); return false; }
    return true;
  };

  // ── 4-1. 매출(제품별) ─ 차원 컬럼(사업부문·품목) 자동 감지 ──────────────────
  // 헤더에서 기간("25.1Q") 컬럼이 처음 나오는 위치 이전까지를 차원 컬럼으로 본다.
  //   "| 사업부문 | 품목 | 23.1Q | ... |" → 차원 2개(category=사업부문, subcategory=품목)
  //   "| 구분 | 25.1Q | ... |"           → 차원 1개(category=구분)
  const t41 = getSectionTable('4-1');
  if (usable(t41, '4-1 제품별 매출')) {
    const header = parseRow(t41[0]);
    let dimN = header.findIndex(h => parsePeriod(h));  // 첫 기간 컬럼 위치
    if (dimN < 1) dimN = 1;                             // 기간 미인식 시 차원 1개로 폴백
    const periods = header.slice(dimN).map(parsePeriod);
    for (const row of t41.slice(1)) {
      const cols = parseRow(row);
      const category    = (cols[0] || '').trim();
      const subcategory = dimN >= 2 ? (cols[1] || '').trim() : '';
      if (!category || category === '합계' || subcategory === '합계') continue;
      cols.slice(dimN).forEach((v, pi) => {
        if (!periods[pi]) return;
        const { amount, ratio } = parseAmtRatio(v);
        if (amount == null) return;
        result.segmentRevenue.push({
          stock_code: stockCode, ...periods[pi],
          segment_type: 'product', category, subcategory,
          revenue: toMil(amount, t41.uf), revenue_ratio: ratio,
        });
      });
    }
  }

  // ── 4-2. 매출(국내/해외) ─────────────────────────────────────────────────
  const t42 = getSectionTable('4-2');
  if (usable(t42, '4-2 국내/해외 매출')) {
    const periods = parseRow(t42[0]).slice(2).map(parsePeriod);
    for (const row of t42.slice(1)) {
      const cols = parseRow(row);
      const category = cols[0], sub = cols[1];
      if (!category || category === '합계' || sub === '합계') continue;
      cols.slice(2).forEach((v, pi) => {
        if (!periods[pi]) return;
        const str = v.replace(/,/g,'').trim();
        if (!str || str === '-') return;
        const n = parseFloat(str);
        if (isNaN(n)) return;
        result.segmentRevenue.push({
          stock_code: stockCode, ...periods[pi],
          segment_type: 'region', category, subcategory: sub||'',
          revenue: toMil(n, t42.uf), revenue_ratio: null,
        });
      });
    }
  }

  // ── 4-3. 원재료 ──────────────────────────────────────────────────────────
  const t43 = getSectionTable('4-3');
  if (usable(t43, '4-3 원재료')) {
    const periods = parseRow(t43[0]).slice(2).map(parsePeriod);
    for (const row of t43.slice(1)) {
      const cols = parseRow(row);
      const pname = cols[0], mname = cols[1];
      if (!mname || pname === '합계') continue;
      cols.slice(2).forEach((v, pi) => {
        if (!periods[pi]) return;
        const n = parseFloat(v.replace(/,/g,'').trim());
        if (isNaN(n)) return;
        result.rawMaterial.push({
          stock_code: stockCode, ...periods[pi],
          data_type: 'usage', product_name: pname||'', material_name: mname,
          origin: '', amount: toMil(n, t43.uf),
        });
      });
    }
  }

  // ── 4-4. 원재료 가격변동추이 ─────────────────────────────────────────────
  const t44 = getSectionTable('4-4');
  if (t44.length >= 2) {
    const periods = parseRow(t44[0]).slice(2).map(parsePeriod);
    for (const row of t44.slice(1)) {
      const cols = parseRow(row);
      const mname = cols[0], origin = cols[1];
      if (!mname) continue;
      cols.slice(2).forEach((v, pi) => {
        if (!periods[pi]) return;
        const n = parseInt(v.replace(/,/g,'').trim());
        if (isNaN(n)) return;
        result.rawMaterial.push({
          stock_code: stockCode, ...periods[pi],
          data_type: 'price', product_name: '', material_name: mname,
          origin: origin||'', amount: n,
        });
      });
    }
  }

  // ── 4-5. 생산능력·생산실적·가동률 ─────────────────────────────────────────
  //  신형: "생산능력 추이"(품목|기간, 대) · "생산실적 추이"(품목|기간) · "가동률 추이"(항목|기간)
  //  구형: "공장/지표 | 기간" 단일표
  {
    const prodMap = {};
    const put = (name, p, field, val) => {
      if (val == null) return;
      const key = `${p.bsns_year}_${p.quarter}_${name}`;
      (prodMap[key] ||= { stock_code: stockCode, bsns_year: p.bsns_year, quarter: p.quarter,
        factory_name: name, capacity: null, actual: null, utilization_rate: null });
      prodMap[key][field] = val;
    };
    const numOnly = v => { const s = (v || '').replace(/,/g, '').replace(/[^\d.\-]/g, '').trim();
      const n = parseFloat(s); return s === '' || isNaN(n) ? null : Math.round(n); };
    const pctOnly = v => { const m = (v || '').match(/(-?[\d.]+)\s*%/); return m ? parseFloat(m[1]) : null; };
    const pKey = p => `${p.bsns_year}_${p.quarter}`;
    // 표 → { 품목: Map(기간키 → { p, v }) }
    const byItem = (tbl, parse) => {
      const out = {};
      if (tbl.length < 2) return out;
      const h = parseRow(tbl[0]); let d = h.findIndex(x => parsePeriod(x)); if (d < 1) d = 1;
      const P = h.slice(d).map(parsePeriod);
      for (const row of tbl.slice(1)) {
        const cols = parseRow(row); const name = (cols[0] || '').trim();
        if (!name || name === '합계') continue;
        const m = (out[name] ||= new Map());
        cols.slice(d).forEach((v, pi) => { if (P[pi]) m.set(pKey(P[pi]), { p: P[pi], v: parse(v) }); });
      }
      return out;
    };
    // 누적 → 분기: 1분기는 그대로, 2~4분기는 같은 해 직전 분기 누적을 뺌.
    // 직전 누적이 없거나 결과가 음수면 비움(지어내지 않음)
    const deCum = m => {
      const q = new Map();
      for (const [k, { p, v }] of m) {
        const n = +p.quarter.slice(1);
        const prev = n > 1 ? m.get(`${p.bsns_year}_Q${n - 1}`)?.v : 0;
        const d = v == null || prev == null ? null : v - prev;
        q.set(k, { p, v: d != null && d >= 0 ? d : null });
      }
      return q;
    };
    const tCap = firstTableAfter('생산능력 추이');
    const tAct = firstTableAfter('생산실적 추이');
    const tUtil = firstTableAfter('가동률 추이');
    if (tCap.length || tAct.length || tUtil.length) {
      // 4-5 기준 문구가 '누적'이라고 밝힌 경우(반기·3분기·연간 = 기간 누적 공시)만 분기값으로 바꿔 저장.
      // 밝히지 않은 MD는 공시값 그대로(주성엔지니어링처럼 분기마다 공시 방식이 섞인 회사가 있어 숫자 모양으로 추측하지 않음)
      const cumulative = sectionLines('4-5').some(l => /^[-*]\s*기준[:：]/.test(l) && l.includes('누적'));
      const capRaw = byItem(tCap, numOnly), actRaw = byItem(tAct, numOnly);
      const conv = o => Object.fromEntries(Object.entries(o).map(([n, m]) => [n, cumulative ? deCum(m) : m]));
      const cap = conv(capRaw), act = conv(actRaw);
      for (const [name, m] of Object.entries(cap)) for (const { p, v } of m.values()) put(name, p, 'capacity', v);
      for (const [name, m] of Object.entries(act)) for (const { p, v } of m.values()) put(name, p, 'actual', v);

      // 가동률: '…가동률' 행(평균가동률) + 생산능력·실적 표와 같은 품목 행(반도체·디스플레이 등).
      // 가동가능시간 같은 보조 행은 % 값이 없어 건너뜀
      const utilRaw = byItem(tUtil, pctOnly);
      for (const [rowName, m] of Object.entries(utilRaw)) {
        const name = /가동률/.test(rowName) ? '평균가동률' : rowName;
        if (name !== '평균가동률' && !capRaw[name] && !actRaw[name]) continue;
        let out = m;
        if (cumulative) {
          // 누적 가동률은 빼서 분기값을 만들 수 없음. 공시 가동률이 누적 실적÷누적 능력과 맞는(±1%p) 품목만
          // 분기 실적÷분기 능력으로 다시 계산하고, 아니면 1분기(누적=분기)만 남김
          const c = capRaw[name], a = actRaw[name];
          let checked = 0;
          const fits = !!(c && a) && [...m].every(([k, { v }]) => {
            const cv = c.get(k)?.v, av = a.get(k)?.v;
            if (v == null || cv == null || av == null || cv === 0) return true;
            checked++;
            return Math.abs(av / cv * 100 - v) <= 1;
          }) && checked > 0;
          out = new Map([...m].map(([k, { p, v }]) => {
            if (p.quarter === 'Q1') return [k, { p, v }];
            if (!fits) return [k, { p, v: null }];
            const cq = cap[name].get(k)?.v, aq = act[name].get(k)?.v;
            return [k, { p, v: cq && aq != null ? Math.round(aq / cq * 1000) / 10 : null }];
          }));
        }
        for (const { p, v } of out.values()) put(name, p, 'utilization_rate', v);
      }
    } else {
      const t45 = getSectionTable('4-5');
      if (t45.length >= 2) {
        const P = parseRow(t45[0]).slice(1).map(parsePeriod);
        const mm = { '생산능력': 'capacity', '생산실적': 'actual', '가동률': 'utilization_rate' };
        for (const row of t45.slice(1)) {
          const cols = parseRow(row);
          const [factory, metricKr] = (cols[0] || '').split('/').map(s => s.trim());
          const field = mm[metricKr];
          if (!factory || !field) continue;
          cols.slice(1).forEach((v, pi) => { if (!P[pi]) return; const { value } = parseNumOrPct(v); put(factory, P[pi], field, value); });
        }
      }
    }
    result.production = Object.values(prodMap).filter(r =>
      r.capacity != null || r.actual != null || r.utilization_rate != null);
  }

  // ── 4-6. 수주현황 — "수주잔고 추이"(품목 | 기간…) 표만 파싱 ─────────────────────
  // 같은 4-6 섹션의 스냅샷(수주총액/기납품액…)·판매계약 표가 섞이지 않도록 소제목 기준 첫 표만.
  // 잔고는 기말 잔액(stock). 매출처럼 합산하지 않음. segment_type='backlog'로 저장.
  const t46 = firstTableAfter('수주잔고 추이');
  if (usable(t46, '4-6 수주잔고')) {
    const header = parseRow(t46[0]);
    let dimN = header.findIndex(h => parsePeriod(h));
    const periods = dimN >= 1 ? header.slice(dimN).map(parsePeriod) : [];
    // 기간 컬럼이 실제로 있을 때만(= 수주잔고 추이 표).
    if (periods.some(Boolean)) {
      for (const row of t46.slice(1)) {
        const cols = parseRow(row);
        const category = (cols[0] || '').trim();
        if (!category || category === '합계') continue;
        cols.slice(dimN).forEach((v, pi) => {
          if (!periods[pi]) return;
          const n = parseFloat((v || '').replace(/,/g, '').trim());
          if (isNaN(n)) return;
          result.orderBacklog.push({
            stock_code: stockCode, ...periods[pi],
            segment_type: 'backlog', category, subcategory: '',
            revenue: toMil(n, t46.uf), revenue_ratio: null,
          });
        });
      }
    }
  }

  return result;
}

// ── MD → 아코디언 섹션 HTML ───────────────────────────────────────────────────
// 섹션(## )마다 헤더만 먼저 그리고 본문은 처음 펼칠 때 렌더(RPD.secs) — 원익IPS MD를 한 번에 그리면 DOM 13.8만 노드였음

// DART 탭 상태 — 상세 분석 섹션 원문 줄
const RPD = { secs: [] };

// 원자료 덤프(원문 변환본·원문 XML·API JSON = 5~7장)는 화면·저장에서 뺀다 — 원익IPS 기준 MD 6MB의 98%·DOM의 92%.
// 분석(1~4장)·변경사항(8장~)만 남기고 원문은 헤더의 'DART 원문' 링크로 대신함. 코드블록 안의 '## '는 제목으로 보지 않음.
// 옛 양식(06월 생성분)은 5장 안에 '## 원문 XML: 접수번호.xml'이 따로 ## 제목으로 있음
const _RPD_RAW_SEC = /^##\s+(?:\d+\.\s*(?:보고서 원문 전체 변환|재무정보 전체|정기보고서 주요정보 전체)|원문 XML:.*)\s*$/;
const _rpFenceClose = open => new RegExp(`^${open[0] === '`' ? '`' : '~'}{${open.length},}\\s*$`);
// 새 양식(10-18~)의 편집용 줄 — 목차 앵커 '<a id="section-2-3"></a>', '<!-- reader-layout … -->' 주석, 로컬 파일로 가는
// '[상세 검토·계산 근거](../../data/…review_details….md#…)'(사이트엔 없는 파일). 카드에 '<a id=…>' 글자가 그대로 보였음
const _RPD_DROP_LINE = /^(<a id="[^"]*">\s*<\/a>|<!--.*-->|[-*]\s*\[상세 검토[^\]]*\]\((?!https?:)[^)]*\))$/;
function _rpStripRawSections(md) {
  const out = [];
  let skip = false, close = null;
  for (const line of (md || '').split('\n')) {
    const t = line.trim();
    if (close) { if (close.test(t)) close = null; }
    else if (/^(`{3,}|~{3,})/.test(t)) close = _rpFenceClose(t.match(/^(`{3,}|~{3,})/)[1]);
    else if (/^## /.test(line)) skip = _RPD_RAW_SEC.test(t);
    else if (_RPD_DROP_LINE.test(t)) continue;
    if (!skip) out.push(line);
  }
  return out.join('\n');
}

// 인라인: [글](url) → 원문 칩(safeUrl 통과분만), **굵게**, `코드`, <br>, [공시 확인]·[증권사 전망] 태그.
// \[ \] \* \| 같은 마크다운 이스케이프는 글자 그대로 — 자리표시로 잠시 빼 둬서 굵게·태그로 오인하지 않게 함
// (공시 제목 '[분기별공시(개별회사용)]'처럼 대괄호가 든 링크 글자가 생성기에서 \[ \]로 나옴)
const _RPD_ESC = /\\([\\`*_{}\[\]()#+\-.!|])/g;
const _rpMdText = s => escapeHtml(s.replace(_RPD_ESC, (m, c) => `\u0002${c.charCodeAt(0)}\u0003`))
  .replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--text)">$1</strong>')
  .replace(/`([^`]+)`/g, '<code style="background:var(--bg3);padding:1px 4px;border-radius:3px;font-size:calc(11px*var(--m-label))">$1</code>')
  .replace(/&lt;br\s*\/?&gt;/gi, '<br>')
  .replace(/\[((?:공시|증권사|회사|언론|자체)[^\[\]]{0,12})\]/g, (m, tag) => {
    const c = /전망|추정/.test(tag) ? 'var(--warn)' : 'var(--tg)';
    return `<span style="display:inline-block;padding:0 7px;margin-left:2px;border-radius:100px;font-size:calc(10px*var(--m-label));font-weight:600;vertical-align:1px;white-space:nowrap;background:color-mix(in srgb, ${c} 14%, transparent);color:${c}">${tag}</span>`;
  })
  .replace(/\u0002(\d+)\u0003/g, (m, c) => escapeHtml(String.fromCharCode(+c)));
function _rpMdInline(s) {
  const re = /\[((?:\\.|[^\]\\\n])+)\]\((https?:\/\/[^)\s]+)\)/g;   // 링크 글자 안의 \] 허용
  let html = '', last = 0, m;
  while ((m = re.exec(s))) {
    html += _rpMdText(s.slice(last, m.index));
    const url = safeUrl(m[2]);
    html += url
      ? `<a href="${escAttr(url)}" target="_blank" rel="noopener" style="display:inline-block;padding:0 7px;margin:0 2px;border-radius:100px;font-size:calc(11px*var(--m-label));line-height:1.6;white-space:nowrap;text-decoration:none;vertical-align:1px;background:color-mix(in srgb, var(--tg) 12%, transparent);color:var(--tg)">${escapeHtml(m[1].replace(_RPD_ESC, '$1'))} ↗</a>`
      : _rpMdText(m[0]);
    last = re.lastIndex;
  }
  return html + _rpMdText(s.slice(last));
}

// '라벨: 내용' 줄은 라벨만 굵게. 투자판단·리스크·검토의견·중요도는 라벨에 의미색(예전엔 줄 전체를 칠해 긴 문단이 읽기 힘들었음)
// 상세 분석 줄 머리 이름표 색 — 10-18 MD에 근거·판단 전환 조건·해석 한계·범위 유의가 더해짐(사실 → 해석 → 바뀌는 조건 → 한계)
const _RPD_KEY = { '투자판단': 'var(--green)', '리스크': 'var(--danger)', '검토의견': 'var(--tg)', '중요도': 'var(--warn)',
  '판단 전환 조건': 'var(--warn)', '근거': 'var(--text2)', '해석 한계': 'var(--text3)', '범위 유의': 'var(--text3)' };
function _rpMdLabeled(t) {
  const m = t.match(/^([^:：\[\]()*`|]{1,16}?)\s*[:：](?:\s+(.*))?$/);
  if (!m) return _rpMdInline(t);
  const col = _RPD_KEY[m[1].trim()];
  return `<b style="color:${col || 'var(--text)'};font-weight:${col ? 700 : 600}">${escapeHtml(m[1].trim())}</b> ${_rpMdInline(m[2] || '')}`;
}

// 숫자 칸(정렬 미지정 열의 자동 우측 정렬용): 1,234 / -12.5% / (3,000) / +1.3%p / 6,345.90억원 / 3,225,945주
const _RPD_NUM = /^[-+]?\(?[\d,]*\.?\d+\)?\s*(%p?|원|억원|억|조원|조|백만원|천원|만원|주|대|회|일|배|개사|개|명)?$/;
function _rpMdTable(tableLines) {
  const cells = _rpMdCells;
  const isSep = l => /^\|[-:\s|]+$/.test(l);
  const sep = tableLines.find(isSep);
  const align = sep ? cells(sep).map(c => /^:-+:$/.test(c) ? 'center' : /^-+:$/.test(c) ? 'right' : /^:-+$/.test(c) ? 'left' : null) : [];
  const rows = tableLines.filter(l => !isSep(l));
  if (!rows.length) return '';
  const hdr = cells(rows[0]);
  const body = rows.slice(1).map(cells);
  // 열이 많은 표(분기 추이 등)는 내용 폭대로 펼쳐 가로 스크롤 + 첫 열 고정 — 100% 폭에 욱여넣으면 항목명이 한 글자씩 줄바꿈됐음
  const wide = hdr.length > 5;
  const stick = wide ? 'position:sticky;left:0;z-index:1;min-width:88px;max-width:180px;white-space:normal;' : '';
  // 정렬 미지정 열은 값의 60% 이상이 숫자일 때만 우측 정렬(열 단위) — 칸마다 판정하면 '항목|값' 표가 들쭉날쭉해짐
  const auto = hdr.map((_, k) => {
    const vals = body.map(r => r[k]).filter(v => v && v !== '-');
    return vals.length && vals.filter(v => _RPD_NUM.test(v)).length / vals.length >= 0.6 ? 'right' : 'left';
  });
  const al = k => align[k] || auto[k];
  return `<div style="overflow-x:auto;margin:4px 0;border:1px solid var(--border);border-radius:var(--radius-sm)">
    <table style="${wide ? 'width:max-content;min-width:100%' : 'width:100%'};border-collapse:collapse;font-size:calc(12px*var(--m-sub));font-variant-numeric:tabular-nums">
      <thead><tr style="background:var(--bg3)">
        ${hdr.map((h, k) => `<th style="${k === 0 ? stick : ''}background:inherit;padding:5px 8px;text-align:${al(k)};font-weight:600;color:var(--text1);
          border-bottom:1px solid var(--border);white-space:nowrap">${_rpMdInline(h)}</th>`).join('')}
      </tr></thead>
      <tbody>
        ${body.map((r, ri) => `<tr style="background:${ri % 2 ? 'color-mix(in srgb, var(--bg3) 55%, var(--bg2))' : 'var(--bg2)'}">
          ${r.map((c, k) => { const a = al(k); return `<td style="${k === 0 ? stick : ''}background:inherit;padding:4px 8px;text-align:${a};color:var(--text1);
            border-bottom:1px solid var(--border);line-height:1.5;${a === 'right' ? 'white-space:nowrap;' : wide && k ? 'max-width:320px;' : ''}">${_rpMdInline(c)}</td>`; }).join('')}
        </tr>`).join('')}
      </tbody>
    </table></div>`;
}

// 섹션 본문 줄 → HTML
function _rpMdBlocks(lines) {
  let html = '', i = 0;
  const text = 'font-size:calc(12px*var(--m-sub));color:var(--text1);line-height:1.6;min-width:0;overflow-wrap:anywhere';
  while (i < lines.length) {
    const line = lines[i].trimEnd();
    const t = line.trim();

    const fm = t.match(/^(`{3,}|~{3,})/);
    if (fm) {   // 코드블록 — 높이 제한 스크롤 상자
      const close = _rpFenceClose(fm[1]), body = [];
      for (i++; i < lines.length && !close.test(lines[i].trim()); i++) body.push(lines[i]);
      i++;
      html += `<pre style="margin:4px 0;padding:8px 10px;max-height:320px;overflow:auto;background:var(--bg3);border-radius:var(--radius-sm);
        font-size:calc(11px*var(--m-label));color:var(--text2);white-space:pre">${escapeHtml(body.join('\n'))}</pre>`;
      continue;
    }

    const h = line.match(/^(#{3,6})\s+(.*)$/);
    if (h) {
      const n = h[1].length, title = _rpMdInline(h[2].trim());
      html += n === 3
        ? `<div style="font-size:calc(12px*var(--m-sub));font-weight:700;color:var(--tg);margin-top:10px;margin-bottom:4px;padding-bottom:3px;border-bottom:1px solid var(--border2)">${title}</div>`
        : n === 4
        ? `<div style="font-size:calc(12px*var(--m-sub));font-weight:700;color:var(--text1);margin-top:6px">${title}</div>`
        : `<div style="font-size:calc(11px*var(--m-label));font-weight:600;color:var(--text2);margin-top:4px">${title}</div>`;
      i++; continue;
    }
    if (/^---+$/.test(t)) { i++; continue; }

    // 생성기의 접기 블록(<details>/<summary> 줄 단독)만 실제 태그로 — 그 외 HTML은 글자로 이스케이프
    if (t === '<details>') { html += `<details style="margin:2px 0">`; i++; continue; }
    if (t === '</details>') { html += `</details>`; i++; continue; }
    const sm = t.match(/^<summary>(.*)<\/summary>$/);
    if (sm) { html += `<summary style="cursor:pointer;font-size:calc(11px*var(--m-label));color:var(--text2);padding:2px 0">${_rpMdInline(sm[1])}</summary>`; i++; continue; }

    if (/^\|/.test(line)) {
      const tbl = [];
      while (i < lines.length && /^\|/.test(lines[i].trimEnd())) { tbl.push(lines[i].trimEnd()); i++; }
      html += _rpMdTable(tbl);
      continue;
    }

    const li = line.match(/^(\s*)[-*]\s+(.*)$/);
    if (li) {   // 들여쓴 목록(대표 경력 등)은 단계별 들여쓰기
      const lv = Math.min(3, Math.floor(li[1].replace(/\t/g, '  ').length / 2));
      html += `<div style="display:flex;align-items:flex-start;gap:6px;padding:1px 0 1px ${lv * 16}px">
        <span style="color:var(--text2);font-size:calc(11px*var(--m-label));margin-top:5px;flex-shrink:0">${lv ? '·' : '◦'}</span>
        <span style="${text}">${_rpMdLabeled(li[2].trim())}</span>
      </div>`;
      i++; continue;
    }

    if (!t) { i++; continue; }
    const bold = t.match(/^\*\*(.+)\*\*$/);   // 굵은 제목 줄(투자포인트·리스크 항목 등)
    html += bold
      ? `<div style="font-size:calc(13px*var(--m-body));font-weight:700;color:var(--text);margin-top:8px;overflow-wrap:anywhere">${_rpMdInline(bold[1])}</div>`
      : `<div style="${text}">${_rpMdLabeled(t)}</div>`;
    i++;
  }
  return html;
}

function _mdToAccordion(md) {
  const src = md || '';
  const kept = _rpStripRawSections(src);
  RPD.secs = [];
  let close = null;
  for (const line of kept.split('\n')) {
    const t = line.trim();
    if (close) { if (close.test(t)) close = null; }
    else if (/^(`{3,}|~{3,})/.test(t)) close = _rpFenceClose(t.match(/^(`{3,}|~{3,})/)[1]);
    else if (/^## /.test(line)) { RPD.secs.push({ title: t.replace(/^##\s+/, ''), lines: [] }); continue; }
    if (RPD.secs.length) RPD.secs[RPD.secs.length - 1].lines.push(line);   // 첫 ## 이전(# 제목)은 버림
  }
  const html = RPD.secs.map((s, i) => `
    <div style="border:1px solid var(--border);border-radius:var(--radius-sm);overflow:hidden">
      <div onclick="rpDartAcc(${i})"
        style="padding:9px 14px;background:var(--bg2);cursor:pointer;display:flex;
          align-items:center;gap:8px;font-size:calc(13px*var(--m-body));font-weight:700;color:var(--text1);user-select:none">
        <span id="dac-l-${i}" style="font-size:calc(11px*var(--m-label));color:var(--text2);width:12px">▶</span>
        ${escapeHtml(s.title)}
      </div>
      <div id="dac-${i}" style="display:none;padding:12px 14px"></div>
    </div>`).join('');
  const note = kept.length < src.length
    ? `<div style="font-size:calc(11px*var(--m-label));color:var(--text3);padding:4px 2px">원문 변환본·원문 XML·API 원자료(5~7장)는 화면에서 뺐습니다 — 위 'DART 원문' 링크에서 확인</div>`
    : '';
  return html + note;
}

// 아코디언 펼침/접힘 — 처음 펼칠 때 본문 렌더
function rpDartAcc(i) {
  toggleSection(`dac-${i}`, `dac-l-${i}`, ['▼', '▶'], () => {
    const el = document.getElementById(`dac-${i}`);
    if (!el || el.dataset.r || !RPD.secs[i]) return;
    el.innerHTML = `<div style="display:flex;flex-direction:column;gap:6px">${_rpMdBlocks(RPD.secs[i].lines)}</div>`;
    el.dataset.r = '1';
  });
}

// ── DART MD 파서 ─────────────────────────────────────────────────────────────
function _rpParseMd(text) {
  const lines = text.split('\n');

  function tableVal(sectionKeyword, key) {
    const si = lines.findIndex(l => l.includes(sectionKeyword));
    if (si < 0) return null;
    for (let i = si; i < Math.min(si + 40, lines.length); i++) {
      const m = lines[i].match(/\|\s*(.+?)\s*\|\s*(.+?)\s*\|/);
      if (m && m[1].trim() === key) return m[2].trim();
    }
    return null;
  }

  function lineVal(keyword) {
    const l = lines.find(l => l.match(new RegExp(`[-*]\\s*${keyword}[:：]`)));
    return l ? l.replace(new RegExp(`.*${keyword}[:：]\\s*`), '').trim() : null;
  }

  function allTagged(tag) {
    return lines
      .filter(l => l.match(new RegExp(`^[-*]\\s*${tag}[:：]`)))
      .map(l => l.replace(new RegExp(`^[-*]\\s*${tag}[:：]\\s*`), '').trim())
      .filter(Boolean);
  }

  // 신양식 1-1 투자포인트 / 1-2 핵심 리스크 — 굵은 제목 줄(**제목 [태그]**) 하나가 항목 하나.
  // 섹션이 없으면 null(옛 양식 → '- 투자판단:' 줄로 폴백), 섹션은 있는데 항목이 없으면 [] (폴백하지 않음)
  function boldTitles(h3re) {
    const si = lines.findIndex(l => h3re.test(l));
    if (si < 0) return null;
    const ei = lines.findIndex((l, i) => i > si && /^#{2,3} /.test(l));
    return lines.slice(si + 1, ei > 0 ? ei : lines.length)
      .map(l => l.trim().match(/^\*\*(.+)\*\*$/)?.[1].trim())
      .filter(Boolean);
  }

  const stockCode  = tableVal('문서 개요', '종목코드') || '';
  const stockName  = tableVal('문서 개요', '회사명') || '';
  const reportType = tableVal('문서 개요', '원문 기준') || '';
  const receiveDate = tableVal('문서 개요', '접수일') || '';

  const dilutionRatioRaw = lineVal('전체 잠재 물량');
  const dilutionRatio = dilutionRatioRaw ? parseFloat(dilutionRatioRaw.match(/([\d.]+)%/)?.[1] ?? '0') : 0;

  const lockupRaw = lineVal('보호예수 물량');
  const lockupRatio = lockupRaw ? parseFloat(lockupRaw.match(/([\d.]+)%/)?.[1] ?? '0') : 0;
  const lockupEnd = lineVal('주요 반환예정일');

  const majorRaw = lineVal('최대주주 및 특수관계인 지분');
  const relatedPartyRatio = majorRaw ? parseFloat(majorRaw.match(/([\d.]+)%/)?.[1] ?? '0') : 0;

  return {
    stock_code:   stockCode,
    stock_name:   stockName,
    report_type:  reportType,
    receive_date: receiveDate,
    summary: {
      dilution_ratio:     dilutionRatio,
      lockup_ratio:       lockupRatio,
      lockup_end:         lockupEnd,
      related_party_ratio: relatedPartyRatio,
      investment_points:  boldTitles(/^### 1-1\./) ?? allTagged('투자판단'),
      risk_points:        boldTitles(/^### 1-2\./) ?? allTagged('리스크'),
      review_points:      allTagged('검토의견'),
    },
  };
}

// ── DART 업로드 ───────────────────────────────────────────────────────────────
async function rpUploadDart(input) {
  const file = input.files?.[0];
  if (!file) return;

  let text;
  try { text = await file.text(); } catch(e) { toast('파일 읽기 실패', 'error'); return; }

  let parsed;
  try { parsed = _rpParseMd(text); } catch(e) { toast('MD 파싱 실패: ' + e.message, 'error'); return; }

  if (!parsed.stock_code) { toast('종목코드를 파싱할 수 없습니다 (문서 개요 섹션 확인)', 'warn'); return; }

  toast('저장 중...', 'info');
  // 사용자가 고친 기본정보(profile_edits)는 새 MD에도 이어받음 — 이 종목의 가장 최근 리포트 기준
  try {
    const { data: prev } = await sb.from('dart_reports').select('summary')
      .eq('stock_code', parsed.stock_code).order('receive_date', { ascending: false }).limit(1).maybeSingle();
    if (prev?.summary?.profile_edits) parsed.summary.profile_edits = prev.summary.profile_edits;
  } catch (e) {}
  const { error } = await sb.from('dart_reports').upsert({
    stock_code:   parsed.stock_code,
    stock_name:   parsed.stock_name,
    report_type:  parsed.report_type,
    receive_date: parsed.receive_date,
    raw_md:       _rpStripRawSections(text),   // 파싱은 원본 전체로, 저장은 원자료(5~7장) 뺀 본 — 원익IPS 6MB→약 0.1MB
    summary:      parsed.summary,
  }, { onConflict: 'stock_code,report_type' });

  if (error) { toast('저장 실패: ' + error.message, 'error'); return; }

  // 4-1 ~ 4-5 사업 섹션 파싱 & 저장
  try {
    const biz = _rpParseBusinessSections(text, parsed.stock_code);
    // 동일 충돌키 중복 제거 (마지막 값 우선) — Postgres 배치 upsert의 "cannot affect row a second time" 방지
    const _dedup = (arr, keys) => {
      const m = new Map();
      for (const r of arr) m.set(keys.map(k => r[k] ?? '').join(''), r);
      return [...m.values()];
    };
    // 제품/지역 매출 + 수주잔고는 같은 테이블(dart_segment_revenue), segment_type로 구분 → 한 번에 upsert
    const segRows  = _dedup([...biz.segmentRevenue, ...biz.orderBacklog],
      ['stock_code','bsns_year','quarter','segment_type','category','subcategory']);
    const rawRows  = _dedup(biz.rawMaterial,    ['stock_code','bsns_year','quarter','data_type','product_name','material_name','origin']);
    const prodRows = _dedup(biz.production,      ['stock_code','bsns_year','quarter','factory_name']);
    const saves = [];
    if (segRows.length)
      saves.push(sb.from('dart_segment_revenue').upsert(segRows,
        { onConflict: 'stock_code,bsns_year,quarter,segment_type,category,subcategory' }));
    if (rawRows.length)
      saves.push(sb.from('dart_raw_material').upsert(rawRows,
        { onConflict: 'stock_code,bsns_year,quarter,data_type,product_name,material_name,origin' }));
    if (prodRows.length)
      saves.push(sb.from('dart_production').upsert(prodRows,
        { onConflict: 'stock_code,bsns_year,quarter,factory_name' }));
    await Promise.all(saves);
    const counts = `세그먼트 ${segRows.length}건 / 원재료 ${rawRows.length}건 / 생산 ${prodRows.length}건`;
    if (biz.skipped.length)   // 백만원으로 못 바꾼 표 — 사업분석 탭에 틀린 단위로 그리지 않도록 저장 안 함
      toast(`${parsed.stock_name} DART 저장 완료 (${counts}) · 백만원으로 바꿀 수 없는 단위라 저장 안 함: ${biz.skipped.join(', ')}`, 'warn');
    else
      toast(`${parsed.stock_name} DART 저장 완료 (${counts})`, 'success');
  } catch(e) {
    toast(`DART 기본 저장 완료, 사업 섹션 저장 실패: ${e.message}`, 'warn');
  }
  input.value = '';

  // 저장 후 전체 리로드 — 방금 저장한 세그먼트(제품별 매출)까지 재조회해야
  // 기업현황 탭의 '제품·사업부별 매출' 그래프에 즉시 반영된다.
  // (기존엔 dart만 갱신 → segment 미조회로 재업로드 전까지 그래프 비어 보임)
  _rpStock = { code: parsed.stock_code, name: parsed.stock_name };
  try {
    await rpLoadReport();  // price·fin·watch·dart·analyst·segment·company·summary 전부 재조회 + 렌더
  } catch (e) {
    // 데이터 로드 실패해도 DART 탭은 자체 조회로 표시 가능
  }
  setTimeout(() => rpSetTab(RP_TABS.indexOf('DART 분석')), 50);
}
