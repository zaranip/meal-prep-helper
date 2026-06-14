-- ============================================================================
-- Meal Prep Dashboard — COMPLETE database schema (run once on a fresh project)
-- ----------------------------------------------------------------------------
-- This single file creates every table + the final multi-user security model.
-- Run it in the Supabase SQL Editor, then run `supabase/seed.sql` to load the
-- shared starter templates. Idempotent — safe to re-run.
--
-- DATA MODEL
--   * CUSTOM tables (ingredients / recipes / recipe_ingredients) are PRIVATE per
--     account — each signed-in user sees & edits only their own (RLS own-only).
--   * SHARED TEMPLATE tables (stock_* / packaging / app_config) are public-READ
--     and READ-ONLY to all clients — you edit them here in the SQL editor (the
--     service role bypasses RLS). They're the pre-loaded content everyone sees.
--   * week_plans is a hybrid: rows with user_id IS NULL are shared templates
--     (read-only to clients); each account also owns its own week numbers.
--   * app_settings holds each account's preferences/plan state (private).
--
-- SECURITY: the publishable/anon key in js/config.js is public on purpose —
-- security is these RLS policies, NOT hiding the key. NEVER use the secret /
-- service_role key in client code; it bypasses RLS.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ============================================================================
-- CUSTOM DATA — private per account
-- ============================================================================

-- Ingredients: per-user cache of USDA lookups + manually-entered foods.
create table if not exists ingredients (
    id                 uuid primary key default gen_random_uuid(),
    user_id            uuid references auth.users(id) on delete cascade default auth.uid(),
    usda_fdc_id        int,                            -- null for manual / fully-custom foods
    name               text not null,
    calories_per_100g  numeric(7,2) not null,
    protein_per_100g   numeric(6,2) not null,
    fat_per_100g       numeric(6,2) not null,
    carbs_per_100g     numeric(6,2) not null,
    fiber_per_100g     numeric(6,2) not null,
    data_type          text,                           -- 'Branded' / 'Foundation' / 'custom' …
    is_estimate        boolean not null default true,  -- true → "est." flag in the UI
    package_unit       text default 'g',
    package_weight_g   numeric(8,2),
    created_at         timestamptz not null default timezone('utc', now())
);
create unique index if not exists ingredients_user_fdc_uniq on ingredients(user_id, usda_fdc_id);

-- Recipes: per-user custom recipes (the "Add Recipe" tab).
create table if not exists recipes (
    id             uuid primary key default gen_random_uuid(),
    user_id        uuid references auth.users(id) on delete cascade default auth.uid(),
    title          text not null,
    description    text,
    instructions   text[] not null default '{}',
    base_servings  numeric(6,2) not null default 1.00,
    freezer_tips   text,
    meal_type      text check (meal_type in ('breakfast','meal','dessert','snack')),
    notes          text,
    target_kcal    numeric,                            -- NULL=auto(700; snacks as-entered), >0=target/serving, 0=as-entered
    created_at     timestamptz not null default timezone('utc', now())
);

-- Recipe ↔ ingredient links (absolute grams for precise macro math).
create table if not exists recipe_ingredients (
    id               uuid primary key default gen_random_uuid(),
    recipe_id        uuid not null references recipes(id) on delete cascade,
    ingredient_id    uuid not null references ingredients(id) on delete restrict,
    quantity_value   numeric(8,2) not null,
    quantity_unit    text not null,
    weight_in_grams  numeric(8,2) not null
);
create index if not exists idx_recipe_ingredients_recipe on recipe_ingredients(recipe_id);

-- ============================================================================
-- SHARED TEMPLATES — public read, read-only to clients (you seed/edit them here)
-- ============================================================================

-- Verified ingredient database (per a reference serving + a unit conversions map).
create table if not exists stock_ingredients (
    name        text primary key,                      -- lowercase = the join key
    cal         numeric not null,
    prot        numeric not null,
    fat         numeric not null,
    fib         numeric not null,
    carb        numeric not null,
    conversions jsonb   not null default '{}'::jsonb
);

-- Pre-loaded recipes. base_macros stored verbatim (never recomputed on load).
create table if not exists stock_recipes (
    slug         text primary key,
    title        text not null,
    "desc"       text,
    type         text,                                 -- Breakfast | Meal | Dessert | Snack
    week         int[]  not null default '{}',
    base_macros  jsonb  not null,
    steps        text[] not null default '{}',
    freezer_tips text,
    scaling_tip  text,
    position     int
);

create table if not exists stock_recipe_ingredients (
    id          bigint generated by default as identity primary key,
    recipe_slug text not null references stock_recipes(slug) on delete cascade,
    position    int  not null,
    name        text not null,
    amount      numeric not null,
    unit        text not null
);
create index if not exists idx_sri_recipe on stock_recipe_ingredients(recipe_slug);

-- Retail packaging (how bulk items are sold) — drives the shopping list buy/use lines.
create table if not exists packaging (
    name           text primary key,
    retail_unit    text,
    unit_label     text,
    grams_per_unit numeric,
    units_per_case int,
    case_label     text,
    verified       boolean default false
);

-- Single-row app config (baseline snack + defaults).
create table if not exists app_config (
    id                 int primary key default 1,
    snacks_baseline    jsonb not null,
    base_calorie_goal  int not null default 1800,
    default_prep_days  int not null default 7,
    daily_snack_key    text,
    daily_snack_count  int,
    constraint app_config_singleton check (id = 1)
);

-- ============================================================================
-- WEEK TEMPLATES — shared seed rows (user_id IS NULL) + per-account weeks
-- ============================================================================
-- Surrogate id PK so week numbers can repeat across accounts; unique per user.
create table if not exists week_plans (
    id        uuid primary key default gen_random_uuid(),
    user_id   uuid references auth.users(id) on delete cascade default auth.uid(), -- NULL = shared template
    week      int  not null,
    breakfast text,
    lunch     text,
    dinner    text,
    dessert   text,
    snack     text                                     -- recipe key or 'none'
);
create unique index if not exists week_plans_user_week_uniq on week_plans(user_id, week);

-- ============================================================================
-- USER SETTINGS — each account's plan/preferences (cross-device sync)
-- ============================================================================
create table if not exists app_settings (
    user_id    uuid primary key references auth.users(id) on delete cascade default auth.uid(),
    data       jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now()
);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Custom tables: each account sees/writes ONLY its own rows.
alter table ingredients        enable row level security;
alter table recipes            enable row level security;
alter table recipe_ingredients enable row level security;

drop policy if exists "own read ingredients"  on ingredients;
drop policy if exists "own write ingredients" on ingredients;
create policy "own read ingredients"  on ingredients for select to authenticated using (user_id = auth.uid());
create policy "own write ingredients" on ingredients for all    to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own read recipes"  on recipes;
drop policy if exists "own write recipes" on recipes;
create policy "own read recipes"  on recipes for select to authenticated using (user_id = auth.uid());
create policy "own write recipes" on recipes for all    to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- recipe_ingredients follow their parent recipe's owner.
drop policy if exists "own read recipe_ingredients"  on recipe_ingredients;
drop policy if exists "own write recipe_ingredients" on recipe_ingredients;
create policy "own read recipe_ingredients"  on recipe_ingredients for select to authenticated
  using (exists (select 1 from recipes r where r.id = recipe_id and r.user_id = auth.uid()));
create policy "own write recipe_ingredients" on recipe_ingredients for all to authenticated
  using (exists (select 1 from recipes r where r.id = recipe_id and r.user_id = auth.uid()))
  with check (exists (select 1 from recipes r where r.id = recipe_id and r.user_id = auth.uid()));

-- Shared template/config tables: public READ, read-only to clients (no write policy).
do $$
declare t text;
begin
  foreach t in array array['stock_ingredients','stock_recipes','stock_recipe_ingredients','packaging','app_config']
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists "public read %1$s" on %1$I;', t);
    execute format('drop policy if exists "auth write %1$s"  on %1$I;', t);   -- remove any legacy write hole
    execute format('create policy "public read %1$s" on %1$I for select using (true);', t);
  end loop;
end $$;

-- week_plans: shared seed (NULL) readable by everyone; each account reads/writes its own.
alter table week_plans enable row level security;
drop policy if exists "read week_plans"      on week_plans;
drop policy if exists "write own week_plans" on week_plans;
create policy "read week_plans"      on week_plans for select using (user_id is null or user_id = auth.uid());
create policy "write own week_plans" on week_plans for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- app_settings: own only.
alter table app_settings enable row level security;
drop policy if exists "own app_settings" on app_settings;
create policy "own app_settings" on app_settings for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
