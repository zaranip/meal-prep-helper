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
function mockClient() {
    return {
        from(name) { return mockBuilder(() => tableData[name] || []); },
        auth: {
            getSession: () => Promise.resolve({ data: { session: null } }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
            signInWithPassword: () => Promise.resolve({ error: null }),
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
    { file: 'index.html', label: 'dashboard', assert: (d) => /1800/.test(d.getElementById('sum-daily-cal').textContent) && d.getElementById('meals-list').children.length === 4 },
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
    const opts = Array.from(d.getElementById('b-meal-type').options).map((o) => o.value);
    const mealsOk = opts.indexOf('meal') >= 0 && opts.indexOf('lunch') < 0 && opts.indexOf('dinner') < 0;
    b.dom.window.close();
    const ok = title === 'Test Paella' && /Heat the oil/.test(steps) && rows === 3 && mealsOk;
    console.log((ok ? 'ok   ' : 'FAIL ') + 'nyt-import  (title="' + title + '", steps=' + /Heat/.test(steps) + ', draft rows=' + rows + ', meal-opts ok=' + mealsOk + ')');
    return ok;
}

// Quick-add staples: rice blend adds 2 verified rows scaled by base servings (37.5/18.75 × 2).
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
    b.dom.window.close();
    const ok = rows === 2 && /White Rice/.test(txt) && /Black Rice/.test(txt) && grams.indexOf('75') >= 0 && grams.indexOf('37.5') >= 0;
    console.log((ok ? 'ok   ' : 'FAIL ') + 'quick-add  (rice blend @ 2× servings -> ' + rows + ' rows, grams=' + JSON.stringify(grams) + ')');
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

    // Focus mode: rank others vs a chosen recipe.
    const focus = d.getElementById('overlap-focus');
    focus.value = focus.options[1].value;
    focus.dispatchEvent(new w.Event('change', { bubbles: true }));
    await new Promise((r) => w.setTimeout(r, 20));
    const focusCards = results().querySelectorAll('.bg-white').length;
    const focusOk = focusCards > 0 && /share the most with/.test(results().textContent);
    b.dom.window.close();

    const ok = cats === 4 && focusOpts >= 3 && previewOk && expandOk && addMsgOk && focusOk;
    console.log((ok ? 'ok   ' : 'FAIL ') + 'overlap    (cats=' + cats + ', preview=' + previewCards + ', expanded=' + expandedCards + ', add-btn=' + hasAddBtn + ', signin-msg=' + addMsgOk + ', focus cards=' + focusCards + ')');
    return ok;
}

// Recipe Library (recipes page): category filter + ordering breakfast -> meals -> dessert.
async function testRecipeLibrary() {
    const b = await bootDOM('recipes.html');
    const w = b.w, d = w.document;
    const cat = (el) => (el.querySelector('span:last-child') || {}).textContent.toLowerCase();
    const order = { breakfast: 0, meal: 1, dessert: 2, snack: 2 };
    const cats = () => Array.from(d.getElementById('recipe-directory').children).map(cat);

    const allCats = cats();
    // Non-decreasing category order across the full list.
    let ordered = true;
    for (let i = 1; i < allCats.length; i++) if ((order[allCats[i]] ?? 9) < (order[allCats[i - 1]] ?? 9)) ordered = false;
    const firstIsBreakfast = allCats[0] === 'breakfast';
    const lastIsDessert = order[allCats[allCats.length - 1]] === 2;

    // Filter to Breakfast -> only breakfast rows.
    const bBtn = Array.from(d.querySelectorAll('.recipe-lib-btn')).find((x) => x.getAttribute('data-cat') === 'breakfast');
    bBtn.dispatchEvent(new w.Event('click', { bubbles: true }));
    await new Promise((r) => w.setTimeout(r, 10));
    const onlyBreakfast = cats().every((c) => c === 'breakfast') && cats().length > 0;
    const btnActive = bBtn.classList.contains('bg-emeraldAccent');
    b.dom.window.close();

    const ok = allCats.length > 0 && ordered && firstIsBreakfast && lastIsDessert && onlyBreakfast && btnActive;
    console.log((ok ? 'ok   ' : 'FAIL ') + 'recipe-lib (ordered=' + ordered + ', first=' + allCats[0] + ', last=' + allCats[allCats.length - 1] + ', breakfast-filter=' + onlyBreakfast + ', active=' + btnActive + ')');
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
    if (!(await testQuickAdd())) failed = true;
    if (!(await testWeekEditor())) failed = true;
    if (!(await testOverlap())) failed = true;
    if (!(await testRecipeLibrary())) failed = true;
    if (!(await testFreezerNotes())) failed = true;
    console.log(failed ? '\nSMOKE TEST FAILED.' : '\nAll pages render + state links + NYT import + quick-add + week-editor + overlap + recipe-library + freezer/notes (mocked backend).');
    process.exitCode = failed ? 1 : 0;
})();
