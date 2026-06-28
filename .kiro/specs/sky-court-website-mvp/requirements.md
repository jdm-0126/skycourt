# Requirements Document

## Introduction

Sky Court is a pickleball court booking website that allows guests to explore the facility, members to book and manage court reservations, and admins/super admins to manage bookings, courts, content, users, and system configuration. The MVP covers public-facing pages, authentication, a booking module, member and admin dashboards, and a super admin panel — all built on Next.js 16, React 19, Material UI (green theme), Supabase, and deployed on Vercel.

---

## Glossary

- **Guest**: An unauthenticated visitor browsing the public website.
- **Member**: An authenticated user with a verified account who can book courts.
- **Admin**: An authenticated user with elevated privileges who manages bookings, courts, content, gallery, and reports.
- **Super_Admin**: An authenticated user with the highest privilege level who can manage admins, roles, permissions, audit logs, database backups, and system settings.
- **Booking**: A reservation of a specific court for a specific date and time slot by a Member.
- **Court**: A physical pickleball court registered in the system with defined operating hours and availability.
- **Time_Slot**: A discrete, bookable time interval within a Court's operating hours.
- **Website_Content**: Editable text and media content displayed on public-facing pages (hero, about, rates, FAQ, contact, etc.).
- **Gallery**: A managed collection of images displayed on the public website.
- **Contact_Message**: A submission from a Guest or Member via the Contact Us form.
- **Audit_Log**: A system-generated record of significant user actions for security and compliance traceability.
- **Role**: A named set of permissions assigned to a user (Guest, Member, Admin, Super_Admin).
- **System**: The Sky Court website application as a whole.
- **Auth_Service**: The Supabase authentication subsystem handling sign-up, login, sessions, and email verification.
- **Booking_Service**: The subsystem responsible for creating, validating, and managing Bookings.
- **Admin_Panel**: The administrative interface accessible to Admins and Super_Admins.
- **Report**: An aggregated data export covering booking and user activity for a given time period.

---

## Requirements

---

### Requirement 1: Public Home Page

**User Story:** As a Guest, I want to view the Sky Court home page, so that I can learn about the facility and be encouraged to register or book a court.

#### Acceptance Criteria

1. THE System SHALL display a hero banner containing a headline, subheading, and a call-to-action button on the home page.
2. THE System SHALL display an about section describing Sky Court on the home page.
3. THE System SHALL display court rates on the home page.
4. THE System SHALL display an amenities section on the home page.
5. THE System SHALL display a gallery preview section with a subset of gallery images on the home page.
6. THE System SHALL display a call-to-action section prompting Guests to register or book a court on the home page.
7. WHEN a Guest clicks the call-to-action button, THE System SHALL navigate the Guest to the Register page.
8. IF navigation to the Register page fails due to a network or server error, THEN THE System SHALL display an error message to the Guest and provide a retry option.
9. THE System SHALL source all home page content (headline, subheading, button text, about text, rates, FAQ) from Website_Content records managed via the Admin_Panel.

---

### Requirement 2: Locate Us Page

**User Story:** As a Guest, I want to view the Sky Court location page, so that I can find the facility's address, map, and operating hours.

#### Acceptance Criteria

1. THE System SHALL display an embedded Google Map centered on the Sky Court location on the Locate Us page.
2. THE System SHALL display the full physical address of Sky Court on the Locate Us page.
3. THE System SHALL display business operating hours on the Locate Us page.
4. THE System SHALL source the address and operating hours from Website_Content records managed via the Admin_Panel.

---

### Requirement 3: Contact Us Page

**User Story:** As a Guest or Member, I want to submit a contact message, so that I can reach the Sky Court team with questions or inquiries.

#### Acceptance Criteria

1. THE System SHALL display a contact form with fields for name, email address, and message on the Contact Us page.
2. WHEN a user submits the contact form with all required fields completed, THE System SHALL save the submission as a Contact_Message record.
3. WHEN a user submits the contact form with missing required fields, THE System SHALL display an inline validation error identifying each missing field.
4. WHEN a user submits the contact form with an invalid email address format, THE System SHALL display an inline validation error on the email field.
5. WHEN a Contact_Message is successfully saved, THE System SHALL display a confirmation message to the user.
6. THE System SHALL display the Sky Court Facebook page link, phone number, and email address on the Contact Us page.
7. THE System SHALL source the phone number, email address, and Facebook link from Website_Content records managed via the Admin_Panel.

---

### Requirement 4: User Registration

**User Story:** As a Guest, I want to create a Member account, so that I can book pickleball courts at Sky Court.

#### Acceptance Criteria

1. THE System SHALL display a registration form with fields for full name, email address, and password on the Register page.
2. WHEN a Guest submits the registration form with all required fields completed and a valid email format, THE Auth_Service SHALL create a new user account and send a verification email.
3. WHEN a Guest submits the registration form with an email address already associated with an existing account, THE System SHALL display an inline error stating that the email is already in use.
4. WHEN a Guest submits the registration form with a password shorter than 8 characters, THE System SHALL display an inline validation error on the password field.
5. WHEN a new account is created, THE System SHALL assign the Member Role to the account by default.
6. WHEN a new account is created, THE Auth_Service SHALL send an email verification link to the provided email address.
7. WHEN a Guest clicks the email verification link, THE Auth_Service SHALL mark the account as verified and redirect the user to the Login page.

---

### Requirement 5: User Login and Session Management

**User Story:** As a Member, Admin, or Super_Admin, I want to log in to my account, so that I can access role-appropriate features.

#### Acceptance Criteria

1. THE System SHALL display a login form with fields for email address and password on the Login page.
2. WHEN a user submits valid credentials, THE Auth_Service SHALL create an authenticated session, set a logged-in status flag for the user, and redirect the user to their role-appropriate dashboard.
3. WHEN a user submits invalid credentials, THE System SHALL display an error message stating that the email or password is incorrect.
4. WHEN an unverified user attempts to log in, THE System SHALL display an error message prompting the user to verify their email address.
5. THE System SHALL display a "Forgot Password" link on the Login page.
6. WHEN a user clicks "Forgot Password" and submits their email address, THE Auth_Service SHALL send a password reset email to that address.
7. WHEN a user clicks a valid password reset link and submits a new password, THE Auth_Service SHALL update the account password and redirect the user to the Login page.
8. WHILE a valid authenticated session exists, THE System SHALL maintain the user's logged-in state across page navigations.
9. WHEN a user logs out, THE Auth_Service SHALL invalidate the session and redirect the user to the home page.

---

### Requirement 6: Protected Routes and Role-Based Access Control

**User Story:** As the System, I want to enforce role-based access to pages and features, so that users can only access areas appropriate to their Role.

#### Acceptance Criteria

1. WHEN an unauthenticated user attempts to access a Member, Admin, or Super_Admin protected page, THE System SHALL redirect the user to the Login page.
2. WHEN an authenticated Member attempts to access an Admin or Super_Admin protected page, THE System SHALL return a 403 Forbidden response and display an access-denied message.
3. WHEN an authenticated Admin attempts to access a Super_Admin-only page, THE System SHALL return a 403 Forbidden response and display an access-denied message, regardless of whether an explicit denial mechanism is currently active.
4. THE System SHALL enforce access control checks on both client-side routing and server-side API routes.

---

### Requirement 7: Court Booking

**User Story:** As a Member, I want to book a pickleball court for a specific date and time, so that I can reserve playing time at Sky Court.

#### Acceptance Criteria

1. THE Booking_Service SHALL display a booking flow with the following steps in order: select date, choose court, select available time slot, confirm booking.
2. WHEN a Member selects a date and court, THE Booking_Service SHALL display only Time_Slots that are not already booked and fall within the Court's operating hours for that date.
3. WHEN a Member confirms a booking, THE Booking_Service SHALL create a Booking record with status "Pending" and associate it with the Member's account.
4. WHEN a Member confirms a booking, THE Booking_Service SHALL send a booking confirmation notification to the Member's email address.
5. WHEN a Member attempts to book a Time_Slot that has already been booked by another Member between slot selection and confirmation, THE Booking_Service SHALL detect the conflict, block the booking creation, display an error message, and prompt the Member to select a different slot.
6. WHEN a booking is successfully created, THE System SHALL redirect the Member to a booking success page displaying the booking details. IF booking creation fails, THE System SHALL not display the success page.
7. THE Booking_Service SHALL prevent a Member from creating overlapping Bookings for the same date and time slot.

---

### Requirement 8: Member Dashboard — My Bookings

**User Story:** As a Member, I want to view and manage my bookings, so that I can track upcoming reservations and cancel if needed.

#### Acceptance Criteria

1. THE System SHALL display a list of upcoming Bookings for the authenticated Member on the Member Dashboard.
2. THE System SHALL display a list of past Bookings for the authenticated Member on the Member Dashboard.
3. WHEN a Member selects an upcoming Booking, THE System SHALL display the booking details including court name, date, time slot, and status.
4. WHEN a Member cancels an upcoming Booking, THE Booking_Service SHALL update the Booking status to "Cancelled" and release the Time_Slot.
5. WHEN a Member cancels an upcoming Booking, THE Booking_Service SHALL send a cancellation confirmation notification to the Member's email address.

---

### Requirement 9: Member Profile Management

**User Story:** As a Member, I want to update my profile information, so that my account details remain accurate.

#### Acceptance Criteria

1. THE System SHALL display a profile edit form with fields for full name and contact number on the Profile page.
2. WHEN a Member submits the profile form with valid data, THE System SHALL update the Member's profile record and display a success message.
3. WHEN a Member submits the profile form with an empty full name field, THE System SHALL display an inline validation error on the full name field.

---

### Requirement 10: Admin Dashboard Overview

**User Story:** As an Admin, I want to see an overview of today's activity, so that I can monitor court operations at a glance.

#### Acceptance Criteria

1. THE Admin_Panel SHALL display a dashboard with summary cards showing: total bookings for today, total active Members, and total available Courts.
2. THE Admin_Panel SHALL display a recent activity feed showing the latest booking actions on the dashboard.
3. THE Admin_Panel SHALL display a calendar view of bookings on the dashboard.

---

### Requirement 11: Admin Booking Management

**User Story:** As an Admin, I want to manage all member bookings, so that I can approve, cancel, or reschedule reservations as needed.

#### Acceptance Criteria

1. THE Admin_Panel SHALL display a list of all Bookings with columns for member name, court name, date, time slot, and status.
2. WHEN an Admin approves a Booking with "Pending" status, THE Booking_Service SHALL update the Booking status to "Confirmed" and notify the Member by email. WHEN an Admin initiates multiple actions on the same Booking before the first action completes, THE System SHALL process only the first action and ignore subsequent action requests until the Booking state is updated.
3. WHEN an Admin cancels a Booking, THE Booking_Service SHALL update the Booking status to "Cancelled", release the Time_Slot, and notify the Member by email.
4. WHEN an Admin reschedules a Booking, THE Booking_Service SHALL update the Booking's date and time slot, maintain the Booking record, and notify the Member by email.
5. THE Admin_Panel SHALL provide search and filter controls for Bookings by date range, court, member name, and status.

---

### Requirement 12: Admin Court Management

**User Story:** As an Admin, I want to manage pickleball courts, so that court availability and schedules are accurate.

#### Acceptance Criteria

1. THE Admin_Panel SHALL display a list of all Courts with their names, operating hours, and current status.
2. WHEN an Admin creates a new Court record, THE System SHALL require court name and operating hours, and save the record to the database.
3. WHEN an Admin updates a Court's operating hours, THE System SHALL update the Court record and reflect the new hours in the booking flow.
4. WHEN an Admin marks a Court as under maintenance, THE System SHALL set the Court status to "Unavailable" and prevent new Bookings for that Court.
5. WHEN an Admin specifies unavailable dates for a Court, THE Booking_Service SHALL exclude those dates from the available booking calendar for that Court.

---

### Requirement 13: Admin Website Content Management

**User Story:** As an Admin, I want to edit public-facing website content from the Admin Panel, so that the website stays current without requiring code changes.

#### Acceptance Criteria

1. THE Admin_Panel SHALL provide an editor interface for the following Website_Content sections: hero banner (headline, subheading, button text), about section, contact details, operating hours, court rates, and FAQ.
2. WHEN an Admin saves changes to a Website_Content record, THE System SHALL persist the updated content and reflect it on the corresponding public page within one page load.
3. THE Admin_Panel SHALL display a preview of the public page content before the Admin saves changes.

---

### Requirement 14: Admin Gallery Management

**User Story:** As an Admin, I want to manage the image gallery, so that the public website displays relevant and up-to-date photos.

#### Acceptance Criteria

1. THE Admin_Panel SHALL allow an Admin to upload image files to the Gallery, storing them in Supabase Storage.
2. THE Admin_Panel SHALL display all Gallery images with options to delete individual images.
3. WHEN an Admin deletes a Gallery image, THE System SHALL remove the image from Supabase Storage and from the Gallery record.
4. THE Admin_Panel SHALL allow an Admin to reorder Gallery images by setting a display order value.
5. THE System SHALL display Gallery images on the public home page in the order defined by the Admin.

---

### Requirement 15: Admin Contact Message Management

**User Story:** As an Admin, I want to view and manage contact form submissions, so that I can respond to guest and member inquiries.

#### Acceptance Criteria

1. THE Admin_Panel SHALL display an inbox of all Contact_Messages with columns for sender name, email, submission date, and reply status.
2. WHEN an Admin marks a Contact_Message as replied, THE System SHALL update the Contact_Message reply status to "Replied".
3. WHEN an Admin archives a Contact_Message, THE System SHALL update the Contact_Message status to "Archived", remove it from the default inbox view, and override any reply status change attempted in the same action.

---

### Requirement 16: Admin Reports

**User Story:** As an Admin, I want to view and export booking and activity reports, so that I can analyze Sky Court's operational performance.

#### Acceptance Criteria

1. THE Admin_Panel SHALL provide a Reports section with selectable time ranges: daily, weekly, and monthly.
2. THE Reports section SHALL display the following metrics for the selected time range: total bookings, bookings per court, peak booking hours, cancelled bookings count, and new member registrations.
3. WHEN an Admin selects Export to Excel, THE System SHALL generate and download an XLSX file containing the report data for the selected time range.
4. WHEN an Admin selects Export to PDF, THE System SHALL generate and download a PDF file containing the report data for the selected time range.

---

### Requirement 17: Admin Member Management

**User Story:** As an Admin, I want to view and manage member accounts, so that I can assist members and maintain account quality.

#### Acceptance Criteria

1. THE Admin_Panel SHALL display a list of all Member accounts with columns for name, email, registration date, and account status.
2. WHEN an Admin deactivates a Member account, THE System SHALL update the account status to "Inactive" and prevent that Member from logging in.
3. WHEN an Admin reactivates a Member account with "Inactive" status, THE System SHALL update the account status to "Active" and restore login access. IF the Member account is already "Active", THE System SHALL display an error message and prevent the reactivation action.

---

### Requirement 18: Super Admin — Admin Account Management

**User Story:** As a Super_Admin, I want to create and manage Admin accounts, so that I can delegate administrative responsibilities.

#### Acceptance Criteria

1. THE System SHALL allow a Super_Admin to create new Admin accounts by providing a name, email address, and initial password.
2. WHEN a Super_Admin creates an Admin account, THE System SHALL assign the Admin Role to the new account.
3. THE System SHALL allow a Super_Admin to deactivate or reactivate Admin accounts.
4. WHEN a Super_Admin deactivates an Admin account, THE System SHALL prevent that Admin from logging in and immediately terminate all active sessions for that Admin account.

---

### Requirement 19: Super Admin — Role and Permission Management

**User Story:** As a Super_Admin, I want to manage roles and permissions, so that I can control what each Role can access within the system.

#### Acceptance Criteria

1. THE System SHALL display a list of all Roles with their associated permissions in the Super Admin panel.
2. WHEN a Super_Admin modifies the permissions for a Role and active user sessions exist, THE System SHALL update all access control checks for users assigned to that Role within the current session. IF no active sessions exist at the time of modification, THE System SHALL apply the updated permissions on the next session creation for users in that Role.
3. THE System SHALL prevent the Super_Admin Role's core permissions from being removed to avoid system lockout.

---

### Requirement 20: Super Admin — Audit Logs

**User Story:** As a Super_Admin, I want to view audit logs, so that I can trace significant system actions for security and compliance purposes.

#### Acceptance Criteria

1. THE System SHALL generate an Audit_Log entry for each of the following actions: user login, user logout, booking creation, booking cancellation, booking approval, admin account creation, role permission change, and database backup.
2. THE System SHALL display Audit_Log entries in the Super Admin panel with columns for timestamp, user, action type, and affected record identifier.
3. THE System SHALL allow a Super_Admin to filter Audit_Log entries by date range, user, and action type.

---

### Requirement 21: Super Admin — Database Backup

**User Story:** As a Super_Admin, I want to trigger a database backup, so that data can be recovered in the event of data loss.

#### Acceptance Criteria

1. THE System SHALL provide a manual backup trigger in the Super Admin panel.
2. WHEN a Super_Admin triggers a backup, THE System SHALL initiate a Supabase database export and display the backup status (in progress, completed, failed) to the Super_Admin.
3. WHEN a backup actually completes, THE System SHALL record the completion timestamp and update the backup status to "Completed" simultaneously, then display both in the backup history list.
4. WHEN a backup fails, THE System SHALL display an error message describing the failure reason.

---

### Requirement 22: Super Admin — Website Settings and System Configuration

**User Story:** As a Super_Admin, I want to manage global website settings and system configuration, so that I can control system-wide behavior.

#### Acceptance Criteria

1. THE System SHALL allow a Super_Admin to update global settings including site name, contact email, and maintenance mode flag.
2. WHEN maintenance mode is enabled by a Super_Admin, THE System SHALL display a maintenance message to all Guests and Members and restrict access to public pages.
3. WHEN maintenance mode is disabled by a Super_Admin, THE System SHALL immediately clear the maintenance message and restore normal public access to all pages.

---

### Requirement 23: Navigation and Layout

**User Story:** As any user, I want a consistent navigation experience, so that I can move between pages and features efficiently.

#### Acceptance Criteria

1. THE System SHALL display a top navigation bar on all public pages with links to: Home, Book a Court, Locate Us, Contact Us, Login, and Register.
2. WHEN an authenticated Member views any page, THE System SHALL display the Member Dashboard link and a Logout button in the navigation bar and SHALL NOT display Login or Register links alongside the Logout button.
3. WHEN an authenticated Admin or Super_Admin views any page, THE System SHALL display an Admin Panel link in the navigation bar and SHALL NOT display Login or Register links.
4. THE System SHALL display a responsive navigation menu that collapses into a mobile-friendly menu on screen widths below 768 pixels.
5. THE Admin_Panel SHALL display a persistent sidebar navigation with links to: Dashboard, Bookings, Courts, Website, Gallery, Users, Reports, and Settings.
6. WHERE the authenticated user is a Super_Admin, THE Admin_Panel sidebar SHALL additionally display links to: Admins, Roles, Permissions, Audit Logs, Database Backup, and Website Settings.
