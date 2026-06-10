-- ============================================
-- Dhanrakshak — Database Schema
-- Run this in Supabase SQL Editor
-- ============================================

-- ==========================================
-- 1. PROFILES TABLE
-- Extends Supabase auth.users with app data
-- ==========================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  email_notifications_enabled BOOLEAN DEFAULT true,
  budget_alerts_enabled BOOLEAN DEFAULT true,
  weekly_report_enabled BOOLEAN DEFAULT true,
  subscription_reminders_enabled BOOLEAN DEFAULT true,
  currency TEXT DEFAULT 'INR' CHECK (currency IN ('INR', 'USD')),
  active_financial_year INTEGER DEFAULT 2026,
  promo_code TEXT DEFAULT NULL,
  daily_scan_time TEXT DEFAULT '06:00',
  subscription_status TEXT DEFAULT 'free' CHECK (subscription_status IN ('free', 'trial', 'active', 'expired', 'cancelled')),
  subscription_plan_type TEXT CHECK (subscription_plan_type IN ('monthly', 'annual', 'lifetime')),
  subscription_expires_at TIMESTAMPTZ,
  razorpay_subscription_id TEXT,
  razorpay_order_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Auto-create profile when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists, then create
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==========================================
-- 2. TRANSACTIONS TABLE
-- Stores both manual and email-extracted transactions
-- ==========================================
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
  type TEXT NOT NULL CHECK (type IN ('debit', 'credit')),
  category TEXT NOT NULL DEFAULT 'other',
  description TEXT NOT NULL DEFAULT '',
  notes TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'email')),
  approval_status TEXT NOT NULL DEFAULT 'approved' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  reference_id TEXT,
  merchant TEXT,
  payment_mode TEXT CHECK (payment_mode IN ('upi','credit_card','debit_card','net_banking','neft','rtgs','imps','wallet','atm','nach','cheque','unknown')),
  card_issuer TEXT,
  card_brand TEXT CHECK (card_brand IN ('Visa','Mastercard','RuPay','American Express','Diners')),
  transaction_time TEXT,
  confidence_score INTEGER,
  email_message_id TEXT,
  event_type TEXT,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ==========================================
-- 3. BUDGETS TABLE
-- Monthly budget per category
-- ==========================================
CREATE TABLE IF NOT EXISTS public.budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  amount DECIMAL(12, 2) NOT NULL CHECK (amount >= 0),
  month TEXT NOT NULL, -- Format: YYYY-MM
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  -- One budget per category per month per user
  UNIQUE(user_id, category, month)
);

-- ==========================================
-- 4. EMAIL_SCAN_LOGS TABLE
-- Tracks daily email scan jobs
-- ==========================================
CREATE TABLE IF NOT EXISTS public.email_scan_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  scanned_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  emails_processed INTEGER DEFAULT 0,
  transactions_found INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failed', 'partial')),
  error_message TEXT,
  gmail_history_id TEXT,
  next_scan_time TIMESTAMPTZ,
  scan_mode TEXT CHECK (scan_mode IN ('manual', 'scheduled')),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ==========================================
-- 5. INDEXES — Performance optimization
-- ==========================================

-- Transactions: most common queries
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON public.transactions(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_user_category ON public.transactions(user_id, category);
CREATE INDEX IF NOT EXISTS idx_transactions_user_status ON public.transactions(user_id, approval_status);
CREATE INDEX IF NOT EXISTS idx_transactions_user_type ON public.transactions(user_id, type);
CREATE INDEX IF NOT EXISTS idx_transactions_reference ON public.transactions(reference_id) WHERE reference_id IS NOT NULL;

-- Budgets: lookup by user + month
CREATE INDEX IF NOT EXISTS idx_budgets_user_month ON public.budgets(user_id, month);

-- Email scan logs: lookup by user
CREATE INDEX IF NOT EXISTS idx_email_scan_logs_user ON public.email_scan_logs(user_id, scanned_at DESC);

-- ==========================================
-- 6. AUTO-UPDATE updated_at TRIGGER
-- ==========================================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at_profiles ON public.profiles;
CREATE TRIGGER set_updated_at_profiles
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_transactions ON public.transactions;
CREATE TRIGGER set_updated_at_transactions
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_budgets ON public.budgets;
CREATE TRIGGER set_updated_at_budgets
  BEFORE UPDATE ON public.budgets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ==========================================
-- 7. ROW LEVEL SECURITY (RLS)
-- Users can only access their own data
-- ==========================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_scan_logs ENABLE ROW LEVEL SECURITY;

-- PROFILES policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id OR (auth.jwt() ->> 'email') LIKE '%@dhanrakshak.in');

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- TRANSACTIONS policies
CREATE POLICY "Users can view own transactions"
  ON public.transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own transactions"
  ON public.transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own transactions"
  ON public.transactions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own transactions"
  ON public.transactions FOR DELETE
  USING (auth.uid() = user_id);

-- BUDGETS policies
CREATE POLICY "Users can view own budgets"
  ON public.budgets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own budgets"
  ON public.budgets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own budgets"
  ON public.budgets FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own budgets"
  ON public.budgets FOR DELETE
  USING (auth.uid() = user_id);

-- EMAIL_SCAN_LOGS policies
CREATE POLICY "Users can view own scan logs"
  ON public.email_scan_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own scan logs"
  ON public.email_scan_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- PROFILES delete policy
CREATE POLICY "Users can delete own profile"
  ON public.profiles FOR DELETE
  USING (auth.uid() = id);

-- ==========================================
-- 8. SECURE USER DELETION RPC
-- Users can safely trigger their own account deletion
-- ==========================================
CREATE OR REPLACE FUNCTION public.delete_user()
RETURNS void AS $$
BEGIN
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================
-- 9. MERCHANT RULES TABLE
-- Stores per-user learned merchant categorisation rules
-- ==========================================
CREATE TABLE IF NOT EXISTS public.merchant_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  merchant_key TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  preferred_category TEXT NOT NULL DEFAULT 'other',
  card_brand TEXT CHECK (card_brand IN ('Visa','Mastercard','RuPay','American Express','Diners')),
  auto_approve BOOLEAN DEFAULT true,
  confidence INTEGER DEFAULT 100,
  times_confirmed INTEGER DEFAULT 1,
  last_updated TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(user_id, merchant_key)
);

ALTER TABLE public.merchant_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own merchant rules"
  ON public.merchant_rules FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_merchant_rules_user_key ON public.merchant_rules(user_id, merchant_key);

-- ==========================================
-- 10. TESTER FEEDBACK TABLE
-- Collects feedback, bug reports, and ratings from app testers
-- ==========================================
CREATE TABLE IF NOT EXISTS public.feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  category TEXT NOT NULL CHECK (category IN ('bug', 'feature_request', 'ui_ux', 'other')),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS on feedback
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- Allow anyone to submit feedback
CREATE POLICY "Anyone can insert feedback"
  ON public.feedback FOR INSERT
  WITH CHECK (true);

-- Allow users to view their own submitted feedback, and creators to view all feedback
DROP POLICY IF EXISTS "Users can view own feedback" ON public.feedback;
CREATE POLICY "Users can view own feedback"
  ON public.feedback FOR SELECT
  USING (auth.uid() = user_id OR (auth.jwt() ->> 'email') LIKE '%@dhanrakshak.in');

-- ==========================================
-- 10. SIGNIN_LOGS TABLE
-- Tracks all successful user signins for investor auditing
-- ==========================================
CREATE TABLE IF NOT EXISTS public.signin_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  device_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS on signin_logs
ALTER TABLE public.signin_logs ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert signin logs (so clients can log signins on auth state change)
CREATE POLICY "Anyone can insert signin logs"
  ON public.signin_logs FOR INSERT
  WITH CHECK (true);

-- Allow creators to view all signin logs
CREATE POLICY "Creators can view all signin logs"
  ON public.signin_logs FOR SELECT
  USING ((auth.jwt() ->> 'email') LIKE '%@dhanrakshak.in');


