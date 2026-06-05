/* Runtime-only UI state (not persisted). The data globals load from Supabase via
   js/data-layer.js; the PERSISTED state (calorieGoal, carbMode, amountMode, prepDays,
   activeWeek, selectedRecipeId, customSelections) lives in js/state.js. Load after state.js. */

let activeTab = 'dashboard';   // legacy; pages now stand alone (see document.body.dataset.page)
let chartInstance = null;      // Chart.js handle for the dashboard pie
