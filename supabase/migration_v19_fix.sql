-- ============================================================
-- TaxTalk — Complete RLS & Schema Fix Migration
-- Safe to run multiple times (fully idempotent)
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- ── 1. RETURNS table — update policy ─────────────────────────
-- Drop ALL existing update policies on returns first
DROP POLICY IF EXISTS "Clients update own in-progress returns" ON public.returns;
DROP POLICY IF EXISTS "Clients update own returns"             ON public.returns;
DROP POLICY IF EXISTS "CA staff update returns"                ON public.returns;

-- Recreate with correct permissions
CREATE POLICY "Clients update own returns"
  ON public.returns FOR UPDATE
  USING (
    auth.uid() = user_id
    AND status IN ('in_progress', 'submitted', 'queried')
  );

CREATE POLICY "CA staff update returns"
  ON public.returns FOR UPDATE
  USING (public.is_ca_staff());

-- ── 2. RETURNS table — delete policies ───────────────────────
DROP POLICY IF EXISTS "Clients delete own returns"  ON public.returns;
DROP POLICY IF EXISTS "CA staff delete returns"     ON public.returns;

CREATE POLICY "Clients delete own returns"
  ON public.returns FOR DELETE
  USING (
    auth.uid() = user_id
    AND status IN ('in_progress', 'submitted')
  );

CREATE POLICY "CA staff delete returns"
  ON public.returns FOR DELETE
  USING (public.is_ca_staff());

-- ── 3. FLAGS table — client insert policy ────────────────────
DROP POLICY IF EXISTS "Clients insert flags"  ON public.flags;
DROP POLICY IF EXISTS "System inserts flags"  ON public.flags;

CREATE POLICY "Clients insert flags"
  ON public.flags FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.returns r
      WHERE r.id = return_id
        AND r.user_id = auth.uid()
    )
  );

-- ── 4. CA_QUERIES — client insert/reply policies ─────────────
DROP POLICY IF EXISTS "Clients create queries"       ON public.ca_queries;
DROP POLICY IF EXISTS "CA staff create queries"      ON public.ca_queries;

-- Clients can create queries (for replies and document uploads)
CREATE POLICY "Clients create queries"
  ON public.ca_queries FOR INSERT
  WITH CHECK (auth.uid() = from_user_id);

-- CA staff can also create queries
CREATE POLICY "CA staff create queries"
  ON public.ca_queries FOR INSERT
  WITH CHECK (public.is_ca_staff());

-- ── 5. PROFILES — add KYC columns (idempotent) ───────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS dob          text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS aadhaar      text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS locality     text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS state_code   text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pin_code     text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS city         text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS kyc_complete boolean DEFAULT false;

-- ── 6. RETURNS — add filing columns (idempotent) ─────────────
ALTER TABLE public.returns ADD COLUMN IF NOT EXISTS acknowledgement_no text;
ALTER TABLE public.returns ADD COLUMN IF NOT EXISTS filed_at           timestamptz;
ALTER TABLE public.returns ADD COLUMN IF NOT EXISTS filed_by           uuid;

-- ── 7. DOCUMENTS — widen doc_type to accept new values ───────
-- The original schema uses a strict enum. We need to support
-- 'supporting_doc' and 'ca_note' types added in v18.
-- First check if doc_type is an enum and alter if needed.
DO $$
BEGIN
  -- Add new enum values if they don't exist (Postgres 10+)
  BEGIN
    ALTER TYPE doc_type ADD VALUE IF NOT EXISTS 'supporting_doc';
  EXCEPTION WHEN others THEN NULL;
  END;
  BEGIN
    ALTER TYPE doc_type ADD VALUE IF NOT EXISTS 'ca_note';
  EXCEPTION WHEN others THEN NULL;
  END;
  BEGIN
    ALTER TYPE doc_type ADD VALUE IF NOT EXISTS 'pl_statement';
  EXCEPTION WHEN others THEN NULL;
  END;
  BEGIN
    ALTER TYPE doc_type ADD VALUE IF NOT EXISTS 'balance_sheet';
  EXCEPTION WHEN others THEN NULL;
  END;
END $$;

-- ── 8. RETURNS — widen profile enum if needed ────────────────
DO $$
BEGIN
  BEGIN
    ALTER TYPE taxpayer_profile ADD VALUE IF NOT EXISTS 'mixed';
  EXCEPTION WHEN others THEN NULL;
  END;
  BEGIN
    ALTER TYPE taxpayer_profile ADD VALUE IF NOT EXISTS 'investor';
  EXCEPTION WHEN others THEN NULL;
  END;
END $$;

-- ── 9. Verify ─────────────────────────────────────────────────
SELECT
  schemaname,
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE tablename IN ('returns', 'flags', 'ca_queries', 'profiles')
ORDER BY tablename, policyname;

-- ── 10. Bidirectional messaging — add reply_to_id to ca_queries ──────────────
-- This allows proper threading: CA message → client replies as new row
ALTER TABLE public.ca_queries ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES public.ca_queries(id);
ALTER TABLE public.ca_queries ADD COLUMN IF NOT EXISTS is_read boolean DEFAULT false;

-- Allow CA staff to select all ca_queries (including client replies)
DROP POLICY IF EXISTS "CA staff see all queries" ON public.ca_queries;
CREATE POLICY "CA staff see all queries"
  ON public.ca_queries FOR SELECT
  USING (public.is_ca_staff());

-- Allow clients to see all queries in their return (both CA messages and own replies)
DROP POLICY IF EXISTS "Clients see queries addressed to them" ON public.ca_queries;
CREATE POLICY "Clients see queries addressed to them"
  ON public.ca_queries FOR SELECT
  USING (
    auth.uid() = to_user_id
    OR auth.uid() = from_user_id
    OR EXISTS (SELECT 1 FROM public.returns r WHERE r.id = return_id AND r.user_id = auth.uid())
  );

-- Mark messages as read
DROP POLICY IF EXISTS "Users mark own messages read" ON public.ca_queries;
CREATE POLICY "Users mark own messages read"
  ON public.ca_queries FOR UPDATE
  USING (auth.uid() = to_user_id OR public.is_ca_staff());

SELECT 'Messaging model updated' AS result;
