-- =====================================================================
--  market_data 기간 수익률 일괄 UPDATE — collect_market.calculate_returns 용
--  Supabase SQL Editor에서 1회 실행하세요.
--  이 함수가 없어도 동작합니다 — 없으면 기존 행 단위 UPDATE로 자동 폴백합니다.
--
--  [왜 RPC인가]
--  PostgREST의 부분 컬럼 upsert(on_conflict)는 INSERT 후보 행을 먼저 만들어
--  NOT NULL을 충돌 판정보다 **먼저** 검사한다. market_data.corp_name이 NOT NULL이라
--  수익률 4개만 담은 payload는 23502로 실패한다(2026-09 실측).
--  그래서 기존 구현은 행 단위 UPDATE를 돌았고, 2,577종목에 약 317초가 걸렸다
--  (행당 127ms). 이 함수는 한 문장으로 끝내 수 초로 줄인다.
--
--  [안전]
--  UPDATE ... FROM 이라 존재하지 않는 (stock_code, base_date)는 그냥 매칭되지 않는다.
--  즉 스켈레톤 행을 만들지 않는다 — 기존 batch_update_existing의 존재 확인과 같은 효과.
-- =====================================================================

create or replace function bulk_update_market_returns(payload jsonb)
returns integer
language plpgsql
as $$
declare
  n integer;
begin
  update market_data m
     set week_return    = nullif(p.value ->> 'week_return',    '')::numeric,
         month_return   = nullif(p.value ->> 'month_return',   '')::numeric,
         quarter_return = nullif(p.value ->> 'quarter_return', '')::numeric,
         year_return    = nullif(p.value ->> 'year_return',    '')::numeric,
         updated_at     = now()
    from jsonb_array_elements(payload) as p
   where m.stock_code = p.value ->> 'stock_code'
     and m.base_date  = (p.value ->> 'base_date')::date;
  get diagnostics n = row_count;
  return n;
end;
$$;

comment on function bulk_update_market_returns(jsonb) is
  'market_data 기간수익률 일괄 갱신. 부분 upsert가 corp_name NOT NULL로 막혀(23502) 도입.';
