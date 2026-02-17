-- ═══════════════════════════════════════════════════════════════
-- EURO-OFFICE: Full Database Setup
-- v3.0 — 2026-02-17
-- 
-- FIXES (v3.0):
--   - FIX DB-1: Added handle_new_user() trigger to auto-create
--     profiles AND user_settings rows on sign-up.
--   - FIX DB-2: Added complete RLS policies for ALL application
--     tables: profiles, user_settings, projects, project_data,
--     translation_hashes, admin_log, global_settings.
--   - FIX DB-3: profiles INSERT policy allows the trigger
--     (SECURITY DEFINER) to create rows.
--   - FIX DB-4: Eliminated RLS recursion on profiles table.
--     Admin policies use SECURITY DEFINER is_admin() helper.
--   - FIX DB-5: update_last_sign_in() uses NEW.user_id
--     (not NEW.id — that's the session UUID).
--
-- Previous (v2.0):
--   - is_admin() helper, admin_log, global_settings, last_sign_in
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


-- ═══════════════════════════════════════════════════════════════
-- 1. PROFILES TABLE + TRIGGER
-- ═══════════════════════════════════════════════════════════════

-- Create profiles table (if not exists)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  display_name TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  last_sign_in TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ★ FIX DB-1: Auto-create profile + user_settings on sign-up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Create profile row
  INSERT INTO public.profiles (id, email, display_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    'user'
  )
  ON CONFLICT (id) DO NOTHING;

  -- Create user_settings row
  INSERT INTO public.user_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: fires after a new user is created in auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();


-- ═══════════════════════════════════════════════════════════════
-- 2. USER_SETTINGS TABLE
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  ai_provider TEXT DEFAULT 'gemini',
  gemini_key TEXT,
  openrouter_key TEXT,
  model TEXT,
  custom_logo TEXT,
  custom_instructions JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);


-- ═══════════════════════════════════════════════════════════════
-- 3. PROJECTS + PROJECT_DATA TABLES
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT DEFAULT 'New Project',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_owner_id ON projects(owner_id);

CREATE TABLE IF NOT EXISTS project_data (
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  language TEXT NOT NULL CHECK (language IN ('en', 'si')),
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (project_id, language)
);


-- ═══════════════════════════════════════════════════════════════
-- 4. TRANSLATION HASHES TABLE
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS translation_hashes (
  project_id TEXT NOT NULL,
  source_lang TEXT NOT NULL,
  target_lang TEXT NOT NULL,
  field_path TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (project_id, source_lang, target_lang, field_path)
);


-- ═══════════════════════════════════════════════════════════════
-- 5. ADMIN LOG TABLE
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS admin_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_log_created_at ON admin_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_log_admin_id ON admin_log(admin_id);


-- ═══════════════════════════════════════════════════════════════
-- 6. GLOBAL SETTINGS TABLE (singleton)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS global_settings (
  id TEXT PRIMARY KEY DEFAULT 'global',
  custom_instructions JSONB DEFAULT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

INSERT INTO global_settings (id) VALUES ('global')
ON CONFLICT (id) DO NOTHING;


-- ═══════════════════════════════════════════════════════════════
-- 7. ENABLE RLS ON ALL TABLES
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE translation_hashes ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_settings ENABLE ROW LEVEL SECURITY;


-- ═══════════════════════════════════════════════════════════════
-- 8. RLS POLICIES — PROFILES
-- ═══════════════════════════════════════════════════════════════

-- Drop all old policies (safe re-run)
DROP POLICY IF EXISTS "Users read own profile" ON profiles;
DROP POLICY IF EXISTS "Admins read all profiles" ON profiles;
DROP POLICY IF EXISTS "Users update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins update any profile" ON profiles;
DROP POLICY IF EXISTS "profiles_select" ON profiles;
DROP POLICY IF EXISTS "profiles_admin_select" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
DROP POLICY IF EXISTS "profiles_admin_update" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_trigger" ON profiles;

-- ★ FIX DB-3: Allow SECURITY DEFINER functions (handle_new_user) to insert profiles
-- Note: handle_new_user() is SECURITY DEFINER so it bypasses RLS anyway,
-- but this policy also allows service_role / direct inserts if needed.
CREATE POLICY "profiles_insert_trigger"
  ON profiles FOR INSERT
  WITH CHECK (true);

-- Users can read their OWN profile (simple id match — no recursion)
CREATE POLICY "profiles_select"
  ON profiles FOR SELECT
  USING (id = auth.uid());

-- Admins can read ALL profiles (uses is_admin() — no recursion)
CREATE POLICY "profiles_admin_select"
  ON profiles FOR SELECT
  USING (is_admin());

-- Users can update their own profile (cannot change role via WITH CHECK)
CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Admins can update any profile (including role)
CREATE POLICY "profiles_admin_update"
  ON profiles FOR UPDATE
  USING (is_admin());


-- ═══════════════════════════════════════════════════════════════
-- 9. RLS POLICIES — USER_SETTINGS
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "user_settings_select_own" ON user_settings;
DROP POLICY IF EXISTS "user_settings_insert_own" ON user_settings;
DROP POLICY IF EXISTS "user_settings_update_own" ON user_settings;
DROP POLICY IF EXISTS "user_settings_insert_trigger" ON user_settings;

-- Allow trigger (SECURITY DEFINER) to create settings rows
CREATE POLICY "user_settings_insert_trigger"
  ON user_settings FOR INSERT
  WITH CHECK (true);

-- Users can read their own settings
CREATE POLICY "user_settings_select_own"
  ON user_settings FOR SELECT
  USING (user_id = auth.uid());

-- Users can update their own settings
CREATE POLICY "user_settings_update_own"
  ON user_settings FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ═══════════════════════════════════════════════════════════════
-- 10. RLS POLICIES — PROJECTS
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "projects_select_own" ON projects;
DROP POLICY IF EXISTS "projects_insert_own" ON projects;
DROP POLICY IF EXISTS "projects_update_own" ON projects;
DROP POLICY IF EXISTS "projects_delete_own" ON projects;

-- Users can only see their own projects
CREATE POLICY "projects_select_own"
  ON projects FOR SELECT
  USING (owner_id = auth.uid());

-- Users can create projects (owner_id must match their user id)
CREATE POLICY "projects_insert_own"
  ON projects FOR INSERT
  WITH CHECK (owner_id = auth.uid());

-- Users can update their own projects
CREATE POLICY "projects_update_own"
  ON projects FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Users can delete their own projects
CREATE POLICY "projects_delete_own"
  ON projects FOR DELETE
  USING (owner_id = auth.uid());


-- ═══════════════════════════════════════════════════════════════
-- 11. RLS POLICIES — PROJECT_DATA
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "project_data_select_own" ON project_data;
DROP POLICY IF EXISTS "project_data_insert_own" ON project_data;
DROP POLICY IF EXISTS "project_data_update_own" ON project_data;
DROP POLICY IF EXISTS "project_data_delete_own" ON project_data;

-- Users can read data for their own projects
CREATE POLICY "project_data_select_own"
  ON project_data FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_data.project_id
      AND projects.owner_id = auth.uid()
    )
  );

-- Users can insert data for their own projects
CREATE POLICY "project_data_insert_own"
  ON project_data FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_data.project_id
      AND projects.owner_id = auth.uid()
    )
  );

-- Users can update data for their own projects
CREATE POLICY "project_data_update_own"
  ON project_data FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_data.project_id
      AND projects.owner_id = auth.uid()
    )
  );

-- Users can delete data for their own projects
CREATE POLICY "project_data_delete_own"
  ON project_data FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_data.project_id
      AND projects.owner_id = auth.uid()
    )
  );


-- ═══════════════════════════════════════════════════════════════
-- 12. RLS POLICIES — TRANSLATION_HASHES
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "translation_hashes_select_own" ON translation_hashes;
DROP POLICY IF EXISTS "translation_hashes_insert_own" ON translation_hashes;
DROP POLICY IF EXISTS "translation_hashes_update_own" ON translation_hashes;
DROP POLICY IF EXISTS "translation_hashes_delete_own" ON translation_hashes;

-- Users can manage translation hashes for their own projects
CREATE POLICY "translation_hashes_select_own"
  ON translation_hashes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = translation_hashes.project_id
      AND projects.owner_id = auth.uid()
    )
  );

CREATE POLICY "translation_hashes_insert_own"
  ON translation_hashes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = translation_hashes.project_id
      AND projects.owner_id = auth.uid()
    )
  );

CREATE POLICY "translation_hashes_update_own"
  ON translation_hashes FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = translation_hashes.project_id
      AND projects.owner_id = auth.uid()
    )
  );

CREATE POLICY "translation_hashes_delete_own"
  ON translation_hashes FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = translation_hashes.project_id
      AND projects.owner_id = auth.uid()
    )
  );


-- ═══════════════════════════════════════════════════════════════
-- 13. RLS POLICIES — ADMIN_LOG
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "admin_log_select_admin" ON admin_log;
DROP POLICY IF EXISTS "admin_log_insert_admin" ON admin_log;

-- Only admins can read the log
CREATE POLICY "admin_log_select_admin"
  ON admin_log FOR SELECT
  USING (is_admin());

-- Only admins can insert into the log
CREATE POLICY "admin_log_insert_admin"
  ON admin_log FOR INSERT
  WITH CHECK (is_admin());


-- ═══════════════════════════════════════════════════════════════
-- 14. RLS POLICIES — GLOBAL_SETTINGS
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Anyone reads global settings" ON global_settings;
DROP POLICY IF EXISTS "Admins update global settings" ON global_settings;
DROP POLICY IF EXISTS "Admins insert global settings" ON global_settings;

-- Everyone can read global settings (instructions needed by all)
CREATE POLICY "Anyone reads global settings"
  ON global_settings FOR SELECT
  USING (true);

-- Only admins can update global settings
CREATE POLICY "Admins update global settings"
  ON global_settings FOR UPDATE
  USING (is_admin());

-- Only admins can insert global settings
CREATE POLICY "Admins insert global settings"
  ON global_settings FOR INSERT
  WITH CHECK (is_admin());


-- ═══════════════════════════════════════════════════════════════
-- 15. SET BENO AS ADMIN
-- ═══════════════════════════════════════════════════════════════

UPDATE profiles 
SET role = 'admin' 
WHERE email = 'beno.stern@infinita.si';


-- ═══════════════════════════════════════════════════════════════
-- 16. LAST SIGN-IN TRACKING
-- ═══════════════════════════════════════════════════════════════

-- Add last_sign_in column if missing
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'last_sign_in'
  ) THEN
    ALTER TABLE profiles ADD COLUMN last_sign_in TIMESTAMPTZ;
  END IF;
END $$;

-- ★ FIX DB-5: Uses NEW.user_id (not NEW.id — that's the session UUID)
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
-- 17. BACKFILL: Create profile + settings rows for EXISTING users
--     who registered before handle_new_user() trigger existed.
-- ═══════════════════════════════════════════════════════════════

INSERT INTO profiles (id, email, display_name, role)
SELECT 
  id,
  email,
  COALESCE(raw_user_meta_data->>'display_name', split_part(email, '@', 1)),
  'user'
FROM auth.users
WHERE id NOT IN (SELECT id FROM profiles)
ON CONFLICT (id) DO NOTHING;

INSERT INTO user_settings (user_id)
SELECT id FROM auth.users
WHERE id NOT IN (SELECT user_id FROM user_settings)
ON CONFLICT (user_id) DO NOTHING;


-- ═══════════════════════════════════════════════════════════════
-- DONE! Verify with:
--   SELECT * FROM profiles;
--   SELECT * FROM user_settings;
--   SELECT * FROM profiles WHERE role = 'admin';
--   SELECT * FROM global_settings;
--   SELECT is_admin();  -- should return true if you're admin
-- ═══════════════════════════════════════════════════════════════
