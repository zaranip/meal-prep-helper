-- Adds a free-text "notes" field to custom recipes (tweaks / substitutions / reminders).
-- Shared between the Add Recipe tab (builder) and the Recipes-tab scaler's Notes box.
-- No new RLS policy needed: the existing public-read / authenticated-write policies on
-- `recipes` already cover this column (the builder already UPDATEs this table).
-- Run once in the Supabase SQL editor.

alter table recipes add column if not exists notes text;
