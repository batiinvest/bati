-- =====================================================================
--  market_data 죽은 컬럼 4개 제거 (2026-09-25)
--  Supabase SQL Editor에서 1회 실행하세요. drop_vwap.sql과 같은 성격입니다.
--
--  네 컬럼 모두 2,589행 전량이 NULL이었고, 수집·화면 참조를 먼저 걷어냈습니다.
--
--  ▸ dps (주당배당금)
--    KIS inquire-price의 dps를 받아 적었지만 값이 한 번도 들어온 적이 없고,
--    프론트에서 읽는 곳도 없었다.
--
--  ▸ is_caution (투자유의)
--    KIS invt_caful_yn을 'Y' 비교해 담았는데, **투자주의로 지정된 종목에서도
--    이 필드가 'N'으로 온다**(2026-09-25 실측: 형지I&C·우성머티리얼스·SFA반도체·
--    성호전자 — 모두 mrkt_warn_cls_code='01'인데 invt_caful_yn='N').
--    같은 정보를 market_warn_code가 담으므로(01 주의·02 경고·03 위험예고,
--    09-23 기준 41종목) 정보 손실이 없다. 오히려 종목 상세 모달의 경보 배지가
--    이 컬럼에 묶여 한 번도 뜨지 않았는데, market_warn_code로 교체해 되살렸다.
--
--  ▸ short_balance_qty / short_balance_ratio (공매도 잔고)
--    공매도는 collect_short.py가 별도 테이블 short_selling_history에 수집한다.
--    market_data 쪽 두 컬럼은 채우는 코드 자체가 없었다.
--
--  [안전]
--  프론트는 market_data를 select('*') 또는 컬럼 명시로 읽는데, 명시 목록에서도
--  이미 제거했다. 백엔드 참조는 grep 0건.
--  DROP COLUMN은 공간을 즉시 회수하지 않는다(회수하려면 VACUUM FULL — 이 크기엔 불필요).
-- =====================================================================

alter table market_data drop column if exists dps;
alter table market_data drop column if exists is_caution;
alter table market_data drop column if exists short_balance_qty;
alter table market_data drop column if exists short_balance_ratio;
