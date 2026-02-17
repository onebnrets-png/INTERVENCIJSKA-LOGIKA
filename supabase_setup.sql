-- ═══════════════════════════════════════════════════════════════
-- EURO-OFFICE: Admin Panel — Database Setup
-- Date: 2026-02-17
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. ADMIN LOG TABLE ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_admin_log_created_at ON admin_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_log_admin_id ON admin_log(admin_id);

-- ─── 2. ENABLE RLS ON ALL RELEVANT TABLES ───────────────────
ALTER TABLE admin_log ENABLE ROW LEVEL SECURITY;

-- Ensure RLS is enabled on profiles (should already be, but safe)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- ─── 3. ADMIN LOG POLICIES ──────────────────────────────────
-- Only admins can read the log
CREATE POLICY "admin_log_select_admin"
  ON admin_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );

-- Only admins can insert into the log
CREATE POLICY "admin_log_insert_admin"
  ON admin_log FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );

-- ─── 4. PROFILES POLICIES (upgrade) ─────────────────────────
-- Drop existing policies if they exist (safe re-run)
DROP POLICY IF EXISTS "Users read own profile" ON profiles;
DROP POLICY IF EXISTS "Admins read all profiles" ON profiles;
DROP POLICY IF EXISTS "Users update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins update any profile" ON profiles;

-- Users can read their OWN profile
CREATE POLICY "Users read own profile"
  ON profiles FOR SELECT
  USING (id = auth.uid());

-- Admins can read ALL profiles
CREATE POLICY "Admins read all profiles"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p 
      WHERE p.id = auth.uid() 
      AND p.role = 'admin'
    )
  );

-- Users can update their own profile (but NOT the role field)
CREATE POLICY "Users update own profile"
  ON profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid() 
    AND role = (SELECT role FROM profiles WHERE id = auth.uid())
  );

-- Admins can update any profile (including role)
CREATE POLICY "Admins update any profile"
  ON profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p 
      WHERE p.id = auth.uid() 
      AND p.role = 'admin'
    )
  );

-- ─── 5. GLOBAL INSTRUCTIONS TABLE ───────────────────────────
-- Stores admin-managed AI instructions (singleton row)
CREATE TABLE IF NOT EXISTS global_settings (
  id TEXT PRIMARY KEY DEFAULT 'global',
  custom_instructions JSONB DEFAULT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

ALTER TABLE global_settings ENABLE ROW LEVEL SECURITY;

-- Everyone can read global settings (instructions needed by all)
CREATE POLICY "Anyone reads global settings"
  ON global_settings FOR SELECT
  USING (true);

-- Only admins can update global settings
CREATE POLICY "Admins update global settings"
  ON global_settings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );

-- Only admins can insert global settings
CREATE POLICY "Admins insert global settings"
  ON global_settings FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );

-- Insert the singleton row
INSERT INTO global_settings (id) VALUES ('global')
ON CONFLICT (id) DO NOTHING;

-- ─── 6. SET BENO AS ADMIN ───────────────────────────────────
-- Replace with your actual email if different
UPDATE profiles 
SET role = 'admin' 
WHERE email = 'beno.stern@infinita.si';

-- ─── 7. ADD last_sign_in tracking to profiles ───────────────
-- (If column doesn't exist yet)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'last_sign_in'
  ) THEN
    ALTER TABLE profiles ADD COLUMN last_sign_in TIMESTAMPTZ;
  END IF;
END $$;

-- ─── 8. FUNCTION: Update last_sign_in on login ──────────────
CREATE OR REPLACE FUNCTION update_last_sign_in()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE profiles 
  SET last_sign_in = now() 
  WHERE id = NEW.id;
  RETURN NEW;
END;

$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on auth.sessions (fires on each new session = login)
DROP TRIGGER IF EXISTS on_auth_session_created ON auth.sessions;
CREATE TRIGGER on_auth_session_created
  AFTER INSERT ON auth.sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_last_sign_in();

-- ═══════════════════════════════════════════════════════════════
-- DONE! Verify with:
--   SELECT * FROM profiles WHERE role = 'admin';
--   SELECT * FROM global_settings;
-- ═══════════════════════════════════════════════════════════════
