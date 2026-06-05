/* Ingredient Overlap explorer (Calendar page): ranks recipes by how many ingredients they
 * share, so a week's meals can be chosen to reuse the same shopping list and prep. Read-only —
 * never writes to the backend. Loads only where #overlap-tool exists (calendar.html).
 *
 * The match KEY is `name.toLowerCase().trim()` — identical to the grocery-list consolidation in
 * app.js (renderSundayPlanner). Keeping the same key means "these two meals share rice" here
 * always agrees with the shopping list showing rice as one line. Matching is intentionally
 * EXACT (no fuzzy/stemming) per the verified-numbers preference: a curated stock ingredient and
 * a USDA-named custom ingredient won't be merged just because they look similar. */
(function () {
    'use strict';
    var host = document.getElementById('overlap-tool');
    if (!host) return;

    function $(id) { return document.getElementById(id); }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

    // Same normalization as the grocery list (app.js): lowercase + trim, nothing else.
    function key(name) { return String(name == null ? '' : name).toLowerCase().trim(); }

    function cat(k) {
        var t = (((window.recipes || {})[k] || {}).type || '').toLowerCase();
        if (t === 'breakfast') return 'breakfast';
        if (t === 'meal') return 'meal';
        if (t === 'dessert' || t === 'snack') return 'dessert';
        return 'other';
    }

    // Map of key -> display name for a recipe's ingredients (deduped by key).
    function ingSet(k) {
        var R = window.recipes || {}, rec = R[k], s = {};
        (rec && rec.ingredients || []).forEach(function (i) { var n = key(i.name); if (n) s[n] = i.name; });
        return s;
    }

    var CATS = [
        { val: 'meal', label: 'Meals' },
        { val: 'breakfast', label: 'Breakfasts' },
        { val: 'dessert', label: 'Desserts' },
        { val: 'all', label: 'All recipes' }
    ];

    function recsIn(catVal) {
        var R = window.recipes || {};
        return Object.keys(R).filter(function (k) {
            if (!(R[k].ingredients || []).length) return false;
            return catVal === 'all' ? true : cat(k) === catVal;
        }).sort(function (a, b) { return (R[a].title || '').localeCompare(R[b].title || ''); });
    }

    // Shared display names + Jaccard between two ingredient-key sets.
    function compare(aSet, bSet) {
        var shared = [], union = {};
        Object.keys(aSet).forEach(function (n) { union[n] = 1; if (bSet[n]) shared.push(aSet[n]); });
        Object.keys(bSet).forEach(function (n) { union[n] = 1; });
        shared.sort(function (x, y) { return x.localeCompare(y); });
        return { shared: shared, count: shared.length, pct: Math.round(100 * shared.length / Object.keys(union).length) };
    }

    function chips(names) {
        if (!names.length) return '<span class="text-xs text-stoneNeutral-400 italic">no shared ingredients</span>';
        return names.map(function (n) {
            return '<span class="text-[11px] bg-emeraldAccent text-white rounded px-1.5 py-0.5">' + esc(n) + '</span>';
        }).join(' ');
    }

    function rankBadge(c) {
        return '<span class="font-mono text-xs text-emeraldAccent font-bold whitespace-nowrap">' + c.count +
            ' shared <span class="text-stoneNeutral-400">·</span> ' + c.pct + '%</span>';
    }

    var expanded = false;  // pair mode: false = top 3, true = all
    var PREVIEW = 3;

    // "+ New week" quick-add footer (only when both items are meals -> the two Meal slots).
    function addFooter(aKey, bKey) {
        return '<div class="mt-2 pt-2 border-t border-stoneNeutral-100 flex items-center flex-wrap gap-x-2">' +
            '<button class="overlap-addweek text-xs font-semibold text-skyAccent hover:underline" data-a="' + esc(aKey) + '" data-b="' + esc(bKey) + '">+ New week with this pair</button>' +
            '<span class="overlap-add-msg text-xs"></span></div>';
    }

    function card(titleHtml, c, footerHtml) {
        return '<div class="bg-white p-3 rounded-lg border border-stoneNeutral-200 shadow-sm">' +
            '<div class="flex justify-between items-baseline gap-3 mb-1.5">' + titleHtml + rankBadge(c) + '</div>' +
            '<div class="flex flex-wrap gap-1">' + chips(c.shared) + '</div>' + (footerHtml || '') + '</div>';
    }

    function wireAddButtons(out) {
        out.querySelectorAll('.overlap-addweek').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var msg = btn.parentElement.querySelector('.overlap-add-msg');
                function say(t, cls) { if (msg) { msg.textContent = t; msg.className = 'overlap-add-msg text-xs ' + cls; } }
                var we = window.weekEditor;
                if (!we || typeof we.addFromMeals !== 'function') return say('Week editor unavailable.', 'text-amberAccent');
                var res = we.addFromMeals(btn.getAttribute('data-a'), btn.getAttribute('data-b'));
                if (res && res.ok) { say('Added as Week ' + res.week + ' below — review & Save.', 'text-emeraldAccent'); btn.disabled = true; btn.classList.add('opacity-40'); }
                else if (res && res.reason === 'signin') say('Sign in (Week Templates, below) to add weeks.', 'text-amberAccent');
                else say('Could not add week.', 'text-amberAccent');
            });
        });
    }

    function render() {
        var R = window.recipes || {};
        var catVal = ($('overlap-cat') || {}).value || 'meal';
        var focus = ($('overlap-focus') || {}).value || '';
        var out = $('overlap-results');
        if (!out) return;
        var keys = recsIn(catVal);

        if (keys.length < 2) {
            out.innerHTML = '<p class="text-sm text-stoneNeutral-700">Need at least two recipes in this category to compare.</p>';
            return;
        }

        var sets = {};
        keys.forEach(function (k) { sets[k] = ingSet(k); });
        var html, heading, tail = '';
        var meals = catVal === 'meal'; // pairs map cleanly to the two Meal slots only when both are meals

        if (focus && sets[focus]) {
            // Focus mode: every other recipe in the category, ranked by overlap with the focus.
            heading = 'Recipes that share the most with <b>' + esc((R[focus] || {}).title || '') + '</b>';
            var rows = keys.filter(function (k) { return k !== focus; })
                .map(function (k) { return { k: k, c: compare(sets[focus], sets[k]) }; })
                .sort(function (a, b) { return b.c.count - a.c.count || b.c.pct - a.c.pct; });
            html = rows.map(function (r) {
                return card('<span class="font-semibold text-stoneNeutral-900 text-sm">' + esc((R[r.k] || {}).title || '') + '</span>',
                    r.c, meals ? addFooter(focus, r.k) : '');
            }).join('');
        } else {
            // Pair mode: overlapping pairs in the category — top 3 by default, "See all" to expand.
            heading = 'Top overlapping pairs in <b>' + esc((CATS.filter(function (x) { return x.val === catVal; })[0] || {}).label || '') + '</b>';
            var pairs = [];
            for (var i = 0; i < keys.length; i++) {
                for (var j = i + 1; j < keys.length; j++) {
                    var c = compare(sets[keys[i]], sets[keys[j]]);
                    if (c.count) pairs.push({ a: keys[i], b: keys[j], c: c });
                }
            }
            pairs.sort(function (x, y) { return y.c.count - x.c.count || y.c.pct - x.c.pct; });
            if (!pairs.length) {
                out.innerHTML = '<p class="text-sm text-stoneNeutral-700">No recipes in this category share an ingredient name.</p>';
                return;
            }
            var shown = expanded ? pairs : pairs.slice(0, PREVIEW);
            html = shown.map(function (p) {
                var t = '<span class="font-semibold text-stoneNeutral-900 text-sm">' + esc((R[p.a] || {}).title || '') +
                    ' <span class="text-stoneNeutral-300 font-normal">+</span> ' + esc((R[p.b] || {}).title || '') + '</span>';
                return card(t, p.c, meals ? addFooter(p.a, p.b) : '');
            }).join('');
            if (pairs.length > PREVIEW) {
                tail = '<button id="overlap-toggle" class="mt-1 text-sm font-semibold text-skyAccent hover:underline">' +
                    (expanded ? 'Show top ' + PREVIEW : 'See all ' + pairs.length + ' pairs') + '</button>';
            }
        }

        out.innerHTML =
            '<p class="text-xs text-stoneNeutral-700 mb-2">' + heading + '. ' +
            '<span class="text-stoneNeutral-400">Matched by exact ingredient name — custom (USDA-named) recipes rarely overlap with stock ones.</span></p>' +
            '<div class="space-y-2 max-w-4xl">' + html + '</div>' + tail;

        wireAddButtons(out);
        var toggle = $('overlap-toggle');
        if (toggle) toggle.addEventListener('click', function () { expanded = !expanded; render(); });
    }

    function fillCats() {
        var sel = $('overlap-cat');
        if (sel) sel.innerHTML = CATS.map(function (c) { return '<option value="' + c.val + '">' + c.label + '</option>'; }).join('');
    }
    function fillFocus() {
        var sel = $('overlap-focus');
        if (!sel) return;
        var R = window.recipes || {};
        var catVal = ($('overlap-cat') || {}).value || 'meal';
        var prev = sel.value;
        var keys = recsIn(catVal);
        sel.innerHTML = '<option value="">Top overlapping pairs (no focus)</option>' +
            keys.map(function (k) { return '<option value="' + esc(k) + '">' + esc(R[k].title || k) + '</option>'; }).join('');
        if (keys.indexOf(prev) >= 0) sel.value = prev; // keep focus if still valid after a category change
    }

    function boot() {
        fillCats();
        fillFocus();
        render();
        var catSel = $('overlap-cat');
        if (catSel) catSel.addEventListener('change', function () { expanded = false; fillFocus(); render(); });
        var focusSel = $('overlap-focus');
        if (focusSel) focusSel.addEventListener('change', function () { expanded = false; render(); });
    }

    try {
        (window.DATA_READY || Promise.resolve()).then(boot).catch(function () { boot(); });
    } catch (e) { console.error('Overlap tool failed:', e); }
})();
