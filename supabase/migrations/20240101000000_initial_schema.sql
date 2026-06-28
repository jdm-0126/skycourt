-- =============================================================================
-- Sky Court Website MVP — Initial Schema Migration
-- =============================================================================
-- This migration is idempotent: all CREATE statements use IF NOT EXISTS guards
-- and enum types are created only when absent.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Custom enum types
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM ('member', 'admin', 'super_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.user_status AS ENUM ('active', 'inactive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.court_status AS ENUM ('available', 'unavailable');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.booking_status AS ENUM ('pending', 'confirmed', 'cancelled', 'rescheduled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.contact_message_status AS ENUM ('unread', 'replied', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.backup_status AS ENUM ('in_progress', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 2. roles
-- (created before users so the role name can be referenced in comments)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT roles_name_key UNIQUE (name)
);

-- ---------------------------------------------------------------------------
-- 3. users  (mirrors / extends auth.users)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.users (
  id             uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  full_name      text NOT NULL,
  email          text NOT NULL,
  role           public.user_role NOT NULL DEFAULT 'member',
  status         public.user_status NOT NULL DEFAULT 'active',
  contact_number text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 4. courts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.courts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  operating_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  status          public.court_status NOT NULL DEFAULT 'available',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 5. court_unavailable_dates
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.court_unavailable_dates (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id         uuid NOT NULL REFERENCES public.courts (id) ON DELETE CASCADE,
  unavailable_date date NOT NULL,
  reason           text,
  CONSTRAINT court_unavailable_dates_court_date_key UNIQUE (court_id, unavailable_date)
);

-- ---------------------------------------------------------------------------
-- 6. bookings
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.bookings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id    uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  court_id     uuid NOT NULL REFERENCES public.courts (id) ON DELETE CASCADE,
  booking_date date NOT NULL,
  start_time   time NOT NULL,
  end_time     time NOT NULL,
  status       public.booking_status NOT NULL DEFAULT 'pending',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Unique partial index: only one active (pending or confirmed) booking per
-- court / date / start_time at any time — prevents double-booking.
-- (Requirements: 7.5, 7.7)
CREATE UNIQUE INDEX IF NOT EXISTS bookings_no_double_booking
  ON public.bookings (court_id, booking_date, start_time)
  WHERE status IN ('pending', 'confirmed');

-- ---------------------------------------------------------------------------
-- 7. website_content
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.website_content (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section    text NOT NULL,
  content    jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT website_content_section_key UNIQUE (section)
);

-- ---------------------------------------------------------------------------
-- 8. gallery_images
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.gallery_images (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path  text NOT NULL,
  public_url    text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  uploaded_by   uuid REFERENCES public.users (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 9. contact_messages
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.contact_messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_name  text NOT NULL,
  sender_email text NOT NULL,
  message      text NOT NULL,
  status       public.contact_message_status NOT NULL DEFAULT 'unread',
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 10. audit_logs
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid REFERENCES public.users (id) ON DELETE SET NULL,
  action_type        text NOT NULL,
  affected_record_id text,
  metadata           jsonb,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 11. backup_history
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.backup_history (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  triggered_by  uuid REFERENCES public.users (id) ON DELETE SET NULL,
  status        public.backup_status NOT NULL DEFAULT 'in_progress',
  error_message text,
  started_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz
);

-- ---------------------------------------------------------------------------
-- 12. system_settings
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.system_settings (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key        text NOT NULL,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT system_settings_key_key UNIQUE (key)
);

-- =============================================================================
-- Triggers
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A. updated_at auto-maintenance helper
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Attach to every table that has an updated_at column.

DO $$ BEGIN
  CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_courts_updated_at
    BEFORE UPDATE ON public.courts
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_bookings_updated_at
    BEFORE UPDATE ON public.bookings
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_website_content_updated_at
    BEFORE UPDATE ON public.website_content
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_roles_updated_at
    BEFORE UPDATE ON public.roles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_system_settings_updated_at
    BEFORE UPDATE ON public.system_settings
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- B. Auto-create public.users row when a new auth user registers
--    Default role = 'member', status = 'active'
--    (Requirement 4.5)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.users (id, full_name, email, role, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    COALESCE(NEW.email, ''),
    'member',
    'active'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER trg_on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- C. Keep public.users.role in sync when auth user metadata is updated
--    (e.g. when an admin promotes a user via the Supabase Admin SDK)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_user_role_from_metadata()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_role public.user_role;
BEGIN
  -- Only act when raw_app_meta_data->>'role' was actually changed
  IF (NEW.raw_app_meta_data ->> 'role') IS DISTINCT FROM
     (OLD.raw_app_meta_data ->> 'role') THEN

    BEGIN
      v_role := (NEW.raw_app_meta_data ->> 'role')::public.user_role;
    EXCEPTION WHEN invalid_text_representation THEN
      -- Unknown role value — leave public.users unchanged
      RETURN NEW;
    END;

    UPDATE public.users
    SET role = v_role
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER trg_on_auth_user_updated
    AFTER UPDATE ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.sync_user_role_from_metadata();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- Indexes (performance)
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_bookings_member_id       ON public.bookings (member_id);
CREATE INDEX IF NOT EXISTS idx_bookings_court_id        ON public.bookings (court_id);
CREATE INDEX IF NOT EXISTS idx_bookings_booking_date    ON public.bookings (booking_date);
CREATE INDEX IF NOT EXISTS idx_bookings_status          ON public.bookings (status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id       ON public.audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type   ON public.audit_logs (action_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at    ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gallery_images_order     ON public.gallery_images (display_order ASC);
CREATE INDEX IF NOT EXISTS idx_contact_messages_status  ON public.contact_messages (status);
CREATE INDEX IF NOT EXISTS idx_users_role               ON public.users (role);
CREATE INDEX IF NOT EXISTS idx_users_status             ON public.users (status);
