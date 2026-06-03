// rooms.js — 채팅방 CRUD, 공지 발송, 팀원 관리
async function addRoom() {
  if (!canEdit()) { toast('권한이 없습니다.', 'error'); return; }
  const name = document.getElementById('a-name').value.trim();
  const chatId = document.getElementById('a-chatid').value.trim();
  if (!name || !chatId) { toast('이름과 Chat ID 필수', 'error'); return; }
  const link = chatId.startsWith('@') ? `https://t.me/${chatId.replace('@','')}` : (document.getElementById('a-link').value.trim() || '');
  try {
    const { data, error } = await DB('rooms').insert([{ name, chat_id: chatId, cat: document.getElementById('a-cat').value, sub_cat: document.getElementById('a-sub').value.trim(), code: document.getElementById('a-code').value.trim(), max_members: parseInt(document.getElementById('a-max').value)||1000, link, keywords: document.getElementById('a-kw').value.trim(), members: 0, status:'open', pinned:false }]).select().single();
    if (error) throw error;

    // 채팅방 생성 → 해당 종목 monitoring_level=full로 업데이트
    const roomCode = document.getElementById('a-code').value.trim().split('.')[0];
    if (roomCode) {
      for (const c of [roomCode, roomCode+'.KS', roomCode+'.KQ']) {
        await sb.from('companies').update({ monitoring_level: 'full' })
          .eq('code', c).eq('is_monitored', true);
      }
    }

    A.rooms.push(data); A.rooms.sort((a,b) => a.name.localeCompare(b.name,'ko'));
    document.getElementById('badge').textContent = A.rooms.length;
    closeModal('m-add'); draw(); toast(`${name} 추가 완료`, 'success');
  } catch(e) { toast('추가 실패: ' + e.message, 'error'); }
}

async function toggleStatus(id) {
  if (!canEdit()) { toast('권한이 없습니다.', 'error'); return; }
  const r = A.rooms.find(x => x.id === id); if (!r) return;
  const s = r.status === 'full' ? 'open' : 'full';
  await DB('rooms').update({ status: s }).eq('id', id);
  r.status = s; draw(); toast(`${r.name} → ${s === 'full' ? '정원 마감' : '입장 가능'}`, 'info');
}

async function deleteRoom(id) {
  if (!canDel()) { toast('admin만 삭제 가능합니다.', 'error'); return; }
  const r = A.rooms.find(x => x.id === id);
  if (!r || !confirm(`"${r.name}" 삭제?`)) return;
  const { error } = await DB('rooms').delete().eq('id', id);
  if (error) { toast('삭제 실패: ' + error.message, 'error'); return; }

  // 채팅방 삭제 → 해당 종목 monitoring_level=news로 다운그레이드
  const roomCode = (r.code || '').split('.')[0];
  if (roomCode) {
    for (const c of [roomCode, roomCode+'.KS', roomCode+'.KQ']) {
      await sb.from('companies').update({ monitoring_level: 'news' })
        .eq('code', c).eq('is_monitored', true);
    }
  }

  A.rooms = A.rooms.filter(x => x.id !== id);
  document.getElementById('badge').textContent = A.rooms.length;
  closeModal('m-detail'); draw(); toast(`${r.name} 삭제됨`, 'info');
}

async function saveEdit(id) {
  if (!canEdit()) { toast('권한이 없습니다.', 'error'); return; }
  const p = { name: document.getElementById('e-name').value.trim(), cat: document.getElementById('e-cat').value, sub_cat: document.getElementById('e-sub').value.trim(), code: document.getElementById('e-code').value.trim(), chat_id: document.getElementById('e-chatid').value.trim(), link: document.getElementById('e-link').value.trim(), keywords: document.getElementById('e-kw').value.trim(), max_members: parseInt(document.getElementById('e-max').value)||1000 };
  if (!p.name || !p.chat_id) { toast('이름과 Chat ID 필수', 'error'); return; }
  const { error } = await DB('rooms').update(p).eq('id', id);
  if (error) { toast('수정 실패: ' + error.message, 'error'); return; }
  Object.assign(A.rooms.find(x => x.id === id), p);
  toast('수정 완료 — 봇에 반영 중...', 'success'); dtab('info', null);
  // 채팅방 ID 변경이 봇에 즉시 반영되도록 자동 재로드
  try {
    await sb.from('app_config')
      .upsert({ key: 'reload_flag', value: String(Date.now()) }, { onConflict: 'key' });
    toast('✓ 봇 재로드 완료 — 1분 내 반영됩니다', 'success');
  } catch(e) {
    toast('봇 재로드 실패 — 수동으로 재로드 버튼을 눌러주세요', 'error');
  }
}

// ══════════════════════════════════════════
//  NOTICE
// ══════════════════════════════════════════
// ── 메시지 자동 분할 (4096자 한도, 줄 단위) ──────────────────────────────────
function splitMessage(text, maxLen = 4000) {
  if (text.length <= maxLen) return [text];
  const parts = [];
  let cur = '';
  for (const line of text.split('\n')) {
    const next = cur ? cur + '\n' + line : line;
    if (next.length > maxLen) {
      if (cur) parts.push(cur.trim());
      cur = line;
    } else {
      cur = next;
    }
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

async function doNotice(content, target, btnId, progId) {
  if (!canEdit()) { toast('권한이 없습니다.', 'error'); return; }
  if (!content) { toast('내용 입력 필요', 'error'); return; }

  const parseMode = document.getElementById('i-parse-mode')?.value || 'HTML';

  let targets = A.rooms;
  // room:ID 형식 — 개별 채팅방 발송
  if (target.startsWith('room:')) {
    const id = parseInt(target.replace('room:', ''));
    const r = A.rooms.find(x => x.id === id);
    if (!r) { toast('채팅방을 찾을 수 없습니다.', 'error'); return; }
    targets = [r];
  } else if (target === 'admin_direct') {
    const adminCid = (A.config?.admin_chat_id || '').trim();
    if (!adminCid) { toast('admin_chat_id 미설정', 'error'); return; }
    targets = [{ chat_id: adminCid, name: adminCid }];
  } else if (target === 'bati_direct') {
    targets = [{ chat_id: '@BatiInvestChat', name: '바티인베스트 채팅방' }];
  } else if (target === 'open') {
    targets = targets.filter(r => r.status === 'open');
  } else if (target !== 'all') {
    targets = targets.filter(r => r.cat === target);
  }

  // --- 구분자가 있으면 그것만 사용, 없으면 4096자 기준 자동 분할
  const manualParts = content.split(/\r?\n---\r?\n/).map(s => s.trim()).filter(Boolean);
  const parts = manualParts.length > 1 ? manualParts : splitMessage(content);
  const splitInfo = parts.length > 1 ? ` (${parts.length}개 메시지로 발송)` : '';
  if (!confirm(`${targets.length}개 채팅방에 발송?${splitInfo}\n형식: ${parseMode}`)) return;

  const btn = document.getElementById(btnId), prog = document.getElementById(progId);
  btn.disabled = true; prog.classList.remove('hidden');
  let ok = 0;
  for (let i = 0; i < targets.length; i++) {
    prog.innerHTML = `<span class="loading"></span>${i+1}/${targets.length} — ${targets[i].name}`;
    try {
      for (let p = 0; p < parts.length; p++) {
        if (parts.length > 1) {
          prog.innerHTML = `<span class="loading"></span>${i+1}/${targets.length} — ${targets[i].name} (${p+1}/${parts.length})`;
        }
        await tg('sendMessage', { chat_id: targets[i].chat_id, text: parts[p], parse_mode: parseMode });
        if (p < parts.length - 1) await new Promise(r => setTimeout(r, 500));
      }
      ok++;
    } catch(e) {
      console.error(`[공지실패] ${targets[i].name}:`, e.message);
    }
    await new Promise(r => setTimeout(r, 400));
  }
  await DB('notice_history').insert([{ target, content, sent_count: targets.length, ok_count: ok, sent_by: A.user.id }]);
  localStorage.setItem('bati-intro-draft', content);
  prog.innerHTML = `✓ ${ok}/${targets.length} 완료${splitInfo} — DB 저장됨`;
  btn.disabled = false;
  toast(`발송 완료: ${ok}/${targets.length}${splitInfo}`, 'success');
  setTimeout(() => { prog.classList.add('hidden'); if (A.page === 'notice') loadNotices(); }, 3000);
}

// 대상 변경 시 발송 개수 표시
function onNoticeTargetChange() {
  const target = document.getElementById('i-target')?.value;
  const info   = document.getElementById('i-target-info');
  if (!info) return;
  if (!target) { info.textContent = ''; return; }
  if (target.startsWith('room:')) {
    const id = parseInt(target.replace('room:', ''));
    const r = A.rooms.find(x => x.id === id);
    info.textContent = r ? `→ ${r.name} 1개` : '';
  } else if (target === 'admin_direct') {
    const adminCid = (A.config?.admin_chat_id || '').trim();
    info.textContent = adminCid ? `→ ${adminCid} 1개` : '→ admin_chat_id 미설정';
  } else if (target === 'bati_direct') {
    info.textContent = '→ @BatiInvestChat 1개';
  } else if (target === 'all') {
    info.textContent = `→ 전체 ${A.rooms.length}개`;
  } else if (target === 'open') {
    info.textContent = `→ ${A.rooms.filter(r=>r.status==='open').length}개`;
  } else {
    info.textContent = `→ ${A.rooms.filter(r=>r.cat===target).length}개`;
  }
}

// ── 내용 지우기 ───────────────────────────────────────────────────────────────
function clearNoticeContent() {
  const ta = document.getElementById('i-content');
  if (ta) { ta.value = ''; if (typeof prev === 'function') prev('', 'i-prev'); }
}

// ── 소개 글 전체 포맷 생성 (원본 소개 글 포맷) ──────────────────────────────
function autoGenIntro() {
  const parseMode = document.getElementById('i-parse-mode')?.value || 'HTML';
  const isHTML    = parseMode === 'HTML';

  const lnk = (name, url) => {
    if (!url) return name;
    return isHTML ? `<a href="${url}">${name}</a>` : `[${name}](${url})`;
  };
  const b = (t) => isHTML ? `<b>${t}</b>` : `*${t}*`;

  // ── 헤더 ────────────────────────────────────────────────────────────────────
  const buymeUrl = 'https://buymeacoffee.com/batiinvest';
  const header = [
    '안녕하세요, 바티입니다.',
    '',
    '바티인베스트는 건전한 투자 토론과 정보 공유를 위한 커뮤니티입니다.',
    '광고 없는 클린한 환경 유지를 위해 아래 규정을 준수해 주세요.',
    '',
    '✅ 입장 및 운영 안내',
    '①승인: 신청 후 1~2일 내 순차 승인 (정원 초과 시 대기 발생)',
    '②퇴장: 3일 이상 미접속(미활동), 광고/욕설/비매너 행위 시 즉시 퇴장',
    `③우선입장: 후원자 (${lnk(buymeUrl, buymeUrl)}) 는 대기없이 최우선 입장 안내`,
    '④각 채팅방은 정원에 따라 비공개로 전환될 수 있습니다.',
    '',
    '📬 문의: @BatiInvestment',
    '',
  ].join('\n');

  // ── 종합 채팅방 ─────────────────────────────────────────────────────────
  const mainRoom = A.rooms.find(r => r.room_type === 'industry' && (r.name || '').includes('바티인베스트'));
  const mainSection = [
    '',
    `📊 ${lnk('바티인베스트', mainRoom?.link || 'https://t.me/BatiInvestChat')}`,
    '• 미국/국내 시황 요약 (매일 아침)',
    '• 실시간 공시·뉴스 모니터링',
    '• 급등 알림 — 5%↑ / 15%↑ 실시간',
    '• AI 공시 분석 (긴급·중요 공시 자동)',
    '• 52주 신고가 (장 마감 후)',
    '• 주도주 Top 50 (매일 장 마감 후)',
    '',
  ].join('\n');

  // ── 바티아카이브 ─────────────────────────────────────────────────────────
  const archiveRoom = A.rooms.find(r =>
    (r.chat_id || '').toLowerCase().includes('batiarchive') ||
    (r.link    || '').toLowerCase().includes('batiarchive')
  );
  const archiveSection = [
    '',
    `📁 ${lnk('바티아카이브', archiveRoom?.link || 'https://t.me/batiarchive')} (자료실)`,
    '• KIND IR자료 PDF (전 상장사, 실시간)',
    '• 증권사 리포트 PDF (산업분석·기업분석)',
    '',
  ].join('\n');

  // ── 채팅방별 알림 안내 ────────────────────────────────────────────────────
  const channelGuide = [
    '',
    '🏭 산업 채팅방',
    '• 해당 산업 공시 (긴급·중요)',
    '• 해당 산업 뉴스',
    '• 증권사 산업분석 리포트 PDF',
    '',
    '📌 종목 채팅방',
    '• 해당 종목 공시 전체',
    '• 해당 종목 뉴스',
    '• 시세 알림 (5%↑ / 15%↑)',
    '• IR자료 및 증권사 리포트',
    '',
  ].join('\n');

  // ── 산업별 섹션 ─────────────────────────────────────────────────────────
  const IND_EMOJI = {
    '바이오':'💊','뷰티':'💄','로봇':'🤖','2차전지':'🔋',
    '신재생':'☀️','소비재':'👗','테크':'💻','반도체':'💾',
    '엔터':'🎤','조선':'🚢','우주':'🚀',
  };

  // 산업 채팅방 맵
  const indRooms = {};
  A.rooms.filter(r => r.room_type === 'industry' && r.cat).forEach(r => { indRooms[r.cat] = r; });

  // 종목 채팅방 산업별 그룹
  const grouped = {};
  A.rooms.filter(r => r.room_type !== 'industry').forEach(r => {
    const cat = r.cat || '기타';
    if (!grouped[cat]) grouped[cat] = { full: [], open: [] };
    const isFull = r.status === 'full' || (r.members || 0) >= (r.max_members || 1000);
    grouped[cat][isFull ? 'full' : 'open'].push(r);
  });

  // 산업 순서 (고정 순서 우선, 나머지는 종목 수 내림차순)
  const IND_ORDER = ['바이오','뷰티','로봇','2차전지','신재생','소비재','테크','반도체','엔터','조선','우주'];
  const allCats = [...new Set([
    ...IND_ORDER.filter(c => grouped[c]),
    ...Object.keys(grouped).filter(c => !IND_ORDER.includes(c)),
  ])];

  // 종목 N개씩 한 줄로 묶기 (가독성)
  const chunkLine = (arr, n = 4) => {
    const rows = [];
    for (let i = 0; i < arr.length; i += n) rows.push(arr.slice(i, i + n));
    return rows;
  };

  const indSections = allCats.map(cat => {
    const emoji  = IND_EMOJI[cat] || '📌';
    const indR   = indRooms[cat];
    const cap    = indR?.max_members ?? 1000;
    const full   = (grouped[cat]?.full  || []).sort((a,b) => a.name.localeCompare(b.name,'ko'));
    const open   = (grouped[cat]?.open  || []).sort((a,b) => a.name.localeCompare(b.name,'ko'));
    const lines  = ['', `${emoji} ${b(cat)} 종목 채팅방 (정원: ${cap.toLocaleString()}명)`];

    if (indR?.link) lines.push(` ➤ ${lnk(cat + ' 산업 채팅방 바로가기', indR.link)}`);
    lines.push('···········');

    if (full.length) {
      lines.push('[🔴정원 마감]');
      chunkLine(full).forEach(row =>
        lines.push(row.map(r => lnk(r.name, r.link)).join('   '))
      );
    }
    if (open.length) {
      lines.push('[🟢입장 가능]');
      chunkLine(open).forEach(row =>
        lines.push(row.map(r => lnk(r.name, r.link)).join('   '))
      );
    }
    return lines.join('\n');
  }).join('\n');

  // 메시지 1: 소개·규정·채널 안내 / 메시지 2: 산업별 채팅방 목록
  const msg1 = (header + mainSection + archiveSection + channelGuide).trim();
  const msg2Header = '📋 산업별 채팅방 목록\n\n';
  const msg2 = (msg2Header + indSections).trim();
  const text = msg1 + '\n---\n' + msg2;

  const ta = document.getElementById('i-content');
  if (ta) {
    ta.value = text;
    if (typeof prev === 'function') prev(text, 'i-prev');
    toast(`소개 글 생성 완료 ✨ (메시지1: ${msg1.length}자 / 메시지2: ${msg2.length}자)`, 'success');
  }
}

// ── 채팅방 목록 공지 자동 생성 ──
function autoGenNotice() {
  const target    = document.getElementById('i-target')?.value || 'all';
  const parseMode = document.getElementById('i-parse-mode')?.value || 'Markdown';

  let rooms = A.rooms.filter(r => r.room_type !== 'industry');
  if (target.startsWith('room:')) {
    const id = parseInt(target.replace('room:', ''));
    const r = A.rooms.find(x => x.id === id);
    rooms = r ? [r] : [];
  } else if (target === 'open') {
    rooms = rooms.filter(r => r.status === 'open');
  } else if (target !== 'all') {
    rooms = rooms.filter(r => r.cat === target);
  }

  if (!rooms.length) { toast('대상 채팅방 없음', 'error'); return; }

  // 전체 발송 시 산업별 분리 권장 안내
  if (target === 'all' && rooms.length > 20) {
    toast('⚠️ 종목이 많아요. 산업별로 선택해서 발송하는 걸 권장합니다.', 'info');
  }

  // 산업별 그룹화
  const grouped = {};
  rooms.forEach(r => {
    if (!grouped[r.cat]) grouped[r.cat] = { full: [], open: [] };
    const isFull = r.status === 'full' || (r.members||0) >= (r.max_members||1000);
    grouped[r.cat][isFull ? 'full' : 'open'].push(r);
  });

  const INDUSTRY_EMOJI = {
    '바이오':'💊','반도체':'🔬','2차전지':'🔋','로봇':'🤖',
    '조선':'🚢','우주':'🚀','신재생':'☀️','테크':'💻',
    '엔터':'🎵','뷰티':'💄','소비재':'🛒',
  };

  const link = (r) => {
    if (!r.link) return r.name;
    return parseMode === 'Markdown'
      ? `[${r.name}](${r.link})`
      : `<a href="${r.link}">${r.name}</a>`;
  };
  const bold = (t) => parseMode === 'Markdown' ? `*${t}*` : `<b>${t}</b>`;

  const lines = [];

  // ── 상단 소개 헤더 ──
  const totalRooms = rooms.length;
  const openCount  = rooms.filter(r => r.status !== 'full' && (r.members||0) < (r.max_members||1000)).length;
  const fullCount  = totalRooms - openCount;

  lines.push(`안녕하세요, ${bold('바티인베스트')}입니다 👋`);
  lines.push('');
  lines.push('건전한 투자 토론과 정보 공유를 위한 종목별 채팅방을 안내드립니다.');
  lines.push(`현재 ${bold(totalRooms + '개')} 채팅방 운영 중 — 🟢 입장 가능 ${openCount}개 · 🔴 정원 마감 ${fullCount}개`);
  lines.push('');

  // 종합 채팅방 안내
  const mainRoom = A.rooms.find(r => r.room_type === 'industry' && r.name?.includes('바티인베스트'));
  if (mainRoom?.link) {
    const mainLink = parseMode === 'Markdown'
      ? `[📊 바티인베스트 종합 채팅방](${mainRoom.link})`
      : `<a href="${mainRoom.link}">📊 바티인베스트 종합 채팅방</a>`;
    lines.push(mainLink + ' — 시황·공시·리포트 실시간');
    lines.push('');
  }

  lines.push('─'.repeat(22));
  lines.push('');

  // ── 산업별 채팅방 목록 ──
  const cats = Object.keys(grouped).sort((a,b) =>
    (grouped[b].full.length + grouped[b].open.length) - (grouped[a].full.length + grouped[a].open.length)
  );

  cats.forEach((cat, idx) => {
    const { full, open } = grouped[cat];
    const emoji = INDUSTRY_EMOJI[cat] || '📌';
    const total = full.length + open.length;
    const industryRoom = A.rooms.find(r => r.room_type === 'industry' && r.cat === cat);

    if (idx > 0) lines.push('');

    lines.push(`${emoji} ${bold(cat)} (${total}개)`);
    if (industryRoom?.link) {
      const indLink = parseMode === 'Markdown'
        ? `└ [${cat} 산업방](${industryRoom.link})`
        : `└ <a href="${industryRoom.link}">${cat} 산업방</a>`;
      lines.push(indLink);
    }
    lines.push('');

    full.sort((a,b) => a.name.localeCompare(b.name,'ko')).forEach(r => {
      lines.push(`🔴 ${link(r)}`);
    });
    open.sort((a,b) => a.name.localeCompare(b.name,'ko')).forEach(r => {
      lines.push(`🟢 ${link(r)}`);
    });
  });

  // ── 하단 안내 ──
  lines.push('');
  lines.push('─'.repeat(22));
  lines.push('');
  lines.push('✅ ' + bold('입장 안내'));
  lines.push('· 승인 후 1~2일 내 순차 입장');
  lines.push('· 3일 이상 미접속 시 자동 퇴장');
  lines.push('· 후원자 우선 입장: buymeacoffee.com/batiinvest');
  lines.push('');
  lines.push('📬 신규 채팅방 개설 문의: @BatiInvestment');

  const text = lines.join('\n').trim();

  // 길이 경고
  if (text.length > 3500) {
    toast(`⚠️ 메시지가 ${text.length}자입니다. 텔레그램 한도(4096자)에 근접해요. 산업별로 나눠 발송을 권장합니다.`, 'error');
  }

  const textarea = document.getElementById('i-content');
  if (textarea) {
    textarea.value = text;
    prev(text, 'i-prev');
    toast(`공지 생성 완료 ✨ (${text.length}자)`, 'success');
  }
}
const sendInline = () => doNotice(document.getElementById('i-content').value.trim(), document.getElementById('i-target').value, 'i-btn', 'i-prog');

async function sendSingleNotice(id) {
  const r = A.rooms.find(x => x.id === id); if (!r) return;
  const content = document.getElementById('s-content').value.trim();
  if (!content) { toast('내용 입력 필요', 'error'); return; }
  try {
    await tgSend(r.chat_id, content);
    await DB('notice_history').insert([{ target: r.name, content, sent_count: 1, ok_count: 1, sent_by: A.user.id }]);
    toast(`${r.name} 발송 완료`, 'success');
  } catch(e) { toast('실패: ' + e.message, 'error'); }
}

// ══════════════════════════════════════════
//  SETTINGS — app_config DB 저장/로드
// ══════════════════════════════════════════
async function saveConfig(key, value) {
  if (!isAdmin()) { toast('admin만 설정 변경 가능합니다.', 'error'); return; }
  const { error } = await DB('app_config').update({ value, updated_at: new Date().toISOString(), updated_by: A.user.id }).eq('key', key);
  if (error) { toast('저장 실패: ' + error.message, 'error'); return; }
  A.config[key] = value;
  toast(`설정 저장됨`, 'success');
}

async function testBot() {
  const el = document.getElementById('bot-result'); el.innerHTML = '<span class="loading"></span>테스트 중...';
  try { const b = await tg('getMe'); el.innerHTML = `<span style="color:var(--green)">✓ @${b.username} (${b.first_name})</span>`; }
  catch(e) { el.innerHTML = `<span style="color:var(--red)">✗ ${e.message}</span>`; }
}

// ══════════════════════════════════════════
//  TEAM MANAGEMENT
// ══════════════════════════════════════════
function pTeam() {
  if (!isAdmin()) return `<div style="padding:2rem;text-align:center;color:var(--text3);font-size:13px">admin만 접근 가능합니다.</div>`;
  return `
  <div style="max-width:720px">
    <!-- 역할 설명 카드 -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:1.5rem">
      ${[
        { role:'admin', label:'관리자', color:'var(--tg)', bg:'rgba(42,171,238,.1)', perms:['모든 기능', '삭제·설정·팀원관리', '봇 설정 변경'] },
        { role:'editor', label:'에디터', color:'var(--green)', bg:'rgba(45,206,137,.1)', perms:['채팅방·종목 추가/수정', '공지 발송·동기화', '봇 재로드'] },
        { role:'viewer', label:'뷰어', color:'var(--text2)', bg:'rgba(255,255,255,.04)', perms:['모든 페이지 조회', '수정·발송 불가', '읽기 전용'] },
      ].map(r => `
      <div style="background:${r.bg};border:1px solid var(--border);border-radius:var(--radius);padding:1rem">
        <div style="font-size:13px;font-weight:600;color:${r.color};margin-bottom:.5rem">${r.label}</div>
        ${r.perms.map(p => `<div style="font-size:11px;color:var(--text2);padding:2px 0;display:flex;gap:5px;align-items:center">
          <span style="width:4px;height:4px;border-radius:50%;background:${r.color};flex-shrink:0"></span>${p}
        </div>`).join('')}
      </div>`).join('')}
    </div>

    <!-- 팀원 목록 -->
    <div class="card">
      <div class="card-header">
        <span class="card-title">팀원 목록</span>
        <button class="btn btn-sm" onclick="loadTeam()">새로고침</button>
      </div>
      <div id="team-list" style="padding:.5rem 0">
        <div style="padding:1.5rem;text-align:center;color:var(--text3)"><span class="loading"></span></div>
      </div>
    </div>
  </div>`;
}

async function loadTeam() {
  const el = document.getElementById('team-list');
  if (!el) return;

  const { data, error } = await DB('app_users').select('*').order('created_at');
  if (error) {
    el.innerHTML = `<div style="padding:1rem;color:var(--red);font-size:13px">${error.message}</div>`;
    return;
  }

  const roleMeta = {
    admin:  { label:'관리자', color:'var(--tg)',    bg:'rgba(42,171,238,.12)' },
    editor: { label:'에디터', color:'var(--green)', bg:'rgba(45,206,137,.12)' },
    viewer: { label:'뷰어',   color:'var(--text3)', bg:'rgba(255,255,255,.06)' },
  };

  el.innerHTML = data.map(u => {
    const m = roleMeta[u.role] || roleMeta.viewer;
    const initials = (u.name || u.email).slice(0,2).toUpperCase();
    const isMe = u.id === A.user.id;
    const lastLogin = u.last_login
      ? new Date(u.last_login).toLocaleString('ko-KR', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})
      : '없음';

    return `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid var(--border)">
      <!-- 아바타 -->
      <div style="width:36px;height:36px;border-radius:50%;background:${m.bg};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;color:${m.color};flex-shrink:0">${initials}</div>

      <!-- 이름/이메일 -->
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:500;display:flex;align-items:center;gap:6px">
          ${u.name || '—'}
          ${isMe ? `<span style="font-size:10px;padding:1px 6px;border-radius:100px;background:rgba(42,171,238,.15);color:var(--tg)">나</span>` : ''}
        </div>
        <div style="font-size:11px;color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${u.email}</div>
      </div>

      <!-- 마지막 로그인 -->
      <div style="font-size:11px;color:var(--text3);text-align:right;min-width:90px;display:none" class="team-col-time">${lastLogin}</div>

      <!-- 역할 배지 / 변경 -->
      <div style="flex-shrink:0">
        ${isAdmin() && !isMe ? `
        <div style="position:relative">
          <select onchange="changeRole('${u.id}',this.value)"
            style="appearance:none;-webkit-appearance:none;font-size:12px;font-weight:500;padding:4px 24px 4px 10px;border-radius:100px;border:1px solid var(--border);background:${m.bg};color:${m.color};cursor:pointer;font-family:inherit">
            <option value="admin"  ${u.role==='admin' ?'selected':''}>관리자</option>
            <option value="editor" ${u.role==='editor'?'selected':''}>에디터</option>
            <option value="viewer" ${u.role==='viewer'?'selected':''}>뷰어</option>
          </select>
          <svg style="position:absolute;right:8px;top:50%;transform:translateY(-50%);pointer-events:none;width:10px;height:10px;opacity:.5" viewBox="0 0 10 10" fill="none">
            <path d="M2 4l3 3 3-3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        ` : `
        <span style="font-size:12px;font-weight:500;padding:4px 12px;border-radius:100px;background:${m.bg};color:${m.color}">${m.label}</span>
        `}
      </div>
    </div>`;
  }).join('') +
  `<div style="padding:.75rem 1rem;font-size:11px;color:var(--text3)">
    총 ${data.length}명 · 본인 역할은 변경 불가
  </div>`;

  // 화면 넓으면 마지막 로그인 표시
  if (window.innerWidth >= 600) {
    el.querySelectorAll('.team-col-time').forEach(e => e.style.display = 'block');
  }
}

async function changeRole(userId, role) {
  if (!isAdmin()) { toast('권한 없음', 'error'); return; }
  const { error } = await DB('app_users').update({ role }).eq('id', userId);
  if (error) { toast('변경 실패: ' + error.message, 'error'); return; }
  toast('역할 변경됨', 'success');
  loadTeam();
}

// ══════════════════════════════════════════
//  NAVIGATION & RENDER
// ══════════════════════════════════════════
