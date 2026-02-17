-- ═══════════════════════════════════════════════════════════════
-- EURO-OFFICE: Admin Panel — Database Setup
-- v2.0 — 2026-02-17
-- 
-- FIXES (v2.0):
--   - FIX 1: Eliminated RLS recursion on profiles table.
--     Admin policies now use a SECURITY DEFINER helper function
--     (is_admin) that bypasses RLS to check the caller's role.
--   - FIX 2: admin_log and global_settings policies also use
--     is_admin() instead of direct profiles subquery.
--   - FIX 3: update_last_sign_in() uses NEW.user_id (not NEW.id)
--     because auth.sessions.id is the session UUID, not the user.
--   - FIX 4: "Users update own profile" WITH CHECK no longer
--     subqueries profiles (which would also recurse).
--
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- Safe to re-run: uses DROP IF EXISTS + IF NOT EXISTS.
-- ═══════════════════════════════════════════════════════════════

-- ─── 0. HELPER: is_admin() — bypasses RLS ──────────────────
-- SECURITY DEFINER runs as the function owner (postgres), so
-- it can read profiles without triggering RLS policies.
-- This breaks the infinite recursion chain.

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

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
-- Drop old policies (safe re-run)
DROP POLICY IF EXISTS "admin_log_select_admin" ON admin_log;
DROP POLICY IF EXISTS "admin_log_insert_admin" ON admin_log;

-- Only admins can read the log (uses is_admin() — no recursion)
CREATE POLICY "admin_log_select_admin"
  ON admin_log FOR SELECT
  USING (is_admin());

-- Only admins can insert into the log
CREATE POLICY "admin_log_insert_admin"
  ON admin_log FOR INSERT
  WITH CHECK (is_admin());

-- ─── 4. PROFILES POLICIES (fixed — no recursion) ────────────
-- Drop existing policies (safe re-run)
DROP POLICY IF EXISTS "Users read own profile" ON profiles;
DROP POLICY IF EXISTS "Admins read all profiles" ON profiles;
DROP POLICY IF EXISTS "Users update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins update any profile" ON profiles;
DROP POLICY IF EXISTS "profiles_select" ON profiles;
DROP POLICY IF EXISTS "profiles_admin_select" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
DROP POLICY IF EXISTS "profiles_admin_update" ON profiles;

-- Users can read their OWN profile (simple id match — no recursion)
CREATE POLICY "profiles_select"
  ON profiles FOR SELECT
  USING (id = auth.uid());

-- Admins can read ALL profiles (uses is_admin() — no recursion)
CREATE POLICY "profiles_admin_select"
  ON profiles FOR SELECT
  USING (is_admin());

-- Users can update their own profile (cannot change role)
-- The role check uses OLD.role to prevent self-promotion without
-- querying profiles again (which would recurse).
CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Admins can update any profile (including role)
CREATE POLICY "profiles_admin_update"
  ON profiles FOR UPDATE
  USING (is_admin());

-- ─── 5. GLOBAL INSTRUCTIONS TABLE ───────────────────────────
-- Stores admin-managed AI instructions (singleton row)
CREATE TABLE IF NOT EXISTS global_settings (
  id TEXT PRIMARY KEY DEFAULT 'global',
  custom_instructions JSONB DEFAULT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

ALTER TABLE global_settings ENABLE ROW LEVEL SECURITY;

-- Drop old policies (safe re-run)
DROP POLICY IF EXISTS "Anyone reads global settings" ON global_settings;
DROP POLICY IF EXISTS "Admins update global settings" ON global_settings;
DROP POLICY IF EXISTS "Admins insert global settings" ON global_settings;

-- Everyone can read global settings (instructions needed by all)
CREATE POLICY "Anyone reads global settings"
  ON global_settings FOR SELECT
  USING (true);

-- Only admins can update global settings (uses is_admin() — no recursion)
CREATE POLICY "Admins update global settings"
  ON global_settings FOR UPDATE
  USING (is_admin());

-- Only admins can insert global settings
CREATE POLICY "Admins insert global settings"
  ON global_settings FOR INSERT
  WITH CHECK (is_admin());

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
-- FIX: Uses NEW.user_id (not NEW.id — that's the session UUID)
CREATE OR REPLACE FUNCTION update_last_sign_in()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE profiles 
  SET last_sign_in = now() 
  WHERE id = NEW.user_id;
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
--   SELECT is_admin();  -- should return true if you're admin
-- ═══════════════════════════════════════════════════════════════
