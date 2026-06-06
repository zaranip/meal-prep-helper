-- Adds a free-text "description" to custom recipes (shown under the title on the Recipes/Dashboard
-- views, editable in both the Add Recipe tab and the Recipes-tab editor). No new RLS needed — the
-- existing public-read / authenticated-write policies on `recipes` cover it. Reads degrade
-- gracefully without it (a friendly placeholder is shown); editing/saving a description needs it.
-- Run once in the Supabase SQL editor.

alter table recipes add column if not exists description text;
