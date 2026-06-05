// Loads the PRISTINE hard-coded data (ingredientDB, recipes, …) into Node as the verified
// baseline for the seed/live checks. js/data.js in the working tree has since been shrunk to
// state-only, so if it no longer defines the data we fall back to the original from git HEAD
// (the pre-migration data.js). Used by gen-seed.js, verify-seed.js, check-live.js.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const repoRoot = path.join(__dirname, '..');

function loadData() {
    // 1) Working-tree js/data.js, if it still holds the data (pre-migration / restored).
    let src = fs.readFileSync(path.join(repoRoot, 'js', 'data.js'), 'utf8');
    if (!/ingredientDB\s*=/.test(src)) {
        // 2) The frozen accepted baseline (current source of truth once the data moved to
        //    Supabase and data.js was shrunk). Already in the {ingredientDB, recipes, ...} shape.
        const baseline = path.join(__dirname, 'data-baseline.json');
        if (fs.existsSync(baseline)) {
            return JSON.parse(fs.readFileSync(baseline, 'utf8'));
        }
        // 3) Last resort: the original data.js from git history.
        try { src = execSync('git show HEAD:js/data.js', { cwd: repoRoot, encoding: 'utf8' }); } catch (e) { src = ''; }
        if (!/ingredientDB\s*=/.test(src)) {
            throw new Error('No data source found: js/data.js is shrunk, scripts/data-baseline.json is missing, and git HEAD has no original. Run `node scripts/freeze-baseline.js`.');
        }
    }
    src += '\nmodule.exports = { ingredientDB, recipes, weeksPlan, snacksBaseline, packagingDB };\n';
    const tmp = path.join(__dirname, '._data_eval.js');
    fs.writeFileSync(tmp, src);
    try {
        delete require.cache[require.resolve(tmp)];
        return require(tmp);
    } finally {
        fs.unlinkSync(tmp);
    }
}

module.exports = { loadData };
