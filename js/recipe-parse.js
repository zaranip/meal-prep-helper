/* Heuristic parser for free-text recipe ingredient lines (e.g. from NYT Cooking) into
 * { qty, unit, name, grams }. Best-effort — the Add Recipe flow flags every imported row as an
 * estimate for review. Used by builder.js (browser) and scripts/test-parser.js (Node). */
(function (root) {
    'use strict';

    var UNICODE = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875, '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8, '⅙': 1 / 6, '⅚': 5 / 6, '⅐': 1 / 7, '⅑': 1 / 9, '⅒': 0.1 };
    // unit -> grams (volume units use water-ish density; approximate by design)
    var GRAMS = {
        tsp: 5, teaspoon: 5, teaspoons: 5, tbsp: 15, tablespoon: 15, tablespoons: 15,
        cup: 240, cups: 240, oz: 28.35, ounce: 28.35, ounces: 28.35, lb: 453.6, pound: 453.6, pounds: 453.6,
        g: 1, gram: 1, grams: 1, kg: 1000, kilogram: 1000, kilograms: 1000,
        ml: 1, milliliter: 1, milliliters: 1, l: 1000, liter: 1000, liters: 1000,
        clove: 3, cloves: 3, can: 400, cans: 400, stick: 113, sticks: 113, pinch: 0.5, pinches: 0.5, slice: 25, slices: 25
    };
    var ALIAS = { t: 'tsp', 'tsp.': 'tsp', tbs: 'tbsp', 'tbsp.': 'tbsp', tbl: 'tbsp', tbls: 'tbsp', 'oz.': 'oz', 'lb.': 'lb', lbs: 'lb', 'g.': 'g', 'kg.': 'kg', 'ml.': 'ml' };
    // canonical display form for the common measurement units
    var CANON = { teaspoon: 'tsp', teaspoons: 'tsp', tablespoon: 'tbsp', tablespoons: 'tbsp', cups: 'cup', ounce: 'oz', ounces: 'oz', pound: 'lb', pounds: 'lb', gram: 'g', grams: 'g', kilogram: 'kg', kilograms: 'kg', milliliter: 'ml', milliliters: 'ml', liter: 'l', liters: 'l' };
    var CONTAINER = /^(cans?|jars?|packages?|pkgs?|bags?|boxes|box|bottles?|containers?|packets?)\b/i;

    function parseQty(str) {
        if (!str) return null;
        var first = String(str).split(/\s+(?:to)\s+|\s*-\s*(?=\d)/)[0].trim(); // ranges -> first value
        var total = 0, any = false;
        first.split(/\s+/).forEach(function (p) {
            if (/^\d+\/\d+$/.test(p)) { var a = p.split('/'); total += (+a[0]) / (+a[1]); any = true; }
            else if (/^\d*\.?\d+$/.test(p)) { total += parseFloat(p); any = true; }
        });
        return any ? Math.round(total * 1000) / 1000 : null;
    }

    function parseIngredientLine(raw) {
        var orig = String(raw == null ? '' : raw).trim();
        if (!orig) return { qty: null, unit: '', name: '', grams: null };

        var s = orig.replace(/[¼½¾⅓⅔⅛⅜⅝⅞⅕⅖⅗⅘⅙⅚⅐⅑⅒]/g, function (c) { return ' ' + UNICODE[c] + ' '; })
            .replace(/(\d)\s*-\s*([a-zA-Z])/g, '$1 $2')   // "14-ounce" -> "14 ounce"
            .replace(/\s+/g, ' ').trim();

        var paren = s.match(/\((?:about\s*)?([\d.\/]+)\s*(ounce|ounces|oz|gram|grams|g|pound|pounds|lb|kilogram|kilograms|kg|milliliter|milliliters|ml|liter|liters|l)\b[^)]*\)/i);

        var toks = s.split(' ');
        var qtoks = [], i = 0;
        for (; i < toks.length; i++) {
            var t = toks[i];
            if (/^\d+\/\d+$/.test(t) || /^\d*\.?\d+$/.test(t) || t === 'to') qtoks.push(t);
            else break;
        }
        var qty = parseQty(qtoks.join(' '));
        var rest = toks.slice(i).join(' ');

        var um = rest.match(/^([a-zA-Z.]+)\b/);
        var uraw = um ? um[1].toLowerCase().replace(/\.$/, '') : '';
        var unit = ALIAS[uraw] || uraw;
        var hasUnit = GRAMS[unit] != null;
        var name = hasUnit ? rest.slice(um[0].length) : rest;
        name = name.replace(/\([^)]*\)/g, ' ')
            .replace(/,.*$/, '')
            .replace(/\b(plus more|to taste|for serving|for garnish|divided|optional|as needed)\b.*$/i, '')
            .replace(/\s+/g, ' ').trim();
        name = name.replace(CONTAINER, '').replace(/^of\s+/i, '').trim(); // strip leading "can"/"jar"/etc

        var grams = null;
        if (paren) {
            var pq = parseQty(paren[1]), pu = paren[2].toLowerCase(), pug = GRAMS[ALIAS[pu] || pu];
            if (pq != null && pug != null) grams = pq * pug * (qty || 1);
        }
        if (grams == null && hasUnit && qty != null) grams = qty * GRAMS[unit];
        grams = grams != null ? Math.round(grams * 10) / 10 : null;

        return {
            qty: qty,
            unit: hasUnit ? (CANON[unit] || unit) : (qty != null ? 'whole' : ''),
            name: name || orig.replace(/,.*$/, '').trim(),
            grams: grams
        };
    }

    root.parseIngredientLine = parseIngredientLine;
    if (typeof module !== 'undefined' && module.exports) module.exports = { parseIngredientLine: parseIngredientLine };
})(typeof window !== 'undefined' ? window : globalThis);
