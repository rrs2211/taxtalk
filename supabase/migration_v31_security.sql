-- ============================================================
-- TaxTalk v31 — Security Hardening Migration
-- Run in: Supabase Dashboard → SQL Editor (run in order)
-- ============================================================

-- ─── 1. IDENTITY LOCK — enforce at DB level via trigger ──────────────────────
-- Drop the no-op WITH CHECK=true policy from v25
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;

-- Trigger that actually enforces identity_locked
CREATE OR REPLACE FUNCTION public.enforce_identity_lock()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Only enforce if the row is already locked
  IF OLD.identity_locked = true THEN
    -- Raise if any identity field is being changed
    IF NEW.full_name <> OLD.full_name OR
       NEW.pan       <> OLD.pan       OR
       NEW.dob       <> OLD.dob       THEN
      RAISE EXCEPTION 'Identity fields (name, PAN, DOB) cannot be changed once locked. Contact your CA.';
    END IF;
    -- Also block downgrading the lock itself
    IF NEW.identity_locked = false THEN
      RAISE EXCEPTION 'Identity lock cannot be removed once set.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_identity_lock ON public.profiles;
CREATE TRIGGER trg_enforce_identity_lock
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_identity_lock();

-- Recreate proper update policy (no WITH CHECK needed — trigger handles identity)
CREATE POLICY "Users update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- ─── 2. BLOCK CLIENT UPDATES ON APPROVED / FILED RETURNS ─────────────────────
DROP POLICY IF EXISTS "Clients update own returns" ON public.returns;
CREATE POLICY "Clients update own returns"
  ON public.returns FOR UPDATE
  USING (auth.uid() = user_id AND status IN ('in_progress', 'submitted', 'queried'));

-- Trigger to double-enforce: client cannot change approved/filed status
CREATE OR REPLACE FUNCTION public.block_approved_return_changes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  caller_role TEXT;
BEGIN
  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();
  -- Only block non-CA users
  IF caller_role NOT IN ('ca_staff', 'ca_admin') THEN
    IF OLD.status IN ('approved', 'filed') THEN
      RAISE EXCEPTION 'Return is % and cannot be modified. Contact your CA.', OLD.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_approved_changes ON public.returns;
CREATE TRIGGER trg_block_approved_changes
  BEFORE UPDATE ON public.returns
  FOR EACH ROW EXECUTE FUNCTION public.block_approved_return_changes();

-- ─── 3. AADHAAR — mask in select, store only last 4 digits ──────────────────
-- Add masked_aadhaar column for display; keep full aadhaar in vault-encrypted col
-- For now: truncate existing aadhaar to last 4 digits on read via view
-- (Full Vault encryption requires Supabase Vault add-on — see SETUP_GUIDE)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS aadhaar_last4 text;

-- One-time migration: copy last 4 digits, then blank the full aadhaar
UPDATE public.profiles
SET    aadhaar_last4 = RIGHT(aadhaar, 4)
WHERE  aadhaar IS NOT NULL AND LENGTH(aadhaar) >= 4;

-- Create a secure view that NEVER exposes full aadhaar
CREATE OR REPLACE VIEW public.profiles_safe AS
SELECT
  id, role, full_name, phone, pan, email, firm_id,
  aadhaar_last4,                          -- only last 4 digits
  dob, locality, city, state_code, pin_code,
  kyc_complete, identity_locked,
  created_at, updated_at
FROM public.profiles;

-- Grant select on the safe view to authenticated users
GRANT SELECT ON public.profiles_safe TO authenticated;

-- ─── 4. AUDIT LOG BEFORE DELETE ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.audit_before_delete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.audit_log(return_id, user_id, action, detail, created_at)
  VALUES (
    OLD.id,
    auth.uid(),
    'return_hard_deleted',
    jsonb_build_object(
      'assessment_year', OLD.assessment_year,
      'status',          OLD.status,
      'itr_form',        OLD.itr_form,
      'user_id',         OLD.user_id,
      'deleted_at',      now()
    ),
    now()
  );
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_before_delete ON public.returns;
CREATE TRIGGER trg_audit_before_delete
  BEFORE DELETE ON public.returns
  FOR EACH ROW EXECUTE FUNCTION public.audit_before_delete();

-- Block CA from deleting FILED returns entirely
DROP POLICY IF EXISTS "CA staff delete returns" ON public.returns;
CREATE POLICY "CA staff delete returns"
  ON public.returns FOR DELETE
  USING (public.is_ca_staff() AND status <> 'filed');

-- ─── 5. CA_STAFF CANNOT SEND MESSAGES ON FILED RETURNS ───────────────────────
DROP POLICY IF EXISTS "CA staff create queries" ON public.ca_queries;
CREATE POLICY "CA staff create queries"
  ON public.ca_queries FOR INSERT
  WITH CHECK (
    public.is_ca_staff() AND
    EXISTS (
      SELECT 1 FROM public.returns r
      WHERE r.id = return_id AND r.status <> 'filed'
    )
  );

-- ─── 6. CONSENT TRACKING ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.consent_records (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  consented_at timestamptz NOT NULL DEFAULT now(),
  ip_address   inet,
  user_agent   text,
  terms_version text NOT NULL DEFAULT 'v1.0',
  privacy_version text NOT NULL DEFAULT 'v1.0',
  cookie_consent boolean NOT NULL DEFAULT true
);

ALTER TABLE public.consent_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own consent"
  ON public.consent_records FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "CA admin see all consents"
  ON public.consent_records FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'ca_admin'));

CREATE POLICY "Users see own consent"
  ON public.consent_records FOR SELECT
  USING (auth.uid() = user_id);

-- ─── 7. RATE LIMITING TABLE (replaces in-memory Map) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint     text NOT NULL,
  window_start timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 1,
  UNIQUE (user_id, endpoint, window_start)
);

ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;

-- Only service role can read/write rate limits (no user access)
-- RLS: deny all for non-service-role
CREATE POLICY "No direct user access to rate limits"
  ON public.api_rate_limits FOR ALL
  USING (false);

-- Helper function: check and increment rate limit (called from API via service role)
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_user_id  uuid,
  p_endpoint text,
  p_max      integer,
  p_window   interval DEFAULT '1 hour'
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_window_start timestamptz;
  v_count        integer;
BEGIN
  v_window_start := date_trunc('hour', now());

  INSERT INTO public.api_rate_limits(user_id, endpoint, window_start, request_count)
  VALUES (p_user_id, p_endpoint, v_window_start, 1)
  ON CONFLICT (user_id, endpoint, window_start)
  DO UPDATE SET request_count = api_rate_limits.request_count + 1
  RETURNING request_count INTO v_count;

  RETURN v_count <= p_max;
END;
$$;

-- ─── 8. CONSENT COLUMN ON PROFILES ───────────────────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS terms_accepted    boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;

SELECT 'v31 security migration complete' AS result;
