-- =============================================================================
-- Sky Court Website MVP — Row Level Security Policies
-- =============================================================================
-- Requirements: 6.1, 6.2, 6.3, 6.4
--
-- Role hierarchy (stored in public.users.role):
--   member      → own data only
--   admin       → all operational data (no super_admin-only tables)
--   super_admin → full access
--
-- The service role (used by admin.ts) bypasses RLS by default — no extra
-- policy is needed for server-side API routes that use the service role key.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper: current_user_role()
-- Returns the role of the currently authenticated user from public.users.
-- Using SECURITY DEFINER so it can read public.users regardless of caller RLS.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Helper: is_admin_or_above()
-- Returns TRUE when the current user has role admin or super_admin.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_admin_or_above()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'super_admin'),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- Helper: is_super_admin()
-- Returns TRUE when the current user has role super_admin.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin',
    false
  );
$$;

-- =============================================================================
-- Enable RLS on every table
-- =============================================================================

ALTER TABLE public.users                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courts                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.court_unavailable_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_content        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gallery_images         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_messages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_history         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings        ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Drop existing policies (idempotent re-run support)
-- =============================================================================

-- users
DROP POLICY IF EXISTS "users_select_own"          ON public.users;
DROP POLICY IF EXISTS "users_update_own"          ON public.users;
DROP POLICY IF EXISTS "users_select_admin"        ON public.users;
DROP POLICY IF EXISTS "users_update_admin"        ON public.users;

-- bookings
DROP POLICY IF EXISTS "bookings_select_own"       ON public.bookings;
DROP POLICY IF EXISTS "bookings_insert_own"       ON public.bookings;
DROP POLICY IF EXISTS "bookings_update_own"       ON public.bookings;
DROP POLICY IF EXISTS "bookings_select_admin"     ON public.bookings;
DROP POLICY IF EXISTS "bookings_update_admin"     ON public.bookings;
DROP POLICY IF EXISTS "bookings_delete_admin"     ON public.bookings;

-- courts
DROP POLICY IF EXISTS "courts_select_public"      ON public.courts;
DROP POLICY IF EXISTS "courts_select_member"      ON public.courts;
DROP POLICY IF EXISTS "courts_all_admin"          ON public.courts;

-- court_unavailable_dates
DROP POLICY IF EXISTS "court_unavail_select_all"  ON public.court_unavailable_dates;
DROP POLICY IF EXISTS "court_unavail_write_admin" ON public.court_unavailable_dates;

-- website_content
DROP POLICY IF EXISTS "content_select_all"        ON public.website_content;
DROP POLICY IF EXISTS "content_write_admin"       ON public.website_content;

-- gallery_images
DROP POLICY IF EXISTS "gallery_select_all"        ON public.gallery_images;
DROP POLICY IF EXISTS "gallery_write_admin"       ON public.gallery_images;

-- contact_messages
DROP POLICY IF EXISTS "contact_insert_anyone"     ON public.contact_messages;
DROP POLICY IF EXISTS "contact_select_admin"      ON public.contact_messages;
DROP POLICY IF EXISTS "contact_update_admin"      ON public.contact_messages;

-- audit_logs
DROP POLICY IF EXISTS "audit_select_superadmin"   ON public.audit_logs;

-- roles
DROP POLICY IF EXISTS "roles_select_auth"         ON public.roles;
DROP POLICY IF EXISTS "roles_update_superadmin"   ON public.roles;

-- backup_history
DROP POLICY IF EXISTS "backup_all_superadmin"     ON public.backup_history;

-- system_settings
DROP POLICY IF EXISTS "settings_select_auth"      ON public.system_settings;
DROP POLICY IF EXISTS "settings_write_superadmin" ON public.system_settings;

-- =============================================================================
-- TABLE: public.users
-- =============================================================================
-- INSERT is handled by the DB trigger (handle_new_auth_user) — no INSERT
-- policy is needed for regular users; the trigger runs as SECURITY DEFINER.

-- Members can read and update their own row.
CREATE POLICY "users_select_own"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "users_update_own"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Admins and super admins can read and update any row.
CREATE POLICY "users_select_admin"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (public.is_admin_or_above());

CREATE POLICY "users_update_admin"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (public.is_admin_or_above())
  WITH CHECK (public.is_admin_or_above());

-- =============================================================================
-- TABLE: public.bookings
-- =============================================================================

-- Members can read their own bookings.
CREATE POLICY "bookings_select_own"
  ON public.bookings
  FOR SELECT
  TO authenticated
  USING (member_id = auth.uid());

-- Members can create bookings for themselves.
CREATE POLICY "bookings_insert_own"
  ON public.bookings
  FOR INSERT
  TO authenticated
  WITH CHECK (member_id = auth.uid());

-- Members can update their own bookings (e.g., cancel — status → cancelled).
-- Column-level restriction (only allowing status changes) is enforced in the
-- API route; RLS grants row-level access.
CREATE POLICY "bookings_update_own"
  ON public.bookings
  FOR UPDATE
  TO authenticated
  USING (member_id = auth.uid())
  WITH CHECK (member_id = auth.uid());

-- Admins and super admins can read all bookings.
CREATE POLICY "bookings_select_admin"
  ON public.bookings
  FOR SELECT
  TO authenticated
  USING (public.is_admin_or_above());

-- Admins and super admins can update any booking (approve, reschedule, cancel).
CREATE POLICY "bookings_update_admin"
  ON public.bookings
  FOR UPDATE
  TO authenticated
  USING (public.is_admin_or_above())
  WITH CHECK (public.is_admin_or_above());

-- Admins and super admins can delete any booking.
CREATE POLICY "bookings_delete_admin"
  ON public.bookings
  FOR DELETE
  TO authenticated
  USING (public.is_admin_or_above());

-- =============================================================================
-- TABLE: public.courts
-- =============================================================================

-- Unauthenticated users (public) can see only active/available courts.
CREATE POLICY "courts_select_public"
  ON public.courts
  FOR SELECT
  TO anon
  USING (status = 'available');

-- Authenticated members can see all courts (they need to see unavailable ones
-- in the booking flow to understand why a court is not bookable).
CREATE POLICY "courts_select_member"
  ON public.courts
  FOR SELECT
  TO authenticated
  USING (true);

-- Admins and super admins have full write access (INSERT / UPDATE / DELETE).
CREATE POLICY "courts_all_admin"
  ON public.courts
  FOR ALL
  TO authenticated
  USING (public.is_admin_or_above())
  WITH CHECK (public.is_admin_or_above());

-- =============================================================================
-- TABLE: public.court_unavailable_dates
-- =============================================================================

-- Everyone (public + authenticated) can read unavailable dates so that the
-- booking calendar can correctly grey out those dates without requiring login.
CREATE POLICY "court_unavail_select_all"
  ON public.court_unavailable_dates
  FOR SELECT
  USING (true);

-- Only admins and super admins can add, update, or remove unavailable dates.
CREATE POLICY "court_unavail_write_admin"
  ON public.court_unavailable_dates
  FOR ALL
  TO authenticated
  USING (public.is_admin_or_above())
  WITH CHECK (public.is_admin_or_above());

-- =============================================================================
-- TABLE: public.website_content
-- =============================================================================

-- Public (anonymous) users can read all website content (home page, etc.).
CREATE POLICY "content_select_all"
  ON public.website_content
  FOR SELECT
  USING (true);

-- Only admins and super admins can insert, update, or delete content rows.
CREATE POLICY "content_write_admin"
  ON public.website_content
  FOR ALL
  TO authenticated
  USING (public.is_admin_or_above())
  WITH CHECK (public.is_admin_or_above());

-- =============================================================================
-- TABLE: public.gallery_images
-- =============================================================================

-- Public (anonymous) users can view all gallery images.
CREATE POLICY "gallery_select_all"
  ON public.gallery_images
  FOR SELECT
  USING (true);

-- Only admins and super admins can upload, update order, or delete images.
CREATE POLICY "gallery_write_admin"
  ON public.gallery_images
  FOR ALL
  TO authenticated
  USING (public.is_admin_or_above())
  WITH CHECK (public.is_admin_or_above());

-- =============================================================================
-- TABLE: public.contact_messages
-- =============================================================================

-- Anyone (guests, members, unauthenticated) can submit a contact message.
CREATE POLICY "contact_insert_anyone"
  ON public.contact_messages
  FOR INSERT
  WITH CHECK (true);

-- Only admins and super admins can read contact messages.
CREATE POLICY "contact_select_admin"
  ON public.contact_messages
  FOR SELECT
  TO authenticated
  USING (public.is_admin_or_above());

-- Only admins and super admins can update message status (mark replied / archive).
CREATE POLICY "contact_update_admin"
  ON public.contact_messages
  FOR UPDATE
  TO authenticated
  USING (public.is_admin_or_above())
  WITH CHECK (public.is_admin_or_above());

-- =============================================================================
-- TABLE: public.audit_logs
-- =============================================================================
-- INSERT is performed by server-side API routes using the service role, which
-- bypasses RLS — no INSERT policy is required here.

-- Only super admins can read audit logs.
CREATE POLICY "audit_select_superadmin"
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin());

-- =============================================================================
-- TABLE: public.roles
-- =============================================================================

-- Any authenticated user can read role definitions (middleware and permission
-- checks need this without a service-role call).
CREATE POLICY "roles_select_auth"
  ON public.roles
  FOR SELECT
  TO authenticated
  USING (true);

-- Only super admins can update role permissions.
CREATE POLICY "roles_update_superadmin"
  ON public.roles
  FOR UPDATE
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- =============================================================================
-- TABLE: public.backup_history
-- =============================================================================

-- Super admins have full access (SELECT / INSERT / UPDATE).
-- INSERT also happens via service role from API routes — both paths work.
CREATE POLICY "backup_all_superadmin"
  ON public.backup_history
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- =============================================================================
-- TABLE: public.system_settings
-- =============================================================================

-- Any authenticated user can read system settings so that middleware can check
-- the maintenance_mode flag during request processing.
CREATE POLICY "settings_select_auth"
  ON public.system_settings
  FOR SELECT
  TO authenticated
  USING (true);

-- Only super admins can insert or update settings.
CREATE POLICY "settings_write_superadmin"
  ON public.system_settings
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());
