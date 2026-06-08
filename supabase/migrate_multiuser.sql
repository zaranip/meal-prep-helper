-- ============================================================================
-- MULTI-USER MIGRATION — per-account isolation for custom data, and lock down
-- the shared template tables so a public sign-up can't edit/delete them.
--
-- After this + enabling public sign-up:
--   * Each account sees/edits ONLY its own custom recipes & ingredients.
--   * Everyone (incl. signed-out) sees the shared pre-loaded templates
--     (stock_* tables + week_plans rows with user_id IS NULL).
--   * stock_* / packaging / app_config are READ-ONLY to all clients — you manage
--     them from the Supabase SQL editor (service role bypasses RLS).
--
-- RUN ORDER (see BACKEND_SETUP / the runbook):
--   1. Run THIS script.
--   2. Claim your existing custom data (the UPDATEs at the BOTTOM — fill in your uid).
--   3. Authentication -> Providers -> Email -> ENABLE public sign-ups (do this LAST).
-- Idempotent: safe to re-run.
-- ============================================================================

-- 1. Ownership columns -------------------------------------------------------
alter table recipes     add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid();
alter table ingredients add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid();
alter table week_plans  add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid();

-- 2. ingredients: dedup per-user instead of globally (each account can have its
--    own row for the same USDA food). Replace the global unique with (user, fdc).
alter table ingredients drop constraint if exists ingredients_usda_fdc_id_key;
drop index if exists ingredients_usda_fdc_id_key;
create unique index if not exists ingredients_user_fdc_uniq on ingredients(user_id, usda_fdc_id);

-- 3. RLS: recipes — own only (authenticated). Signed-out clients see no custom recipes.
alter table recipes enable row level security;
drop policy if exists "public read recipes"  on recipes;
drop policy if exists "auth write recipes"    on recipes;
drop policy if exists "own read recipes"      on recipes;
drop policy if exists "own write recipes"     on recipes;
create policy "own read recipes"  on recipes for select to authenticated using (user_id = auth.uid());
create policy "own write recipes" on recipes for all    to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 4. RLS: ingredients — own only.
alter table ingredients enable row level security;
drop policy if exists "public read ingredients" on ingredients;
drop policy if exists "auth write ingredients"   on ingredients;
drop policy if exists "own read ingredients"     on ingredients;
drop policy if exists "own write ingredients"    on ingredients;
create policy "own read ingredients"  on ingredients for select to authenticated using (user_id = auth.uid());
create policy "own write ingredients" on ingredients for all    to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 5. RLS: recipe_ingredients — follows the parent recipe's owner.
alter table recipe_ingredients enable row level security;
drop policy if exists "public read recipe_ingredients" on recipe_ingredients;
drop policy if exists "auth write recipe_ingredients"   on recipe_ingredients;
drop policy if exists "own read recipe_ingredients"     on recipe_ingredients;
drop policy if exists "own write recipe_ingredients"    on recipe_ingredients;
create policy "own read recipe_ingredients"  on recipe_ingredients for select to authenticated
  using (exists (select 1 from recipes r where r.id = recipe_id and r.user_id = auth.uid()));
create policy "own write recipe_ingredients" on recipe_ingredients for all to authenticated
  using (exists (select 1 from recipes r where r.id = recipe_id and r.user_id = auth.uid()))
  with check (exists (select 1 from recipes r where r.id = recipe_id and r.user_id = auth.uid()));

-- 6. week_plans: week numbers are PER-USER now (was a global `week` PK, which would collide
--    when two accounts each create "week 5"). Surrogate id PK + unique (user_id, week).
alter table week_plans add column if not exists id uuid default gen_random_uuid();
update week_plans set id = gen_random_uuid() where id is null;
alter table week_plans alter column id set not null;
alter table week_plans drop constraint if exists week_plans_pkey;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'week_plans_pkey') then
    alter table week_plans add primary key (id);
  end if;
end $$;
create unique index if not exists week_plans_user_week_uniq on week_plans(user_id, week);

--    RLS: shared seed (user_id IS NULL) readable by everyone; each account sees/writes its own.
alter table week_plans enable row level security;
drop policy if exists "public read week_plans" on week_plans;
drop policy if exists "auth write week_plans"   on week_plans;
drop policy if exists "read week_plans"         on week_plans;
drop policy if exists "write own week_plans"    on week_plans;
create policy "read week_plans"      on week_plans for select using (user_id is null or user_id = auth.uid());
create policy "write own week_plans" on week_plans for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 7. app_settings: per-user (was a single id=1 row). Each account gets its own row.
alter table app_settings add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid();
delete from app_settings where user_id is null;          -- drop the old shared singleton row (re-syncs from localStorage)
alter table app_settings drop constraint if exists app_settings_singleton;
alter table app_settings drop constraint if exists app_settings_pkey;
alter table app_settings alter column id drop not null;
alter table app_settings alter column id drop default;
create unique index if not exists app_settings_user_uniq on app_settings(user_id);
alter table app_settings enable row level security;
drop policy if exists "public read app_settings" on app_settings;
drop policy if exists "auth write app_settings"   on app_settings;
drop policy if exists "own app_settings"          on app_settings;
create policy "own app_settings" on app_settings for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 8. LOCK DOWN the shared template/config tables: read-only to all clients.
--    (You manage these via the SQL editor — the service role bypasses RLS.)
do $$
declare t text;
begin
  foreach t in array array['stock_ingredients','stock_recipes','stock_recipe_ingredients','packaging','app_config','meal_prep_plans']
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists "auth write %1$s" on %1$I;', t);         -- remove the everyone-can-write hole
    execute format('drop policy if exists "public read %1$s" on %1$I;', t);
    execute format('create policy "public read %1$s" on %1$I for select using (true);', t);
  end loop;
end $$;

-- ============================================================================
-- 9. CLAIM YOUR EXISTING CUSTOM DATA  (run AFTER the above, once, with YOUR uid)
--    Find your uid: Supabase -> Authentication -> Users -> copy the User UID.
--    Then uncomment and replace <YOUR-USER-UID>:
--
-- update ingredients set user_id = '<YOUR-USER-UID>' where user_id is null;
-- update recipes     set user_id = '<YOUR-USER-UID>' where user_id is null;
--    (Do NOT claim week_plans: leaving its seed rows user_id IS NULL keeps them
--     shared templates for everyone.)
-- ============================================================================
