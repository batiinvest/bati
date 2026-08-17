-- exclude_border_6_rollback.sql
-- exclude_border_6.sql 원복 — 6종을 industry='반도체' + 직전 sub_industry 로 복원

BEGIN;
UPDATE companies SET industry='반도체', sub_industry='소재'       WHERE code='089980'; -- 상아프론테크
UPDATE companies SET industry='반도체', sub_industry='전공정장비' WHERE code IN ('011930','071280','079370'); -- 신성이엔지, 로체시스템즈, 제우스
UPDATE companies SET industry='반도체', sub_industry='후공정장비' WHERE code='078150'; -- HB테크놀러지
UPDATE companies SET industry='반도체', sub_industry='부품'       WHERE code='083500'; -- 에프엔에스테크
COMMIT;
