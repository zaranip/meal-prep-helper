/* Rebuilds the app's data globals (ingredientDB, recipes, weeksPlan, snacksBaseline,
 * packagingDB) from plain Supabase row arrays — the SHAPES the existing engine expects.
 *
 * Single source of truth used by BOTH the browser data-layer (js/data-layer.js) and the
 * offline lossless verifier (scripts/verify-seed.js), so what we verify is what ships.
 *
 * PostgREST returns `numeric` columns as STRINGS (to preserve precision); JSONB keeps real
 * numbers. So we coerce top-level numeric columns with Number() and trust JSONB as-is. */
(function (root) {
    'use strict';
    function num(x) { return x == null ? x : Number(x); }

    function reconstructFromRows(t) {
        t = t || {};

        // ingredientDB[name] = { cal, prot, fat, fib, carb, conversions }
        const ingredientDB = {};
        (t.stock_ingredients || []).forEach(function (r) {
            ingredientDB[r.name] = {
                cal: num(r.cal), prot: num(r.prot), fat: num(r.fat), fib: num(r.fib), carb: num(r.carb),
                conversions: r.conversions || {}
            };
        });

        // group recipe ingredient lines by recipe, ordered by position
        const byRecipe = {};
        (t.stock_recipe_ingredients || []).slice()
            .sort(function (a, b) { return (a.position || 0) - (b.position || 0); })
            .forEach(function (ri) {
                (byRecipe[ri.recipe_slug] = byRecipe[ri.recipe_slug] || [])
                    .push({ name: ri.name, amount: num(ri.amount), unit: ri.unit });
            });

        // recipes[slug] = { id, title, desc, type, week, baseMacros, ingredients, steps, freezerTips, scalingTip? }
        const recipes = {};
        (t.stock_recipes || []).slice()
            .sort(function (a, b) { return (a.position || 0) - (b.position || 0); })
            .forEach(function (r) {
                const rec = {
                    id: r.slug, title: r.title, desc: r.desc, type: r.type,
                    week: (r.week || []).map(Number),
                    baseMacros: r.base_macros,
                    ingredients: byRecipe[r.slug] || [],
                    steps: r.steps || [],
                    freezerTips: r.freezer_tips
                };
                if (r.scaling_tip != null && r.scaling_tip !== '') rec.scalingTip = r.scaling_tip;
                recipes[r.slug] = rec;
            });

        // weeksPlan['1'] = { breakfast, lunch, dinner, dessert }
        const weeksPlan = {};
        (t.week_plans || []).slice()
            .sort(function (a, b) { return a.week - b.week; })
            .forEach(function (w) {
                weeksPlan[String(w.week)] = { breakfast: w.breakfast, lunch: w.lunch, dinner: w.dinner, dessert: w.dessert };
            });

        const cfgRow = Array.isArray(t.app_config) ? t.app_config[0] : t.app_config;
        const cfg = cfgRow || {};
        const snacksBaseline = cfg.snacks_baseline || {};

        // packagingDB[name] = { retailUnit, unitLabel, gramsPerUnit, unitsPerCase, caseLabel, verified }
        const packagingDB = {};
        (t.packaging || []).forEach(function (p) {
            packagingDB[p.name] = {
                retailUnit: p.retail_unit, unitLabel: p.unit_label, gramsPerUnit: num(p.grams_per_unit),
                unitsPerCase: p.units_per_case, caseLabel: p.case_label, verified: !!p.verified
            };
        });

        return { ingredientDB: ingredientDB, recipes: recipes, weeksPlan: weeksPlan, snacksBaseline: snacksBaseline, packagingDB: packagingDB, config: cfg };
    }

    // Converts USDA-builder recipe rows (recipes + recipe_ingredients + ingredients) into the
    // app recipe shape, keyed 'sb_<id>', so custom recipes appear alongside stock ones on every
    // page. `_m100` (per-100g macros) is attached so the scaler can recompute on edit.
    function customRecipesToApp(rows) {
        const cap = function (s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; };
        const r1 = function (v) { return Math.round(v * 10) / 10; };
        const out = {};
        (rows || []).forEach(function (r) {
            const ings = (r.recipe_ingredients || []).map(function (ri) {
                const p = ri.ingredients || {};
                return {
                    name: p.name || 'Ingredient', amount: num(ri.weight_in_grams) || 0, unit: 'g',
                    _m100: {
                        cal: num(p.calories_per_100g) || 0, prot: num(p.protein_per_100g) || 0, fat: num(p.fat_per_100g) || 0,
                        fib: num(p.fiber_per_100g) || 0, carb: num(p.carbs_per_100g) || 0
                    }
                };
            });
            const bm = { cal: 0, prot: 0, fat: 0, fib: 0, carb: 0 };
            ings.forEach(function (i) { const f = i.amount / 100, m = i._m100; bm.cal += m.cal * f; bm.prot += m.prot * f; bm.fat += m.fat * f; bm.fib += m.fib * f; bm.carb += m.carb * f; });
            out['sb_' + r.id] = {
                id: 'sb_' + r.id, sbId: r.id, custom: true, mealType: r.meal_type || 'snack',
                title: r.title, desc: 'Custom recipe — USDA estimates. Confirm against packages.',
                type: cap(r.meal_type || 'Snack'),
                baseMacros: { cal: Math.round(bm.cal), prot: r1(bm.prot), fat: r1(bm.fat), fib: r1(bm.fib), carb: r1(bm.carb) },
                ingredients: ings,
                steps: r.instructions || [],
                freezerTips: r.freezer_tips || 'No freezer notes for this custom recipe.'
            };
        });
        return out;
    }

    root.reconstructFromRows = reconstructFromRows;
    root.customRecipesToApp = customRecipesToApp;
    if (typeof module !== 'undefined' && module.exports) module.exports = { reconstructFromRows: reconstructFromRows, customRecipesToApp: customRecipesToApp };
})(typeof window !== 'undefined' ? window : globalThis);
