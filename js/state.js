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
    customSelections: { breakfast: 'bagel', lunch: 'vegStirfry', dinner: 'tofuStirfry', dessert: 'blondies', snack: 'none' }
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
        customSelections: { breakfast: customSelections.breakfast, lunch: customSelections.lunch, dinner: customSelections.dinner, dessert: customSelections.dessert, snack: customSelections.snack }
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

// Each write stamps `_ts` (ms). On load we adopt the remote row ONLY if it's at least as new as
// the local one — so a fresh local change (e.g. clicking a recipe right before navigating, whose
// async remote write may be aborted by the navigation) is never clobbered by a stale remote value.
function _writeLocal(ts) {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(Object.assign({}, snapshotState(), { _ts: ts }))); } catch (e) { /* storage off */ }
}
function persistState() {
    var ts = Date.now();
    _writeLocal(ts);
    var sb = window.supabaseClient;
    if (!sb || !sb.auth) return;
    sb.auth.getSession().then(function (r) {
        var sess = r && r.data && r.data.session;
        if (!sess) return; // only signed-in writes (RLS). Settings are PER-USER now.
        sb.from('app_settings').upsert([{ user_id: sess.user.id, data: Object.assign({}, snapshotState(), { _ts: ts }), updated_at: new Date().toISOString() }], { onConflict: 'user_id' })
            .then(function () {}, function () {}); // ignore errors — localStorage already holds it
    }, function () {});
}

// On load, adopt THIS USER's remote row if present AND not older than local (cross-device source
// of truth), else keep local. Per-user: each account has its own settings row; signed-out users
// stay on localStorage only. The timestamp gate prevents a stale remote clobbering a newer local.
window.STATE_READY = (async function () {
    var sb = window.supabaseClient;
    if (!sb || !sb.auth) return snapshotState();
    try {
        var sess = (await sb.auth.getSession()).data.session;
        if (!sess) return snapshotState(); // signed out -> localStorage only
        var res = await sb.from('app_settings').select('data').eq('user_id', sess.user.id).maybeSingle();
        var remote = res && res.data && res.data.data;
        if (remote) {
            var localTs = Number(_s0 && _s0._ts) || 0;
            var remoteTs = Number(remote._ts) || 0;
            if (remoteTs >= localTs) { _applyState(remote); _writeLocal(remoteTs || Date.now()); }
        }
    } catch (e) { /* offline / not seeded — keep localStorage values */ }
    return snapshotState();
})();
