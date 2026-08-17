-- reclassify_semiconductor_rollback.sql
-- reclassify_semiconductor.sql 실행 전 상태로 복원 (2026-08-17 스냅샷)
-- 빈값이던 industry/sub_industry 는 NULL 로 복원

BEGIN;

-- industry 원복(반도체가 아니던 4종) + sub_industry 원복
UPDATE companies SET industry=NULL,     sub_industry=NULL             WHERE code='089970'; -- 브이엠
UPDATE companies SET industry=NULL,     sub_industry=NULL             WHERE code='489790'; -- 한화비전
UPDATE companies SET industry=NULL,     sub_industry=NULL             WHERE code='220260'; -- 켐트로스
UPDATE companies SET industry='테크',   sub_industry=NULL             WHERE code='252990'; -- 샘씨엔에스
UPDATE companies SET industry='테크',   sub_industry=NULL             WHERE code='101490'; -- 에스앤에스텍
UPDATE companies SET industry='테크',   sub_industry='MLB기판'        WHERE code='007660'; -- 이수페타시스
UPDATE companies SET industry='2차전지',sub_industry='장비'           WHERE code='161580'; -- 필옵틱스

-- sub_industry 원복(industry 는 이미 반도체였던 종목)
UPDATE companies SET sub_industry='메모리'                WHERE code='005930'; -- 삼성전자
UPDATE companies SET sub_industry='메모리'                WHERE code='000660'; -- SK하이닉스
UPDATE companies SET sub_industry='전공정-장비-증착'      WHERE code='036930'; -- 주성엔지니어링
UPDATE companies SET sub_industry='전공정-장비-증착'      WHERE code='240810'; -- 원익IPS
UPDATE companies SET sub_industry='전공정-장비-증착'      WHERE code='095610'; -- 테스
UPDATE companies SET sub_industry='전공정-장비-증착'      WHERE code='084370'; -- 유진테크
UPDATE companies SET sub_industry='전공정=장비-식각/세정' WHERE code='319660'; -- 피에스케이
UPDATE companies SET sub_industry='장비'                  WHERE code='403870'; -- HPSP
UPDATE companies SET sub_industry='장비'                  WHERE code='281820'; -- 케이씨텍
UPDATE companies SET sub_industry='검사장비'              WHERE code='140860'; -- 파크시스템스
UPDATE companies SET sub_industry='HBM장비'               WHERE code='042700'; -- 한미반도체
UPDATE companies SET sub_industry='레이저장비'            WHERE code='039030'; -- 이오테크닉스
UPDATE companies SET sub_industry='후공정-장비'           WHERE code='031980'; -- 피에스케이홀딩스
UPDATE companies SET sub_industry='핸들러'                WHERE code='089030'; -- 테크윙
UPDATE companies SET sub_industry='검사장비'              WHERE code='064290'; -- 인텍플러스
UPDATE companies SET sub_industry='검사장비'              WHERE code='098460'; -- 고영
UPDATE companies SET sub_industry=NULL                    WHERE code='420770'; -- 기가비스
UPDATE companies SET sub_industry='테스터'                WHERE code='232140'; -- 와이씨
UPDATE companies SET sub_industry='검사장비'              WHERE code='003160'; -- 디아이
UPDATE companies SET sub_industry='CXL'                   WHERE code='253590'; -- 네오셈
UPDATE companies SET sub_industry='테스터'                WHERE code='092870'; -- 엑시콘
UPDATE companies SET sub_industry='소켓'                  WHERE code='058470'; -- 리노공업
UPDATE companies SET sub_industry='소켓'                  WHERE code='095340'; -- ISC
UPDATE companies SET sub_industry='프로브'                WHERE code='131290'; -- 티에스이
UPDATE companies SET sub_industry='파츠/쿼츠'             WHERE code='064760'; -- 티씨케이
UPDATE companies SET sub_industry='파츠/쿼츠'             WHERE code='166090'; -- 하나머티리얼즈
UPDATE companies SET sub_industry='장비'                  WHERE code='036810'; -- 에프에스티
UPDATE companies SET sub_industry='파츠/쿼츠'             WHERE code='074600'; -- 원익QnC
UPDATE companies SET sub_industry='파츠/쿼츠'             WHERE code='101160'; -- 월덱스
UPDATE companies SET sub_industry='소재'                  WHERE code='357780'; -- 솔브레인
UPDATE companies SET sub_industry='소재'                  WHERE code='014680'; -- 한솔케미칼
UPDATE companies SET sub_industry='소재'                  WHERE code='005290'; -- 동진쎄미켐
UPDATE companies SET sub_industry='소재'                  WHERE code='093370'; -- 후성
UPDATE companies SET sub_industry='소재'                  WHERE code='102710'; -- 이엔에프테크놀로지
UPDATE companies SET sub_industry='부품'                  WHERE code='104830'; -- 원익머트리얼즈
UPDATE companies SET sub_industry='MLCC'                  WHERE code='009150'; -- 삼성전기
UPDATE companies SET sub_industry='기판'                  WHERE code='011070'; -- LG이노텍
UPDATE companies SET sub_industry='PCB'                   WHERE code='353200'; -- 대덕전자
UPDATE companies SET sub_industry='LPDDR'                 WHERE code='222800'; -- 심텍
UPDATE companies SET sub_industry='LPDDR'                 WHERE code='356860'; -- 티엘비
UPDATE companies SET sub_industry='PCB'                   WHERE code='007810'; -- 코리아써키트
UPDATE companies SET sub_industry='패키징'                WHERE code='067310'; -- 하나마이크론
UPDATE companies SET sub_industry='OSAT'                  WHERE code='036540'; -- SFA반도체
UPDATE companies SET sub_industry='OSAT'                  WHERE code='033640'; -- 네패스
UPDATE companies SET sub_industry='OSAT'                  WHERE code='131970'; -- 두산테스나
UPDATE companies SET sub_industry=NULL                    WHERE code='200470'; -- 에이팩트
UPDATE companies SET sub_industry='LPDDR'                 WHERE code='080220'; -- 제주반도체
UPDATE companies SET sub_industry=NULL                    WHERE code='440110'; -- 파두
UPDATE companies SET sub_industry=NULL                    WHERE code='108320'; -- LX세미콘
UPDATE companies SET sub_industry='디자인하우스'          WHERE code='399720'; -- 가온칩스
UPDATE companies SET sub_industry='디자인하우스'          WHERE code='200710'; -- 에이디테크놀로지
UPDATE companies SET sub_industry='AI반도체'              WHERE code='394280'; -- 오픈엣지테크놀로지
UPDATE companies SET sub_industry='CXL'                   WHERE code='432720'; -- 퀄리타스반도체
UPDATE companies SET sub_industry='LPDDR'                 WHERE code='094360'; -- 칩스앤미디어
UPDATE companies SET sub_industry='광반도체'              WHERE code='011790'; -- SKC
UPDATE companies SET sub_industry='MLCC'                  WHERE code='204270'; -- 제이앤티씨
UPDATE companies SET sub_industry='유리기판'              WHERE code='089010'; -- 켐트로닉스
UPDATE companies SET sub_industry=NULL                    WHERE code='112290'; -- 와이씨켐

COMMIT;
