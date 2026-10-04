-- =====================================================================
--  투자노트 → 원본 포트폴리오 표 (태린이아빠 「포트폴리오 관리샘플」 국장 시트) — 2026-10-04
--  Supabase SQL Editor에서 1회 실행하세요.
--
--  원본 열 중 사람이 넣는 것: 현재포트 · 목표비중 · 현보유(수량) · 매입가 (+ 아래 묶음, 위 헤지 칸)
--    현보유 = watchlist.quantity, 매입가 = watchlist.avg_price (기존 열 그대로 사용)
--  기준가 = 순자산 ÷ 좌수 × 1000. 순자산 = Σ(현보유 × 현재가) + 현금 — 매일 자동(백엔드 collect_portfolio_nav.py)
--  좌수는 입출금 때만 바뀐다: 그때 기준가로 좌수를 늘리고 줄인다(portfolio_flows) — 원본에 없는 부분(사용자 결정)
-- =====================================================================

alter table watchlist add column if not exists target_weight numeric;              -- 목표비중(%)
alter table watchlist add column if not exists cur_port      numeric;              -- 현재포트(%)
alter table watchlist add column if not exists bucket        text;                 -- 묶음(원본 아래 묶음별 목표비중 합)
alter table watchlist add column if not exists hedge         boolean default false; -- 원본 위 헤지 칸(인버스·레버리지 ETF)
alter table watchlist add column if not exists opened_at     date;                 -- 현보유가 생긴 날(청산 기록 보유기간)

-- 입출금 — 좌수 변화 기록
create table if not exists portfolio_flows (
  id         bigserial primary key,
  flow_date  date    not null default current_date,
  amount     numeric not null,          -- 입금 + / 출금 − (원)
  units      numeric not null,          -- 좌수 변화 = amount ÷ (그때 기준가 ÷ 1000)
  price      numeric,                   -- 그때 기준가
  memo       text,
  created_at timestamptz default now()
);

-- 일별 순자산·기준가 (평일 장 마감 뒤)
create table if not exists portfolio_nav (
  base_date   date primary key,
  stock_value numeric,                  -- 주식평가액 Σ(현보유 × 종가)
  cash        numeric,                  -- 현금잔고
  nav         numeric,                  -- 순자산
  units       numeric,                  -- 좌수
  price       numeric,                  -- 기준가
  detail      jsonb,                    -- 종목별 {code: [수량, 종가]} — ETF 등 시세 없는 종목 가격도 여기
  updated_at  timestamptz not null default now()
);

alter table portfolio_flows enable row level security;
drop policy if exists "pflows_all" on portfolio_flows;
create policy "pflows_all" on portfolio_flows for all to anon, authenticated using (true) with check (true);

alter table portfolio_nav enable row level security;
drop policy if exists "pnav_read" on portfolio_nav;
create policy "pnav_read" on portfolio_nav for select to anon, authenticated using (true);
