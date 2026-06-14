# Meal Prep Dashboard

A multi-page web app for planning a week of high-protein meal prep: mix-and-match meals, track
daily/weekly macros against a calorie goal, scale recipes for batch cooking, build a consolidated
shopping list with real package/case counts, and lay out a weekly schedule.

It's a **static front end** (plain HTML/CSS/JS, no build step) backed by **Supabase** (Postgres +
Auth + an Edge Function). It's **multi-user**: anyone can create an account, and each account's
recipes are private to them — everyone shares a common set of pre-loaded starter templates.

> **Want your own copy running?** Jump to [Deploy your own instance](#deploy-your-own-instance).

---

## Features

- **Dashboard** — mix & match Breakfast / Meal 1 / Meal 2 / Snack / Dessert (or load a week
  template); live daily & weekly macro totals + a calorie-contribution pie; editable calorie goal
  that proportionally scales the whole plan; guardrail cards. Save the current mix as a new week.
- **Recipes (scaler)** — pick any recipe, scale by a multiplier; scaled ingredients/macros/steps;
  per-ingredient **deep-dive** with unit conversions; **Rice ↔ Brami pasta** calorie-matched swap;
  edit recipes (your custom ones save to your account); a Notes + Freezer-tips box.
- **Planner** — consolidated grocery list (× prep days) with **buy / use** lines for packaged
  items, plus a sequential prep timeline.
- **Calendar** — weekly schedule helper (wake / gym / sleep timing) **+** a week-template manager
  and an **ingredient-overlap** tool to pick meals that share ingredients.
- **Add Recipe (`+`)** — build custom recipes: search USDA foods, **quick-add staples**, **add
  your own food** (manual macros), import from a **NYT Cooking** link, set a per-serving **scale
  target**, and preview the scaled recipe before saving.
- **Header** — one place to sign in / create an account / reset a password; a daily calorie goal;
  an Exact/Whole ingredient-units toggle.

---

## Deploy your own instance

You'll need a free **GitHub** account, a free **Supabase** project, and (optional, for ingredient
search & recipe import) a free **USDA FoodData Central** API key.

### 1. Get the code
Fork this repo (or clone it). You'll deploy your fork to GitHub Pages in the last step.

### 2. Create a Supabase project
[supabase.com](https://supabase.com) → **New project** (the free tier is plenty). Note your
**Project URL** and **publishable/anon key** (Project Settings → **API**).

### 3. Create the database
In the Supabase **SQL Editor**, run these two files (in order):
1. **`supabase/schema.sql`** — all tables + the multi-user security (Row Level Security) model.
2. **`supabase/seed.sql`** — the shared starter templates (recipes, ingredients, packaging, week
   templates). *Run this only at initial setup — it truncates the template tables.*

### 4. Deploy the Edge Function *(optional but recommended)*
`supabase/functions/usda-proxy` powers ingredient search and the NYT-Cooking importer. Without it,
the rest of the app still works — you just add foods manually.

```bash
npm i -g supabase                 # the Supabase CLI
supabase login
supabase link --project-ref <your-project-ref>     # ref is in your project URL / Settings
supabase secrets set USDA_API_KEY=<your-usda-key>   # free key: https://fdc.nal.usda.gov/api-key-signup
supabase functions deploy usda-proxy --no-verify-jwt
```

### 5. Point the app at your project
Edit **`js/config.js`**:
```js
window.SUPABASE_CONFIG = {
  url:     "https://YOUR-PROJECT.supabase.co",
  anonKey: "YOUR-PUBLISHABLE-ANON-KEY",   // public on purpose — see Security below
};
```

### 6. Turn on accounts
Supabase → **Authentication**:
- **Providers → Email** → enable, and **allow new users to sign up**.
- **URL Configuration** → set your **Site URL** to your deployed address (needed so the
  "Forgot password" reset link returns to your site).
- *(Optional)* **Settings** → turn off "Confirm email" for instant sign-up (otherwise new users
  must click a confirmation email first).

### 7. Deploy the site
Push to your fork's `main`. The included **`.github/workflows/static.yml`** publishes the repo to
**GitHub Pages** — enable Pages in your repo (Settings → Pages → Source: GitHub Actions). Any
static host works too (Netlify, Vercel, `npx serve`, etc.).

That's it — open your Pages URL, click **Create account** in the header, and start adding recipes.

---

## How accounts work

- **One sign-in, in the header**: Sign in / Create account / Forgot password / Sign out. Signing
  in there applies to every page.
- Each account's **recipes, ingredients, and settings are private** (enforced by RLS).
- **Everyone sees the shared starter templates** (the `stock_*` recipes + the seed week templates).
- **Signed out** = templates only; sign in to see and add your own recipes.

### Editing the shared templates
The starter templates are **read-only to the app** — edit them in the Supabase **SQL editor**
(`stock_recipes`, `stock_ingredients`, `packaging`, `week_plans` rows with `user_id IS NULL`, …);
the service role there bypasses RLS. (`supabase/seed.sql` is just the initial snapshot of those
rows.)

---

## Local development & tests

```bash
npm install          # just jsdom, for the headless tests
npm run smoke        # boots every page in jsdom against a mocked backend; asserts they render
node scripts/test-recipe-servings.js   # recipe-scaling / target-kcal math
node scripts/test-parser.js            # NYT ingredient-line parser
npm run seed         # regenerate supabase/seed.sql from the bundled template data
```
> `npm run smoke` uses a **mock** Supabase, so it cannot verify the live RLS isolation. After a
> deploy, confirm isolation with two accounts: account B must never see account A's recipes.

The site itself needs no build — serve the folder (e.g. VS Code Live Server, or `npx serve`) and
open `index.html`. It needs internet (Tailwind/Chart.js CDNs + your Supabase project).

---

## Project structure

```
index.html / recipes.html / planner.html / calendar.html / builder.html   # the 5 pages
css/styles.css
js/
  config.js          # YOUR Supabase URL + publishable key
  data-reconstruct.js# rebuilds the app's data globals from Supabase rows (shared w/ tests)
  data-layer.js      # creates the Supabase client; loads stock + your custom data
  state.js           # persisted per-user state (calorie goal, selections, prep days…)
  nav.js             # shared header + the unified sign-in widget
  app.js             # dashboard / scaler / planner / calendar engine
  builder.js         # the Add Recipe tab (USDA search, manual food, NYT import, save)
  week-editor.js     # calendar week-template manager
  overlap.js         # ingredient-overlap tool
  recipe-parse.js / packaging.js
supabase/
  schema.sql         # complete schema + RLS (run first)
  seed.sql           # shared starter templates (run second)
  functions/usda-proxy/index.ts   # USDA search + NYT import Edge Function
scripts/             # seed generation + headless tests
```
Scripts are deliberately **classic `<script>` tags** (not ES modules) so inline handlers and
cross-file globals work; load order matters (see each page's `<script>` block).

---

## Security

- The **publishable/anon key** in `js/config.js` is **public by design** — it ends up in the
  deployed JS regardless. Security comes from the **RLS policies** in `supabase/schema.sql`, not
  from hiding the key.
- **NEVER** put the **`service_role` / secret key** (`sb_secret_…`) in client code or commit it —
  it bypasses RLS and grants full read/write. Use it only in the SQL editor / server side.
- Custom data is own-only; shared template tables are read-only to clients. Verify with the
  two-account check above after deploying.

---

## Tech stack

Plain **HTML + CSS + JavaScript** · **Tailwind CSS** & **Chart.js** (CDN) · **Supabase**
(Postgres, Auth, Edge Functions/Deno) · **USDA FoodData Central** API.
