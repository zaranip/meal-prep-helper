/* Persisted app state shared across the now-separate pages. localStorage is the fast cache;
 * the Supabase `app_settings` row is the cross-device source of truth when signed in.
 *
 * Declares the state globals the engine uses (calorieGoal, carbMode, amountMode, prepDays,
 * activeWeek, selectedRecipeId, customSelections) at TOP LEVEL so app.js's bare references
 * resolve here. Load AFTER data-layer.js and BEFORE data.js / app.js.
 *
 * window.STATE_READY resolves once local + (best-effort) remote state is loaded; pages await
 * it alongside DATA_READY before the first render. Call persistState() after any change. */

const STATE_KEY = 'mealPrep.state.v1';
const STATE_DEFAULTS = {
    calorieGoal: 1800, carbMode: 'rice', amountMode: 'exact', prepDays: 7,
    activeWeek: '1', selectedRecipeId: 'bagel',
    customSelections: { breakfast: 'bagel', lunch: 'vegStirfry', dinner: 'tofuStirfry', dessert: 'blondies' }
};

function _loadLocalState() {
    try { return Object.assign({}, STATE_DEFAULTS, JSON.parse(localStorage.getItem(STATE_KEY)) || {}); }
    catch (e) { return Object.assign({}, STATE_DEFAULTS); }
}

const _s0 = _loadLocalState();
const BASE_CALORIE_GOAL = 1800;
let calorieGoal = _s0.calorieGoal;
let carbMode = _s0.carbMode;
let amountMode = _s0.amountMode;
let prepDays = _s0.prepDays;
let activeWeek = _s0.activeWeek;
let selectedRecipeId = _s0.selectedRecipeId;
const customSelections = Object.assign({}, STATE_DEFAULTS.customSelections, _s0.customSelections || {});

function snapshotState() {
    return {
        calorieGoal: calorieGoal, carbMode: carbMode, amountMode: amountMode, prepDays: prepDays,
        activeWeek: activeWeek, selectedRecipeId: selectedRecipeId,
        customSelections: { breakfast: customSelections.breakfast, lunch: customSelections.lunch, dinner: customSelections.dinner, dessert: customSelections.dessert }
    };
}

function _applyState(s) {
    if (!s) return;
    if (s.calorieGoal != null) calorieGoal = s.calorieGoal;
    if (s.carbMode) carbMode = s.carbMode;
    if (s.amountMode) amountMode = s.amountMode;
    if (s.prepDays != null) prepDays = s.prepDays;
    if (s.activeWeek != null) activeWeek = String(s.activeWeek);
    if (s.selectedRecipeId) selectedRecipeId = s.selectedRecipeId;
    if (s.customSelections) Object.assign(customSelections, s.customSelections);
}

// Best-effort write-through: localStorage always; Supabase when a session exists.
function persistState() {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(snapshotState())); } catch (e) { /* storage off */ }
    var sb = window.supabaseClient;
    if (!sb || !sb.auth) return;
    sb.auth.getSession().then(function (r) {
        if (!r || !r.data || !r.data.session) return; // only signed-in writes (RLS)
        sb.from('app_settings').upsert([{ id: 1, data: snapshotState(), updated_at: new Date().toISOString() }], { onConflict: 'id' })
            .then(function () {}, function () {}); // ignore errors — localStorage already holds it
    }, function () {});
}

// On load, adopt the remote row if present (cross-device source of truth), else keep local.
window.STATE_READY = (async function () {
    var sb = window.supabaseClient;
    if (!sb) return snapshotState();
    try {
        var res = await sb.from('app_settings').select('data').eq('id', 1).maybeSingle();
        if (res && res.data && res.data.data) {
            _applyState(res.data.data);
            try { localStorage.setItem(STATE_KEY, JSON.stringify(snapshotState())); } catch (e) {}
        }
    } catch (e) { /* offline / not seeded — keep localStorage values */ }
    return snapshotState();
})();
