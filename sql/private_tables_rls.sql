-- private_tables_rls.sql — 로그인 없이 공개 키로 읽히던(일부는 쓰이던) 개인·유료 정보 테이블 잠그기
-- ⚠️ 초안 — Supabase SQL Editor에서 수동 실행 (2026-10-28 프론트 점검 🔴5)
--
-- 배경 (10-28 공개 키 실측 — 로그인 없이 REST로 조회):
--   pro_members     유료 회원 실명·텔레그램 ID·만료일·메모가 읽힘 (1행)
--   watchlist       보유·관심 종목·평단·수량이 읽힘 (6행)
--   rooms           '유료 입장' 방 4곳의 초대 링크까지 읽힘 (79행)
--   portfolio_flows·trade_journal
--                   portfolio_book.sql·trade_journal.sql의 정책이 `for all to anon, authenticated using (true)`
--                   = 로그인 없이 읽기·쓰기·삭제까지 가능 (지금은 비어 있어 0행으로 보였을 뿐)
--   app_config·app_users는 이미 막혀 있음 → app_config_rls.sql의 is_editor()·is_admin() 함수를 그대로 쓴다
--
-- ── 실행 전 확인 (중요) ─────────────────────────────────────────────────────────
--   1) 백엔드(dart-server ~/.env)의 Supabase 키가 service_role(secret) 키인지.
--      service_role은 RLS를 무시하므로 봇·수집기는 영향 없음. anon/publishable 키라면
--      이 SQL 뒤 봇이 이 테이블들을 못 읽는다. (db_client.py는 SB_SERVICE_KEY /
--      SUPABASE_SERVICE_ROLE_KEY / SUPABASE_KEY / SB_KEY 중 하나 — 값이 sb_secret_… 이거나
--      JWT의 role이 service_role이면 OK)
--   2) 아래 [0] 점검 쿼리로 지금 정책을 먼저 확인(실행 뒤 다시 돌려 비교).
--   3) app_config_rls.sql이 실행돼 is_editor()·is_admin()이 있는지 — [0]의 마지막 쿼리.
--
-- ── 프론트 영향 (권한 = app_users.role) ──────────────────────────────────────────
--   pro_members  admin만 (프로 채널 화면은 원래 admin 전용)
--   rooms        읽기·쓰기 editor 이상, 삭제 admin. viewer는 채팅방 메뉴가 없어 영향 없음
--                (부팅 때 loadRooms가 빈 목록을 받을 뿐 오류 아님)
--   watchlist · portfolio_flows · trade_journal · portfolio_nav
--                읽기 = 로그인 사용자 전체 (A안 — 지금처럼 viewer도 시황 '내 종목 현황'에 소유자 종목이 보임)
--                쓰기 = editor 이상 (viewer가 종목 상세 창에서 '관심 추가'를 누르면 이제 실패 토스트)
--                → viewer에게도 숨기려면 [2]의 B안 주석을 풀 것. 그러면 viewer의 '내 종목 현황'은
--                  "보유/관심 종목을 추가하면…" 안내만 보임(카드 자체 숨김은 프론트 후속 작업)
--
-- 같은 테이블의 기존 정책은 OR로 합쳐져 하나라도 열려 있으면 그대로 열리므로, 아래는 대상 테이블의
-- 기존 정책을 모두 지우고 새로 만든다. 재실행 안전.

-- ═════════════════════════════════════════════════════════════════════════════
-- [0] 점검 — 실행 전후 비교
-- ═════════════════════════════════════════════════════════════════════════════
select tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('pro_members','rooms','watchlist','portfolio_flows','portfolio_nav','trade_journal','app_users')
order by tablename, policyname;

select c.relname as table_name, c.relrowsecurity as rls_on
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('pro_members','rooms','watchlist','portfolio_flows','portfolio_nav','trade_journal');

select proname from pg_proc where proname in ('is_editor', 'is_admin');   -- 둘 다 나와야 진행

-- ═════════════════════════════════════════════════════════════════════════════
-- 공용: 대상 테이블의 기존 정책 전부 제거 + RLS 켜기 + anon 권한 회수
-- ═════════════════════════════════════════════════════════════════════════════
do $$
declare
  t text;
  p record;
begin
  foreach t in array array['pro_members','rooms','watchlist','portfolio_flows','portfolio_nav','trade_journal'] loop
    execute format('alter table public.%I enable row level security', t);
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('revoke all on public.%I from anon', t);   -- 로그인 없이는 아예 못 건드리게(이중 잠금)
  end loop;
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- [1] pro_members — admin만
-- ═════════════════════════════════════════════════════════════════════════════
create policy pro_members_admin on public.pro_members
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ═════════════════════════════════════════════════════════════════════════════
-- [2] 투자노트 4종 — 읽기 로그인 전체(A안), 쓰기 editor 이상
-- ═════════════════════════════════════════════════════════════════════════════
do $$
declare t text;
begin
  foreach t in array array['watchlist','portfolio_flows','trade_journal'] loop
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_select', t);
    -- B안(viewer에게도 숨김): 위 줄 대신 아래 줄
    -- execute format('create policy %I on public.%I for select to authenticated using (public.is_editor())', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_editor())', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_editor()) with check (public.is_editor())', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_editor())', t || '_delete', t);
  end loop;
end $$;

-- 일별 기준가 — 백엔드(service_role)만 씀, 프론트는 읽기만
create policy portfolio_nav_select on public.portfolio_nav
  for select to authenticated using (true);
  -- B안: using (public.is_editor())

-- ═════════════════════════════════════════════════════════════════════════════
-- [3] rooms — 읽기·추가·수정 editor 이상, 삭제 admin (유료방 초대 링크 보호)
-- ═════════════════════════════════════════════════════════════════════════════
create policy rooms_select on public.rooms
  for select to authenticated using (public.is_editor());
create policy rooms_insert on public.rooms
  for insert to authenticated with check (public.is_editor());
create policy rooms_update on public.rooms
  for update to authenticated using (public.is_editor()) with check (public.is_editor());
create policy rooms_delete on public.rooms
  for delete to authenticated using (public.is_admin());

-- ═════════════════════════════════════════════════════════════════════════════
-- [검증] 실행 뒤
-- ═════════════════════════════════════════════════════════════════════════════
--   1) [0] 점검 쿼리를 다시 돌려 정책이 위대로 바뀌었는지
--   2) 로그아웃한 브라우저(또는 시크릿 창)에서 사이트를 열고 콘솔에:
--        await sb.from('pro_members').select('id').limit(1)   → error(permission denied) 또는 data []
--        await sb.from('watchlist').select('id').limit(1)     → 같음
--        await sb.from('rooms').select('link').limit(1)       → 같음
--   3) admin 로그인: 프로 채널 회원 목록·채팅방 관리·투자노트가 그대로 보이고 저장되는지
--   4) viewer 로그인: 시황 '내 종목 현황'이 보이는지(A안), 채팅방 메뉴 없음
--   5) 봇 로그에 위 테이블 관련 권한 오류(42501·permission denied)가 없는지
--
-- ═════════════════════════════════════════════════════════════════════════════
-- [참고] 이 SQL 밖에서 따로 볼 것 (실행하지 않는 점검 쿼리)
-- ═════════════════════════════════════════════════════════════════════════════
-- 로그인 없이(anon) 쓰기가 열린 다른 테이블 — companies·dart_reports 등 프론트가 쓰는 테이블 확인용
-- select tablename, policyname, cmd from pg_policies
--  where schemaname = 'public' and 'anon' = any(roles) and cmd in ('ALL','INSERT','UPDATE','DELETE')
--  order by tablename;
--
-- RLS가 꺼진 테이블 (anon 권한이 있으면 로그인 없이 읽기·쓰기 모두 가능)
-- select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
--  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity order by 1;
--
-- app_users — 가입 때 프론트가 role:'viewer'로 본인 행을 upsert한다. 본인 행 update 정책이
-- role까지 바꾸게 열려 있으면 viewer가 스스로 admin이 될 수 있으니 [0]의 app_users 정책을 확인.
