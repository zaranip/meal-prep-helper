# Meal Prep Dashboard

A single-page web app for planning a week of high-protein meal prep: mix-and-match meals, track daily and weekly macros against a calorie goal, scale recipes for batch cooking, generate a consolidated shopping list with real package/carton counts, and lay out a daily eating schedule around your wake / gym / sleep times.

It's a **static site** — no build step, no server required, no dependencies to install. Just open the HTML file.

---

## Features

The app has four tabs:

### 1. Daily Dashboard
- **Mix & match** any breakfast, lunch, dinner, and dessert, or load a pre-built week template.
- Live **daily and weekly macro totals** (calories, protein, fat, fiber, carbs) and a calorie-contribution pie chart.
- **Editable calorie goal** (header) — changing it proportionally scales every recipe (e.g. a goal of 900 halves all portions). The `1.0×` baseline in the Recipe Scaler follows suit.
- Guardrail cards: goal met / over, per-meal max, snack budget.

### 2. Recipe Scaler
- Pick any recipe and scale it by a multiplier (defaults to **7×** for a week of prep).
- See scaled ingredient amounts, scaled macros, prep steps, and freezer tips.
- Click any ingredient for a **deep-dive** with per-ingredient macros and unit conversions.
- **Rice ↔ Brami Pasta** toggle (rice recipes only): a **calorie-matched** swap that keeps calories the same and shows how the other macros shift.

### 3. Sunday Planner
- A **consolidated grocery list** for your selected plan × prep days.
- For packaged items, a **buy line** (how many cartons/bags/cases to purchase) plus a **use line** (how much of one package you actually consume — so you know what's leftover).
- A sequential **prep & cooking timeline** with clickable ingredient quantities.

### 4. Calendar
- A **single-day meal-timing** view that places your meals at optimal times.
- Inputs for **wake**, **gym** (a 2-hour session), and **sleep**, plus a **"No gym today"** option.
- Timing logic: breakfast ~30 min after waking, lunch midday, a light pre-gym snack ~1.5 h before lifting, a protein-forward dinner ~45 min after the gym, and dessert ~1.5 h before bed. (No-gym days use an afternoon snack and an evening dinner.)

### Global controls (header)
- **Daily Calorie Goal** — scales the whole plan.
- **Ingredient Units: Exact / Whole** — rounds discrete items (eggs, bagels, potatoes, bread slices, curry cubes…) to whole numbers across macros, the scaler, and the shopping list, with the macros corrected to match. The rounding scale follows the **Prep Days** input (Prep Days = 1 → per-serving rounding; Prep Days = 7 → whole-week batch).

---

## Running it

This is a static page using classic (non-module) scripts, so it works straight from the filesystem. Pick whichever is easiest:

1. **Double-click** `index.html` in your file explorer — it opens in your default browser.
2. **VS Code → Run Task… → "Open Dashboard in Browser"** (provided in `.vscode/tasks.json`).
3. **VS Code → Run and Debug → "Open Dashboard (Edge)"** or **"(Chrome)"** (provided in `.vscode/launch.json`; launches an isolated browser instance).
4. Any static server (e.g. the **Live Preview** / **Live Server** VS Code extension, or `npx serve`).

> No `npm install` needed. Tailwind CSS and Chart.js load from a CDN, so the first load requires an internet connection.

---

## Project structure

```
meal-prep-planner/
├── index.html                 # markup for all four tabs (structure only)
├── css/
│   └── styles.css             # custom styles (most styling is Tailwind utility classes)
├── js/
│   ├── data.js                # DATA: ingredientDB, recipes, week templates, packagingDB, app state
│   ├── packaging.js           # package/case "buy & use" math
│   └── app.js                 # all behavior: tabs, dashboard, scaler, planner, calendar, listeners
└── .vscode/
    ├── launch.json            # browser launch configs
    └── tasks.json             # "Open Dashboard in Browser" task
```

Scripts load in order: `data.js` → `packaging.js` → `app.js`. They are deliberately **classic `<script>` tags** (not ES modules) so the page runs over `file://` and inline handlers work. Don't convert them to modules without adding a server.

---

## Customizing your plan

Almost everything lives in **`js/data.js`**.

### Add or edit a recipe (`recipes`)
```js
myRecipe: {
  id: 'myRecipe',
  title: 'My Recipe',
  desc: 'Short description.',
  type: 'Lunch',                 // Breakfast | Lunch | Dinner | Dessert
  week: [],                      // optional metadata
  baseMacros: { cal: 500, prot: 40, fat: 15, fib: 8, carb: 45 }, // ONE serving (1.0×)
  ingredients: [
    { name: 'Extra Firm Tofu', amount: 200, unit: 'g' },
    { name: 'Large Eggs', amount: 2, unit: 'whole' }
  ],
  steps: ['Step one.', 'Step two.'],
  freezerTips: 'Storage/reheat notes.'
}
```
Then add it to the matching dropdown(s) in `index.html` (`breakfast-mix`, `lunch-mix`, `dinner-mix`, or `dessert-mix`) as an `<option value="myRecipe">…</option>`. Macros are **per serving**; the app scales up from there.

### Add an ingredient (`ingredientDB`)
Used by the deep-dive and the whole-units macro math.
```js
'my ingredient': {
  cal: 80, prot: 1.8, fat: 0.8, fib: 2.0, carb: 18.0,   // per the reference serving below
  conversions: { g: 100, tbsp: 16.7, cup: 0.7 }          // g = grams in the reference serving
}
```
Convention: macros are **per the reference serving whose gram weight is `conversions.g`**, and each unit's value is `referenceGrams ÷ gramsPerUnit`. Keys must be the lowercase ingredient name. Most values here come from USDA FoodData Central or product labels; estimates are flagged in comments.

### Set retail package sizes (`packagingDB`)
Drives the shopping list's "how much to buy".
```js
'kirkland liquid egg whites': {
  retailUnit: 'carton', unitLabel: 'cartons',
  gramsPerUnit: 454,        // grams in one buyable unit
  unitsPerCase: 6,          // 1 = sold individually
  caseLabel: 'case',
  verified: true            // false shows a "verify pack size" warning
}
```

---

## Tech stack

- Plain **HTML + CSS + JavaScript** (no framework, no bundler).
- **Tailwind CSS** (CDN) for styling, configured inline in the HTML `<head>`.
- **Chart.js** (CDN) for the calorie-contribution pie chart.

---

## Notes

- Calorie/macro figures are as accurate as the data in `data.js`. A few ingredient values (e.g. Brami pasta fat/carb/fiber, garam masala) are **estimates** and are flagged in code comments — update them from the actual packaging for full accuracy.
- The default calorie goal is **1800 kcal/day**; the default prep horizon is **7 days**.
