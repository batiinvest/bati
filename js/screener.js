// screener.js — 종목 스크리너 페이지
// 의존: config.js (INDUSTRIES, fetchAllPages, fmtCap, loadingHTML, emptyHTML)
//
// [v2] JS 풀스캔 제거 — Supabase 쿼리 레벨 필터로 이전
//   - financials 전체 fetchAllPages 제거
//   - gte/lte 조건을 DB 쿼리에서 처리
//   - market_data + financials JOIN은 PostgREST 미지원이라 market_data 기준으로 조회 후
//     financials는 최신 분기 1건씩만 조회 (종목별 최신값 캐시)

// 페이지 상태 네임스페이스 — 구 window._screenerData 수렴
const SCR = {};

function pScreener() {
  return `
  <div style="display:flex;gap:6px;align-items:center;margin-bottom:1rem;flex-wrap:wrap">
    <button class="chip active" onclick="go('screener')">${_ICO.search}필터 스크리닝</button>
    <button class="chip" onclick="go('financials')">${_ICO.bar}기업 분석</button>
  </div>
  <div class="screener-layout" style="display:grid;grid-template-columns:280px 1fr;gap:1rem;align-items:start">
    <div class="card screener-filter collapsed" style="position:sticky;top:1rem">
      <!-- 모바일: 헤더 탭으로 접기/펼치기 (기본 접힘 → 결과 우선). 데스크톱: 항상 펼침 -->
      <div class="card-header sc-filter-toggle" onclick="scToggleFilter()">
        <span class="card-title">${_ICO.search}필터 조건</span>
        <span class="sc-filter-chev">▾</span>
      </div>
      <div id="sc-filter-body" style="padding:.75rem 1rem;display:flex;flex-direction:column;gap:1rem">
        <div>
          <div style="font-size:11px;font-weight:600;color:var(--text2);margin-bottom:.75rem">프리셋 — 한 번에 조건 채우기</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            <button class="btn btn-sm" onclick="applyPreset('value')">가치주</button>
            <button class="btn btn-sm" onclick="applyPreset('growth')">성장주</button>
            <button class="btn btn-sm" onclick="applyPreset('quality')">우량주</button>
            <button class="btn btn-sm" onclick="applyPreset('peg')">성장주(PEG)</button>
            <button class="btn btn-sm" onclick="applyPreset('deepvalue')">딥밸류</button>
            <button class="btn btn-sm" onclick="applyPreset('reset')">초기화</button>
          </div>
        </div>
        <div style="border-top:1px solid var(--border);padding-top:.75rem">
          <div style="font-size:12px;color:var(--text1);margin-bottom:6px">산업</div>
          <select class="form-select" id="sc-industry" style="width:100%">
            <option value="">전체</option>
            ${INDUSTRIES.map(i => `<option>${i}</option>`).join('')}
          </select>
        </div>
        <div>
          <div style="font-size:12px;color:var(--text1);margin-bottom:6px">시장</div>
          <select class="form-select" id="sc-market" style="width:100%">
            <option value="">전체</option>
            <option value="KOSPI">코스피</option>
            <option value="KOSDAQ">코스닥</option>
          </select>
        </div>
        <div style="border-top:1px solid var(--border);padding-top:.75rem">
          <div style="font-size:11px;font-weight:600;color:var(--text2);margin-bottom:.75rem">밸류에이션</div>
          ${[
            ['sc-per-min','sc-per-max','PER','저평가 기준: 0~15'],
            ['sc-pbr-min','sc-pbr-max','PBR','순자산 대비: 0~1 저평가'],
            ['sc-peg-min','sc-peg-max','PEG','성장 대비 밸류: 1 이하 매력'],
            ['sc-eveb-min','sc-eveb-max','EV/EBITDA','적정: 8~12배'],
          ].map(([a,b,l,hint])=>`
            <div style="margin-bottom:.75rem">
              <div style="font-size:12px;color:var(--text1);margin-bottom:4px">${l}</div>
              <div style="display:flex;gap:6px;align-items:center">
                <input type="number" class="form-input" id="${a}" placeholder="최소" style="width:70px;padding:4px 8px;font-size:12px">
                <span style="color:var(--text2);font-size:12px">~</span>
                <input type="number" class="form-input" id="${b}" placeholder="최대" style="width:70px;padding:4px 8px;font-size:12px">
              </div>
              <div class="form-hint">${hint}</div>
            </div>`).join('')}
        </div>
        <div style="border-top:1px solid var(--border);padding-top:.75rem">
          <div style="font-size:11px;font-weight:600;color:var(--text2);margin-bottom:.75rem">수익성</div>
          ${[
            ['sc-margin-min','sc-margin-max','영업이익률(%)','우량: 10% 이상'],
            ['sc-roe-min','sc-roe-max','ROE(%)','우량: 15% 이상'],
            ['sc-roa-min','sc-roa-max','ROA(%)','우량: 5% 이상'],
          ].map(([a,b,l,hint])=>`
            <div style="margin-bottom:.75rem">
              <div style="font-size:12px;color:var(--text1);margin-bottom:4px">${l}</div>
              <div style="display:flex;gap:6px;align-items:center">
                <input type="number" class="form-input" id="${a}" placeholder="최소" style="width:70px;padding:4px 8px;font-size:12px">
                <span style="color:var(--text2);font-size:12px">~</span>
                <input type="number" class="form-input" id="${b}" placeholder="최대" style="width:70px;padding:4px 8px;font-size:12px">
              </div>
              <div class="form-hint">${hint}</div>
            </div>`).join('')}
        </div>
        <div style="border-top:1px solid var(--border);padding-top:.75rem">
          <div style="font-size:11px;font-weight:600;color:var(--text2);margin-bottom:.75rem">재무건전성</div>
          ${[
            ['sc-debt-min','sc-debt-max','부채비율(%)','안정: 100% 이하'],
            ['sc-cr-min','sc-cr-max','유동비율(%)','안정: 150% 이상'],
          ].map(([a,b,l,hint])=>`
            <div style="margin-bottom:.75rem">
              <div style="font-size:12px;color:var(--text1);margin-bottom:4px">${l}</div>
              <div style="display:flex;gap:6px;align-items:center">
                <input type="number" class="form-input" id="${a}" placeholder="최소" style="width:70px;padding:4px 8px;font-size:12px">
                <span style="color:var(--text2);font-size:12px">~</span>
                <input type="number" class="form-input" id="${b}" placeholder="최대" style="width:70px;padding:4px 8px;font-size:12px">
              </div>
              <div class="form-hint">${hint}</div>
            </div>`).join('')}
        </div>
        <div style="border-top:1px solid var(--border);padding-top:.75rem">
          <div style="font-size:11px;font-weight:600;color:var(--text2);margin-bottom:.75rem">시가총액</div>
          <div style="display:flex;gap:6px;align-items:center">
            <input type="number" class="form-input" id="sc-cap-min" placeholder="최소(억)" style="width:90px;padding:4px 8px;font-size:12px">
            <span style="color:var(--text2);font-size:12px">~</span>
            <input type="number" class="form-input" id="sc-cap-max" placeholder="최대(억)" style="width:90px;padding:4px 8px;font-size:12px">
          </div>
        </div>
        <button class="btn btn-primary" onclick="runScreener()" style="width:100%">검색</button>
      </div>
    </div>
    <div>
      <div id="sc-result" style="color:var(--text2);font-size:13px;padding:2rem;text-align:center">
        조건을 설정하고 검색 버튼을 눌러주세요.
      </div>
    </div>
  </div>`;
}

function applyPreset(type) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  ['sc-per-min','sc-per-max','sc-pbr-min','sc-pbr-max','sc-margin-min','sc-margin-max',
   'sc-roe-min','sc-roe-max','sc-roa-min','sc-roa-max','sc-debt-min','sc-debt-max',
   'sc-cr-min','sc-cr-max','sc-cap-min','sc-cap-max','sc-peg-min','sc-peg-max',
   'sc-eveb-min','sc-eveb-max'].forEach(id => set(id, ''));
  if (type === 'value')        { set('sc-per-max','15'); set('sc-pbr-max','1.5'); set('sc-margin-min','5'); set('sc-debt-max','100'); }
  else if (type === 'growth')  { set('sc-margin-min','15'); set('sc-roe-min','15'); set('sc-per-max','50'); }
  else if (type === 'quality') { set('sc-margin-min','10'); set('sc-roe-min','10'); set('sc-debt-max','100'); set('sc-cr-min','150'); }
  else if (type === 'peg')     { set('sc-peg-max','1.5'); set('sc-roe-min','10'); }
  else if (type === 'deepvalue') { set('sc-pbr-max','0.5'); set('sc-per-max','8'); }
}

// 모바일 전용 필터 접기/펼치기 (데스크톱은 CSS가 항상 펼침 유지)
function scToggleFilter() {
  if (window.matchMedia('(min-width:901px)').matches) return;
  document.querySelector('.screener-filter')?.classList.toggle('collapsed');
}

async function runScreener() {
  const el = document.getElementById('sc-result');
  el.innerHTML = loadingHTML('검색 중...');

  // 모바일: 검색 즉시 필터를 접고 결과 영역으로 스크롤 — 결과 우선
  if (window.matchMedia('(max-width:900px)').matches) {
    document.querySelector('.screener-filter')?.classList.add('collapsed');
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const g = id => { const v = document.getElementById(id)?.value; return v !== '' && v != null ? parseFloat(v) : null; };
  const industry = document.getElementById('sc-industry')?.value || '';
  const market   = document.getElementById('sc-market')?.value   || '';
  const f = {
    perMin:    g('sc-per-min'),    perMax:    g('sc-per-max'),
    pbrMin:    g('sc-pbr-min'),    pbrMax:    g('sc-pbr-max'),
    marginMin: g('sc-margin-min'), marginMax: g('sc-margin-max'),
    roeMin:    g('sc-roe-min'),    roeMax:    g('sc-roe-max'),
    roaMin:    g('sc-roa-min'),    roaMax:    g('sc-roa-max'),
    debtMin:   g('sc-debt-min'),   debtMax:   g('sc-debt-max'),
    crMin:     g('sc-cr-min'),     crMax:     g('sc-cr-max'),
    capMin:    g('sc-cap-min'),    capMax:    g('sc-cap-max'),
    pegMin:    g('sc-peg-min'),    pegMax:    g('sc-peg-max'),
    ebebMin:   g('sc-eveb-min'),   ebebMax:   g('sc-eveb-max'),
  };

  // ── 최신 base_date — config.js 전역 캐시 사용 ──
  const maxDate = await getLatestMarketDate();
  if (!maxDate) { el.innerHTML = emptyHTML('시장 데이터 없음'); return; }

  // ── Step 1: market_data에서 밸류에이션/시총 필터 적용 (DB 레벨) ──
  let mktQuery = sb.from('market_data')
    .select('stock_code,corp_name,market_cap,price,price_change_rate,per,pbr,market,foreign_hold_rate')
    .eq('base_date', maxDate)
    .order('market_cap', { ascending: false });

  if (market)       mktQuery = mktQuery.eq('market', market);
  if (f.perMin  != null) mktQuery = mktQuery.gte('per', f.perMin);
  if (f.perMax  != null) mktQuery = mktQuery.lte('per', f.perMax);
  if (f.pbrMin  != null) mktQuery = mktQuery.gte('pbr', f.pbrMin);
  if (f.pbrMax  != null) mktQuery = mktQuery.lte('pbr', f.pbrMax);
  if (f.capMin  != null) mktQuery = mktQuery.gte('market_cap', f.capMin * 1e8);
  if (f.capMax  != null) mktQuery = mktQuery.lte('market_cap', f.capMax * 1e8);

  const mktRows = await fetchAllPages(mktQuery);
  if (!mktRows.length) { el.innerHTML = emptyHTML('조건에 맞는 종목이 없습니다.'); return; }

  // ── Step 2: financials 필터가 있을 때만 추가 조회 (DB 레벨) ──
  const hasPegFilter  = f.pegMin != null || f.pegMax != null;
  const hasEvebFilter = f.ebebMin != null || f.ebebMax != null;
  const hasFinFilter = [f.marginMin, f.marginMax, f.roeMin, f.roeMax,
                        f.roaMin,    f.roaMax,    f.debtMin, f.debtMax,
                        f.crMin,     f.crMax].some(v => v != null)
                    || hasPegFilter || hasEvebFilter;
  const hasIndFilter = !!industry;

  let finMap = {}, indMap = {};

  if (hasFinFilter) {
    const codes = mktRows.map(r => r.stock_code);

    // PEG/EVEB 계산에는 net_income, operating_income, total_debt도 필요
    const finSelect = hasPegFilter || hasEvebFilter
      ? 'stock_code,operating_margin,roe,roa,debt_ratio,current_ratio,bsns_year,quarter,net_income,operating_income,total_debt'
      : 'stock_code,operating_margin,roe,roa,debt_ratio,current_ratio,bsns_year,quarter';

    // ⚠️ 기존 slice(0,500) + limit(2000)은 시총 하위 종목·뒤쪽 재무 행을
    //    조용히 누락시켜 스크리닝 결과가 부정확했음.
    //    → 코드 500개씩 청크 분할 + fetchAllPages로 전량 조회 (잘림 없음).
    //    최근 3개년으로 한정 — 최신 행 + PEG용 연간 2개년이면 충분, 행수 폭증 방지.
    const minYear = String(new Date().getFullYear() - 3);
    const buildFinQuery = (chunk) => {
      let q = sb.from('financials')
        .select(finSelect)
        .eq('fs_div', 'CFS')
        .in('stock_code', chunk)
        .gte('bsns_year', minYear)
        .order('bsns_year', { ascending: false })
        .order('quarter',   { ascending: false })
        .order('stock_code');   // 병렬/페이지 경계 결정성 확보
      if (f.marginMin != null) q = q.gte('operating_margin', f.marginMin);
      if (f.marginMax != null) q = q.lte('operating_margin', f.marginMax);
      if (f.roeMin    != null) q = q.gte('roe',              f.roeMin);
      if (f.roeMax    != null) q = q.lte('roe',              f.roeMax);
      if (f.roaMin    != null) q = q.gte('roa',              f.roaMin);
      if (f.roaMax    != null) q = q.lte('roa',              f.roaMax);
      if (f.debtMin   != null) q = q.gte('debt_ratio',       f.debtMin);
      if (f.debtMax   != null) q = q.lte('debt_ratio',       f.debtMax);
      if (f.crMin     != null) q = q.gte('current_ratio',    f.crMin);
      if (f.crMax     != null) q = q.lte('current_ratio',    f.crMax);
      return q;
    };

    const CHUNK = 500;
    const finRows = [];
    for (let i = 0; i < codes.length; i += CHUNK) {
      const rows = await fetchAllPages(buildFinQuery(codes.slice(i, i + CHUNK)));
      finRows.push(...rows);
    }

    if (hasPegFilter) {
      // 종목별 최신 2개 연간 행 수집 → YoY net_income 성장률로 PEG 계산
      const annualByCode = {};
      (finRows || []).filter(r => !r.quarter).forEach(r => {
        if (!annualByCode[r.stock_code]) annualByCode[r.stock_code] = [];
        if (annualByCode[r.stock_code].length < 2) annualByCode[r.stock_code].push(r);
      });
      (finRows || []).forEach(r => { if (!finMap[r.stock_code]) finMap[r.stock_code] = r; });
      Object.entries(annualByCode).forEach(([code, rows]) => {
        if (!finMap[code]) return;
        if (rows.length >= 2 && rows[1].net_income && rows[1].net_income !== 0) {
          const growth = ((rows[0].net_income - rows[1].net_income) / Math.abs(rows[1].net_income)) * 100;
          finMap[code]._epsGrowth = growth;
        }
      });
    } else {
      (finRows || []).forEach(r => { if (!finMap[r.stock_code]) finMap[r.stock_code] = r; });
    }
  }

  // getIndustryMap은 캐시된 경우 즉시 반환 — 1회 호출로 통합
  const globalMap = await getIndustryMap();
  if (hasIndFilter) {
    Object.entries(globalMap).forEach(([code, ind]) => {
      if (ind === industry) indMap[code] = ind;
    });
  } else {
    indMap = globalMap;
  }

  // ── Step 3: JS에서 남은 조인 처리 (재무 필터 종목 교집합) ──
  let combined = mktRows
    .filter(m => {
      if (hasIndFilter) return indMap[m.stock_code] != null;
      return true;
    })
    .filter(m => {
      if (hasFinFilter) return finMap[m.stock_code] != null;
      return true;
    })
    .map(m => {
      const fin = finMap[m.stock_code] || {};
      // PEG = PER / EPS성장률(%) — 성장률이 양수일 때만 유효
      let peg = null;
      const per = m.per;
      const epsGrowth = fin._epsGrowth;
      if (per != null && epsGrowth != null && epsGrowth > 0) {
        peg = per / epsGrowth;
      }
      // EV/EBITDA ≈ (시총 + total_debt) / operating_income (근사)
      let evEbitda = null;
      if (m.market_cap != null && fin.total_debt != null && fin.operating_income != null && fin.operating_income > 0) {
        evEbitda = (m.market_cap + fin.total_debt) / fin.operating_income;
      }
      return {
        ...m,
        industry: indMap[m.stock_code] || '',
        capEok:   m.market_cap ? Math.round(m.market_cap / 1e8) : null,
        ...fin,
        peg,
        evEbitda,
      };
    })
    .filter(r => {
      if (hasPegFilter) {
        if (r.peg == null) return false;
        if (f.pegMin != null && r.peg < f.pegMin) return false;
        if (f.pegMax != null && r.peg > f.pegMax) return false;
      }
      if (hasEvebFilter) {
        if (r.evEbitda == null) return false;
        if (f.ebebMin != null && r.evEbitda < f.ebebMin) return false;
        if (f.ebebMax != null && r.evEbitda > f.ebebMax) return false;
      }
      return true;
    });

  if (!combined.length) { el.innerHTML = emptyHTML('조건에 맞는 종목이 없습니다.'); return; }

  const pct = v => v != null ? v.toFixed(1) + '%' : '—';
  const num = v => v != null ? v.toFixed(1) : '—';

  // 재무 기준 분기 표시 — 실제 최다 등장 분기 (기존엔 임의 첫 항목이라 라벨이 부정확했음)
  let finPeriodLabel = '';
  {
    const counts = {};
    Object.values(finMap).forEach(fr => {
      const k = `${fr.bsns_year} ${fr.quarter || '연간'}`;
      counts[k] = (counts[k] || 0) + 1;
    });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (top) finPeriodLabel = `재무 기준: ${top[0]} (최다 ${top[1]}종목)`;
  }

  // 신호 배지 계산
  const _sig = r => {
    if (r.per != null && r.per < 10 && r.roe != null && r.roe > 15)
      return '<span class="sig sig-buy">매수검토</span>';
    if (r.per != null && r.per > 40 && r.roe != null && r.roe < 5)
      return '<span class="sig sig-sell">고평가</span>';
    if (r.peg != null && r.peg <= 1 && r.roe != null && r.roe > 10)
      return '<span class="sig sig-watch">성장유망</span>';
    return '<span class="sig sig-neutral">중립</span>';
  };

  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem;flex-wrap:wrap;gap:8px">
      <div>
        <span style="font-size:13px;font-weight:600">총 ${combined.length}개 종목 검색됨</span>
        ${finPeriodLabel ? `<span style="font-size:11px;color:var(--text2);margin-left:8px">${finPeriodLabel}</span>` : ''}
      </div>
      <button class="btn btn-sm" onclick="exportScreener()">CSV 다운로드</button>
    </div>
    <div class="table-wrap"><table class="screener-result-table">
      <thead><tr>
        <th style="width:28px">#</th>
        <th>종목명</th>
        <th>산업</th>
        <th class="num">현재가</th>
        <th class="num">등락률</th>
        <th class="num">시총</th>
        <th class="num">PER</th>
        <th class="num">PBR</th>
        <th class="num">ROE</th>
        <th class="num">영업이익률</th>
        <th class="num">외국인%</th>
        <th>신호</th>
        <th></th>
      </tr></thead>
      <tbody>${combined.map((r, i) => `<tr>
        <td style="color:var(--text3);font-size:11px;text-align:right;padding:6px 8px">${i+1}</td>
        <td style="cursor:pointer" onclick="go('report');setTimeout(()=>rpQuickSearch&&rpQuickSearch('${escJsStr(r.corp_name)}'),200)">
          <div class="stock-name" style="color:var(--tg)">${escapeHtml(r.corp_name)}</div>
          <div class="stock-code">${r.stock_code} · ${r.market||''}</div>
        </td>
        <td><span class="badge badge-cat">${escapeHtml(r.industry || '—')}</span></td>
        <td class="num">${fmtPrice(r.price)}</td>
        <td class="num" style="color:${chgColor(r.price_change_rate)}">${chgStr(r.price_change_rate)}</td>
        <td class="num">${fmtCap(r.market_cap)}</td>
        <td class="num ${r.per!=null&&r.per<15?'num-up':''}">${num(r.per)}</td>
        <td class="num">${num(r.pbr)}</td>
        <td class="num ${r.roe!=null&&r.roe>15?'num-up':r.roe!=null&&r.roe<0?'num-down':''}">${pct(r.roe)}</td>
        <td class="num ${r.operating_margin!=null&&r.operating_margin>10?'num-up':r.operating_margin!=null&&r.operating_margin<0?'num-down':''}">${pct(r.operating_margin)}</td>
        <td class="num">${r.foreign_hold_rate!=null ? r.foreign_hold_rate.toFixed(1)+'%' : '—'}</td>
        <td>${_sig(r)}</td>
        <td style="padding:4px 6px">
          <button onclick="scAddToWatchlist('${r.stock_code}','${escJsStr(r.corp_name)}');event.stopPropagation()"
            style="font-size:11px;padding:2px 6px;border-radius:4px;background:rgba(45,206,137,.15);color:#2dce89;border:1px solid rgba(45,206,137,.3);cursor:pointer;white-space:nowrap">+WL</button>
        </td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  SCR.data = combined;
}

function scAddToWatchlist(code, name) {
  WL.prefill = { stock_code: code, corp_name: name };
  if (typeof openWatchlistModal === 'function') {
    openWatchlistModal(null);
  } else {
    alert('워치리스트 모듈이 로드되지 않았습니다.');
  }
}

function exportScreener() {
  if (!SCR.data?.length) return;
  const keys    = ['corp_name','industry','market','capEok','price','price_change_rate','per','pbr','peg','evEbitda','operating_margin','roe','roa','debt_ratio'];
  const headers = ['종목명','산업','시장','시총(억)','현재가','등락률','PER','PBR','PEG','EV/EBITDA','영업이익률','ROE','ROA','부채비율'];
  // CSV 셀 인용 — 쉼표/따옴표/줄바꿈 포함 값 파손 방지.
  // 문자열 값이 수식 문자(=,+,@)로 시작하면 인젝션 무력화 (숫자 음수는 그대로)
  const cell = v => {
    let s = String(v ?? '');
    if (typeof v === 'string' && /^[=+@]/.test(s)) s = "'" + s;
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const csv = [headers.join(','), ...SCR.data.map(r => keys.map(k => cell(r[k])).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csv);
  a.download = 'screener_' + todayStr() + '.csv';
  a.click();
}
