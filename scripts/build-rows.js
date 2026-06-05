// Turns the in-memory data.js globals into plain Supabase row arrays (column shapes).
// SINGLE source of the row mapping — used by both gen-seed.js (emit SQL) and
// verify-seed.js (round-trip check), so the seed and the verification agree.
function buildRows(g) {
    const stock_ingredients = Object.keys(g.ingredientDB).map(function (name) {
        const v = g.ingredientDB[name];
        return { name: name, cal: v.cal, prot: v.prot, fat: v.fat, fib: v.fib, carb: v.carb, conversions: v.conversions || {} };
    });

    const recipeKeys = Object.keys(g.recipes);
    const stock_recipes = recipeKeys.map(function (slug, i) {
        const r = g.recipes[slug];
        return {
            slug: slug, title: r.title, desc: r.desc, type: r.type, week: r.week || [],
            base_macros: r.baseMacros, steps: r.steps || [], freezer_tips: r.freezerTips,
            scaling_tip: (r.scalingTip != null ? r.scalingTip : null), position: i
        };
    });

    const stock_recipe_ingredients = [];
    recipeKeys.forEach(function (slug) {
        (g.recipes[slug].ingredients || []).forEach(function (ing, pos) {
            stock_recipe_ingredients.push({ recipe_slug: slug, position: pos, name: ing.name, amount: ing.amount, unit: ing.unit });
        });
    });

    const packaging = Object.keys(g.packagingDB).map(function (name) {
        const p = g.packagingDB[name];
        return {
            name: name, retail_unit: p.retailUnit, unit_label: p.unitLabel, grams_per_unit: p.gramsPerUnit,
            units_per_case: p.unitsPerCase, case_label: p.caseLabel, verified: !!p.verified
        };
    });

    const week_plans = Object.keys(g.weeksPlan).map(function (w) {
        const p = g.weeksPlan[w];
        return { week: Number(w), breakfast: p.breakfast, lunch: p.lunch, dinner: p.dinner, dessert: p.dessert };
    });

    const app_config = [{
        id: 1, snacks_baseline: g.snacksBaseline, base_calorie_goal: 1800,
        default_prep_days: 7, daily_snack_key: 'carrot stick bags', daily_snack_count: 4
    }];

    return { stock_ingredients, stock_recipes, stock_recipe_ingredients, packaging, week_plans, app_config };
}

module.exports = { buildRows };
