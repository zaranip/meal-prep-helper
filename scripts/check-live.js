// End-to-end check against the LIVE Supabase project: fetches the stock_* tables over the
// REST API with the publishable key (exactly what the browser does), reconstructs the globals,
// and deep-diffs against the accepted baseline (scripts/data-baseline.json, from
// freeze-baseline.js). The data now lives in Supabase, so that snapshot — not the retired
// js/data.js — is the reference. Run AFTER schema_app.sql + seed_app.sql:
//   node scripts/check-live.js
global.window = {};
require('../js/config.js'); // sets window.SUPABASE_CONFIG
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
const canon = x => JSON.stringify(sortKeys(x));

(async function () {
    if (!cfg.url || cfg.url.indexOf('YOUR-PROJECT-ID') !== -1) { console.log('config.js not filled in.'); process.exitCode = 1; return; }
    const headers = { apikey: cfg.anonKey, Authorization: 'Bearer ' + cfg.anonKey };
    const data = {};
    for (const t of TABLES) {
        const res = await fetch(cfg.url + '/rest/v1/' + t + '?select=*', { headers });
        if (!res.ok) {
            const body = await res.text();
            console.log('FAIL ' + t + ': HTTP ' + res.status + ' ' + body);
            console.log('\n-> Have you run supabase/schema_app.sql and supabase/seed_app.sql in the SQL Editor?');
            process.exitCode = 1; return;
        }
        data[t] = await res.json();
        console.log('  ' + t + ': ' + data[t].length + ' rows');
    }
    const built = reconstructFromRows(data);
    const baselinePath = path.join(__dirname, 'data-baseline.json');
    if (!fs.existsSync(baselinePath)) {
        console.log('\nNo baseline yet — run `node scripts/freeze-baseline.js` once to record the accepted data.');
        return;
    }
    const base = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    let failed = false;
    ['ingredientDB', 'recipes', 'weeksPlan', 'snacksBaseline', 'packagingDB'].forEach(k => {
        const ok = canon(base[k]) === canon(built[k]);
        console.log((ok ? 'ok   ' : 'FAIL ') + k);
        if (!ok) failed = true;
    });
    console.log(failed ? '\nLIVE DATA DIFFERS from the accepted baseline (data-baseline.json).' : '\nLive Supabase data matches the accepted baseline. Phase 1 backend verified.');
    process.exitCode = failed ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
