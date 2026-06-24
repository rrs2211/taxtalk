-- ============================================================
-- TaxTalk v24 Migration
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- ── 1. Challans table for manual tax payment entry ───────────
CREATE TABLE IF NOT EXISTS public.challans (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  return_id       uuid NOT NULL REFERENCES public.returns(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES public.profiles(id),
  type            text NOT NULL CHECK (type IN ('advance_tax', 'self_assessment', 'tds_demand')),
  bsr_code        text,
  serial_no       text,
  payment_date    date NOT NULL,
  amount          integer NOT NULL CHECK (amount > 0),
  bank_name       text,
  tan             text,                -- for TDS demand payments
  section         text,               -- e.g. '300' for self-assessment, '302' for advance
  remarks         text,
  not_in_26as     boolean DEFAULT true,  -- true = paid but not yet in 26AS
  verified_in_26as boolean DEFAULT false,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE public.challans ENABLE ROW LEVEL SECURITY;

-- Clients can manage own challans
CREATE POLICY "clients_own_challans" ON public.challans
  FOR ALL USING (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM public.returns r WHERE r.id = return_id AND r.user_id = auth.uid())
  );

-- CA staff can see all challans
CREATE POLICY "ca_all_challans" ON public.challans
  FOR ALL USING (public.is_ca_staff());

-- ── 2. Add AIS reimport tracking to returns ──────────────────
ALTER TABLE public.returns ADD COLUMN IF NOT EXISTS ais_version       integer DEFAULT 1;
ALTER TABLE public.returns ADD COLUMN IF NOT EXISTS ais_last_imported timestamptz;
ALTER TABLE public.returns ADD COLUMN IF NOT EXISTS computation_locked boolean DEFAULT false;

-- ── 3. Enhance returns select for client view ────────────────
-- Add acknowledgement_no if missing
ALTER TABLE public.returns ADD COLUMN IF NOT EXISTS acknowledgement_no text;
ALTER TABLE public.returns ADD COLUMN IF NOT EXISTS filed_at      timestamptz;
ALTER TABLE public.returns ADD COLUMN IF NOT EXISTS filed_by      uuid;

-- ── 4. Document soft delete support ─────────────────────────
-- extraction_status 'deleted' already handled at app level

-- ── 5. Allow clients to update their own submitted returns ───
DROP POLICY IF EXISTS "Clients update own returns" ON public.returns;
CREATE POLICY "Clients update own returns"
  ON public.returns FOR UPDATE
  USING (
    auth.uid() = user_id AND
    status IN ('in_progress', 'submitted', 'queried')
  );

-- ── 6. Verify ────────────────────────────────────────────────
SELECT 'v24 migration complete' AS result;
