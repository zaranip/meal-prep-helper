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

    // ---- Action: fetchNutrients -------------------------------------------
    if (action === "fetchNutrients") {
      if (!fdcId) return json({ error: "Missing fdcId." }, 400);
      const res = await fetch(`${BASE}/food/${fdcId}?api_key=${apiKey}`);
      if (!res.ok) return json({ error: `USDA lookup failed (${res.status}).` }, 502);
      const food = await res.json();
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
