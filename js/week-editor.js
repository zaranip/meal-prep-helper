/* Week-template manager (Calendar page): create / edit / delete the preset meal combinations
 * in the Supabase `week_plans` table. Public read; editing requires sign-in (RLS), using the
 * shared session (so signing in here also signs you in on the Add Recipe page, and vice versa).
 * Loads only on calendar.html (guarded on #week-editor). */
(function () {
    'use strict';
    var host = document.getElementById('week-editor');
    if (!host) return;

    var sb = window.supabaseClient;
    var signedIn = false;
    var weeks = {}; // editable copy of weeksPlan: { '1': {breakfast,lunch,dinner,dessert}, ... }

    function $(id) { return document.getElementById(id); }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

    // Slots keep the internal keys (breakfast/lunch/dinner/dessert) but are labeled as the two
    // "Meal" slots (no Lunch/Dinner distinction).
    var SLOTS = [
        { key: 'breakfast', label: 'Breakfast', cat: 'breakfast' },
        { key: 'lunch', label: 'Meal 1', cat: 'meal' },
        { key: 'dinner', label: 'Meal 2', cat: 'meal' },
        { key: 'dessert', label: 'Dessert', cat: 'dessert' }
    ];
    function catOf(k) {
        var t = (((window.recipes || {})[k] || {}).type || '').toLowerCase();
        if (t === 'breakfast') return 'breakfast';
        if (t === 'meal') return 'meal';
        if (t === 'dessert' || t === 'snack') return 'dessert';
        return 'other';
    }
    function recipeOptions(cat, selected) {
        var R = window.recipes || {};
        var keys = Object.keys(R).filter(function (k) { return catOf(k) === cat; });
        if (selected && keys.indexOf(selected) < 0 && R[selected]) keys.unshift(selected); // keep current value selectable
        return keys.map(function (k) {
            return '<option value="' + esc(k) + '"' + (k === selected ? ' selected' : '') + '>' + esc(R[k].title) + '</option>';
        }).join('');
    }
    function firstOf(cat) {
        var R = window.recipes || {};
        var k = Object.keys(R).filter(function (x) { return catOf(x) === cat; })[0];
        return k || Object.keys(R)[0] || '';
    }

    // ---- auth (shared session) ---------------------------------------------
    function renderAuth(session) {
        signedIn = !!session;
        var el = $('week-auth');
        if (el) {
            if (signedIn) {
                el.innerHTML = '<span class="text-stoneNeutral-700">Signed in: ' + esc(session.user.email) + '</span> ' +
                    '<button id="week-signout" class="bg-stoneNeutral-200 text-stoneNeutral-800 font-semibold px-3 py-1.5 rounded hover:bg-stoneNeutral-300">Sign out</button>';
                $('week-signout').addEventListener('click', function () { sb.auth.signOut(); });
            } else {
                el.innerHTML =
                    '<input id="week-email" type="email" placeholder="email" class="bg-stoneNeutral-100 border border-stoneNeutral-200 rounded px-2 py-1.5 w-36">' +
                    '<input id="week-pass" type="password" placeholder="password" class="bg-stoneNeutral-100 border border-stoneNeutral-200 rounded px-2 py-1.5 w-28">' +
                    '<button id="week-signin" class="bg-emeraldAccent text-white font-semibold px-3 py-1.5 rounded hover:opacity-90">Sign in</button>' +
                    '<span id="week-login-msg" class="text-amberAccent ml-1"></span>';
                $('week-signin').addEventListener('click', async function () {
                    var r = await sb.auth.signInWithPassword({ email: $('week-email').value.trim(), password: $('week-pass').value });
                    if (r.error) $('week-login-msg').textContent = r.error.message;
                });
            }
        }
        renderWeeks();
    }

    // ---- dashboard-style macro summary per week ----------------------------
    // Reuses the dashboard's own globals (baseRecipe / dashMacros / snacksBaseline / calorieGoal /
    // prepDays / amountMode) so the numbers match the Dashboard exactly.
    function r1(v) { return Math.round(v * 10) / 10; }
    function macrosFor(key, days) {
        var R = window.recipes || {};
        if (!key || !R[key] || typeof baseRecipe !== 'function') return { cal: 0, prot: 0, fat: 0, fib: 0, carb: 0 };
        var rec = baseRecipe(key);
        if (!rec) return { cal: 0, prot: 0, fat: 0, fib: 0, carb: 0 };
        return (typeof dashMacros === 'function') ? dashMacros(rec, days) : rec.baseMacros;
    }
    function fmt(m) { return Math.round(m.cal) + ' kcal · ' + r1(m.prot) + 'g P · ' + r1(m.fat) + 'g F · ' + r1(m.fib) + 'g fib · ' + r1(m.carb) + 'g C'; }
    function renderWeekSummary(w) {
        var el = document.getElementById('week-summary-' + w);
        if (!el) return;
        var wk = weeks[w]; if (!wk) return;
        var days = (typeof prepDays !== 'undefined' && prepDays > 0) ? prepDays : 7;
        var R = window.recipes || {};
        var sb0 = window.snacksBaseline || { cal: 0, prot: 0, fat: 0, fib: 0, carb: 0 };
        var daily = { cal: sb0.cal || 0, prot: sb0.prot || 0, fat: sb0.fat || 0, fib: sb0.fib || 0, carb: sb0.carb || 0 };
        var dishHtml = SLOTS.map(function (s) {
            var m = macrosFor(wk[s.key], days);
            ['cal', 'prot', 'fat', 'fib', 'carb'].forEach(function (k) { daily[k] += m[k] || 0; });
            var title = (R[wk[s.key]] || {}).title || '—';
            return '<div class="bg-stoneNeutral-50 rounded p-2 border border-stoneNeutral-200">' +
                '<span class="block text-[9px] uppercase font-bold text-stoneNeutral-700">' + s.label + '</span>' +
                '<span class="block text-[11px] text-stoneNeutral-800 truncate" title="' + esc(title) + '">' + esc(title) + '</span>' +
                '<span class="block font-mono font-bold text-stoneNeutral-900">' + Math.round(m.cal) + ' kcal</span></div>';
        }).join('');
        var weekly = {}; ['cal', 'prot', 'fat', 'fib', 'carb'].forEach(function (k) { weekly[k] = daily[k] * days; });
        el.innerHTML =
            '<div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2 text-center text-xs">' + dishHtml + '</div>' +
            '<div class="text-[11px] text-stoneNeutral-800"><b>Daily</b> (incl. baseline snacks): ' + fmt(daily) + '</div>' +
            '<div class="text-[11px] text-stoneNeutral-800"><b>Week</b> (×' + days + ' days prep): ' + fmt(weekly) + '</div>';
    }
    function refreshAllSummaries() { Object.keys(weeks).forEach(function (w) { renderWeekSummary(w); }); }

    function renderWeeks() {
        var list = $('week-list');
        if (!list) return;
        var nums = Object.keys(weeks).sort(function (a, b) { return (+a) - (+b); });
        list.innerHTML = '';
        if (!nums.length) { list.innerHTML = '<p class="text-sm text-stoneNeutral-700">No week templates yet.' + (signedIn ? ' Use “+ Add week”.' : '') + '</p>'; }
        nums.forEach(function (w) {
            var wk = weeks[w];
            var div = document.createElement('div');
            div.className = 'bg-white p-4 rounded-xl border border-stoneNeutral-200 shadow-sm';
            div.innerHTML =
                '<div class="flex justify-between items-center mb-3">' +
                    '<h4 class="font-bold text-stoneNeutral-900">Week ' + esc(w) + '</h4>' +
                    (signedIn ? '<button class="week-del text-amberAccent text-xs font-semibold hover:underline" data-w="' + esc(w) + '">Delete</button>' : '') +
                '</div>' +
                '<div class="grid grid-cols-2 sm:grid-cols-4 gap-3">' +
                SLOTS.map(function (s) {
                    return '<label class="text-[11px] font-semibold text-stoneNeutral-700">' + s.label +
                        '<select class="week-slot mt-1 w-full bg-stoneNeutral-100 border border-stoneNeutral-200 rounded px-2 py-1.5 text-xs" data-w="' + esc(w) + '" data-slot="' + s.key + '"' + (signedIn ? '' : ' disabled') + '>' +
                        recipeOptions(s.cat, wk[s.key]) + '</select></label>';
                }).join('') +
                '</div>' +
                '<div class="week-summary mt-3 pt-3 border-t border-stoneNeutral-100" id="week-summary-' + esc(w) + '"></div>' +
                (signedIn ? '<div class="mt-3 flex items-center gap-2"><button class="week-save bg-emeraldAccent text-white text-xs font-semibold px-4 py-1.5 rounded hover:opacity-90" data-w="' + esc(w) + '">Save Week ' + esc(w) + '</button><span class="week-msg text-xs"></span></div>' : '');
            list.appendChild(div);
            renderWeekSummary(w);
        });
        list.querySelectorAll('.week-slot').forEach(function (sel) {
            sel.addEventListener('change', function () {
                weeks[sel.getAttribute('data-w')][sel.getAttribute('data-slot')] = sel.value;
                renderWeekSummary(sel.getAttribute('data-w')); // live per-dish + daily/weekly macros
            });
        });
        list.querySelectorAll('.week-save').forEach(function (btn) {
            btn.addEventListener('click', function () { saveWeek(btn.getAttribute('data-w'), btn.parentElement.querySelector('.week-msg')); });
        });
        list.querySelectorAll('.week-del').forEach(function (btn) {
            btn.addEventListener('click', function () { deleteWeek(btn.getAttribute('data-w')); });
        });
        var addBtn = $('week-add');
        if (addBtn) { addBtn.disabled = !signedIn; addBtn.classList.toggle('opacity-40', !signedIn); addBtn.title = signedIn ? '' : 'Sign in to add a week'; }
    }

    async function saveWeek(w, msgEl) {
        if (!signedIn) return;
        var wk = weeks[w];
        var row = { week: Number(w), breakfast: wk.breakfast, lunch: wk.lunch, dinner: wk.dinner, dessert: wk.dessert };
        var res = await sb.from('week_plans').upsert([row], { onConflict: 'week' });
        if (res.error) { if (msgEl) { msgEl.textContent = res.error.message; msgEl.className = 'week-msg text-xs text-amberAccent'; } return; }
        window.weeksPlan[w] = { breakfast: wk.breakfast, lunch: wk.lunch, dinner: wk.dinner, dessert: wk.dessert };
        if (msgEl) { msgEl.textContent = 'Saved.'; msgEl.className = 'week-msg text-xs text-emeraldAccent'; }
    }
    async function deleteWeek(w) {
        if (!signedIn) return;
        var res = await sb.from('week_plans').delete().eq('week', Number(w));
        if (res.error) return;
        delete weeks[w];
        if (window.weeksPlan) delete window.weeksPlan[w];
        renderWeeks();
    }
    function addWeek() {
        if (!signedIn) return;
        var n = 1; while (weeks[String(n)]) n++;
        var w = String(n);
        weeks[w] = { breakfast: firstOf('breakfast'), lunch: firstOf('meal'), dinner: firstOf('meal'), dessert: firstOf('dessert') };
        renderWeeks();
    }

    // Hook used by the Ingredient Overlap tool (js/overlap.js): create a new editable week card
    // pre-filled with a chosen pair of meals (Meal 1 / Meal 2), with Breakfast/Dessert defaulted.
    // Mirrors addWeek() — it does NOT save; she reviews and clicks "Save Week" like any other.
    window.weekEditor = {
        isSignedIn: function () { return signedIn; },
        addFromMeals: function (mealA, mealB) {
            if (!signedIn) return { ok: false, reason: 'signin' };
            var n = 1; while (weeks[String(n)]) n++;
            var w = String(n);
            weeks[w] = { breakfast: firstOf('breakfast'), lunch: mealA, dinner: mealB, dessert: firstOf('dessert') };
            renderWeeks();
            var el = document.getElementById('week-summary-' + w);
            if (el && el.scrollIntoView) { try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {} }
            return { ok: true, week: w };
        }
    };

    function boot() {
        weeks = JSON.parse(JSON.stringify(window.weeksPlan || {}));
        renderWeeks();
        if (sb && sb.auth) {
            sb.auth.getSession().then(function (r) { renderAuth(r.data.session); });
            sb.auth.onAuthStateChange(function (_e, s) { renderAuth(s); });
        }
        var addBtn = $('week-add'); if (addBtn) addBtn.addEventListener('click', addWeek);
        // Recompute the per-week macros when the header's calorie goal / units mode change
        // (app.js updates the globals on the same events; we run after to read the new values).
        var goalInput = $('calorie-goal');
        if (goalInput) goalInput.addEventListener('input', function () { setTimeout(refreshAllSummaries, 0); });
        document.querySelectorAll('.amount-btn').forEach(function (b) { b.addEventListener('click', function () { setTimeout(refreshAllSummaries, 0); }); });
    }

    try {
        if (!sb) { var l = $('week-list'); if (l) l.innerHTML = '<p class="text-sm text-amberAccent">Backend not available — week templates need an internet connection.</p>'; return; }
        (window.DATA_READY || Promise.resolve()).then(boot).catch(function () { boot(); });
    } catch (e) { console.error('Week editor failed:', e); }
})();
