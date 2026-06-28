# Implementation Plan: Sky Court Website MVP

## Overview

This plan converts the Sky Court design into incremental coding tasks for a Next.js 16 / React 19 / Material UI / Supabase application. Tasks are ordered so each step builds on the previous one, wiring everything together progressively. The stack is TypeScript throughout.

## Tasks

- [x] 1. Project scaffold and core infrastructure
  - Initialise Next.js 16 App Router project with TypeScript, ESLint, and Prettier
  - Install and configure Material UI v6 with a custom green theme (`src/components/ui/theme.ts`)
  - Install all dependencies: `@supabase/supabase-js`, `@supabase/ssr`, `react-hook-form`, `zod`, `@hookform/resolvers`, `xlsx`, `jspdf`, `fast-check`, `vitest`, `@testing-library/react`, `@playwright/test`
  - Create environment variable template (`.env.local.example`) for `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
  - Create Supabase client helpers: `src/lib/supabase/server.ts`, `src/lib/supabase/client.ts`, `src/lib/supabase/admin.ts`
  - _Requirements: All_

- [x] 8. Member dashboard — bookings and profile
  - [x] 8.1 Implement `GET /api/bookings` and `DELETE /api/bookings/:id` route handlers
    - GET: return authenticated member's own bookings (upcoming and past), filtered by member ID via RLS
    - DELETE: validate member owns booking or user is admin; set `status = 'Cancelled'`; release slot; send cancellation email; write audit log
    - _Requirements: 8.1, 8.2, 8.4, 8.5, 20.1_

  - [x] 8.2 Write property test for member booking dashboard accuracy
    - **Property 13: Member Booking Dashboard Accuracy**
    - **Property 14: Cancellation Updates Status and Releases Slot**
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4_

  - [x] 8.3 Implement Member Dashboard page (`src/app/(member)/dashboard/page.tsx`)
    - Server component; fetch and display upcoming and past bookings for the authenticated member
    - Show booking details (court name, date, time slot, status) on selection
    - Cancel button for upcoming bookings; call `DELETE /api/bookings/:id`; update list
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 8.4 Implement Profile page (`src/app/(member)/profile/page.tsx`)
    - React Hook Form + `profileSchema`; fields: full name, contact number
    - On valid submit: `PATCH /api/users/:id/profile`; show success message; inline error on empty name
    - _Requirements: 9.1, 9.2, 9.3_

  - [x] 8.5 Implement `PATCH /api/users/:id/profile` route handler
    - Validate with `profileSchema`; update `users` record; return updated user
    - _Requirements: 9.2_

  - [x] 8.6 Write property test for profile update round-trip
    - **Property 15: Profile Update Round-Trip**
    - **Validates: Requirements 9.2**

- [x] 9. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 2. Database schema and Supabase setup
  - [x] 2.1 Write and apply Supabase SQL migration for all tables
    - Create tables: `users`, `courts`, `court_unavailable_dates`, `bookings`, `website_content`, `gallery_images`, `contact_messages`, `audit_logs`, `roles`, `backup_history`, `system_settings`
    - Add unique partial index on `bookings(court_id, booking_date, start_time)` where `status IN ('pending','confirmed')`
    - Seed `roles` rows for `member`, `admin`, `super_admin` with default permissions JSON
    - Seed initial `website_content` rows (hero, about, rates, faq, contact, hours)
    - Seed `system_settings` row with `maintenance_mode = false`
    - _Requirements: 4.5, 7.7, 12, 13, 20, 21, 22_

  - [x] 2.2 Write Row Level Security policies
    - Members: read/write own `bookings` and `users` rows
    - Admins: read/write all `bookings`, `courts`, `website_content`, `gallery_images`, `contact_messages`, `users`
    - Super admins: full access; service role bypasses RLS for API routes
    - Public: read `website_content`, `gallery_images`, active `courts`
    - _Requirements: 6.1, 6.2, 6.3, 6.4_


- [x] 10. Admin dashboard and booking management
  - [x] 10.1 Implement `GET /api/bookings/all` route handler
    - Return all bookings with filters: date range, court, member name, status; require `admin+`
    - _Requirements: 11.1, 11.5_

  - [x] 10.2 Write property test for booking filter correctness
    - **Property 19: Booking Filter Results Are Correct and Complete**
    - **Validates: Requirements 11.5**

  - [x] 10.3 Implement `PATCH /api/bookings/:id` route handler (admin approve / reschedule)
    - Check current status before mutation; if already changed return `409`
    - Approve: set `status = 'Confirmed'`; notify member by email; write audit log
    - Reschedule: update date and time slot; notify member; write audit log
    - _Requirements: 11.2, 11.4, 20.1_

  - [x] 10.4 Write property tests for admin booking status transitions
    - **Property 17: Admin Booking Approval Transition**
    - **Property 18: Admin Booking Reschedule Updates Record**
    - **Validates: Requirements 11.2, 11.4**

  - [x] 10.5 Implement Admin Dashboard page (`src/app/(admin)/admin/dashboard/page.tsx`)
    - Server component; display summary cards: today's bookings, active members, available courts
    - Render recent activity feed and calendar view of bookings
    - _Requirements: 10.1, 10.2, 10.3_

  - [x] 10.6 Write property test for admin dashboard stats accuracy
    - **Property 16: Admin Dashboard Stats Match Database State**
    - **Validates: Requirements 10.1**

  - [x] 10.7 Implement Admin Bookings page (`src/app/(admin)/admin/bookings/page.tsx`)
    - DataTable with columns: member name, court, date, time slot, status
    - Search/filter controls: date range, court, member name, status
    - Approve, cancel, reschedule actions per row; idempotency guard (re-fetch on `409`)
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

- [x] 3. Edge middleware, Zod schemas, and shared layout
  - [x] 3.1 Implement edge middleware (`src/middleware.ts`)
    - Read Supabase session cookie; decode JWT role claim
    - Enforce route rules: `/member/*` → role in (member, admin, super_admin); `/admin/*` → role in (admin, super_admin); `/superadmin/*` → role = super_admin
    - Redirect unauthenticated requests to `/auth/login`; redirect wrong-role requests to `/403`
    - Intercept public routes when `maintenance_mode = true`; serve maintenance page (exempt admin/super_admin)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 22.2, 22.3_

  - [x] 3.2 Write property test for middleware route protection (Properties 8 and 9)
    - **Property 8: Unauthenticated Users Redirected from Protected Routes**
    - **Property 9: Role-Based Access Control Enforcement**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4**

  - [x] 3.3 Implement Zod validation schemas (`src/lib/validation/`)
    - Schemas: `registerSchema`, `loginSchema`, `bookingSchema`, `profileSchema`, `contactSchema`, `courtSchema`, `contentSchema`, `adminCreateSchema`
    - _Requirements: 3, 4, 5, 7, 9_

  - [x] 3.4 Write unit tests for all Zod validation schemas
    - Test valid inputs, missing required fields, email format, password length < 8, and edge cases for every schema
    - _Requirements: 3.3, 3.4, 4.4, 4.2_

  - [x] 3.5 Implement public `Navbar` component (`src/components/layout/Navbar.tsx`)
    - Server component; renders links: Home, Book a Court, Locate Us, Contact Us
    - Conditionally shows Login/Register for guests; Dashboard + Logout for members; Admin Panel + Logout for admins/super_admins
    - Collapses into mobile drawer on widths < 768 px
    - _Requirements: 23.1, 23.2, 23.3, 23.4_

  - [x] 3.6 Write property test for role-appropriate navigation links
    - **Property 37: Role-Appropriate Navigation Links**
    - **Validates: Requirements 23.2, 23.3**

  - [x] 3.7 Implement `AdminSidebar` component (`src/components/layout/AdminSidebar.tsx`)
    - Server component; renders standard admin links; adds super_admin-only links when `role = super_admin`
    - _Requirements: 23.5, 23.6_

  - [x] 3.8 Write property test for super admin sidebar shows extended links
    - **Property 38: Super Admin Sidebar Shows Extended Links**
    - **Validates: Requirements 23.6**

  - [x] 3.9 Implement `Footer`, `MaintenancePage` (`src/app/maintenance/page.tsx`), and `/403` page
    - _Requirements: 22.2, 6.2, 6.3_


- [x] 11. Admin court management
  - [x] 11.1 Implement courts API routes
    - `GET /api/courts`: return all courts; public access
    - `POST /api/courts`: validate with `courtSchema`; insert court record; require `admin+`
    - `PATCH /api/courts/:id`: update court (name, hours, status); require `admin+`
    - `POST /api/courts/:id/unavailable`: add unavailable date; require `admin+`
    - `DELETE /api/courts/:id/unavailable/:dateId`: remove unavailable date; require `admin+`
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

  - [x] 11.2 Write property tests for court management invariants
    - **Property 20: Court Creation Round-Trip**
    - **Property 21: Updated Court Hours Reflected in Booking Flow**
    - **Property 22: Unavailable Courts Block New Bookings**
    - **Validates: Requirements 12.2, 12.3, 12.4, 12.5**

  - [x] 11.3 Implement Admin Courts page (`src/app/(admin)/admin/courts/page.tsx`)
    - List courts with name, operating hours, status; add/edit/delete court forms
    - Toggle court status (available / under maintenance → sets `status = 'Unavailable'`)
    - Manage unavailable dates per court
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

- [x] 12. Admin website content and gallery management
  - [x] 12.1 Implement `WebsiteContentEditor` client component (`src/components/admin/WebsiteContentEditor.tsx`)
    - Load current content from `GET /api/content/:section` per section
    - Editable sections: hero, about, contact details, operating hours, court rates, FAQ
    - Submit via `PATCH /api/content/:section`; show success Snackbar; preview panel
    - _Requirements: 13.1, 13.2, 13.3_

  - [x] 12.2 Implement Admin Website page (`src/app/(admin)/admin/website/page.tsx`)
    - Compose `WebsiteContentEditor` components for all editable sections
    - _Requirements: 13.1, 13.2, 13.3_

  - [x] 12.3 Implement Admin Gallery page (`src/app/(admin)/admin/gallery/page.tsx`)
    - Display all gallery images with upload, delete, and drag-to-reorder controls
    - Call `POST /api/gallery` for uploads; `DELETE /api/gallery/:id` for deletes; `PATCH /api/gallery/order` for reorder
    - Show inline error on upload failure
    - _Requirements: 14.1, 14.2, 14.3, 14.4_

- [x] 4. Authentication pages and API routes
  - [x] 4.1 Implement Register page (`src/app/(public)/auth/register/page.tsx`)
    - Client component with React Hook Form + `registerSchema` (full name, email, password ≥ 8 chars)
    - Call Supabase `signUp`; display inline error for duplicate email or short password
    - On success show "Check your email" message; default role = member via DB trigger or user metadata
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 4.2 Write property test for new registrations default to member role
    - **Property 4: New Registrations Default to Member Role**
    - **Validates: Requirements 4.2, 4.5**

  - [x] 4.3 Write property test for password validation rejects short passwords
    - **Property 5: Password Validation Rejects Short Passwords**
    - **Validates: Requirements 4.4**

  - [x] 4.4 Implement Login page (`src/app/(public)/auth/login/page.tsx`)
    - Client component; email + password fields + "Forgot Password" link
    - On success: read role from session, redirect to role-appropriate dashboard
    - On invalid credentials: show error; on unverified account: prompt to verify
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 4.5 Write property test for login redirects to role-appropriate dashboard
    - **Property 6: Login Redirects to Role-Appropriate Dashboard**
    - **Validates: Requirements 5.2**

  - [x] 4.6 Write property test for session persistence across navigation
    - **Property 7: Session Persistence Across Navigation**
    - **Validates: Requirements 5.8**

  - [x] 4.7 Implement Forgot Password page and Reset Password page
    - Forgot password: collect email → Supabase `resetPasswordForEmail`
    - Reset password: collect new password → Supabase `updateUser`; redirect to login on success
    - _Requirements: 5.5, 5.6, 5.7_

  - [x] 4.8 Implement `/api/auth/callback` and `/api/auth/logout` route handlers
    - Callback: handle Supabase PKCE code exchange; redirect to login after email verification
    - Logout: call `supabase.auth.signOut()`, write audit log entry, redirect to home
    - _Requirements: 4.7, 5.9_


- [x] 13. Admin contact messages, reports, and user management
  - [x] 13.1 Implement contact messages API routes
    - `GET /api/contact`: list all messages; require `admin+`
    - `PATCH /api/contact/:id`: mark replied or archive (archive overrides reply status); require `admin+`
    - _Requirements: 15.1, 15.2, 15.3_

  - [x] 13.2 Write property test for contact message status transitions
    - **Property 25: Contact Message Inbox Completeness**
    - **Property 26: Contact Message Status Transitions**
    - **Validates: Requirements 15.1, 15.2, 15.3**

  - [x] 13.3 Implement Admin Messages page (`src/app/(admin)/admin/messages/page.tsx`)
    - DataTable with columns: sender name, email, date, reply status
    - Default inbox hides archived messages; mark replied / archive actions
    - _Requirements: 15.1, 15.2, 15.3_

  - [x] 13.4 Implement reports API routes
    - `GET /api/reports`: return aggregated metrics for `?range=daily|weekly|monthly`; require `admin+`
    - `GET /api/reports/export`: generate and stream XLSX (`xlsx` library) or PDF (`jsPDF`) file; require `admin+`
    - _Requirements: 16.1, 16.2, 16.3, 16.4_

  - [x] 13.5 Write property test for report metrics accuracy
    - **Property 27: Report Metrics Match Actual Data**
    - **Validates: Requirements 16.2**

  - [x] 13.6 Implement Admin Reports page (`src/app/(admin)/admin/reports/page.tsx`)
    - Time range selector (daily, weekly, monthly); metrics cards; Export to Excel and Export to PDF buttons
    - _Requirements: 16.1, 16.2, 16.3, 16.4_

  - [x] 13.7 Implement users API routes
    - `GET /api/users`: list members; require `admin+`
    - `PATCH /api/users/:id/status`: activate/deactivate member; require `admin+`; return error if reactivating already-active account
    - _Requirements: 17.1, 17.2, 17.3_

  - [x] 13.8 Write property test for member deactivation prevents login
    - **Property 28: Member Account Deactivation Prevents Login**
    - **Validates: Requirements 17.2, 17.3**

  - [x] 13.9 Implement Admin Users page (`src/app/(admin)/admin/users/page.tsx`)
    - DataTable with columns: name, email, registration date, status
    - Activate/deactivate actions; inline error when reactivating already-active account
    - _Requirements: 17.1, 17.2, 17.3_

- [x] 5. Checkpoint — Ensure auth, middleware, and schema tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Website content API and public pages
  - [x] 6.1 Implement content API routes (`src/app/api/content/[section]/route.ts`)
    - `GET /api/content/:section` — public, returns JSONB content row for the section
    - `PATCH /api/content/:section` — admin+, validates with `contentSchema`, upserts record
    - _Requirements: 13.1, 13.2_

  - [x] 6.2 Write property test for website content round-trip
    - **Property 1: Website Content Round-Trip**
    - **Validates: Requirements 1.9, 2.4, 3.7, 13.2**

  - [x] 6.3 Implement Home page (`src/app/(public)/page.tsx`)
    - Server component; fetch hero, about, rates, amenities, gallery preview, FAQ via content API and gallery API
    - Render hero banner (headline, subheading, CTA button → Register), about, rates, amenities, gallery preview, CTA section
    - Wrap CTA navigation in error boundary with "Try again" fallback per Requirement 1.8
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9_

  - [x] 6.4 Implement Locate Us page (`src/app/(public)/locate/page.tsx`)
    - Server component; fetch address and hours from content API
    - Render embedded Google Map iframe, full address, operating hours
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 6.5 Implement Contact Us page and contact submit API
    - Page (`src/app/(public)/contact/page.tsx`): server component renders phone, email, Facebook link from content API
    - Client form component with React Hook Form + `contactSchema`; `POST /api/contact` route handler
    - Inline validation errors for missing fields and invalid email; confirmation message on success
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [x] 6.6 Write property test for contact form saves valid submissions
    - **Property 2: Contact Form Saves Valid Submissions**
    - **Validates: Requirements 3.2**

  - [x] 6.7 Write property test for contact form rejects invalid inputs
    - **Property 3: Contact Form Rejects Invalid Inputs**
    - **Validates: Requirements 3.3, 3.4**



- [x] 14. Super admin panel
  - [x] 14.1 Implement admin account management API routes
    - `POST /api/users/admin`: create admin account (name, email, password); assign `role = 'admin'`; write audit log; require `super_admin`
    - `PATCH /api/users/:id/admin-status`: deactivate/reactivate admin; on deactivate terminate all active sessions via Supabase Admin SDK; require `super_admin`
    - _Requirements: 18.1, 18.2, 18.3, 18.4_

  - [x] 14.2 Write property tests for admin account management
    - **Property 29: Admin Account Creation Assigns Admin Role**
    - **Property 30: Admin Deactivation Terminates All Sessions**
    - **Validates: Requirements 18.1, 18.2, 18.4**

  - [x] 14.3 Implement Super Admin — Admins page (`src/app/(admin)/superadmin/admins/page.tsx`)
    - List all admin accounts with name, email, status; create admin form; deactivate/reactivate actions
    - _Requirements: 18.1, 18.2, 18.3, 18.4_

  - [x] 14.4 Implement roles and permissions API routes
    - `GET /api/roles`: list roles with permissions; require `super_admin`
    - `PATCH /api/roles/:id`: update role permissions; guard against removing super_admin core permissions; write audit log; require `super_admin`
    - _Requirements: 19.1, 19.2, 19.3_

  - [x] 14.5 Write property tests for role permission management
    - **Property 31: Role Permission Changes Apply to Active Sessions**
    - **Property 32: Super Admin Core Permissions Cannot Be Removed**
    - **Validates: Requirements 19.2, 19.3**

  - [x] 14.6 Implement Super Admin — Roles page (`src/app/(admin)/superadmin/roles/page.tsx`)
    - Display all roles with permissions; inline editor; guard UI for super_admin role core permissions
    - _Requirements: 19.1, 19.2, 19.3_

  - [x] 14.7 Implement audit logs API route and page
    - `GET /api/audit-logs`: list entries with filters (date range, user, action type); require `super_admin`
    - Page (`src/app/(admin)/superadmin/audit-logs/page.tsx`): DataTable with timestamp, user, action type, affected record; filter controls
    - _Requirements: 20.1, 20.2, 20.3_

  - [x] 14.8 Write property tests for audit log generation and filtering
    - **Property 33: Audit Log Generated for Every Specified Action**
    - **Property 34: Audit Log Filter Returns Correct Entries**
    - **Validates: Requirements 20.1, 20.3**

  - [x] 14.9 Implement database backup API routes and page
    - `POST /api/backup`: trigger Supabase export; create `backup_history` record with `status = 'in_progress'`; write audit log; require `super_admin`
    - `GET /api/backup`: return backup history list; require `super_admin`
    - Atomically update `status` and `completed_at` on completion; set `status = 'failed'` with error message on failure
    - Page (`src/app/(admin)/superadmin/backup/page.tsx`): trigger button, status display, backup history list
    - _Requirements: 21.1, 21.2, 21.3, 21.4_

  - [x] 14.10 Write property test for backup completion atomicity
    - **Property 35: Backup Completion Is Atomic**
    - **Validates: Requirements 21.3**

  - [x] 14.11 Implement system settings API routes and page
    - `GET /api/settings`: return all settings; require `super_admin`
    - `PATCH /api/settings`: update settings (site name, contact email, maintenance_mode); require `super_admin`
    - Page (`src/app/(admin)/superadmin/website-settings/page.tsx`): form for site name, contact email, maintenance mode toggle
    - _Requirements: 22.1, 22.2, 22.3_

  - [x] 14.12 Write property test for maintenance mode controls public access
    - **Property 36: Maintenance Mode Controls Public Access**
    - **Validates: Requirements 22.2, 22.3**

- [x] 15. Court booking flow
  - [x] 15.1 Implement booking slots API route
    - `GET /api/bookings/slots?courtId=&date=`: generate slots from court operating hours; subtract existing `pending/confirmed` bookings; exclude court unavailable dates
    - _Requirements: 7.2_

  - [x] 15.2 Write property test for slot availability accuracy
    - **Property 10: Slot Availability Is Accurate**
    - **Validates: Requirements 7.2**

  - [x] 15.3 Implement `POST /api/bookings` route handler
    - Validate `bookingSchema`; check slot conflict with `SELECT ... FOR UPDATE`; insert booking with `status = 'Pending'`; send confirmation email; write audit log
    - Return `409` on conflict; `422` for unavailable court or unavailable date
    - _Requirements: 7.3, 7.4, 7.5, 7.7, 20.1_

  - [x] 15.4 Write property tests for booking creation invariants
    - **Property 11: Confirmed Booking Has Pending Status**
    - **Property 12: No Double-Booking of the Same Slot**
    - **Validates: Requirements 7.3, 7.5, 7.7**

  - [x] 15.5 Implement `BookingFlow` client component (`src/components/booking/BookingFlow.tsx`)
    - Multi-step wizard: DatePicker → CourtSelector → SlotPicker → ConfirmStep
    - Fetch fresh slot data at each step transition; on `409` at confirm: clear slot, show error Alert, return to SlotPicker
    - On success: redirect to booking success page with booking details
    - _Requirements: 7.1, 7.2, 7.3, 7.5, 7.6_

  - [x] 15.6 Implement Booking pages
    - `src/app/(member)/bookings/new/page.tsx`: render `BookingFlow`
    - `src/app/(member)/bookings/[id]/page.tsx`: booking detail / success page
    - _Requirements: 7.1, 7.6_

- [x] 16. Gallery API routes
  - [x] 16.1 Implement gallery API routes
    - `GET /api/gallery`: return images ordered by `display_order ASC`; public access
    - `POST /api/gallery`: upload file to Supabase Storage; insert `gallery_images` record; require `admin+`; return `400` with `FILE_TOO_LARGE` or `UNSUPPORTED_TYPE` code on failure
    - `DELETE /api/gallery/:id`: remove from Supabase Storage and delete DB record; require `admin+`
    - `PATCH /api/gallery/order`: rewrite all `display_order` values in a single transaction; require `admin+`
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_

  - [x] 16.2 Write property tests for gallery management
    - **Property 23: Gallery Ordering Is Preserved**
    - **Property 24: Gallery Deletion Removes from Storage and Records**
    - **Validates: Requirements 14.3, 14.4, 14.5**

- [x] 17. Final checkpoint — full test suite and E2E
  - Run full Vitest unit and property test suite; all tests must pass
  - Run Playwright E2E suite covering all 4 critical journeys: register→book→cancel, admin approve, maintenance mode, gallery reorder
  - Verify Vercel deployment preview; check public pages render content from Supabase
  - Ensure all tests pass, ask the user if questions arise.

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1"] },
    { "wave": 2, "tasks": ["2"], "dependsOn": ["1"] },
    { "wave": 3, "tasks": ["3"], "dependsOn": ["2"] },
    { "wave": 4, "tasks": ["4"], "dependsOn": ["3"] },
    { "wave": 5, "tasks": ["5"], "dependsOn": ["4"] },
    { "wave": 6, "tasks": ["6"], "dependsOn": ["5"] },
    { "wave": 7, "tasks": ["8"], "dependsOn": ["6"] },
    { "wave": 8, "tasks": ["9"], "dependsOn": ["8"] },
    { "wave": 9, "tasks": ["10", "11", "12", "13", "14", "16"], "dependsOn": ["9"] },
    { "wave": 10, "tasks": ["15"], "dependsOn": ["11", "14"] },
    { "wave": 11, "tasks": ["17"], "dependsOn": ["10", "12", "13", "14", "15", "16"] }
  ]
}
```


## Notes

- Tasks marked with `*` are property-based tests using `fast-check`. Run with `vitest --run` to avoid watch mode.
- Property test files live alongside the code they test, e.g. `src/lib/booking/__tests__/conflict.property.test.ts`.
- The `SUPABASE_SERVICE_ROLE_KEY` is only used server-side (`lib/supabase/admin.ts`). Never expose it to the browser.
- Supabase local development (`supabase start`) is required for integration tests. See Supabase CLI docs for setup.
- Email sending in development uses Supabase's built-in Inbucket SMTP — no external SMTP config needed locally.
- Tasks 10–14 can be worked on in parallel once task 9 is green.
- The booking flow (task 15) is intentionally deferred until courts (task 11) and the booking APIs are stable.
