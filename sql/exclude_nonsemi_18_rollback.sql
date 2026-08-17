-- exclude_nonsemi_18_rollback.sql
-- exclude_nonsemi_18.sql 원복 — 18종을 industry='반도체' + 원래 sub_industry 로 복원

BEGIN;
UPDATE companies SET industry='반도체', sub_industry='부품'     WHERE code IN ('060720','361390'); -- KH바텍, 제노코
UPDATE companies SET industry='반도체', sub_industry=NULL       WHERE code IN ('025000','232680','050890','051370','020760','033240'); -- KPX케미칼, 라온로보틱스, 쏠리드, 인터플렉스, 일진디스플, 자화전자
UPDATE companies SET industry='반도체', sub_industry='장비'     WHERE code='056190'; -- SFA
UPDATE companies SET industry='반도체', sub_industry='AI반도체' WHERE code='288980'; -- 모아데이타
UPDATE companies SET industry='반도체', sub_industry='소재'     WHERE code IN ('148150','073010'); -- 세경하이테크, 케이에스피
UPDATE companies SET industry='반도체', sub_industry='파츠/쿼츠' WHERE code='101240'; -- 씨큐브
UPDATE companies SET industry='반도체', sub_industry='MLCC'     WHERE code='149950'; -- 아바텍
UPDATE companies SET industry='반도체', sub_industry='통신장비' WHERE code='173130'; -- 오파스넷
UPDATE companies SET industry='반도체', sub_industry='AI'       WHERE code='402030'; -- 코난테크놀로지
UPDATE companies SET industry='반도체', sub_industry='후공정'   WHERE code='121850'; -- 코이즈
UPDATE companies SET industry='반도체', sub_industry='냉각'     WHERE code='107640'; -- 한중엔시에스
COMMIT;
