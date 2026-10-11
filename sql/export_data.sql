-- =====================================================================
--  수출 데이터 — 관세청 품목·국가·시군구 월별 수출입 (2026-10-11)
--  Supabase SQL Editor에서 1회 실행하세요. 다시 실행해도 안전합니다.
--  실행 전에도 앱·백엔드는 동작합니다 — '수출 데이터' 페이지만 '준비 중'으로 나옵니다.
--
--  [원본] 태린이아빠 「주요품목별수출정리」 9월 잠정(품목·국가) · 8월 확정(공장 시군구) 워크북
--    일평균수출 = 금액 ÷ 영업일수, 판가 = 금액 ÷ 중량, 월 MoM·YoY, 분기 일평균(3달 평균)·QoQ·YoY
--  수집: 백엔드 collect_exports.py (관세청 공공데이터 API, 매월 15일경 전월 확정치) — 목록은 export_items.py
--  잠정치(1·11·21일): TRASS에서 조회한 표를 관리자가 화면에 붙여넣음 → export_prelim (관리자만 읽기·쓰기)
-- =====================================================================

-- 역할 판별 (app_config_rls.sql과 같은 정의 — 이미 있으면 그대로 덮어씀)
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from app_users u where u.id = auth.uid() and u.role = 'admin');
$$;

-- 수집 목록 (백엔드가 export_items.py로 매번 덮어씀)
create table if not exists export_items (
  id         text primary key,            -- p002 (9월 잠정 시트 순번) · f003 (8월 확정 시트 순번)
  tab        text not null,               -- p 품목·국가 / f 공장·지역
  ord        int  not null,               -- 원본 시트 순서
  name       text not null,
  co         text,                        -- 관련 기업 (원본 메모)
  note       text,
  flow       text not null default 'exp', -- exp 수출 / imp 수입
  parts      jsonb not null,              -- [{"hs":"8542321010","cn":"","rg":""}, {"hs":"741021","cn":"","rg":"충북 증평군"}]
  orig       jsonb,                       -- 원본 시트 이름들 (합친 경우 여럿)
  orig_last  text,                        -- 원본 마지막 갱신 월
  updated_at timestamptz not null default now()
);

-- 관세청 월별 원자료 (부분 하나 = 계열 하나)
create table if not exists export_monthly (
  lvl        text not null,               -- nat 전국 품목 / cnty 품목×국가 / sgg 6자리×시군구 / total 총수출
  hs         text not null,               -- HS 4·6·10자리 (sgg는 원본 표기 그대로: 4자리면 6자리 하위 합)
  area       text not null default '',    -- '' · 국가코드(US) · '충북 증평군'
  ym         text not null,               -- 'YYYY-MM'
  exp_usd    numeric,                     -- 수출 금액(달러)
  exp_wgt    numeric,                     -- 수출 중량(kg) — sgg는 없음(비공개)
  imp_usd    numeric,
  imp_wgt    numeric,
  updated_at timestamptz not null default now(),
  primary key (lvl, hs, area, ym)
);
create index if not exists export_monthly_ym on export_monthly (ym);

-- 영업일수 (일평균 분모) — 2022-01~2026-09는 원본 다수 분모, 이후는 백엔드가 거래일 달력(fear_greed_daily)으로 채움
create table if not exists export_workdays (
  ym   text primary key,
  days int  not null,
  src  text                                -- wb 원본 · cal 거래일 달력
);
insert into export_workdays (ym, days, src) values
('2022-01',20,'wb'),('2022-02',18,'wb'),('2022-03',22,'wb'),('2022-04',21,'wb'),('2022-05',21,'wb'),('2022-06',21,'wb'),
('2022-07',21,'wb'),('2022-08',22,'wb'),('2022-09',20,'wb'),('2022-10',20,'wb'),('2022-11',22,'wb'),('2022-12',22,'wb'),
('2023-01',20,'wb'),('2023-02',20,'wb'),('2023-03',22,'wb'),('2023-04',20,'wb'),('2023-05',21,'wb'),('2023-06',21,'wb'),
('2023-07',21,'wb'),('2023-08',22,'wb'),('2023-09',19,'wb'),('2023-10',19,'wb'),('2023-11',22,'wb'),('2023-12',19,'wb'),
('2024-01',22,'wb'),('2024-02',19,'wb'),('2024-03',20,'wb'),('2024-04',21,'wb'),('2024-05',21,'wb'),('2024-06',19,'wb'),
('2024-07',23,'wb'),('2024-08',21,'wb'),('2024-09',18,'wb'),('2024-10',20,'wb'),('2024-11',21,'wb'),('2024-12',21,'wb'),
('2025-01',18,'wb'),('2025-02',20,'wb'),('2025-03',20,'wb'),('2025-04',22,'wb'),('2025-05',20,'wb'),('2025-06',19,'wb'),
('2025-07',23,'wb'),('2025-08',20,'wb'),('2025-09',22,'wb'),('2025-10',18,'wb'),('2025-11',20,'wb'),('2025-12',22,'wb'),
('2026-01',21,'wb'),('2026-02',17,'wb'),('2026-03',21,'wb'),('2026-04',22,'wb'),('2026-05',18,'wb'),('2026-06',21,'wb'),
('2026-07',22,'wb'),('2026-08',20,'wb'),('2026-09',20,'wb')
on conflict (ym) do nothing;
-- ※ 2025-07: 「8월 확정」 파일은 211시트 모두 19로 나눴지만(6월 값 복사) 실제 영업일은 23(「9월 잠정」·달력) → 23

-- TRASS 잠정치 붙여넣기 (관리자만) — 같은 달 확정치가 들어오면 화면은 확정치를 쓴다
create table if not exists export_prelim (
  hs         text not null,
  cn         text not null default '',    -- 국가코드 ('' = 전체)
  ym         text not null,               -- 'YYYY-MM'
  period     text not null,               -- '10' 1~10일 · '20' 1~20일 · 'm' 한 달
  flow       text not null default 'exp',
  usd        numeric,
  krw        numeric,
  wgt        numeric,
  created_at timestamptz not null default now(),
  primary key (hs, cn, ym, period, flow)
);

-- 원본 워크북 기록 (관리자만) — 공장·지역 시트의 과거 중량(2026-07까지)으로 '원본 판가'를 보여주는 데만 쓴다
create table if not exists export_wb (
  item_id text not null,
  ym      text not null,
  usd     numeric,
  wgt     numeric,
  primary key (item_id, ym)
);

alter table export_items enable row level security;
drop policy if exists "export_items_read" on export_items;
create policy "export_items_read" on export_items for select to anon, authenticated using (true);

alter table export_monthly enable row level security;
drop policy if exists "export_monthly_read" on export_monthly;
create policy "export_monthly_read" on export_monthly for select to anon, authenticated using (true);

alter table export_workdays enable row level security;
drop policy if exists "export_workdays_read" on export_workdays;
create policy "export_workdays_read" on export_workdays for select to anon, authenticated using (true);

-- TRASS 잠정치·원본 기록은 관리자만 (TRASS 약관: 조회한 정보를 타인에게 제공 금지)
alter table export_prelim enable row level security;
drop policy if exists "export_prelim_admin" on export_prelim;
create policy "export_prelim_admin" on export_prelim for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

alter table export_wb enable row level security;
drop policy if exists "export_wb_admin" on export_wb;
create policy "export_wb_admin" on export_wb for select to authenticated using (public.is_admin());
