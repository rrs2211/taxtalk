-- ============================================================
-- TaxTalk v31.1 — CBDT Compliance Schema Additions
-- ============================================================

-- Add new computation fields to returns table
ALTER TABLE public.returns ADD COLUMN IF NOT EXISTS std_ded_old          numeric;
ALTER TABLE public.returns ADD COLUMN IF NOT EXISTS std_ded_new          numeric;
ALTER TABLE public.returns ADD COLUMN IF NOT EXISTS total_tds_salary     numeric DEFAULT 0;
ALTER TABLE public.returns ADD COLUMN IF NOT EXISTS total_tds_non_salary numeric DEFAULT 0;
ALTER TABLE public.returns ADD COLUMN IF NOT EXISTS fee_234f             numeric DEFAULT 0;
ALTER TABLE public.returns ADD COLUMN IF NOT EXISTS int_234b             numeric DEFAULT 0;
ALTER TABLE public.returns ADD COLUMN IF NOT EXISTS family_pension       numeric DEFAULT 0;
ALTER TABLE public.returns ADD COLUMN IF NOT EXISTS perquisites          numeric DEFAULT 0;
ALTER TABLE public.returns ADD COLUMN IF NOT EXISTS profits_in_lieu      numeric DEFAULT 0;
ALTER TABLE public.returns ADD COLUMN IF NOT EXISTS employer_category    text DEFAULT 'OTH';
ALTER TABLE public.returns ADD COLUMN IF NOT EXISTS filing_section       text DEFAULT '11';

-- Challans table (advance tax and self-assessment payments)
-- Rule A-110/111: Advance = deposited before 31-Mar-2026; Self = after
CREATE TABLE IF NOT EXISTS public.challans (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  return_id    uuid NOT NULL REFERENCES public.returns(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type         text NOT NULL CHECK (type IN ('advance', 'self')),
  amount       numeric NOT NULL,
  bsr          text,
  challan_no   text,
  payment_date date,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.challans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients see own challans"
  ON public.challans FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Clients insert challans"
  ON public.challans FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Clients delete own challans"
  ON public.challans FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "CA staff see all challans"
  ON public.challans FOR SELECT USING (public.is_ca_staff());
CREATE POLICY "CA staff update challans"
  ON public.challans FOR UPDATE USING (public.is_ca_staff());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_challans_return ON public.challans(return_id);

-- TDS2 entries table (non-salary TDS for Schedule TDS2)
-- Rules A-98-103: Must list each deductor separately
CREATE TABLE IF NOT EXISTS public.tds2_entries (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  return_id      uuid NOT NULL REFERENCES public.returns(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tan            text,
  deductor_name  text,
  section        text DEFAULT '194A',
  head_of_income text DEFAULT 'OS',
  gross_amount   numeric NOT NULL DEFAULT 0,
  tds_deducted   numeric NOT NULL DEFAULT 0,
  tds_claimed    numeric NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tds2_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients see own tds2"
  ON public.tds2_entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Clients insert tds2"
  ON public.tds2_entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Clients delete tds2"
  ON public.tds2_entries FOR DELETE USING (auth.uid() = user_id AND
    EXISTS (SELECT 1 FROM public.returns r WHERE r.id = return_id AND r.status IN ('in_progress','submitted','queried')));
CREATE POLICY "CA staff manage tds2"
  ON public.tds2_entries FOR ALL USING (public.is_ca_staff());

CREATE INDEX IF NOT EXISTS idx_tds2_return ON public.tds2_entries(return_id);

-- 80G donee entries for Schedule 80G
-- Rules A-8/78/88/107/325: Per-donee detail, IFSC validation
CREATE TABLE IF NOT EXISTS public.schedule_80g (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  return_id      uuid NOT NULL REFERENCES public.returns(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  donee_name     text NOT NULL,
  donee_pan      text,
  donee_address  text,
  bucket         text NOT NULL DEFAULT '100_no_ql'
                  CHECK (bucket IN ('100_no_ql','50_no_ql','100_ql','50_ql')),
  cash_amount    numeric DEFAULT 0,
  other_amount   numeric DEFAULT 0,
  ifsc           text,
  txn_ref        text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.schedule_80g ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients see own 80G"
  ON public.schedule_80g FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Clients manage 80G"
  ON public.schedule_80g FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Clients delete 80G"
  ON public.schedule_80g FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "CA staff manage 80G"
  ON public.schedule_80g FOR ALL USING (public.is_ca_staff());

CREATE INDEX IF NOT EXISTS idx_80g_return ON public.schedule_80g(return_id);

-- 80D structured detail (insurer-level for Rules A-256-259)
CREATE TABLE IF NOT EXISTS public.schedule_80d (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  return_id      uuid NOT NULL REFERENCES public.returns(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  bucket         text NOT NULL CHECK (bucket IN ('self','self_sr','parents','parents_sr')),
  insurer_name   text,
  policy_number  text,
  premium        numeric DEFAULT 0,
  preventive     numeric DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.schedule_80d ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clients manage 80D" ON public.schedule_80d FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "CA staff manage 80D" ON public.schedule_80d FOR ALL USING (public.is_ca_staff());
CREATE INDEX IF NOT EXISTS idx_80d_return ON public.schedule_80d(return_id);

SELECT 'v31.1 compliance migration complete' AS result;
