-- =====================================================================
--  액티브 ETF 관찰 — 구성종목(PDF) 일별 (2026-10-04)
--  Supabase SQL Editor에서 1회 실행하세요.
--  실행 전에도 앱·백엔드는 동작합니다 — '액티브 ETF' 페이지만 '준비 중'으로 나옵니다.
--
--  [원본] 태린이아빠 「액티브ETF를 관찰하자」 — ETF 30개의 CU당 구성종목을 두 날짜로 받아
--    종목마다 현재 비중 · 과거 비중 · 비중차이 · 증가율(과거에 없으면 '신규편입')을 본다.
--  수집: 백엔드 collect_active_etf.py (평일 19:35, KRX 정보데이터시스템 ETF PDF)
--  비교 계산은 화면(js/active-etf.js)이 한다.
-- =====================================================================

create table if not exists active_etfs (
  code       text primary key,   -- 단축코드 (예: 0162Y0)
  isin       text,               -- 표준코드
  name       text not null,      -- KRX 약칭
  grp        text not null,      -- 원본 요약 시트(탭) 이름
  grp_ord    int  not null,      -- 탭 순서
  ord        int  not null,      -- 탭 안 순서
  updated_at timestamptz not null default now()
);

create table if not exists active_etf_holdings (
  base_date  date    not null,
  etf_code   text    not null,
  item_code  text    not null,   -- 구성종목 코드 (주식 6자리, 원화현금 KRD010010001)
  item_name  text,
  mkt        text,               -- KRX 시장 STK(코스피)·KSQ(코스닥)·없음(현금 등)
  shares     numeric,            -- CU당 주식수
  amount     bigint,             -- 금액(원)
  weight     numeric,            -- 금액기준 구성비중(%)
  seq        int,                -- KRX가 준 순서(금액 큰 순)
  primary key (base_date, etf_code, item_code)
);
create index if not exists active_etf_holdings_etf_date on active_etf_holdings (etf_code, base_date);

alter table active_etfs enable row level security;
drop policy if exists "active_etfs_read" on active_etfs;
create policy "active_etfs_read" on active_etfs for select to anon, authenticated using (true);

alter table active_etf_holdings enable row level security;
drop policy if exists "active_etf_holdings_read" on active_etf_holdings;
create policy "active_etf_holdings_read" on active_etf_holdings for select to anon, authenticated using (true);
