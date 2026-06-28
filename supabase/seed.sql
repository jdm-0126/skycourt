-- =============================================================================
-- Sky Court Website MVP — Seed Data
-- =============================================================================
-- Run AFTER the initial migration.
-- All inserts use ON CONFLICT DO NOTHING / DO UPDATE so this file is safe
-- to re-run without duplicating rows.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. roles
-- ---------------------------------------------------------------------------

INSERT INTO public.roles (name, permissions) VALUES
(
  'member',
  '[
    "read-own-bookings",
    "create-booking",
    "cancel-own-booking",
    "update-own-profile"
  ]'::jsonb
),
(
  'admin',
  '[
    "read-own-bookings",
    "create-booking",
    "cancel-own-booking",
    "update-own-profile",
    "manage-bookings",
    "manage-courts",
    "manage-content",
    "manage-gallery",
    "manage-users",
    "view-reports",
    "manage-messages"
  ]'::jsonb
),
(
  'super_admin',
  '[
    "read-own-bookings",
    "create-booking",
    "cancel-own-booking",
    "update-own-profile",
    "manage-bookings",
    "manage-courts",
    "manage-content",
    "manage-gallery",
    "manage-users",
    "view-reports",
    "manage-messages",
    "manage-admins",
    "manage-roles",
    "view-audit-logs",
    "trigger-backup",
    "manage-settings"
  ]'::jsonb
)
ON CONFLICT (name) DO UPDATE
  SET permissions = EXCLUDED.permissions,
      updated_at  = now();

-- ---------------------------------------------------------------------------
-- 2. website_content  (initial placeholder copy for every section)
-- ---------------------------------------------------------------------------

INSERT INTO public.website_content (section, content) VALUES

-- Hero banner
(
  'hero',
  '{
    "headline":   "Welcome to Sky Court",
    "subheading": "Book your pickleball court and start playing today.",
    "cta_text":   "Book a Court"
  }'::jsonb
),

-- About section
(
  'about',
  '{
    "title": "About Sky Court",
    "body":  "Sky Court is a premier pickleball facility offering state-of-the-art courts for players of all skill levels. Whether you are a seasoned competitor or picking up a paddle for the first time, we have a court for you."
  }'::jsonb
),

-- Court rates
(
  'rates',
  '{
    "title": "Court Rates",
    "items": [
      { "label": "1 Hour (Off-Peak)", "price": "₱200" },
      { "label": "1 Hour (Peak)",     "price": "₱300" },
      { "label": "Half Day (4 hrs)",  "price": "₱900" },
      { "label": "Full Day (8 hrs)",  "price": "₱1,500" }
    ]
  }'::jsonb
),

-- FAQ
(
  'faq',
  '{
    "items": [
      {
        "question": "Do I need to bring my own equipment?",
        "answer":   "Paddles and balls are available for rent at the front desk. You are also welcome to bring your own."
      },
      {
        "question": "Can I cancel or reschedule my booking?",
        "answer":   "Yes. Cancellations made at least 24 hours before the booking time are eligible for a full refund or reschedule. Please contact us directly for assistance."
      },
      {
        "question": "Is there parking available?",
        "answer":   "Free parking is available for all guests on the facility premises."
      },
      {
        "question": "Are walk-ins accepted?",
        "answer":   "Walk-ins are welcome subject to court availability. We recommend booking online in advance to secure your preferred time slot."
      }
    ]
  }'::jsonb
),

-- Contact details
(
  'contact',
  '{
    "phone":        "+63 912 345 6789",
    "email":        "hello@skycourt.ph",
    "facebook_url": "https://www.facebook.com/skycourt"
  }'::jsonb
),

-- Operating hours (also used on the Locate Us page)
(
  'hours',
  '{
    "title": "Operating Hours",
    "schedule": {
      "monday":    { "open": "08:00", "close": "22:00" },
      "tuesday":   { "open": "08:00", "close": "22:00" },
      "wednesday": { "open": "08:00", "close": "22:00" },
      "thursday":  { "open": "08:00", "close": "22:00" },
      "friday":    { "open": "08:00", "close": "22:00" },
      "saturday":  { "open": "07:00", "close": "22:00" },
      "sunday":    { "open": "08:00", "close": "20:00" }
    }
  }'::jsonb
)

ON CONFLICT (section) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. system_settings
-- ---------------------------------------------------------------------------

INSERT INTO public.system_settings (key, value) VALUES
  ('maintenance_mode', 'false'),
  ('site_name',        'Sky Court'),
  ('contact_email',    'hello@skycourt.ph')
ON CONFLICT (key) DO NOTHING;
