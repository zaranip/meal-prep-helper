-- ============================================================================
-- Meal Prep Planner — Supabase schema
-- ----------------------------------------------------------------------------
-- ACCESS MODEL: PUBLIC READ, OWNER-ONLY WRITE.
--   * Anyone (anon key) can SELECT recipes/ingredients — the app is shareable.
--   * Only a SIGNED-IN user can INSERT/UPDATE/DELETE.
--   * To make "signed in" mean *only you*: in the Supabase dashboard go to
--     Authentication -> Providers -> Email and DISABLE "Allow new users to sign
--     up", then create your single account. After that, "authenticated" = you.
--
-- This is what makes the public anon key safe to ship in the static site:
-- security comes from these RLS policies, not from hiding the key.
--
-- Run this whole script once in: Supabase Dashboard -> SQL Editor -> New query.
-- It is idempotent (safe to re-run).
-- ============================================================================

create extension if not exists "pgcrypto";

-- 1. Ingredients — caches USDA lookups and any fully-custom items -------------
create table if not exists ingredients (
    id                 uuid primary key default gen_random_uuid(),
    usda_fdc_id        int unique,                  -- null for 100% custom items
    name               text not null,
    calories_per_100g  numeric(7,2) not null,
    protein_per_100g   numeric(6,2) not null,
    fat_per_100g       numeric(6,2) not null,
    carbs_per_100g     numeric(6,2) not null,
    fiber_per_100g     numeric(6,2) not null,
    data_type          text,                        -- USDA dataType (Branded / Foundation / SR Legacy / Survey) or 'custom'
    is_estimate        boolean not null default true, -- macros not hand-verified -> flag in the UI
    package_unit       text default 'g',            -- e.g. 'carton', 'bag', 'g'
    package_weight_g   numeric(8,2),                -- retail unit size; NULL = unknown (never fabricate)
    created_at         timestamptz not null default timezone('utc', now())
);

-- 2. Recipes -----------------------------------------------------------------
create table if not exists recipes (
    id             uuid primary key default gen_random_uuid(),
    title          text not null,
    instructions   text[] not null default '{}',   -- step-by-step array
    base_servings  numeric(6,2) not null default 1.00,
    freezer_tips   text,
    meal_type      text check (meal_type in ('breakfast','meal','dessert','snack')),
    created_at     timestamptz not null default timezone('utc', now())
);

-- 3. Recipe <-> Ingredient mapping (fraction portions + units) ---------------
create table if not exists recipe_ingredients (
    id               uuid primary key default gen_random_uuid(),
    recipe_id        uuid not null references recipes(id) on delete cascade,
    ingredient_id    uuid not null references ingredients(id) on delete restrict,
    quantity_value   numeric(8,2) not null,         -- amount in the chosen unit
    quantity_unit    text not null,                 -- 'g','oz','tbsp','tsp','cup','whole'...
    weight_in_grams  numeric(8,2) not null          -- absolute grams, for precise macro math
);

-- 4. Weekly meal-prep plan configurations ------------------------------------
create table if not exists meal_prep_plans (
    id                   uuid primary key default gen_random_uuid(),
    week_number          int unique not null check (week_number between 1 and 4),
    breakfast_recipe_id  uuid references recipes(id) on delete set null,
    lunch_recipe_id      uuid references recipes(id) on delete set null,
    dinner_recipe_id     uuid references recipes(id) on delete set null,
    dessert_recipe_id    uuid references recipes(id) on delete set null,
    prep_days_default    int not null default 7
);

-- Performance indices --------------------------------------------------------
create index if not exists idx_recipe_ingredients_recipe on recipe_ingredients(recipe_id);
create index if not exists idx_ingredients_fdc           on ingredients(usda_fdc_id);

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table ingredients        enable row level security;
alter table recipes            enable row level security;
alter table recipe_ingredients enable row level security;
alter table meal_prep_plans    enable row level security;

-- Public read (anon + authenticated). Drop-then-create so the script is re-runnable.
drop policy if exists "public read ingredients"        on ingredients;
drop policy if exists "public read recipes"            on recipes;
drop policy if exists "public read recipe_ingredients" on recipe_ingredients;
drop policy if exists "public read meal_prep_plans"    on meal_prep_plans;

create policy "public read ingredients"        on ingredients        for select using (true);
create policy "public read recipes"            on recipes            for select using (true);
create policy "public read recipe_ingredients" on recipe_ingredients for select using (true);
create policy "public read meal_prep_plans"    on meal_prep_plans    for select using (true);

-- Writes (insert/update/delete) only for signed-in users.
-- With public sign-up disabled (see header), "authenticated" = only your account.
drop policy if exists "auth write ingredients"        on ingredients;
drop policy if exists "auth write recipes"            on recipes;
drop policy if exists "auth write recipe_ingredients" on recipe_ingredients;
drop policy if exists "auth write meal_prep_plans"    on meal_prep_plans;

create policy "auth write ingredients"        on ingredients        for all to authenticated using (true) with check (true);
create policy "auth write recipes"            on recipes            for all to authenticated using (true) with check (true);
create policy "auth write recipe_ingredients" on recipe_ingredients for all to authenticated using (true) with check (true);
create policy "auth write meal_prep_plans"    on meal_prep_plans    for all to authenticated using (true) with check (true);
