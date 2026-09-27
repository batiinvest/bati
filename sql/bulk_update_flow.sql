-- =====================================================================
--  market_data 외국인·기관 순매수 일괄 UPDATE — collect_flow_empty 용 (2026-09-27)
--  Supabase SQL Editor에서 1회 실행하세요.
--  이 함수가 없어도 동작합니다 — 없으면 행 단위 UPDATE로 자동 폴백합니다(느릴 뿐).
--
--  [왜 필요한가]
--  빈집 판정을 전종목으로 넓히면서 매일 전 상장사의 최근 30거래일 수급을 KIS와 맞춘다.
--  KRX가 수급을 며칠 안에 고치기 때문이다(18:15 수집값 ≠ 최종값, 09-27 실측 88% 불일치).
--  하루 수천 행, 최초 백필은 약 14만 행이라 행 단위 UPDATE(행당 ~130ms)로는 수십 분이 걸린다.
--  부분 컬럼 upsert는 corp_name NOT NULL(23502) 때문에 못 쓴다 — bulk_update_returns와 같은 사정.
--
--  [안전]
--  UPDATE ... FROM 이라 존재하지 않는 (stock_code, base_date)는 매칭되지 않는다(스켈레톤 행 없음).
-- =====================================================================

create or replace function bulk_update_market_flow(payload jsonb)
returns integer
language plpgsql
as $$
declare
  n integer;
begin
  update market_data m
     set foreign_net_buy     = nullif(p.value ->> 'foreign_net_buy',     '')::bigint,
         institution_net_buy = nullif(p.value ->> 'institution_net_buy', '')::bigint,
         updated_at          = now()
    from jsonb_array_elements(payload) as p
   where m.stock_code = p.value ->> 'stock_code'
     and m.base_date  = (p.value ->> 'base_date')::date;
  get diagnostics n = row_count;
  return n;
end;
$$;

comment on function bulk_update_market_flow(jsonb) is
  'market_data 외국인·기관 순매수 일괄 갱신. 전종목 수급 정산(collect_flow_empty.sync_recent·backfill)용.';
