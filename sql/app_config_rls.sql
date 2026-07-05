-- app_config_rls.sql — app_config 민감 키(tg_bot_token) 노출 차단
-- ⚠️ Supabase SQL Editor에서 수동 실행 필요 (1회)
--
-- 배경:
--   프론트 loadConfig()가 app_config 전체(key,value)를 로드하므로,
--   RLS가 없으면 viewer로 가입한 누구든 DevTools에서 A.config.tg_bot_token을
--   읽어 텔레그램 봇을 탈취할 수 있다.
--
-- 정책 설계:
--   SELECT — 민감 키는 admin/editor만, 나머지 키는 로그인 사용자 전체
--   INSERT/UPDATE —
--     · run_*_flag / reload_flag: 로그인 사용자 전체 (시황 새로고침 버튼이 viewer에게도 노출됨)
--     · 그 외 키: admin/editor만
--   DELETE — admin만
--
-- 실행 후 확인:
--   1) viewer 계정으로 로그인 → 콘솔에서 A.config.tg_bot_token === undefined 확인
--   2) viewer로 시황 '새로고침' 버튼 → 트리거 upsert 정상 동작 확인
--   3) admin으로 설정 페이지 저장 / 멤버 수 동기화 정상 동작 확인

-- ── 민감 키 목록 (필요 시 추가) ──────────────────────────────────────────────
-- tg_bot_token : 텔레그램 봇 토큰

alter table public.app_config enable row level security;

-- 기존 정책 제거 (재실행 안전)
drop policy if exists app_config_select        on public.app_config;
drop policy if exists app_config_insert        on public.app_config;
drop policy if exists app_config_update        on public.app_config;
drop policy if exists app_config_delete        on public.app_config;

-- 역할 판별 헬퍼 (app_users.role 기반)
create or replace function public.is_editor()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from app_users u
    where u.id = auth.uid() and u.role in ('admin', 'editor')
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from app_users u
    where u.id = auth.uid() and u.role = 'admin'
  );
$$;

-- SELECT: 민감 키는 editor 이상, 나머지는 로그인 사용자 전체
create policy app_config_select on public.app_config
  for select to authenticated
  using (
    key not in ('tg_bot_token')
    or public.is_editor()
  );

-- INSERT: 수집 트리거 플래그는 전체 허용, 그 외는 editor 이상
create policy app_config_insert on public.app_config
  for insert to authenticated
  with check (
    key like 'run\_%\_flag' escape '\'
    or key = 'reload_flag'
    or public.is_editor()
  );

-- UPDATE: 동일 기준
create policy app_config_update on public.app_config
  for update to authenticated
  using (
    key like 'run\_%\_flag' escape '\'
    or key = 'reload_flag'
    or public.is_editor()
  )
  with check (
    key like 'run\_%\_flag' escape '\'
    or key = 'reload_flag'
    or public.is_editor()
  );

-- DELETE: admin만
create policy app_config_delete on public.app_config
  for delete to authenticated
  using (public.is_admin());
