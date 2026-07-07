// bots.js — 봇 모니터링, 봇 설정

// ── 공통 유틸 ──────────────────────────────────────────────────────────────

/** app_config 에서 key 목록을 받아 { key: value } 맵으로 반환 */
async function getConfigMap(keys) {
  const { data } = await sb.from('app_config').select('key,value').in('key', keys);
  const map = {};
  (data || []).forEach(r => { map[r.key] = r.value; });
  return map;
}

/** app_config 단일 키 upsert — admin 전용. 성공/실패 toast 처리 포함 */
async function saveConfigKey(key, elId) {
  if (!isAdmin()) { toast('admin만 수정 가능합니다.', 'error'); return; }
  const el = document.getElementById(elId);
  if (!el) return;
  const value = el.value.trim();
  const { error } = await sb.from('app_config')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) { toast('저장 실패: ' + error.message, 'error'); return; }
  toast('저장 완료 — 봇 재로드 후 반영됩니다', 'success');
}

// ── 봇 설정 탭별 HTML 생성 함수 ────────────────────────────────────────────

function _botDartTabHTML() {
  return `
    <div class="card" style="margin-bottom:1rem"><div class="card-header"><span class="card-title">알림 키워드</span></div><div class="card-body">
      <div class="form-group">
        <label class="form-label">AI 트리거 키워드 <span style="font-size:11px;color:var(--text2)">(쉼표로 구분)</span></label>
        <textarea class="form-input" id="cfg-ai-kw" rows="3" placeholder="공급계약,임상,무상증자,..."></textarea>
        <div class="form-hint">이 키워드가 공시 제목에 포함되면 Gemini AI 분석을 실행합니다.</div>
      </div>
      <div class="form-group">
        <label class="form-label">전체 중요 키워드 <span style="font-size:11px;color:var(--text2)">(쉼표로 구분)</span></label>
        <textarea class="form-input" id="cfg-global-kw" rows="2" placeholder="거래정지,상장폐지,부도,..."></textarea>
        <div class="form-hint">비보유 종목도 이 키워드가 있으면 무조건 알림 발송합니다.</div>
      </div>
      <button class="btn btn-primary" onclick="saveBotKeywords()">저장</button>
    </div></div>
    <div style="font-size:12px;color:var(--text1);margin-bottom:1rem;padding:10px 14px;background:var(--bg3);border-radius:var(--radius-sm);border:1px solid var(--border)">
      공시 제목에 키워드가 포함되면 해당 등급으로 분류됩니다. 쉼표로 구분하며 저장 후 봇 재로드 시 반영됩니다.<br>
      <b style="color:var(--red)">긴급</b> → 메인+산업+기업 &nbsp;|&nbsp; <b style="color:var(--green)">중요</b> → 산업+기업 &nbsp;|&nbsp; <b style="color:var(--text1)">일반</b> → 산업+기업 &nbsp;|&nbsp; <b style="color:var(--text2)">잡공시</b> → 기업채널만
    </div>
    ${[
      {id:'cfg-dart-urgent',  key:'dart_urgent',       color:'var(--red)',   title:'🚨 긴급 키워드',       sub:'메인 + 산업 + 기업채널', rows:3, placeholder:'거래정지,횡령,배임,상장폐지,불성실,공개매수,영업정지'},
      {id:'cfg-dart-major',   key:'dart_major',        color:'var(--green)', title:'📈 중요 키워드',       sub:'산업 + 기업채널',         rows:4, placeholder:'공급계약,수주,잠정실적,무상증자,유상증자,최대주주변경,합병,분할,인수,전환사채,소송,특허,임상,사업보고서'},
      {id:'cfg-dart-skip',    key:'dart_skip',         color:'var(--text3)', title:'📊 잡공시 키워드',     sub:'기업채널만 (산업/메인 발송 안 함)', rows:4, placeholder:'소유상황보고,기업설명회,IR개최,감사보고서,주주총회소집,의결권대리,증권발행실적,투자설명서,자기주식취득결과,자기주식처분결과'},
      {id:'cfg-dart-title-filter', key:'dart_title_filter', color:'', title:'🔍 공시 제목 필터', sub:'제목에 포함 시 모든 채널 차단', rows:3, placeholder:'자기주식,증권발행실적,투자설명서,합병등종료보고...'},
      {id:'cfg-dart-corp-filter',  key:'dart_corp_filter',  color:'', title:'🏢 기업명 부분 필터', sub:'기업명에 포함 시 차단', rows:3, placeholder:'홀딩스,지주,캐피탈,리츠...'},
      {id:'cfg-dart-blacklist',    key:'dart_blacklist',    color:'', title:'🚫 기업 블랙리스트', sub:'정확한 기업명 일치 시 차단', rows:3, placeholder:'삼성전자,SK하이닉스,...'},
    ].map(c => `
    <div class="card" style="margin-bottom:.75rem">
      <div class="card-header">
        <span class="card-title" ${c.color?`style="color:${c.color}"`:''}>${c.title}</span>
        <span style="font-size:11px;color:var(--text2)">${c.sub}</span>
      </div>
      <div class="card-body">
        <textarea class="form-input" id="${c.id}" rows="${c.rows}" placeholder="${c.placeholder}"></textarea>
        <div style="margin-top:.75rem">
          <button class="btn btn-primary btn-sm" onclick="saveDartLevel('${c.key}','${c.id}')">저장</button>
        </div>
      </div>
    </div>`).join('')}
    <details style="margin-bottom:.75rem">
      <summary style="cursor:pointer;font-size:13px;font-weight:600;color:var(--text1);padding:10px 14px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-sm);list-style:none">
        📋 공시 알림 규칙 요약 (클릭해서 펼치기)
      </summary>
      <div class="card" style="border-radius:0 0 var(--radius-sm) var(--radius-sm)">
        <div class="card-body" style="font-size:12px;color:var(--text1);line-height:1.8">
          <div style="margin-bottom:1rem">
            <div style="font-weight:600;color:var(--text1);margin-bottom:.4rem">① 수신 대상</div>
            <div style="padding:8px 12px;background:var(--bg3);border-radius:var(--radius-sm);border:1px solid var(--border)">
              <b>내 종목</b> (companies 테이블 is_monitored=true) <span style="color:var(--text2)">또는</span>
              <b>전체 중요 키워드</b> 포함 공시만 수신<br>
              <span style="color:var(--text2)">비상장 종목 · 블랙리스트 · 제목/기업명 필터는 수신 전 차단</span>
            </div>
          </div>
          <div style="margin-bottom:1rem">
            <div style="font-weight:600;color:var(--text1);margin-bottom:.4rem">② 등급 분류 우선순위</div>
            <div style="display:grid;grid-template-columns:80px 1fr;gap:4px 12px;padding:8px 12px;background:var(--bg3);border-radius:var(--radius-sm);border:1px solid var(--border)">
              <span style="color:var(--text2)">판정 순서</span><span style="color:var(--text2)">잡공시 → 긴급 → 중요 → 일반</span>
              <span style="color:var(--red);font-weight:600">🚨 긴급</span><span>거래정지, 횡령, 배임, 상장폐지, 관리종목, 공개매수, 불성실공시, 영업정지</span>
              <span style="color:var(--green);font-weight:600">📌 중요</span><span>공급계약, 수주, 잠정실적, 무/유상증자, 최대주주변경, 합병, CB/BW, 소송, 특허, 임상</span>
              <span style="color:var(--text2)">🔇 잡공시</span><span>소유상황보고, 기업설명회, IR개최, 감사보고서, 주주총회, 의결권대리</span>
              <span style="color:var(--text1)">📄 일반</span><span>위 3가지 외 모두</span>
            </div>
          </div>
          <div>
            <div style="font-weight:600;color:var(--text1);margin-bottom:.4rem">③ AI 심층 분석 (Gemini)</div>
            <div style="padding:8px 12px;background:var(--bg3);border-radius:var(--radius-sm);border:1px solid var(--border)">
              <b>긴급 또는 중요</b> 등급 + <b>AI 키워드</b> 포함 시 자동 실행 → 기업채널에 후속 메시지 발송
            </div>
          </div>
        </div>
      </div>
    </details>`;
}

// ── 봇 카드 공통 HTML (pBot / pBotConfig 양쪽에서 재사용) ──────────────────
function _botCardsHTML() {
  const cards = [
    { id:'dart',  label:'DART 공시 봇' },
    { id:'news',  label:'뉴스 봇' },
    { id:'price', label:'시세 감시 봇' },
    { id:'sched', label:'스케줄러 봇' },
  ];
  const cardHTML = cards.map(c => `
    <div class="metric-card" id="bot-${c.id}-card">
      <div class="metric-label">${c.label}</div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:6px">
        <span class="dot dot-gray" id="bot-${c.id}-dot"></span>
        <span class="metric-value" style="font-size:16px" id="bot-${c.id}-status">확인 중...</span>
      </div>
      <div class="metric-sub" id="bot-${c.id}-time">—</div>
    </div>`).join('');
  return `
  <div class="metrics-grid" style="grid-template-columns:repeat(2,1fr)">${cardHTML}
  </div>
  <div class="section-header" style="margin-top:.5rem">
    <span class="section-title">최근 발송 기록</span>
    <button class="btn btn-sm" onclick="loadBotStatus()">새로고침</button>
  </div>
  <div class="card" id="bot-notice-card">
    <div style="padding:1.5rem;text-align:center;color:var(--text2)"><span class="loading"></span></div>
  </div>`;
}

function pBot() {
  return _botCardsHTML();
}

async function loadBotStatus() {
  const bots = [
    { key:'heartbeat_dart_bot',      dotId:'bot-dart-dot',  statusId:'bot-dart-status',  timeId:'bot-dart-time' },
    { key:'heartbeat_news_bot',      dotId:'bot-news-dot',  statusId:'bot-news-status',  timeId:'bot-news-time' },
    { key:'heartbeat_price_bot',     dotId:'bot-price-dot', statusId:'bot-price-status', timeId:'bot-price-time' },
    { key:'heartbeat_scheduler_bot', dotId:'bot-sched-dot', statusId:'bot-sched-status', timeId:'bot-sched-time' },
  ];

  // app_config 전체를 한 번에 조회 (single() 오류 방지)
  const { data: cfgAll, error: cfgErr } = await sb.from('app_config').select('key,value').in('key', bots.map(b=>b.key));

  const cfgMap = {};
  (cfgAll || []).forEach(r => cfgMap[r.key] = r.value);

  for (const bot of bots) {
    const dotEl    = document.getElementById(bot.dotId);
    const statusEl = document.getElementById(bot.statusId);
    const timeEl   = document.getElementById(bot.timeId);
    if (!dotEl || !statusEl) continue;

    const val = cfgMap[bot.key];

    if (!val) {
      dotEl.className      = 'dot dot-gray';
      statusEl.textContent = '신호 없음';
      statusEl.style.color = 'var(--text3)';
      if (timeEl) timeEl.textContent = 'add_bot_config.sql 실행 후 봇 재시작 필요';
      continue;
    }

    const lastBeat = new Date(val);
    const diffMin  = Math.floor((Date.now() - lastBeat) / 60000);
    const timeStr  = lastBeat.toLocaleString('ko-KR', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});

    if (diffMin < 5) {
      dotEl.className      = 'dot dot-green';
      statusEl.textContent = '정상 가동';
      statusEl.style.color = 'var(--green)';
    } else if (diffMin < 30) {
      dotEl.className      = 'dot dot-yellow';
      statusEl.textContent = `${diffMin}분 전 신호`;
      statusEl.style.color = 'var(--yellow)';
    } else {
      dotEl.className      = 'dot dot-red';
      statusEl.textContent = '응답 없음';
      statusEl.style.color = 'var(--red)';
    }
    if (timeEl) timeEl.textContent = `마지막 신호: ${timeStr}`;
  }

  // 최근 발송 기록
  const card = document.getElementById('bot-notice-card');
  if (!card) return;

  try {
    const { data, error } = await sb.from('notice_history').select('*').order('created_at',{ascending:false}).limit(20);
    if (error) throw error;
    if (!data || !data.length) {
      card.innerHTML = '<div style="padding:1.5rem;text-align:center;color:var(--text2);font-size:13px">발송 기록 없음 — 봇 연동 후 자동으로 기록됩니다.</div>';
      return;
    }
    card.innerHTML = '<div class="table-wrap"><table><thead><tr><th>시각</th><th>대상</th><th>내용</th><th>성공</th></tr></thead><tbody>' +
      data.map(h => '<tr>' +
        '<td style="font-size:12px;color:var(--text1)">' + new Date(h.created_at).toLocaleString('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}) + '</td>' +
        '<td><span class="badge badge-cat">' + (h.target||'—') + '</span></td>' +
        '<td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px">' + (h.content||'') + '</td>' +
        '<td style="color:var(--green)">' + (h.ok_count||0) + '/' + (h.sent_count||0) + '</td>' +
      '</tr>').join('') +
    '</tbody></table></div>';
  } catch(e) {
    card.innerHTML = errorHTML('조회 실패: ' + e.message);
  }
}

function pBotConfig() {
  if (!isAdmin()) return `<div style="padding:2rem;text-align:center;color:var(--text2);font-size:13px">admin만 접근 가능합니다.</div>`;
  return `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem">
    <div class="tabs" style="margin-bottom:0" id="botcfg-tabs">
      <button class="tab active" onclick="switchBotCfgTab('status',this)">현황</button>
      <button class="tab" onclick="switchBotCfgTab('dart',this)">공시 설정</button>
      <button class="tab" onclick="switchBotCfgTab('news',this)">뉴스 설정</button>
      <button class="tab" onclick="switchBotCfgTab('alert',this)">알림·채널</button>
      <button class="tab" onclick="switchBotCfgTab('schedule',this)">스케줄</button>
      <button class="tab" onclick="switchBotCfgTab('guide',this)">채널 안내</button>
    </div>
    <button class="btn btn-sm btn-primary" id="botcfg-reload-btn" onclick="requestBotReload('botcfg-reload-btn')" title="저장한 설정을 봇에 즉시 반영합니다">
      <svg style="width:12px;height:12px;vertical-align:middle;margin-right:3px" viewBox="0 0 16 16" fill="none"><path d="M13.5 8A5.5 5.5 0 112.5 5M2.5 2v3h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      봇 재로드
    </button>
  </div>

  <!-- ① 현황 탭 (봇 모니터링 통합) -->
  <div id="botcfg-status">${_botCardsHTML()}</div>

  <!-- ② 공시 설정 탭 -->
  <div id="botcfg-dart" style="display:none">${_botDartTabHTML()}</div>

  <!-- ③ 뉴스 설정 탭 -->
  <div id="botcfg-news" style="display:none">
    <div class="card" style="margin-bottom:1rem">
      <div class="card-header">
        <span class="card-title">스팸 패턴 <span style="font-size:11px;font-weight:400;color:var(--text2)">— 제목에 포함 시 발송 차단</span></span>
      </div>
      <div class="card-body">
        <div class="form-group">
          <label class="form-label">패턴 목록 <span style="font-size:11px;color:var(--text2)">(한 줄에 하나씩, 정규식 가능)</span></label>
          <textarea class="form-input" id="cfg-spam-patterns" rows="8" placeholder="매수.*위&#10;급등.*예고&#10;순매수.*위"></textarea>
          <div class="form-hint">예: <code>매수.*위</code> → "매수 1위", "매수 3위" 등 모두 차단</div>
        </div>
        <button class="btn btn-primary" onclick="saveNewsFilter('news_spam_patterns', 'cfg-spam-patterns', '\\n')">저장</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:1rem">
      <div class="card-header">
        <span class="card-title">실질 보도 키워드 <span style="font-size:11px;font-weight:400;color:var(--text2)">— 하나도 없으면 발송 안 함</span></span>
      </div>
      <div class="card-body">
        <div class="form-group">
          <label class="form-label">키워드 목록 <span style="font-size:11px;color:var(--text2)">(쉼표로 구분)</span></label>
          <textarea class="form-input" id="cfg-meaningful-kw" rows="5" placeholder="계약,수주,실적,임상,특허,인수..."></textarea>
          <div class="form-hint">이 중 하나라도 제목/본문에 있어야 발송합니다.</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn btn-primary" onclick="saveNewsFilter('news_meaningful_keywords', 'cfg-meaningful-kw', ',')">저장</button>
          <span style="font-size:11px;color:var(--text2)">저장 후 봇 재로드 버튼을 눌러주세요.</span>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:1rem"><div class="card-header">
      <span class="card-title">산업별 뉴스 검색어</span>
      <span style="font-size:11px;color:var(--text2)">쉼표로 구분 — 저장 즉시 봇 다음 사이클에 반영</span>
    </div><div class="card-body">
      <div id="news-terms-list"><span class="loading"></span></div>
    </div></div>
  </div>

  <!-- ⑥ 채널 안내 탭 -->
  <div id="botcfg-guide" style="display:none">

    <!-- 채널 구조 -->
    <div class="card" style="margin-bottom:.75rem">
      <div class="card-header"><span class="card-title">📡 채널 구조</span></div>
      <div class="card-body" style="font-size:12px;color:var(--text1);line-height:1.9">
        <div style="display:grid;grid-template-columns:150px 1fr;gap:4px 16px;padding:8px 12px;background:var(--bg3);border-radius:var(--radius-sm);border:1px solid var(--border)">
          <span style="color:var(--tg);font-weight:600">@BatiInvestChat</span><span>메인 채널 — 시장 속보 + 정기 브리핑</span>
          <span style="color:var(--tg);font-weight:600">@batiarchive</span><span>아카이브 채널 — KIND IR자료 PDF 전체</span>
          <span style="color:var(--text1);font-weight:600">산업 채널 11개</span><span>반도체·2차전지·바이오·로봇·조선·뷰티·엔터·신재생·테크·소비재·우주</span>
          <span style="color:var(--text1);font-weight:600">기업 채널</span><span>모니터링 등록 종목별 개별 채널</span>
        </div>
      </div>
    </div>

    <!-- 채널별 수신 정보 테이블 -->
    <div class="card" style="margin-bottom:.75rem">
      <div class="card-header"><span class="card-title">📋 채널별 수신 정보</span></div>
      <div class="card-body" style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:11px;min-width:520px">
          <thead>
            <tr style="background:var(--bg3);color:var(--text2)">
              <th style="padding:6px 10px;border:1px solid var(--border);text-align:left;min-width:160px">정보 종류</th>
              <th style="padding:6px 8px;border:1px solid var(--border);text-align:center">메인<br><span style="font-weight:400;font-size:11px">@BatiInvestChat</span></th>
              <th style="padding:6px 8px;border:1px solid var(--border);text-align:center">아카이브<br><span style="font-weight:400;font-size:11px">@batiarchive</span></th>
              <th style="padding:6px 8px;border:1px solid var(--border);text-align:center">산업<br><span style="font-weight:400;font-size:11px">11개 채널</span></th>
              <th style="padding:6px 8px;border:1px solid var(--border);text-align:center">기업<br><span style="font-weight:400;font-size:11px">종목별</span></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding:6px 10px;border:1px solid var(--border);color:var(--red);font-weight:600">🚨 DART 긴급 공시</td>
              <td style="padding:6px 8px;border:1px solid var(--border);text-align:center">✅ <span style="color:var(--text2);font-size:11px">시총 1,000억↑</span></td>
              <td style="padding:6px 8px;border:1px solid var(--border);text-align:center;color:var(--text2)">—</td>
              <td style="padding:6px 8px;border:1px solid var(--border);text-align:center">✅</td>
              <td style="padding:6px 8px;border:1px solid var(--border);text-align:center">✅</td>
            </tr>
            <tr style="background:var(--bg2)">
              <td style="padding:6px 10px;border:1px solid var(--border);color:var(--green);font-weight:600">📌 DART 중요 (내 종목)</td>
              <td style="padding:6px 8px;border:1px solid var(--border);text-align:center;color:var(--text2)">—</td>
              <td style="padding:6px 8px;border:1px solid var(--border);text-align:center;color:var(--text2)">—</td>
              <td style="padding:6px 8px;border:1px solid var(--border);text-align:center">✅</td>
              <td style="padding:6px 8px;border:1px solid var(--border);text-align:center">✅</td>
            </tr>
            <tr>
              <td style="padding:6px 10px;border:1px solid var(--border);color:var(--green);font-weight:600">🔥 DART 중요 (비보유+전체중요키워드)</td>
              <td style="padding:6px 8px;border:1px solid var(--border);text-align:center">✅ <span style="color:var(--text2);font-size:11px">시총 1,000억↑</span></td>
              <td style="padding:6px 8px;border:1px solid var(--border);text-align:center;color:var(--text2)">—</td>
              <td style="padding:6px 8px;border:1px solid var(--border);text-align:center;color:var(--text2)">—</td>
              <td style="padding:6px 8px;border:1px solid var(--border);text-align:center;color:var(--text2)">—</td>
            </tr>
            <tr style="background:var(--bg2)">
              <td style="padding:6px 10px;border:1px solid var(--border);color:var(--text1)">📄 DART 일반</td>
              <td style="padding:6px 8px;border:1px solid var(--border);text-align:center;color:var(--text2)">—</td>
              <td style="padding:6px 8px;border:1px solid var(--border);text-align:center;color:var(--text2)">—</td>
              <td style="padding:6px 8px;border:1px solid var(--border);text-align:center">✅</td>
              <td style="padding:6px 8px;border:1px solid var(--border);text-align:center">✅</td>
            </tr>
            <tr>
              <td style="padding:6px 10px;border:1px solid var(--border);color:var(--text2)">🔇 DART 잡공시</td>
              <td style="padding:6px 8px;border:1px solid var(--border);text-align:center;color:var(--text2)">—</td>
              <td style="padding:6px 8px;border:1px solid var(--border);text-align:center;color:var(--text2)">—</td>
              <td style="padding:6px 8px;border:1px solid var(--border);text-align:center;color:var(--text2)">—</td>
              <td style="padding:6px 8px;border:1px solid var(--border);text-align:center">✅</td>
            </tr>
            <tr style="background:var(--bg2)">
              <td style="padding:6px 10px;border:1px solid var(--border);color:var(--text1)">📰 네이버 뉴스</td>
              <td style="padding:6px 8px;border:1px solid var(--border);text-align:center;color:var(--text2)">—</td>
              <td style="padding:6px 8px;border:1px solid var(--border);text-align:center;color:var(--text2)">—</td>
              <td style="padding:6px 8px;border:1px solid var(--border);text-align:center">✅</td>
              <td style="padding:6px 8px;border:1px solid var(--border);text-align:center">✅</td>
            </tr>
            <tr>
              <td style="padding:6px 10px;border:1px solid var(--border);color:var(--text1)">📋 KIND IR자료 PDF</td>
              <td style="padding:6px 8px;border:1px solid var(--border);text-align:center;color:var(--text2)">—</td>
              <td style="padding:6px 8px;border:1px solid var(--border);text-align:center">✅ <span style="color:var(--text2);font-size:11px">전체</span></td>
              <td style="padding:6px 8px;border:1px solid var(--border);text-align:center">✅ <span style="color:var(--text2);font-size:11px">모니터링</span></td>
              <td style="padding:6px 8px;border:1px solid var(--border);text-align:center">✅ <span style="color:var(--text2);font-size:11px">모니터링</span></td>
            </tr>
            <tr style="background:var(--bg2)">
              <td style="padding:6px 10px;border:1px solid var(--border);color:var(--text1)">🤖 AI 심층 분석</td>
              <td style="padding:6px 8px;border:1px solid var(--border);text-align:center;color:var(--text2)">—</td>
              <td style="padding:6px 8px;border:1px solid var(--border);text-align:center;color:var(--text2)">—</td>
              <td style="padding:6px 8px;border:1px solid var(--border);text-align:center;color:var(--text2)">—</td>
              <td style="padding:6px 8px;border:1px solid var(--border);text-align:center">✅</td>
            </tr>
            <tr>
              <td style="padding:6px 10px;border:1px solid var(--border);color:var(--text1)">🌏 글로벌 매크로 브리핑</td>
              <td style="padding:6px 8px;border:1px solid var(--border);text-align:center">✅ <span style="color:var(--text2);font-size:11px">06:30</span></td>
              <td style="padding:6px 8px;border:1px solid var(--border);text-align:center;color:var(--text2)">—</td>
              <td style="padding:6px 8px;border:1px solid var(--border);text-align:center;color:var(--text2)">—</td>
              <td style="padding:6px 8px;border:1px solid var(--border);text-align:center;color:var(--text2)">—</td>
            </tr>
            <tr style="background:var(--bg2)">
              <td style="padding:6px 10px;border:1px solid var(--border);color:var(--text1)">🍱 점심·🏁마감 시황 브리핑</td>
              <td style="padding:6px 8px;border:1px solid var(--border);text-align:center">✅ <span style="color:var(--text2);font-size:11px">전광판+랭킹</span></td>
              <td style="padding:6px 8px;border:1px solid var(--border);text-align:center;color:var(--text2)">—</td>
              <td style="padding:6px 8px;border:1px solid var(--border);text-align:center">✅ <span style="color:var(--text2);font-size:11px">산업 랭킹</span></td>
              <td style="padding:6px 8px;border:1px solid var(--border);text-align:center">✅ <span style="color:var(--text2);font-size:11px">종목 상세</span></td>
            </tr>
            <tr>
              <td style="padding:6px 10px;border:1px solid var(--border);color:var(--text1)">📑 증권사 리포트 (네이버)</td>
              <td style="padding:6px 8px;border:1px solid var(--border);text-align:center;color:var(--text2)">—</td>
              <td style="padding:6px 8px;border:1px solid var(--border);text-align:center">✅ <span style="color:var(--text2);font-size:11px">목록+PDF</span></td>
              <td style="padding:6px 8px;border:1px solid var(--border);text-align:center">✅ <span style="color:var(--text2);font-size:11px">산업분석</span></td>
              <td style="padding:6px 8px;border:1px solid var(--border);text-align:center">✅ <span style="color:var(--text2);font-size:11px">기업분석</span></td>
            </tr>
            <tr style="background:var(--bg2)">
              <td style="padding:6px 10px;border:1px solid var(--border);color:var(--text1)">🏆 주간 랭킹 (토요일)</td>
              <td style="padding:6px 8px;border:1px solid var(--border);text-align:center">✅</td>
              <td style="padding:6px 8px;border:1px solid var(--border);text-align:center;color:var(--text2)">—</td>
              <td style="padding:6px 8px;border:1px solid var(--border);text-align:center">✅ <span style="color:var(--text2);font-size:11px">산업별</span></td>
              <td style="padding:6px 8px;border:1px solid var(--border);text-align:center;color:var(--text2)">—</td>
            </tr>
            <tr>
              <td style="padding:6px 10px;border:1px solid var(--border);color:var(--text1)">🗓 일요일 기술적 진단</td>
              <td style="padding:6px 8px;border:1px solid var(--border);text-align:center;color:var(--text2)">—</td>
              <td style="padding:6px 8px;border:1px solid var(--border);text-align:center;color:var(--text2)">—</td>
              <td style="padding:6px 8px;border:1px solid var(--border);text-align:center">✅ <span style="color:var(--text2);font-size:11px">시총 리포트</span></td>
              <td style="padding:6px 8px;border:1px solid var(--border);text-align:center">✅ <span style="color:var(--text2);font-size:11px">차트 진단</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 정기 브리핑 스케줄 -->
    <div class="card" style="margin-bottom:.75rem">
      <div class="card-header"><span class="card-title">⏰ 정기 발송 스케줄</span></div>
      <div class="card-body" style="font-size:12px;color:var(--text1)">
        <div style="display:grid;grid-template-columns:110px 1fr auto;gap:5px 12px;line-height:1.8;align-items:center">
          <span style="color:var(--text2);font-size:11px">평일 06:30</span>
          <span>🌏 글로벌 매크로 — 미국 마감·야간선물·금리·환율·원자재·BTC</span>
          <span style="font-size:11px;color:var(--tg);white-space:nowrap">메인</span>

          <span style="color:var(--text2);font-size:11px">평일 08:50</span>
          <span>📑 증권사 리포트 — 산업분석·기업분석 PDF</span>
          <span style="font-size:11px;color:var(--tg);white-space:nowrap">@batiarchive · 산업 · 기업</span>

          <span style="color:var(--text2);font-size:11px">평일 09:05</span>
          <span>📋 KIND IR자료 오전 수집</span>
          <span style="font-size:11px;color:var(--tg);white-space:nowrap">@batiarchive · 산업 · 기업</span>

          <span style="color:var(--text2);font-size:11px">평일 11:30</span>
          <span>🍱 점심 시황 — 시장 전광판 + 유니버스 랭킹 + 산업 테마 현황</span>
          <span style="font-size:11px;color:var(--tg);white-space:nowrap">메인 · 산업</span>

          <span style="color:var(--text2);font-size:11px">평일 18:00</span>
          <span>📑 증권사 리포트 — 장후 추가분</span>
          <span style="font-size:11px;color:var(--tg);white-space:nowrap">@batiarchive · 산업 · 기업</span>

          <span style="color:var(--text2);font-size:11px">평일 18:10</span>
          <span>📋 KIND IR자료 오후 수집</span>
          <span style="font-size:11px;color:var(--tg);white-space:nowrap">@batiarchive · 산업 · 기업</span>

          <span style="color:var(--text2);font-size:11px">평일 18:30</span>
          <span>🏁 마감 시황 — 시장 전광판 + 유니버스 랭킹 + 종목 상세</span>
          <span style="font-size:11px;color:var(--tg);white-space:nowrap">메인 · 산업 · 기업</span>

          <span style="color:var(--text2);font-size:11px">토요일 10:00</span>
          <span>🏆 주간 랭킹 — 모니터링 종목 주간 수익률</span>
          <span style="font-size:11px;color:var(--tg);white-space:nowrap">메인</span>

          <span style="color:var(--text2);font-size:11px">토요일 10:30</span>
          <span>🏭 주간 산업 리포트 — 산업별 주간 수익률 + 테마 성적표</span>
          <span style="font-size:11px;color:var(--tg);white-space:nowrap">산업</span>

          <span style="color:var(--text2);font-size:11px">일요일 10:00</span>
          <span>🗓 산업별 시총 리포트</span>
          <span style="font-size:11px;color:var(--tg);white-space:nowrap">산업</span>

          <span style="color:var(--text2);font-size:11px">일요일 10:30</span>
          <span>🗓 종목별 기술적 진단 — 이평선·RSI·볼린저밴드</span>
          <span style="font-size:11px;color:var(--tg);white-space:nowrap">기업</span>
        </div>
      </div>
    </div>

    <!-- KIND IR 흐름 -->
    <div class="card">
      <div class="card-header"><span class="card-title">📋 KIND IR자료 흐름</span></div>
      <div class="card-body" style="font-size:12px;color:var(--text1);line-height:1.8">
        <div style="padding:8px 14px;background:var(--bg3);border-radius:var(--radius-sm);border:1px solid var(--border)">
          <div style="margin-bottom:6px;color:var(--text2)">하루 2회 수집: 09:05 · 18:05</div>
          <div style="display:flex;flex-direction:column;gap:4px">
            <div>① KIND 자료실 신규 업로드 감지 (irSeq 기준)</div>
            <div style="padding-left:16px;color:var(--text2)">↓ 전체 상장사</div>
            <div>② <span style="color:var(--tg);font-weight:600">@batiarchive</span>에 PDF 전송 (요약 메시지 + 종목별 파일)</div>
            <div style="padding-left:16px;color:var(--text2)">↓ 모니터링 등록 종목만 추가 전달</div>
            <div>③ 해당 <b>산업 채널</b> + <b>기업 채널</b>에도 동일 PDF 전달</div>
          </div>
        </div>
        <div style="margin-top:.75rem;font-size:11px;color:var(--text2)">
          * "일자" 컬럼은 IR 개최 예정일이며 업로드일과 다를 수 있음. 업로드 즉시 수집됩니다.
        </div>
      </div>
    </div>

    <div style="background:linear-gradient(135deg,rgba(42,171,238,.12),rgba(42,171,238,.04));border:1px solid rgba(42,171,238,.25);border-radius:var(--radius);padding:1rem 1.25rem">
      <div style="font-size:13px;font-weight:600;color:var(--tg);margin-bottom:.5rem">봇 서버 연동 방법</div>
      <div style="font-size:12px;color:var(--text1);line-height:1.9">
        1. <code style="background:var(--bg3);padding:1px 6px;border-radius:3px">supabase_bridge.py</code> 를 봇 폴더에 복사<br>
        2. <code style="background:var(--bg3);padding:1px 6px;border-radius:3px">pip install supabase</code> 실행<br>
        3. <code style="background:var(--bg3);padding:1px 6px;border-radius:3px">.env</code> 에 <code style="background:var(--bg3);padding:1px 6px;border-radius:3px">SB_URL</code>, <code style="background:var(--bg3);padding:1px 6px;border-radius:3px">SB_SERVICE_KEY</code> 추가<br>
        4. 봇 재시작 → 대시보드에서 heartbeat 확인
      </div>
    </div>

  </div>

  <!-- ⑤ 스케줄 탭 -->
  <div id="botcfg-schedule" style="display:none">
    <div class="card" style="margin-bottom:1rem">
      <div class="card-header"><span class="card-title">정기 발송 ON/OFF</span></div>
      <div class="card-body">
        <div id="schedule-list"><span class="loading"></span></div>
      </div>
    </div>
    ${_collectionScheduleCard()}
  </div>

  <!-- ④ 알림·채널 탭 -->
  <div id="botcfg-alert" style="display:none">

    <div style="font-size:12px;color:var(--text1);margin-bottom:1rem;padding:10px 14px;background:var(--bg3);border-radius:var(--radius-sm);border:1px solid var(--border)">
      시세감시 봇이 기업채팅방에 발송하는 알림 기준입니다. 저장 후 봇 재로드 시 반영됩니다.
    </div>

    <div class="card" style="margin-bottom:.75rem">
      <div class="card-header"><span class="card-title">📈 시세 알림 임계값</span></div>
      <div class="card-body">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:1rem">
          <div class="form-group" style="margin:0">
            <label class="form-label">🚀 급등 기준 (%)</label>
            <input class="form-input" id="cfg-alert-surge" type="number" step="0.5" min="1" max="30" placeholder="15">
            <div class="form-hint">이 이상 상승 시 급등 알림</div>
          </div>
          <div class="form-group" style="margin:0">
            <label class="form-label">📈 강세 기준 (%)</label>
            <input class="form-input" id="cfg-alert-up" type="number" step="0.5" min="1" max="20" placeholder="5">
            <div class="form-hint">이 이상 상승 시 강세 알림</div>
          </div>
          <div class="form-group" style="margin:0">
            <label class="form-label">📉 약세 기준 (%) <span style="font-size:11px;font-weight:400;color:var(--text2)">음수 입력</span></label>
            <input class="form-input" id="cfg-alert-down" type="number" step="0.5" min="-30" max="-1" placeholder="-5">
            <div class="form-hint">이 이하 하락 시 약세 알림</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn btn-primary" onclick="saveAlertThresholds()">저장</button>
          <span style="font-size:11px;color:var(--text2)">VI 발동·상한가·하한가는 기준값 무관하게 항상 발송됩니다.</span>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:.75rem">
      <div class="card-header"><span class="card-title">👤 어드민 채팅방</span></div>
      <div class="card-body">
        <div class="form-group">
          <label class="form-label">어드민 채팅방 ID</label>
          <input class="form-input" id="cfg-admin-chat" placeholder="@batiinvest">
          <div class="form-hint">제보 승인 메시지, 네이버 리포트 등이 발송되는 어드민 전용 채팅방입니다. @username 또는 숫자 ID 형식.</div>
        </div>
        <button class="btn btn-primary" onclick="saveAlertConfig('admin_chat_id', 'cfg-admin-chat')">저장</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:.75rem">
      <div class="card-header"><span class="card-title">📑 리포트 채널</span></div>
      <div class="card-body">
        <div class="form-group">
          <label class="form-label">리포트 채널 ID</label>
          <input class="form-input" id="cfg-report-chat" placeholder="@batiarchive">
          <div class="form-hint">네이버 증권 리포트(산업분석·기업분석 PDF)가 발송되는 채널입니다. @username 또는 숫자 ID 형식.</div>
        </div>
        <button class="btn btn-primary" onclick="saveAlertConfig('report_chat_id', 'cfg-report-chat')">저장</button>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="card-title">🔍 신뢰도 낮은 출처 <span style="font-size:11px;font-weight:400;color:var(--text2)">— URL에 포함 시 낮은 우선순위</span></span>
      </div>
      <div class="card-body">
        <div class="form-group">
          <label class="form-label">출처 키워드 <span style="font-size:11px;color:var(--text2)">(쉼표로 구분)</span></label>
          <textarea class="form-input" id="cfg-low-trust" rows="3" placeholder="blog.naver,cafe.naver,tistory,brunch,newspim,fntoday"></textarea>
          <div class="form-hint">뉴스 링크 URL에 이 문자열이 포함되면 신뢰도 낮은 출처로 분류됩니다.</div>
        </div>
        <button class="btn btn-primary" onclick="saveAlertConfig('news_low_trust_sources', 'cfg-low-trust')">저장</button>
      </div>
    </div>
  </div>`;
}

function switchBotCfgTab(tab, el) {
  ['status','dart','news','alert','schedule','guide'].forEach(t => {
    document.getElementById(`botcfg-${t}`).style.display = t === tab ? '' : 'none';
  });
  document.querySelectorAll('#botcfg-tabs .tab').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');

  if (tab === 'status')   loadBotStatus();
  if (tab === 'dart')     loadDartLevel();
  if (tab === 'news')     { loadNewsFilter(); loadNewsTerms(); }
  if (tab === 'alert')    loadAlertConfig();
  if (tab === 'schedule') loadSchedules();
}

async function loadBotConfig() {
  // 현황 탭이 기본 — 봇 상태 및 최근 발송 기록 로드
  loadBotStatus();
}

async function loadSchedules() {
  const schedules = [
    { key:'schedule_macro_briefing', label:'글로벌 매크로 브리핑 (06:30)' },
    { key:'schedule_lunch',          label:'점심 브리핑 (11:30)' },
    { key:'schedule_closing',        label:'마감 브리핑 (18:30)' },
    { key:'schedule_report',         label:'네이버 리포트 (08:50, 18:00)' },
    { key:'schedule_saturday',       label:'토요일 주간 랭킹 (10:00)' },
    { key:'schedule_sunday',         label:'일요일 리포트 (10:00)' },
    { key:'schedule_kind_ir',        label:'KIND IR자료 (09:05, 18:10)' },
  ];
  const cfg = await getConfigMap(schedules.map(s => s.key));

  const schedEl = document.getElementById('schedule-list');
  if (!schedEl) return;
  schedEl.innerHTML = schedules.map(s => {
    const on = (cfg[s.key] ?? '1') !== '0';
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);font-size:13px">
      <span>${s.label}</span>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
        <span style="font-size:12px;color:${on?'var(--green)':'var(--text3)'}">${on?'ON':'OFF'}</span>
        <input type="checkbox" ${on?'checked':''} onchange="toggleSchedule('${s.key}',this.checked)" style="width:16px;height:16px;cursor:pointer">
      </label>
    </div>`;
  }).join('') +
  '<div style="font-size:11px;color:var(--text2);margin-top:.75rem">변경 즉시 반영됩니다. 봇은 다음 사이클에서 확인합니다.</div>';
}

async function loadDartLevel() {
  const keys = ['dart_urgent', 'dart_major', 'dart_skip', 'dart_blacklist', 'dart_title_filter', 'dart_corp_filter'];
  const map = await getConfigMap(keys);

  const els = {
    'cfg-dart-urgent':       'dart_urgent',
    'cfg-dart-major':        'dart_major',
    'cfg-dart-skip':         'dart_skip',
    'cfg-dart-blacklist':    'dart_blacklist',
    'cfg-dart-title-filter': 'dart_title_filter',
    'cfg-dart-corp-filter':  'dart_corp_filter',
  };
  Object.entries(els).forEach(([elId, key]) => {
    const el = document.getElementById(elId);
    if (el && map[key]) el.value = map[key];
  });
}

const saveDartLevel = saveConfigKey;
async function loadNewsFilter() {
  const keys = ['news_spam_patterns', 'news_meaningful_keywords'];
  const map = await getConfigMap(keys);

  const spamEl = document.getElementById('cfg-spam-patterns');
  const kwEl   = document.getElementById('cfg-meaningful-kw');
  if (spamEl && map['news_spam_patterns'])       spamEl.value = map['news_spam_patterns'];
  if (kwEl   && map['news_meaningful_keywords']) kwEl.value   = map['news_meaningful_keywords'];
}

// separator 파라미터는 UI에서 전달되나 실제로 사용되지 않음 — saveConfigKey와 동일 동작
const saveNewsFilter = saveConfigKey;

async function loadNewsTerms() {
  const el = document.getElementById('news-terms-list');
  if (!el) return;

  const keys = INDUSTRIES.map(i => `news_terms_${i}`);
  const { data } = await sb.from('app_config').select('key,value').in('key', keys);
  const map = {};
  (data || []).forEach(r => { map[r.key] = r.value; });

  el.innerHTML = INDUSTRIES.map(ind => {
    const key = `news_terms_${ind}`;
    const val = map[key] || '';
    return `<div style="margin-bottom:.75rem">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
        <label class="form-label" style="margin:0;font-size:12px;font-weight:600">${ind}</label>
        <button class="btn btn-sm" onclick="saveNewsTerm('${key}', document.getElementById('nt-${ind}').value)">저장</button>
      </div>
      <input class="form-input" id="nt-${ind}" value="${val}" placeholder="${ind} 관련 뉴스 검색어 (쉼표 구분)" style="font-size:12px">
    </div>`;
  }).join('');
}

async function saveNewsTerm(key, value) {
  if (!isAdmin()) { toast('admin만 수정 가능합니다.', 'error'); return; }
  const { error } = await sb.from('app_config').upsert(
    { key, value: value.trim(), updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  );
  if (error) { toast('저장 실패: ' + error.message, 'error'); return; }
  toast(`저장 완료 — 봇 다음 사이클에 반영됩니다`, 'success');
}

async function saveBotKeywords() {
  if (!isAdmin()) { toast('권한이 없습니다.', 'error'); return; }
  const aiKw     = document.getElementById('cfg-ai-kw')?.value.trim();
  const globalKw = document.getElementById('cfg-global-kw')?.value.trim();

  try {
    if (aiKw !== undefined) {
      await sb.from('app_config').upsert({ key: 'ai_trigger_keywords', value: aiKw, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    }
    if (globalKw !== undefined) {
      await sb.from('app_config').upsert({ key: 'global_important_keywords', value: globalKw, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    }
    toast('키워드 저장 완료 — 봇 다음 사이클에 반영됩니다', 'success');
  } catch(e) { toast('저장 실패: ' + e.message, 'error'); }
}

async function toggleSchedule(key, enabled) {
  if (!isAdmin()) { toast('권한이 없습니다.', 'error'); return; }
  try {
    await sb.from('app_config').upsert({ key, value: enabled ? '1' : '0', updated_at: new Date().toISOString() }, { onConflict: 'key' });
    toast(`스케줄 ${enabled?'활성화':'비활성화'} 완료`, 'info');
  } catch(e) { toast('변경 실패: ' + e.message, 'error'); }
}

// ══════════════════════════════════════════
//  시세 알림 설정 (alert 탭)
// ══════════════════════════════════════════
async function loadAlertConfig() {
  const keys = ['alert_threshold_surge', 'alert_threshold_up', 'alert_threshold_down',
                'admin_chat_id', 'report_chat_id', 'news_low_trust_sources'];
  const map = await getConfigMap(keys);

  const set = (id, key, fallback) => {
    const el = document.getElementById(id);
    if (el) el.value = map[key] !== undefined ? map[key] : fallback;
  };
  set('cfg-alert-surge', 'alert_threshold_surge', '15');
  set('cfg-alert-up',    'alert_threshold_up',    '5');
  set('cfg-alert-down',  'alert_threshold_down',  '-5');
  set('cfg-admin-chat',  'admin_chat_id',          '@batiinvest');
  set('cfg-report-chat', 'report_chat_id',         '@batiarchive');
  set('cfg-low-trust',   'news_low_trust_sources', 'blog.naver,cafe.naver,tistory,brunch,newspim,fntoday,edaily');
}

async function saveAlertThresholds() {
  if (!isAdmin()) { toast('admin만 수정 가능합니다.', 'error'); return; }
  const surge = document.getElementById('cfg-alert-surge')?.value.trim();
  const up    = document.getElementById('cfg-alert-up')?.value.trim();
  const down  = document.getElementById('cfg-alert-down')?.value.trim();

  // 입력값 검증
  if (surge && (isNaN(surge) || +surge < 1 || +surge > 30))  { toast('급등 기준: 1~30 사이 숫자', 'error'); return; }
  if (up    && (isNaN(up)    || +up    < 1 || +up    > 20))  { toast('강세 기준: 1~20 사이 숫자', 'error'); return; }
  if (down  && (isNaN(down)  || +down  > -1 || +down < -30)) { toast('약세 기준: -1 ~ -30 사이 숫자', 'error'); return; }

  try {
    const updates = [
      { key: 'alert_threshold_surge', value: surge },
      { key: 'alert_threshold_up',    value: up },
      { key: 'alert_threshold_down',  value: down },
    ].filter(u => u.value !== undefined && u.value !== '');

    for (const u of updates) {
      await sb.from('app_config').upsert(
        { key: u.key, value: u.value, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );
    }
    toast('임계값 저장 완료 — 봇 재로드 후 반영됩니다', 'success');
  } catch(e) { toast('저장 실패: ' + e.message, 'error'); }
}

const saveAlertConfig = saveConfigKey;

function pSettings() {
  if (!isAdmin()) return `<div style="padding:2rem;text-align:center;color:var(--text2);font-size:13px">admin만 설정 변경 가능합니다.</div>`;
  return `
  <div class="card" style="max-width:560px;margin-bottom:1rem"><div class="card-header"><span class="card-title">텔레그램 봇</span></div><div class="card-body">
    <div style="font-size:12px;color:var(--text2);line-height:1.7;margin-bottom:.75rem">
      봇 토큰은 백엔드 서버(.env)에만 보관됩니다 — 대시보드는 토큰을 갖지 않으며,
      동기화·공지 발송은 <code style="background:var(--bg3);padding:1px 6px;border-radius:3px;font-size:11px">bot_requests</code> 큐로 봇에 위임됩니다.
      토큰 변경은 서버 <code style="background:var(--bg3);padding:1px 6px;border-radius:3px;font-size:11px">/home/kjhofone/.env</code>의 TELEGRAM_BOT_TOKEN 수정 후 봇 재시작.
    </div>
    <button class="btn" onclick="testBot()">봇 연결 테스트</button>
    <div id="bot-result" style="margin-top:.75rem;font-size:13px"></div>
  </div></div>

  <div class="card" style="max-width:560px;margin-bottom:1rem"><div class="card-header"><span class="card-title">앱 설정</span></div><div class="card-body">
    <div class="form-group">
      <label class="form-label">대시보드 이름</label>
      <input class="form-input" id="cfg-appname" value="${A.config['app_name']||'바티인베스트 채팅방 관리'}">
    </div>
    <button class="btn btn-primary" onclick="saveConfig('app_name', document.getElementById('cfg-appname').value.trim())">저장</button>
  </div></div>

  <div class="card" style="max-width:560px"><div class="card-header"><span class="card-title">Supabase 연결 정보</span></div><div class="card-body" style="font-size:13px;color:var(--text1);line-height:1.9">
    <p>Project URL: <code style="background:var(--bg3);padding:1px 6px;border-radius:3px;font-size:12px">${SB_URL}</code></p>
    <p style="margin-top:.5rem">연결된 유저: <strong style="color:var(--text)">${A.user?.email}</strong> (${A.profile?.role})</p>
    <p style="margin-top:.5rem;font-size:12px;color:var(--text2)">URL/Key 변경이 필요하면 index.html 상단의 SB_URL, SB_KEY를 직접 수정하세요.</p>
  </div></div>
`;
}

// ══════════════════════════════════════════
//  프로 채널 페이지 (독립 페이지)
// ══════════════════════════════════════════

function pPro() {
  if (!isAdmin()) return `<div style="padding:2rem;text-align:center;color:var(--text2);font-size:13px">admin만 접근 가능합니다.</div>`;
  return `
  <!-- 현황 요약 -->
  <div class="metrics-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:1rem">
    <div class="metric-card"><div class="metric-label">전체 멤버</div><div class="metric-value" id="pro-stat-total">—</div></div>
    <div class="metric-card"><div class="metric-label">활성 구독</div><div class="metric-value" style="color:var(--green)" id="pro-stat-active">—</div></div>
    <div class="metric-card"><div class="metric-label">채널 입장 중</div><div class="metric-value" style="color:var(--tg)" id="pro-stat-inch">—</div></div>
    <div class="metric-card"><div class="metric-label">7일 내 만료</div><div class="metric-value" style="color:var(--yellow)" id="pro-stat-exp">—</div></div>
  </div>

  <!-- 프로 채널 ID 설정 -->
  <div class="card" style="margin-bottom:.75rem">
    <div class="card-header"><span class="card-title">⚙️ 프로 채널 설정</span></div>
    <div class="card-body">
      <div class="form-group" style="margin-bottom:.75rem">
        <label class="form-label">프로 채널 ID</label>
        <input class="form-input" id="cfg-pro-channel" placeholder="@batipro">
        <div class="form-hint">유료 구독자 전용 비공개 채널의 @username 또는 숫자 ID. 봇이 해당 채널의 관리자여야 합니다.</div>
      </div>
      <div class="form-group" style="margin-bottom:.75rem">
        <label class="form-label">구독 신청 알림 수신 ID</label>
        <input class="form-input" id="cfg-pro-admin" placeholder="숫자 ID (예: 123456789)">
        <div class="form-hint">누군가 @baticompanybot 에 말을 걸면 이 ID로 알림이 옵니다. <b>@baticompanybot 에서 /myid</b> 로 확인하세요.</div>
      </div>
      <button class="btn btn-primary" onclick="saveProChannelConfig()">저장</button>
    </div>
  </div>

  <!-- 신규 멤버 등록 -->
  <div class="card" style="margin-bottom:.75rem">
    <div class="card-header"><span class="card-title">➕ 신규 멤버 등록</span></div>
    <div class="card-body">
      <div style="background:var(--bg3);border-radius:var(--radius-sm);padding:10px 14px;margin-bottom:.75rem;font-size:12px;color:var(--text1);line-height:1.9">
        💡 <b>텔레그램 ID 확인</b><br>
        구독 신청자가 <a href="https://t.me/baticompanybot" target="_blank" style="color:var(--tg)">@baticompanybot</a> 에 <b>말을 걸면</b> 어드민 채팅방으로 신청자 정보(이름·ID)가 자동으로 전달됩니다.<br>
        <span style="color:var(--text2)">별도로 ID를 물어보거나 복사할 필요 없습니다.</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 80px;gap:10px;margin-bottom:.75rem">
        <div class="form-group" style="margin:0">
          <label class="form-label">텔레그램 ID <span style="color:var(--red)">*</span></label>
          <input class="form-input" id="pro-new-tid" type="number" placeholder="숫자 ID (예: 123456789)">
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label">실명</label>
          <input class="form-input" id="pro-new-name" placeholder="홍길동">
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label">기간(개월)</label>
          <input class="form-input" id="pro-new-months" type="number" min="1" max="24" value="1">
        </div>
      </div>
      <div class="form-group" style="margin-bottom:.75rem">
        <label class="form-label">텔레그램 @username</label>
        <input class="form-input" id="pro-new-username" placeholder="@username (선택)">
      </div>
      <div class="form-group" style="margin-bottom:.75rem">
        <label class="form-label">메모</label>
        <input class="form-input" id="pro-new-memo" placeholder="결제 방법, 특이사항 등">
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" onclick="proAddMember()">등록 후 초대 발송</button>
        <button class="btn" onclick="proAddMember(false)">등록만 (초대 나중에)</button>
      </div>
    </div>
  </div>

  <!-- 멤버 목록 -->
  <div class="card">
    <div class="card-header">
      <span class="card-title">👥 멤버 목록</span>
      <button class="btn btn-sm" onclick="loadProMembers()">새로고침</button>
    </div>
    <div id="pro-member-list">
      <div style="padding:1.5rem;text-align:center;color:var(--text2)"><span class="loading"></span></div>
    </div>
  </div>`;
}

function initPro() {
  loadProChannelConfig();
  loadProMembers();
}

// ══════════════════════════════════════════
//  프로 채널 관리
// ══════════════════════════════════════════

async function loadProChannelConfig() {
  const keys = ['pro_channel_id', 'pro_admin_chat_id', 'sms_webhook_token'];
  const { data } = await sb.from('app_config').select('key,value').in('key', keys);
  const map = {};
  (data || []).forEach(r => map[r.key] = r.value);

  const el = document.getElementById('cfg-pro-channel');
  if (el) el.value = map['pro_channel_id'] || '@batipro';

  const adminEl = document.getElementById('cfg-pro-admin');
  if (adminEl) adminEl.value = map['pro_admin_chat_id'] || '';

  const tokenEl = document.getElementById('cfg-sms-token');
  if (tokenEl) tokenEl.value = map['sms_webhook_token'] || '';
}

async function saveProChannelConfig() {
  if (!isAdmin()) { toast('admin만 가능합니다.', 'error'); return; }
  const channelVal = document.getElementById('cfg-pro-channel')?.value.trim();
  const adminVal   = document.getElementById('cfg-pro-admin')?.value.trim();
  if (!channelVal && !adminVal) { toast('값을 입력해주세요.', 'error'); return; }
  try {
    const updates = [];
    if (channelVal) updates.push({ key: 'pro_channel_id',    value: channelVal });
    if (adminVal)   updates.push({ key: 'pro_admin_chat_id', value: adminVal });
    for (const u of updates) {
      await sb.from('app_config').upsert(
        { key: u.key, value: u.value, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );
    }
    toast('저장 완료', 'success');
  } catch(e) { toast('저장 실패: ' + e.message, 'error'); }
}

async function saveSmsToken() {
  if (!isAdmin()) { toast('admin만 가능합니다.', 'error'); return; }
  const val = document.getElementById('cfg-sms-token')?.value.trim();
  if (!val) { toast('토큰을 입력해주세요.', 'error'); return; }
  try {
    await sb.from('app_config').upsert(
      { key: 'sms_webhook_token', value: val, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );
    toast('토큰 저장 완료', 'success');
  } catch(e) { toast('저장 실패: ' + e.message, 'error'); }
}

function copySmsUrl() {
  const urlEl = document.getElementById('sms-webhook-url');
  if (!urlEl) return;
  const text = urlEl.textContent;
  navigator.clipboard?.writeText(text).then(() => toast('URL 복사됨', 'info'))
    .catch(() => toast('직접 복사해주세요: ' + text, 'info'));
}

async function loadSmsDeposits() {
  const logEl = document.getElementById('sms-deposit-log');
  if (!logEl) return;

  try {
    // app_config에서 최근 이력 로드
    const { data } = await sb.from('app_config').select('value').eq('key', 'sms_deposit_log').maybeSingle();
    if (!data || !data.value) {
      logEl.innerHTML = '<div style="font-size:12px;color:var(--text2)">아직 처리 이력이 없습니다.</div>';
      return;
    }
    const entries = JSON.parse(data.value).reverse();
    if (!entries.length) {
      logEl.innerHTML = '<div style="font-size:12px;color:var(--text2)">아직 처리 이력이 없습니다.</div>';
      return;
    }

    const STATUS_LABEL = {
      'auto_extended': ['✅ 자동 처리', 'var(--green)'],
      'unmatched':     ['❓ 미매칭',   'var(--yellow)'],
      'error':         ['❌ 오류',     'var(--red)'],
    };

    logEl.innerHTML = '<div class="table-wrap"><table><thead><tr><th>시각</th><th>은행</th><th>입금자</th><th>금액</th><th>처리</th></tr></thead><tbody>' +
      entries.map(e => {
        const [label, color] = STATUS_LABEL[e.action] || ['?', 'var(--text3)'];
        const time = new Date(e.time).toLocaleString('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
        return `<tr>
          <td style="font-size:11px;color:var(--text1)">${time}</td>
          <td style="font-size:12px">${e.bank||'?'}</td>
          <td><b>${e.name||'?'}</b>${e.member && e.member !== e.name ? `<br><span style="font-size:11px;color:var(--text2)">→ ${e.member}</span>` : ''}</td>
          <td style="font-size:12px">${(e.amount||0).toLocaleString()}원</td>
          <td style="color:${color};font-size:12px;font-weight:600">${label}</td>
        </tr>`;
      }).join('') +
    '</tbody></table></div>';
  } catch(e) {
    logEl.innerHTML = `<div style="font-size:12px;color:var(--red)">로드 실패: ${e.message}</div>`;
  }
}

async function loadProMembers() {
  const listEl = document.getElementById('pro-member-list');
  if (!listEl) return;
  listEl.innerHTML = '<div style="padding:1.5rem;text-align:center;color:var(--text2)"><span class="loading"></span></div>';

  try {
    const { data: members, error } = await sb.from('pro_members')
      .select('*').order('paid_until', { ascending: true });
    if (error) throw error;

    // 통계 업데이트
    const today = todayStr();
    const in7   = offsetDate(7);
    const total  = (members||[]).length;
    const active = (members||[]).filter(m => m.is_active).length;
    const inCh   = (members||[]).filter(m => m.in_channel).length;
    const exp7   = (members||[]).filter(m => m.is_active && m.paid_until <= in7 && m.paid_until >= today).length;

    const s = (id, v) => { const el = document.getElementById(id); if(el) el.textContent = v; };
    s('pro-stat-total',  total);
    s('pro-stat-active', active);
    s('pro-stat-inch',   inCh);
    s('pro-stat-exp',    exp7);

    if (!members || !members.length) {
      listEl.innerHTML = '<div style="padding:1.5rem;text-align:center;color:var(--text2);font-size:13px">등록된 멤버가 없습니다.</div>';
      return;
    }

    const rows = (members || []).map(m => {
      const until   = m.paid_until || '—';
      const isExp   = until < today;
      const isNear  = !isExp && until <= in7;
      const expStyle = isExp ? 'color:var(--red)' : isNear ? 'color:var(--yellow)' : 'color:var(--green)';
      const status  = m.in_channel
        ? '<span class="badge" style="background:rgba(42,171,238,.15);color:var(--tg)">채널 내</span>'
        : (m.is_active ? '<span class="badge badge-cat">초대 대기</span>' : '<span class="badge" style="background:rgba(var(--red-rgb),.12);color:var(--red)">비활성</span>');
      return `<tr>
        <td style="font-size:12px;color:var(--text1)">${m.telegram_id}</td>
        <td><b>${m.real_name||'—'}</b><br><span style="font-size:11px;color:var(--text2)">${m.telegram_name||''}</span></td>
        <td style="${expStyle};font-size:12px;font-weight:600">${until}${isExp?' <span style="font-size:11px">(만료)</span>':isNear?' <span style="font-size:11px">(D-'+Math.ceil((new Date(until)-new Date(today))/86400000)+')</span>':''}</td>
        <td>${status}</td>
        <td>
          <div style="display:flex;gap:4px;flex-wrap:wrap">
            <button class="btn btn-sm btn-primary" style="padding:2px 8px;font-size:11px" onclick="proSendInvite(${m.telegram_id})">초대</button>
            <button class="btn btn-sm" style="padding:2px 8px;font-size:11px" onclick="proExtend(${m.telegram_id})">+1개월</button>
            ${m.in_channel ? `<button class="btn btn-sm" style="padding:2px 8px;font-size:11px;color:var(--red)" onclick="proKick(${m.telegram_id}, '${(m.real_name||m.telegram_id+'').replace(/'/g,"\\'")}')">퇴장</button>` : ''}
          </div>
        </td>
      </tr>`;
    }).join('');

    listEl.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>텔레그램 ID</th><th>이름</th><th>만료일</th><th>상태</th><th>액션</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;

  } catch(e) {
    listEl.innerHTML = errorHTML('조회 실패: ' + e.message);
  }
}

async function proAddMember(sendInvite = true) {
  if (!isAdmin()) { toast('admin만 가능합니다.', 'error'); return; }

  const tid      = parseInt(document.getElementById('pro-new-tid')?.value.trim() || '0');
  const name     = document.getElementById('pro-new-name')?.value.trim() || '';
  const username = document.getElementById('pro-new-username')?.value.trim().replace(/^@/, '') || '';
  const months   = parseInt(document.getElementById('pro-new-months')?.value || '1');
  const memo     = document.getElementById('pro-new-memo')?.value.trim() || '';

  if (!tid) { toast('텔레그램 ID를 입력해주세요.', 'error'); return; }
  if (months < 1 || months > 24) { toast('기간은 1~24개월이어야 합니다.', 'error'); return; }

  // 만료일 계산
  const paidUntil = offsetDate(months * 30);

  try {
    // 기존 멤버 확인
    const { data: existing } = await sb.from('pro_members').select('id,paid_until').eq('telegram_id', tid).maybeSingle();

    if (existing) {
      // 이미 있으면 연장
      const current = new Date(existing.paid_until);
      const base    = current > new Date() ? current : new Date();
      const newUntil = new Date(base.getTime() + months * 30 * 86400000).toISOString().slice(0, 10);
      const { error } = await sb.from('pro_members').update({
        real_name:     name || undefined,
        telegram_name: username ? '@'+username : undefined,
        paid_until:    newUntil,
        is_active:     true,
        updated_at:    new Date().toISOString(),
      }).eq('telegram_id', tid);
      if (error) throw error;
      toast(`기존 멤버 ${months}개월 연장 (${newUntil})`, 'success');
    } else {
      // 신규 등록
      const { error } = await sb.from('pro_members').insert({
        telegram_id:   tid,
        telegram_name: username ? '@'+username : '',
        real_name:     name,
        paid_until:    paidUntil,
        is_active:     true,
        in_channel:    false,
        memo:          memo,
      });
      if (error) throw error;
      toast(`멤버 등록 완료 (만료: ${paidUntil})`, 'success');
    }

    // 입력 필드 초기화
    ['pro-new-tid','pro-new-name','pro-new-username','pro-new-memo'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const mEl = document.getElementById('pro-new-months');
    if (mEl) mEl.value = '1';

    // 초대 발송
    if (sendInvite) {
      await proSendInviteById(tid, months);
    }

    loadProMembers();

  } catch(e) { toast('등록 실패: ' + e.message, 'error'); }
}

async function proSendInvite(telegramId) {
  await proSendInviteById(telegramId, null);
}

async function proSendInviteById(telegramId, months) {
  if (!isAdmin()) { toast('admin만 가능합니다.', 'error'); return; }
  if (!confirm(`텔레그램 ID ${telegramId}에게 초대 링크를 발송할까요?`)) return;

  try {
    await sb.from('app_config').upsert({
      key:   'pro_action_flag',
      value: JSON.stringify({
        action:       'invite',
        telegram_id:  telegramId,
        months:       months || 1,
        requested_at: new Date().toISOString(),
      }),
    }, { onConflict: 'key' });
    toast('초대 링크 발송 요청 전송 — 봇이 곧 처리합니다.', 'success');
  } catch(e) { toast('요청 실패: ' + e.message, 'error'); }
}

async function proExtend(telegramId) {
  if (!isAdmin()) { toast('admin만 가능합니다.', 'error'); return; }
  const months = parseInt(prompt('연장 기간 (개월 수):', '1') || '0');
  if (!months || months < 1) return;

  try {
    // DB 직접 업데이트
    const { data: m } = await sb.from('pro_members').select('paid_until').eq('telegram_id', telegramId).single();
    const current = new Date(m.paid_until);
    const base    = current > new Date() ? current : new Date();
    const newUntil = new Date(base.getTime() + months * 30 * 86400000).toISOString().slice(0,10);

    const { error } = await sb.from('pro_members').update({
      paid_until: newUntil,
      is_active:  true,
      updated_at: new Date().toISOString(),
    }).eq('telegram_id', telegramId);
    if (error) throw error;
    toast(`${months}개월 연장 완료 → ${newUntil}`, 'success');
    loadProMembers();
  } catch(e) { toast('연장 실패: ' + e.message, 'error'); }
}

async function proKick(telegramId, memberName) {
  if (!isAdmin()) { toast('admin만 가능합니다.', 'error'); return; }
  if (!confirm(`${memberName || telegramId}을(를) 프로 채널에서 퇴장시킬까요?`)) return;

  try {
    await sb.from('app_config').upsert({
      key:   'pro_action_flag',
      value: JSON.stringify({
        action:       'kick',
        telegram_id:  telegramId,
        requested_at: new Date().toISOString(),
      }),
    }, { onConflict: 'key' });

    // DB is_active 즉시 업데이트
    await sb.from('pro_members').update({
      is_active:  false,
      updated_at: new Date().toISOString(),
    }).eq('telegram_id', telegramId);

    toast('퇴장 요청 전송 — 봇이 곧 처리합니다.', 'success');
    setTimeout(loadProMembers, 1000);
  } catch(e) { toast('퇴장 요청 실패: ' + e.message, 'error'); }
}

// ══════════════════════════════════════════
//  DETAIL MODAL
// ══════════════════════════════════════════
