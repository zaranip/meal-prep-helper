/* "My Custom Recipes" page — manage your own recipes: View (opens in the Recipes scaler),
 * Edit (opens the recipe in the Add Recipe form), Delete (removes it). Per-account & private:
 * RLS returns only your own recipes, so signed-out shows an empty/sign-in state.
 * Self-contained: fetches from Supabase directly (so it can refresh on sign-in/out and after a
 * delete), and uses window.customRecipesToApp to compute the displayed per-serving macros. */
(function () {
    'use strict';
    var host = document.getElementById('my-recipes-list');
    if (!host) return;
    var sb = window.supabaseClient;

    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    function r1(v) { return Math.round((v || 0) * 10) / 10; }
    function msg(text, ok) {
        var el = document.getElementById('my-recipes-msg');
        if (el) { el.textContent = text || ''; el.className = 'text-xs font-semibold mt-2 ' + (ok === true ? 'text-emeraldAccent' : ok === false ? 'text-amberAccent' : 'text-stoneNeutral-700'); }
    }

    // Same shape the builder/data-layer load (so customRecipesToApp can compute macros).
    var SELECT = '*,recipe_ingredients(quantity_value,quantity_unit,weight_in_grams,' +
        'ingredients(name,usda_fdc_id,data_type,calories_per_100g,protein_per_100g,fat_per_100g,carbs_per_100g,fiber_per_100g,package_unit,package_weight_g,is_estimate))';

    function emptyState(signedIn) {
        host.innerHTML = '<div class="bg-white border border-stoneNeutral-200 rounded-xl p-5 text-sm text-stoneNeutral-700">' +
            (signedIn
                ? 'No custom recipes yet. Add one on the <a href="builder.html" class="text-skyAccent font-semibold hover:underline">+ (Add Recipe)</a> tab.'
                : '<b>Sign in from the header</b> to see and manage your recipes. New here? Create an account, then add recipes on the <a href="builder.html" class="text-skyAccent font-semibold hover:underline">+</a> tab.') +
            '</div>';
    }

    function renderList(rows) {
        var app = (window.customRecipesToApp ? window.customRecipesToApp(rows) : {}) || {};
        host.innerHTML = rows.map(function (r) {
            var a = app['sb_' + r.id] || {};
            var m = a.baseMacros || {};
            var key = 'sb_' + r.id;
            return '<div class="bg-white border border-stoneNeutral-200 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">' +
                '<div class="min-w-0">' +
                    '<div class="flex items-center gap-2 flex-wrap">' +
                        '<h3 class="font-bold text-stoneNeutral-900 truncate">' + esc(r.title) + '</h3>' +
                        '<span class="text-[10px] uppercase font-black tracking-wider bg-stoneNeutral-200 text-stoneNeutral-700 px-1.5 py-0.5 rounded">' + esc(a.type || r.meal_type || '') + '</span>' +
                    '</div>' +
                    (r.description ? '<p class="text-xs text-stoneNeutral-700 mt-0.5 truncate">' + esc(r.description) + '</p>' : '') +
                    '<p class="text-xs text-stoneNeutral-700 font-mono mt-1">' + Math.round(m.cal || 0) + ' kcal · ' + r1(m.prot) + 'g P · ' + r1(m.fat) + 'g F · ' + r1(m.fib) + 'g fib · ' + r1(m.carb) + 'g C <span class="text-stoneNeutral-400">/ serving</span></p>' +
                '</div>' +
                '<div class="flex items-center gap-2 text-sm shrink-0">' +
                    '<button class="mr-view bg-stoneNeutral-100 hover:bg-stoneNeutral-200 border border-stoneNeutral-200 text-stoneNeutral-800 font-semibold px-3 py-1.5 rounded" data-k="' + esc(key) + '">View</button>' +
                    '<button class="mr-edit bg-skyAccent text-white font-semibold px-3 py-1.5 rounded hover:opacity-90" data-sb="' + esc(r.id) + '">Edit</button>' +
                    '<button class="mr-delete bg-white border border-amberAccent text-amberAccent font-semibold px-3 py-1.5 rounded hover:bg-amber-50" data-sb="' + esc(r.id) + '" data-title="' + esc(r.title) + '">Delete</button>' +
                '</div>' +
            '</div>';
        }).join('');
        wire();
    }

    function wire() {
        host.querySelectorAll('.mr-view').forEach(function (b) {
            b.addEventListener('click', function () {
                var k = b.getAttribute('data-k');
                if (typeof goToRecipe === 'function') goToRecipe(k);
                else { try { if (typeof selectedRecipeId !== 'undefined') selectedRecipeId = k; if (typeof persistState === 'function') persistState(); } catch (e) {} window.location.href = 'recipes.html'; }
            });
        });
        host.querySelectorAll('.mr-edit').forEach(function (b) {
            b.addEventListener('click', function () { window.location.href = 'builder.html?edit=' + encodeURIComponent(b.getAttribute('data-sb')); });
        });
        host.querySelectorAll('.mr-delete').forEach(function (b) {
            b.addEventListener('click', function () { del(b.getAttribute('data-sb'), b.getAttribute('data-title'), b); });
        });
    }

    async function del(sbId, title, btn) {
        if (!sb) { msg('Backend unavailable.', false); return; }
        var session = null;
        try { session = (await sb.auth.getSession()).data.session; } catch (e) { /* offline */ }
        if (!session) { msg('Sign in from the header to delete.', false); return; }
        if (!window.confirm('Delete "' + title + '"? This can\'t be undone.')) return;
        btn.disabled = true; btn.textContent = '…';
        var res = await sb.from('recipes').delete().eq('id', sbId);
        if (res.error) { msg(res.error.message, false); btn.disabled = false; btn.textContent = 'Delete'; return; }
        if (window.recipes) delete window.recipes['sb_' + sbId];   // keep other pages' in-memory list in sync
        msg('Deleted "' + title + '".', true);
        fetchAndRender();
    }

    async function fetchAndRender() {
        if (!sb) { emptyState(false); return; }
        var session = null;
        try { session = (await sb.auth.getSession()).data.session; } catch (e) { /* offline */ }
        if (!session) { emptyState(false); return; } // RLS returns nothing signed-out anyway
        var res = await sb.from('recipes').select(SELECT).order('created_at', { ascending: true });
        if (res.error) { host.innerHTML = '<p class="text-sm text-amberAccent">Couldn’t load recipes: ' + esc(res.error.message) + '</p>'; return; }
        var rows = res.data || [];
        if (!rows.length) { emptyState(true); return; }
        renderList(rows);
    }

    try {
        if (!sb) { emptyState(false); return; }
        (window.DATA_READY || Promise.resolve()).then(fetchAndRender).catch(fetchAndRender);
        if (sb.auth && sb.auth.onAuthStateChange) sb.auth.onAuthStateChange(function () { fetchAndRender(); });
    } catch (e) { console.error('My Recipes failed:', e); }
})();
