// Lossless gate: build rows from data.js, reconstruct the globals via the SAME logic the
// browser uses (js/data-reconstruct.js), and deep-diff against the originals. Also repeats
// the check with numeric columns stringified to mimic PostgREST (validates Number() coercion).
// Run: node scripts/verify-seed.js   (exit code 1 on any diff)
const { loadData } = require('./load-data');
const { buildRows } = require('./build-rows');
const { reconstructFromRows } = require('../js/data-reconstruct');

function sortKeys(x) {
    if (Array.isArray(x)) return x.map(sortKeys);
    if (x && typeof x === 'object') {
        const o = {};
        Object.keys(x).sort().forEach(function (k) { o[k] = sortKeys(x[k]); });
        return o;
    }
    return x;
}
const canon = function (x) { return JSON.stringify(sortKeys(x)); };

// Walk both objects and report the first few differing paths (for readable failures).
function diffs(a, b, pathStr, acc) {
    if (acc.length >= 12) return acc;
    if (canon(a) === canon(b)) return acc;
    const ao = a && typeof a === 'object', bo = b && typeof b === 'object';
    if (!ao || !bo) { acc.push(pathStr + ': ' + JSON.stringify(a) + ' != ' + JSON.stringify(b)); return acc; }
    const keys = Array.from(new Set(Object.keys(a).concat(Object.keys(b))));
    keys.forEach(function (k) { diffs(a[k], b[k], pathStr ? pathStr + '.' + k : k, acc); });
    return acc;
}

// mimic PostgREST returning `numeric` columns as strings
function stringifyNumerics(rows) {
    const r = JSON.parse(JSON.stringify(rows));
    r.stock_ingredients.forEach(function (x) { ['cal', 'prot', 'fat', 'fib', 'carb'].forEach(function (k) { x[k] = String(x[k]); }); });
    r.stock_recipe_ingredients.forEach(function (x) { x.amount = String(x.amount); });
    r.packaging.forEach(function (x) { if (x.grams_per_unit != null) x.grams_per_unit = String(x.grams_per_unit); });
    return r;
}

const orig = loadData();
const rows = buildRows(orig);

const targets = ['ingredientDB', 'recipes', 'weeksPlan', 'snacksBaseline', 'packagingDB'];
let failed = false;

function checkPass(label, rebuilt) {
    targets.forEach(function (key) {
        const d = diffs(orig[key], rebuilt[key], '', []);
        if (d.length) {
            failed = true;
            console.log('FAIL [' + label + '] ' + key + ':');
            d.forEach(function (line) { console.log('   ' + line); });
        } else {
            console.log('ok   [' + label + '] ' + key);
        }
    });
}

checkPass('direct', reconstructFromRows(rows));
checkPass('pg-strings', reconstructFromRows(stringifyNumerics(rows)));

if (failed) { console.log('\nLOSSLESS CHECK FAILED — do not seed.'); process.exit(1); }
console.log('\nLossless: reconstructed globals are identical to js/data.js. Safe to seed.');
