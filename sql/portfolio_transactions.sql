-- =====================================================================
--  포트폴리오 거래 기록 (매수/매도 로그)
--  Supabase SQL Editor에서 1회 실행하세요.
--  이 테이블이 있으면 watchlist의 평단가·수량·실현손익이 자동 계산됩니다.
-- =====================================================================

create table if not exists portfolio_transactions (
  id           bigserial primary key,
  watchlist_id bigint,                                   -- watchlist.id 참조 (느슨한 연결)
  stock_code   text not null,
  corp_name    text,
  trade_type   text not null check (trade_type in ('buy','sell')),  -- 매수/매도
  trade_date   date not null default current_date,
  price        numeric not null,                         -- 체결 단가(원)
  quantity     integer not null check (quantity > 0),    -- 수량(주)
  fee          numeric default 0,                        -- 수수료+세금(원)
  memo         text,
  created_at   timestamptz default now()
);

create index if not exists idx_ptx_stock on portfolio_transactions (stock_code);
create index if not exists idx_ptx_wl    on portfolio_transactions (watchlist_id);

-- RLS: 클라이언트(anon/authenticated)에서 읽기·쓰기 허용
-- (Table Editor로 만들면 RLS가 켜진 채 정책이 없어 insert가 막힘 → 아래 정책 필요)
alter table portfolio_transactions enable row level security;
drop policy if exists "ptx_all" on portfolio_transactions;
create policy "ptx_all" on portfolio_transactions
  for all to anon, authenticated
  using (true) with check (true);

-- 손절가 컬럼 (watchlist) — 리스크 관리용. 이미 있으면 무시됨.
alter table watchlist add column if not exists stop_price numeric;

-- 거래구분: 현금 / 신용(신용융자). 기존 거래는 모두 현금으로 간주. 이미 있으면 무시됨.
alter table portfolio_transactions
  add column if not exists trade_method text not null default 'cash'
  check (trade_method in ('cash','credit'));
