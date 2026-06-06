// Verifies custom recipes are normalized to a fixed 700 kcal/serving:
//  - has rice  -> keep non-rice as entered, size the rice to fill to 700
//  - no rice   -> scale the whole recipe to 700
//  - non-rice already > 700 -> rice = 0, show the real (higher) calories
// Run: node scripts/test-recipe-servings.js
const { customRecipesToApp } = require('../js/data-reconstruct');

let fail = 0;
function chk(name, got, exp) {
    if (Math.abs(got - exp) > 0.5) { fail++; console.log('FAIL ' + name + ': ' + got + ' ≠ ' + exp); }
    else console.log('ok   ' + name + ' = ' + Math.round(got * 10) / 10);
}
function ing(name, grams, calPer100, p) { p = p || {}; return { weight_in_grams: grams, ingredients: { name: name, calories_per_100g: calPer100, protein_per_100g: p.prot || 0, fat_per_100g: p.fat || 0, carbs_per_100g: p.carb || 0, fiber_per_100g: p.fib || 0 } }; }
function build(id, servings, ingredients) { return customRecipesToApp([{ id: id, base_servings: servings, recipe_ingredients: ingredients }])['sb_' + id]; }

// A) No rice -> scale whole recipe to 700. 200 g @ 100 kcal/100g = 200 kcal -> x3.5
const A = build('a', 1, [ing('Chicken', 200, 100, { prot: 20 })]);
chk('no-rice normalized cal', A.baseMacros.cal, 700);
chk('no-rice scaled grams', A.ingredients[0].amount, 700);
chk('no-rice protein scaled', A.baseMacros.prot, 140); // 20*200/100 * 3.5

// B) Rice fills the gap: dish 500 kcal + rice 180 kcal -> rice resized so total = 700 (dish kept).
const B = build('b', 1, [ing('Tofu', 100, 500, { prot: 30 }), ing('White Rice (Uncooked)', 50, 360)]);
chk('rice-fill total cal', B.baseMacros.cal, 700);
chk('rice-fill dish protein kept', B.baseMacros.prot, 30); // dish unchanged
const riceB = B.ingredients.find(function (i) { return /rice/i.test(i.name); });
chk('rice-fill rice kcal', riceB.amount * 360 / 100, 200); // 700 - 500

// C) Non-rice already > 700 -> rice 0, shows real calories.
const C = build('c', 1, [ing('Big Dish', 100, 800), ing('White Rice (Uncooked)', 50, 360)]);
chk('over-target shows real cal', C.baseMacros.cal, 800);
const riceC = C.ingredients.find(function (i) { return /rice/i.test(i.name); });
chk('over-target rice grams', riceC.amount, 0);

// D) base_servings still factored before normalizing (no rice). 800 g @ 100/100g, 4 servings -> 200/serving -> 700.
const D = build('d', 4, [ing('Stuff', 800, 100)]);
chk('servings + normalize cal', D.baseMacros.cal, 700);

// D2) SNACKS are NOT normalized — a 20-kcal carrot snack stays 20 kcal (per serving), not 700.
function buildSnack(id, servings, ingredients) { return customRecipesToApp([{ id: id, base_servings: servings, meal_type: 'snack', recipe_ingredients: ingredients }])['sb_' + id]; }
const S = buildSnack('s', 1, [ing('Carrot Sticks', 50, 40)]); // 50 g @ 40 kcal/100g = 20 kcal
chk('snack kept as-is (cal)', S.baseMacros.cal, 20);
chk('snack kept as-is (grams)', S.ingredients[0].amount, 50);
const S2 = buildSnack('s2', 2, [ing('Carrot Sticks', 100, 40)]); // 100 g / 2 servings = 50 g/serving -> 20 kcal
chk('snack per-serving, not scaled', S2.baseMacros.cal, 20);

// E) notes round-trip: the recipes.notes column is surfaced on the app recipe (shared with the
// Recipes-tab Notes box). Empty/missing -> ''.
const E = customRecipesToApp([{ id: 'e', base_servings: 1, notes: 'Use half the chili oil.', recipe_ingredients: [ing('Stuff', 100, 100)] }])['sb_e'];
const Eempty = customRecipesToApp([{ id: 'f', base_servings: 1, recipe_ingredients: [ing('Stuff', 100, 100)] }])['sb_f'];
if (E.notes !== 'Use half the chili oil.') { fail++; console.log('FAIL notes mapped: got ' + JSON.stringify(E.notes)); } else console.log('ok   notes mapped from recipes.notes');
if (Eempty.notes !== '') { fail++; console.log('FAIL missing notes -> "": got ' + JSON.stringify(Eempty.notes)); } else console.log('ok   missing notes defaults to ""');

console.log(fail ? '\nFAILED' : '\n700-normalization + notes OK.');
process.exitCode = fail ? 1 : 0;
