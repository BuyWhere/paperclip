-- Add performance index for email authentication lookups
CREATE INDEX IF NOT EXISTS "users_email_lookup_idx" ON "users"("email");

-- Comment: This index optimizes email-based authentication queries
-- even though there's already a unique constraint on the email field.