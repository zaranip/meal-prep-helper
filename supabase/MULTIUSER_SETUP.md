# Multi-user setup & runbook

Turns the app from "single owner, public read" into **per-account isolation**: every signed-in
user has their own private recipes/ingredients and their own settings; everyone (incl. signed-out)
still sees the shared **pre-loaded templates** (the `stock_*` tables + the seed `week_plans` rows).

Sign-in is **one place: the header** (top-right) — Sign in / Create account / Forgot password /
Sign out. Signing in there applies everywhere.

## ⚠️ Run these steps IN ORDER

The order matters so strangers can never hit the brief window where the old "any logged-in user can
edit templates" policy is still live.

### 1. Deploy the updated client code
Commit/push the JS changes (header auth, per-user upserts, per-user settings). This client expects
the new schema — so do step 2 right after.

### 2. Run the migration
Supabase → **SQL Editor** → paste & run **`supabase/migrate_multiuser.sql`**. It:
- adds `user_id` ownership to `recipes`, `ingredients`, `week_plans`;
- switches `ingredients` dedup to `(user_id, usda_fdc_id)` and `week_plans` to per-user week numbers;
- makes `app_settings` per-user;
- sets **own-only RLS** on the custom tables;
- **locks `stock_*` / `packaging` / `app_config` to read-only** (you edit those from the SQL editor;
  the service role bypasses RLS).

Idempotent — safe to re-run.

### 3. Claim YOUR existing custom recipes
After the migration your existing custom recipes have `user_id = NULL`, so they're invisible to
everyone (including you) until claimed.

1. Get your user id: Supabase → **Authentication → Users** → copy your account's **User UID**
   (you already have the single account from the old setup; if not, create one via the header first).
2. In the SQL editor, run (replace the uid):
   ```sql
   update ingredients set user_id = 'YOUR-USER-UID' where user_id is null;
   update recipes     set user_id = 'YOUR-USER-UID' where user_id is null;
   ```
   Do **NOT** claim `week_plans` — leaving its seed rows `user_id IS NULL` keeps them shared templates.

### 4. Enable public sign-up (LAST — outward-facing)
Supabase → **Authentication → Providers → Email** → turn **ON** "Allow new users to sign up".
After this, anyone visiting your site can create an account.
- **Email confirmation** (Authentication → Settings): if ON, new users must click a confirmation
  email before they can sign in (the header says "check your email"). Turn OFF for instant access.
- **Forgot password** sends a reset link back to your site URL; clicking it shows a "set new
  password" box in the header. Make sure your site URL is in Authentication → URL Configuration.

## Verify isolation (the real test — local smoke can't check RLS)

1. **Account A** (your claimed account): sign in → you see your recipes + the shared templates.
2. **Account B** (a second, throwaway account): sign in → you see ONLY the shared templates + B's
   own recipes; add a recipe as B.
3. Back as **Account A**: you must NOT see B's recipe; B must NOT see A's.
4. **Signed out**: only the shared templates (stock recipes + seed weeks); no custom recipes.

If any account can see another's custom recipe, STOP — the RLS didn't apply; re-check step 2.

## Notes
- Signed-out is now stock-only; to see/add your own recipes you must sign in. (Behavior change from
  the old offline-friendly model — intended for multi-user.)
- Fresh database from scratch: run `schema.sql` + `schema_app.sql` (+ the earlier `migrate_*.sql`
  for notes/snack/description/target_kcal), then this `migrate_multiuser.sql` last.
