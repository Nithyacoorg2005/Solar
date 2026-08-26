/*
# Add user authentication to inspection schema

1. Changes
   - Add `user_id` column to `inspections` (uuid, defaults to auth.uid())
   - Add `user_id` column to `inspection_schedule` (uuid, defaults to auth.uid())
   - Both columns are nullable so existing rows (if any) are not lost
   - New rows automatically get the authenticated user's ID via DEFAULT auth.uid()
2. Security
   - Replace anon-accessible policies with authenticated-only ownership-scoped policies
   - Users can only read/write inspections and schedules they own
   - auth.uid() = user_id check on all CRUD operations
   - SELECT uses USING, INSERT uses WITH CHECK, UPDATE uses both, DELETE uses USING
*/

ALTER TABLE inspections ADD COLUMN IF NOT EXISTS user_id uuid DEFAULT auth.uid();
ALTER TABLE inspection_schedule ADD COLUMN IF NOT EXISTS user_id uuid DEFAULT auth.uid();

-- Drop old anon-accessible policies on inspections
DROP POLICY IF EXISTS "anon_select_inspections" ON inspections;
DROP POLICY IF EXISTS "anon_insert_inspections" ON inspections;
DROP POLICY IF EXISTS "anon_update_inspections" ON inspections;
DROP POLICY IF EXISTS "anon_delete_inspections" ON inspections;

-- New authenticated-only ownership-scoped policies on inspections
DROP POLICY IF EXISTS "select_own_inspections" ON inspections;
CREATE POLICY "select_own_inspections" ON inspections FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_inspections" ON inspections;
CREATE POLICY "insert_own_inspections" ON inspections FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_inspections" ON inspections;
CREATE POLICY "update_own_inspections" ON inspections FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_inspections" ON inspections;
CREATE POLICY "delete_own_inspections" ON inspections FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Drop old anon-accessible policies on inspection_schedule
DROP POLICY IF EXISTS "anon_select_schedule" ON inspection_schedule;
DROP POLICY IF EXISTS "anon_insert_schedule" ON inspection_schedule;
DROP POLICY IF EXISTS "anon_update_schedule" ON inspection_schedule;
DROP POLICY IF EXISTS "anon_delete_schedule" ON inspection_schedule;

-- New authenticated-only ownership-scoped policies on inspection_schedule
DROP POLICY IF EXISTS "select_own_schedule" ON inspection_schedule;
CREATE POLICY "select_own_schedule" ON inspection_schedule FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_schedule" ON inspection_schedule;
CREATE POLICY "insert_own_schedule" ON inspection_schedule FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_schedule" ON inspection_schedule;
CREATE POLICY "update_own_schedule" ON inspection_schedule FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_schedule" ON inspection_schedule;
CREATE POLICY "delete_own_schedule" ON inspection_schedule FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
