-- ============================================================
-- TaxTalk v31.2 — ITR-2 Compliance Schema Additions
-- ============================================================

-- Capital gains per-transaction detail (for Schedule 112A row-level compliance)
-- Rules 84-90: Col4*Col5=TotalSaleValue, Cost=max(col8,col9), FMV calc
CREATE TABLE IF NOT EXISTS public.capital_gain_txns (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  return_id        uuid NOT NULL REFERENCES public.returns(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  txn_type         text NOT NULL CHECK (txn_type IN ('stcg_111a_pre','stcg_111a_post','ltcg_112a','ltcg_property','other')),
  -- For Schedule 112A
  isin             text,
  description      text,
  qty              numeric,
  sale_date        date,
  purchase_date    date,
  sale_price_unit  numeric,                -- Col5
  total_sale_value numeric,               -- Col6 = Col4*Col5
  purchase_cost    numeric,               -- Col8
  fmv_per_unit     numeric,               -- Col10 (FMV as on 31 Jan 2018)
  total_fmv        numeric,               -- Col11 = Col4*Col10
  acquired_before_2018 boolean DEFAULT true,
  cost_improvement numeric DEFAULT 0,     -- Col12
  expenses         numeric DEFAULT 0,
  gain             numeric,               -- Col14 = Col6 - (max(col8,col9) + expenses)
  -- For property LTCG
  property_type    text,                  -- 'land_building', 'other'
  indexed_cost     numeric,               -- for residents, pre-23-Jul-2024
  acquisition_before_23jul2024 boolean DEFAULT false,
  -- Deductions u/s 54 / 54EC / 54F
  dedn_54          numeric DEFAULT 0,
  dedn_54ec        numeric DEFAULT 0,     -- Rule 591: max Rs.50L
  dedn_54f         numeric DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.capital_gain_txns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clients manage CG txns" ON public.capital_gain_txns
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "CA staff manage CG txns" ON public.capital_gain_txns
  FOR ALL USING (public.is_ca_staff());
CREATE INDEX IF NOT EXISTS idx_cg_txns_return ON public.capital_gain_txns(return_id);

-- Brought-forward losses (Schedule CFL/BFLA)
-- Rules 234-276: carry-forward from prior assessment years
CREATE TABLE IF NOT EXISTS public.bf_losses (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  return_id     uuid NOT NULL REFERENCES public.returns(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  loss_type     text NOT NULL CHECK (loss_type IN ('hp','stcg','ltcg','business','speculation','other')),
  assessment_year text NOT NULL,   -- e.g. '2023-24' (the year the loss was incurred)
  loss_amount   numeric NOT NULL,
  amount_setoff numeric DEFAULT 0,
  amount_cfwd   numeric,           -- loss_amount - amount_setoff
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bf_losses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clients manage BF losses" ON public.bf_losses FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "CA staff manage BF losses" ON public.bf_losses FOR ALL USING (public.is_ca_staff());
CREATE INDEX IF NOT EXISTS idx_bf_losses_return ON public.bf_losses(return_id);

-- Foreign income (Schedule FSI) for taxpayers with overseas income
CREATE TABLE IF NOT EXISTS public.foreign_income (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  return_id     uuid NOT NULL REFERENCES public.returns(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  country_code  text NOT NULL,
  tax_id_number text,
  income_type   text CHECK (income_type IN ('salary','hp','cg','os')),
  income_amount numeric NOT NULL,
  tax_paid_outside numeric DEFAULT 0,
  dtaa_applicable boolean DEFAULT false,
  dtaa_section  text,
  tax_relief_available numeric DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.foreign_income ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clients manage foreign income" ON public.foreign_income FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "CA staff manage foreign income" ON public.foreign_income FOR ALL USING (public.is_ca_staff());

-- Assets and liabilities (Schedule AL) — mandatory if total income > Rs.1 Crore
CREATE TABLE IF NOT EXISTS public.assets_liabilities (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  return_id     uuid NOT NULL REFERENCES public.returns(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  asset_type    text NOT NULL,   -- 'immovable_land', 'immovable_building', 'shares', etc.
  description   text,
  cost          numeric DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.assets_liabilities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clients manage AL" ON public.assets_liabilities FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "CA staff manage AL" ON public.assets_liabilities FOR ALL USING (public.is_ca_staff());

-- Add ITR-2 specific columns to returns table
ALTER TABLE public.returns ADD COLUMN IF NOT EXISTS has_foreign_income   boolean DEFAULT false;
ALTER TABLE public.returns ADD COLUMN IF NOT EXISTS has_bf_losses        boolean DEFAULT false;
ALTER TABLE public.returns ADD COLUMN IF NOT EXISTS residential_status   text DEFAULT 'RES';  -- RES/RNOR/NR
ALTER TABLE public.returns ADD COLUMN IF NOT EXISTS is_director          boolean DEFAULT false;
ALTER TABLE public.returns ADD COLUMN IF NOT EXISTS has_unlisted_shares  boolean DEFAULT false;
ALTER TABLE public.returns ADD COLUMN IF NOT EXISTS amt_applicable       boolean DEFAULT false;
ALTER TABLE public.returns ADD COLUMN IF NOT EXISTS amt_tax              numeric DEFAULT 0;
ALTER TABLE public.returns ADD COLUMN IF NOT EXISTS ltcg_pre_23jul2024   numeric DEFAULT 0;   -- Property LTCG acquired pre-23-Jul-24

SELECT 'v31.2 ITR-2 migration complete' AS result;
