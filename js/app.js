/* App behavior: tab navigation, dashboard, recipe scaler, Sunday planner,
   event listeners, and bootstrap. Relies on globals from data.js / packaging.js. */

// ---- Carb base (rice <-> pasta) swap -------------------------------------
// Convert an ingredient amount to grams via its conversion table (null if not possible).
function ingredientGrams(name, amount, unit) {
    const c = (ingredientDB[name.toLowerCase().trim()] || {}).conversions || {};
    if (!c.g || !c[unit]) return null;
    return amount * (c.g / c[unit]);
}
// Macros for a gram weight of an ingredient (DB macros are per `conversions.g` grams).
function macrosForGrams(name, grams) {
    const ing = ingredientDB[name.toLowerCase().trim()];
    if (!ing || !ing.conversions || !ing.conversions.g) return { cal: 0, prot: 0, fat: 0, fib: 0, carb: 0 };
    const f = grams / ing.conversions.g;
    return { cal: ing.cal * f, prot: ing.prot * f, fat: ing.fat * f, fib: ing.fib * f, carb: ing.carb * f };
}
// Work out the rice->pasta swap details for a recipe; null if it contains no rice.
// The pasta amount is CALORIE-MATCHED: chosen so pasta calories == rice calories, so
// swapping never changes the meal's calorie total (only the other macros move).
function getCarbSwap(rec) {
    if (!rec) return null;
    const riceNames = ['white rice (uncooked)', 'black rice (uncooked)'];
    const isRice = i => riceNames.includes(i.name.toLowerCase().trim());
    const firstIdx = rec.ingredients.findIndex(isRice);
    if (firstIdx === -1) return null;

    let riceGrams = 0;
    const riceMacro = { cal: 0, prot: 0, fat: 0, fib: 0, carb: 0 };
    rec.ingredients.filter(isRice).forEach(i => {
        const g = ingredientGrams(i.name, i.amount, i.unit);
        if (g == null) return;
        riceGrams += g;
        const mm = macrosForGrams(i.name, g);
        for (const k in riceMacro) riceMacro[k] += mm[k];
    });

    const pasta = ingredientDB['brami pasta'];
    const pastaCalPerGram = pasta.cal / pasta.conversions.g;
    const pastaGrams = pastaCalPerGram > 0 ? riceMacro.cal / pastaCalPerGram : 0;
    const pastaMacro = macrosForGrams('brami pasta', pastaGrams);

    const delta = {};
    for (const k in riceMacro) delta[k] = pastaMacro[k] - riceMacro[k];
    return { firstIdx, isRice, riceGrams, pastaGrams, riceMacro, pastaMacro, delta };
}

// Return a recipe honoring the active carb mode. In 'pasta' mode, rice is replaced
// (calorie-matched) with Brami pasta and macros adjusted. Rice-less recipes are unchanged.
function resolveRecipe(rec) {
    if (carbMode !== 'pasta' || !rec) return rec;
    const swap = getCarbSwap(rec);
    if (!swap) return rec;

    const newIngredients = rec.ingredients.filter(i => !swap.isRice(i));
    newIngredients.splice(Math.min(swap.firstIdx, newIngredients.length), 0,
        { name: 'Brami Pasta', amount: Math.round(swap.pastaGrams * 10) / 10, unit: 'g' });

    const nb = {};
    for (const k in rec.baseMacros) {
        const v = rec.baseMacros[k] - (swap.riceMacro[k] || 0) + (swap.pastaMacro[k] || 0);
        nb[k] = (k === 'cal') ? Math.round(v) : Math.round(v * 10) / 10;
    }
    return Object.assign({}, rec, { ingredients: newIngredients, baseMacros: nb });
}
// Read recipes through this in the SCALER: goal-scaling composed with the (scaler-only) carb swap.
function getRecipe(key) { return goalScaled(resolveRecipe(recipes[key])); }

// ---- Calorie goal scaling -------------------------------------------------
// Scales the whole plan to the user's calorie goal. At the default 1800 goal the
// factor is 1 and nothing changes; e.g. a 900 goal halves every recipe (macros + amounts),
// so the scaler's 1.0x baseline becomes half the original portions.
// calorieGoal + BASE_CALORIE_GOAL now live in js/state.js (persisted across pages).
function goalFactor() { return (calorieGoal > 0 ? calorieGoal : BASE_CALORIE_GOAL) / BASE_CALORIE_GOAL; }

// Return a recipe with macros AND ingredient amounts scaled to the current goal (identity at goal 1800).
function goalScaled(rec) {
    const f = goalFactor();
    if (!rec || f === 1) return rec;
    const nb = {};
    for (const k in rec.baseMacros) nb[k] = (k === 'cal') ? Math.round(rec.baseMacros[k] * f) : Math.round(rec.baseMacros[k] * f * 10) / 10;
    const ni = rec.ingredients.map(i => Object.assign({}, i, { amount: i.amount * f }));
    return Object.assign({}, rec, { baseMacros: nb, ingredients: ni });
}
// Dashboard + Sunday planner read recipes goal-scaled only (carb swap stays scaler-only).
function baseRecipe(key) { return goalScaled(recipes[key]); }

// ---- Whole-units mode -----------------------------------------------------
// Some ingredients are only consumed as whole units (eggs, bagels, potatoes,
// bread slices, curry cubes...). In 'whole' mode their SCALED amount is rounded to
// the nearest integer and the displayed macros are corrected for that rounding.
// amountMode ('exact' | 'whole') now lives in js/state.js (persisted across pages).
const DISCRETE_UNITS = new Set(['bagel', 'whole bagel', 'whole', 'slice', 'slices', 'medium', 'large', 'cube', 'clove', 'cloves', 'bag', 'bags', 'cookie', 'cookies']);
function isDiscreteUnit(unit) { return DISCRETE_UNITS.has(String(unit).toLowerCase().trim()); }

// Net macro change from rounding every discrete ingredient (at the given multiplier) to whole units.
function roundingMacroDelta(rec, mult) {
    const d = { cal: 0, prot: 0, fat: 0, fib: 0, carb: 0 };
    rec.ingredients.forEach(ing => {
        if (!isDiscreteUnit(ing.unit)) return;
        const exact = ing.amount * mult;
        const rounded = Math.round(exact);
        if (rounded === exact) return;
        const gExact = ingredientGrams(ing.name, exact, ing.unit);
        const gRound = ingredientGrams(ing.name, rounded, ing.unit);
        if (gExact == null || gRound == null) return; // not in ingredientDB — round display only, can't adjust macros
        const mE = macrosForGrams(ing.name, gExact);
        const mR = macrosForGrams(ing.name, gRound);
        for (const k in d) d[k] += (mR[k] - mE[k]);
    });
    return d;
}

// Per-serving macros for the dashboard, adjusted for whole-unit rounding at the PREP-DAYS scale
// (the batch rounding spread back across the days, so daily x days = the rounded batch).
// At 'exact' mode this is just baseMacros; the Prep Days input controls the rounding granularity.
function dashMacros(recipe, days) {
    if (amountMode !== 'whole' || !recipe || !days) return recipe.baseMacros;
    const dd = roundingMacroDelta(recipe, days);
    const b = recipe.baseMacros;
    return {
        cal: b.cal + dd.cal / days, prot: b.prot + dd.prot / days, fat: b.fat + dd.fat / days,
        fib: b.fib + dd.fib / days, carb: b.carb + dd.carb / days
    };
}

// Refresh the meal-selector dropdown kcal labels to the current per-serving calories
// (reflects the calorie goal + whole-units rounding). Preserves each option's display name.
function updateMealDropdownLabels(days) {
    ['breakfast-mix', 'lunch-mix', 'dinner-mix', 'dessert-mix'].forEach(id => {
        const sel = document.getElementById(id);
        if (!sel || !sel.options) return;
        Array.from(sel.options).forEach(opt => {
            if (!recipes[opt.value]) return;
            const cal = Math.round(dashMacros(baseRecipe(opt.value), days).cal);
            opt.textContent = opt.textContent.replace(/\(\s*[\d,]+\s*kcal\)/, `(${cal} kcal)`);
        });
    });
}

        // Guarded listener helper — attaches only if the element exists on THIS page.
        function onEl(id, evt, fn) { const el = document.getElementById(id); if (el) el.addEventListener(evt, fn); }

        // Select a recipe and show it on the Recipes page. If we're already on that page,
        // just re-render; otherwise persist the choice and navigate there (multi-page).
        function goToRecipe(key) {
            if (!key) return;
            selectedRecipeId = key;
            if (typeof persistState === 'function') persistState();
            if (document.getElementById('recipe-directory')) renderRecipeScaler();
            else window.location.href = 'recipes.html';
        }

        // Drop any persisted meal/recipe selections that point at a recipe that no longer
        // exists (e.g. a deleted custom recipe), so renders never hit `undefined`.
        function sanitizeSelections() {
            const def = (typeof STATE_DEFAULTS !== 'undefined') ? STATE_DEFAULTS.customSelections : { breakfast: 'bagel', lunch: 'vegStirfry', dinner: 'tofuStirfry', dessert: 'blondies' };
            ['breakfast', 'lunch', 'dinner', 'dessert'].forEach(r => {
                if (typeof customSelections !== 'undefined' && !recipes[customSelections[r]]) customSelections[r] = def[r];
            });
            if (!recipes[selectedRecipeId]) selectedRecipeId = 'bagel';
        }

        // Each tab is now its own page (document.body.dataset.page). updateTabs() re-renders
        // whichever single view is present — kept as the name so existing call sites still work.
        function updateTabs() {
            const page = (document.body && document.body.dataset && document.body.dataset.page) || activeTab;
            // legacy SPA tab styling/visibility (no-ops on the standalone pages)
            document.querySelectorAll('.tab-btn').forEach(btn => {
                const isSelected = btn.getAttribute('data-tab') === page;
                btn.classList.toggle('bg-white', isSelected);
                btn.classList.toggle('shadow-sm', isSelected);
                btn.classList.toggle('text-stoneNeutral-800', isSelected);
                btn.classList.toggle('text-stoneNeutral-700', !isSelected);
            });
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.toggle('active', content.id === page);
            });
            if (page === 'dashboard' && document.getElementById('meals-list')) renderWeeklyDashboard();
            else if (page === 'recipes' && document.getElementById('recipe-directory')) renderRecipeScaler();
            else if (page === 'prep' && document.getElementById('grocery-items-container')) renderSundayPlanner();
            else if (page === 'calendar' && document.getElementById('schedule-container')) renderSchedule();
        }

        // Ensure custom (Supabase) recipes appear as options in the meal selectors.
        function ensureCustomDropdownOptions() {
            // A 'meal' goes in BOTH main slots (no Lunch/Dinner distinction). Legacy lunch/dinner
            // values still map to their slot. breakfast/dessert/snack as before.
            const map = {
                breakfast: ['breakfast-mix'], meal: ['lunch-mix', 'dinner-mix'],
                lunch: ['lunch-mix'], dinner: ['dinner-mix'], dessert: ['dessert-mix'], snack: ['dessert-mix']
            };
            Object.keys(recipes).forEach(k => {
                if (k.indexOf('sb_') !== 0) return;
                const rec = recipes[k];
                (map[rec.mealType] || ['dessert-mix']).forEach(selId => {
                    const sel = document.getElementById(selId);
                    if (!sel || sel.querySelector('option[value="' + k + '"]')) return;
                    const opt = document.createElement('option');
                    opt.value = k;
                    opt.textContent = rec.title + ' (' + Math.round(rec.baseMacros.cal) + ' kcal)';
                    sel.appendChild(opt);
                });
            });
        }

        // Rebuild the "Load Template" picker from weeksPlan, so weeks created/deleted on the
        // Calendar page show up here. Preserves the current selection.
        function populateWeekSelector() {
            const sel = document.getElementById('week-selector');
            if (!sel) return;
            const cur = sel.value;
            const opts = Object.keys(weeksPlan).sort((a, b) => (+a) - (+b)).map(w => `<option value="${w}">Week ${w}</option>`).join('');
            sel.innerHTML = opts + '<option value="custom">Custom Mix &amp; Match</option>';
            if (cur && sel.querySelector(`option[value="${cur}"]`)) sel.value = cur;
        }

        // TAB 1: WEEKLY DASHBOARD
        function renderWeeklyDashboard() {
            const container = document.getElementById('meals-list');
            container.innerHTML = '';

            ensureCustomDropdownOptions();
            populateWeekSelector();
            const dayDaysInput = document.getElementById('dashboard-days');
            if (dayDaysInput && document.activeElement !== dayDaysInput) dayDaysInput.value = prepDays;
            const dayDaysNum = prepDays;
            document.getElementById('week-sum-title').innerText = `Weekly Cumulative Plan (${dayDaysNum} Days)` + (amountMode === 'whole' ? ' — Whole Units' : '');

            let dayCal = snacksBaseline.cal;
            let dayProt = snacksBaseline.prot;
            let dayFat = snacksBaseline.fat;
            let dayFib = snacksBaseline.fib;
            let dayCarb = snacksBaseline.carb;

            const activeSelections = [
                { role: 'Breakfast', key: customSelections.breakfast },
                { role: 'Meal', key: customSelections.lunch },
                { role: 'Meal', key: customSelections.dinner },
                { role: 'Snack/Dessert', key: customSelections.dessert }
            ];

            activeSelections.forEach(m => {
                const recipe = baseRecipe(m.key);
                const mm = dashMacros(recipe, dayDaysNum); // per-serving, whole-unit adjusted at prep-days scale
                dayCal += mm.cal;
                dayProt += mm.prot;
                dayFat += mm.fat;
                dayFib += mm.fib;
                dayCarb += mm.carb;

                const card = document.createElement('div');
                card.className = 'flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-stoneNeutral-50 rounded-xl border border-stoneNeutral-200 hover:border-emeraldAccent transition-colors cursor-pointer';
                card.innerHTML = `
                    <div class="flex-1">
                        <span class="text-xs uppercase font-bold text-stoneNeutral-700">${m.role}</span>
                        <h4 class="font-bold text-stoneNeutral-900 mt-0.5">${recipe.title}</h4>
                        <p class="text-xs text-stoneNeutral-700 mt-1 line-clamp-1">${recipe.desc}</p>
                    </div>
                    <div class="mt-3 sm:mt-0 flex gap-4 text-xs font-semibold">
                        <div class="text-center"><span class="block text-[10px] text-stoneNeutral-700 font-bold">CAL</span><span class="font-mono font-bold">${Math.round(mm.cal)}</span></div>
                        <div class="text-center"><span class="block text-[10px] text-stoneNeutral-700 font-bold">PRO</span><span class="font-mono font-bold text-emeraldAccent">${Math.round(mm.prot * 10) / 10}g</span></div>
                        <div class="text-center"><span class="block text-[10px] text-stoneNeutral-700 font-bold">FAT</span><span class="font-mono font-bold text-amberAccent">${Math.round(mm.fat * 10) / 10}g</span></div>
                        <div class="text-center"><span class="block text-[10px] text-stoneNeutral-700 font-bold">FIB</span><span class="font-mono font-bold text-skyAccent">${Math.round(mm.fib * 10) / 10}g</span></div>
                    </div>
                `;
                card.addEventListener('click', () => goToRecipe(m.key));
                container.appendChild(card);
            });

            // Daily totals — per-serving plan (incl. any whole-unit adjustment from dashMacros).
            document.getElementById('sum-daily-cal').innerText = `${dayCal.toFixed(0)} kcal`;
            document.getElementById('sum-daily-pro').innerText = `${dayProt.toFixed(0)}g`;
            document.getElementById('sum-daily-fat').innerText = `${dayFat.toFixed(1)}g`;
            document.getElementById('sum-daily-fib').innerText = `${dayFib.toFixed(1)}g`;
            document.getElementById('sum-daily-carb').innerText = `${dayCarb.toFixed(0)}g`;

            // Weekly cumulative = daily x prep days. Since the daily already carries the whole-unit
            // rounding (spread over the days), this equals the rounded whole-batch total.
            document.getElementById('sum-weekly-cal').innerText = `${(dayCal * dayDaysNum).toFixed(0)} kcal`;
            document.getElementById('sum-weekly-pro').innerText = `${(dayProt * dayDaysNum).toFixed(0)}g`;
            document.getElementById('sum-weekly-fat').innerText = `${(dayFat * dayDaysNum).toFixed(0)}g`;
            document.getElementById('sum-weekly-fib').innerText = `${(dayFib * dayDaysNum).toFixed(0)}g`;
            document.getElementById('sum-weekly-carb').innerText = `${(dayCarb * dayDaysNum).toFixed(0)}g`;

            // Keep the meal-selector kcal labels in sync with the current goal + units mode.
            updateMealDropdownLabels(dayDaysNum);

            // Limit validation messages
            const valTargetIcon = document.getElementById('val-target-icon');
            const valTargetText = document.getElementById('val-target-text');
            const valTargetDesc = document.getElementById('val-target-desc');
            if (dayCal <= calorieGoal) {
                valTargetIcon.innerHTML = '&#10003;';
                valTargetIcon.className = 'p-2 rounded-lg bg-green-50 text-green-700 font-bold text-lg';
                valTargetText.innerText = 'Goal Met';
                valTargetDesc.innerText = `${(calorieGoal - dayCal).toFixed(0)} kcal remaining`;
            } else {
                valTargetIcon.innerHTML = '&#9888;';
                valTargetIcon.className = 'p-2 rounded-lg bg-red-50 text-red-700 font-bold text-lg';
                valTargetText.innerText = 'Over Target';
                valTargetDesc.innerText = `${(dayCal - calorieGoal).toFixed(0)} kcal over budget`;
            }

            const valMaxIcon = document.getElementById('val-max-icon');
            const valMaxText = document.getElementById('val-max-text');
            const valMaxDesc = document.getElementById('val-max-desc');
            const lunchCal = dashMacros(baseRecipe(customSelections.lunch), dayDaysNum).cal;
            const dinnerCal = dashMacros(baseRecipe(customSelections.dinner), dayDaysNum).cal;
            if (lunchCal <= 800 && dinnerCal <= 800) {
                valMaxIcon.innerHTML = '&#10003;';
                valMaxIcon.className = 'p-2 rounded-lg bg-green-50 text-green-700 font-bold text-lg';
                valMaxText.innerText = 'Mains Safe';
                valMaxDesc.innerText = 'All main meals under 800 kcal';
            } else {
                valMaxIcon.innerHTML = '&#9888;';
                valMaxIcon.className = 'p-2 rounded-lg bg-red-50 text-red-700 font-bold text-lg';
                valMaxText.innerText = 'High Calories';
                valMaxDesc.innerText = 'At least one main exceeds 800 kcal';
            }

            const valSnacksIcon = document.getElementById('val-snacks-icon');
            const valSnacksText = document.getElementById('val-snacks-text');
            const valSnacksDesc = document.getElementById('val-snacks-desc');
            const bfastCal = dashMacros(baseRecipe(customSelections.breakfast), dayDaysNum).cal;
            const dessertCal = dashMacros(baseRecipe(customSelections.dessert), dayDaysNum).cal;
            const snackGroupCal = bfastCal + dessertCal + snacksBaseline.cal;
            if (snackGroupCal <= 400) {
                valSnacksIcon.innerHTML = '&#10003;';
                valSnacksIcon.className = 'p-2 rounded-lg bg-green-50 text-green-700 font-bold text-lg';
                valSnacksText.innerText = 'Snacks Safe';
                valSnacksDesc.innerText = `${snackGroupCal.toFixed(0)} kcal (Under 400 Target)`;
            } else {
                valSnacksIcon.innerHTML = '&#9888;';
                valSnacksIcon.className = 'p-2 rounded-lg bg-red-50 text-red-700 font-bold text-lg';
                valSnacksText.innerText = 'Snacks Over limit';
                valSnacksDesc.innerText = `${snackGroupCal.toFixed(0)} kcal (Exceeds 400 Target)`;
            }

            // Update Pie Chart Caloric Contributions
            renderContributionPieChart(activeSelections, dayDaysNum);
        }

        function renderContributionPieChart(activeSelections, days) {
            const ctx = document.getElementById('dailyMacroChart').getContext('2d');
            if (chartInstance) {
                chartInstance.destroy();
            }

            const labels = [];
            const calorieValues = [];
            const backgroundColors = ['#0f766e', '#d97706', '#0369a1', '#7c2d12', '#44403c'];

            activeSelections.forEach(m => {
                const cal = Math.round(dashMacros(baseRecipe(m.key), days).cal);
                labels.push(`${m.role} (${cal} kcal)`);
                calorieValues.push(cal);
            });

            labels.push(`Baseline Snacks (${snacksBaseline.cal} kcal)`);
            calorieValues.push(snacksBaseline.cal);

            chartInstance = new Chart(ctx, {
                type: 'pie',
                data: {
                    labels: labels,
                    datasets: [{
                        data: calorieValues,
                        backgroundColor: backgroundColors,
                        borderWidth: 1,
                        borderColor: '#ffffff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                font: { size: 10 },
                                boxWidth: 12
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const rawVal = context.parsed;
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const pct = ((rawVal / total) * 100).toFixed(1);
                                    return ` ${context.label.split(' (')[0]}: ${rawVal} kcal (${pct}%)`;
                                }
                            }
                        }
                    }
                }
            });
        }

        // ===== Recipe editing (scaler tab) ========================================
        // An explicit "Edit recipe" mode lets you change amounts, ingredient names/units,
        // add/remove ingredients, rename, edit the description and steps, plus notes.
        // Macros recompute live and honestly: the verified baseMacros' UNTRACKED remainder
        // (seasonings/items with no per-gram data) is preserved, and the TRACKED part is
        // recomputed from the current ingredients. Save persists to localStorage (stock
        // recipes); Revert restores the original. Works in any carb mode.
        const RECIPE_EDIT_KEY = 'mealPrep.recipeEdits.v2';
        const pristineRecipes = {};   // id -> deep copy of the ORIGINAL recipe (pre-override)
        let recipeEditStore = {};     // persisted (stock only): id -> full editable state
        const draftNotes = {};        // in-memory notes per recipe id (until Save)
        let recipeEditMode = false;   // is the inline editor open?

        function loadRecipeEditStore() { try { return JSON.parse(localStorage.getItem(RECIPE_EDIT_KEY)) || {}; } catch (e) { return {}; } }
        function persistRecipeEditStore() { try { localStorage.setItem(RECIPE_EDIT_KEY, JSON.stringify(recipeEditStore)); } catch (e) { /* storage off */ } }
        function deepCopyRecipe(r) { return JSON.parse(JSON.stringify(r)); }
        function isCustomRecipe(id) { return String(id).indexOf('sb_') === 0; }
        function snapshotPristine(id) { if (!pristineRecipes[id] && recipes[id]) pristineRecipes[id] = deepCopyRecipe(recipes[id]); }
        function escAttr(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
        function escHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

        // Per-gram macros for an ingredient at `amount` of its unit. Uses inline per-100g
        // (custom items) or the ingredientDB (stock). null => not tracked, can't move macros.
        function ingMacrosForAmount(ing, amount) {
            if (ing._m100) {
                let g = (ing.unit === 'g' || ing.unit === 'grams') ? amount : ingredientGrams(ing.name, amount, ing.unit);
                if (g == null) g = amount; // custom items are stored in grams
                const f = g / 100, m = ing._m100;
                return { cal: m.cal * f, prot: m.prot * f, fat: m.fat * f, fib: m.fib * f, carb: m.carb * f };
            }
            const g2 = (ing.unit === 'g' || ing.unit === 'grams') ? amount : ingredientGrams(ing.name, amount, ing.unit);
            if (g2 == null) return null;
            return macrosForGrams(ing.name, g2);
        }
        function ingTracked(ing) { return ing.name && ing.name.trim() ? ingMacrosForAmount(ing, 1) != null : true; }

        // Sum macros of the TRACKED ingredients in a list (untracked contribute nothing).
        function trackedSum(ings) {
            const s = { cal: 0, prot: 0, fat: 0, fib: 0, carb: 0 };
            (ings || []).forEach(function (ing) {
                const m = ingMacrosForAmount(ing, ing.amount);
                if (!m) return;
                s.cal += m.cal; s.prot += m.prot; s.fat += m.fat; s.fib += m.fib; s.carb += m.carb;
            });
            return s;
        }
        // baseMacros = (verified original base − tracked part of original) + tracked part now.
        // The first bracket is the constant "untracked remainder" (seasonings etc.).
        function computeBaseMacros(id) {
            const p = pristineRecipes[id] || recipes[id];
            const pb = p.baseMacros, pt = trackedSum(p.ingredients), ct = trackedSum(recipes[id].ingredients);
            const v = {
                cal: pb.cal - pt.cal + ct.cal, prot: pb.prot - pt.prot + ct.prot, fat: pb.fat - pt.fat + ct.fat,
                fib: pb.fib - pt.fib + ct.fib, carb: pb.carb - pt.carb + ct.carb
            };
            return { cal: Math.round(v.cal), prot: Math.round(v.prot * 10) / 10, fat: Math.round(v.fat * 10) / 10, fib: Math.round(v.fib * 10) / 10, carb: Math.round(v.carb * 10) / 10 };
        }
        function applyComputedMacros(id) { recipes[id].baseMacros = computeBaseMacros(id); }

        // Snapshot of the editable fields, for dirty detection.
        function editableSnapshot(r) {
            return JSON.stringify({
                title: r.title || '', desc: r.desc || '', steps: r.steps || [],
                ingredients: (r.ingredients || []).map(function (i) { return { name: i.name, amount: i.amount, unit: i.unit }; })
            });
        }
        function savedSnapshot(id) {
            if (recipeEditStore[id] && recipeEditStore[id].snapshot) return recipeEditStore[id].snapshot;
            return pristineRecipes[id] ? editableSnapshot(pristineRecipes[id]) : editableSnapshot(recipes[id]);
        }
        // Where the SAVED notes live: custom recipes -> Supabase (recipes[id].notes, loaded by
        // the data layer); stock recipes -> the localStorage edit store. draftNotes is the
        // unsaved in-textarea value for either.
        function savedNotes(id) {
            if (isCustomRecipe(id)) return (recipes[id] && recipes[id].notes) || '';
            return (recipeEditStore[id] && recipeEditStore[id].notes) || '';
        }
        function recipeNotes(id) { return (draftNotes[id] != null) ? draftNotes[id] : savedNotes(id); }
        function notesDirty(id) { return draftNotes[id] != null && draftNotes[id] !== savedNotes(id); }
        function structuralDirty(id) { return editableSnapshot(recipes[id]) !== savedSnapshot(id); }
        function recipeIsDirty(id) { return structuralDirty(id) || notesDirty(id); }
        // Boot: snapshot originals FIRST, then apply any saved stock edits on top.
        function initRecipeEdits() {
            recipeEditStore = loadRecipeEditStore();
            Object.keys(recipes).forEach(snapshotPristine);
            Object.keys(recipeEditStore).forEach(function (id) {
                if (!recipes[id]) return;
                const ed = recipeEditStore[id];
                if (ed.title != null) recipes[id].title = ed.title;
                if (ed.desc != null) recipes[id].desc = ed.desc;
                if (Array.isArray(ed.steps)) recipes[id].steps = ed.steps.slice();
                if (Array.isArray(ed.ingredients)) recipes[id].ingredients = ed.ingredients.map(function (i) { return Object.assign({}, i); });
                applyComputedMacros(id);
            });
        }
        function saveRecipeEdits() {
            const id = selectedRecipeId;
            if (isCustomRecipe(id)) { setEditStatus('Custom recipes: edit & save them in the Add Recipe tab.', false); return; }
            recipeEditStore[id] = {
                title: recipes[id].title, desc: recipes[id].desc,
                steps: (recipes[id].steps || []).slice(),
                ingredients: recipes[id].ingredients.map(function (i) { return { name: i.name, amount: i.amount, unit: i.unit }; }),
                baseMacros: Object.assign({}, recipes[id].baseMacros),
                notes: recipeNotes(id),
                snapshot: editableSnapshot(recipes[id])
            };
            delete draftNotes[id];
            persistRecipeEditStore();
            setEditStatus('Saved.', true);
            updateEditToolbar();
        }
        function revertRecipeEdits() {
            const id = selectedRecipeId;
            if (pristineRecipes[id]) recipes[id] = deepCopyRecipe(pristineRecipes[id]);
            delete recipeEditStore[id]; delete draftNotes[id];
            persistRecipeEditStore();
            recipeEditMode = false;
            renderRecipeScaler();
            setEditStatus('Reverted to original.', true);
        }
        function toggleRecipeEditMode() { recipeEditMode = !recipeEditMode; renderRecipeScaler(); }

        // ----- Notes: its own Save, independent of the structural edit Save -------
        // Notes save for BOTH stock (localStorage) and custom (Supabase) recipes — this is the
        // box shared with the Add Recipe tab. Structural edits to custom recipes remain
        // builder-only (live preview); only the NOTES are persisted here.
        function setNotesStatus(msg, ok) {
            const el = document.getElementById('recipe-notes-status');
            if (!el) return;
            el.textContent = msg || '';
            el.className = 'text-[11px] font-semibold ' + (ok ? 'text-emeraldAccent' : 'text-amberAccent');
        }
        function updateNotesToolbar() {
            const btn = document.getElementById('recipe-notes-save');
            if (!btn) return;
            const dis = !notesDirty(selectedRecipeId);
            btn.disabled = dis;
            btn.classList.toggle('opacity-40', dis);
            btn.classList.toggle('cursor-not-allowed', dis);
        }
        // Inline sign-in shown only if she tries to save a custom note while signed out. The
        // session is shared across pages (window.supabaseClient), so this is usually skipped.
        function showNotesAuth() {
            const el = document.getElementById('recipe-notes-auth');
            const sb = window.supabaseClient;
            if (!el || !sb || !sb.auth) return;
            el.classList.remove('hidden');
            el.innerHTML =
                '<input id="rn-email" type="email" placeholder="email" class="bg-white border border-stoneNeutral-300 rounded px-2 py-1.5 w-40">' +
                '<input id="rn-pass" type="password" placeholder="password" class="bg-white border border-stoneNeutral-300 rounded px-2 py-1.5 w-32">' +
                '<button id="rn-signin" class="bg-emeraldAccent text-white font-semibold px-3 py-1.5 rounded hover:opacity-90">Sign in</button>' +
                '<span id="rn-msg" class="text-amberAccent"></span>';
            document.getElementById('rn-signin').addEventListener('click', async function () {
                const r = await sb.auth.signInWithPassword({ email: document.getElementById('rn-email').value.trim(), password: document.getElementById('rn-pass').value });
                if (r.error) { document.getElementById('rn-msg').textContent = r.error.message; return; }
                el.classList.add('hidden');
                saveNotes(); // retry now that the (shared) session is established
            });
        }
        async function saveNotes() {
            const id = selectedRecipeId;
            const ta = document.getElementById('recipe-notes');
            const val = ta ? ta.value : recipeNotes(id);
            if (isCustomRecipe(id)) {
                const sb = window.supabaseClient;
                const sbId = recipes[id] && recipes[id].sbId;
                if (!sb || !sbId) { setNotesStatus('Backend unavailable — can’t save notes.', false); return; }
                let session = null;
                try { session = (await sb.auth.getSession()).data.session; } catch (e) { /* offline */ }
                if (!session) { setNotesStatus('Sign in to save notes.', false); showNotesAuth(); return; }
                setNotesStatus('Saving…', true);
                const res = await sb.from('recipes').update({ notes: val || null }).eq('id', sbId);
                if (res.error) { setNotesStatus(res.error.message, false); return; }
                recipes[id].notes = val;          // reflect immediately (no reload needed)
            } else {
                // Stock: persist ONLY notes (+ a baseline snapshot for dirty/revert), never the
                // pending structural edits — those go through the toolbar Save.
                const store = recipeEditStore[id] || {};
                store.notes = val;
                if (!store.snapshot) store.snapshot = pristineRecipes[id] ? editableSnapshot(pristineRecipes[id]) : editableSnapshot(recipes[id]);
                recipeEditStore[id] = store;
                persistRecipeEditStore();
            }
            delete draftNotes[id];
            setNotesStatus('Notes saved.', true);
            updateEditToolbar();
        }
        function setEditStatus(msg, ok) {
            const el = document.getElementById('recipe-edit-status');
            if (!el) return;
            el.textContent = msg || '';
            el.className = 'text-[11px] font-semibold ml-1 mr-auto ' + (ok ? 'text-emeraldAccent' : 'text-amberAccent');
        }
        function updateEditToolbar() {
            const id = selectedRecipeId;
            // The toolbar Save / "Live preview" status are about STRUCTURAL edits only; notes have
            // their own Save button + status, so editing a note never shows the structural message.
            const custom = isCustomRecipe(id), sdirty = structuralDirty(id), saved = !!recipeEditStore[id];
            const editBtn = document.getElementById('recipe-edit-btn');
            const saveBtn = document.getElementById('recipe-save-btn');
            const revertBtn = document.getElementById('recipe-revert-btn');
            if (editBtn) editBtn.innerHTML = recipeEditMode ? 'Done editing' : '&#9999;&#65039; Edit recipe';
            if (saveBtn) { const dis = custom || !sdirty; saveBtn.disabled = dis; saveBtn.classList.toggle('opacity-40', dis); saveBtn.classList.toggle('cursor-not-allowed', dis); saveBtn.title = custom ? 'Custom recipe structure is edited in the Add Recipe tab' : ''; }
            if (revertBtn) { const can = sdirty || notesDirty(id) || saved; revertBtn.disabled = !can; revertBtn.classList.toggle('opacity-40', !can); revertBtn.classList.toggle('cursor-not-allowed', !can); }
            if (sdirty) setEditStatus(custom ? 'Live preview — recipe structure saves in the Add Recipe tab (notes save below)' : 'Unsaved changes', false);
            else setEditStatus(custom ? 'Custom recipe — structure is edited in the Add Recipe tab; notes save below' : (saved ? 'Saved edits applied' : ''), true);
            updateNotesToolbar();
        }
        function setScalerMacros(current, mult) {
            const rdelta = (amountMode === 'whole' && current.ingredients) ? roundingMacroDelta(current, mult) : { cal: 0, prot: 0, fat: 0, fib: 0, carb: 0 };
            document.getElementById('macro-cal').innerText = Math.round(current.baseMacros.cal * mult + rdelta.cal) + ' kcal';
            document.getElementById('macro-prot').innerText = Math.round(current.baseMacros.prot * mult + rdelta.prot) + 'g';
            document.getElementById('macro-fat').innerText = Math.round(current.baseMacros.fat * mult + rdelta.fat) + 'g';
            document.getElementById('macro-fib').innerText = Math.round(current.baseMacros.fib * mult + rdelta.fib) + 'g';
            document.getElementById('macro-carb').innerText = Math.round(current.baseMacros.carb * mult + rdelta.carb) + 'g';
        }

        // ----- Inline recipe editor (Edit mode) -----------------------------------
        function recomputeAndRefresh(id) { applyComputedMacros(id); setScalerMacros(recipes[id], 1); updateEditToolbar(); }
        function renderRecipeEditor(id) {
            const host = document.getElementById('recipe-editor');
            if (!host) return;
            const r = recipes[id];
            applyComputedMacros(id);
            setScalerMacros(recipes[id], 1); // live BASE (1x) totals in the macro grid above

            const dbOptions = Object.keys(ingredientDB).map(function (n) { return '<option value="' + escAttr(n) + '">'; }).join('');
            host.innerHTML =
                '<div class="space-y-4">' +
                    '<div class="grid sm:grid-cols-2 gap-3">' +
                        '<label class="text-xs font-semibold text-stoneNeutral-700">Title<input id="edit-title" class="mt-1 w-full bg-white border border-stoneNeutral-300 rounded px-2 py-1.5 text-sm" value="' + escAttr(r.title || '') + '"></label>' +
                        '<label class="text-xs font-semibold text-stoneNeutral-700">Description<input id="edit-desc" class="mt-1 w-full bg-white border border-stoneNeutral-300 rounded px-2 py-1.5 text-sm" value="' + escAttr(r.desc || '') + '"></label>' +
                    '</div>' +
                    '<div>' +
                        '<div class="flex justify-between items-center border-b border-stoneNeutral-200 pb-1 mb-2">' +
                            '<h4 class="font-bold text-stoneNeutral-900 text-sm">Ingredients</h4>' +
                            '<button id="edit-add-ing" class="text-xs font-bold text-emeraldAccent hover:underline">+ Add ingredient</button>' +
                        '</div>' +
                        '<p class="text-[10px] text-stoneNeutral-700 mb-2 italic">Edit name, amount, or unit. Pick a known ingredient (from the suggestions) so macros track; custom names are flagged.</p>' +
                        '<ul id="edit-ing-list" class="space-y-2"></ul>' +
                    '</div>' +
                    '<label class="block text-xs font-semibold text-stoneNeutral-700">Steps (one per line)' +
                        '<textarea id="edit-steps" rows="5" class="mt-1 w-full bg-white border border-stoneNeutral-300 rounded px-2 py-1.5 text-sm">' + escHtml((r.steps || []).join('\n')) + '</textarea></label>' +
                '</div>' +
                '<datalist id="ing-db-list">' + dbOptions + '</datalist>';

            renderEditIngList(id);
            document.getElementById('edit-title').addEventListener('input', function (e) { r.title = e.target.value; updateEditToolbar(); });
            document.getElementById('edit-desc').addEventListener('input', function (e) { r.desc = e.target.value; updateEditToolbar(); });
            document.getElementById('edit-steps').addEventListener('input', function (e) { r.steps = e.target.value.split('\n'); updateEditToolbar(); });
            document.getElementById('edit-add-ing').addEventListener('click', function () { r.ingredients.push({ name: '', amount: 0, unit: 'g' }); renderEditIngList(id); recomputeAndRefresh(id); });
        }
        function renderEditIngList(id) {
            const ul = document.getElementById('edit-ing-list');
            if (!ul) return;
            const r = recipes[id];
            ul.innerHTML = '';
            if (!r.ingredients.length) { ul.innerHTML = '<li class="text-xs text-stoneNeutral-700 italic">No ingredients yet — use “+ Add ingredient”.</li>'; return; }
            r.ingredients.forEach(function (ing, idx) {
                const tracked = ingTracked(ing);
                const li = document.createElement('li');
                li.className = 'flex flex-wrap items-center gap-1.5';
                li.innerHTML =
                    '<input class="edit-ing-name flex-1 min-w-[150px] bg-white border border-stoneNeutral-300 rounded px-2 py-1 text-sm" list="ing-db-list" value="' + escAttr(ing.name) + '" placeholder="ingredient name">' +
                    '<input class="edit-ing-amt w-16 bg-white border border-stoneNeutral-300 rounded px-1.5 py-1 text-right text-sm" type="number" min="0" step="0.1" value="' + ing.amount + '">' +
                    '<input class="edit-ing-unit w-20 bg-white border border-stoneNeutral-300 rounded px-1.5 py-1 text-sm" list="unit-list" value="' + escAttr(ing.unit) + '" placeholder="unit">' +
                    '<button class="edit-ing-del text-amberAccent font-bold px-1.5" title="Remove ingredient">&times;</button>' +
                    (tracked ? '' : '<span class="edit-untracked basis-full text-[10px] text-amberAccent">macros not tracked for this name/unit — amount only</span>');
                const flagSpan = li.querySelector('.edit-untracked');
                const nameInput = li.querySelector('.edit-ing-name');
                const unitInput = li.querySelector('.edit-ing-unit');
                function refreshFlag() {
                    const ok = ingTracked(ing);
                    let f = li.querySelector('.edit-untracked');
                    if (ok && f) f.remove();
                    if (!ok && !f) { const s = document.createElement('span'); s.className = 'edit-untracked basis-full text-[10px] text-amberAccent'; s.textContent = 'macros not tracked for this name/unit — amount only'; li.appendChild(s); }
                }
                nameInput.addEventListener('input', function (e) { ing.name = e.target.value; recomputeAndRefresh(id); refreshFlag(); });
                li.querySelector('.edit-ing-amt').addEventListener('input', function (e) { let v = parseFloat(e.target.value); if (isNaN(v) || v < 0) v = 0; ing.amount = v; recomputeAndRefresh(id); });
                unitInput.addEventListener('input', function (e) { ing.unit = e.target.value; recomputeAndRefresh(id); refreshFlag(); });
                li.querySelector('.edit-ing-del').addEventListener('click', function () { r.ingredients.splice(idx, 1); renderEditIngList(id); recomputeAndRefresh(id); });
                ul.appendChild(li);
            });
        }

        // TAB 2: RECIPE SCALER
        function renderRecipeScaler() {
            const dir = document.getElementById('recipe-directory');
            dir.innerHTML = '';

            Object.keys(recipes).forEach(key => {
                const r = recipes[key];
                const btn = document.createElement('button');
                btn.className = `w-full text-left p-3 rounded-lg border text-sm font-medium transition-all ${r.id === selectedRecipeId ? 'bg-emeraldAccent text-white border-emeraldAccent shadow-sm' : 'bg-stoneNeutral-50 hover:bg-stoneNeutral-100 text-stoneNeutral-800 border-stoneNeutral-200'}`;
                btn.innerHTML = `
                    <div class="flex justify-between items-center">
                        <span class="font-bold">${r.title}</span>
                        <span class="text-[10px] px-1.5 py-0.5 rounded uppercase font-black tracking-wider ${r.id === selectedRecipeId ? 'bg-teal-900 text-teal-100' : 'bg-stoneNeutral-200 text-stoneNeutral-700'}">${r.type}</span>
                    </div>
                `;
                btn.addEventListener('click', () => {
                    selectedRecipeId = r.id;
                    recipeEditMode = false;   // leaving a recipe exits its editor
                    closeDeepDive();
                    renderRecipeScaler();
                });
                dir.appendChild(btn);
            });

            document.getElementById('workspace-loading').classList.add('hidden');
            document.getElementById('workspace-content').classList.remove('hidden');

            snapshotPristine(selectedRecipeId);
            const notesEl = document.getElementById('recipe-notes');
            if (notesEl) notesEl.value = recipeNotes(selectedRecipeId);
            setNotesStatus('');                                                   // fresh recipe -> clear status
            const notesAuth = document.getElementById('recipe-notes-auth');
            if (notesAuth) { notesAuth.classList.add('hidden'); notesAuth.innerHTML = ''; }

            const editor = document.getElementById('recipe-editor');
            const readView = document.getElementById('scaler-readview');
            const controls = document.getElementById('scaler-controls');
            const tipEl = document.getElementById('recipe-scaling-tip');

            if (recipeEditMode) {
                // EDIT MODE: hide the scaling/read view, show the full editor.
                if (controls) controls.classList.add('hidden');
                if (readView) readView.classList.add('hidden');
                document.getElementById('carb-toggle-wrap').classList.add('hidden');
                document.getElementById('macro-change-box').classList.add('hidden');
                if (tipEl) tipEl.classList.add('hidden');
                if (editor) editor.classList.remove('hidden');
                const r = recipes[selectedRecipeId];
                document.getElementById('recipe-title').innerText = r.title || '';
                document.getElementById('recipe-desc').innerText = r.desc || '';
                document.getElementById('recipe-type').innerText = r.type || '';
                renderRecipeEditor(selectedRecipeId);
            } else {
                // READ MODE: normal scaling view.
                if (editor) editor.classList.add('hidden');
                if (controls) controls.classList.remove('hidden');
                if (readView) readView.classList.remove('hidden');
                const current = getRecipe(selectedRecipeId);
                document.getElementById('recipe-title').innerText = current.title;
                document.getElementById('recipe-desc').innerText = current.desc;
                document.getElementById('recipe-type').innerText = current.type;
                document.getElementById('recipe-freezer-tips').innerText = current.freezerTips;
                if (current.scalingTip) { tipEl.innerText = current.scalingTip; tipEl.classList.remove('hidden'); }
                else { tipEl.classList.add('hidden'); }
                const multiplierInput = document.getElementById('multiplier-input');
                if (multiplierInput && document.activeElement !== multiplierInput) multiplierInput.value = prepDays;
                scaleRecipe(prepDays); // shared with Dashboard/Planner prep days
            }
            updateEditToolbar();
        }

        // READ-MODE rendering: scaled, read-only amounts (editing happens in Edit mode).
        function scaleRecipe(mult) {
            const id = selectedRecipeId;
            snapshotPristine(id);
            const current = getRecipe(id);
            setScalerMacros(current, mult);

            const ingredientsContainer = document.getElementById('scaled-ingredients');
            ingredientsContainer.innerHTML = '';
            current.ingredients.forEach(ing => {
                const scaledAmount = ing.amount * mult;
                const rounding = (amountMode === 'whole' && isDiscreteUnit(ing.unit));
                const shownAmount = rounding ? Math.round(scaledAmount) : scaledAmount;
                const displayAmount = (shownAmount % 1 === 0) ? Math.round(shownAmount) : shownAmount.toFixed(1);
                const roundedNote = (rounding && shownAmount !== scaledAmount)
                    ? `<span class="block text-[10px] text-amberAccent font-semibold mt-0.5">&#9888; whole units &mdash; rounded from ${scaledAmount.toFixed(1)} ${ing.unit}</span>`
                    : '';

                const ingKey = ing.name.toLowerCase().trim();
                const ingGrams = (ing.unit === 'g' || ing.unit === 'grams') ? shownAmount : ingredientGrams(ingKey, shownAmount, ing.unit);
                const pkg = (ingGrams != null) ? getPackageCount(ingKey, ingGrams) : null;
                const pkgHintHtml = pkg ? packageHintHtml(pkg) : '';

                const li = document.createElement('li');
                li.className = 'flex justify-between items-start text-sm border-b border-stoneNeutral-100 pb-2 cursor-pointer hover:bg-stoneNeutral-50 px-2 py-1 rounded transition-colors';
                li.innerHTML = `
                    <span class="pr-2"><span class="text-stoneNeutral-800 font-medium hover:text-emeraldAccent">${ing.name}</span>${pkgHintHtml}${roundedNote}</span>
                    <span class="font-mono font-bold text-stoneNeutral-900 bg-stoneNeutral-100 px-2.5 py-1 rounded whitespace-nowrap">${displayAmount} ${ing.unit}</span>
                `;
                li.addEventListener('click', () => openDeepDive(ing, mult));
                ingredientsContainer.appendChild(li);
            });

            // Update steps (skip any blank lines introduced while editing)
            const stepsContainer = document.getElementById('recipe-steps');
            stepsContainer.innerHTML = '';
            current.steps.forEach(step => {
                if (!String(step).trim()) return;
                const li = document.createElement('li');
                li.className = 'mb-2';
                li.innerText = step;
                stepsContainer.appendChild(li);
            });

            // Carb toggle + "how macros change" box (scaler only).
            updateCarbPanel(mult);
            syncAmountToggleUI();
        }

        // Show/refresh the scaler's Rice/Pasta toggle and the macro-change box for the
        // current recipe. Only recipes containing rice get the panel (others hide it).
        function updateCarbPanel(mult) {
            const swap = getCarbSwap(goalScaled(recipes[selectedRecipeId])); // goal-scaled rice baseline (no carb swap)
            const wrap = document.getElementById('carb-toggle-wrap');
            const box = document.getElementById('macro-change-box');
            if (!swap) {
                if (wrap) wrap.classList.add('hidden');
                if (box) box.classList.add('hidden');
                return;
            }
            if (wrap) wrap.classList.remove('hidden');
            if (box) box.classList.remove('hidden');
            syncCarbToggleUI();

            const fmt = (v) => {
                const r = Math.round(v * mult);
                const arrow = r === 0 ? '' : (r > 0 ? '&#9650;' : '&#9660;'); // up / down triangle
                const color = r === 0 ? 'text-stoneNeutral-700' : (r > 0 ? 'text-emeraldAccent' : 'text-amberAccent');
                return `<span class="${color} font-bold">${arrow} ${r > 0 ? '+' : ''}${r}g</span>`;
            };
            box.innerHTML = `
                <h4 class="font-bold text-stoneNeutral-900 text-sm mb-1">Brami Pasta vs. Rice — macro change</h4>
                <p class="text-[11px] text-stoneNeutral-700 mb-3">Calorie-matched swap (${Math.round(swap.riceGrams)}g rice &rarr; ${Math.round(swap.pastaGrams)}g dry pasta), so <span class="font-semibold">calories stay the same</span>. At your current ${mult}&times; scale, switching to pasta shifts the other macros by:</p>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div class="bg-white p-2 rounded text-center border border-stoneNeutral-200"><span class="block text-[10px] text-stoneNeutral-700 font-bold uppercase">Protein</span>${fmt(swap.delta.prot)}</div>
                    <div class="bg-white p-2 rounded text-center border border-stoneNeutral-200"><span class="block text-[10px] text-stoneNeutral-700 font-bold uppercase">Carbs</span>${fmt(swap.delta.carb)}</div>
                    <div class="bg-white p-2 rounded text-center border border-stoneNeutral-200"><span class="block text-[10px] text-stoneNeutral-700 font-bold uppercase">Fiber</span>${fmt(swap.delta.fib)}</div>
                    <div class="bg-white p-2 rounded text-center border border-stoneNeutral-200"><span class="block text-[10px] text-stoneNeutral-700 font-bold uppercase">Fat</span>${fmt(swap.delta.fat)}</div>
                </div>
                <p class="text-[10px] text-stoneNeutral-700 mt-2 italic">Protein &amp; calories are exact; Brami fat/carb/fiber are estimates — confirm from the box.</p>`;
        }

        // TAB 2 - SINGLE INGREDIENT IN-DEPTH DEEP DIVE MODAL
        function openDeepDive(ingredient, multiplier) {
            const key = ingredient.name.toLowerCase().trim();
            const ingData = ingredientDB[key];

            const panel = document.getElementById('ingredient-deep-dive');
            if (!ingData) {
                document.getElementById('dive-ing-name').innerText = ingredient.name;
                document.getElementById('dive-ing-cal').innerText = '--';
                document.getElementById('dive-ing-pro').innerText = '--';
                document.getElementById('dive-ing-fat').innerText = '--';
                document.getElementById('dive-ing-fib').innerText = '--';
                document.getElementById('dive-ing-carb').innerText = '--';
                document.getElementById('conversion-display-box').classList.add('hidden');
                document.getElementById('dive-conversion-buttons').innerHTML = '<p class="text-[10px] text-stoneNeutral-700 col-span-5 italic">Conversions not applicable.</p>';
                panel.classList.remove('hidden');
                return;
            }

            document.getElementById('dive-ing-name').innerText = ingredient.name;

            // Robust proportional scaling & synonyms unit converter safety fallback (no more NaNs!)
            const baseUnit = ingredient.unit || 'g';
            let baseConversionDivider = 1;
            if (ingData.conversions) {
                if (ingData.conversions[baseUnit]) {
                    baseConversionDivider = ingData.conversions[baseUnit];
                } else if (baseUnit.includes('bagel') && ingData.conversions['bagel']) {
                    baseConversionDivider = ingData.conversions['bagel'];
                } else if (baseUnit.includes('whole') && ingData.conversions['whole']) {
                    baseConversionDivider = ingData.conversions['whole'];
                } else {
                    const firstKey = Object.keys(ingData.conversions)[0];
                    baseConversionDivider = ingData.conversions[firstKey] || 1;
                }
            }

            const proportionalFactor = (ingredient.amount / baseConversionDivider) * multiplier;

            document.getElementById('dive-ing-cal').innerText = Math.round(ingData.cal * proportionalFactor) + ' kcal';
            document.getElementById('dive-ing-pro').innerText = Math.round(ingData.prot * proportionalFactor) + 'g';
            document.getElementById('dive-ing-fat').innerText = Math.round(ingData.fat * proportionalFactor) + 'g';
            document.getElementById('dive-ing-fib').innerText = Math.round(ingData.fib * proportionalFactor) + 'g';
            document.getElementById('dive-ing-carb').innerText = Math.round(ingData.carb * proportionalFactor) + 'g';

            const buttonBox = document.getElementById('dive-conversion-buttons');
            buttonBox.innerHTML = '';

            const activeBaseWeightInGrams = proportionalFactor * (ingData.conversions['g'] || 100);

            const conversionsMapping = {
                g: activeBaseWeightInGrams,
                oz: activeBaseWeightInGrams / 28.35,
                tbsp: activeBaseWeightInGrams / 15,
                tsp: activeBaseWeightInGrams / 5,
                cup: activeBaseWeightInGrams / 240
            };

            // Set up conversion display results box cleanly (No browser alerts rule!)
            const conversionDisplay = document.getElementById('conversion-display-box');
            conversionDisplay.innerText = 'Select a conversion unit below...';
            conversionDisplay.classList.remove('hidden');

            Object.keys(conversionsMapping).forEach(unit => {
                const value = conversionsMapping[unit];
                if (value > 0.01) {
                    const btn = document.createElement('button');
                    btn.className = 'bg-white hover:bg-stoneNeutral-200 border border-stoneNeutral-300 rounded text-[9px] font-bold py-1 px-1.5 text-stoneNeutral-800 transition-colors flex flex-col items-center';
                    btn.innerHTML = `
                        <span>${value.toFixed(1)}</span>
                        <span class="text-[8px] text-stoneNeutral-700 uppercase font-black tracking-wider">${unit}</span>
                    `;
                    btn.addEventListener('click', () => {
                        conversionDisplay.innerText = `Precisely: ${value.toFixed(2)} ${unit}`;
                    });
                    buttonBox.appendChild(btn);
                }
            });

            panel.classList.remove('hidden');
        }

        function closeDeepDive() {
            document.getElementById('ingredient-deep-dive').classList.add('hidden');
        }

        // TAB 3: SUNDAY PLANNER
        function renderSundayPlanner() {
            const daysInput = document.getElementById('planner-days');
            if (daysInput && document.activeElement !== daysInput) daysInput.value = prepDays;
            const daysNum = prepDays;

            const badge = document.getElementById('grocery-multiplier-badge');
            if (badge) badge.innerText = `x${daysNum} Days Prep`;

            const activeRecipes = [
                baseRecipe(customSelections.breakfast),
                baseRecipe(customSelections.lunch),
                baseRecipe(customSelections.dinner),
                baseRecipe(customSelections.dessert)
            ];

            // Consolidated grocery items map
            const consolidated = {};
            activeRecipes.forEach(rec => {
                rec.ingredients.forEach(ing => {
                    const key = ing.name.toLowerCase().trim();
                    if (!consolidated[key]) {
                        consolidated[key] = {
                            name: ing.name,
                            amount: 0,
                            unit: ing.unit,
                            rawIngredient: ing
                        };
                    }
                    consolidated[key].amount += ing.amount * daysNum;
                });
            });

            // Auto-append daily snacks
            const snackKey = 'carrot stick bags';
            if (!consolidated[snackKey]) {
                consolidated[snackKey] = {
                    name: 'Carrot Stick Bags (Daily Snack)',
                    amount: 0,
                    unit: 'bags',
                    rawIngredient: { name: 'Carrot Stick Bags', amount: 4, unit: 'bags' }
                };
            }
            consolidated[snackKey].amount += 4 * daysNum;

            // Render Shopping list cards
            const groceryContainer = document.getElementById('grocery-items-container');
            groceryContainer.innerHTML = '';

            Object.keys(consolidated).forEach(key => {
                const item = consolidated[key];
                // Whole-units mode: round discrete grocery items (eggs, bagels, potatoes...) to integers.
                const rounding = (amountMode === 'whole' && isDiscreteUnit(item.unit));
                const shownAmount = rounding ? Math.round(item.amount) : item.amount;
                let displayAmount = (shownAmount % 1 === 0) ? Math.round(shownAmount) : shownAmount.toFixed(1);
                const roundedNote = (rounding && shownAmount !== item.amount)
                    ? `<span class="block text-[10px] text-amberAccent font-semibold mt-0.5">&#9888; whole units &mdash; rounded from ${item.amount.toFixed(1)} ${item.unit}</span>`
                    : '';

                // Convert the (shown) amount to grams (any unit) so packaged items get a buy/use hint.
                const itemGrams = (item.unit === 'g' || item.unit === 'grams') ? shownAmount : ingredientGrams(key, shownAmount, item.unit);
                const pkg = (itemGrams != null) ? getPackageCount(key, itemGrams) : null;
                const pkgHintHtml = pkg ? packageHintHtml(pkg) : '';

                const div = document.createElement('div');
                div.className = 'flex items-start gap-3 p-3 hover:bg-stoneNeutral-50 rounded-lg transition-colors border-b border-stoneNeutral-100 cursor-pointer';
                div.innerHTML = `
                    <input type="checkbox" class="w-4 h-4 mt-0.5 rounded text-emeraldAccent focus:ring-emeraldAccent cursor-pointer">
                    <div class="flex-1">
                        <span class="text-sm font-medium text-stoneNeutral-800 check-label">${item.name}</span>
                        ${pkgHintHtml}${roundedNote}
                    </div>
                    <span class="font-mono text-xs bg-emeraldAccent text-white px-2 py-1 rounded font-bold hover:scale-105 transition-transform self-start" id="click-groc-detail">${displayAmount} ${item.unit}</span>
                `;
                
                div.querySelector('#click-groc-detail').addEventListener('click', (e) => {
                    e.stopPropagation();
                    goToRecipe(activeRecipes[0] && activeRecipes[0].id);
                });

                div.querySelector('input').addEventListener('change', (e) => {
                    div.querySelector('.check-label').classList.toggle('line-through', e.target.checked);
                    div.querySelector('.check-label').classList.toggle('opacity-50', e.target.checked);
                });
                groceryContainer.appendChild(div);
            });

            // Dynamic Step Generation with calculated totals and interactive links
            const timelineContainer = document.getElementById('timeline-container');
            timelineContainer.innerHTML = '';

            // Calculate active ingredients metrics dynamically for links
            const eggWhiteWeight = getActiveIngredientQty('kirkland liquid egg whites', daysNum);
            const tofuWeight = getActiveIngredientQty('extra firm tofu', daysNum);
            const edamameWeight = getActiveIngredientQty('shelled edamame', daysNum);
            const broccoliWeight = getActiveIngredientQty('broccoli florets', daysNum);
            const whiteRiceWeight = getActiveIngredientQty('white rice (uncooked)', daysNum);
            const blackRiceWeight = getActiveIngredientQty('black rice (uncooked)', daysNum);

            const steps = [
                {
                    time: 'Step 1: Prep & Wash Aromatics',
                    html: `Chop and prep all raw vegetables for your selected dishes. This includes up to <span class="bg-stoneNeutral-200 font-bold px-1.5 py-0.5 rounded text-xs text-stoneNeutral-800 hover:text-emeraldAccent cursor-pointer" onclick="viewTimelineIng('broccoli florets', ${daysNum})">${broccoliWeight.toFixed(0)}g of Broccoli Florets</span>. Prepare all fresh onions, garlic cloves, and ginger.`
                },
                {
                    time: 'Step 2: Grain Batching',
                    html: `Measure and cook your combined black-and-white rice blend. Prepare exactly <span class="bg-stoneNeutral-200 font-bold px-1.5 py-0.5 rounded text-xs text-stoneNeutral-800 hover:text-emeraldAccent cursor-pointer" onclick="viewTimelineIng('white rice (uncooked)', ${daysNum})">${whiteRiceWeight.toFixed(1)} tbsp of White Rice</span> and <span class="bg-stoneNeutral-200 font-bold px-1.5 py-0.5 rounded text-xs text-stoneNeutral-800 hover:text-emeraldAccent cursor-pointer" onclick="viewTimelineIng('black rice (uncooked)', ${daysNum})">${blackRiceWeight.toFixed(1)} tbsp of Black Rice</span> together with water in your rice cooker.`
                },
                {
                    time: 'Step 3: Sautéing the Veg Base',
                    html: `Heat sesame or vegetable oil in your largest skillet. Sauté mushrooms, garlic, and onions. Add exactly <span class="bg-stoneNeutral-200 font-bold px-1.5 py-0.5 rounded text-xs text-stoneNeutral-800 hover:text-emeraldAccent cursor-pointer" onclick="viewTimelineIng('shelled edamame', ${daysNum})">${edamameWeight.toFixed(0)}g of Shelled Edamame</span> on high for 3-4 minutes.`
                },
                {
                    time: 'Step 4: Scramble & Tofu Protein Integration',
                    html: `Pour exactly <span class="bg-stoneNeutral-200 font-bold px-1.5 py-0.5 rounded text-xs text-stoneNeutral-800 hover:text-emeraldAccent cursor-pointer" onclick="viewTimelineIng('kirkland liquid egg whites', ${daysNum})">${eggWhiteWeight.toFixed(0)}g of Liquid Egg Whites</span> into a hot pan and scramble until set. Cube or crumble <span class="bg-stoneNeutral-200 font-bold px-1.5 py-0.5 rounded text-xs text-stoneNeutral-800 hover:text-emeraldAccent cursor-pointer" onclick="viewTimelineIng('extra firm tofu', ${daysNum})">${tofuWeight.toFixed(0)}g of Extra Firm Tofu</span> and integrate.`
                },
                {
                    time: 'Step 5: Sunday Desserts & Baking',
                    html: `Bake or prepare your selected sweet treats (such as Blondies or Protein Pudding) to secure your comfort dessert limit. Portion into containers alongside your daily baseline of <span class="bg-stoneNeutral-200 font-bold px-1.5 py-0.5 rounded text-xs text-stoneNeutral-800 hover:text-emeraldAccent cursor-pointer" onclick="viewTimelineIng('carrot stick bags', ${daysNum})">${(4 * daysNum).toFixed(0)} Carrot Stick Bags</span>.`
                }
            ];

            steps.forEach(s => {
                const div = document.createElement('div');
                div.className = 'p-3 bg-stoneNeutral-50 rounded-lg border border-stoneNeutral-200 flex items-start gap-4 hover:border-emeraldAccent transition-colors';
                div.innerHTML = `
                    <div class="px-2 py-1 rounded bg-stoneNeutral-200 text-stoneNeutral-800 text-xs font-bold whitespace-nowrap">${s.time}</div>
                    <div class="text-stoneNeutral-800 leading-relaxed text-xs sm:text-sm">${s.html}</div>
                `;
                timelineContainer.appendChild(div);
            });
        }

        // Helper to query active recipe structures for dynamic timeline calculations
        function getActiveIngredientQty(name, daysNum) {
            const activeRecipes = [
                baseRecipe(customSelections.breakfast),
                baseRecipe(customSelections.lunch),
                baseRecipe(customSelections.dinner),
                baseRecipe(customSelections.dessert)
            ];
            let total = 0;
            activeRecipes.forEach(rec => {
                rec.ingredients.forEach(ing => {
                    if (ing.name.toLowerCase() === name.toLowerCase()) {
                        total += ing.amount * daysNum;
                    }
                });
            });
            return total;
        }

        function viewTimelineIng(ingName, daysNum) {
            const recipeKeyMap = {
                'button mushrooms': 'vegStirfry',
                'broccoli florets': 'vegStirfry',
                'white rice (uncooked)': 'vegStirfry',
                'black rice (uncooked)': 'vegStirfry',
                'shelled edamame': 'vegStirfry',
                'kirkland liquid egg whites': 'vegStirfry',
                'extra firm tofu': 'tofuStirfry',
                'all-purpose flour': 'blondies',
                'shiitake mushrooms': 'mapoTofu',
                'fat-free vanilla greek yogurt': 'pudding',
                'low-calorie bread (for crumbs)': 'curryLunch',
                'fresh spinach': 'curryLunch',
                'chopped mixed vegetables': 'frittata',
                'carrot stick bags': 'vegStirfry'
            };

            // On the standalone Planner page, jump to the recipe on the Recipes page.
            goToRecipe(recipeKeyMap[ingName] || 'bagel');
        }

        // TAB 4: WEEKLY MEAL TIMING CALENDAR
        const scheduleSettings = { wake: '07:00', gym: '18:00', sleep: '23:00', noGym: false };
        const GYM_DURATION = 120; // gym session length in minutes (2 hours)

        function parseTimeToMin(str) {
            const parts = String(str || '').split(':');
            return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
        }
        function fmtMin(min) {
            min = ((Math.round(min) % 1440) + 1440) % 1440;
            const h = Math.floor(min / 60), m = min % 60;
            const ap = h < 12 ? 'AM' : 'PM';
            let hh = h % 12; if (hh === 0) hh = 12;
            return `${hh}:${String(m).padStart(2, '0')} ${ap}`;
        }
        // Optimal generic meal times derived from wake / gym (2h) / sleep (minutes from midnight).
        function computeMealSchedule(wake, gym, sleep, noGym) {
            const meals = [
                { role: 'Breakfast', emoji: '\u{1F373}', color: '#0f766e', time: wake + 30 },
                { role: 'Lunch', emoji: '\u{1F957}', color: '#0369a1', time: wake + 300 }
            ];
            if (noGym) {
                meals.push({ role: 'Snack', emoji: '\u{1F955}', color: '#65a30d', time: wake + 480 });
                meals.push({ role: 'Dinner', emoji: '\u{1F371}', color: '#b45309', time: sleep - 210 });
            } else {
                meals.push({ role: 'Pre-Gym Snack', emoji: '\u{1F955}', color: '#65a30d', time: gym - 90 });
                meals.push({ role: 'Dinner', emoji: '\u{1F371}', color: '#b45309', time: gym + GYM_DURATION + 45 });
            }
            meals.push({ role: 'Dessert', emoji: '\u{1F36A}', color: '#be185d', time: sleep - 90 });
            // Clamp into the waking window, then order chronologically for display.
            meals.forEach(m => { m.time = Math.max(wake + 10, Math.min(sleep - 10, m.time)); });
            meals.sort((a, b) => a.time - b.time);
            return meals;
        }

        // Timeline window: 5 AM (300) -> midnight (1440).
        const TL_START = 300, TL_END = 1440;
        function tlPct(min) { return Math.max(0, Math.min(100, (min - TL_START) / (TL_END - TL_START) * 100)); }

        function renderSchedule() {
            const container = document.getElementById('schedule-container');
            if (!container) return;
            const s = scheduleSettings;
            const wake = parseTimeToMin(s.wake), gym = parseTimeToMin(s.gym), sleep = parseTimeToMin(s.sleep);
            const meals = computeMealSchedule(wake, gym, sleep, s.noGym);

            const ticks = [360, 540, 720, 900, 1080, 1260].map(hm =>
                `<div class="absolute top-0 bottom-0 border-l border-stoneNeutral-200" style="left:${tlPct(hm)}%"></div>
                 <span class="absolute -bottom-4 text-[8px] text-stoneNeutral-700" style="left:${tlPct(hm)}%; transform:translateX(-50%)">${fmtMin(hm).replace(':00', '')}</span>`).join('');

            const gymBlock = s.noGym ? '' :
                `<div class="absolute top-0 bottom-0 bg-amber-200 border-x border-amber-400 rounded" style="left:${tlPct(gym)}%; width:${Math.max(1.5, tlPct(gym + GYM_DURATION) - tlPct(gym))}%" title="Gym ${fmtMin(gym)}–${fmtMin(gym + GYM_DURATION)}"></div>`;

            const dots = meals.map(m =>
                `<div class="absolute flex flex-col items-center" style="left:${tlPct(m.time)}%; top:2px; transform:translateX(-50%)" title="${m.role} — ${fmtMin(m.time)}">
                    <span class="text-[11px] leading-none">${m.emoji}</span>
                    <span class="w-2.5 h-2.5 rounded-full border border-white shadow" style="background:${m.color}"></span>
                 </div>`).join('');

            const list = meals.map(m =>
                `<span class="flex items-center gap-1.5">
                    <span class="w-2 h-2 rounded-full flex-shrink-0" style="background:${m.color}"></span>
                    <span class="font-bold text-stoneNeutral-800">${fmtMin(m.time)}</span>
                    <span class="text-stoneNeutral-700">${m.emoji} ${m.role}</span>
                 </span>`).join('');
            const gymListItem = s.noGym ? '' :
                `<span class="flex items-center gap-1.5">
                    <span class="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0"></span>
                    <span class="font-bold text-stoneNeutral-800">${fmtMin(gym)}–${fmtMin(gym + GYM_DURATION)}</span>
                    <span class="text-stoneNeutral-700">\u{1F3CB}\u{FE0F} Gym (2 h)</span>
                 </span>`;

            container.innerHTML = `
                <div class="bg-white p-5 rounded-xl border border-stoneNeutral-200 shadow-sm max-w-4xl">
                    <div class="flex flex-wrap items-center gap-x-4 gap-y-3 mb-5 pb-4 border-b border-stoneNeutral-200">
                        <label class="flex items-center gap-1.5 text-xs font-semibold text-stoneNeutral-700">&#9728;&#65039; Wake
                            <input type="time" data-field="wake" value="${s.wake}" class="sched-input bg-stoneNeutral-100 border border-stoneNeutral-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-emeraldAccent"></label>
                        <label class="flex items-center gap-1.5 text-xs font-semibold ${s.noGym ? 'text-stoneNeutral-300' : 'text-stoneNeutral-700'}">&#127947;&#65039; Gym
                            <input type="time" data-field="gym" value="${s.gym}" ${s.noGym ? 'disabled' : ''} class="sched-input bg-stoneNeutral-100 border border-stoneNeutral-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-emeraldAccent disabled:opacity-40"></label>
                        <label class="flex items-center gap-1.5 text-xs font-semibold text-stoneNeutral-700 cursor-pointer">
                            <input type="checkbox" class="sched-nogym w-3.5 h-3.5 rounded text-emeraldAccent focus:ring-emeraldAccent" ${s.noGym ? 'checked' : ''}> No gym today</label>
                        <label class="flex items-center gap-1.5 text-xs font-semibold text-stoneNeutral-700">&#127769; Sleep
                            <input type="time" data-field="sleep" value="${s.sleep}" class="sched-input bg-stoneNeutral-100 border border-stoneNeutral-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-emeraldAccent"></label>
                    </div>
                    <div class="relative h-10 bg-stoneNeutral-50 rounded-lg border border-stoneNeutral-200 mb-6">
                        ${ticks}
                        ${gymBlock}
                        ${dots}
                    </div>
                    <div class="flex flex-wrap gap-x-5 gap-y-2 text-xs">
                        ${list}
                        ${gymListItem}
                    </div>
                    <p class="text-[11px] text-stoneNeutral-700 mt-4 leading-relaxed">Optimal timing: breakfast ~30 min after waking, lunch midday, ${s.noGym ? 'an afternoon snack, and dinner in the evening' : 'a light pre-gym snack ~1.5 h before your 2-hour session, and a protein-forward dinner ~45 min after you finish'}, with dessert ~1.5 h before bed.</p>
                </div>`;
        }

        // Recompute the schedule whenever a wake/gym/sleep time changes (delegated listener).
        (function () {
            const sc = document.getElementById('schedule-container');
            if (sc) {
                sc.addEventListener('change', (e) => {
                    const el = e.target;
                    if (!el || !el.classList) return;
                    if (el.classList.contains('sched-input')) {
                        scheduleSettings[el.getAttribute('data-field')] = el.value;
                        renderSchedule();
                    } else if (el.classList.contains('sched-nogym')) {
                        scheduleSettings.noGym = el.checked;
                        renderSchedule();
                    }
                });
            }
        })();

        // ---- Listeners. Each is guarded so a page that lacks the element is unaffected,
        // and persisted state is written through (localStorage + Supabase) on every change.

        // Mix & Match meal selectors (dashboard page)
        function bindMealSelect(id, role) {
            onEl(id, 'change', (e) => {
                customSelections[role] = e.target.value;
                const ws = document.getElementById('week-selector'); if (ws) ws.value = 'custom';
                persistState();
                renderWeeklyDashboard();
            });
        }
        bindMealSelect('breakfast-mix', 'breakfast');
        bindMealSelect('lunch-mix', 'lunch');
        bindMealSelect('dinner-mix', 'dinner');
        bindMealSelect('dessert-mix', 'dessert');

        // Preset week templates (dashboard page)
        onEl('week-selector', 'change', (e) => {
            const val = e.target.value;
            if (val === 'custom') return;
            const preset = weeksPlan[val];
            if (!preset) return;
            activeWeek = String(val);
            ['breakfast', 'lunch', 'dinner', 'dessert'].forEach(r => {
                customSelections[r] = preset[r];
                const s = document.getElementById(r + '-mix'); if (s) s.value = preset[r];
            });
            persistState();
            renderWeeklyDashboard();
        });

        onEl('dashboard-days', 'input', (e) => {
            prepDays = parseInt(e.target.value) || 7;
            persistState();
            renderWeeklyDashboard();
        });

        // Calorie goal lives in the shared header (every page): rescale + re-render this page.
        onEl('calorie-goal', 'input', (e) => {
            calorieGoal = parseInt(e.target.value) || BASE_CALORIE_GOAL;
            persistState();
            updateTabs();
        });

        // Legacy SPA tab buttons (none on the standalone pages — nav is links now).
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => { activeTab = btn.getAttribute('data-tab'); updateTabs(); });
        });

        // Carb base toggle (Rice <-> Pasta) — recipes page only.
        document.querySelectorAll('.carb-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                carbMode = btn.getAttribute('data-carb');
                syncCarbToggleUI();
                persistState();
                const mi = document.getElementById('multiplier-input');
                scaleRecipe(mi ? (parseFloat(mi.value) || 1.0) : 1.0);
            });
        });
        function syncCarbToggleUI() {
            document.querySelectorAll('.carb-btn').forEach(b => {
                const on = b.getAttribute('data-carb') === carbMode;
                b.classList.toggle('bg-white', on);
                b.classList.toggle('shadow-sm', on);
                b.classList.toggle('text-emeraldAccent', on);
                b.classList.toggle('text-stoneNeutral-700', !on);
            });
        }

        // Whole-units toggle (Exact <-> Whole) — shared header; re-renders this page.
        document.querySelectorAll('.amount-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                amountMode = btn.getAttribute('data-amount');
                syncAmountToggleUI();
                persistState();
                updateTabs();
            });
        });
        function syncAmountToggleUI() {
            document.querySelectorAll('.amount-btn').forEach(b => {
                const on = b.getAttribute('data-amount') === amountMode;
                b.classList.toggle('bg-white', on);
                b.classList.toggle('shadow-sm', on);
                b.classList.toggle('text-emeraldAccent', on);
                b.classList.toggle('text-stoneNeutral-700', !on);
            });
        }

        // Recipe scaler multiplier + presets — recipes page only.
        // The scaler "Multiplier Servings" is the SAME shared value as Prep Days on the
        // Dashboard/Planner (prepDays) — changing one updates all and persists.
        onEl('multiplier-input', 'input', (e) => {
            prepDays = parseFloat(e.target.value) || 1.0;
            persistState();
            scaleRecipe(prepDays);
        });
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                prepDays = parseFloat(btn.getAttribute('data-scale')) || 1.0;
                const mi = document.getElementById('multiplier-input'); if (mi) mi.value = prepDays;
                persistState();
                scaleRecipe(prepDays);
            });
        });

        onEl('planner-days', 'input', (e) => {
            prepDays = parseInt(e.target.value) || 7;
            persistState();
            renderSundayPlanner();
        });

        // Recipe edit controls (scaler): Save / Revert / Notes (already guarded).
        (function () {
            const editBtn = document.getElementById('recipe-edit-btn');
            const saveBtn = document.getElementById('recipe-save-btn');
            const revertBtn = document.getElementById('recipe-revert-btn');
            const notes = document.getElementById('recipe-notes');
            if (editBtn) editBtn.addEventListener('click', toggleRecipeEditMode);
            if (saveBtn) saveBtn.addEventListener('click', saveRecipeEdits);
            if (revertBtn) revertBtn.addEventListener('click', revertRecipeEdits);
            if (notes) notes.addEventListener('input', (e) => {
                draftNotes[selectedRecipeId] = e.target.value;
                setNotesStatus('');           // clear a stale "Notes saved." once she edits again
                updateEditToolbar();
            });
            const notesSave = document.getElementById('recipe-notes-save');
            if (notesSave) notesSave.addEventListener('click', saveNotes);
        })();

        // Init — wait for the Supabase data AND the persisted state, then render THIS page.
        Promise.all([window.DATA_READY || Promise.resolve(), window.STATE_READY || Promise.resolve()]).then(() => {
            sanitizeSelections();          // drop selections pointing at missing recipes
            initRecipeEdits();             // snapshot originals + apply saved recipe edits
            syncAmountToggleUI();          // reflect persisted units mode in the header toggle
            // Dashboard: reflect persisted meal selections in the selects (if present here).
            if (document.getElementById('breakfast-mix')) {
                ['breakfast', 'lunch', 'dinner', 'dessert'].forEach(r => {
                    const s = document.getElementById(r + '-mix'); if (s && customSelections[r]) s.value = customSelections[r];
                });
            }
            updateTabs();                  // render whichever single page this is
        }).catch((e) => console.error('Page init failed:', e));
