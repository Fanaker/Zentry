-- ONLY ON A NEW, EMPTY SUPABASE PROJECT. Then execute 02_hardening.sql.
BEGIN;
-- ============ ROLES ============
CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin', 'viewer');

CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.has_role(_user_id, 'admin'); $$;

CREATE POLICY "Authenticated can view roles"
  ON public.user_roles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage roles"
  ON public.user_roles FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view profiles"
  ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users update own profile"
  ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users insert own profile"
  ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- ============ ACCOUNTS ============
CREATE TYPE public.account_type AS ENUM ('debit', 'credit', 'cash', 'dollars', 'other');
CREATE TYPE public.currency_code AS ENUM ('PEN', 'USD');

CREATE TABLE public.accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  account_type public.account_type NOT NULL,
  currency public.currency_code NOT NULL DEFAULT 'PEN',
  counts_as_real_money BOOLEAN NOT NULL DEFAULT true,
  initial_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read accounts" ON public.accounts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins write accounts" ON public.accounts FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- ============ CATEGORIES ============
CREATE TYPE public.tx_type AS ENUM ('expense', 'income', 'transfer');

CREATE TABLE public.categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  tx_type public.tx_type NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name, tx_type)
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read categories" ON public.categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins write categories" ON public.categories FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- ============ PEOPLE ============
CREATE TABLE public.people (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read people" ON public.people FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins write people" ON public.people FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- ============ TRANSACTIONS ============
CREATE TABLE public.transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tx_date DATE NOT NULL,
  tx_type public.tx_type NOT NULL,
  payment_account_id UUID REFERENCES public.accounts(id),
  origin_account_id UUID REFERENCES public.accounts(id),
  destination_account_id UUID REFERENCES public.accounts(id),
  person_id UUID REFERENCES public.people(id),
  category_id UUID REFERENCES public.categories(id),
  description TEXT,
  amount_pen NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount_usd NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency public.currency_code NOT NULL DEFAULT 'PEN',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_transactions_date ON public.transactions(tx_date DESC);
CREATE INDEX idx_transactions_type ON public.transactions(tx_type);
CREATE INDEX idx_transactions_category ON public.transactions(category_id);
CREATE INDEX idx_transactions_person ON public.transactions(person_id);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read transactions" ON public.transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins write transactions" ON public.transactions FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- ============ MONTHLY CLOSINGS ============
CREATE TABLE public.monthly_closings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  year INT NOT NULL,
  month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  real_balance_pen NUMERIC(14,2) NOT NULL DEFAULT 0,
  real_balance_usd NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, year, month)
);

ALTER TABLE public.monthly_closings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read closings" ON public.monthly_closings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins write closings" ON public.monthly_closings FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- ============ BUDGETS ============
CREATE TABLE public.budgets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  year INT NOT NULL,
  month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  amount_pen NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (category_id, year, month)
);

ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read budgets" ON public.budgets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins write budgets" ON public.budgets FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- ============ updated_at trigger ============
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_tx_updated BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
-- Backup history table to track export events
CREATE TABLE public.backup_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  filename TEXT NOT NULL,
  record_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);

ALTER TABLE public.backup_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read backups"
ON public.backup_history FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins write backups"
ON public.backup_history FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE INDEX idx_backup_history_created_at ON public.backup_history (created_at DESC);

ALTER TABLE public.accounts
ADD COLUMN IF NOT EXISTS billing_start_day integer,
ADD COLUMN IF NOT EXISTS billing_end_day integer;

ALTER TABLE public.accounts
ADD CONSTRAINT accounts_billing_start_day_range CHECK (billing_start_day IS NULL OR (billing_start_day BETWEEN 1 AND 31)),
ADD CONSTRAINT accounts_billing_end_day_range CHECK (billing_end_day IS NULL OR (billing_end_day BETWEEN 1 AND 31));
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS hidden_in_accounts boolean NOT NULL DEFAULT false;
DO $$ DECLARE t text; BEGIN
FOREACH t IN ARRAY ARRAY['accounts','categories','people','transactions','budgets','monthly_closings','backup_history'] LOOP
EXECUTE format('ALTER TABLE public.%I ADD COLUMN owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id)',t);
END LOOP; END $$;

COMMIT;
