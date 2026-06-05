// supabase/functions/usda-proxy/index.ts
// ---------------------------------------------------------------------------
// Proxies USDA FoodData Central so the API key never reaches the browser.
// Two actions (POST JSON body):
//   { action: 'search',         query: 'egg whites' }
//   { action: 'fetchNutrients', fdcId: 2341234 }
//
// fetchNutrients returns macros normalised to PER 100 g. USDA data is messy:
//   * Foundation / SR Legacy / Survey foods carry per-100g `foodNutrients`.
//   * Branded foods carry per-100g `foodNutrients` too, but if those are
//     missing we fall back to the per-serving `labelNutrients`, scaling to
//     100 g only when the serving size is given in grams.
// We match nutrients by USDA nutrient *number* (stable, e.g. "208" = energy)
// and fall back to the internal id, and we prefer the KCAL energy row.
// ---------------------------------------------------------------------------
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const BASE = "https://api.nal.usda.gov/fdc/v1";

// Nutrients of interest. `numbers` = USDA nutrient number, `ids` = internal id.
const N = {
  energyKcal: { numbers: ["208"], ids: [1008], unit: "KCAL" },
  energyKj: { numbers: ["268"], ids: [1062], unit: "KJ" },
  protein: { numbers: ["203"], ids: [1003] },
  fat: { numbers: ["204"], ids: [1004] },
  carbs: { numbers: ["205"], ids: [1005] },
  fiber: { numbers: ["291"], ids: [1079] },
};

const nutNumber = (n: any): string =>
  String(n?.nutrient?.number ?? n?.nutrientNumber ?? n?.number ?? "");
const nutId = (n: any): number | undefined =>
  n?.nutrient?.id ?? n?.nutrientId ?? n?.id;
const nutUnit = (n: any): string =>
  String(n?.nutrient?.unitName ?? n?.unitName ?? "").toUpperCase();
const nutAmount = (n: any): number => {
  const v = n?.amount ?? n?.value;
  return typeof v === "number" ? v : Number(v) || 0;
};

// Find a nutrient amount from a foodNutrients array (values are per 100 g).
function find(
  list: any[],
  spec: { numbers: string[]; ids: number[]; unit?: string },
): number | null {
  if (!Array.isArray(list)) return null;
  const matches = list.filter(
    (n) => spec.numbers.includes(nutNumber(n)) || spec.ids.includes(nutId(n) as number),
  );
  if (matches.length === 0) return null;
  if (spec.unit) {
    const u = matches.find((m) => nutUnit(m) === spec.unit);
    if (u) return nutAmount(u);
  }
  return nutAmount(matches[0]);
}

// ---- NYT Cooking import helpers (schema.org/Recipe JSON-LD) -----------------
function decodeEntities(s: string): string {
  return String(s ?? "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0*39;|&#x0*27;|&apos;/gi, "'")
    .replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)));
}
function asText(x: any): string {
  return decodeEntities(typeof x === "string" ? x : (x?.text ?? x?.name ?? "")).replace(/\s+/g, " ").trim();
}
// Find the first Recipe node in a JSON-LD value (object, array, or {@graph:[…]}).
function findRecipeNode(node: any): any {
  if (!node) return null;
  if (Array.isArray(node)) { for (const n of node) { const r = findRecipeNode(n); if (r) return r; } return null; }
  if (typeof node === "object") {
    const t = node["@type"];
    if (t === "Recipe" || (Array.isArray(t) && t.includes("Recipe"))) return node;
    if (node["@graph"]) return findRecipeNode(node["@graph"]);
  }
  return null;
}
function extractInstructions(ri: any): string[] {
  const out: string[] = [];
  const push = (x: any) => { const t = asText(x); if (t) out.push(t); };
  if (typeof ri === "string") return ri.split(/\r?\n/).map((s) => asText(s)).filter(Boolean);
  if (Array.isArray(ri)) {
    for (const step of ri) {
      if (step && step["@type"] === "HowToSection" && Array.isArray(step.itemListElement)) {
        for (const s of step.itemListElement) push(s);
      } else push(step);
    }
  }
  return out;
}
function parseServings(y: any): number | null {
  if (y == null) return null;
  const m = (Array.isArray(y) ? y.join(" ") : String(y)).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}
function nutritionFrom(n: any): any {
  if (!n || typeof n !== "object") return null;
  const numOf = (v: any) => { if (v == null) return null; const m = String(v).match(/[\d.]+/); return m ? Number(m[0]) : null; };
  const out = { calories: numOf(n.calories), protein: numOf(n.proteinContent), fat: numOf(n.fatContent), carbs: numOf(n.carbohydrateContent), fiber: numOf(n.fiberContent) };
  return Object.values(out).some((v) => v != null) ? out : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const apiKey = Deno.env.get("USDA_API_KEY");
  if (!apiKey) return json({ error: "USDA_API_KEY is not configured on the server." }, 500);

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Request body must be JSON." }, 400);
  }
  const { action, query, fdcId } = payload ?? {};

  try {
    // ---- Action: search ----------------------------------------------------
    if (action === "search") {
      if (!query || !String(query).trim()) return json({ error: "Missing search query." }, 400);
      const url =
        `${BASE}/foods/search?api_key=${apiKey}&query=${encodeURIComponent(query)}&pageSize=15`;
      const res = await fetch(url);
      if (!res.ok) return json({ error: `USDA search failed (${res.status}).` }, 502);
      const data = await res.json();
      const results = (data.foods ?? []).map((f: any) => ({
        fdcId: f.fdcId,
        description: f.description,
        dataType: f.dataType,
        brandOwner: f.brandOwner || f.brandName || null,
      }));
      return json({ results });
    }

    // ---- Action: importRecipe (NYT Cooking) -------------------------------
    // Server-side fetch (avoids CORS + the bot-block) + schema.org/Recipe JSON-LD extract.
    // "blocked: true" (status 200, no `error` key) tells the client to offer the paste fallback.
    if (action === "importRecipe") {
      const targetUrl = String(payload?.url ?? "").trim();
      let host = "";
      try { host = new URL(targetUrl).hostname; } catch { return json({ error: "Enter a valid recipe URL." }, 400); }
      if (!/(^|\.)cooking\.nytimes\.com$/i.test(host)) {
        return json({ error: "Only cooking.nytimes.com URLs are supported." }, 400);
      }
      let page: Response;
      try {
        page = await fetch(targetUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9",
            "Accept-Language": "en-US,en;q=0.9",
          },
          redirect: "follow",
        });
      } catch (_e) {
        return json({ blocked: true, message: "Couldn't reach NYT Cooking from the server." });
      }
      if (!page.ok) {
        return json({ blocked: true, message: `NYT Cooking returned ${page.status}${page.status === 403 ? " (blocked the request)" : ""}.` });
      }
      const html = await page.text();
      const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
      let recipe: any = null;
      for (const b of blocks) {
        try { recipe = findRecipeNode(JSON.parse(b[1].trim())); if (recipe) break; } catch { /* skip malformed block */ }
      }
      if (!recipe) {
        return json({ blocked: true, message: "No recipe data found on that page (it may be gated). Use the paste option." });
      }
      const ingredients = (recipe.recipeIngredient ?? recipe.ingredients ?? []).map(asText).filter(Boolean);
      return json({
        title: asText(recipe.name),
        yieldServings: parseServings(recipe.recipeYield),
        ingredients,
        steps: extractInstructions(recipe.recipeInstructions),
        nutritionPerServing: nutritionFrom(recipe.nutrition),
        sourceUrl: targetUrl,
      });
    }

    // ---- Action: fetchNutrients -------------------------------------------
    if (action === "fetchNutrients") {
      if (!fdcId) return json({ error: "Missing fdcId." }, 400);

      // USDA's search index sometimes returns fdcIds whose detail record 404s on
      // /food/{id}. Try the single endpoint, then fall back to the batch endpoint.
      let food: any = null;
      const single = await fetch(`${BASE}/food/${fdcId}?api_key=${apiKey}`);
      if (single.ok) {
        food = await single.json();
      } else if (single.status === 404) {
        const plural = await fetch(`${BASE}/foods?fdcIds=${fdcId}&api_key=${apiKey}`);
        if (plural.ok) {
          const arr = await plural.json();
          if (Array.isArray(arr) && arr[0] && arr[0].fdcId) food = arr[0];
        }
      } else {
        return json({ error: `USDA lookup failed (${single.status}).` }, 502);
      }

      // Genuinely no retrievable detail for this item — return a friendly,
      // non-error status so the client can guide the user to another result.
      if (!food || !food.fdcId) {
        return json({
          unavailable: true,
          error: "USDA has no detailed nutrition record for this item — please pick a different search result.",
        });
      }

      const list = food.foodNutrients ?? [];

      let calories = find(list, N.energyKcal);
      if (calories == null) {
        const kj = find(list, N.energyKj);
        if (kj != null) calories = kj / 4.184; // kJ -> kcal
      }
      let protein = find(list, N.protein);
      let fat = find(list, N.fat);
      let carbs = find(list, N.carbs);
      let fiber = find(list, N.fiber);
      let basis = "per_100g";

      // Branded fallback: derive per-100g from the nutrition label when the
      // per-100g foodNutrients are absent and we know the serving size in grams.
      if (calories == null && food.labelNutrients) {
        const ln = food.labelNutrients;
        const serv = Number(food.servingSize);
        const unit = String(food.servingSizeUnit || "").toLowerCase();
        const grams = ["g", "gram", "grams"].includes(unit) ? serv : null;
        const scale = grams && grams > 0 ? 100 / grams : null;
        const pick = (k: string) => (ln?.[k]?.value ?? null);
        if (scale) {
          const s = (v: number | null) => (v == null ? null : v * scale);
          calories = s(pick("calories"));
          protein = s(pick("protein"));
          fat = s(pick("fat"));
          carbs = s(pick("carbohydrates"));
          fiber = s(pick("fiber"));
          basis = "per_100g_from_label";
        } else {
          basis = "label_unknown_serving_grams"; // caller should treat as low-confidence
        }
      }

      const round = (v: number | null) => (v == null ? 0 : Math.round(v * 100) / 100);
      return json({
        name: food.description,
        usda_fdc_id: food.fdcId,
        data_type: food.dataType ?? null,
        brand_owner: food.brandOwner || food.brandName || null,
        serving_size: food.servingSize ?? null,
        serving_size_unit: food.servingSizeUnit ?? null,
        basis, // 'per_100g' | 'per_100g_from_label' | 'label_unknown_serving_grams'
        calories: round(calories),
        protein: round(protein),
        fat: round(fat),
        carbs: round(carbs),
        fiber: round(fiber),
      });
    }

    return json({ error: "Unknown action. Use 'search' or 'fetchNutrients'." }, 400);
  } catch (err) {
    return json({ error: (err as Error)?.message ?? "Unexpected error." }, 500);
  }
});
