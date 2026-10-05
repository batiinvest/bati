-- =====================================================================
--  옛 투자노트 열·거래 기록 테이블 정리 — 2026-10-05 실행 완료(기록용, 다시 실행할 필요 없음)
--  투자노트가 원본 포트폴리오 표(sql/portfolio_book.sql)로 바뀌며 화면·봇 어디서도 안 쓰게 된 것.
--  지운 값(관심가·목표가 4종목, 투자논리 1건)은 watchlist_backup_20261005에 보관 — RLS로 잠가 앱에서 안 보임.
--  확인 뒤 지울 때: drop table watchlist_backup_20261005;
-- =====================================================================

-- 1) 백업
create table if not exists watchlist_backup_20261005 as select * from watchlist;
alter table watchlist_backup_20261005 enable row level security;  -- 정책 없음 = API에서 잠금

-- 2) 옛 투자노트 열 (industry는 종목 상세 ⭐ 추가가 아직 써서 남김)
alter table watchlist
  drop column if exists thesis_1,
  drop column if exists thesis_2,
  drop column if exists thesis_3,
  drop column if exists risk_1,
  drop column if exists risk_2,
  drop column if exists risk_3,
  drop column if exists break_condition,
  drop column if exists catalyst,
  drop column if exists valuation_note,
  drop column if exists competitor,
  drop column if exists peer_per,
  drop column if exists target_price,
  drop column if exists watch_price,
  drop column if exists stop_price,
  drop column if exists target_cap,
  drop column if exists watch_cap,
  drop column if exists next_check_date,
  drop column if exists next_check_memo;

-- 3) 옛 거래 기록 테이블 (0건)
drop table if exists portfolio_transactions;
