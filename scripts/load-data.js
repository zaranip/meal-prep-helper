// Loads the PRISTINE hard-coded data (ingredientDB, recipes, …) into Node as the verified
// baseline for the seed/live checks. js/data.js in the working tree has since been shrunk to
// state-only, so if it no longer defines the data we fall back to the original from git HEAD
// (the pre-migration data.js). Used by gen-seed.js, verify-seed.js, check-live.js.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const repoRoot = path.join(__dirname, '..');

function loadData() {
    let src = fs.readFileSync(path.join(repoRoot, 'js', 'data.js'), 'utf8');
    if (!/ingredientDB\s*=/.test(src)) {
        // Working-tree data.js was shrunk to state-only — read the original verified data
        // from git HEAD as the baseline.
        try {
            src = execSync('git show HEAD:js/data.js', { cwd: repoRoot, encoding: 'utf8' });
        } catch (e) {
            throw new Error('js/data.js no longer contains the data and `git show HEAD:js/data.js` failed (' + e.message + '). The verified baseline lives in supabase/seed_app.sql.');
        }
        if (!/ingredientDB\s*=/.test(src)) {
            throw new Error('Original data.js not found in git HEAD; the verified baseline now lives in supabase/seed_app.sql.');
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
