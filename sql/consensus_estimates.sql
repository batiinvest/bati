-- =====================================================================
--  미래 실적 추정치 (KIS 종목추정실적) — collect_estimates.py가 매일 18:40 수집
--  Supabase SQL Editor에서 1회 실행하세요.
--  이 테이블이 없어도 앱은 정상 동작하며, '오늘의 아이디어 > 전망' 탭만 비어 보입니다.
-- =====================================================================

-- 추정치 스냅샷 이력 — 애널리스트 추정일(est_date) 단위로 누적
create table if not exists consensus_estimates (
  id             bigserial primary key,
  stock_code     text not null,
  stock_name     text,
  fiscal_period  text not null,                 -- '2026.12' (연간 회계기간)
  is_estimate    boolean not null default false, -- true=추정(E), false=확정 실적
  revenue        numeric,                        -- 매출액 (억원)
  revenue_yoy    numeric,                        -- 매출 증감률 (%)
  op_profit      numeric,                        -- 영업이익 (억원)
  op_profit_yoy  numeric,                        -- 영업이익 증감률 (%)
  net_profit     numeric,                        -- 순이익 (억원)
  net_profit_yoy numeric,                        -- 순이익 증감률 (%)
  eps            numeric,                        -- EPS (원)
  per            numeric,                        -- PER (배)
  roe            numeric,                        -- ROE (%)
  est_date       date not null,                  -- 애널리스트 추정일 (KIS output1.estdate)
  opinion        text,                           -- 투자의견 (매수 등)
  analyst        text,                           -- 담당 애널리스트 (한국투자증권 리서치)
  collected_at   timestamptz default now(),
  unique (stock_code, fiscal_period, est_date)
);

create index if not exists idx_consensus_stock on consensus_estimates (stock_code);
create index if not exists idx_consensus_estdate on consensus_estimates (est_date);

-- 추정치 갱신(상향/하향) 감지 이력 — est_date가 바뀔 때 미래 연도 변화폭 기록
create table if not exists estimate_revisions (
  id                   bigserial primary key,
  stock_code           text not null,
  stock_name           text,
  fiscal_period        text not null,            -- 변화를 비교한 회계기간 ('2026.12')
  prev_est_date        date,                     -- 직전 추정일
  new_est_date         date not null,            -- 새 추정일
  revenue_prev         numeric,                  -- 직전 매출 추정 (억원)
  revenue_new          numeric,                  -- 새 매출 추정 (억원)
  revenue_change_pct   numeric,                  -- 매출 추정 변화율 (%)
  op_profit_prev       numeric,
  op_profit_new        numeric,
  op_profit_change_pct numeric,                  -- 영업이익 추정 변화율 (%)
  detected_at          timestamptz default now(),
  unique (stock_code, fiscal_period, new_est_date)
);

create index if not exists idx_revisions_date on estimate_revisions (new_est_date);

-- RLS: 쓰기는 서버(service key, RLS 우회)만 — 클라이언트는 읽기 전용
alter table consensus_estimates enable row level security;
alter table estimate_revisions enable row level security;

drop policy if exists "consensus_read" on consensus_estimates;
create policy "consensus_read" on consensus_estimates
  for select to anon, authenticated using (true);

drop policy if exists "revisions_read" on estimate_revisions;
create policy "revisions_read" on estimate_revisions
  for select to anon, authenticated using (true);
