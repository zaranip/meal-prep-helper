/* Shared header + nav for the separate pages. Builds the title, the Daily Calorie Goal input
 * (#calorie-goal), the Ingredient Units toggle (.amount-btn), and links to every page into an
 * <div id="app-header"></div> placeholder. Reflects persisted state (js/state.js, loaded first);
 * app.js attaches the listeners to #calorie-goal / .amount-btn (so load nav.js BEFORE app.js). */
(function () {
    'use strict';
    var host = document.getElementById('app-header');
    if (!host) return;
    var page = (document.body && document.body.dataset && document.body.dataset.page) || 'dashboard';
    var goal = (typeof calorieGoal !== 'undefined') ? calorieGoal : 1800;
    var mode = (typeof amountMode !== 'undefined') ? amountMode : 'exact';

    var links = [
        { p: 'dashboard', href: 'index.html', label: 'Dashboard' },
        { p: 'recipes', href: 'recipes.html', label: 'Recipes' },
        { p: 'prep', href: 'planner.html', label: 'Planner' },
        { p: 'calendar', href: 'calendar.html', label: 'Calendar' },
        { p: 'builder', href: 'builder.html', label: '+', title: 'Add Recipe' }
    ];
    var linkHtml = links.map(function (l) {
        var active = l.p === page;
        var cls = 'px-4 py-2 rounded-md font-medium transition-all ' +
            (active ? 'bg-white shadow-sm text-stoneNeutral-800' : 'text-stoneNeutral-700 hover:text-stoneNeutral-900') +
            (l.label === '+' ? ' font-bold text-lg leading-none px-3' : '');
        var attrs = l.title ? ' title="' + l.title + '" aria-label="' + l.title + '"' : '';
        return '<a href="' + l.href + '"' + attrs + ' class="' + cls + '">' + l.label + '</a>';
    }).join('');

    var amtBtn = function (val, label) {
        var on = mode === val;
        return '<button data-amount="' + val + '" class="amount-btn px-3 py-1 rounded-md text-xs font-bold transition-all ' +
            (on ? 'bg-white shadow-sm text-emeraldAccent' : 'text-stoneNeutral-700 hover:text-stoneNeutral-900') + '">' + label + '</button>';
    };

    host.innerHTML =
        '<header class="bg-white border-b border-stoneNeutral-200 sticky top-0 z-10 shadow-sm">' +
            '<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row justify-between items-center gap-4">' +
                '<div>' +
                    '<h1 class="text-2xl font-bold text-stoneNeutral-900 tracking-tight">Meal Prep Dashboard</h1>' +
                    '<p class="text-sm text-stoneNeutral-700 mt-1">Healthy, Nutritious, High Protein Diet &bull; Daily Calorie Goal: ' +
                        '<input type="number" id="calorie-goal" min="200" max="5000" step="50" value="' + goal + '" class="w-20 font-semibold text-emeraldAccent bg-stoneNeutral-100 border border-stoneNeutral-200 rounded px-1.5 py-0.5 text-center focus:outline-none focus:ring-2 focus:ring-emeraldAccent"> ' +
                        '<span class="text-emeraldAccent font-semibold">kcal/day</span>' +
                        '<span class="block text-[11px] text-stoneNeutral-700 mt-0.5">Changing this scales every recipe &amp; the 1.0&times; prep baseline in proportion.</span>' +
                    '</p>' +
                    '<div class="mt-2 flex flex-wrap items-center gap-2">' +
                        '<span class="text-xs font-bold text-stoneNeutral-700">Ingredient Units:</span>' +
                        '<div class="flex bg-stoneNeutral-100 p-0.5 rounded-lg border border-stoneNeutral-200">' + amtBtn('exact', 'Exact') + amtBtn('whole', 'Whole') + '</div>' +
                        '<span class="text-[11px] text-stoneNeutral-700 italic">Rounds discrete items (eggs, bagels, potatoes, slices, cubes) to whole numbers across macros, the scaler &amp; shopping.</span>' +
                    '</div>' +
                '</div>' +
                '<div class="flex flex-col items-stretch sm:items-end gap-3">' +
                    '<div id="header-auth" class="text-xs w-full sm:w-auto"></div>' +
                    '<nav class="flex gap-2 bg-stoneNeutral-100 p-1.5 rounded-lg border border-stoneNeutral-200 text-sm">' + linkHtml + '</nav>' +
                '</div>' +
            '</div>' +
        '</header>';

    // ---- Unified sign-in (the ONE place to authenticate) -------------------
    // Sign in / Create account / Forgot password / Sign out + password-recovery, all via the
    // shared window.supabaseClient session — so signing in here signs you in on every page/feature.
    (function () {
        var sb = window.supabaseClient;
        var authEl = document.getElementById('header-auth');
        if (!authEl) return;
        if (!sb || !sb.auth) { authEl.innerHTML = '<span class="text-stoneNeutral-400">offline</span>'; return; }

        function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
        function msg(text, ok) { var m = document.getElementById('ha-msg'); if (m) { m.textContent = text || ''; m.className = 'text-[11px] ' + (ok === true ? 'text-emeraldAccent' : ok === false ? 'text-amberAccent' : 'text-stoneNeutral-700'); } }
        var INP = 'w-full bg-stoneNeutral-100 border border-stoneNeutral-200 rounded px-2 py-1.5';

        function renderSignedIn(session) {
            authEl.innerHTML =
                '<div class="flex items-center justify-end gap-2 flex-wrap">' +
                    '<span class="text-stoneNeutral-700">Signed in: <b>' + esc(session.user.email) + '</b></span>' +
                    '<button id="ha-signout" class="bg-stoneNeutral-100 hover:bg-stoneNeutral-200 border border-stoneNeutral-200 text-stoneNeutral-800 font-semibold px-3 py-1 rounded">Sign out</button>' +
                '</div>';
            document.getElementById('ha-signout').addEventListener('click', function () { sb.auth.signOut(); });
        }
        function renderRecovery() {
            authEl.innerHTML =
                '<div class="bg-white border border-stoneNeutral-200 rounded-lg shadow-sm p-3 text-left space-y-2 w-full sm:w-72">' +
                    '<p class="font-semibold text-stoneNeutral-900">Set a new password</p>' +
                    '<input id="ha-newpass" type="password" placeholder="new password" class="' + INP + '">' +
                    '<button id="ha-update" class="w-full bg-emeraldAccent text-white font-semibold px-2 py-1.5 rounded hover:opacity-90">Update password</button>' +
                    '<p id="ha-msg" class="text-[11px]"></p>' +
                '</div>';
            document.getElementById('ha-update').addEventListener('click', async function () {
                var pw = document.getElementById('ha-newpass').value;
                if (!pw || pw.length < 6) { msg('Password must be at least 6 characters.', false); return; }
                msg('Updating…', null);
                var r = await sb.auth.updateUser({ password: pw });
                if (r.error) { msg(r.error.message, false); return; }
                msg('Password updated. You’re signed in.', true);
                sb.auth.getSession().then(function (s) { if (s.data.session) renderSignedIn(s.data.session); });
            });
        }
        function renderSignedOut() {
            authEl.innerHTML =
                '<details id="ha-details" class="relative text-left">' +
                    '<summary class="list-none cursor-pointer bg-emeraldAccent text-white font-semibold px-3 py-1 rounded inline-block text-center">Sign in / Create account</summary>' +
                    '<div class="sm:absolute sm:right-0 mt-2 w-full sm:w-64 bg-white border border-stoneNeutral-200 rounded-lg shadow-lg p-3 z-20 space-y-2">' +
                        '<input id="ha-email" type="email" placeholder="email" class="' + INP + '">' +
                        '<input id="ha-pass" type="password" placeholder="password" class="' + INP + '">' +
                        '<div class="flex gap-2">' +
                            '<button id="ha-signin" class="flex-1 bg-emeraldAccent text-white font-semibold px-2 py-1.5 rounded hover:opacity-90">Sign in</button>' +
                            '<button id="ha-signup" class="flex-1 bg-skyAccent text-white font-semibold px-2 py-1.5 rounded hover:opacity-90">Create account</button>' +
                        '</div>' +
                        '<button id="ha-forgot" class="text-skyAccent hover:underline text-[11px]">Forgot password?</button>' +
                        '<p id="ha-msg" class="text-[11px]"></p>' +
                    '</div>' +
                '</details>';
            function creds() { return { email: (document.getElementById('ha-email').value || '').trim(), password: document.getElementById('ha-pass').value || '' }; }
            document.getElementById('ha-signin').addEventListener('click', async function () {
                var c = creds(); if (!c.email || !c.password) { msg('Enter email and password.', false); return; }
                msg('Signing in…', null);
                var r = await sb.auth.signInWithPassword(c);
                if (r.error) msg(r.error.message, false); // success -> onAuthStateChange re-renders
            });
            document.getElementById('ha-signup').addEventListener('click', async function () {
                var c = creds(); if (!c.email || !c.password) { msg('Enter email and password.', false); return; }
                if (c.password.length < 6) { msg('Password must be at least 6 characters.', false); return; }
                msg('Creating account…', null);
                var r = await sb.auth.signUp(c);
                if (r.error) { msg(r.error.message, false); return; }
                msg(r.data && r.data.session ? 'Account created — you’re signed in.' : 'Account created — check your email to confirm, then sign in.', true);
            });
            document.getElementById('ha-forgot').addEventListener('click', async function () {
                var email = (document.getElementById('ha-email').value || '').trim();
                if (!email) { msg('Enter your email above first.', false); return; }
                msg('Sending reset email…', null);
                var r = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname });
                msg(r.error ? r.error.message : 'Reset email sent — open the link to set a new password.', !r.error);
            });
        }
        function renderAuth(session) { if (session) renderSignedIn(session); else renderSignedOut(); }

        sb.auth.getSession().then(function (r) { renderAuth(r.data.session); }).catch(function () { renderSignedOut(); });
        sb.auth.onAuthStateChange(function (event, session) {
            if (event === 'PASSWORD_RECOVERY') { renderRecovery(); return; }
            renderAuth(session);
        });
    })();
})();
