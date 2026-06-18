-- =====================================================================
--  매매 복기 (트레이드 저널) — 청산한 포지션의 회고 기록
--  Supabase SQL Editor에서 1회 실행하세요.
--  이 테이블이 없어도 투자노트는 정상 동작하며, 복기 기능만 비활성화됩니다.
-- =====================================================================

create table if not exists trade_journal (
  id            bigserial primary key,
  stock_code    text not null,
  corp_name     text,
  watchlist_id  bigint,                                      -- watchlist.id 참조 (느슨한 연결)
  closed_date   date,                                        -- 청산일(마지막 매도일)
  sell_reason   text,                                        -- 매도 사유 태그
  did_well      text,                                        -- 잘한 점
  did_poorly    text,                                        -- 아쉬운 점
  lesson        text,                                        -- 교훈(다음 거래에 적용)
  process_score integer check (process_score between 1 and 5),  -- 프로세스 점수(결과와 무관)
  -- 청산 시점 스냅샷 (거래내역이 나중에 바뀌어도 복기 시점 값 보존)
  realized      numeric,                                     -- 실현손익(원)
  return_pct    numeric,                                     -- 수익률(%)
  hold_days     integer,                                     -- 보유기간(일)
  avg_buy       numeric,                                     -- 평균 진입가
  avg_sell      numeric,                                     -- 평균 청산가
  thesis        text,                                        -- 당시 진입 근거 스냅샷
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index if not exists idx_journal_stock on trade_journal (stock_code);

-- RLS: 클라이언트(anon/authenticated)에서 읽기·쓰기 허용
-- (Table Editor로 만들면 RLS가 켜진 채 정책이 없어 insert가 막힘 → 아래 정책 필요)
alter table trade_journal enable row level security;
drop policy if exists "journal_all" on trade_journal;
create policy "journal_all" on trade_journal
  for all to anon, authenticated
  using (true) with check (true);
