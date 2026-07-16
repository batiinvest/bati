-- =====================================================================
--  신용공여 잔고 추이 (KOFIA freesis) — collect_credit_balance.py가 매일 수집
--  Supabase SQL Editor에서 1회 실행하세요.
--  이 테이블이 없어도 앱은 정상 동작합니다.
--  출처: 금융투자협회 종합통계 > 주식 > 신용공여현황 > 신용공여 잔고 추이
--  단위: 백만원 (KOFIA 표시 단위와 동일). 결제일 기준, 전 영업일 데이터가 다음날 발표.
-- =====================================================================

create table if not exists credit_balance_history (
  base_date          date primary key,
  loan_total         bigint,   -- 신용거래융자 전체 (백만원)
  loan_kospi         bigint,   -- 신용거래융자 유가증권
  loan_kosdaq        bigint,   -- 신용거래융자 코스닥
  stock_loan_total   bigint,   -- 신용거래대주 전체
  stock_loan_kospi   bigint,   -- 신용거래대주 유가증권
  stock_loan_kosdaq  bigint,   -- 신용거래대주 코스닥
  subscription_loan  bigint,   -- 청약자금대출
  secured_loan       bigint,   -- 예탁증권담보융자
  collected_at       timestamptz default now()
);

-- RLS: 쓰기는 서버(service key, RLS 우회)만 — 클라이언트는 읽기 전용
alter table credit_balance_history enable row level security;

drop policy if exists "credit_balance_read" on credit_balance_history;
create policy "credit_balance_read" on credit_balance_history
  for select to anon, authenticated using (true);
