// Captures the CURRENT live Supabase data as the accepted baseline (scripts/data-baseline.json).
// Run once after the data is loaded & accepted; check-live.js then diffs against it to catch
// any future drift. The verified data now lives in Supabase, so this snapshot — not the
// retired js/data.js — is the reference. Run: node scripts/freeze-baseline.js
global.window = {};
require('../js/config.js');
const fs = require('fs');
const path = require('path');
const { reconstructFromRows } = require('../js/data-reconstruct');
const cfg = global.window.SUPABASE_CONFIG || {};
const TABLES = ['stock_ingredients', 'stock_recipes', 'stock_recipe_ingredients', 'packaging', 'week_plans', 'app_config'];

function sortKeys(x) {
    if (Array.isArray(x)) return x.map(sortKeys);
    if (x && typeof x === 'object') { const o = {}; Object.keys(x).sort().forEach(k => o[k] = sortKeys(x[k])); return o; }
    return x;
}

(async function () {
    const headers = { apikey: cfg.anonKey, Authorization: 'Bearer ' + cfg.anonKey };
    const data = {};
    for (const t of TABLES) {
        const res = await fetch(cfg.url + '/rest/v1/' + t + '?select=*', { headers });
        if (!res.ok) { console.log('FAIL ' + t + ': HTTP ' + res.status); process.exitCode = 1; return; }
        data[t] = await res.json();
    }
    const built = reconstructFromRows(data);
    const snapshot = {};
    ['ingredientDB', 'recipes', 'weeksPlan', 'snacksBaseline', 'packagingDB'].forEach(k => { snapshot[k] = sortKeys(built[k]); });
    const dest = path.join(__dirname, 'data-baseline.json');
    fs.writeFileSync(dest, JSON.stringify(snapshot, null, 1) + '\n');
    console.log('Froze accepted baseline -> ' + dest);
    console.log('  ' + Object.keys(built.ingredientDB).length + ' ingredients, ' + Object.keys(built.recipes).length + ' recipes.');
})().catch(e => { console.error(e); process.exitCode = 1; });
