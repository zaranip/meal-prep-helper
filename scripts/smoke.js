// Headless smoke test: boots each page in jsdom with a MOCKED Supabase client (seeded from
// data.js) + a stub Chart, runs the real js/*.js in order, waits for DATA_READY/STATE_READY,
// and asserts the page rendered without throwing. Catches boot/reference/render errors that a
// syntax check can't. Run: node scripts/smoke.js   (exit 1 on any failure)
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { loadData } = require('./load-data');
const { buildRows } = require('./build-rows');

const root = path.join(__dirname, '..');
const rows = buildRows(loadData());
const tableData = Object.assign({}, rows, { app_settings: [], recipes: [] }); // no remote settings, no custom recipes

// ---- minimal chainable + thenable Supabase mock ----------------------------
function mockBuilder(getRows) {
    const ok = (data) => Promise.resolve({ data: data, error: null });
    const b = {
        select() { return b; }, order() { return b; }, eq() { return b; }, limit() { return b; },
        maybeSingle() { return ok((getRows()[0]) || null); },
        single() { return ok((getRows()[0]) || { id: 'mock' }); },
        upsert() { return { select() { return { single() { return ok({ id: 'mock' }); } }; }, then(r) { return ok(null).then(r); } }; },
        insert() { return { select() { return { single() { return ok({ id: 'mock' }); } }; }, then(r) { return ok(null).then(r); } }; },
        update() { return { eq() { return { select() { return { single() { return ok({ id: 'mock' }); } }; } }; } }; },
        delete() { return { eq() { return ok(null); } }; },
        then(resolve, reject) { return ok(getRows()).then(resolve, reject); }
    };
    return b;
}
let mockSession = null; // tests set this to simulate a signed-in account (per-user data is auth-gated)
function mockClient() {
    return {
        from(name) { return mockBuilder(() => tableData[name] || []); },
        auth: {
            getSession: () => Promise.resolve({ data: { session: mockSession } }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
            signInWithPassword: () => Promise.resolve({ error: null }),
            signUp: () => Promise.resolve({ data: { session: null }, error: null }),
            resetPasswordForEmail: () => Promise.resolve({ error: null }),
            updateUser: () => Promise.resolve({ error: null }),
            signOut: () => Promise.resolve({ error: null })
        },
        functions: {
            invoke: (_name, opts) => {
                const body = (opts && opts.body) || {};
                if (body.action === 'importRecipe') return Promise.resolve({
                    data: {
                        title: 'Test Paella', yieldServings: 4,
                        ingredients: ['2 tablespoons olive oil', '1 pound chicken thighs', '2 cloves garlic, minced'],
                        steps: ['Heat the oil.', 'Add the chicken.', 'Serve.'],
                        nutritionPerServing: { calories: 500, protein: 30, fat: 20, carbs: 40, fiber: 5 },
                        sourceUrl: body.url
                    }, error: null
                });
                if (body.action === 'search') return Promise.resolve({ data: { results: [{ fdcId: 111, description: 'TEST ' + (body.query || ''), dataType: 'Branded' }] }, error: null });
                if (body.action === 'fetchNutrients') return Promise.resolve({ data: { usda_fdc_id: 111, name: 'Test ingredient', data_type: 'Branded', calories: 100, protein: 5, fat: 2, carbs: 10, fiber: 1 }, error: null });
                return Promise.resolve({ data: { results: [] }, error: null });
            }
        }
    };
}

const SCRIPTS = ['js/config.js', 'js/data-reconstruct.js', 'js/data-layer.js', 'js/state.js', 'js/data.js', 'js/packaging.js', 'js/nav.js', 'js/app.js'];

const PAGES = [
    { file: 'index.html', label: 'dashboard', assert: (d) => /\d{3,4} kcal/.test(d.getElementById('sum-daily-cal').textContent) && d.getElementById('meals-list').children.length === 5 && !!d.getElementById('snack-mix') },
    { file: 'recipes.html', label: 'recipes', assert: (d) => d.getElementById('recipe-title').textContent !== '--' && d.getElementById('scaled-ingredients').children.length > 0 && !!d.getElementById('recipe-meta-save') && d.getElementById('recipe-meta-save').disabled === true && !!d.getElementById('recipe-freezer-tips') && d.getElementById('recipe-freezer-tips').value.length > 0 },
    { file: 'planner.html', label: 'planner', assert: (d) => d.getElementById('grocery-items-container').children.length > 0 && d.getElementById('timeline-container').children.length > 0 },
    { file: 'calendar.html', label: 'calendar', assert: (d) => d.getElementById('schedule-container').children.length > 0 },
    { file: 'builder.html', label: 'builder', assert: (d) => d.getElementById('builder-auth').innerHTML.length > 0, extra: ['js/recipe-parse.js', 'js/builder.js'] }
];

async function runPage(page) {
    const errors = [];
    const vc = new VirtualConsole();
    vc.on('jsdomError', (e) => { if (!/getContext|not implemented|Could not parse CSS/i.test(e.message)) errors.push('jsdomError: ' + e.message); });

    let html = fs.readFileSync(path.join(root, page.file), 'utf8');
    html = html.replace(/<script[\s\S]*?<\/script>/gi, ''); // strip CDN + local + inline scripts; we inject our own

    const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://localhost/' + page.file, virtualConsole: vc });
    const w = dom.window;
    // jsdom doesn't reflect `.innerText` (layout-dependent) to textContent like browsers do, and
    // the app sets text via innerText. Polyfill it so assertions see what a browser would.
    Object.defineProperty(w.HTMLElement.prototype, 'innerText', {
        configurable: true,
        get() { return this.textContent; },
        set(v) { this.textContent = v; }
    });
    w.console.error = (...a) => errors.push('console.error: ' + a.map(String).join(' '));
    w.console.warn = () => {};
    w.addEventListener('error', (ev) => errors.push('window.error: ' + ((ev.error && ev.error.stack) || ev.message)));
    w.addEventListener('unhandledrejection', (ev) => errors.push('unhandledrejection: ' + ((ev.reason && (ev.reason.stack || ev.reason.message)) || ev.reason)));
    w.Chart = function () { this.destroy = function () {}; };
    w.supabase = { createClient: () => mockClient() };

    SCRIPTS.concat(page.extra || []).forEach((f) => {
        const s = w.document.createElement('script');
        s.textContent = fs.readFileSync(path.join(root, f), 'utf8');
        w.document.body.appendChild(s);
    });

    try { await w.DATA_READY; } catch (e) { errors.push('DATA_READY rejected: ' + e.message); }
    try { await w.STATE_READY; } catch (e) { /* best-effort */ }
    await new Promise((r) => w.setTimeout(r, 50)); // let init .then() + render run

    let asserted = false;
    try { asserted = !!page.assert(w.document); } catch (e) { errors.push('assert threw: ' + e.message); }

    dom.window.close();
    return { errors, asserted };
}

// Boot a page (no assertions), optionally pre-seeding persisted state, and return its window.
async function bootDOM(file, extra, seedState) {
    let html = fs.readFileSync(path.join(root, file), 'utf8').replace(/<script[\s\S]*?<\/script>/gi, '');
    const vc = new VirtualConsole(); // swallow jsdom's "getContext not implemented" canvas noise
    vc.on('jsdomError', () => {});
    const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://localhost/' + file, virtualConsole: vc });
    const w = dom.window;
    Object.defineProperty(w.HTMLElement.prototype, 'innerText', { configurable: true, get() { return this.textContent; }, set(v) { this.textContent = v; } });
    w.console.error = () => {}; w.console.warn = () => {};
    w.Chart = function () { this.destroy = function () {}; };
    w.supabase = { createClient: () => mockClient() };
    if (seedState) w.localStorage.setItem('mealPrep.state.v1', seedState);
    SCRIPTS.concat(extra || []).forEach((f) => { const s = w.document.createElement('script'); s.textContent = fs.readFileSync(path.join(root, f), 'utf8'); w.document.body.appendChild(s); });
    try { await w.DATA_READY; } catch (e) {} try { await w.STATE_READY; } catch (e) {}
    await new Promise((r) => w.setTimeout(r, 50));
    return { dom, w };
}

// Cross-page state: change Prep Days on the Dashboard -> it persists -> the Recipes page's
// "Multiplier Servings" reflects the same value (the prep-days/multiplier link).
async function testStateLink() {
    const a = await bootDOM('index.html');
    const dd = a.w.document.getElementById('dashboard-days');
    dd.value = '5';
    dd.dispatchEvent(new a.w.Event('input', { bubbles: true }));
    await new Promise((r) => a.w.setTimeout(r, 20));
    const saved = a.w.localStorage.getItem('mealPrep.state.v1');
    const prep = JSON.parse(saved || '{}').prepDays;
    a.dom.window.close();

    const b = await bootDOM('recipes.html', [], saved);
    const mult = b.w.document.getElementById('multiplier-input').value;
    b.dom.window.close();

    const ok = prep === 5 && String(mult) === '5';
    console.log((ok ? 'ok   ' : 'FAIL ') + 'state-link  (Dashboard prep days = Recipes multiplier; persisted) — prepDays=' + prep + ', multiplier=' + mult + ' (expect 5/5)');
    return ok;
}

// NYT import on the Add Recipe page: clicking Import fills title/steps/servings and populates
// the ingredient draft (matched to USDA, flagged). Also asserts the Meals merge (Meal option,
// no Lunch/Dinner).
async function testImport() {
    const b = await bootDOM('builder.html', ['js/recipe-parse.js', 'js/builder.js']);
    const w = b.w, d = w.document;
    d.getElementById('b-import-url').value = 'https://cooking.nytimes.com/recipes/123-test';
    d.getElementById('b-import-btn').dispatchEvent(new w.Event('click', { bubbles: true }));
    await new Promise((r) => w.setTimeout(r, 300)); // import + USDA matching pool
    const title = d.getElementById('b-title').value;
    const steps = d.getElementById('b-instructions').value;
    const rows = d.getElementById('b-draft-list').children.length;
    const desc = d.getElementById('b-description').value; // NYT import sets description = source link
    const opts = Array.from(d.getElementById('b-meal-type').options).map((o) => o.value);
    const mealsOk = opts.indexOf('meal') >= 0 && opts.indexOf('lunch') < 0 && opts.indexOf('dinner') < 0;
    b.dom.window.close();
    const descOk = desc === 'https://cooking.nytimes.com/recipes/123-test';
    const ok = title === 'Test Paella' && /Heat the oil/.test(steps) && rows === 3 && mealsOk && descOk;
    console.log((ok ? 'ok   ' : 'FAIL ') + 'nyt-import  (title="' + title + '", steps=' + /Heat/.test(steps) + ', draft rows=' + rows + ', desc-link=' + descOk + ', meal-opts ok=' + mealsOk + ')');
    return ok;
}

// Add Recipe scale preview: shows the proposed per-serving scaled recipe; Auto scales a meal to
// 700, Custom to a typed kcal, Keep-as-entered leaves it, and a snack on Auto isn't scaled.
async function testScalePreview() {
    const b = await bootDOM('builder.html', ['js/recipe-parse.js', 'js/builder.js']);
    const w = b.w, d = w.document;
    const previewCal = () => { const m = (d.getElementById('b-scaled-preview').textContent || '').match(/CAL(\d+)/); return m ? +m[1] : -1; };
    const setSel = (id, v) => { const e = d.getElementById(id); e.value = v; e.dispatchEvent(new w.Event('change', { bubbles: true })); };
    // meal type defaults to 'meal'; add light butter (50 kcal @ 14 g)
    Array.from(d.querySelectorAll('.quick-add-btn')).find((x) => x.getAttribute('data-quick') === 'butter').dispatchEvent(new w.Event('click', { bubbles: true }));
    await new Promise((r) => w.setTimeout(r, 30));
    const autoCal = previewCal();                          // meal + auto -> 700

    setSel('b-scale-mode', 'custom');
    const tgt = d.getElementById('b-scale-target'); tgt.value = '500'; tgt.dispatchEvent(new w.Event('input', { bubbles: true }));
    await new Promise((r) => w.setTimeout(r, 10));
    const customCal = previewCal();                        // custom 500

    setSel('b-scale-mode', 'asentered');
    await new Promise((r) => w.setTimeout(r, 10));
    const asEnteredCal = previewCal();                     // as entered -> 50

    setSel('b-meal-type', 'snack'); setSel('b-scale-mode', 'auto');
    await new Promise((r) => w.setTimeout(r, 10));
    const snackAutoCal = previewCal();                     // snack + auto -> 50 (unscaled)
    b.dom.window.close();

    const ok = autoCal === 700 && customCal === 500 && asEnteredCal === 50 && snackAutoCal === 50;
    console.log((ok ? 'ok   ' : 'FAIL ') + 'scale-prev (auto=' + autoCal + ', custom=' + customCal + ', as-entered=' + asEnteredCal + ', snack-auto=' + snackAutoCal + ')');
    return ok;
}

// Saved-recipe row in the Add Recipe tab: clicking the recipe title opens it in the Recipes
// scaler (sets selectedRecipeId + persists, then navigates). Edit/Delete buttons stay.
async function testOpenInScaler() {
    const snackRow = {
        id: 'snk5', title: 'Carrot Sticks', meal_type: 'snack', base_servings: 1, description: '', notes: '', freezer_tips: '', instructions: [],
        recipe_ingredients: [{ weight_in_grams: 50, ingredients: { name: 'Baby Carrots', usda_fdc_id: 999005, data_type: 'Branded', calories_per_100g: 40, protein_per_100g: 1, fat_per_100g: 0, carbs_per_100g: 9, fiber_per_100g: 3, is_estimate: true } }]
    };
    tableData.recipes = [snackRow];
    let ok = false, info = '';
    try {
        const b = await bootDOM('builder.html', ['js/recipe-parse.js', 'js/builder.js']);
        const w = b.w, d = w.document;
        await new Promise((r) => w.setTimeout(r, 40));
        const openBtn = d.querySelector('.b-open');
        const hasBtn = !!openBtn && /Carrot Sticks/.test(openBtn.textContent);
        if (openBtn) openBtn.dispatchEvent(new w.Event('click', { bubbles: true })); // navigation is a no-op in jsdom
        await new Promise((r) => w.setTimeout(r, 20));
        const saved = JSON.parse(w.localStorage.getItem('mealPrep.state.v1') || '{}');
        const editStays = !!d.querySelector('.b-edit'); // signed-out mock -> no edit; check it didn't break render
        b.dom.window.close();
        ok = hasBtn && saved.selectedRecipeId === 'sb_snk5';
        info = 'open-btn=' + hasBtn + ', selectedRecipeId=' + saved.selectedRecipeId;
    } finally {
        tableData.recipes = [];
    }
    console.log((ok ? 'ok   ' : 'FAIL ') + 'open-scaler (' + info + ')');
    return ok;
}

// Quick-add staples: rice blend adds 2 verified rows scaled by base servings (37.5/18.75 × 2);
// light butter adds 1 row whose per-100g macros land on the label values (14 g -> 50 kcal, 6 g fat).
async function testQuickAdd() {
    const b = await bootDOM('builder.html', ['js/recipe-parse.js', 'js/builder.js']);
    const w = b.w, d = w.document;
    d.getElementById('b-base-servings').value = '2';
    const riceBtn = Array.from(d.querySelectorAll('.quick-add-btn')).find((x) => x.getAttribute('data-quick') === 'rice');
    riceBtn.dispatchEvent(new w.Event('click', { bubbles: true }));
    await new Promise((r) => w.setTimeout(r, 30));
    const rows = d.getElementById('b-draft-list').children.length;
    const txt = d.getElementById('b-draft-list').textContent;
    const grams = Array.from(d.querySelectorAll('.b-grams')).map((x) => x.value);

    // Light butter at 1× base servings: 14 g, 50 kcal, 6 g fat (verify per-100g math + row macros).
    d.getElementById('b-base-servings').value = '1';
    const butterBtn = Array.from(d.querySelectorAll('.quick-add-btn')).find((x) => x.getAttribute('data-quick') === 'butter');
    butterBtn.dispatchEvent(new w.Event('click', { bubbles: true }));
    await new Promise((r) => w.setTimeout(r, 30));
    const butterRow = Array.from(d.getElementById('b-draft-list').children).find((li) => /Light Butter/.test(li.textContent));
    const butterTxt = butterRow ? butterRow.textContent : '';
    const butterGrams = butterRow ? butterRow.querySelector('.b-grams').value : '';
    const butterOk = !!butterRow && String(butterGrams) === '14' && /50 kcal/.test(butterTxt) && /6g F/.test(butterTxt);

    // Garlic (1 clove) from verified ingredientDB: 3 g, ~4 kcal.
    const garlicBtn = Array.from(d.querySelectorAll('.quick-add-btn')).find((x) => x.getAttribute('data-quick') === 'garlic');
    garlicBtn.dispatchEvent(new w.Event('click', { bubbles: true }));
    await new Promise((r) => w.setTimeout(r, 20));
    const garlicRow = Array.from(d.getElementById('b-draft-list').children).find((li) => /Garlic/.test(li.textContent));
    const garlicOk = !!garlicRow && String(garlicRow.querySelector('.b-grams').value) === '3' && /4 kcal/.test(garlicRow.textContent) && /verified/.test(garlicRow.textContent);
    b.dom.window.close();

    const ok = rows === 2 && /White Rice/.test(txt) && /Black Rice/.test(txt) && grams.indexOf('75') >= 0 && grams.indexOf('37.5') >= 0 && butterOk && garlicOk;
    console.log((ok ? 'ok   ' : 'FAIL ') + 'quick-add  (rice @ 2×; butter 14g/50kcal=' + butterOk + '; garlic 3g/4kcal=' + garlicOk + ')');
    return ok;
}

// Calendar week-template editor renders the existing week_plans as editable cards + an Add button.
async function testWeekEditor() {
    const b = await bootDOM('calendar.html', ['js/week-editor.js']);
    await new Promise((r) => b.w.setTimeout(r, 40));
    const cards = b.w.document.getElementById('week-list').children.length;
    const hasAdd = !!b.w.document.getElementById('week-add');
    const hasSlots = b.w.document.querySelectorAll('.week-slot').length >= 4;
    const sum = b.w.document.getElementById('week-summary-1');
    const sumTxt = sum ? sum.textContent : '';
    const hasSummary = /Daily/.test(sumTxt) && /Week/.test(sumTxt) && /kcal/.test(sumTxt);
    b.dom.window.close();
    const ok = cards === 4 && hasAdd && hasSlots && hasSummary;
    console.log((ok ? 'ok   ' : 'FAIL ') + 'week-editor (calendar: ' + cards + ' templates, add=' + hasAdd + ', slots=' + hasSlots + ', daily/week summary=' + hasSummary + ')');
    return ok;
}

// Ingredient overlap tool (calendar): pairs collapse to top 3 with a "See all" toggle; each meal
// pair has a "+ New week" quick-add; focus mode ranks others vs a chosen recipe.
async function testOverlap() {
    const b = await bootDOM('calendar.html', ['js/week-editor.js', 'js/overlap.js']);
    const w = b.w, d = w.document;
    const results = () => d.getElementById('overlap-results');
    await new Promise((r) => w.setTimeout(r, 40));
    const cats = d.getElementById('overlap-cat').options.length;
    const focusOpts = d.getElementById('overlap-focus').options.length; // 8 meals + "no focus"
    const previewCards = results().querySelectorAll('.bg-white').length; // collapsed -> 3
    const pairTxt = results().textContent;
    const hasAddBtn = !!results().querySelector('.overlap-addweek');
    const previewOk = previewCards === 3 && /shared/.test(pairTxt) && /Tofu/.test(pairTxt) && hasAddBtn;

    // "See all" expands beyond the preview.
    const toggle = d.getElementById('overlap-toggle');
    const hasToggle = !!toggle && /See all/.test(toggle.textContent);
    toggle.dispatchEvent(new w.Event('click', { bubbles: true }));
    await new Promise((r) => w.setTimeout(r, 20));
    const expandedCards = results().querySelectorAll('.bg-white').length;
    const expandOk = hasToggle && expandedCards > 3;

    // Quick-add while signed out -> surfaces the sign-in prompt (mock session is null).
    results().querySelector('.overlap-addweek').dispatchEvent(new w.Event('click', { bubbles: true }));
    await new Promise((r) => w.setTimeout(r, 10));
    const addMsgOk = /Sign in/.test(results().querySelector('.overlap-add-msg').textContent);

    // Focus mode: rank others vs a chosen recipe — ALSO collapses to top 3 with a "See all" toggle.
    const focus = d.getElementById('overlap-focus');
    focus.value = focus.options[1].value;
    focus.dispatchEvent(new w.Event('change', { bubbles: true }));
    await new Promise((r) => w.setTimeout(r, 20));
    const focusPreview = results().querySelectorAll('.bg-white').length; // collapsed -> 3
    const focusToggle = d.getElementById('overlap-toggle');
    const focusToggleOk = !!focusToggle && /See all/.test(focusToggle.textContent);
    if (focusToggle) focusToggle.dispatchEvent(new w.Event('click', { bubbles: true }));
    await new Promise((r) => w.setTimeout(r, 20));
    const focusExpanded = results().querySelectorAll('.bg-white').length;
    const focusOk = focusPreview === 3 && focusToggleOk && focusExpanded > 3 && /share the most with/.test(results().textContent);
    b.dom.window.close();

    const ok = cats === 4 && focusOpts >= 3 && previewOk && expandOk && addMsgOk && focusOk;
    console.log((ok ? 'ok   ' : 'FAIL ') + 'overlap    (cats=' + cats + ', preview=' + previewCards + ', expanded=' + expandedCards + ', focus-preview=' + focusPreview + ', focus-expanded=' + focusExpanded + ')');
    return ok;
}

// Unit conversion: tsp/tbsp/cup are a fixed-ratio family and oz<->g is fixed, so a unit missing
// from an ingredient's table (e.g. olive oil has tbsp but not tsp) is still derived correctly.
async function testUnitConvert() {
    const b = await bootDOM('recipes.html');
    const w = b.w;
    const r1 = (x) => Math.round(x * 10) / 10;
    const tbsp = w.ingredientGrams('olive oil', 1, 'tbsp');
    const tsp = w.ingredientGrams('olive oil', 1, 'tsp');   // derived from tbsp (÷3)
    const oz = w.ingredientGrams('olive oil', 1, 'oz');     // derived from grams (×28.35)
    b.dom.window.close();
    const ratioOk = tbsp > 0 && tsp > 0 && Math.abs(tbsp / tsp - 3) < 0.02;
    const ozOk = oz > 0 && Math.abs(oz - 28.35) < 0.2;
    const ok = ratioOk && ozOk;
    console.log((ok ? 'ok   ' : 'FAIL ') + 'unit-conv  (tbsp=' + r1(tbsp) + 'g, tsp=' + r1(tsp) + 'g, ratio=' + (tbsp / tsp).toFixed(2) + ', oz=' + r1(oz) + 'g)');
    return ok;
}

// Editing an ingredient's unit (tbsp -> tsp) recomputes macros from the CONVERTED amount (the oil
// stays tracked at 1/3), instead of untracking it and subtracting its whole contribution (which
// produced negative fat + a collapsed calorie count). Fat is also clamped non-negative.
async function testEditUnitMacros() {
    const b = await bootDOM('recipes.html', [], JSON.stringify({ selectedRecipeId: 'frittata', _ts: 9e15 }));
    const w = b.w, d = w.document;
    await new Promise((r) => w.setTimeout(r, 20));
    d.getElementById('recipe-edit-btn').dispatchEvent(new w.Event('click', { bubbles: true })); // edit mode
    await new Promise((r) => w.setTimeout(r, 20));
    const rows = Array.from(d.querySelectorAll('#edit-ing-list li'));
    const oilRow = rows.find((li) => /olive oil/i.test(((li.querySelector('.edit-ing-name') || {}).value) || ''));
    const found = !!oilRow;
    let cal = -1, fatNeg = true;
    if (oilRow) {
        const u = oilRow.querySelector('.edit-ing-unit');
        u.value = 'tsp'; u.dispatchEvent(new w.Event('input', { bubbles: true }));
        await new Promise((r) => w.setTimeout(r, 10));
        cal = parseFloat(d.getElementById('macro-cal').textContent);
        fatNeg = /-/.test(d.getElementById('macro-fat').textContent);
    }
    b.dom.window.close();
    // Frittata base 153 kcal w/ 1 tbsp oil; -> tsp keeps the oil (1/3) so cal stays ~70 (NOT ~29 if
    // fully untracked), and fat is non-negative (was -7 before the fix).
    const ok = found && cal > 50 && !fatNeg;
    console.log((ok ? 'ok   ' : 'FAIL ') + 'edit-unit  (oil row=' + found + ', cal=' + cal + ', fat-negative=' + fatNeg + ')');
    return ok;
}

// Recipe Library (recipes page): category filter (incl. Snacks) + ordering breakfast -> meals
// -> snack -> dessert.
async function testRecipeLibrary() {
    const b = await bootDOM('recipes.html');
    const w = b.w, d = w.document;
    const cat = (el) => (el.querySelector('span:last-child') || {}).textContent.toLowerCase();
    const order = { breakfast: 0, meal: 1, snack: 2, dessert: 3 };
    const cats = () => Array.from(d.getElementById('recipe-directory').children).map(cat);

    const allCats = cats();
    // Non-decreasing category order across the full list.
    let ordered = true;
    for (let i = 1; i < allCats.length; i++) if ((order[allCats[i]] ?? 9) < (order[allCats[i - 1]] ?? 9)) ordered = false;
    const firstIsBreakfast = allCats[0] === 'breakfast';
    const lastIsDessert = allCats[allCats.length - 1] === 'dessert';
    const hasSnackFilter = !!Array.from(d.querySelectorAll('.recipe-lib-btn')).find((x) => x.getAttribute('data-cat') === 'snack');

    // Filter to Breakfast -> only breakfast rows.
    const bBtn = Array.from(d.querySelectorAll('.recipe-lib-btn')).find((x) => x.getAttribute('data-cat') === 'breakfast');
    bBtn.dispatchEvent(new w.Event('click', { bubbles: true }));
    await new Promise((r) => w.setTimeout(r, 10));
    const onlyBreakfast = cats().every((c) => c === 'breakfast') && cats().length > 0;
    const btnActive = bBtn.classList.contains('bg-emeraldAccent');
    b.dom.window.close();

    const ok = allCats.length > 0 && ordered && firstIsBreakfast && lastIsDessert && hasSnackFilter && onlyBreakfast && btnActive;
    console.log((ok ? 'ok   ' : 'FAIL ') + 'recipe-lib (ordered=' + ordered + ', first=' + allCats[0] + ', last=' + allCats[allCats.length - 1] + ', snack-filter=' + hasSnackFilter + ', breakfast-filter=' + onlyBreakfast + ', active=' + btnActive + ')');
    return ok;
}

// Freezer tips + Notes (recipes page): the freezer box is pre-filled and editable; editing it
// enables the shared Save, which persists to the localStorage edit store for a stock recipe.
async function testFreezerNotes() {
    const b = await bootDOM('recipes.html');
    const w = b.w, d = w.document;
    const save = d.getElementById('recipe-meta-save');
    const fz = d.getElementById('recipe-freezer-tips');
    const startOk = save.disabled === true && fz.value.length > 0; // pre-filled, nothing to save yet
    fz.value = fz.value + ' (test edit)';
    fz.dispatchEvent(new w.Event('input', { bubbles: true }));
    await new Promise((r) => w.setTimeout(r, 10));
    const enabledAfterEdit = save.disabled === false;
    save.dispatchEvent(new w.Event('click', { bubbles: true }));
    await new Promise((r) => w.setTimeout(r, 10));
    const status = d.getElementById('recipe-meta-status').textContent;
    const savedOk = /Saved/.test(status) && save.disabled === true;
    const store = JSON.parse(w.localStorage.getItem('mealPrep.recipeEdits.v2') || '{}');
    const persisted = Object.keys(store).some((k) => /test edit/.test(store[k].freezerTips || ''));
    b.dom.window.close();
    const ok = startOk && enabledAfterEdit && savedOk && persisted;
    console.log((ok ? 'ok   ' : 'FAIL ') + 'freezer-notes (prefilled=' + startOk + ', edit-enables=' + enabledAfterEdit + ', saved=' + savedOk + ', persisted=' + persisted + ')');
    return ok;
}

// A custom snack recipe appears in the Recipe Library as a first-class Snack, filters under the
// Snacks category, is selectable/scalable like meals/desserts, and keeps its real calories
// (snacks aren't normalized to 700). Injects one custom snack into the mock, then restores.
async function testSnackInLibrary() {
    const snackRow = {
        id: 'snk1', title: 'Carrot Sticks', meal_type: 'snack', base_servings: 1, notes: '', freezer_tips: '', instructions: [],
        recipe_ingredients: [{ weight_in_grams: 50, ingredients: { name: 'Carrots', calories_per_100g: 40, protein_per_100g: 1, fat_per_100g: 0, carbs_per_100g: 9, fiber_per_100g: 3 } }]
    };
    tableData.recipes = [snackRow];
    let ok = false, info = '';
    try {
        const b = await bootDOM('recipes.html');
        const w = b.w, d = w.document;
        const titleOf = (c) => (c.querySelector('span') || {}).textContent || '';
        const catOf = (c) => ((c.querySelector('span:last-child') || {}).textContent || '').toLowerCase();
        const rows = () => Array.from(d.getElementById('recipe-directory').children);

        const inAll = rows().some((c) => /Carrot Sticks/.test(titleOf(c)));

        const snackBtn = Array.from(d.querySelectorAll('.recipe-lib-btn')).find((x) => x.getAttribute('data-cat') === 'snack');
        snackBtn.dispatchEvent(new w.Event('click', { bubbles: true }));
        await new Promise((r) => w.setTimeout(r, 10));
        const filtered = rows();
        const onlySnacks = filtered.length > 0 && filtered.every((c) => catOf(c) === 'snack');

        filtered[0].dispatchEvent(new w.Event('click', { bubbles: true })); // select it -> workspace
        await new Promise((r) => w.setTimeout(r, 20));
        const fns = /Carrot Sticks/.test(d.getElementById('recipe-title').textContent) &&
            d.getElementById('scaled-ingredients').children.length > 0 &&
            !!d.getElementById('recipe-meta-save');
        // At 1x the base must read 20 kcal (kept as-is, NOT normalized to 700). The grid shows
        // macros scaled by the multiplier, so set it to 1 first.
        const mult = d.getElementById('multiplier-input');
        mult.value = '1'; mult.dispatchEvent(new w.Event('input', { bubbles: true }));
        await new Promise((r) => w.setTimeout(r, 10));
        const keptCal = /\b20 kcal\b/.test(d.getElementById('macro-cal').textContent);
        b.dom.window.close();
        ok = inAll && onlySnacks && fns && keptCal;
        info = 'in-all=' + inAll + ', snack-filter=' + onlySnacks + ', functions=' + fns + ', kept-20kcal=' + keptCal;
    } finally {
        tableData.recipes = []; // restore so other tests see stock-only data
    }
    console.log((ok ? 'ok   ' : 'FAIL ') + 'snack-lib  (' + info + ')');
    return ok;
}

// Ingredient deep-dive: clicking a custom ingredient shows its per-item macros (from _m100, not
// "--") and the panel is positioned directly below the clicked ingredient row.
async function testDeepDive() {
    const snackRow = {
        id: 'snk4', title: 'Carrot Sticks', meal_type: 'snack', base_servings: 1, description: '', notes: '', freezer_tips: '', instructions: [],
        recipe_ingredients: [{ weight_in_grams: 114, ingredients: { name: 'Baby Carrots', usda_fdc_id: 999004, data_type: 'Branded', calories_per_100g: 40, protein_per_100g: 1, fat_per_100g: 0, carbs_per_100g: 9, fiber_per_100g: 3, is_estimate: true } }]
    };
    tableData.recipes = [snackRow];
    let ok = false, info = '';
    try {
        const b = await bootDOM('recipes.html');
        const w = b.w, d = w.document;
        const row = Array.from(d.getElementById('recipe-directory').children).find((c) => /Carrot Sticks/.test((c.querySelector('span') || {}).textContent || ''));
        row.dispatchEvent(new w.Event('click', { bubbles: true }));
        await new Promise((r) => w.setTimeout(r, 20));
        const ingLi = d.getElementById('scaled-ingredients').children[0];
        ingLi.dispatchEvent(new w.Event('click', { bubbles: true }));
        await new Promise((r) => w.setTimeout(r, 10));
        const cal = d.getElementById('dive-ing-cal').textContent;
        const macrosShown = /kcal/.test(cal) && !/--/.test(cal);
        const panel = d.getElementById('ingredient-deep-dive');
        const positioned = ingLi.nextElementSibling === panel; // directly below the clicked row
        // For a 1-ingredient recipe the per-item macro must equal the recipe total (no rounding drift).
        const totalCal = d.getElementById('macro-cal').textContent;
        const consistent = totalCal === cal;
        b.dom.window.close();
        ok = macrosShown && positioned && consistent;
        info = 'item=' + cal.trim() + ', total=' + totalCal.trim() + ', match=' + consistent + ', below-clicked=' + positioned;
    } finally {
        tableData.recipes = [];
    }
    console.log((ok ? 'ok   ' : 'FAIL ') + 'deep-dive  (' + info + ')');
    return ok;
}

// Custom recipe full edit+save from the Recipes tab: editing a custom recipe's description in
// Edit mode now ENABLES the structural Save (was hard-disabled), and saving while signed out
// surfaces the inline sign-in (the actual Supabase write is live-verify, like notes).
async function testCustomSave() {
    const snackRow = {
        id: 'snk2', title: 'Carrot Sticks', meal_type: 'snack', base_servings: 1, notes: '', freezer_tips: '', instructions: [], description: '',
        recipe_ingredients: [{ weight_in_grams: 114, ingredients: { name: 'Baby Carrots', usda_fdc_id: 999001, data_type: 'Branded', calories_per_100g: 40, protein_per_100g: 1, fat_per_100g: 0, carbs_per_100g: 9, fiber_per_100g: 3, is_estimate: true } }]
    };
    tableData.recipes = [snackRow];
    let ok = false, info = '';
    try {
        const b = await bootDOM('recipes.html');
        const w = b.w, d = w.document;
        // select the snack from the library
        const row = Array.from(d.getElementById('recipe-directory').children).find((c) => /Carrot Sticks/.test((c.querySelector('span') || {}).textContent || ''));
        row.dispatchEvent(new w.Event('click', { bubbles: true }));
        await new Promise((r) => w.setTimeout(r, 20));
        // enter edit mode + edit the description
        d.getElementById('recipe-edit-btn').dispatchEvent(new w.Event('click', { bubbles: true }));
        await new Promise((r) => w.setTimeout(r, 20));
        const descInput = d.getElementById('edit-desc');
        descInput.value = 'Baby carrot sticks';
        descInput.dispatchEvent(new w.Event('input', { bubbles: true }));
        await new Promise((r) => w.setTimeout(r, 10));
        const saveBtn = d.getElementById('recipe-save-btn');
        const enabled = saveBtn.disabled === false; // custom Save now enabled on a structural edit
        // saving while signed out -> sign-in prompt
        saveBtn.dispatchEvent(new w.Event('click', { bubbles: true }));
        await new Promise((r) => w.setTimeout(r, 30));
        const promptShown = /sign in from the header/i.test(d.getElementById('recipe-edit-status').textContent);
        b.dom.window.close();
        ok = enabled && promptShown;
        info = 'save-enabled=' + enabled + ', header-prompt=' + promptShown;
    } finally {
        tableData.recipes = [];
    }
    console.log((ok ? 'ok   ' : 'FAIL ') + 'custom-save (' + info + ')');
    return ok;
}

// Unified header auth: the ONE sign-in lives in the header. Signed out shows sign in / create
// account / forgot password; signed in shows the account email + sign out. Old inline forms gone.
async function testHeaderAuth() {
    const out = await bootDOM('index.html');
    const w = out.w, d = w.document;
    const ha = d.getElementById('header-auth');
    const signedOutOk = !!ha && !!d.getElementById('ha-signin') && !!d.getElementById('ha-signup') && !!d.getElementById('ha-forgot');
    out.dom.window.close();

    mockSession = { user: { id: 'u-test', email: 'me@example.com' } };
    const inp = await bootDOM('index.html');
    const ha2 = inp.w.document.getElementById('header-auth');
    const signedInOk = !!ha2 && /me@example.com/.test(ha2.textContent) && !!inp.w.document.getElementById('ha-signout');
    inp.dom.window.close();
    mockSession = null;

    // Old inline builder sign-in form should be gone (header is the only place).
    const bld = await bootDOM('builder.html', ['js/recipe-parse.js', 'js/builder.js']);
    const noInlineForm = !bld.w.document.getElementById('b-signin') && /header/i.test((bld.w.document.getElementById('builder-auth') || {}).textContent || '');
    bld.dom.window.close();

    const ok = signedOutOk && signedInOk && noInlineForm;
    console.log((ok ? 'ok   ' : 'FAIL ') + 'header-auth (signed-out=' + signedOutOk + ', signed-in=' + signedInOk + ', no-inline-form=' + noInlineForm + ')');
    return ok;
}

// "Add as new week plan" (dashboard): the button exists and, signed out (mock session null),
// clicking it surfaces the inline sign-in (the actual week_plans insert is live-verify).
async function testAddWeek() {
    const b = await bootDOM('index.html');
    const w = b.w, d = w.document;
    await new Promise((r) => w.setTimeout(r, 20));
    const btn = d.getElementById('add-week-btn');
    const hasBtn = !!btn;
    if (btn) btn.dispatchEvent(new w.Event('click', { bubbles: true }));
    await new Promise((r) => w.setTimeout(r, 20));
    const promptShown = /sign in from the header/i.test(d.getElementById('add-week-status').textContent);
    b.dom.window.close();
    const ok = hasBtn && promptShown;
    console.log((ok ? 'ok   ' : 'FAIL ') + 'add-week   (btn=' + hasBtn + ', header-prompt=' + promptShown + ')');
    return ok;
}

// State timestamp gate: a stale remote app_settings row must NOT clobber a newer local value
// (this is what made every dashboard click navigate to the last-saved recipe). A newer remote IS
// adopted (cross-device sync still works).
async function testStateTimestamp() {
    let keptLocal = false, adoptedRemote = false;
    mockSession = { user: { id: 'u-test' } }; // per-user settings sync requires a signed-in session
    try {
        tableData.app_settings = [{ data: { selectedRecipeId: 'pancakes', _ts: 1 } }];         // stale remote
        const a = await bootDOM('recipes.html', [], JSON.stringify({ selectedRecipeId: 'bagel', _ts: 9e15 }));
        keptLocal = /"selectedRecipeId":"bagel"/.test(a.w.localStorage.getItem('mealPrep.state.v1'));
        a.dom.window.close();

        tableData.app_settings = [{ data: { selectedRecipeId: 'pancakes', _ts: 9e15 } }];       // newer remote
        const b = await bootDOM('recipes.html', [], JSON.stringify({ selectedRecipeId: 'bagel', _ts: 1 }));
        adoptedRemote = /"selectedRecipeId":"pancakes"/.test(b.w.localStorage.getItem('mealPrep.state.v1'));
        b.dom.window.close();
    } finally {
        tableData.app_settings = [];
        mockSession = null;
    }
    const ok = keptLocal && adoptedRemote;
    console.log((ok ? 'ok   ' : 'FAIL ') + 'state-ts   (fresh-local-kept=' + keptLocal + ', newer-remote-adopted=' + adoptedRemote + ')');
    return ok;
}

// Snack on first load: a week template whose snack is a custom (sb_) recipe shows that snack in
// the dropdown AND the day card on the very first render (was defaulting to None due to (a) the
// template not being applied on load and (b) reflecting the dropdown before its option existed).
async function testWeekSnackOnLoad() {
    const snackRow = {
        id: 'snk3', title: 'Carrot Sticks', meal_type: 'snack', base_servings: 1, description: '', notes: '', freezer_tips: '', instructions: [],
        recipe_ingredients: [{ weight_in_grams: 114, ingredients: { name: 'Baby Carrots', usda_fdc_id: 999003, data_type: 'Branded', calories_per_100g: 40, protein_per_100g: 1, fat_per_100g: 0, carbs_per_100g: 9, fiber_per_100g: 3, is_estimate: true } }]
    };
    const origWeeks = tableData.week_plans;
    let ok = false, info = '';
    try {
        tableData.recipes = [snackRow];
        tableData.week_plans = (origWeeks || []).map((wk) => (wk.week === 1 ? Object.assign({}, wk, { snack: 'sb_snk3' }) : wk));
        // Stale persisted state: on week 1, customSelections has no snack (saved before snacks existed).
        const seed = JSON.stringify({ activeWeek: '1', _ts: 5, customSelections: { breakfast: 'bagel', lunch: 'vegStirfry', dinner: 'tofuStirfry', dessert: 'blondies' } });
        const b = await bootDOM('index.html', [], seed);
        const w = b.w, d = w.document;
        const snackVal = d.getElementById('snack-mix').value;
        const cardShows = /Carrot Sticks/.test(d.getElementById('meals-list').textContent);
        b.dom.window.close();
        ok = snackVal === 'sb_snk3' && cardShows;
        info = 'snack-mix=' + snackVal + ', card-shows-carrots=' + cardShows;
    } finally {
        tableData.recipes = []; tableData.week_plans = origWeeks;
    }
    console.log((ok ? 'ok   ' : 'FAIL ') + 'week-snack-load (' + info + ')');
    return ok;
}

// Snack slot (dashboard): a 5th selectable Snack slot replaces the fixed carrot baseline; the
// bottom "Snacks" check totals snack + dessert directly. Default: snack='none' (0 kcal).
async function testSnackSlot() {
    const b = await bootDOM('index.html');
    const w = b.w, d = w.document;
    const snackSel = d.getElementById('snack-mix');
    const hasNone = !!snackSel && Array.from(snackSel.options).some((o) => o.value === 'none');
    const cards = d.getElementById('meals-list').children.length;
    const daily = d.getElementById('sum-daily-cal').textContent;
    const snacksDesc = d.getElementById('val-snacks-desc').textContent;
    const roles = Array.from(d.getElementById('meals-list').children).map((c) => (c.querySelector('span') || {}).textContent);
    b.dom.window.close();
    // No carrot baseline + snack 'none' -> daily = 205+765+662+88 = 1720; snacks check = 0 + dessert 88.
    const ok = hasNone && cards === 5 && /1720/.test(daily) && /88 kcal/.test(snacksDesc) && roles.indexOf('Snack') >= 0;
    console.log((ok ? 'ok   ' : 'FAIL ') + 'snack-slot (none-opt=' + hasNone + ', cards=' + cards + ', daily=' + daily.trim() + ', snacks="' + snacksDesc.trim() + '")');
    return ok;
}

(async function () {
    let failed = false;
    for (const page of PAGES) {
        const { errors, asserted } = await runPage(page);
        const okRender = asserted && errors.length === 0;
        console.log((okRender ? 'ok   ' : 'FAIL ') + page.label + '  (' + page.file + ')' + (asserted ? '' : ' — did not render'));
        errors.slice(0, 6).forEach((e) => console.log('       ' + e.slice(0, 240)));
        if (!okRender) failed = true;
    }
    if (!(await testStateLink())) failed = true;
    if (!(await testImport())) failed = true;
    if (!(await testOpenInScaler())) failed = true;
    if (!(await testScalePreview())) failed = true;
    if (!(await testQuickAdd())) failed = true;
    if (!(await testWeekEditor())) failed = true;
    if (!(await testOverlap())) failed = true;
    if (!(await testUnitConvert())) failed = true;
    if (!(await testEditUnitMacros())) failed = true;
    if (!(await testRecipeLibrary())) failed = true;
    if (!(await testSnackInLibrary())) failed = true;
    if (!(await testDeepDive())) failed = true;
    if (!(await testCustomSave())) failed = true;
    if (!(await testHeaderAuth())) failed = true;
    if (!(await testAddWeek())) failed = true;
    if (!(await testStateTimestamp())) failed = true;
    if (!(await testWeekSnackOnLoad())) failed = true;
    if (!(await testFreezerNotes())) failed = true;
    if (!(await testSnackSlot())) failed = true;
    console.log(failed ? '\nSMOKE TEST FAILED.' : '\nAll pages render + state links + NYT import + quick-add + week-editor + overlap + recipe-library + freezer/notes + snack-slot (mocked backend).');
    process.exitCode = failed ? 1 : 0;
})();
