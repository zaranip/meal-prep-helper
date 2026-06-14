/* "Add Recipe" tab — Supabase + USDA backend, integrated into index.html.
 *
 * Loads AFTER data.js / app.js, so it shares their globals (recipes,
 * customSelections, updateTabs, renderRecipeScaler, activeTab...). It only ADDS
 * to the app: USDA-sourced custom recipes are merged into the `recipes` global
 * (keys prefixed 'sb_') so they show in the Recipes tab and dashboard dropdowns.
 *
 * Access model: PUBLIC READ, YOU-ONLY WRITE. Search + viewing work for everyone;
 * save/edit/delete require sign-in (enforced by RLS). Degrades gracefully: if
 * Supabase is unreachable, the rest of the app is untouched. */
(function () {
    'use strict';

    var cfg = window.SUPABASE_CONFIG || {};
    var configured = cfg.url && cfg.anonKey &&
        cfg.url.indexOf('YOUR-PROJECT-ID') === -1 && cfg.anonKey.indexOf('YOUR-PUBLIC') === -1;
    var sbLib = window.supabase;
    // Reuse the data-layer's client (shared auth session) when available.
    var sb = window.supabaseClient || ((configured && sbLib && sbLib.createClient) ? sbLib.createClient(cfg.url, cfg.anonKey) : null);

    // ---- state -------------------------------------------------------------
    var signedIn = false;
    var editingId = null;       // sb recipe id being edited, or null
    var draft = [];             // [{ fdcId, name, dataType, per:{calories,protein,fat,carbs,fiber}, grams }]
    var savedRaw = [];          // raw sb recipes (with joins) for edit/delete

    // ---- helpers -----------------------------------------------------------
    function $(id) { return document.getElementById(id); }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }
    function r1(v) { return Math.round(v * 10) / 10; }
    function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
    function flash(el, msg, ok) {
        if (!el) return;
        el.textContent = msg || '';
        el.className = 'text-xs mt-2 text-center font-semibold ' + (ok ? 'text-emeraldAccent' : 'text-amberAccent');
    }

    // ---- edge function call with REAL error messages ----------------------
    async function invokeFn(body) {
        var res = await sb.functions.invoke('usda-proxy', { body: body });
        if (res.error) {
            var detail = '';
            var status = '';
            var ctx = res.error.context;
            if (ctx) {
                status = ctx.status || '';
                try { var j = await ctx.json(); detail = j.error || j.message || j.msg || JSON.stringify(j); }
                catch (e) { try { detail = await ctx.text(); } catch (e2) { /* ignore */ } }
            }
            throw new Error((status ? '(' + status + ') ' : '') + (detail || res.error.message || 'Edge function error'));
        }
        if (res.data && res.data.error) throw new Error(res.data.error);
        return res.data;
    }

    // ---- macro math --------------------------------------------------------
    function totals() {
        var t = { cal: 0, prot: 0, fat: 0, fib: 0, carb: 0 };
        draft.forEach(function (d) {
            var f = (Number(d.grams) || 0) / 100, p = d.per || {};
            t.cal += (+p.calories || 0) * f;
            t.prot += (+p.protein || 0) * f;
            t.fat += (+p.fat || 0) * f;
            t.fib += (+p.fiber || 0) * f;
            t.carb += (+p.carbs || 0) * f;
        });
        return t;
    }
    function cell(label, val) {
        return '<div class="bg-stoneNeutral-50 rounded p-1.5 border border-stoneNeutral-200">' +
            '<span class="block text-[9px] text-stoneNeutral-700">' + label + '</span>' + esc(val) + '</div>';
    }

    // ---- map sb recipe -> app recipe shape & register globally ------------
    var MEAL_TO_DROPDOWN = { breakfast: 'breakfast-mix', lunch: 'lunch-mix', dinner: 'dinner-mix', dessert: 'dessert-mix', snack: 'dessert-mix' };

    function sbToApp(r) {
        var ings = (r.recipe_ingredients || []).map(function (ri) {
            return { name: (ri.ingredients && ri.ingredients.name) || 'Ingredient', amount: Number(ri.weight_in_grams) || 0, unit: 'g', _p: ri.ingredients || {} };
        });
        var bm = { cal: 0, prot: 0, fat: 0, fib: 0, carb: 0 };
        ings.forEach(function (i) {
            var f = i.amount / 100, p = i._p;
            bm.cal += (+p.calories_per_100g || 0) * f;
            bm.prot += (+p.protein_per_100g || 0) * f;
            bm.fat += (+p.fat_per_100g || 0) * f;
            bm.fib += (+p.fiber_per_100g || 0) * f;
            bm.carb += (+p.carbs_per_100g || 0) * f;
        });
        return {
            id: 'sb_' + r.id, sbId: r.id, custom: true, mealType: r.meal_type || 'snack',
            title: r.title, desc: 'Custom recipe — USDA estimates. Confirm against packages.',
            type: cap(r.meal_type || 'Snack'),
            baseMacros: { cal: Math.round(bm.cal), prot: r1(bm.prot), fat: r1(bm.fat), fib: r1(bm.fib), carb: r1(bm.carb) },
            // _m100 = per-100g macros, so the Recipes-tab scaler can recompute macros
            // when amounts are edited (the scaler's ingredientDB has no custom items).
            ingredients: ings.map(function (i) {
                var p = i._p || {};
                return {
                    name: i.name, amount: Math.round(i.amount * 10) / 10, unit: 'g',
                    _m100: {
                        cal: +p.calories_per_100g || 0, prot: +p.protein_per_100g || 0, fat: +p.fat_per_100g || 0,
                        fib: +p.fiber_per_100g || 0, carb: +p.carbs_per_100g || 0
                    }
                };
            }),
            steps: r.instructions || [],
            freezerTips: r.freezer_tips || 'No freezer notes for this custom recipe.'
        };
    }
    function registerRecipe(app) {
        if (typeof recipes === 'undefined') return;
        recipes[app.id] = app;
        var selId = MEAL_TO_DROPDOWN[app.mealType] || 'dessert-mix';
        var sel = $(selId);
        if (sel && !sel.querySelector('option[value="' + app.id + '"]')) {
            var opt = document.createElement('option');
            opt.value = app.id;
            opt.textContent = app.title + ' (' + Math.round(app.baseMacros.cal) + ' kcal)';
            sel.appendChild(opt);
        }
    }
    function unregisterAllSb() {
        if (typeof recipes === 'undefined') return;
        Object.keys(recipes).filter(function (k) { return k.indexOf('sb_') === 0; }).forEach(function (k) {
            // If a removed custom recipe is currently selected anywhere, fall back to a stock one.
            var fallback = 'bagel';
            if (typeof selectedRecipeId !== 'undefined' && selectedRecipeId === k) selectedRecipeId = fallback;
            if (typeof customSelections !== 'undefined') {
                ['breakfast', 'lunch', 'dinner', 'dessert'].forEach(function (role) {
                    if (customSelections[role] === k) customSelections[role] = fallback;
                });
            }
            delete recipes[k];
        });
        document.querySelectorAll('#breakfast-mix option, #lunch-mix option, #dinner-mix option, #dessert-mix option')
            .forEach(function (o) { if (o.value.indexOf('sb_') === 0) o.remove(); });
    }
    function refreshAppViews() {
        if (typeof updateTabs === 'function') {
            try { updateTabs(); } catch (e) { /* keep going */ }
        }
    }

    // ---- auth UI -----------------------------------------------------------
    function renderAuth(session) {
        signedIn = !!session;
        var area = $('builder-auth');
        if (!area) return;
        if (!sb) { area.innerHTML = '<span class="text-amberAccent font-semibold">Backend not configured</span>'; return; }
        // Sign-in lives in the header now (the one place to authenticate); this just reflects status.
        if (signedIn) {
            area.innerHTML = '<span class="text-emeraldAccent font-semibold">Signed in: ' + esc(session.user.email) + '</span> &bull; <span class="text-stoneNeutral-700">your recipes are private to your account.</span>';
        } else {
            area.innerHTML = '<span class="text-stoneNeutral-700">Sign in from the <b>header (top-right)</b> to add &amp; edit your recipes.</span>';
        }
        syncWriteUI();
        renderSaved();
    }
    function syncWriteUI() {
        var save = $('b-save');
        if (save) {
            save.disabled = !signedIn;
            save.classList.toggle('opacity-40', !signedIn);
            save.classList.toggle('cursor-not-allowed', !signedIn);
        }
        document.querySelectorAll('.b-add-btn').forEach(function (b) {
            b.disabled = false; // adding to the draft is allowed signed-out; only SAVING needs auth
        });
    }

    // ---- USDA search + add to draft ---------------------------------------
    async function search(q) {
        var data = await invokeFn({ action: 'search', query: q });
        return (data && data.results) || [];
    }
    function renderResults(results) {
        var box = $('b-usda-results');
        if (!results.length) { box.innerHTML = '<p class="text-xs text-stoneNeutral-700">No matches.</p>'; return; }
        box.innerHTML = '';
        results.forEach(function (r) {
            var div = document.createElement('div');
            div.className = 'border border-stoneNeutral-200 rounded-lg p-2.5';
            div.innerHTML =
                '<div class="flex justify-between items-start gap-2">' +
                    '<div><p class="text-sm font-semibold text-stoneNeutral-900">' + esc(r.description) + '</p>' +
                    '<p class="text-[11px] text-stoneNeutral-700">' + esc(r.dataType || '') + (r.brandOwner ? ' &bull; ' + esc(r.brandOwner) : '') + '</p></div>' +
                    '<button class="b-add-btn whitespace-nowrap bg-stoneNeutral-200 text-stoneNeutral-800 text-xs font-semibold px-3 py-1.5 rounded hover:bg-stoneNeutral-300">Add</button>' +
                '</div>' +
                '<div class="b-row-msg text-[11px] mt-1"></div>';
            div.querySelector('.b-add-btn').addEventListener('click', function () {
                addIngredient(r, div.querySelector('.b-add-btn'), div.querySelector('.b-row-msg'));
            });
            box.appendChild(div);
        });
    }
    // Turn a USDA-detail failure into something actionable for the user.
    function friendlyFetchError(msg) {
        if (/no detailed nutrition record/i.test(msg)) return msg; // already friendly (new function)
        if (/404/.test(msg)) return 'USDA has no detailed record for this item — try a different result (Branded items are usually complete).';
        return msg;
    }
    async function addIngredient(r, btn, msgEl) {
        var orig = btn.textContent; btn.textContent = '…'; btn.disabled = true;
        if (msgEl) msgEl.textContent = '';
        try {
            var n = await invokeFn({ action: 'fetchNutrients', fdcId: r.fdcId });
            if (n && n.unavailable) throw new Error(n.error || 'No nutrition detail available.');
            draft.push({
                fdcId: n.usda_fdc_id, name: n.name, dataType: n.data_type,
                per: { calories: n.calories, protein: n.protein, fat: n.fat, carbs: n.carbs, fiber: n.fiber },
                grams: 100
            });
            renderDraft();
            btn.textContent = 'Added'; setTimeout(function () { btn.textContent = orig; btn.disabled = false; }, 900);
        } catch (e) {
            btn.textContent = orig; btn.disabled = false;
            var friendly = friendlyFetchError(e.message || 'Lookup failed');
            if (msgEl) { msgEl.textContent = friendly; msgEl.className = 'b-row-msg text-[11px] mt-1 text-amberAccent font-semibold'; }
            else flash($('b-save-msg'), friendly, false);
        }
    }

    // ---- draft list + live totals -----------------------------------------
    // Macros a single draft item contributes at its current gram weight.
    function rowMacros(d) {
        var f = (Number(d.grams) || 0) / 100, p = d.per || {};
        return {
            cal: (+p.calories || 0) * f, prot: (+p.protein || 0) * f, fat: (+p.fat || 0) * f,
            fib: (+p.fiber || 0) * f, carb: (+p.carbs || 0) * f
        };
    }
    function rowMacroHtml(d) {
        var m = rowMacros(d);
        return '<span class="font-semibold text-stoneNeutral-800">' + Math.round(m.cal) + ' kcal</span>' +
            ' · ' + r1(m.prot) + 'g P · ' + r1(m.fat) + 'g F · ' + r1(m.carb) + 'g C · ' + r1(m.fib) + 'g fib';
    }
    function paintTotals() {
        var t = totals();
        $('b-totals').innerHTML =
            cell('CAL', Math.round(t.cal)) + cell('PRO', r1(t.prot) + 'g') + cell('FAT', r1(t.fat) + 'g') +
            cell('CARB', r1(t.carb) + 'g') + cell('FIB', r1(t.fib) + 'g');
    }
    function renderDraft() {
        paintTotals();
        renderScaledPreview();
        var ul = $('b-draft-list');
        if (!draft.length) { ul.innerHTML = '<li class="text-xs text-stoneNeutral-700 italic">Search and add ingredients to build the recipe.</li>'; return; }
        ul.innerHTML = '';
        draft.forEach(function (d, idx) {
            var li = document.createElement('li');
            li.className = 'border-b border-stoneNeutral-100 py-1.5';
            li.innerHTML =
                '<div class="flex justify-between items-center gap-2">' +
                    '<span class="flex-1 text-stoneNeutral-800">' + esc(d.name) + (d.verified ? ' <span class="text-[10px] text-emeraldAccent">verified</span>' : ' <span class="text-[10px] text-amberAccent">est.</span>') + '</span>' +
                    '<input type="number" min="0" step="1" value="' + d.grams + '" class="b-grams w-16 bg-stoneNeutral-100 border border-stoneNeutral-200 rounded px-1.5 py-1 text-xs text-right">' +
                    '<span class="text-[10px] text-stoneNeutral-700">g</span>' +
                    '<button class="b-del text-amberAccent font-bold px-1" title="Remove">&times;</button>' +
                '</div>' +
                '<div class="b-row-macros text-[10px] text-stoneNeutral-700 font-mono mt-0.5 pl-0.5">' + rowMacroHtml(d) + '</div>';
            li.querySelector('.b-grams').addEventListener('input', function (e) {
                d.grams = parseFloat(e.target.value) || 0;
                li.querySelector('.b-row-macros').innerHTML = rowMacroHtml(d); // this ingredient's contribution
                paintTotals();                                                // and the recipe total
                renderScaledPreview();                                        // and the proposed upload
            });
            li.querySelector('.b-del').addEventListener('click', function () { draft.splice(idx, 1); renderDraft(); });
            ul.appendChild(li);
        });
    }

    // ---- proposed scaled recipe (per serving) — mirrors data-reconstruct.customRecipesToApp ----
    var RICE_KEYS = { 'white rice (uncooked)': 1, 'black rice (uncooked)': 1 };
    function scaleMode() { return $('b-scale-mode') ? $('b-scale-mode').value : 'auto'; }
    function scaledPreview() {
        var servings = parseFloat($('b-base-servings').value) || 1;
        var ings = draft.map(function (d) {
            var p = d.per || {};
            return {
                name: d.name, grams: (Number(d.grams) || 0) / servings,
                per100: { cal: +p.calories || 0, prot: +p.protein || 0, fat: +p.fat || 0, carb: +p.carbs || 0, fib: +p.fiber || 0 }
            };
        });
        var calOf = function (i) { return i.per100.cal * i.grams / 100; };
        var total = ings.reduce(function (s, i) { return s + calOf(i); }, 0);
        var mode = scaleMode(), isSnack = ($('b-meal-type') || {}).value === 'snack';
        var doScale = false, TARGET = 700;
        if (mode === 'custom') { var t = parseFloat($('b-scale-target').value); if (t > 0) { doScale = true; TARGET = t; } }
        else if (mode === 'asentered') { doScale = false; }
        else { doScale = !isSnack; TARGET = 700; } // auto
        if (doScale && total > 0) {
            var rice = ings.filter(function (i) { return RICE_KEYS[i.name.toLowerCase().trim()]; });
            if (rice.length) {
                var riceCal = rice.reduce(function (s, i) { return s + calOf(i); }, 0), otherCal = total - riceCal;
                var f = riceCal > 0 ? Math.max(0, TARGET - otherCal) / riceCal : 0;
                rice.forEach(function (i) { i.grams *= f; });
            } else {
                var f2 = TARGET / total; ings.forEach(function (i) { i.grams *= f2; });
            }
        }
        var m = { cal: 0, prot: 0, fat: 0, carb: 0, fib: 0 };
        ings.forEach(function (i) { var f = i.grams / 100, p = i.per100; m.cal += p.cal * f; m.prot += p.prot * f; m.fat += p.fat * f; m.carb += p.carb * f; m.fib += p.fib * f; });
        return { ings: ings, macros: m };
    }
    function renderScaledPreview() {
        var el = $('b-scaled-preview');
        if (!el) return;
        if (!draft.length) { el.innerHTML = '<p class="text-[11px] text-stoneNeutral-700 italic">Add ingredients to preview the scaled recipe.</p>'; return; }
        var sp = scaledPreview(), m = sp.macros;
        var ingHtml = sp.ings.map(function (i) {
            return '<li class="flex justify-between gap-2"><span class="text-stoneNeutral-800">' + esc(i.name) + '</span>' +
                '<span class="font-mono text-stoneNeutral-700">' + (Math.round(i.grams * 10) / 10) + ' g</span></li>';
        }).join('');
        el.innerHTML =
            '<div class="grid grid-cols-3 sm:grid-cols-5 gap-1.5 text-center text-xs font-mono font-bold mb-2">' +
                cell('CAL', Math.round(m.cal)) + cell('PRO', r1(m.prot) + 'g') + cell('FAT', r1(m.fat) + 'g') + cell('CARB', r1(m.carb) + 'g') + cell('FIB', r1(m.fib) + 'g') +
            '</div>' +
            '<ul class="space-y-0.5 text-xs">' + ingHtml + '</ul>';
    }

    // ---- save / update -----------------------------------------------------
    async function save() {
        if (!signedIn) { flash($('b-save-msg'), 'Sign in to save.', false); return; }
        var title = $('b-title').value.trim();
        if (!title) { flash($('b-save-msg'), 'Title is required.', false); return; }
        if (!draft.length) { flash($('b-save-msg'), 'Add at least one ingredient.', false); return; }
        flash($('b-save-msg'), 'Saving…', true);
        try {
            // 1. upsert each ingredient, collect ids (parallel)
            var ids = await Promise.all(draft.map(async function (d) {
                var row = {
                    usda_fdc_id: d.fdcId, name: d.name,
                    calories_per_100g: d.per.calories, protein_per_100g: d.per.protein,
                    fat_per_100g: d.per.fat, carbs_per_100g: d.per.carbs, fiber_per_100g: d.per.fiber,
                    data_type: d.dataType, is_estimate: !d.verified, package_unit: 'g'
                };
                var res = await sb.from('ingredients').upsert([row], { onConflict: 'user_id,usda_fdc_id' }).select('id').single();
                if (res.error) throw new Error(res.error.message);
                return res.data.id;
            }));

            // 2. recipe metadata
            var meta = {
                title: title, meal_type: $('b-meal-type').value,
                description: ($('b-description') ? $('b-description').value.trim() : '') || null,
                base_servings: parseFloat($('b-base-servings').value) || 1,
                freezer_tips: $('b-freezer').value.trim() || null,
                notes: ($('b-notes') ? $('b-notes').value.trim() : '') || null,
                // Per-serving scale target: auto -> null, custom -> kcal (>0), keep-as-entered -> 0.
                target_kcal: scaleMode() === 'custom' ? (parseFloat($('b-scale-target').value) || 700) : (scaleMode() === 'asentered' ? 0 : null),
                instructions: $('b-instructions').value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean)
            };

            var recipeId;
            if (editingId) {
                var u = await sb.from('recipes').update(meta).eq('id', editingId).select('id').single();
                if (u.error) throw new Error(u.error.message);
                recipeId = editingId;
                var del = await sb.from('recipe_ingredients').delete().eq('recipe_id', recipeId);
                if (del.error) throw new Error(del.error.message);
            } else {
                var ins = await sb.from('recipes').insert([meta]).select('id').single();
                if (ins.error) throw new Error(ins.error.message);
                recipeId = ins.data.id;
            }

            // 3. links
            var links = draft.map(function (d, i) {
                return { recipe_id: recipeId, ingredient_id: ids[i], quantity_value: d.grams, quantity_unit: 'g', weight_in_grams: d.grams };
            });
            var lk = await sb.from('recipe_ingredients').insert(links);
            if (lk.error) throw new Error(lk.error.message);

            flash($('b-save-msg'), editingId ? 'Recipe updated.' : 'Recipe saved & added to your Recipes.', true);
            resetForm();
            await load();
        } catch (e) {
            flash($('b-save-msg'), e.message, false);
        }
    }

    function resetForm() {
        editingId = null; draft = [];
        $('b-title').value = ''; $('b-instructions').value = ''; $('b-freezer').value = '';
        if ($('b-description')) $('b-description').value = '';
        if ($('b-notes')) $('b-notes').value = '';
        $('b-base-servings').value = '1'; $('b-meal-type').value = 'breakfast';
        if ($('b-scale-mode')) $('b-scale-mode').value = 'auto';
        if ($('b-scale-target')) { $('b-scale-target').value = '700'; $('b-scale-target').classList.add('hidden'); }
        $('builder-form-title').textContent = 'New recipe';
        $('b-save').textContent = 'Save recipe';
        $('builder-cancel-edit').classList.add('hidden');
        renderDraft();
    }

    // Open a saved custom recipe in the Recipes scaler. Reuses app.js's goToRecipe (sets the
    // selection + persists, then navigates); falls back to setting the selection manually.
    function openInScaler(id) {
        if (typeof goToRecipe === 'function') { goToRecipe(id); return; }
        try {
            if (typeof selectedRecipeId !== 'undefined') selectedRecipeId = id;
            if (typeof persistState === 'function') persistState();
        } catch (e) { /* state globals unavailable — just navigate */ }
        window.location.href = 'recipes.html';
    }

    // ---- saved list (edit / delete) ---------------------------------------
    function renderSaved() {
        var box = $('b-saved-list');
        if (!box) return;
        if (!savedRaw.length) { box.innerHTML = '<p class="text-xs text-stoneNeutral-700">No custom recipes yet.</p>'; return; }
        box.innerHTML = '';
        savedRaw.forEach(function (r) {
            var div = document.createElement('div');
            div.className = 'flex justify-between items-center gap-2 border border-stoneNeutral-200 rounded-lg p-2.5';
            var controls = signedIn
                ? '<button class="b-edit text-skyAccent font-semibold hover:underline">Edit</button>' +
                  '<button class="b-delete text-amberAccent font-semibold hover:underline">Delete</button>'
                : '<span class="text-[10px] text-stoneNeutral-700 italic">sign in to edit</span>';
            div.innerHTML = '<button class="b-open text-left text-stoneNeutral-800 font-medium hover:text-emeraldAccent" title="Open in the Recipes scaler">' + esc(r.title) +
                '<span class="block text-[10px] uppercase tracking-wider text-stoneNeutral-700">' + esc(r.meal_type || '') + '</span></button>' +
                '<span class="flex items-center gap-3 text-xs">' + controls + '</span>';
            div.querySelector('.b-open').addEventListener('click', function () { openInScaler('sb_' + r.id); });
            if (signedIn) {
                div.querySelector('.b-edit').addEventListener('click', function () { startEdit(r); });
                div.querySelector('.b-delete').addEventListener('click', function () { remove(r); });
            }
            box.appendChild(div);
        });
    }
    function startEdit(r) {
        editingId = r.id;
        $('b-title').value = r.title || '';
        if ($('b-description')) $('b-description').value = r.description || '';
        $('b-meal-type').value = r.meal_type || 'breakfast';
        $('b-base-servings').value = r.base_servings || 1;
        $('b-freezer').value = r.freezer_tips || '';
        if ($('b-notes')) $('b-notes').value = r.notes || '';
        // Reflect the saved scale target: null -> auto, 0 -> keep as entered, >0 -> custom kcal.
        if ($('b-scale-mode')) {
            var tk = (r.target_kcal == null || r.target_kcal === '') ? null : Number(r.target_kcal);
            $('b-scale-mode').value = (tk == null) ? 'auto' : (tk > 0 ? 'custom' : 'asentered');
            if ($('b-scale-target')) { if (tk > 0) $('b-scale-target').value = tk; $('b-scale-target').classList.toggle('hidden', $('b-scale-mode').value !== 'custom'); }
        }
        $('b-instructions').value = (r.instructions || []).join('\n');
        draft = (r.recipe_ingredients || []).map(function (ri) {
            var p = ri.ingredients || {};
            return {
                fdcId: p.usda_fdc_id, name: p.name, dataType: p.data_type,
                per: { calories: +p.calories_per_100g, protein: +p.protein_per_100g, fat: +p.fat_per_100g, carbs: +p.carbs_per_100g, fiber: +p.fiber_per_100g },
                grams: Number(ri.weight_in_grams) || 0
            };
        });
        $('builder-form-title').textContent = 'Editing: ' + r.title;
        $('b-save').textContent = 'Update recipe';
        $('builder-cancel-edit').classList.remove('hidden');
        renderDraft();
        $('builder-form-title').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    async function remove(r) {
        if (!signedIn) return;
        var d = await sb.from('recipes').delete().eq('id', r.id);
        if (d.error) { flash($('b-save-msg'), d.error.message, false); return; }
        if (editingId === r.id) resetForm();
        flash($('b-save-msg'), 'Recipe deleted.', true);
        await load();
    }

    // ---- load all recipes from Supabase -----------------------------------
    // SELECT '*' so optional columns missing pre-migration don't 400 the recipe list (the
    // save path still writes them; those need the column).
    var SELECT = '*,' +
        'recipe_ingredients(quantity_value,quantity_unit,weight_in_grams,' +
        'ingredients(name,usda_fdc_id,data_type,calories_per_100g,protein_per_100g,fat_per_100g,carbs_per_100g,fiber_per_100g,package_unit,package_weight_g,is_estimate))';

    async function load() {
        if (!sb) return;
        var res = await sb.from('recipes').select(SELECT).order('created_at', { ascending: true });
        if (res.error) { console.error('Load recipes failed:', res.error.message); return; }
        savedRaw = res.data || [];
        renderSaved();
        // Note: merging custom recipes into the global `recipes` (so they show on the
        // Dashboard/Recipes pages) is handled by js/data-layer.js on each page load.
    }

    // ---- boot --------------------------------------------------------------
    // ---- NYT Cooking import ------------------------------------------------
    function setImportStatus(msg, ok) {
        var el = $('b-import-status');
        if (!el) return;
        el.textContent = msg || '';
        el.className = 'text-xs mt-2 ' + (ok === true ? 'text-emeraldAccent font-semibold' : ok === false ? 'text-amberAccent font-semibold' : 'text-stoneNeutral-700');
    }
    function showNutritionBanner(n, servings) {
        var el = $('b-nutrition-banner');
        if (!el) return;
        var parts = [];
        if (n) {
            if (n.calories != null) parts.push(Math.round(n.calories) + ' kcal');
            if (n.protein != null) parts.push(n.protein + 'g protein');
            if (n.fat != null) parts.push(n.fat + 'g fat');
            if (n.carbs != null) parts.push(n.carbs + 'g carbs');
            if (n.fiber != null) parts.push(n.fiber + 'g fiber');
        }
        if (!parts.length) { el.classList.add('hidden'); return; }
        el.innerHTML = '<b>NYT-reported, per serving</b>' + (servings ? ' (yields ' + esc(servings) + ')' : '') + ': ' + esc(parts.join(' · ')) + '. Cross-check against your assembled totals below.';
        el.classList.remove('hidden');
    }
    function revealPasteFallback(msg) {
        setImportStatus(msg || 'Could not import automatically.', false);
        var w = $('b-paste-wrap'); if (w) w.classList.remove('hidden');
    }
    // Run an async worker over items with limited concurrency.
    async function runPool(items, conc, worker) {
        var idx = 0;
        async function next() { while (idx < items.length) { var i = idx++; await worker(items[i], i); } }
        var ws = []; for (var k = 0; k < Math.min(conc, items.length); k++) ws.push(next());
        await Promise.all(ws);
    }
    // Parse free-text ingredient lines, match each to USDA, and add flagged draft rows.
    async function importIngredients(lines) {
        var parse = window.parseIngredientLine || function (l) { return { name: String(l || '').trim(), grams: 0 }; };
        var parsed = (lines || []).map(parse).filter(function (p) { return p && p.name; });
        if (!parsed.length) { setImportStatus('No ingredients found to import.', false); return; }
        var total = parsed.length, done = 0;
        setImportStatus('Matching ingredients to USDA… 0/' + total);
        await runPool(parsed, 4, async function (p) {
            var row = {
                fdcId: null, name: p.name, dataType: null,
                per: { calories: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 },
                grams: (p.grams != null ? p.grams : 0), imported: true
            };
            try {
                var results = await search(p.name);
                if (results && results.length) {
                    var n = await invokeFn({ action: 'fetchNutrients', fdcId: results[0].fdcId });
                    if (n && !n.unavailable) {
                        row.fdcId = n.usda_fdc_id; row.dataType = n.data_type;
                        row.per = { calories: n.calories, protein: n.protein, fat: n.fat, carbs: n.carbs, fiber: n.fiber };
                    }
                }
            } catch (e) { /* leave unmatched (0 macros) for the user to fix */ }
            draft.push(row);
            done++; setImportStatus('Matching ingredients to USDA… ' + done + '/' + total);
            renderDraft();
        });
        setImportStatus('Imported ' + total + ' ingredient' + (total === 1 ? '' : 's') + ' — all flagged as estimates. Review amounts & macros, set the meal type, then Save.', true);
        syncWriteUI();
    }
    function applyImported(data) {
        if (data.title) $('b-title').value = data.title;
        // NYT (link) imports: set the description to the source recipe URL. Other recipes keep
        // their own description (or the default placeholder).
        if (data.sourceUrl && $('b-description')) $('b-description').value = data.sourceUrl;
        if (data.yieldServings) $('b-base-servings').value = data.yieldServings;
        if (data.steps && data.steps.length) $('b-instructions').value = data.steps.join('\n');
        showNutritionBanner(data.nutritionPerServing, data.yieldServings);
        if (data.ingredients && data.ingredients.length) importIngredients(data.ingredients);
        else setImportStatus('Imported title & steps. Add ingredients below.', true);
    }
    async function importFromNyt() {
        var url = ($('b-import-url').value || '').trim();
        if (!url) { setImportStatus('Paste a NYT Cooking link first.', false); return; }
        setImportStatus('Importing…');
        var data;
        try { data = await invokeFn({ action: 'importRecipe', url: url }); }
        catch (e) { setImportStatus(e.message, false); return; }
        if (data && data.blocked) { revealPasteFallback(data.message); return; }
        applyImported(data);
    }
    function importFromPaste() {
        var steps = ($('b-paste-steps').value || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
        var ings = ($('b-paste-ings').value || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
        if (steps.length) $('b-instructions').value = steps.join('\n');
        if (ings.length) importIngredients(ings);
        else setImportStatus('Paste at least one ingredient line.', false);
    }

    // ---- Quick-add staples (verified macros from the stock ingredientDB) --------
    // Names match the verified keys so the saved recipe also gets the Rice/Pasta toggle
    // (rice) and packaging hints (egg carton / tofu block) in the scaler.
    var QUICK_ADDS = {
        rice: {
            label: 'Rice blend', items: [
                { key: 'white rice (uncooked)', name: 'White Rice (Uncooked)', perServing: 37.5 },
                { key: 'black rice (uncooked)', name: 'Black Rice (Uncooked)', perServing: 18.75 }
            ]
        },
        egg: { label: 'Egg white carton', items: [{ key: 'kirkland liquid egg whites', name: 'Kirkland Liquid Egg Whites', perServing: 454 }] },
        tofu: { label: 'Tofu block', items: [{ key: 'extra firm tofu', name: 'Extra Firm Tofu', perServing: 454 }] },
        // Land O'Lakes Light Butter — verified from the package label: 1 tbsp (14 g) = 50 kcal,
        // 6 g fat, 0 protein/carb/fiber. Not in the stock ingredientDB, so its per-100g macros are
        // carried here directly (perServing is grams: 1 tbsp = 14 g).
        butter: {
            label: 'Light butter (1 tbsp)', items: [{
                name: 'Light Butter', perServing: 14,
                per100: { calories: 357.14, protein: 0, fat: 42.86, carbs: 0, fiber: 0 }
            }]
        },
        // Verified from the stock ingredientDB (perServing = grams in 1 of the named unit):
        // garlic 1 clove = 3 g, yellow onion 1 medium = 100/0.91 ≈ 109.9 g, large egg = 50 g.
        garlic: { label: 'Garlic (1 clove)', items: [{ key: 'garlic', name: 'Garlic', perServing: 3 }] },
        onion: { label: 'Onion (1 medium)', items: [{ key: 'yellow onion (diced)', name: 'Yellow Onion', perServing: 109.9 }] },
        wholeegg: { label: 'Egg (1 whole)', items: [{ key: 'large eggs', name: 'Large Egg', perServing: 50 }] }
    };
    // Convert a verified ingredientDB entry (macros per its standard unit) to per-100g.
    function verifiedPer100(key) {
        var db = window.ingredientDB || {};
        var ing = db[key];
        if (!ing || !ing.conversions || !ing.conversions.g) return null;
        var f = 100 / ing.conversions.g;
        return { calories: (ing.cal || 0) * f, protein: (ing.prot || 0) * f, fat: (ing.fat || 0) * f, carbs: (ing.carb || 0) * f, fiber: (ing.fib || 0) * f };
    }
    function quickAdd(id) {
        var q = QUICK_ADDS[id];
        if (!q) return;
        var servings = parseFloat($('b-base-servings').value) || 1;
        var added = 0, missing = [];
        q.items.forEach(function (it) {
            var per = it.per100 || verifiedPer100(it.key); // item-supplied macros (e.g. light butter) or the stock DB
            if (!per) { missing.push(it.name); return; }
            draft.push({ fdcId: null, name: it.name, dataType: 'verified', verified: true, per: per, grams: Math.round(it.perServing * servings * 10) / 10 });
            added++;
        });
        renderDraft();
        if (missing.length) flash($('b-save-msg'), 'Verified data not loaded for: ' + missing.join(', '), false);
        else if (added) flash($('b-save-msg'), q.label + ' added (' + servings + '× base servings). Edit grams if needed.', true);
    }

    // ---- Manual entry: a food not in USDA. Macros are entered for a gram basis, stored per-100g.
    function addManualFood() {
        var msg = $('b-manual-msg');
        var name = ($('b-manual-name').value || '').trim();
        var basis = parseFloat($('b-manual-basis').value);
        if (!name) { flash(msg, 'Enter a food name.', false); return; }
        if (!isFinite(basis) || basis <= 0) { flash(msg, 'Enter the amount (grams) the macros are for.', false); return; }
        var n = function (id) { var v = parseFloat($(id).value); return isFinite(v) && v > 0 ? v : 0; };
        var f = 100 / basis; // entered macros are for `basis` grams -> per 100 g
        draft.push({
            fdcId: null, name: name, dataType: 'custom', verified: true, // your own confirmed numbers, not a USDA estimate
            per: { calories: n('b-manual-cal') * f, protein: n('b-manual-prot') * f, fat: n('b-manual-fat') * f, carbs: n('b-manual-carb') * f, fiber: n('b-manual-fib') * f },
            grams: basis
        });
        renderDraft();
        flash(msg, '“' + name + '” added (' + basis + ' g). Edit grams in the list if needed.', true);
        ['b-manual-name', 'b-manual-cal', 'b-manual-prot', 'b-manual-fat', 'b-manual-carb', 'b-manual-fib'].forEach(function (id) { if ($(id)) $(id).value = ''; });
        if ($('b-manual-basis')) $('b-manual-basis').value = '100';
        if ($('b-manual-name')) $('b-manual-name').focus();
    }

    function wire() {
        $('b-usda-search').addEventListener('click', async function () {
            var q = $('b-usda-query').value.trim();
            if (!q) return;
            $('b-usda-results').innerHTML = '<p class="text-xs text-stoneNeutral-700">Searching…</p>';
            try { renderResults(await search(q)); syncWriteUI(); }
            catch (e) { $('b-usda-results').innerHTML = '<p class="text-xs text-amberAccent">' + esc(e.message) + '</p>'; }
        });
        $('b-usda-query').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('b-usda-search').click(); });
        $('b-save').addEventListener('click', save);
        $('builder-cancel-edit').addEventListener('click', resetForm);
        if ($('b-import-btn')) $('b-import-btn').addEventListener('click', importFromNyt);
        if ($('b-import-url')) $('b-import-url').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); importFromNyt(); } });
        if ($('b-paste-go')) $('b-paste-go').addEventListener('click', importFromPaste);
        document.querySelectorAll('.quick-add-btn').forEach(function (b) {
            b.addEventListener('click', function () { quickAdd(b.getAttribute('data-quick')); });
        });
        if ($('b-manual-toggle')) $('b-manual-toggle').addEventListener('click', function () { var f = $('b-manual-form'); if (f) f.classList.toggle('hidden'); });
        if ($('b-manual-add')) $('b-manual-add').addEventListener('click', addManualFood);
        // Scale controls (proposed per-serving recipe preview).
        if ($('b-scale-mode')) $('b-scale-mode').addEventListener('change', function () {
            if ($('b-scale-target')) $('b-scale-target').classList.toggle('hidden', $('b-scale-mode').value !== 'custom');
            renderScaledPreview();
        });
        if ($('b-scale-target')) $('b-scale-target').addEventListener('input', renderScaledPreview);
        if ($('b-base-servings')) $('b-base-servings').addEventListener('input', renderScaledPreview);
        if ($('b-meal-type')) $('b-meal-type').addEventListener('change', renderScaledPreview);
    }

    function showConfigWarning(msg) {
        var w = $('builder-config-warning');
        if (!w) return;
        w.classList.remove('hidden');
        w.innerHTML = msg;
    }

    // Guard: the Add Recipe tab must never break the rest of the app.
    try {
        if (!configured) {
            showConfigWarning('<strong>Backend not configured.</strong> Edit <code class="bg-amber-100 px-1 rounded">js/config.js</code> with your Supabase URL &amp; publishable key, then follow <code class="bg-amber-100 px-1 rounded">README.md</code> (Deploy your own).');
            return;
        }
        if (!sb) {
            showConfigWarning('<strong>Supabase library unavailable.</strong> The Add Recipe tab needs an internet connection; the rest of the dashboard works offline.');
            return;
        }
        wire();
        renderDraft();
        sb.auth.getSession().then(function (r) { renderAuth(r.data.session); });
        sb.auth.onAuthStateChange(function (_e, session) { renderAuth(session); });
        // Wait for the stock data (window.DATA_READY) before loading custom recipes and
        // re-rendering, so we merge into a populated `recipes` global, not an empty one.
        (window.DATA_READY || Promise.resolve()).then(load).catch(function () { load(); });
    } catch (e) {
        console.error('Add Recipe tab init failed:', e);
        showConfigWarning('<strong>Add Recipe tab failed to start.</strong> ' + esc(e.message) + ' — the rest of the app is unaffected.');
    }
})();
