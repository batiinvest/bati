-- =====================================================================
--  WICS 업종 분류 — collect_wics.py가 매일 수집 (네이버 증권 기준)
--  Supabase SQL Editor에서 1회 실행하세요.
--  이 컬럼이 없어도 앱은 정상 동작하며, 시장 현황 표의 '업종'만 비어 보입니다.
--
--  [축 구분]
--    업종(wics_*)  = 이 회사가 무슨 사업을 하나. 전 종목·표준 분류. ← 이 파일
--    테마(industry) = 어떤 투자 이야기로 묶이나. 일부 종목·큐레이션. (기존 컬럼 유지)
--  두 축은 서로 대체하지 않는다. 예) LG에너지솔루션 = 업종 '전기제품' / 테마 '2차전지'
--
--  wics_code는 GICS 호환 계층 구조라 앞자리로 상위 분류를 파생할 수 있다.
--    G453010 → 대분류 G45(IT) / 중분류 G4530(반도체) / 소분류 G453010(반도체와반도체장비)
--  대분류는 저장하지 않는다(파생값 중복 저장은 어긋날 소지만 만든다).
--
--  ※ nullable 필수: 상장폐지·정리매매 종목 등은 분류가 없다.
--    NOT NULL을 걸면 부분 갱신이 전량 실패한다(과거 market_data 사고 패턴).
-- =====================================================================

alter table companies add column if not exists wics_industry text;  -- '반도체와반도체장비'
alter table companies add column if not exists wics_code     text;  -- 'G453010'

-- 업종 필터·집계용 (소분류 조회가 주 용도)
create index if not exists idx_companies_wics on companies (wics_industry);

comment on column companies.wics_industry is 'WICS 소분류 업종명 (네이버 증권 기준, 79종). 테마인 industry 컬럼과 다른 축.';
comment on column companies.wics_code     is 'WICS 코드 (GICS 호환). 앞 3자리=대분류, 5자리=중분류.';
