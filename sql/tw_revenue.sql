-- 대만 월별 매출(AI·반도체 공급망) — 태린이아빠 대시보드 이식 4 (2026-11-12)
-- Supabase SQL Editor에서 한 번 실행. 여러 번 실행해도 안전합니다.
-- 백엔드 collect_tw_revenue.py (매일 21:10, 대만 MOPS 공식 월매출 · 올해 포함 최근 4개 연도 보관)

-- 1) 월매출 — 종목 × 달
create table if not exists tw_monthly_revenue (
  ticker  text not null,        -- 대만 종목 코드 (예: 2330)
  ym      date not null,        -- 실적 달의 1일 (예: 2026-10-01)
  market  text,                 -- TWSE(상장) | TPEX(장외)
  revenue bigint,               -- 그달 매출, 천 대만달러 (화면은 ÷1000 = 백만 대만달러)
  mom     numeric,              -- 전월 대비 % (공식 값)
  yoy     numeric,              -- 전년 같은 달 대비 % (공식 값)
  primary key (ticker, ym)
);
create index if not exists tw_monthly_revenue_ym_idx on tw_monthly_revenue (ym);

alter table tw_monthly_revenue enable row level security;
drop policy if exists "tw_monthly_revenue_read" on tw_monthly_revenue;
create policy "tw_monthly_revenue_read" on tw_monthly_revenue for select to anon, authenticated using (true);

-- 2) 밸류체인 · 종목 목록 — 백엔드가 통째로 올린다(한 종목이 두 밸류체인에 들어갈 수 있음)
create table if not exists tw_revenue_universe (
  category text not null,       -- 밸류체인 이름
  cat_ord  smallint not null,   -- 밸류체인 순서
  ord      smallint not null,   -- 밸류체인 안 종목 순서
  ticker   text not null,
  name     text not null,
  primary key (category, ticker)
);

alter table tw_revenue_universe enable row level security;
drop policy if exists "tw_revenue_universe_read" on tw_revenue_universe;
create policy "tw_revenue_universe_read" on tw_revenue_universe for select to anon, authenticated using (true);
