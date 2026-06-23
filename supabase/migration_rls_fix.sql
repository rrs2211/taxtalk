-- ============================================================
-- RLS FIXES — run in Supabase SQL Editor
-- ============================================================

-- 1. Fix returns UPDATE policy — allow clients to update submitted returns too
--    (needed so saveComputation can run before and after submitToCA)
DROP POLICY IF EXISTS "Clients update own in-progress returns" ON public.returns;
CREATE POLICY "Clients update own returns"
  ON public.returns FOR UPDATE
  USING (auth.uid() = user_id AND status IN ('in_progress', 'submitted', 'queried'));

-- 2. Add client insert policy for flags
--    (clients submit AIS flags when they submit their return)
DROP POLICY IF EXISTS "Clients insert flags" ON public.flags;
CREATE POLICY "Clients insert flags"
  ON public.flags FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.returns r
      WHERE r.id = return_id AND r.user_id = auth.uid()
    )
  );

-- 3. Allow clients to create ca_queries (e.g. uploading docs / replying)
DROP POLICY IF EXISTS "Clients create queries" ON public.ca_queries;
CREATE POLICY "Clients create queries"
  ON public.ca_queries FOR INSERT
  WITH CHECK (auth.uid() = from_user_id);

-- 4. Allow clients to delete their own in-progress / submitted returns
DROP POLICY IF EXISTS "Clients delete own returns" ON public.returns;
CREATE POLICY "Clients delete own returns"
  ON public.returns FOR DELETE
  USING (auth.uid() = user_id AND status IN ('in_progress', 'submitted'));

-- 5. Allow CA to delete any return
DROP POLICY IF EXISTS "CA staff delete returns" ON public.returns;
CREATE POLICY "CA staff delete returns"
  ON public.returns FOR DELETE
  USING (public.is_ca_staff());

-- 6. KYC columns on profiles (idempotent)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS dob          text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS aadhaar      text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS locality     text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS state_code   text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pin_code     text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS city         text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS kyc_complete boolean DEFAULT false;

-- 7. Returns extra columns
ALTER TABLE public.returns ADD COLUMN IF NOT EXISTS acknowledgement_no text;
ALTER TABLE public.returns ADD COLUMN IF NOT EXISTS filed_at      timestamptz;
ALTER TABLE public.returns ADD COLUMN IF NOT EXISTS filed_by      uuid;

-- 8. Supporting doc type
ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_doc_type_check;
-- Recreate doc_type as text if it was an enum (allows new values without migration)
-- If doc_type is already text, this is a no-op.

-- Done
SELECT 'RLS fixes applied successfully' AS result;
