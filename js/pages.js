// pages.js — 텔레그램 채널 관련 페이지 (overview, rooms, notice, logs)
// 투자현황 → investment.js / 스크리너 → screener.js

/**
 * PAGE_META — 페이지 키 → { title, fn, onLoad, onUnload } 단일 정의
 * nav.js와 draw()가 이 테이블을 참조 (타이틀/함수명 중복 정의 방지)
 *
 * onLoad:   draw() 후 추가로 실행할 초기화 함수명 (문자열 or null)
 * onUnload: 다른 페이지로 떠날 때 정리 함수명 (타이머·폴링·차트 해제) — go()가 호출
 */
const PAGE_META = {
  overview:   { title: '채널 대시보드', fn: 'pOverview',    onLoad: null },
  rooms:      { title: '채팅방 관리',   fn: 'pRooms',       onLoad: null },
  notice:     { title: '공지 발송',     fn: 'pNotice',      onLoad: 'loadNotices' },
  logs:       { title: '동기화 로그',   fn: 'pLogs',        onLoad: 'loadLogs' },
  botconfig:  { title: '봇 관리',       fn: 'pBotConfig',   onLoad: 'loadBotConfig' },
  investment: { title: '오늘의 시황',   fn: 'pInvestment',  onLoad: 'loadInvestment', onUnload: 'unloadInvestment' },
  company:    { title: '모니터링 종목',  fn: 'pCompany',     onLoad: 'loadCompanyPage' },
  watchlist:  { title: '투자노트',      fn: 'pWatchlist',   onLoad: '_initWatchlist' },
  screener:   { title: '종목 스크리너', fn: 'pScreener',    onLoad: null },
  highlow:    { title: '고가/저가 근접', fn: 'pHighLow',     onLoad: 'loadHighLow' },
  financials: { title: '기업 분석',     fn: 'pFinancials',  onLoad: 'initFinancials' },
  report:     { title: '종목 리포트',   fn: 'pReport',      onLoad: null },
  comparison: { title: '기업 비교 분석',fn: 'pComparison',  onLoad: 'initCmpPage' },
  stocks:     { title: '종목 관리',     fn: 'pStocks',      onLoad: 'loadStocks' },
  pro:        { title: '프로 채널',     fn: 'pPro',         onLoad: 'initPro' },
  team:       { title: '팀원 관리',     fn: 'pTeam',        onLoad: 'loadTeam' },
  settings:   { title: '설정',          fn: 'pSettings',    onLoad: null },
};

// watchlist 초기화 래퍼 (onLoad 단일 함수 제약 우회)
function _initWatchlist() { WL.group = 'all'; loadWatchlist(); }

function pOverview() {
  const isFull = r => r.status === 'full' || r.status === 'paid' || (r.members || 0) >= (r.max_members || 1000);

  // 기업/산업 채팅방 분리
  const companyRooms  = A.rooms.filter(r => r.room_type !== 'industry');
  const industryRooms = A.rooms.filter(r => r.room_type === 'industry');

  const total  = companyRooms.length;
  const full   = companyRooms.filter(isFull).length;
  const open   = companyRooms.filter(r => !isFull(r)).length;
  const totalM = companyRooms.reduce((s,r) => s + (r.members||0), 0);

  // 산업별 집계 (기업 채팅방 기준, 산업채팅방만 있는 경우도 포함)
  const catMap = {};
  // 산업채팅방만 있는 경우도 catMap에 키 생성
  industryRooms.forEach(r => {
    if (!catMap[r.cat]) catMap[r.cat] = { n:0, m:0, industryM:0, industryLink:'' };
    catMap[r.cat].industryM    = r.members || 0;
    catMap[r.cat].industryLink = r.link || '';
  });
  companyRooms.forEach(r => {
    if (!catMap[r.cat]) catMap[r.cat] = { n:0, m:0, industryM:0, industryLink:'' };
    catMap[r.cat].n++;
    catMap[r.cat].m += r.members || 0;
  });

  const sortedRooms = [...companyRooms].sort((a,b) => b.members - a.members);
  return `
  <div class="metrics-grid">
    <div class="metric-card"><div class="metric-label">전체 채팅방</div><div class="metric-value">${total}</div><div class="metric-sub">Supabase DB 기준</div></div>
    <div class="metric-card"><div class="metric-label">전체 멤버</div><div class="metric-value">${totalM.toLocaleString()}</div><div class="metric-sub">동기화 기준</div></div>
    <div class="metric-card"><div class="metric-label">정원 마감</div><div class="metric-value" style="color:var(--red)">${full}</div><div class="metric-sub">${total?Math.round(full/total*100):0}%</div></div>
    <div class="metric-card"><div class="metric-label">입장 가능</div><div class="metric-value" style="color:var(--green)">${open}</div><div class="metric-sub">${total?Math.round(open/total*100):0}%</div></div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
    <div class="card"><div class="card-header"><span class="card-title">산업별 현황</span></div><div class="card-body" style="padding:.75rem 1rem">
      ${Object.entries(catMap).sort((a,b)=>b[1].m-a[1].m).map(([cat,v])=>{
        const compList = companyRooms.filter(r=>r.cat===cat).sort((a,b)=>b.members-a.members);
        const catId = 'cat-' + cat.replace(/[^a-zA-Z0-9가-힣]/g,'');
        const indLink = safeUrl(v.industryLink);  // javascript: 등 비정상 스킴 차단
        return `
        <div style="border-bottom:1px solid var(--border)">
          <div style="display:flex;align-items:center;gap:10px;padding:9px 0;cursor:pointer"
               onclick="toggleCatDetail('${catId}')">
            <span class="cat-dot" style="background:${CATS[cat]||'#888'}"></span>
            <span style="font-weight:600;font-size:13px;min-width:56px">${cat}</span>
            ${v.industryM > 0 ? `
            <span style="font-size:12px;color:var(--tg)">
              ${indLink
                ? `<a href="${escAttr(indLink)}" target="_blank" rel="noopener" style="color:var(--tg)" onclick="event.stopPropagation()">산업채팅방</a>`
                : '산업채팅방'}
              <span style="color:var(--text1);margin-left:3px">${v.industryM.toLocaleString()}명</span>
            </span>` : '<span></span>'}
            <span style="flex:1"></span>
            <span style="font-size:12px;color:var(--text1)">기업방 <b>${v.n}</b>개</span>
            <span style="font-size:13px;font-weight:600;min-width:70px;text-align:right">${v.m.toLocaleString()}명</span>
            <span style="font-size:11px;color:var(--text2);width:14px;text-align:center" id="${catId}-icon">▶</span>
          </div>
          <div id="${catId}" style="display:none;padding:2px 0 10px 18px">
            ${compList.map(r=>`
              <div style="display:flex;align-items:center;gap:6px;padding:3px 0">
                <span style="font-size:12px;flex:1;color:var(--text1)">${escapeHtml(r.name)}</span>
                <span style="font-size:12px;color:var(--text1);min-width:52px;text-align:right">${(r.members||0).toLocaleString()}명</span>
                <span style="font-size:11px;font-weight:500;min-width:28px;text-align:center;color:${(r.members||0)>=(r.max_members||1000)?'var(--red)':'var(--green)'}">${(r.members||0)>=(r.max_members||1000)?'마감':'입장'}</span>
                ${safeUrl(r.link)?`<a href="${escAttr(safeUrl(r.link))}" target="_blank" rel="noopener" style="font-size:12px;color:var(--tg);text-decoration:none">→</a>`:'<span style="width:12px"></span>'}
              </div>`).join('')}
          </div>
        </div>`;
      }).join('')}
    </div></div>
    <div class="card"><div class="card-header"><span class="card-title">채팅방 멤버 순위</span></div><div class="card-body" style="padding:.75rem 1rem;max-height:400px;overflow-y:auto">
      ${sortedRooms.map((r,i)=>`<div style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:13px"><span style="width:16px;color:var(--text2);font-size:11px;font-weight:600">${i+1}</span><span style="flex:1">${escapeHtml(r.name)}</span><span style="color:var(--text1);font-size:12px">${(r.members||0).toLocaleString()}</span><div style="width:50px"><div class="progress"><div class="progress-fill" style="background:${CATS[r.cat]||'#888'};width:${Math.min(100,Math.round((r.members||0)/(r.max_members||1000)*100))}%"></div></div></div></div>`).join('')}
    </div></div>
  </div>`;
}

// ── 채팅방 목록 행 렌더링 (순수 함수 — 부분 업데이트에도 재사용) ──
function _renderRoomRow(r) {
  const fill = Math.min(100, Math.round((r.members||0) / (r.max_members||1000) * 100));
  const barColor = (r.members||0) / (r.max_members||1000) > 0.9 ? 'var(--red)' : 'var(--tg)';
  return `<tr>
    <td><div style="display:flex;align-items:center;gap:6px">
      <span class="cat-dot" style="background:${CATS[r.cat]||'#888'}"></span>
      <span style="font-weight:500">${escapeHtml(r.name)}</span>
      ${r.code ? `<span style="font-size:11px;color:var(--text2)">${escapeHtml(r.code)}</span>` : ''}
    </div></td>
    <td>
      <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">
        <span class="badge badge-cat">${r.cat}</span>
        ${r.room_type==='industry' ? `<span style="font-size:11px;padding:1px 6px;border-radius:100px;background:rgba(74,158,255,.15);color:#4a9eff">산업방</span>` : ''}
      </div>
      ${r.sub_cat && r.sub_cat !== '산업전체' ? `<div style="font-size:11px;color:var(--text2);margin-top:2px">${r.sub_cat}</div>` : ''}
    </td>
    <td>
      <div>${(r.members||0).toLocaleString()}<span style="color:var(--text2)">/${r.max_members||1000}</span></div>
      <div class="progress" style="margin-top:4px">
        <div class="progress-fill" style="background:${barColor};width:${fill}%"></div>
      </div>
    </td>
    <td><span class="badge ${r.status==='full'?'badge-full':r.status==='paid'?'badge-paid':'badge-open'}">${r.status==='full'?'정원 마감':r.status==='paid'?'🔒 유료':'일반 입장'}</span></td>
    <td><span style="font-size:11px;color:var(--text2);font-family:monospace">${String(r.chat_id).slice(0,22)}</span></td>
    <td><div style="display:flex;gap:5px">
      <button class="btn btn-sm" onclick="openDetail(${r.id})">상세</button>
      ${canEdit() ? `<button class="btn btn-sm" onclick="syncOne(${r.id})" title="동기화">↻</button>
        <button class="btn btn-sm" onclick="toggleStatus(${r.id})" style="font-size:11px">${r.status==='full'?'→ 일반':r.status==='paid'?'→ 마감':'→ 유료'}</button>` : ''}
    </div></td>
  </tr>`;
}

/** 현재 A 상태 기준으로 채팅방 필터+정렬 결과 반환 */
function _getFilteredRooms() {
  const q = A.q.trim().toLowerCase();
  let filtered = A.rooms.filter(r => {
    const cOk = A.cat === 'all' || r.cat === A.cat;
    const sOk = A.status === 'all' || r.status === A.status;
    const qOk = !q || r.name.toLowerCase().includes(q) || (r.keywords||'').toLowerCase().includes(q);
    return cOk && sOk && qOk;
  });
  if (A.sortBy === 'members') {
    filtered = [...filtered].sort((a, b) =>
      A.sortDir === 'asc' ? (a.members||0) - (b.members||0) : (b.members||0) - (a.members||0)
    );
  }
  return filtered;
}

// ── 필터 적용 후 목록만 업데이트 (draw() 전체 재렌더링 없음 → IME 버그 해결) ──
function _filterAndRenderRooms() {
  const filtered = _getFilteredRooms();

  const tbody = document.getElementById('room-tbody');
  const count = document.getElementById('room-count');
  if (tbody) tbody.innerHTML = filtered.map(_renderRoomRow).join('');
  if (count) count.textContent = `${filtered.length}개`;

  // 멤버 수 컬럼 헤더 정렬 아이콘 업데이트
  const th = document.getElementById('th-members');
  if (th) th.textContent = '멤버 수 ' + (A.sortBy === 'members' ? (A.sortDir === 'asc' ? '▲' : '▼') : '↕');

  // 칩 active 상태 업데이트
  document.querySelectorAll('[data-status]').forEach(b =>
    b.classList.toggle('active', b.dataset.status === A.status));
  document.querySelectorAll('[data-cat]').forEach(b =>
    b.classList.toggle('active', b.dataset.cat === A.cat));
}

function pRooms() {
  const cats = [...new Set(A.rooms.map(r => r.cat))].sort();
  const filtered = _getFilteredRooms();
  return `
  <div class="filter-bar">
    <input class="search-box" id="room-search-input" placeholder="이름·키워드 검색..." value="${A.q}">
    <button class="chip ${A.status==='all'?'active':''}" data-status="all"
      onclick="A.status='all';_filterAndRenderRooms()">전체</button>
    <button class="chip ${A.status==='open'?'active':''}" data-status="open"
      onclick="A.status='open';_filterAndRenderRooms()">일반 입장</button>
    <button class="chip ${A.status==='paid'?'active':''}" data-status="paid"
      onclick="A.status='paid';_filterAndRenderRooms()">🔒 유료 입장</button>
    <button class="chip ${A.status==='full'?'active':''}" data-status="full"
      onclick="A.status='full';_filterAndRenderRooms()">정원 마감</button>
    <span style="width:1px;height:14px;background:var(--border2);margin:0 2px"></span>
    <button class="chip ${A.cat==='all'?'active':''}" data-cat="all"
      onclick="A.cat='all';_filterAndRenderRooms()">전체 산업</button>
    ${cats.map(c => `<button class="chip ${A.cat===c?'active':''}" data-cat="${c}"
      onclick="A.cat='${c}';_filterAndRenderRooms()">${c}</button>`).join('')}
  </div>
  <div style="font-size:12px;color:var(--text2);margin-bottom:.75rem" id="room-count">${filtered.length}개</div>
  <div class="card"><div class="table-wrap"><table>
    <thead><tr><th>채팅방</th><th>산업</th><th id="th-members" onclick="A.sortBy='members';A.sortDir=(A.sortDir==='desc'?'asc':'desc');_filterAndRenderRooms()" style="cursor:pointer;user-select:none">멤버 수 ↕</th><th>상태</th><th>Chat ID</th><th>관리</th></tr></thead>
    <tbody id="room-tbody">${filtered.map(_renderRoomRow).join('')}</tbody>
  </table></div></div>`;
}

function pNotice() {
  if (!canEdit()) return `<div style="padding:2rem;text-align:center;color:var(--text2);font-size:13px">발송 권한이 없습니다 (viewer)</div>`;

  const rooms = A.rooms;
  const openCount    = rooms.filter(r => r.status === 'open').length;
  const companyCount = rooms.filter(r => r.room_type === 'company').length;

  // 어드민 채널: app_config.admin_chat_id (@batiinvest)
  const adminChatId = (A.config?.admin_chat_id || '').trim();
  const adminRoom   = adminChatId
    ? rooms.find(r => (r.chat_id || '').trim() === adminChatId)
    : null;
  const adminTarget = adminRoom ? `room:${adminRoom.id}` : (adminChatId ? 'admin_direct' : '');

  // 바티인베스트 채팅방 (@BatiInvestChat)
  const batiChatRoom = rooms.find(r =>
    (r.chat_id || '').toLowerCase().includes('batiinvestchat') ||
    (r.link   || '').toLowerCase().includes('batiinvestchat')
  );
  const batiTarget = batiChatRoom ? `room:${batiChatRoom.id}` : 'bati_direct';

  const indChips = INDUSTRIES.map(i => {
    const n = rooms.filter(r => r.cat === i).length;
    return n ? `<button class="chip chip-sm" data-nt onclick="ntPickTarget('${i}',this)">${IND_EMOJI_MAP[i]||'📌'} ${i} <b>${n}</b></button>` : '';
  }).join('');

  const roomOptions = [...rooms]
    .sort((a,b) => a.name.localeCompare(b.name, 'ko'))
    .map(r => `<option value="room:${r.id}">[${r.cat||r.room_type}] ${escapeHtml(r.name)}</option>`)
    .join('');

  return `
  <div class="card">
    <div class="card-header">
      <span class="card-title">✉️ 새 공지 작성</span>
      <span class="card-sub" id="i-target-info">→ 전체 ${rooms.length}개</span>
    </div>
    <div class="card-body">
      <input type="hidden" id="i-target" value="all">

      <div class="nt-step">
        <div class="nt-step-label"><span class="nt-step-num">1</span>발송 대상</div>
        <div class="nt-chips" id="nt-chips">
          <button class="chip active" data-nt onclick="ntPickTarget('all',this)">📢 전체 <b>${rooms.length}</b></button>
          <button class="chip" data-nt onclick="ntPickTarget('open',this)">🟢 입장 가능 <b>${openCount}</b></button>
          <button class="chip" data-nt onclick="ntPickTarget('${batiTarget}',this)">📊 바티인베스트</button>
          ${adminTarget ? `<button class="chip" data-nt onclick="ntPickTarget('${adminTarget}',this)">👤 어드민</button>` : ''}
          <span class="nt-chip-div"></span>
          ${indChips}
          <select class="form-select nt-room-select" id="nt-room-select" onchange="ntPickTarget(this.value||'all',null)">
            <option value="">개별 채팅방…</option>
            ${roomOptions}
          </select>
        </div>
      </div>

      <div class="nt-step">
        <div class="nt-step-label"><span class="nt-step-num">2</span>내용 작성
          <span class="nt-toolbar">
            <button class="btn btn-sm" onclick="autoGenIntro()" style="background:rgba(42,171,238,.12);border-color:rgba(42,171,238,.3);color:var(--tg)">📋 소개 글 생성</button>
            <button class="btn btn-sm" onclick="autoGenIntro(true)" title="수정본 무시하고 채팅방 데이터로 새로 생성">🔄 새로 생성</button>
            <button class="btn btn-sm" onclick="clearNoticeContent()">🗑 지우기</button>
            <select class="form-select" id="i-parse-mode" onchange="ntUpdateSummary()" title="발송 형식">
              <option value="HTML">HTML</option>
              <option value="Markdown">Markdown</option>
            </select>
          </span>
        </div>
        <div class="nt-editor-grid">
          <div>
            <textarea class="form-input nt-textarea" id="i-content"
              placeholder="직접 입력하거나 [소개 글 생성] 버튼을 누르세요&#10;&#10;--- 단독 줄을 넣으면 그 지점에서 메시지가 나뉘어 발송됩니다"
              oninput="ntPreview(this.value)"></textarea>
            <div class="nt-count" id="nt-count">0자</div>
          </div>
          <div class="nt-tg">
            <div class="nt-tg-head">
              <span class="nt-tg-avatar">B</span>
              <span>
                <span class="nt-tg-name">바티인베스트</span>
                <span class="nt-tg-sub">발송 미리보기</span>
              </span>
            </div>
            <div class="nt-tg-body" id="i-prev"></div>
          </div>
        </div>
      </div>

      <div class="nt-sendbar">
        <div id="i-prog" class="hidden"></div>
        <span class="nt-summary" id="nt-summary"></span>
        <button class="btn btn-primary" id="i-btn" onclick="sendInline()">
          <svg style="width:13px;height:13px;vertical-align:-2px;margin-right:4px" viewBox="0 0 16 16" fill="none"><path d="M14.5 1.5 7 9M14.5 1.5l-4.5 13-2.5-5.5L2 6.5l12.5-5Z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>발송
        </button>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-header">
      <span class="card-title">📌 종목방 소개글 <span class="card-sub">— 그룹 설명(Description) · <code>{name}</code> 자리에 종목명 자동 치환 · 텔레그램 255자 제한</span></span>
    </div>
    <div class="card-body">
      <div class="nt-editor-grid">
        <div>
          <textarea class="form-input nt-textarea nt-textarea-sm" id="desc-template" oninput="descPreview()" placeholder="불러오는 중…"></textarea>
          <div class="nt-count" id="desc-count">—</div>
        </div>
        <div class="nt-tg nt-tg-sm">
          <div class="nt-tg-head">
            <span class="nt-tg-avatar">B</span>
            <span>
              <span class="nt-tg-name">그룹 설명 미리보기</span>
              <span class="nt-tg-sub">예시 종목: 펩트론</span>
            </span>
          </div>
          <div class="nt-tg-body" id="desc-prev"></div>
        </div>
      </div>
      <div class="nt-sendbar">
        <span class="nt-summary">종목 채팅방 <b>${companyCount}</b>개 · 기존 설명 덮어쓰기</span>
        <button class="btn btn-sm" onclick="saveDescTemplate()">💾 저장만</button>
        <button class="btn btn-primary btn-sm" id="desc-sync-btn" onclick="syncDescriptions()">📌 저장 + 일괄 적용</button>
      </div>
    </div>
  </div>

  <div class="section-header"><span class="section-title">발송 기록</span><button class="btn btn-sm" onclick="loadNotices()">새로고침</button></div>
  <div class="card" id="notice-list"><div style="padding:1.5rem;text-align:center;color:var(--text2)"><span class="loading"></span></div></div>`;
}

async function loadNotices() {
  // 작성 위젯 초기화 (첫 draw 시 미리보기·요약바 세팅)
  if (document.getElementById('nt-summary') && typeof ntPreview === 'function')
    ntPreview(document.getElementById('i-content')?.value || '');
  if (typeof loadDescTemplate === 'function') loadDescTemplate();

  const el = document.getElementById('notice-list'); if (!el) return;
  const { data, error } = await DB('notice_history').select('*').order('created_at',{ascending:false}).limit(30);
  if (error) { el.innerHTML = errorHTML(error.message); return; }
  el.innerHTML=`<div class="table-wrap"><table><thead><tr><th>시각</th><th>대상</th><th>내용</th><th style="text-align:right">결과</th></tr></thead><tbody>
    ${!data.length?'<tr><td colspan="4" class="empty-row">발송 기록이 없습니다. 공지를 작성하고 발송하면 여기에 기록됩니다.</td></tr>':data.map(h=>{
      const sent = h.sent_count || 0, ok = h.ok_count || 0;
      const resColor = ok >= sent && sent > 0 ? 'var(--green)' : ok > 0 ? 'var(--yellow)' : 'var(--red)';
      const emoji = IND_EMOJI_MAP[h.target] || '';
      const txt = (h.content||'').replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim();
      return `<tr>
      <td style="font-size:12px;color:var(--text1);white-space:nowrap">${new Date(h.created_at).toLocaleString('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}</td>
      <td><span class="badge badge-cat">${emoji ? emoji+' ' : ''}${escapeHtml(h.target||'—')}</span></td>
      <td style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--text1)" title="${escAttr(txt.slice(0,300))}">${escapeHtml(txt.slice(0,50))}${txt.length>50?'…':''}</td>
      <td style="text-align:right;font-weight:600;color:${resColor}">${ok}/${sent}</td>
    </tr>`;}).join('')}
  </tbody></table></div>`;
}

function pLogs() {
  return `<div class="section-header"><span class="section-title">동기화 로그 (최근 50건)</span><button class="btn btn-sm" onclick="loadLogs()">새로고침</button></div>
  <div class="card" id="log-list"><div style="padding:1.5rem;text-align:center;color:var(--text2)"><span class="loading"></span></div></div>`;
}

async function loadLogs() {
  const el = document.getElementById('log-list'); if (!el) return;
  const { data, error } = await DB('sync_logs').select('*').order('synced_at',{ascending:false}).limit(50);
  if (error) { el.innerHTML = errorHTML(error.message); return; }
  el.innerHTML=`<div class="table-wrap"><table><thead><tr><th>시각</th><th>채팅방</th><th>이전</th><th>이후</th><th>변화</th></tr></thead><tbody>
    ${!data.length?'<tr><td colspan="5" class="empty-row">동기화 기록이 없습니다. 멤버 수 동기화를 실행하면 여기에 기록됩니다.</td></tr>':data.map(l=>{const d=l.after-l.before;return`<tr>
      <td style="font-size:12px;color:var(--text1)">${new Date(l.synced_at).toLocaleString('ko-KR')}</td>
      <td style="font-weight:500">${l.room_name}</td>
      <td>${(l.before||0).toLocaleString()}</td><td>${(l.after||0).toLocaleString()}</td>
      <td style="font-weight:600;color:${d>0?'var(--green)':d<0?'var(--red)':'var(--text3)'}">${d>0?'+':''}${d}</td>
    </tr>`;}).join('')}
  </tbody></table></div>`;
}

// ── 재무 상태 ──

function toggleCatDetail(id) {
  toggleSection(id, id + '-icon', ['▼', '▶']);
}
