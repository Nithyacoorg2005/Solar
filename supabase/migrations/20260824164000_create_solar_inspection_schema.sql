/*
# Solar Panel Fault Detection System - Database Schema

1. Purpose
   Stores inspection records and the configurable inspection schedule for the
   AI-Based Fault Detection System for Solar Panels. The frontend reads and
   writes this data directly via the Supabase anon key (single-tenant, no auth).

2. New Tables
   - `inspections`
     - `id` (uuid, primary key)
     - `panel_id` (text, not null) — the panel/site being monitored
     - `image_path` (text) — storage path or data URL of the captured image
     - `inspection_at` (timestamptz, not null) — when the inspection ran
     - `prediction` (text) — model output class (e.g. Healthy, Crack, Hotspot)
     - `confidence` (numeric, nullable) — model confidence 0..1
     - `is_fault` (boolean, default false) — derived from prediction
     - `processing_status` (text, default 'pending') — pending|processing|completed|failed
     - `error_message` (text, nullable) — reason if processing failed
     - `notification_status` (text, default 'not_required') — not_required|sent|failed|skipped
     - `trigger_type` (text, default 'manual') — manual|scheduled
     - `raw_output` (jsonb, nullable) — full model response for debugging
     - `created_at` (timestamptz, default now())
   - `inspection_schedule`
     - `id` (uuid, primary key)
     - `panel_id` (text, not null) — panel/site this schedule applies to
     - `days_of_week` (int[], not null) — 0=Sun..6=Sat
     - `inspection_time` (text, not null) — HH:MM 24h
     - `camera_device` (text, default 'phone') — camera/device label
     - `is_active` (boolean, default true)
     - `updated_at` (timestamptz, default now())

3. Indexes
   - `idx_inspections_panel_inspected` on inspections(panel_id, inspection_at desc)
   - `idx_inspections_status` on inspections(processing_status)
   - `idx_schedule_panel` on inspection_schedule(panel_id)

4. Security
   - RLS enabled on both tables.
   - Single-tenant (no auth): policies allow anon + authenticated full CRUD,
     documented as intentionally public/shared data.
*/

CREATE TABLE IF NOT EXISTS inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  panel_id text NOT NULL,
  image_path text,
  inspection_at timestamptz NOT NULL DEFAULT now(),
  prediction text,
  confidence numeric(5,4),
  is_fault boolean NOT NULL DEFAULT false,
  processing_status text NOT NULL DEFAULT 'pending',
  error_message text,
  notification_status text NOT NULL DEFAULT 'not_required',
  trigger_type text NOT NULL DEFAULT 'manual',
  raw_output jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inspections_panel_inspected
  ON inspections (panel_id, inspection_at DESC);
CREATE INDEX IF NOT EXISTS idx_inspections_status
  ON inspections (processing_status);

CREATE TABLE IF NOT EXISTS inspection_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  panel_id text NOT NULL,
  days_of_week int[] NOT NULL DEFAULT ARRAY[1, 4]::int[],
  inspection_time text NOT NULL DEFAULT '09:00',
  camera_device text NOT NULL DEFAULT 'phone',
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schedule_panel
  ON inspection_schedule (panel_id);

ALTER TABLE inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_schedule ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_inspections" ON inspections;
CREATE POLICY "anon_select_inspections" ON inspections FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_inspections" ON inspections;
CREATE POLICY "anon_insert_inspections" ON inspections FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_inspections" ON inspections;
CREATE POLICY "anon_update_inspections" ON inspections FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_inspections" ON inspections;
CREATE POLICY "anon_delete_inspections" ON inspections FOR DELETE
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_schedule" ON inspection_schedule;
CREATE POLICY "anon_select_schedule" ON inspection_schedule FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_schedule" ON inspection_schedule;
CREATE POLICY "anon_insert_schedule" ON inspection_schedule FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_schedule" ON inspection_schedule;
CREATE POLICY "anon_update_schedule" ON inspection_schedule FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_schedule" ON inspection_schedule;
CREATE POLICY "anon_delete_schedule" ON inspection_schedule FOR DELETE
  TO anon, authenticated USING (true);
