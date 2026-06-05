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
                '<nav class="flex gap-2 bg-stoneNeutral-100 p-1.5 rounded-lg border border-stoneNeutral-200 text-sm">' + linkHtml + '</nav>' +
            '</div>' +
        '</header>';
})();
