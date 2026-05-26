// bots.js — 봇 모니터링, 봇 설정



function pBot() {
  return `
  <div class="metrics-grid" style="grid-template-columns:repeat(2,1fr)">
    <div class="metric-card" id="bot-dart-card">
      <div class="metric-label">DART 공시 봇</div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:6px">
        <span class="dot dot-gray" id="bot-dart-dot"></span>
        <span class="metric-value" style="font-size:16px" id="bot-dart-status">확인 중...</span>
      </div>
      <div class="metric-sub" id="bot-dart-time">—</div>
    </div>
    <div class="metric-card" id="bot-news-card">
      <div class="metric-label">뉴스 봇</div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:6px">
        <span class="dot dot-gray" id="bot-news-dot"></span>
        <span class="metric-value" style="font-size:16px" id="bot-news-status">확인 중...</span>
      </div>
      <div class="metric-sub" id="bot-news-time">—</div>
    </div>
    <div class="metric-card" id="bot-price-card">
      <div class="metric-label">시세 감시 봇</div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:6px">
        <span class="dot dot-gray" id="bot-price-dot"></span>
        <span class="metric-value" style="font-size:16px" id="bot-price-status">확인 중...</span>
      </div>
      <div class="metric-sub" id="bot-price-time">—</div>
    </div>
    <div class="metric-card" id="bot-sched-card">
      <div class="metric-label">스케줄러 봇</div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:6px">
        <span class="dot dot-gray" id="bot-sched-dot"></span>
        <span class="metric-value" style="font-size:16px" id="bot-sched-status">확인 중...</span>
      </div>
      <div class="metric-sub" id="bot-sched-time">—</div>
    </div>
  </div>

  <div class="section-header" style="margin-top:.5rem">
    <span class="section-title">최근 발송 기록</span>
    <button class="btn btn-sm" onclick="loadBotStatus()">새로고침</button>
  </div>
  <div class="card" id="bot-notice-card">
    <div style="padding:1.5rem;text-align:center;color:var(--text3)"><span class="loading"></span></div>
  </div>`;
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
      card.innerHTML = '<div style="padding:1.5rem;text-align:center;color:var(--text3);font-size:13px">발송 기록 없음 — 봇 연동 후 자동으로 기록됩니다.</div>';
      return;
    }
    card.innerHTML = '<div class="table-wrap"><table><thead><tr><th>시각</th><th>대상</th><th>내용</th><th>성공</th></tr></thead><tbody>' +
      data.map(h => '<tr>' +
        '<td style="font-size:12px;color:var(--text2)">' + new Date(h.created_at).toLocaleString('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}) + '</td>' +
        '<td><span class="badge badge-cat">' + (h.target||'—') + '</span></td>' +
        '<td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px">' + (h.content||'') + '</td>' +
        '<td style="color:var(--green)">' + (h.ok_count||0) + '/' + (h.sent_count||0) + '</td>' +
      '</tr>').join('') +
    '</tbody></table></div>';
  } catch(e) {
    card.innerHTML = '<div style="padding:1rem;color:var(--red);font-size:13px">조회 실패: ' + e.message + '</div>';
  }
}

function pBotConfig() {
  if (!isAdmin()) return `<div style="padding:2rem;text-align:center;color:var(--text3);font-size:13px">admin만 접근 가능합니다.</div>`;
  return `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem">
    <div class="tabs" style="margin-bottom:0" id="botcfg-tabs">
      <button class="tab active" onclick="switchBotCfgTab('keywords',this)">키워드 설정</button>
      <button class="tab" onclick="switchBotCfgTab('news-filter',this)">뉴스 필터</button>
      <button class="tab" onclick="switchBotCfgTab('dart-level',this)">공시 등급</button>
      <button class="tab" onclick="switchBotCfgTab('schedule',this)">스케줄</button>
      <button class="tab" onclick="switchBotCfgTab('news-terms',this)">산업별 검색어</button>
      <button class="tab" onclick="switchBotCfgTab('alert',this)">시세 알림</button>
    </div>
    <button class="btn btn-sm btn-primary" id="botcfg-reload-btn" onclick="requestBotReload('botcfg-reload-btn')" title="저장한 설정을 봇에 즉시 반영합니다">
      <svg style="width:12px;height:12px;vertical-align:middle;margin-right:3px" viewBox="0 0 16 16" fill="none"><path d="M13.5 8A5.5 5.5 0 112.5 5M2.5 2v3h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      봇 재로드
    </button>
  </div>

  <!-- 키워드 설정 탭 -->
  <div id="botcfg-keywords">
    <div class="card" style="margin-bottom:1rem"><div class="card-header"><span class="card-title">AI 분석 키워드</span></div><div class="card-body">
      <div class="form-group">
        <label class="form-label">AI 트리거 키워드 <span style="font-size:11px;color:var(--text3)">(쉼표로 구분)</span></label>
        <textarea class="form-input" id="cfg-ai-kw" rows="3" placeholder="공급계약,임상,무상증자,..."></textarea>
        <div class="form-hint">이 키워드가 공시 제목에 포함되면 Gemini AI 분석을 실행합니다.</div>
      </div>
      <div class="form-group">
        <label class="form-label">전체 중요 키워드 <span style="font-size:11px;color:var(--text3)">(쉼표로 구분)</span></label>
        <textarea class="form-input" id="cfg-global-kw" rows="2" placeholder="거래정지,상장폐지,부도,..."></textarea>
        <div class="form-hint">비보유 종목도 이 키워드가 있으면 무조건 알림 발송합니다.</div>
      </div>
      <button class="btn btn-primary" onclick="saveBotKeywords()">저장</button>
    </div></div>
  </div>

  <!-- 뉴스 필터 탭 -->
  <div id="botcfg-news-filter" style="display:none">
    <div class="card" style="margin-bottom:1rem">
      <div class="card-header">
        <span class="card-title">스팸 패턴 <span style="font-size:11px;font-weight:400;color:var(--text3)">— 제목에 포함 시 발송 차단</span></span>
      </div>
      <div class="card-body">
        <div class="form-group">
          <label class="form-label">패턴 목록 <span style="font-size:11px;color:var(--text3)">(한 줄에 하나씩, 정규식 가능)</span></label>
          <textarea class="form-input" id="cfg-spam-patterns" rows="10" placeholder="매수.*위&#10;급등.*예고&#10;순매수.*위"></textarea>
          <div class="form-hint">예: <code>매수.*위</code> → "매수 1위", "매수 3위" 등 모두 차단</div>
        </div>
        <button class="btn btn-primary" onclick="saveNewsFilter('news_spam_patterns', 'cfg-spam-patterns', '\\n')">저장</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:1rem">
      <div class="card-header">
        <span class="card-title">실질 보도 키워드 <span style="font-size:11px;font-weight:400;color:var(--text3)">— 하나도 없으면 발송 안 함</span></span>
      </div>
      <div class="card-body">
        <div class="form-group">
          <label class="form-label">키워드 목록 <span style="font-size:11px;color:var(--text3)">(쉼표로 구분)</span></label>
          <textarea class="form-input" id="cfg-meaningful-kw" rows="6" placeholder="계약,수주,실적,임상,특허,인수..."></textarea>
          <div class="form-hint">이 중 하나라도 제목/본문에 있어야 발송합니다. 없으면 단순 언급으로 판단해 스킵.</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn btn-primary" onclick="saveNewsFilter('news_meaningful_keywords', 'cfg-meaningful-kw', ',')">저장</button>
          <span style="font-size:11px;color:var(--text3)">저장 후 봇 재로드 버튼을 눌러주세요.</span>
        </div>
      </div>
    </div>
  </div>

  <!-- 공시 등급 탭 -->
  <div id="botcfg-dart-level" style="display:none">
    <div style="font-size:12px;color:var(--text2);margin-bottom:1rem;padding:10px 14px;background:var(--bg3);border-radius:var(--radius-sm);border:1px solid var(--border)">
      공시 제목에 키워드가 포함되면 해당 등급으로 분류됩니다. 쉼표로 구분하며 저장 후 봇 재로드 시 반영됩니다.<br>
      <b style="color:var(--red)">긴급</b> → 메인+산업+기업 &nbsp;|&nbsp; <b style="color:var(--green)">중요</b> → 산업+기업 &nbsp;|&nbsp; <b style="color:var(--text2)">일반</b> → 산업+기업 &nbsp;|&nbsp; <b style="color:var(--text3)">잡공시</b> → 기업채널만
    </div>

    <div class="card" style="margin-bottom:.75rem">
      <div class="card-header">
        <span class="card-title" style="color:var(--red)">🚨 긴급 키워드</span>
        <span style="font-size:11px;color:var(--text3)">메인 + 산업 + 기업채널</span>
      </div>
      <div class="card-body">
        <textarea class="form-input" id="cfg-dart-urgent" rows="3"
          placeholder="거래정지,횡령,배임,상장폐지,불성실,공개매수,영업정지"></textarea>
        <div style="display:flex;gap:8px;margin-top:.75rem;align-items:center">
          <button class="btn btn-primary btn-sm" onclick="saveDartLevel('dart_urgent','cfg-dart-urgent')">저장</button>
          <span style="font-size:11px;color:var(--text3)">우선순위 가장 높음 — 중요/잡공시 키워드와 중복 시 긴급 우선</span>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:.75rem">
      <div class="card-header">
        <span class="card-title" style="color:var(--green)">📈 중요 키워드</span>
        <span style="font-size:11px;color:var(--text3)">산업 + 기업채널</span>
      </div>
      <div class="card-body">
        <textarea class="form-input" id="cfg-dart-major" rows="4"
          placeholder="공급계약,수주,잠정실적,무상증자,유상증자,최대주주변경,합병,분할,인수,전환사채,소송,특허,임상,사업보고서"></textarea>
        <div style="margin-top:.75rem">
          <button class="btn btn-primary btn-sm" onclick="saveDartLevel('dart_major','cfg-dart-major')">저장</button>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="card-title" style="color:var(--text3)">📊 잡공시 키워드</span>
        <span style="font-size:11px;color:var(--text3)">기업채널만 (산업/메인 발송 안 함)</span>
      </div>
      <div class="card-body">
        <textarea class="form-input" id="cfg-dart-skip" rows="4"
          placeholder="소유상황보고,기업설명회,IR개최,감사보고서,주주총회소집,의결권대리,증권발행실적,투자설명서,자기주식취득결과,자기주식처분결과"></textarea>
        <div style="margin-top:.75rem">
          <button class="btn btn-primary btn-sm" onclick="saveDartLevel('dart_skip','cfg-dart-skip')">저장</button>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:.75rem">
      <div class="card-header">
        <span class="card-title">🔍 공시 제목 필터 <span style="font-size:11px;font-weight:400;color:var(--text3)">— 제목에 포함 시 모든 채널 차단</span></span>
      </div>
      <div class="card-body">
        <div class="form-group">
          <label class="form-label">단어 목록 <span style="font-size:11px;color:var(--text3)">(쉼표로 구분)</span></label>
          <textarea class="form-input" id="cfg-dart-title-filter" rows="3"
            placeholder="자기주식,증권발행실적,투자설명서,합병등종료보고..."></textarea>
          <div class="form-hint">공시 제목에 이 단어가 포함되면 등급에 관계없이 모든 채널에 발송하지 않습니다.</div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="saveDartLevel('dart_title_filter','cfg-dart-title-filter')">저장</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:.75rem">
      <div class="card-header">
        <span class="card-title">🏢 기업명 부분 필터 <span style="font-size:11px;font-weight:400;color:var(--text3)">— 기업명에 포함 시 차단</span></span>
      </div>
      <div class="card-body">
        <div class="form-group">
          <label class="form-label">단어 목록 <span style="font-size:11px;color:var(--text3)">(쉼표로 구분)</span></label>
          <textarea class="form-input" id="cfg-dart-corp-filter" rows="3"
            placeholder="홀딩스,지주,캐피탈,리츠..."></textarea>
          <div class="form-hint">기업명에 이 단어가 포함되면 차단합니다. 블랙리스트는 정확한 기업명 일치, 여기는 부분 일치입니다.<br>예: <code>홀딩스</code> 입력 시 "삼성홀딩스", "XX홀딩스" 등 전체 차단</div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="saveDartLevel('dart_corp_filter','cfg-dart-corp-filter')">저장</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:.75rem">
      <div class="card-header">
        <span class="card-title">🚫 기업 블랙리스트 <span style="font-size:11px;font-weight:400;color:var(--text3)">— 정확한 기업명 일치 시 차단</span></span>
      </div>
      <div class="card-body">
        <div class="form-group">
          <label class="form-label">기업명 <span style="font-size:11px;color:var(--text3)">(쉼표로 구분)</span></label>
          <textarea class="form-input" id="cfg-dart-blacklist" rows="3" placeholder="삼성전자,SK하이닉스,..."></textarea>
          <div class="form-hint">여기 입력된 기업의 공시는 기업채널 포함 모든 채널에 발송하지 않습니다.</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn btn-primary btn-sm" onclick="saveDartLevel('dart_blacklist','cfg-dart-blacklist')">저장</button>
          <span style="font-size:11px;color:var(--text3)">저장 후 봇 재로드 버튼을 눌러주세요.</span>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title">채널 라우팅 기준</span></div>
      <div class="card-body" style="font-size:12px;color:var(--text2);line-height:2">
        <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 16px">
          <span style="color:var(--red);font-weight:600">🚨 긴급</span><span>거래정지·횡령·배임·상장폐지·불성실 → <b>메인 + 산업 + 기업채널</b></span>
          <span style="color:var(--green);font-weight:600">📈 중요</span><span>공급계약·수주·실적·증자·합병 등 → <b>산업 + 기업채널</b></span>
          <span style="color:var(--text2)">📄 일반</span><span>그 외 공시 → <b>산업 + 기업채널</b></span>
          <span style="color:var(--text3)">📊 잡공시</span><span>소유상황·IR·감사보고서 등 → <b>기업채널만</b></span>
          <span style="color:var(--red)">🚫 블랙리스트</span><span>지정 기업 → <b>모든 채널 차단</b></span>
        </div>
      </div>
    </div>
  </div>

  <!-- 스케줄 탭 -->
  <div id="botcfg-schedule" style="display:none">
    <div class="card" style="margin-bottom:1rem"><div class="card-header"><span class="card-title">스케줄 ON/OFF</span></div><div class="card-body">
      <div id="schedule-list"><span class="loading"></span></div>
    </div></div>
  </div>

  <!-- 산업별 검색어 탭 -->
  <div id="botcfg-news-terms" style="display:none">
    <div class="card" style="margin-bottom:1rem"><div class="card-header">
      <span class="card-title">산업별 뉴스 검색어</span>
      <span style="font-size:11px;color:var(--text3)">쉼표로 구분 — 저장 즉시 봇 다음 사이클에 반영</span>
    </div><div class="card-body">
      <div id="news-terms-list"><span class="loading"></span></div>
    </div></div>
  </div>

  <!-- 시세 알림 탭 -->
  <div id="botcfg-alert" style="display:none">

    <div style="font-size:12px;color:var(--text2);margin-bottom:1rem;padding:10px 14px;background:var(--bg3);border-radius:var(--radius-sm);border:1px solid var(--border)">
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
            <label class="form-label">📉 약세 기준 (%) <span style="font-size:11px;font-weight:400;color:var(--text3)">음수 입력</span></label>
            <input class="form-input" id="cfg-alert-down" type="number" step="0.5" min="-30" max="-1" placeholder="-5">
            <div class="form-hint">이 이하 하락 시 약세 알림</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn btn-primary" onclick="saveAlertThresholds()">저장</button>
          <span style="font-size:11px;color:var(--text3)">VI 발동·상한가·하한가는 기준값 무관하게 항상 발송됩니다.</span>
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
        <span class="card-title">🔍 신뢰도 낮은 출처 <span style="font-size:11px;font-weight:400;color:var(--text3)">— URL에 포함 시 낮은 우선순위</span></span>
      </div>
      <div class="card-body">
        <div class="form-group">
          <label class="form-label">출처 키워드 <span style="font-size:11px;color:var(--text3)">(쉼표로 구분)</span></label>
          <textarea class="form-input" id="cfg-low-trust" rows="3" placeholder="blog.naver,cafe.naver,tistory,brunch,newspim,fntoday"></textarea>
          <div class="form-hint">뉴스 링크 URL에 이 문자열이 포함되면 신뢰도 낮은 출처로 분류됩니다.</div>
        </div>
        <button class="btn btn-primary" onclick="saveAlertConfig('news_low_trust_sources', 'cfg-low-trust')">저장</button>
      </div>
    </div>
  </div>

  <div style="background:linear-gradient(135deg,rgba(42,171,238,.12),rgba(42,171,238,.04));border:1px solid rgba(42,171,238,.25);border-radius:var(--radius);padding:1rem 1.25rem">
    <div style="font-size:13px;font-weight:600;color:var(--tg);margin-bottom:.5rem">봇 서버 연동 방법</div>
    <div style="font-size:12px;color:var(--text2);line-height:1.9">
      1. <code style="background:var(--bg3);padding:1px 6px;border-radius:3px">supabase_bridge.py</code> 를 봇 폴더에 복사<br>
      2. <code style="background:var(--bg3);padding:1px 6px;border-radius:3px">pip install supabase</code> 실행<br>
      3. <code style="background:var(--bg3);padding:1px 6px;border-radius:3px">.env</code> 에 <code style="background:var(--bg3);padding:1px 6px;border-radius:3px">SB_URL</code>, <code style="background:var(--bg3);padding:1px 6px;border-radius:3px">SB_SERVICE_KEY</code> 추가<br>
      4. 봇 재시작 → 대시보드에서 heartbeat 확인
    </div>
  </div>`;
}

function switchBotCfgTab(tab, el) {
  ['keywords','news-filter','dart-level','schedule','news-terms','alert'].forEach(t => {
    document.getElementById(`botcfg-${t}`).style.display = t === tab ? '' : 'none';
  });
  document.querySelectorAll('#botcfg-tabs .tab').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');

  if (tab === 'schedule') loadSchedules();
  if (tab === 'news-terms') loadNewsTerms();
  if (tab === 'news-filter') loadNewsFilter();
  if (tab === 'dart-level') loadDartLevel();
  if (tab === 'alert') loadAlertConfig();
}

async function loadBotConfig() {
  // 키워드 탭 로드
  const allKeys = ['ai_trigger_keywords', 'global_important_keywords'];
  const { data: cfgRows } = await sb.from('app_config').select('key,value').in('key', allKeys);
  const cfg = {};
  (cfgRows || []).forEach(r => cfg[r.key] = r.value);

  const aiEl = document.getElementById('cfg-ai-kw');
  const glEl = document.getElementById('cfg-global-kw');
  if (aiEl && cfg['ai_trigger_keywords']) aiEl.value = cfg['ai_trigger_keywords'];
  if (glEl && cfg['global_important_keywords']) glEl.value = cfg['global_important_keywords'];

  // 스케줄은 탭 전환 시 로드
  loadSchedules();
}

async function loadSchedules() {
  const schedules = [
    { key:'schedule_lunch',    label:'점심 브리핑 (11:30)' },
    { key:'schedule_closing',  label:'마감 브리핑 (18:30)' },
    { key:'schedule_report',   label:'네이버 리포트 (08:50, 18:00)' },
    { key:'schedule_saturday', label:'토요일 주간 랭킹 (10:00)' },
    { key:'schedule_sunday',   label:'일요일 리포트 (10:00)' },
    { key:'kind_ir',           label:'KIND IR자료 (09:05, 18:05)' },
  ];
  const { data: cfgRows } = await sb.from('app_config').select('key,value').in('key', schedules.map(s => s.key));
  const cfg = {};
  (cfgRows || []).forEach(r => cfg[r.key] = r.value);

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
  '<div style="font-size:11px;color:var(--text3);margin-top:.75rem">변경 즉시 반영됩니다. 봇은 다음 사이클에서 확인합니다.</div>';
}

async function loadDartLevel() {
  const keys = ['dart_urgent', 'dart_major', 'dart_skip', 'dart_blacklist', 'dart_title_filter', 'dart_corp_filter'];
  const { data } = await sb.from('app_config').select('key,value').in('key', keys);
  const map = {};
  (data || []).forEach(r => map[r.key] = r.value);

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

async function saveDartLevel(key, elId) {
  if (!isAdmin()) { toast('admin만 수정 가능합니다.', 'error'); return; }
  const el = document.getElementById(elId);
  if (!el) return;
  const value = el.value.trim();
  const { error } = await sb.from('app_config')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) { toast('저장 실패: ' + error.message, 'error'); return; }
  toast('저장 완료 — 봇 재로드 후 반영됩니다', 'success');
}
async function loadNewsFilter() {
  const keys = ['news_spam_patterns', 'news_meaningful_keywords'];
  const { data } = await sb.from('app_config').select('key,value').in('key', keys);
  const map = {};
  (data || []).forEach(r => map[r.key] = r.value);

  const spamEl = document.getElementById('cfg-spam-patterns');
  const kwEl   = document.getElementById('cfg-meaningful-kw');
  if (spamEl && map['news_spam_patterns'])       spamEl.value = map['news_spam_patterns'];
  if (kwEl   && map['news_meaningful_keywords']) kwEl.value   = map['news_meaningful_keywords'];
}

async function saveNewsFilter(key, elId, separator) {
  if (!isAdmin()) { toast('admin만 수정 가능합니다.', 'error'); return; }
  const el = document.getElementById(elId);
  if (!el) return;
  const value = el.value.trim();
  const { error } = await sb.from('app_config')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) { toast('저장 실패: ' + error.message, 'error'); return; }
  toast('저장 완료 — 봇 재로드 후 반영됩니다', 'success');
}

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
  const { data } = await sb.from('app_config').select('key,value').in('key', keys);
  const map = {};
  (data || []).forEach(r => map[r.key] = r.value);

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

async function saveAlertConfig(key, elId) {
  if (!isAdmin()) { toast('admin만 수정 가능합니다.', 'error'); return; }
  const el = document.getElementById(elId);
  if (!el) return;
  const value = el.value.trim();
  if (!value) { toast('값을 입력해주세요.', 'error'); return; }
  try {
    await sb.from('app_config').upsert(
      { key, value, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );
    toast('저장 완료 — 봇 재로드 후 반영됩니다', 'success');
  } catch(e) { toast('저장 실패: ' + e.message, 'error'); }
}

function pSettings() {
  if (!isAdmin()) return `<div style="padding:2rem;text-align:center;color:var(--text3);font-size:13px">admin만 설정 변경 가능합니다.</div>`;
  return `
  <div class="card" style="max-width:560px;margin-bottom:1rem"><div class="card-header"><span class="card-title">Bot 토큰 (DB 저장)</span></div><div class="card-body">
    <div class="form-group">
      <label class="form-label">Telegram Bot Token</label>
      <input class="form-input" id="cfg-token" type="password" value="${A.config['tg_bot_token']||''}" placeholder="123456789:ABCdef...">
      <div class="form-hint">@BotFather에서 발급. Supabase app_config 테이블에 저장됩니다.</div>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-primary" onclick="saveConfig('tg_bot_token', document.getElementById('cfg-token').value.trim()).then(()=>{ A.config['tg_bot_token']=document.getElementById('cfg-token').value.trim(); })">DB에 저장</button>
      <button class="btn" onclick="testBot()">연결 테스트</button>
    </div>
    <div id="bot-result" style="margin-top:.75rem;font-size:13px"></div>
  </div></div>

  <div class="card" style="max-width:560px;margin-bottom:1rem"><div class="card-header"><span class="card-title">앱 설정</span></div><div class="card-body">
    <div class="form-group">
      <label class="form-label">대시보드 이름</label>
      <input class="form-input" id="cfg-appname" value="${A.config['app_name']||'바티인베스트 채팅방 관리'}">
    </div>
    <button class="btn btn-primary" onclick="saveConfig('app_name', document.getElementById('cfg-appname').value.trim())">저장</button>
  </div></div>

  <div class="card" style="max-width:560px"><div class="card-header"><span class="card-title">Supabase 연결 정보</span></div><div class="card-body" style="font-size:13px;color:var(--text2);line-height:1.9">
    <p>Project URL: <code style="background:var(--bg3);padding:1px 6px;border-radius:3px;font-size:12px">${SB_URL}</code></p>
    <p style="margin-top:.5rem">연결된 유저: <strong style="color:var(--text)">${A.user?.email}</strong> (${A.profile?.role})</p>
    <p style="margin-top:.5rem;font-size:12px;color:var(--text3)">URL/Key 변경이 필요하면 index.html 상단의 SB_URL, SB_KEY를 직접 수정하세요.</p>
  </div></div>
`;
}

// ══════════════════════════════════════════
//  프로 채널 페이지 (독립 페이지)
// ══════════════════════════════════════════

function pPro() {
  if (!isAdmin()) return `<div style="padding:2rem;text-align:center;color:var(--text3);font-size:13px">admin만 접근 가능합니다.</div>`;
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
      <div style="background:var(--bg3);border-radius:var(--radius-sm);padding:10px 14px;margin-bottom:.75rem;font-size:12px;color:var(--text2);line-height:1.9">
        💡 <b>텔레그램 ID 확인</b><br>
        구독 신청자가 <a href="https://t.me/baticompanybot" target="_blank" style="color:var(--tg)">@baticompanybot</a> 에 <b>말을 걸면</b> 어드민 채팅방으로 신청자 정보(이름·ID)가 자동으로 전달됩니다.<br>
        <span style="color:var(--text3)">별도로 ID를 물어보거나 복사할 필요 없습니다.</span>
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
      <div style="padding:1.5rem;text-align:center;color:var(--text3)"><span class="loading"></span></div>
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
      logEl.innerHTML = '<div style="font-size:12px;color:var(--text3)">아직 처리 이력이 없습니다.</div>';
      return;
    }
    const entries = JSON.parse(data.value).reverse();
    if (!entries.length) {
      logEl.innerHTML = '<div style="font-size:12px;color:var(--text3)">아직 처리 이력이 없습니다.</div>';
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
          <td style="font-size:11px;color:var(--text2)">${time}</td>
          <td style="font-size:12px">${e.bank||'?'}</td>
          <td><b>${e.name||'?'}</b>${e.member && e.member !== e.name ? `<br><span style="font-size:10px;color:var(--text3)">→ ${e.member}</span>` : ''}</td>
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
  listEl.innerHTML = '<div style="padding:1.5rem;text-align:center;color:var(--text3)"><span class="loading"></span></div>';

  try {
    const { data: members, error } = await sb.from('pro_members')
      .select('*').order('paid_until', { ascending: true });
    if (error) throw error;

    // 통계 업데이트
    const today = new Date().toISOString().slice(0,10);
    const in7   = new Date(Date.now() + 7*86400000).toISOString().slice(0,10);
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
      listEl.innerHTML = '<div style="padding:1.5rem;text-align:center;color:var(--text3);font-size:13px">등록된 멤버가 없습니다.</div>';
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
        <td style="font-size:12px;color:var(--text2)">${m.telegram_id}</td>
        <td><b>${m.real_name||'—'}</b><br><span style="font-size:11px;color:var(--text3)">${m.telegram_name||''}</span></td>
        <td style="${expStyle};font-size:12px;font-weight:600">${until}${isExp?' <span style="font-size:10px">(만료)</span>':isNear?' <span style="font-size:10px">(D-'+Math.ceil((new Date(until)-new Date(today))/86400000)+')</span>':''}</td>
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
    listEl.innerHTML = `<div style="padding:1rem;color:var(--red);font-size:13px">조회 실패: ${e.message}</div>`;
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
  const paidUntil = new Date(Date.now() + months * 30 * 86400000).toISOString().slice(0,10);

  try {
    // 기존 멤버 확인
    const { data: existing } = await sb.from('pro_members').select('id,paid_until').eq('telegram_id', tid).maybeSingle();

    if (existing) {
      // 이미 있으면 연장
      const current = new Date(existing.paid_until);
      const base    = current > new Date() ? current : new Date();
      const newUntil = new Date(base.getTime() + months * 30 * 86400000).toISOString().slice(0,10);
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
