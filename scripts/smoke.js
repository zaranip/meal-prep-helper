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
        functions: { invoke: () => Promise.resolve({ data: { results: [] }, error: null }) }
    };
}

const SCRIPTS = ['js/config.js', 'js/data-reconstruct.js', 'js/data-layer.js', 'js/state.js', 'js/data.js', 'js/packaging.js', 'js/nav.js', 'js/app.js'];

const PAGES = [
    { file: 'index.html', label: 'dashboard', assert: (d) => /1800/.test(d.getElementById('sum-daily-cal').textContent) && d.getElementById('meals-list').children.length === 4 },
    { file: 'recipes.html', label: 'recipes', assert: (d) => d.getElementById('recipe-title').textContent !== '--' && d.getElementById('scaled-ingredients').children.length > 0 },
    { file: 'planner.html', label: 'planner', assert: (d) => d.getElementById('grocery-items-container').children.length > 0 && d.getElementById('timeline-container').children.length > 0 },
    { file: 'calendar.html', label: 'calendar', assert: (d) => d.getElementById('schedule-container').children.length > 0 },
    { file: 'builder.html', label: 'builder', assert: (d) => d.getElementById('builder-auth').innerHTML.length > 0, extra: ['js/builder.js'] }
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
    console.log(failed ? '\nSMOKE TEST FAILED.' : '\nAll pages render + state links across pages (mocked backend).');
    process.exitCode = failed ? 1 : 0;
})();
