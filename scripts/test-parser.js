// Unit test for js/recipe-parse.js against real-world NYT-style ingredient lines.
// Run: node scripts/test-parser.js   (exit 1 on any failure)
const { parseIngredientLine } = require('../js/recipe-parse');

// [input, expected {unit, name, grams}] — qty checked via grams where applicable.
const cases = [
    ['2 tablespoons olive oil', { unit: 'tbsp', name: 'olive oil', grams: 30 }],
    ['1 pound boneless chicken thighs', { unit: 'lb', name: 'boneless chicken thighs', grams: 453.6 }],
    ['1 ½ cups all-purpose flour', { unit: 'cup', name: 'all-purpose flour', grams: 360 }],
    ['¼ cup extra-virgin olive oil, plus more for drizzling', { unit: 'cup', name: 'extra-virgin olive oil', grams: 60 }],
    ['1 (14-ounce) can crushed tomatoes', { name: 'crushed tomatoes', grams: 396.9 }],
    ['Kosher salt, to taste', { unit: '', name: 'Kosher salt', grams: null }],
    ['3 large eggs', { name: 'large eggs', grams: null }],
    ['2 cloves garlic, minced', { unit: 'cloves', name: 'garlic', grams: 6 }],
    ['1/2 teaspoon ground cumin', { unit: 'tsp', name: 'ground cumin', grams: 2.5 }],
    ['2 to 3 tablespoons soy sauce', { unit: 'tbsp', name: 'soy sauce', grams: 30 }],
    ['8 ounces cremini mushrooms, sliced', { unit: 'oz', name: 'cremini mushrooms', grams: 226.8 }],
    ['1 stick unsalted butter', { unit: 'stick', name: 'unsalted butter', grams: 113 }],
    ['200 grams dark chocolate', { unit: 'g', name: 'dark chocolate', grams: 200 }],
    ['Freshly ground black pepper', { unit: '', name: 'Freshly ground black pepper', grams: null }],
    ['1 1/2 pounds Yukon Gold potatoes', { unit: 'lb', name: 'Yukon Gold potatoes', grams: 680.4 }]
];

let failed = 0;
cases.forEach(([input, exp]) => {
    const r = parseIngredientLine(input);
    const probs = [];
    if (exp.unit !== undefined && r.unit !== exp.unit) probs.push(`unit ${JSON.stringify(r.unit)}≠${JSON.stringify(exp.unit)}`);
    if (exp.name !== undefined && r.name !== exp.name) probs.push(`name ${JSON.stringify(r.name)}≠${JSON.stringify(exp.name)}`);
    if (exp.grams !== undefined && Math.abs((r.grams || 0) - (exp.grams || 0)) > 0.5) probs.push(`grams ${r.grams}≠${exp.grams}`);
    if (probs.length) { failed++; console.log('FAIL ' + JSON.stringify(input)); console.log('     ' + probs.join('; ') + '  got=' + JSON.stringify(r)); }
    else console.log('ok   ' + input);
});
console.log(failed ? `\n${failed} parser case(s) failed.` : '\nAll parser cases passed.');
process.exitCode = failed ? 1 : 0;
