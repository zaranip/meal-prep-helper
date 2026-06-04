/* Packaging layer: turns a scaled gram total into "how many units / cases to BUY"
   AND "how much of one package you actually USE" (they're different — the store only
   sells whole boxes, so small recipe amounts leave leftovers).
   Reads packagingDB from data.js — load this AFTER data.js and BEFORE app.js. */

// Given an ingredient key (lowercase name) and a total in grams, work out how many
// retail units (and cases) you need to buy. Returns null if the item isn't a tracked
// packaged good or the total isn't a usable number.
function getPackageCount(nameKey, totalGrams) {
    const p = (typeof packagingDB !== 'undefined') ? packagingDB[nameKey] : null;
    if (!p || !p.gramsPerUnit || !isFinite(totalGrams) || totalGrams <= 0) return null;

    const units = Math.ceil(totalGrams / p.gramsPerUnit);
    const result = {
        grams: totalGrams,                 // how much the recipe/plan actually uses
        units: units,                      // whole units you must buy to cover it
        unitSingular: p.retailUnit,        // e.g. "box"
        unitWord: units === 1 ? p.retailUnit : (p.unitLabel || p.retailUnit + 's'),
        gramsPerUnit: p.gramsPerUnit,      // grams in ONE unit
        verified: !!p.verified
    };

    // Only report cases when the item is genuinely sold by the case (more than 1 per case).
    if (p.unitsPerCase && p.unitsPerCase > 1) {
        result.cases = Math.ceil(units / p.unitsPerCase);
        result.unitsPerCase = p.unitsPerCase;
        result.caseWord = p.caseLabel || 'case';
    }
    return result;
}

// Build the BUY line, e.g. "Buy 14 cartons (3 cases of 6)" or "Buy 1 box".
function formatBuyLine(pkg) {
    let txt = `Buy ${pkg.units} ${pkg.unitWord}`;
    if (pkg.cases) {
        const caseWord = pkg.cases === 1 ? pkg.caseWord : pkg.caseWord + 's';
        txt += ` (${pkg.cases} ${caseWord} of ${pkg.unitsPerCase})`;
    }
    return txt;
}

// Build the USE line — makes it clear you usually do NOT use a whole package.
//   < 1 unit:  "1 box = 454 g — you use only 37 g (~8% of one box); the rest keeps."
//   >= 1 unit: "1 carton = 454 g — you use 6090 g (~13.4 cartons)."
function formatUseLine(pkg) {
    const used = Math.round(pkg.grams);
    const frac = pkg.grams / pkg.gramsPerUnit;
    const base = `1 ${pkg.unitSingular} = ${pkg.gramsPerUnit} g`;
    if (frac < 1) {
        const pct = Math.max(1, Math.round(frac * 100));
        return `${base} — you use only ${used} g (~${pct}% of one ${pkg.unitSingular}); the rest keeps for later.`;
    }
    return `${base} — you use ${used} g (~${frac.toFixed(1)} ${pkg.unitWord}).`;
}

// Full HTML for the grocery/scaler hint: a bold BUY line plus a lighter USE line.
function packageHintHtml(pkg) {
    if (!pkg) return '';
    const color = pkg.verified ? 'text-emeraldAccent' : 'text-amberAccent';
    const warn = pkg.verified ? '' : ' &bull; verify pack size';
    return `<span class="block text-[11px] mt-0.5 font-semibold ${color}">&#128722; ${formatBuyLine(pkg)}${warn}</span>`
         + `<span class="block text-[10px] text-stoneNeutral-700 mt-0.5">${formatUseLine(pkg)}</span>`;
}
