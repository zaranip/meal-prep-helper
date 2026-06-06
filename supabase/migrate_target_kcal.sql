-- Per-recipe scaling target for custom recipes (Add Recipe page).
--   NULL  -> auto: 700 kcal/serving for meals/breakfast/dessert; snacks kept as entered.
--   > 0   -> normalize each serving to that many kcal (rice fills to target, else scale whole).
--   0     -> keep exactly as entered (no scaling).
-- Reads degrade gracefully (data-layer SELECTs '*'); only SAVING a custom target needs this column.
-- Run once in the Supabase SQL editor.

alter table recipes add column if not exists target_kcal numeric;
