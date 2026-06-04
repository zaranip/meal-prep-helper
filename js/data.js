/* Data layer: ingredient macros, recipes, week templates, and shared app state.
   Loaded first so every other script can read these globals. */
// INGREDIENTS MACRO DATABASE (per standard unit size)
        const ingredientDB = {
            'sola blueberry bagel': { cal: 120, prot: 15, fat: 3.5, fib: 28.0, carb: 34.0, conversions: { bagel: 1, g: 85, oz: 3.0, tbsp: 8.5, 'whole bagel': 1 } },
            'kirkland liquid egg whites': { cal: 50, prot: 10.8, fat: 0, fib: 0, carb: 0.8, conversions: { g: 100, mL: 100, oz: 3.5, tbsp: 6.7, cup: 0.42 } },
            'low-fat cottage cheese (2%)': { cal: 25, prot: 3.5, fat: 0.7, fib: 0, carb: 1.5, conversions: { g: 30, tbsp: 2, tsp: 6, cup: 0.12 } },
            'avocado oil spray': { cal: 9, prot: 0, fat: 1.0, fib: 0, carb: 0, conversions: { spray: 1, g: 1 } },
            'white rice (uncooked)': { cal: 45, prot: 0.9, fat: 0.1, fib: 0.3, carb: 10.0, conversions: { tbsp: 1, g: 12.5, tsp: 3.0, cup: 0.08 } },
            'black rice (uncooked)': { cal: 43, prot: 0.9, fat: 0.3, fib: 1.0, carb: 9.0, conversions: { tbsp: 1, g: 12.5, tsp: 3.0, cup: 0.08 } },
            // Brami pasta (Costco). cal + protein CONFIRMED by Zara (200 cal / 12g protein per 2oz dry = 56.7g).
            // fat/fib/carb are ESTIMATES — please confirm from the box so the rice<->pasta swap keeps macros honest.
            'brami pasta': { cal: 200, prot: 12.0, fat: 2.5, fib: 6.0, carb: 34.0, conversions: { g: 56.7, oz: 2 } },
            'shelled edamame': { cal: 122, prot: 11.0, fat: 5.0, fib: 5.0, carb: 10.0, conversions: { g: 100, oz: 3.5, tbsp: 6.7, cup: 0.7 } },
            'button mushrooms': { cal: 22, prot: 3.1, fat: 0.3, fib: 1.0, carb: 3.3, conversions: { g: 100, oz: 3.5, cup: 1.4 } },
            'broccoli florets': { cal: 34, prot: 2.8, fat: 0.4, fib: 2.6, carb: 6.6, conversions: { g: 100, oz: 3.5, cup: 1.1 } },
            'carrots': { cal: 41, prot: 0.9, fat: 0.2, fib: 2.8, carb: 9.6, conversions: { g: 100, oz: 3.5, cup: 0.8 } },
            'red onion': { cal: 40, prot: 1.1, fat: 0.1, fib: 1.7, carb: 9.3, conversions: { large: 1, g: 150, oz: 5.3 } },
            'garlic': { cal: 4, prot: 0.2, fat: 0, fib: 0.1, carb: 1.0, conversions: { cloves: 1, g: 3 } },
            'sesame cooking oil': { cal: 40, prot: 0, fat: 4.5, fib: 0, carb: 0, conversions: { tsp: 1, g: 4.5, tbsp: 0.33, mL: 5 } },
            'gochujang': { cal: 35, prot: 1.0, fat: 0.3, fib: 0.5, carb: 7.0, conversions: { tbsp: 1, g: 15, tsp: 3.0 } },
            'coconut aminos': { cal: 25, prot: 0.5, fat: 0, fib: 0, carb: 6.0, conversions: { tbsp: 1, g: 15, mL: 15 } },
            'extra firm tofu': { cal: 83, prot: 9.8, fat: 4.3, fib: 1.2, carb: 2.5, conversions: { g: 100, oz: 3.5, blocks: 0.4 } },
            'soy sauce': { cal: 10, prot: 1.3, fat: 0, fib: 0.1, carb: 1.0, conversions: { tbsp: 1, g: 15, mL: 15 } },
            'neutral cooking oil': { cal: 120, prot: 0, fat: 14.0, fib: 0, carb: 0, conversions: { tbsp: 1, g: 14, tsp: 3, mL: 15 } },
            'plain nonfat greek yogurt': { cal: 57, prot: 10.3, fat: 0.4, fib: 0, carb: 3.6, conversions: { g: 100, oz: 3.5, cup: 0.4 } },
            'medium eggs': { cal: 70, prot: 6.0, fat: 5.0, fib: 0, carb: 0.6, conversions: { whole: 1, g: 50 } },
            'all-purpose flour': { cal: 364, prot: 10.0, fat: 1.0, fib: 2.7, carb: 76.0, conversions: { g: 100, oz: 3.5, cup: 0.8 } },
            'vanilla protein powder (e.g. pe science)': { cal: 120, prot: 24.0, fat: 1.5, fib: 1.0, carb: 3.0, conversions: { g: 31, scoops: 1 } },
            'oat flour': { cal: 389, prot: 16.0, fat: 7.0, fib: 10.0, carb: 66.0, conversions: { g: 100, cup: 1.1, tbsp: 11 } },
            'granular swerve sweetener': { cal: 0, prot: 0, fat: 0, fib: 0, carb: 100, conversions: { g: 100, cup: 0.5 } },
            'baking soda': { cal: 0, prot: 0, fat: 0, fib: 0, carb: 0, conversions: { g: 1, tsp: 0.16 } },
            'salt': { cal: 0, prot: 0, fat: 0, fib: 0, carb: 0, conversions: { g: 1, tsp: 0.16 } },
            'chocolate chips': { cal: 50, prot: 0.5, fat: 3.0, fib: 0.5, carb: 6.5, conversions: { g: 10, tbsp: 0.7 } },
            'shiitake mushrooms': { cal: 34, prot: 2.2, fat: 0.5, fib: 2.5, carb: 6.8, conversions: { g: 100, cup: 1.2 } },
            'doubanjiang': { cal: 15, prot: 0.5, fat: 0.3, fib: 0.5, carb: 2.0, conversions: { tbsp: 1, g: 15 } },
            'sichuan peppercorns': { cal: 5, prot: 0.1, fat: 0.1, fib: 0.5, carb: 1.0, conversions: { tsp: 1, g: 3 } },
            'ginger': { cal: 2, prot: 0, fat: 0, fib: 0.1, carb: 0.4, conversions: { inch: 1, g: 6 } },
            'oyster sauce': { cal: 15, prot: 0.2, fat: 0, fib: 0, carb: 3.5, conversions: { tbsp: 1, g: 15 } },
            'cornstarch': { cal: 30, prot: 0, fat: 0, fib: 0.1, carb: 7.0, conversions: { tbsp: 1, g: 8 } },
            'chocolate protein powder': { cal: 120, prot: 24.0, fat: 1.5, fib: 1.0, carb: 3.0, conversions: { g: 31, scoops: 1 } },
            'fat-free vanilla greek yogurt': { cal: 57, prot: 10.3, fat: 0.4, fib: 0, carb: 3.6, conversions: { g: 100, cup: 0.4 } },
            'dark cocoa powder': { cal: 25, prot: 2.0, fat: 1.5, fib: 3.0, carb: 5.5, conversions: { g: 10, tbsp: 1.3 } },
            'large eggs': { cal: 70, prot: 6.0, fat: 5.0, fib: 0, carb: 0.6, conversions: { whole: 1, g: 50 } },
            '0% nonfat greek yogurt': { cal: 130, prot: 24.0, fat: 0, fib: 0, carb: 9.0, conversions: { cup: 1, g: 240 } },
            'vanilla whey protein powder': { cal: 120, prot: 24.0, fat: 1.5, fib: 1.0, carb: 3.0, conversions: { scoops: 1, g: 31 } },
            'baking powder': { cal: 0, prot: 0, fat: 0, fib: 0, carb: 1.1, conversions: { tsp: 1, g: 4 } },
            'monk fruit sweetener': { cal: 0, prot: 0, fat: 0, fib: 0, carb: 100, conversions: { cup: 1, g: 200 } },
            'high-protein bread (90 cals/slice)': { cal: 90, prot: 9.0, fat: 1.0, fib: 5.0, carb: 12.0, conversions: { slices: 1 } },
            'low-calorie bread (for crumbs)': { cal: 30, prot: 2.0, fat: 0, fib: 3.0, carb: 5.0, conversions: { slices: 1 } },
            'whole eggs (egg wash + tamagoyaki)': { cal: 70, prot: 6.0, fat: 5.0, fib: 0, carb: 0.6, conversions: { whole: 1, g: 50 } },
            'smart balance light butter': { cal: 25, prot: 0, fat: 2.8, fib: 0, carb: 0, conversions: { tsp: 1, g: 5 } },
            'fresh spinach': { cal: 7, prot: 0.9, fat: 0.1, fib: 0.7, carb: 1.1, conversions: { cups: 1, g: 30 } },
            'heinz sugar-free ketchup': { cal: 5, prot: 0, fat: 0, fib: 0, carb: 1.0, conversions: { tbsp: 1, g: 15 } },
            'russet potato (diced)': { cal: 110, prot: 3.0, fat: 0.1, fib: 2.0, carb: 26.0, conversions: { medium: 1, g: 150 } },
            'carrot (diced)': { cal: 25, prot: 0.5, fat: 0.1, fib: 1.7, carb: 6.0, conversions: { medium: 1, g: 61 } },
            'japanese curry roux cube': { cal: 90, prot: 1.0, fat: 6.0, fib: 0.5, carb: 8.0, conversions: { cube: 1, g: 18 } },
            'almond flour': { cal: 40, prot: 1.5, fat: 3.5, fib: 0.5, carb: 1.5, conversions: { tbsp: 1, g: 7 } },
            'fresh cilantro': { cal: 4, prot: 0.1, fat: 0, fib: 0.1, carb: 0.5, conversions: { bunch: 1, g: 40 } },
            'jalapeño peppers': { cal: 4, prot: 0.1, fat: 0, fib: 0.4, carb: 0.9, conversions: { whole: 1, g: 14 } },
            'olive oil': { cal: 120, prot: 0, fat: 14.0, fib: 0, carb: 0, conversions: { tbsp: 1, g: 14, mL: 15 } },
            'chopped mixed vegetables': { cal: 25, prot: 1.0, fat: 0.1, fib: 2.0, carb: 5.0, conversions: { cups: 1, g: 150 } },
            'parmesan cheese (grated)': { cal: 110, prot: 9.0, fat: 7.0, fib: 0, carb: 1.0, conversions: { cup: 0.25, g: 20 } },
            'white onion (sliced)': { cal: 10, prot: 0.3, fat: 0, fib: 0.4, carb: 2.3, conversions: { whole: 0.25, g: 25 } },
            'low-sodium soy sauce': { cal: 10, prot: 1.3, fat: 0, fib: 0.1, carb: 1.0, conversions: { tbsp: 1, g: 15, mL: 15 } },
            'garlic & ginger': { cal: 4, prot: 0.2, fat: 0, fib: 0.1, carb: 1.0, conversions: { 'cloves/1-inch knob': 1, g: 5 } },
            'vegetable broth': { cal: 15, prot: 0.5, fat: 0, fib: 0.1, carb: 3.0, conversions: { Liter: 1, cup: 4 } },
            'uncooked jasmine rice (for powder)': { cal: 45, prot: 0.9, fat: 0.1, fib: 0.3, carb: 10.0, conversions: { tbsp: 1, g: 12.5 } },
            'lemongrass stem': { cal: 5, prot: 0.1, fat: 0, fib: 0.3, carb: 1.2, conversions: { whole: 1, g: 10 } },
            'shallot': { cal: 7, prot: 0.2, fat: 0, fib: 0.3, carb: 1.7, conversions: { whole: 1, g: 10 } },
            'lime juice': { cal: 4, prot: 0, fat: 0, fib: 0, carb: 1.3, conversions: { tbsp: 1, g: 15, mL: 15 } },
            'brown sugar': { cal: 15, prot: 0, fat: 0, fib: 0, carb: 4.0, conversions: { tbsp: 1, g: 4 } },
            'sesame/peanut oil': { cal: 120, prot: 0, fat: 14.0, fib: 0, carb: 0, conversions: { tbsp: 1, g: 14, mL: 15 } },
            'fresh herbs (mint/thai basil)': { cal: 5, prot: 0.2, fat: 0, fib: 0.5, carb: 1.0, conversions: { cup: 1, g: 25 } },
            'unsweetened cocoa powder': { cal: 20, prot: 1.5, fat: 1.2, fib: 2.5, carb: 4.5, conversions: { tbsp: 1, g: 7 } },
            'whey protein powder': { cal: 120, prot: 24.0, fat: 1.5, fib: 1.0, carb: 3.0, conversions: { tbsp: 1, g: 10 } },
            'dark chocolate chips': { cal: 35, prot: 0.3, fat: 2.0, fib: 0.3, carb: 4.5, conversions: { tsp: 1, g: 7 } },
            'sugar-free syrup': { cal: 10, prot: 0, fat: 0, fib: 0, carb: 2.5, conversions: { tbsp: 1, g: 15 } },
            'unsweetened almond milk': { cal: 30, prot: 1.0, fat: 2.5, fib: 1.0, carb: 1.0, conversions: { tbsp: 1, g: 15 } },
            'carrot stick bags': { cal: 20, prot: 0.25, fat: 0, fib: 2.0, carb: 4.5, conversions: { bags: 1, g: 85 } },

            // --- Added macro data (pulled June 2026). Whole foods/spices: USDA FoodData Central per 100 g.
            //     Branded items sourced from product labels: Fairlife 2% chocolate milk, gluten-free Oreos.
            //     Garam masala blends vary widely (~100-500 kcal/100g); a mid-range value is used (it's a trace amount per serving).
            'fingerling potatoes': { cal: 77, prot: 2.0, fat: 0.1, fib: 2.2, carb: 17.5, conversions: { g: 100, oz: 3.5, cup: 0.65 } },
            'yellow onion (diced)': { cal: 40, prot: 1.1, fat: 0.1, fib: 1.7, carb: 9.3, conversions: { g: 100, medium: 0.91, cup: 0.63 } },
            'poblano pepper (chopped)': { cal: 20, prot: 1.0, fat: 0.2, fib: 2.0, carb: 6.0, conversions: { g: 100, whole: 2.22, cup: 0.67 } },
            'whole peeled tomatoes (canned)': { cal: 20, prot: 1.0, fat: 0.2, fib: 1.0, carb: 4.5, conversions: { g: 100, oz: 3.5, cup: 0.42 } },
            'fresh ginger': { cal: 80, prot: 1.8, fat: 0.8, fib: 2.0, carb: 18.0, conversions: { g: 100, tbsp: 16.7, tsp: 50, inch: 16.7 } },
            'fresh mint (chopped)': { cal: 70, prot: 3.8, fat: 0.9, fib: 8.0, carb: 14.9, conversions: { g: 100, tbsp: 50, cup: 5.3 } },
            'fresh cilantro or basil': { cal: 23, prot: 2.1, fat: 0.5, fib: 2.8, carb: 3.7, conversions: { g: 100, tbsp: 100, cup: 6.25 } },
            'ground cumin': { cal: 375, prot: 17.8, fat: 22.3, fib: 10.5, carb: 44.2, conversions: { g: 100, tsp: 47.6, tbsp: 15.9 } },
            'ground coriander': { cal: 298, prot: 12.4, fat: 17.8, fib: 41.9, carb: 55.0, conversions: { g: 100, tsp: 55.6, tbsp: 18.5 } },
            'garam masala': { cal: 350, prot: 14.0, fat: 15.0, fib: 25.0, carb: 45.0, conversions: { g: 100, tsp: 43.5, tbsp: 14.5 } },
            'sesame oil': { cal: 884, prot: 0, fat: 100.0, fib: 0, carb: 0, conversions: { g: 100, tsp: 22.2, tbsp: 7.4, mL: 108 } },
            'cooking spray': { cal: 5, prot: 0, fat: 0.6, fib: 0, carb: 0, conversions: { 'light coat': 1, spray: 1, g: 1 } },
            'sea salt': { cal: 0, prot: 0, fat: 0, fib: 0, carb: 0, conversions: { pinch: 1, g: 0.36, tsp: 0.16 } },
            'kosher salt & black pepper': { cal: 0, prot: 0, fat: 0, fib: 0, carb: 0, conversions: { 'to taste': 1, g: 1, tsp: 0.16 } },
            'fairlife 2% chocolate milk': { cal: 140, prot: 13.0, fat: 4.5, fib: 1.0, carb: 13.0, conversions: { cup: 1, g: 240, mL: 240, tbsp: 16 } },
            'gluten-free oreos (optional mix-in)': { cal: 53, prot: 0.3, fat: 2.3, fib: 0.3, carb: 8.3, conversions: { cookies: 1, g: 11.3 } }
        };

        // RECIPE MASTER DATA STORE (Base values represent 1.0x target plan portion)
        const recipes = {
            bagel: {
                id: 'bagel',
                title: 'Blueberry Breakfast Bagel Sandwich',
                desc: 'A fiber-packed delicious Sola Blueberry Bagel sandwich featuring waffled liquid egg whites and Greek cottage cheese shmear.',
                type: 'Breakfast',
                week: [1, 2],
                baseMacros: { cal: 205, prot: 31.5, fat: 4.2, fib: 28.0, carb: 36.5 },
                ingredients: [
                    { name: 'Sola Blueberry Bagel', amount: 1, unit: 'bagel' },
                    { name: 'Kirkland Liquid Egg Whites', amount: 120, unit: 'g' },
                    { name: 'Low-Fat Cottage Cheese (2%)', amount: 30, unit: 'g' },
                    { name: 'Avocado oil spray', amount: 1, unit: 'quick spray' }
                ],
                steps: [
                    'Preheat mini waffle maker. Coat top and bottom grids with avocado oil spray.',
                    'Measure out exactly 120g of liquid egg whites.',
                    'Slowly pour egg whites onto bottom grid, ensuring it does not overflow.',
                    'Close and let cook undisturbed for 2-3 minutes until set and steam slows.',
                    'Toast your Sola Blueberry Bagel. Spread cottage cheese evenly on both sides.',
                    'Assemble waffled egg white patty into Sola Blueberry Bagel and enjoy immediately.'
                ],
                freezerTips: 'Wrap Sola Blueberry Bagels and cooked waffled egg white patties separately in airtight plastic wrap. Toast the bagel straight from frozen, and microwave the egg white patty on high for 30-45 seconds.'
            },
            vegStirfry: {
                id: 'vegStirfry',
                title: 'Vegetable & Egg White Stir Fry',
                desc: 'A high-volume lunch stir-fry packed with edamame, fresh broccoli, and onions, served with your real white/black rice mixture. Sized at 0.65x portion to fit your deficit target.',
                type: 'Lunch',
                week: [1],
                baseMacros: { cal: 765, prot: 73.0, fat: 18.0, fib: 15.6, carb: 58.0 },
                ingredients: [
                    { name: 'White Rice (Uncooked)', amount: 1.95, unit: 'tbsp' },
                    { name: 'Black Rice (Uncooked)', amount: 0.975, unit: 'tbsp' },
                    { name: 'Kirkland Liquid Egg Whites', amount: 325, unit: 'g' },
                    { name: 'Shelled Edamame', amount: 195, unit: 'g' },
                    { name: 'Button Mushrooms', amount: 130, unit: 'g' },
                    { name: 'Broccoli Florets', amount: 130, unit: 'g' },
                    { name: 'Carrots', amount: 65, unit: 'g' },
                    { name: 'Red Onion', amount: 0.3, unit: 'large' },
                    { name: 'Garlic', amount: 2, unit: 'cloves' },
                    { name: 'Sesame Cooking Oil', amount: 2.0, unit: 'tsp' },
                    { name: 'Gochujang', amount: 1.3, unit: 'tbsp' },
                    { name: 'Coconut Aminos', amount: 1.3, unit: 'tbsp' }
                ],
                steps: [
                    'Cook the scaled white and black rice mixture together in a small pot or rice cooker on Sunday.',
                    'In your largest wok, sauté the chopped mushrooms, garlic, and onions with sesame oil until fragrant and caramelized.',
                    'Add broccoli, chopped carrots, and 3 tbsp of water. Cover and let steam for 4 minutes.',
                    'Toss in edamame and continue cooking on high heat.',
                    'In a separate non-stick skillet, scramble your egg whites in batches until they form firm curds.',
                    'Mix Gochujang and coconut aminos. Combine the firm curds with the vegetable base, drizzle the sauce, and toss on high for 2 minutes.'
                ],
                freezerTips: 'Freeze in solid plastic meal prep containers for up to 3 months. To reheat, microwave directly from frozen on medium-high for 3 minutes, stir, and microwave for another 1-2 minutes until steaming.'
            },
            tofuStirfry: {
                id: 'tofuStirfry',
                title: 'Tofu & Egg White Stir-Fry',
                desc: 'An ultimate zero-waste high-volume dinner utilizing firm extra-firm tofu chunks, veggies, and egg whites. Sized at 0.85x portion to hit fat and calorie deficit thresholds.',
                type: 'Dinner',
                week: [1],
                baseMacros: { cal: 662, prot: 54.1, fat: 22.0, fib: 6.0, carb: 31.0 },
                ingredients: [
                    { name: 'White Rice (Uncooked)', amount: 2.55, unit: 'tbsp' },
                    { name: 'Black Rice (Uncooked)', amount: 1.275, unit: 'tbsp' },
                    { name: 'Extra Firm Tofu', amount: 340, unit: 'g' },
                    { name: 'Kirkland Liquid Egg Whites', amount: 425, unit: 'g' },
                    { name: 'Shelled Edamame', amount: 170, unit: 'g' },
                    { name: 'Broccoli Florets', amount: 170, unit: 'g' },
                    { name: 'Gochujang', amount: 1.7, unit: 'tbsp' },
                    { name: 'Soy Sauce', amount: 1.7, unit: 'tbsp' },
                    { name: 'Neutral Cooking Oil', amount: 1.25, unit: 'tbsp' }
                ],
                steps: [
                    'Cook white and black rice blend together.',
                    'Drain and pat dry extra-firm tofu. Sauté the tofu cubes in a large wok with oil until golden brown.',
                    'In corporate the broccoli and edamame. Sauté on medium with a splash of water, then cover and steam for 3 minutes.',
                    'Push vegetables to the sides. Pour egg whites in the center; cook and scramble until firm.',
                    'Combine Gochujang and soy sauce, pour over the mixture, and toss on high heat for 2 minutes to glaze.'
                ],
                freezerTips: 'Freezing extra-firm tofu gives it a highly enjoyable sponge-like, chewy texture. Store prepped bowls in the freezer. To reheat, microwave with a damp paper towel on top to retain maximum moisture.'
            },
            blondies: {
                id: 'blondies',
                title: '9x13" Pan Protein Blondies',
                desc: 'A dense high-protein vanilla choc-chip blondie baked in a standard 9x13 pan. Sliced into exactly 24 even 2x2" squares (eat 1 daily).',
                type: 'Dessert',
                week: [1, 3],
                baseMacros: { cal: 88, prot: 9.6, fat: 1.8, fib: 1.0, carb: 9.3 },
                ingredients: [
                    { name: 'Plain Nonfat Greek Yogurt', amount: 14.1, unit: 'g' },
                    { name: 'Medium Eggs', amount: 0.125, unit: 'whole' },
                    { name: 'Kirkland Liquid Egg Whites', amount: 6, unit: 'mL' },
                    { name: 'All-Purpose Flour', amount: 7.5, unit: 'g' },
                    { name: 'Vanilla Protein Powder (e.g. PE Science)', amount: 3.9, unit: 'g' },
                    { name: 'Oat Flour', amount: 3.75, unit: 'g' },
                    { name: 'Granular Swerve Sweetener', amount: 12, unit: 'g' },
                    { name: 'Baking Soda', amount: 0.5, unit: 'g' },
                    { name: 'Salt', amount: 0.125, unit: 'g' },
                    { name: 'Chocolate Chips', amount: 2.6, unit: 'g' }
                ],
                steps: [
                    'Tip: Enter 24 servings in the multiplier to see the exact ingredients needed for a full 9x13" pan!',
                    'Preheat oven to 350°F (175°C). Line a standard 9x13" baking pan with parchment paper.',
                    'Whisk together yogurt, whole eggs, liquid egg whites, and vanilla extract.',
                    'In a separate bowl, whisk all-purpose flour, protein powder, oat flour, Swerve, baking soda, and salt.',
                    'Combine wet and dry bases. Mix thoroughly with a spatula to form a thick uniform batter, then fold in chocolate chips.',
                    'Spread evenly in the pan and bake for 22-25 minutes. Cool completely and slice into exactly 24 squares (6x4 grid).'
                ],
                scalingTip: 'Scale to 24x to output ingredients for exactly 1 full 9x13" pan.',
                freezerTips: 'Once completely cooled, wrap individual 2x2" squares tightly in plastic wrap. Freeze in a single layer. They thaw perfectly at room temperature in 10-15 minutes or inside your lunchbox by mid-day.'
            },
            mapoTofu: {
                id: 'mapoTofu',
                title: 'Vegetarian Mapo Tofu',
                desc: 'A high-volume Sichuan classic utilizing minced shiitakes, firm tofu, and a silky egg white base.',
                type: 'Lunch',
                week: [2],
                baseMacros: { cal: 757, prot: 61.5, fat: 25.0, fib: 9.0, carb: 37.8 },
                ingredients: [
                    { name: 'White Rice (Uncooked)', amount: 3, unit: 'tbsp' },
                    { name: 'Black Rice (Uncooked)', amount: 1.5, unit: 'tbsp' },
                    { name: 'Extra Firm Tofu', amount: 400, unit: 'g' },
                    { name: 'Kirkland Liquid Egg Whites', amount: 500, unit: 'g' },
                    { name: 'Shiitake Mushrooms', amount: 200, unit: 'g' },
                    { name: 'Doubanjiang', amount: 2, unit: 'tbsp' },
                    { name: 'Sichuan Peppercorns', amount: 1, unit: 'tsp' },
                    { name: 'Sesame Oil', amount: 2, unit: 'tsp' },
                    { name: 'Soy Sauce', amount: 1, unit: 'tbsp' },
                    { name: 'Garlic', amount: 3, unit: 'cloves' },
                    { name: 'Ginger', amount: 1, unit: 'inch' }
                ],
                steps: [
                    'Cook your white and black rice blend.',
                    'Sauté minced mushrooms, garlic, and ginger with sesame oil until browned and highly fragrant.',
                    'Add Doubanjiang and crushed Sichuan peppercorns, cooking for 30 seconds to release aromatic red oils.',
                    'Push mushrooms to the side, pour in egg whites, let them set into firm curds, and scramble.',
                    'Fold in your cubed extra-firm tofu and soy sauce mixed with 1/2 cup of water. Simmer on high until thickened.'
                ],
                freezerTips: 'The spicy bean paste (Doubanjiang) and Sichuan peppercorns freeze exceptionally well without losing depth. Pack tightly into small flat containers. Microwave from frozen for 2.5 minutes on medium-high.'
            },
            silkyTofu: {
                id: 'silkyTofu',
                title: 'Soft Tofu with Silky Egg Sauce',
                desc: 'Air-fried extra-firm tofu cubes layered over a rich, soft-stirred egg white vegetable sauce. Sized at 0.9x portion.',
                type: 'Dinner',
                week: [2],
                baseMacros: { cal: 684, prot: 57.1, fat: 22.3, fib: 7.2, carb: 36.0 },
                ingredients: [
                    { name: 'White Rice (Uncooked)', amount: 2.7, unit: 'tbsp' },
                    { name: 'Black Rice (Uncooked)', amount: 1.35, unit: 'tbsp' },
                    { name: 'Extra Firm Tofu', amount: 360, unit: 'g' },
                    { name: 'Kirkland Liquid Egg Whites', amount: 450, unit: 'g' },
                    { name: 'Shiitake Mushrooms', amount: 180, unit: 'g' },
                    { name: 'Soy Sauce', amount: 3.6, unit: 'tbsp' },
                    { name: 'Oyster Sauce', amount: 3.6, unit: 'tbsp' },
                    { name: 'Cornstarch', amount: 0.9, unit: 'tbsp' },
                    { name: 'Sesame Oil', amount: 1.5, unit: 'tsp' },
                    { name: 'Garlic', amount: 5, unit: 'cloves' },
                    { name: 'Ginger', amount: 1, unit: 'inch' }
                ],
                steps: [
                    'Air-fry the cubed extra-firm tofu at 400°F (200°C) for 12-15 minutes until golden.',
                    'Cook your white/black rice mixture.',
                    'Sauté sliced mushrooms, garlic, and ginger in a large pan with a splash of water and sesame oil.',
                    'Push vegetables to the side. Pour in egg whites, stirring constantly to mimic soft, velvety silky scrambled curds.',
                    'Whisk soy sauce, oyster sauce, cornstarch, and water together. Pour over the eggs, add tofu cubes, and simmer until glazed.'
                ],
                freezerTips: 'Make sure to let the dish cool 100% to room temp before sealing to prevent condensation-induced ice crystals. If reheating at work, stir midway to recombine the velvety cornstarch slurry.'
            },
            pudding: {
                id: 'pudding',
                title: 'Double Chocolate Protein Pudding',
                desc: 'A rich chocolate post-workout snack utilizing fat-free Greek yogurt and high quality cocoa. Rounded to 0.25x portion.',
                type: 'Dessert',
                week: [2],
                baseMacros: { cal: 74, prot: 11.0, fat: 1.8, fib: 0.5, carb: 3.5 },
                ingredients: [
                    { name: 'Chocolate Protein Powder', amount: 7.75, unit: 'g' },
                    { name: 'Fat-Free Vanilla Greek Yogurt', amount: 37.5, unit: 'g' },
                    { name: 'Dark Cocoa Powder', amount: 6.25, unit: 'g' },
                    { name: 'Chocolate Chips', amount: 1.75, unit: 'g' },
                    { name: 'Sea Salt', amount: 0.1, unit: 'pinch' }
                ],
                steps: [
                    'Add all dry ingredients (protein powder, dark cocoa, pinch of sea salt) into a small jar or bowl.',
                    'Whisk together with the fat-free vanilla Greek yogurt until smooth and lump-free.',
                    'Cover and store in the refrigerator to allow the cocoa powder to fully hydrate for 15 minutes before serving.',
                    'Top with chocolate chips and enjoy.'
                ],
                freezerTips: 'Due to the dairy base, do not freeze this dish solid as it will split. Instead, store it tightly in small jars inside the refrigerator. It stays completely fresh and smooth for up to 5 days.'
            },
            pancakes: {
                id: 'pancakes',
                title: 'Protein Pancakes',
                desc: 'A clean low-fat breakfast utilizing whole eggs, Greek yogurt, and high quality vanilla whey. Sized at 0.5x portion.',
                type: 'Breakfast',
                week: [3],
                baseMacros: { cal: 183, prot: 28.0, fat: 5.0, fib: 1.0, carb: 5.5 },
                ingredients: [
                    { name: 'Large Eggs', amount: 1, unit: 'whole' },
                    { name: '0% Nonfat Greek Yogurt', amount: 0.25, unit: 'cup' },
                    { name: 'Vanilla Whey Protein Powder', amount: 1, unit: 'scoop' },
                    { name: 'Baking Powder', amount: 0.5, unit: 'tsp' },
                    { name: 'Monk Fruit Sweetener', amount: 0.25, unit: 'cup' }
                ],
                steps: [
                    'Whisk eggs and nonfat Greek yogurt together in a medium bowl until smooth.',
                    'Fold in whey protein, baking powder, and monk fruit sweetener.',
                    'Heat a non-stick griddle over medium-low heat. Spray with light oil spray.',
                    'Spoon small dollops of batter onto the hot surface. Cook until bubbles form around the edges.',
                    'Carefully flip and cook for an additional minute until fluffy and fully set.'
                ],
                freezerTips: 'Stack cooked pancakes with sheets of parchment paper in between to prevent sticking. Seal in a freezer bag. Pop frozen pancakes straight into a toaster on a medium setting for a quick hot breakfast!'
            },
            curryLunch: {
                id: 'curryLunch',
                title: 'Curry Bread Pocket Bento Box',
                desc: 'A complete lunch system featuring two waffled curry bread pockets (4 slices of high-protein bread, with spinach folded into the filling) and a Tamagoyaki side.',
                type: 'Lunch',
                week: [3],
                // 2 full pockets from 4 high-protein bread slices: crusts trimmed off for the breadcrumbs, centers used for the pockets.
                // Spinach folded into the pocket filling and the light butter removed (-31 kcal); potatoes already pulled back earlier.
                baseMacros: { cal: 778, prot: 80.1, fat: 26.1, fib: 21.8, carb: 66.6 },
                ingredients: [
                    { name: 'High-Protein Bread (90 cals/slice)', amount: 4, unit: 'slices' },
                    { name: 'Whole Eggs (egg wash + tamagoyaki)', amount: 3.75, unit: 'whole' },
                    { name: 'Fresh Spinach', amount: 2.5, unit: 'cups' },
                    { name: 'Heinz Sugar-Free Ketchup', amount: 1.25, unit: 'tbsp' },
                    { name: 'Russet Potato (Diced)', amount: 0.15, unit: 'medium' },
                    { name: 'Carrot (Diced)', amount: 0.4, unit: 'medium' },
                    { name: 'Kirkland Liquid Egg Whites', amount: 190, unit: 'g' },
                    { name: 'Japanese Curry Roux Cube', amount: 0.4, unit: 'cube' }
                ],
                steps: [
                    'Trim the crusts/edges off the high-protein bread slices. Air-fry just the trimmed crusts at 300°F (150°C) until completely dry, then process them into breadcrumbs. Reserve the bread centers for the pockets.',
                    'Boil diced potato and carrot. Drain, then stir in the curry cube, fresh spinach, and liquid egg whites. Scramble over heat until the spinach wilts down and a thick, scoopable paste forms.',
                    'Divide the curry filling between the reserved bread centers (4 trimmed slices = 2 pockets), crimp each pocket shut, dip in egg wash, coat in the crust breadcrumbs, and air-fry raw at 350°F (175°C) until crispy.',
                    'Whisk whole eggs and cook layers in a pan, folding progressively into a log to form a classic Japanese Tamagoyaki.'
                ],
                freezerTips: 'Freeze Curry bread pockets RAW (before air frying). This prevents soggy structures. Air-fry from frozen at 350°F (175°C) for 10-12 minutes. Store cooked Tamagoyaki logs wrapped tightly, thaw in fridge.'
            },
            tofuPatties: {
                id: 'tofuPatties',
                title: 'Crispy Tofu Patties',
                desc: 'Air-fried edamame-tofu patties over scrambled egg whites, accompanied by a cilantro-jalapeno cream sauce. Sized at 1.25x portion.',
                type: 'Dinner',
                week: [3],
                baseMacros: { cal: 691, prot: 63.0, fat: 25.0, fib: 7.5, carb: 22.5 },
                ingredients: [
                    { name: 'Extra Firm Tofu', amount: 500, unit: 'g' },
                    { name: 'Kirkland Liquid Egg Whites', amount: 625, unit: 'g' },
                    { name: 'Shelled Edamame', amount: 187, unit: 'g' },
                    { name: '0% Nonfat Greek Yogurt', amount: 1.25, unit: 'cups' },
                    { name: 'Almond Flour', amount: 5, unit: 'tbsp' },
                    { name: 'Cornstarch', amount: 1.25, unit: 'tbsp' },
                    { name: 'Fresh Cilantro', amount: 1, unit: 'bunch' },
                    { name: 'Jalapeño Peppers', amount: 2, unit: 'whole' },
                    { name: 'Garlic', amount: 5, unit: 'cloves' }
                ],
                steps: [
                    'Drain tofu, press thoroughly, and mash together with edamame, almond flour, cornstarch, and 50g of egg whites.',
                    'Form into patties and air-fry at 375°F (190°C) for 10-12 minutes, flip, and air-fry for 5-8 more minutes.',
                    'Scramble the remaining egg whites in a skillet until fully set.',
                    'Blend Greek yogurt, cilantro, jalapeños, garlic, and a splash of lime juice until smooth and creamy.',
                    'Plate the crispy patties over the set egg-white scramble, drizzle with sauce, and enjoy.'
                ],
                freezerTips: 'Air-fry the patties fully before freezing. Store in airtight Ziplocs with parchment paper separating them. Reheat in an air fryer at 350°F (175°C) for 6 minutes to restore crispiness.'
            },
            frittata: {
                id: 'frittata',
                title: 'Egg White Veggie Frittata',
                desc: 'A dense skillet-baked egg white wedge loaded with roasted broccoli florets and mushrooms. Sized at 0.5x portion.',
                type: 'Breakfast',
                week: [4],
                baseMacros: { cal: 153, prot: 16.5, fat: 6.8, fib: 2.0, carb: 6.5 },
                ingredients: [
                    { name: 'Kirkland Liquid Egg Whites', amount: 227, unit: 'g' },
                    { name: 'Olive Oil', amount: 1, unit: 'tbsp' },
                    { name: 'Chopped Mixed Vegetables', amount: 2.5, unit: 'cups' },
                    { name: 'Parmesan Cheese (Grated)', amount: 0.25, unit: 'cup' },
                    { name: 'White Onion (Sliced)', amount: 0.25, unit: 'whole' }
                ],
                steps: [
                    'Sauté onions and vegetables in olive oil in an oven-safe skillet until fully tender and moisture is completely evaporated.',
                    'Whisk liquid egg whites with salt, pepper, and Parmesan cheese.',
                    'Pour egg whites evenly over the vegetables in the pan.',
                    'Cook on low heat undisturbed for 10 minutes until edges are set.',
                    'Pop under the oven broiler for 2-3 minutes until the top is puffed and deeply golden.'
                ],
                freezerTips: 'Let the frittata cool 100% to room temperature before wrapping in plastic wrap to prevent trapped condensation. When microwaving at work, wrap tightly in a dry paper towel to catch any escaping moisture.'
            },
            ramen: {
                id: 'ramen',
                title: 'Spicy Ramen-Style Tofu Soup',
                desc: 'Hearty extra-firm tofu blocks and real black/white rice simmered in a hot Gochujang spinach broth, topped with soft scrambled egg whites.',
                type: 'Lunch',
                week: [4],
                baseMacros: { cal: 689, prot: 62.8, fat: 14.0, fib: 12.0, carb: 39.4 },
                ingredients: [
                    { name: 'White Rice (Uncooked)', amount: 3, unit: 'tbsp' },
                    { name: 'Black Rice (Uncooked)', amount: 1.5, unit: 'tbsp' },
                    { name: 'Extra Firm Tofu', amount: 400, unit: 'g' },
                    { name: 'Kirkland Liquid Egg Whites', amount: 500, unit: 'g' },
                    { name: 'Fresh Spinach', amount: 200, unit: 'g' },
                    { name: 'Gochujang', amount: 4, unit: 'tbsp' },
                    { name: 'Low-Sodium Soy Sauce', amount: 2, unit: 'tbsp' },
                    { name: 'Garlic & Ginger', amount: 3, unit: 'cloves/1-inch knob' },
                    { name: 'Vegetable Broth', amount: 1, unit: 'Liter' }
                ],
                steps: [
                    'Cut the extra-firm tofu into bite-size blocks and pan-sear (or air-fry) until lightly golden and firm.',
                    'Cook your white/black rice mixture.',
                    'Sauté minced garlic and ginger. Whisk in Gochujang, soy sauce, and vegetable broth; simmer.',
                    'Add your rice and fresh spinach to the broth and cook until spinach is wilted.',
                    'Scramble egg whites separately in a skillet until velvety.',
                    'Drop the tofu blocks into the broth to warm through, then divide into containers with the egg whites and store.'
                ],
                freezerTips: 'Divide the broth and tofu blocks into separate airtight layers if possible. Freeze broth solid. To serve, defrost in microwave on high for 2 minutes, stir, then heat for an additional 1.5 minutes.'
            },
            laab: {
                id: 'laab',
                title: 'Vegan Tofu Laab',
                desc: 'Finely crumbled extra-firm tofu tossed with toasted jasmine rice powder and lemongrass in a lime-tamari dressing. Rounded to a 0.85x portion.',
                type: 'Dinner',
                week: [4],
                baseMacros: { cal: 779, prot: 37.4, fat: 29.3, fib: 6.8, carb: 35.1 },
                ingredients: [
                    { name: 'White Rice (Uncooked)', amount: 2.55, unit: 'tbsp' },
                    { name: 'Black Rice (Uncooked)', amount: 1.275, unit: 'tbsp' },
                    { name: 'Extra Firm Tofu', amount: 340, unit: 'g' },
                    { name: 'Uncooked Jasmine Rice (for powder)', amount: 1.275, unit: 'tbsp' },
                    { name: 'Lemongrass Stem', amount: 0.85, unit: 'whole' },
                    { name: 'Shallot', amount: 0.85, unit: 'whole' },
                    { name: 'Lime Juice', amount: 1.7, unit: 'tbsp' },
                    { name: 'Brown Sugar', amount: 1.275, unit: 'tbsp' },
                    { name: 'Soy Sauce', amount: 0.85, unit: 'tbsp' },
                    { name: 'Sesame/Peanut Oil', amount: 1, unit: 'tbsp' },
                    { name: 'Fresh Herbs (Mint/Thai Basil)', amount: 0.85, unit: 'cup' }
                ],
                steps: [
                    'Sauté uncooked jasmine rice dry until golden and nutty, then crush into a coarse powder.',
                    'Whisk lime juice, brown sugar, soy sauce, and chili flakes in a bowl.',
                    'Crumble extra-firm tofu into small chunks.',
                    'Sauté lemongrass and sliced shallots in oil, add tofu, and cook until slightly crispy.',
                    'Toss base with the dressing, toasted rice powder, and fresh herbs; serve on butter lettuce.'
                ],
                freezerTips: 'Freeze the cooked tofu and aromatic lemongrass base dry on Sunday. Prepare your lime dressing separately. When ready to eat, thaw and reheat the tofu in a hot pan for 2 mins, then toss with the fresh dressing and fresh mint.'
            },
            mugcake: {
                id: 'mugcake',
                title: 'Protein Mug Cake',
                desc: 'A dense personal cake cooked on-demand, featuring a molten dark chocolate chip center.',
                type: 'Dessert',
                week: [4],
                baseMacros: { cal: 99, prot: 10.4, fat: 3.4, fib: 3.0, carb: 11.0 },
                ingredients: [
                    { name: 'Oat Flour', amount: 2, unit: 'tbsp' },
                    { name: 'Unsweetened Cocoa Powder', amount: 2, unit: 'tbsp' },
                    { name: 'Whey Protein Powder', amount: 1, unit: 'tbsp' },
                    { name: 'Dark Chocolate Chips', amount: 0.5, unit: 'tsp' },
                    { name: 'Sugar-Free Syrup', amount: 1, unit: 'tbsp' },
                    { name: 'Unsweetened Almond Milk', amount: 3, unit: 'tbsp' },
                    { name: 'Baking Powder', amount: 0.5, unit: 'tsp' }
                ],
                steps: [
                    'Mix cocoa powder, oat flour, whey protein, and baking powder together in a jar.',
                    'When ready to bake, scoop dry base into a mug, add syrup and almond milk, and stir until completely smooth.',
                    'Push dark chocolate chips into the center of the batter.',
                    'Drop microwave power level to 70% to prevent dry seizing.',
                    'Microwave for 50-60 seconds (it should look slightly wet on the top), let rest for 1 minute, and serve.'
                ],
                freezerTips: 'Do not cook and freeze this cake! Instead, pre-mix the dry base in a mason jar. When you want a sweet treat, scoop out 4.5 tablespoons, add your wet ingredients, and microwave on-demand.'
            },
            eggSkillet: {
                id: 'eggSkillet',
                title: 'Spiced Tomato & Egg Skillet',
                desc: 'A spiced baked-egg skillet over fingerling potatoes in a tomato, poblano & jalapeño sauce. Amounts shown are PER SERVING — scale to 6x in the Recipe Scaler to make the full 6-serving bake.',
                type: 'Breakfast',
                week: [],
                // Per-serving macros from Zara (recipe yields 6). Fiber is an ESTIMATE — she gave cal/protein/carb/fat only.
                baseMacros: { cal: 195, prot: 9.6, fat: 5.0, fib: 4.5, carb: 30.0 },
                ingredients: [
                    { name: 'Fingerling Potatoes', amount: 113, unit: 'g' },
                    { name: 'Cooking Spray', amount: 1, unit: 'light coat' },
                    { name: 'Yellow Onion (diced)', amount: 0.17, unit: 'medium' },
                    { name: 'Poblano Pepper (chopped)', amount: 0.17, unit: 'whole' },
                    { name: 'Jalapeño Peppers', amount: 0.33, unit: 'whole' },
                    { name: 'Fresh Ginger', amount: 0.33, unit: 'tbsp' },
                    { name: 'Garlic', amount: 0.5, unit: 'cloves' },
                    { name: 'Ground Cumin', amount: 0.17, unit: 'tsp' },
                    { name: 'Garam Masala', amount: 0.17, unit: 'tsp' },
                    { name: 'Ground Coriander', amount: 0.08, unit: 'tsp' },
                    { name: 'Whole Peeled Tomatoes (canned)', amount: 132, unit: 'g' },
                    { name: 'Fresh Mint (chopped)', amount: 0.67, unit: 'tbsp' },
                    { name: 'Fresh Cilantro or Basil', amount: 0.33, unit: 'tbsp' },
                    { name: 'Large Eggs', amount: 1, unit: 'whole' },
                    { name: 'Kosher Salt & Black Pepper', amount: 1, unit: 'to taste' }
                ],
                steps: [
                    'PREP POTATOES: Boil potatoes in generously salted water until tender (~20 min for the full batch). Drain, cool slightly, and slice into 1/2-inch rounds.',
                    'SAUTE AROMATICS: Coat a large skillet with cooking spray over medium-high heat. Cook onion until almost tender (5-7 min). Add poblano and jalapeño; cook 3 min. Add ginger, garlic, cumin, garam masala, and coriander; cook 1 min until fragrant.',
                    'SIMMER SAUCE: Stir in the canned tomatoes and a little salt. Simmer on medium-low, breaking up the tomatoes with a fork, for 15 min. Stir in the mint and cilantro/basil; taste and adjust seasoning.',
                    'BAKE: Heat oven to 375°F. Arrange the potatoes in a single layer in a baking dish (9-inch square for the full 6-serving batch) and pour the hot sauce over them.',
                    'FINISH: Make one well per serving, crack an egg into each, and season with salt and pepper. Bake 8-13 min until whites are set but yolks stay runny. Garnish with extra herbs.'
                ],
                freezerTips: 'Best eaten fresh, but the spiced tomato-potato base freezes well WITHOUT the eggs. Freeze the sauce-and-potato base in portions; thaw, spread in a dish, then crack in fresh eggs and bake just before serving.'
            },
            proteinIceCream: {
                id: 'proteinIceCream',
                title: 'Cottage Cheese Chocolate Protein Ice Cream',
                desc: 'A Ninja Creami high-protein chocolate ice cream from cottage cheese + Fairlife chocolate milk. Amounts shown are PER SERVING (1/2 pint) — scale to 2x in the Recipe Scaler for the full 1-pint batch.',
                type: 'Dessert',
                week: [],
                // Per-serving macros from Zara (1/2 pint). Fiber is an ESTIMATE; see note re: cal vs. protein math below.
                baseMacros: { cal: 171, prot: 26.0, fat: 3.0, fib: 1.0, carb: 17.0 },
                ingredients: [
                    { name: 'Low-Fat Cottage Cheese (2%)', amount: 0.5, unit: 'cup' },
                    { name: 'Fairlife 2% Chocolate Milk', amount: 0.5, unit: 'cup' },
                    { name: 'Chocolate Protein Powder', amount: 0.5, unit: 'scoop' },
                    { name: 'Gluten-Free Oreos (optional mix-in)', amount: 2, unit: 'cookies' }
                ],
                steps: [
                    'BLEND: Add the cottage cheese, chocolate milk, and protein powder to a high-speed blender. Blend until completely smooth with no curds remaining.',
                    'FREEZE: Pour into a Ninja Creami pint container, attach the lid, and freeze on a level surface for 18-24 hours.',
                    'FIRST SPIN: Lock the frozen pint into the outer bowl, load the machine, and run the "Ice Cream" (or "Lite Ice Cream") cycle.',
                    'RE-SPIN: If the texture looks powdery or crumbly, add 1 tbsp chocolate milk to the center and run "Re-spin" until creamy.',
                    'MIX-INS: Hollow out a channel down the center, add the crushed gluten-free Oreos (or chips / M&Ms), and run the "Mix-in" cycle. Serve immediately.'
                ],
                freezerTips: 'For leftovers, smooth the surface flat, put the lid on, and freeze up to 4 days. To finish later: lock the frozen pint back into the Creami, pour 1 tbsp chocolate milk on top, and run "Re-spin" to friction-thaw to soft-serve (do not scoop straight from the freezer).'
            }
        };

        const weeksPlan = {
            1: { breakfast: 'bagel', lunch: 'vegStirfry', dinner: 'tofuStirfry', dessert: 'blondies' },
            2: { breakfast: 'bagel', lunch: 'mapoTofu', dinner: 'silkyTofu', dessert: 'pudding' },
            3: { breakfast: 'pancakes', lunch: 'curryLunch', dinner: 'tofuPatties', dessert: 'blondies' },
            4: { breakfast: 'frittata', lunch: 'ramen', dinner: 'laab', dessert: 'mugcake' }
        };

        const snacksBaseline = { cal: 80, prot: 1.0, fat: 0.0, fib: 8.0, carb: 18.0 };

        let activeTab = 'dashboard';
        let activeWeek = '1';
        let selectedRecipeId = 'bagel';
        let chartInstance = null;
        let carbMode = 'rice'; // 'rice' or 'pasta' — swaps the grain base across the whole app

        // Custom selected recipe states for Mix & Match
        const customSelections = {
            breakfast: 'bagel',
            lunch: 'vegStirfry',
            dinner: 'tofuStirfry',
            dessert: 'blondies'
        };

        // RETAIL PACKAGING — how bulk items are actually SOLD, so the grocery list can
        // tell you how many cartons / bags / cases to buy for your scaled (x days) totals.
        //   gramsPerUnit : grams in ONE buyable unit (a carton, a bag, a box...)
        //   unitsPerCase : how many of those come in a case  (1 = bought individually)
        //   verified     : true once the real store size is confirmed
        // Sizes confirmed by Zara (oz->g: 8oz=227, 16oz/1lb=454, 24oz=680).
        //   Add more items using the same shape; keys must match the ingredient name in
        //   lowercase (e.g. 'extra firm tofu').
        const packagingDB = {
            'kirkland liquid egg whites': { retailUnit: 'carton',    unitLabel: 'cartons',    gramsPerUnit: 454, unitsPerCase: 6,  caseLabel: 'case', verified: true },  // 16oz carton, 6 per case
            'shelled edamame':            { retailUnit: 'bag',       unitLabel: 'bags',       gramsPerUnit: 227, unitsPerCase: 12, caseLabel: 'case', verified: true },  // Imperial Garden, 8oz bag, 12 per case
            'broccoli florets':           { retailUnit: 'bag',       unitLabel: 'bags',       gramsPerUnit: 454, unitsPerCase: 4,  caseLabel: 'case', verified: true },  // 1lb bag, 4 per case
            'extra firm tofu':            { retailUnit: 'container', unitLabel: 'containers', gramsPerUnit: 454, unitsPerCase: 4,  caseLabel: 'pack', verified: true },  // 16oz container, 4-count pack
            'button mushrooms':           { retailUnit: 'pack',      unitLabel: 'packs',      gramsPerUnit: 680, unitsPerCase: 1,  caseLabel: 'case', verified: true },  // 24oz pack
            'brami pasta':                { retailUnit: 'box',       unitLabel: 'boxes',      gramsPerUnit: 454, unitsPerCase: 4,  caseLabel: 'case', verified: true },   // 1lb box, 4 per case (Costco)
            'sola blueberry bagel':       { retailUnit: 'bagel',       unitLabel: 'bagels',       gramsPerUnit: 85, unitsPerCase: 4,  caseLabel: 'case', verified: true }   // 4 per case (Walmart)
        };


