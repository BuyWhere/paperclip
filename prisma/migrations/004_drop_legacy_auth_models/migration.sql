-- Drop legacy first-party auth tables after Clerk migration.
-- Backup verification before production deploy:
--   SELECT count(*) FROM "sessions";
--   SELECT count(*) FROM "otp_codes";
--   SELECT count(*) FROM "password_resets";
--   SELECT count(*) FROM "oauth_accounts";

DROP TABLE IF EXISTS "sessions";
DROP TABLE IF EXISTS "otp_codes";
DROP TABLE IF EXISTS "password_resets";
DROP TABLE IF EXISTS "oauth_accounts";
