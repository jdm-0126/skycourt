-- ---------------------------------------------------------------------------
-- Club Reservations
--
-- Supports the club/group court booking feature:
--   - club_reservations: the parent record (member, date, time, cost, status)
--   - club_reservation_courts: junction table linking reservations to courts
--
-- Rules enforced at application level:
--   - Rate: ₱400 per court per hour
--   - Minimum 4 hours
--   - Multiple courts allowed
--   - Can only be cancelled (not rescheduled)
--   - Courts can be reduced up to the day before the reservation date
-- ---------------------------------------------------------------------------

-- Club reservation status type
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'club_reservation_status') THEN
    CREATE TYPE club_reservation_status AS ENUM ('pending', 'confirmed', 'cancelled');
  END IF;
END$$;

-- Parent reservation record
CREATE TABLE IF NOT EXISTS public.club_reservations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id        UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reservation_date DATE NOT NULL,
  start_time       TIME NOT NULL,
  end_time         TIME NOT NULL,
  duration_hours   INTEGER NOT NULL CHECK (duration_hours >= 4),
  num_courts       INTEGER NOT NULL CHECK (num_courts >= 1),
  total_cost       NUMERIC(10, 2) NOT NULL CHECK (total_cost >= 0),
  status           club_reservation_status NOT NULL DEFAULT 'pending',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Junction table: which courts are in which reservation
CREATE TABLE IF NOT EXISTS public.club_reservation_courts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id   UUID NOT NULL REFERENCES public.club_reservations(id) ON DELETE CASCADE,
  court_id         UUID NOT NULL REFERENCES public.courts(id) ON DELETE CASCADE,
  UNIQUE (reservation_id, court_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_club_reservations_member_id
  ON public.club_reservations(member_id);

CREATE INDEX IF NOT EXISTS idx_club_reservations_date
  ON public.club_reservations(reservation_date);

CREATE INDEX IF NOT EXISTS idx_club_reservation_courts_reservation_id
  ON public.club_reservation_courts(reservation_id);

CREATE INDEX IF NOT EXISTS idx_club_reservation_courts_court_id
  ON public.club_reservation_courts(court_id);

-- ---------------------------------------------------------------------------
-- RLS Policies
-- ---------------------------------------------------------------------------

ALTER TABLE public.club_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_reservation_courts ENABLE ROW LEVEL SECURITY;

-- Members can view and manage their own reservations
CREATE POLICY "Members can view own club reservations"
  ON public.club_reservations FOR SELECT
  USING (member_id = auth.uid());

CREATE POLICY "Members can insert own club reservations"
  ON public.club_reservations FOR INSERT
  WITH CHECK (member_id = auth.uid());

CREATE POLICY "Members can update own club reservations"
  ON public.club_reservations FOR UPDATE
  USING (member_id = auth.uid());

-- Members can view courts linked to their reservations
CREATE POLICY "Members can view own club reservation courts"
  ON public.club_reservation_courts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.club_reservations cr
      WHERE cr.id = reservation_id
        AND cr.member_id = auth.uid()
    )
  );

CREATE POLICY "Members can insert courts for own reservations"
  ON public.club_reservation_courts FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.club_reservations cr
      WHERE cr.id = reservation_id
        AND cr.member_id = auth.uid()
    )
  );

CREATE POLICY "Members can delete courts from own reservations"
  ON public.club_reservation_courts FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.club_reservations cr
      WHERE cr.id = reservation_id
        AND cr.member_id = auth.uid()
    )
  );
