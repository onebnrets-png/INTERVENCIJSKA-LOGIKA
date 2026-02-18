-- ═══════════════════════════════════════════════════════════
-- 🚑 EURO-OFFICE: Emergency DB Fix Script
-- Poženi kadar dobiš "Database error granting user"
-- ali kakršnokoli DB napako pri loginu
-- ═══════════════════════════════════════════════════════════

-- KORAK 1: Diagnostika — pokaže kaj je narobe
SELECT '═══ DIAGNOSTIKA ═══' as info;

SELECT 'Triggerji na auth:' as check_type, trigger_name, event_object_table
FROM information_schema.triggers
WHERE event_object_schema = 'auth';

SELECT 'RLS politike na profiles:' as check_type, count(*) as count
FROM pg_policies WHERE tablename = 'profiles';

SELECT 'RLS politike na user_settings:' as check_type, count(*) as count
FROM pg_policies WHERE tablename = 'user_settings';

SELECT 'SECURITY DEFINER funkcije:' as check_type, proname, prosecdef
FROM pg_proc WHERE proname IN ('is_admin', 'is_superadmin', 'handle_new_user', 'update_last_sign_in');

-- KORAK 2: Onemogoči problematične triggerje
DROP TRIGGER IF EXISTS on_auth_session_created ON auth.sessions;

-- KORAK 3: Popravi vse funkcije z SECURITY DEFINER + EXCEPTION handling
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')); $$;

CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin'); $$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, role)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)), 'user')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_settings (user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user failed: %', SQLERRM;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.update_last_sign_in()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE profiles SET last_sign_in = now() WHERE id = NEW.user_id;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'update_last_sign_in failed: %', SQLERRM;
  RETURN NEW;
END; $$;

-- KORAK 4: Zagotovi triggerje
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS on_auth_session_created ON auth.sessions;
CREATE TRIGGER on_auth_session_created AFTER INSERT ON auth.sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_last_sign_in();

-- KORAK 5: Zagotovi RLS politike na profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS profiles_select_own ON profiles;
CREATE POLICY profiles_select_own ON profiles FOR SELECT USING (id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS profiles_update_own ON profiles;
CREATE POLICY profiles_update_own ON profiles FOR UPDATE USING (id = auth.uid() OR public.is_admin()) WITH CHECK (id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS profiles_insert_trigger ON profiles;
CREATE POLICY profiles_insert_trigger ON profiles FOR INSERT WITH CHECK (true);

-- KORAK 6: Verifikacija
SELECT '═══ REZULTAT ═══' as info;
SELECT 'Triggerji:' as check, count(*) as count FROM information_schema.triggers WHERE event_object_schema = 'auth';
SELECT 'Profiles RLS:' as check, count(*) as count FROM pg_policies WHERE tablename = 'profiles';
SELECT 'SECDEF funkcije:' as check, proname, prosecdef FROM pg_proc
  WHERE proname IN ('is_admin','is_superadmin','handle_new_user','update_last_sign_in');
SELECT '✅ Emergency fix complete — poskusi login!' as status;
