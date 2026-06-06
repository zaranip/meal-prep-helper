-- Adds a per-week "snack" slot to the week templates (alongside breakfast / lunch / dinner /
-- dessert). Stores a recipe key (stock slug or sb_<uuid>), or 'none' for no snack.
-- Reads degrade gracefully without this (the app defaults a missing snack to 'none'); only the
-- Calendar "Save Week" upsert needs the column. Run once in the Supabase SQL editor.

alter table week_plans add column if not exists snack text;
