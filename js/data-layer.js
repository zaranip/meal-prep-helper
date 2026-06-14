/* Data layer: loads the app's data from Supabase and rebuilds the globals the engine
 * expects (ingredientDB, recipes, weeksPlan, snacksBaseline, packagingDB) using the shared
 * reconstructor (js/data-reconstruct.js — must load BEFORE this file).
 *
 * Exposes window.DATA_READY (a Promise). Pages do `await window.DATA_READY` before they
 * render. The globals exist (empty) immediately so nothing is ever `undefined` mid-load. */
(function () {
    'use strict';

    // Empty placeholders so bare references resolve before the fetch resolves.
    window.ingredientDB = window.ingredientDB || {};
    window.recipes = window.recipes || {};
    window.weeksPlan = window.weeksPlan || {};
    window.snacksBaseline = window.snacksBaseline || {};
    window.packagingDB = window.packagingDB || {};
    window.APP_CONFIG_ROW = null;

    var cfg = window.SUPABASE_CONFIG || {};
    var configured = cfg.url && cfg.anonKey &&
        cfg.url.indexOf('YOUR-PROJECT-ID') === -1 && cfg.anonKey.indexOf('YOUR-PUBLIC') === -1;
    var sbLib = window.supabase;
    var sb = (configured && sbLib && sbLib.createClient) ? sbLib.createClient(cfg.url, cfg.anonKey) : null;
    window.supabaseClient = sb; // reused by page scripts so we don't open multiple clients

    // ---- tiny loading / error overlay --------------------------------------
    function overlay(html, dim) {
        var el = document.getElementById('data-overlay');
        if (!el) {
            el = document.createElement('div');
            el.id = 'data-overlay';
            el.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;' +
                'background:rgba(250,250,249,' + (dim ? '0.97' : '0.85') + ');font-family:Inter,system-ui,sans-serif;padding:24px;text-align:center;';
            document.body.appendChild(el);
        }
        el.innerHTML = '<div style="max-width:32rem;color:#292524;font-size:14px;line-height:1.5">' + html + '</div>';
        el.style.display = 'flex';
    }
    function hideOverlay() { var el = document.getElementById('data-overlay'); if (el) el.style.display = 'none'; }

    var TABLES = ['stock_ingredients', 'stock_recipes', 'stock_recipe_ingredients', 'packaging', 'week_plans', 'app_config'];

    window.DATA_READY = (async function () {
        if (!configured || !sbLib) {
            overlay('<strong>Backend not configured.</strong><br>Set <code>js/config.js</code> and follow <code>README.md</code> (Deploy your own). This app loads its data from Supabase and needs an internet connection.', true);
            throw new Error('Supabase not configured');
        }
        overlay('Loading your meal-prep data…', false);
        var results = await Promise.all(TABLES.map(function (t) { return sb.from(t).select('*'); }));
        var data = {};
        TABLES.forEach(function (t, i) {
            var r = results[i];
            if (r.error) throw new Error('Failed to load "' + t + '": ' + r.error.message);
            data[t] = r.data || [];
        });
        if (!(data.stock_recipes && data.stock_recipes.length)) {
            throw new Error('No recipes found — has supabase/seed.sql been run?');
        }
        var built = window.reconstructFromRows(data);
        window.ingredientDB = built.ingredientDB;
        window.recipes = built.recipes;
        // Synthetic zero-macro placeholder for an empty Snack slot ("— None —"), so every
        // baseRecipe()/dashMacros() consumer works without per-site null guards. Excluded from
        // the Recipe Library (renderRecipeScaler) and overlap (it has no ingredients).
        window.recipes.none = {
            id: 'none', title: '— None —', desc: 'No snack selected.', type: 'Snack', mealType: 'snack',
            baseMacros: { cal: 0, prot: 0, fat: 0, fib: 0, carb: 0 }, ingredients: [], steps: [], freezerTips: '', notes: ''
        };
        window.weeksPlan = built.weeksPlan;
        window.snacksBaseline = built.snacksBaseline;
        window.packagingDB = built.packagingDB;
        window.APP_CONFIG_ROW = built.config || null;

        // Also load any custom (USDA-builder) recipes and merge them in, so they appear on
        // every page (Dashboard dropdowns, Recipes scaler). Best-effort — optional.
        try {
            // SELECT '*' (not an explicit column list) so a not-yet-migrated optional column
            // (notes / description / future) is simply absent from the row instead of 400-ing the
            // whole query and making every custom recipe vanish. reconstruct uses `|| ''` fallbacks.
            var cr = await sb.from('recipes').select(
                '*,' +
                'recipe_ingredients(quantity_value,quantity_unit,weight_in_grams,' +
                'ingredients(name,usda_fdc_id,data_type,calories_per_100g,protein_per_100g,fat_per_100g,carbs_per_100g,fiber_per_100g,package_unit,package_weight_g,is_estimate))'
            ).order('created_at', { ascending: true });
            if (!cr.error && cr.data && cr.data.length && window.customRecipesToApp) {
                var custom = window.customRecipesToApp(cr.data);
                Object.keys(custom).forEach(function (k) { window.recipes[k] = custom[k]; });
            }
        } catch (e) { /* custom recipes are optional */ }

        hideOverlay();
        return built;
    })();

    window.DATA_READY.catch(function (e) {
        overlay('<strong>Couldn\'t load your data.</strong><br>' + String((e && e.message) || e) +
            '<br><br>This app needs an internet connection to reach Supabase.', true);
    });
})();
