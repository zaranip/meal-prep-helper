-- ============================================================================
-- One-time migration: no Lunch/Dinner distinction — they're just "Meal".
-- Run once in the Supabase SQL Editor. Idempotent. Safe to run before or after
-- the app code change (the app also normalizes the display).
--
-- The constraint change is REQUIRED: saving a custom recipe with meal_type='meal'
-- would otherwise violate the old CHECK (which only allowed breakfast/lunch/dinner/
-- dessert/snack).
-- ============================================================================
begin;

-- Stock recipe badge value (cosmetic; the app also normalizes Lunch/Dinner -> Meal)
update stock_recipes set type = 'Meal' where type in ('Lunch', 'Dinner');

-- Custom (USDA-builder) recipes: collapse lunch/dinner -> meal, then widen the CHECK.
update recipes set meal_type = 'meal' where meal_type in ('lunch', 'dinner');

alter table recipes drop constraint if exists recipes_meal_type_check;
alter table recipes add constraint recipes_meal_type_check
    check (meal_type in ('breakfast', 'meal', 'dessert', 'snack'));

commit;
