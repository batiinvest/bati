-- exclude_border_6.sql
-- 경계 검토 6종(타산업 비중 큼)을 반도체에서 제외 (best-fit 산업 이동, sub_industry 초기화)
-- 생성: 2026-08-17 / 짝: exclude_border_6_rollback.sql / 서버 SB_SERVICE_KEY REST PATCH 적용

BEGIN;
UPDATE companies SET industry='2차전지', sub_industry=NULL WHERE code='089980'; -- 상아프론테크: 2차전지/불소수지 부품
UPDATE companies SET industry='신재생',  sub_industry=NULL WHERE code='011930'; -- 신성이엔지: 태양전지·모듈
UPDATE companies SET industry='테크',    sub_industry=NULL WHERE code IN ('078150','083500','071280','079370'); -- HB테크놀러지·에프엔에스테크·로체시스템즈·제우스: 디스플레이 장비
COMMIT;

-- 확인
SELECT code, name, industry, sub_industry FROM companies
 WHERE code IN ('089980','011930','078150','083500','071280','079370')
 ORDER BY industry, name;
