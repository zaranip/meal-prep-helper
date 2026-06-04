/* Public Supabase connection settings for the Custom Recipe Builder (builder.html).
 *
 * SAFE TO COMMIT: the anon key is *designed* to be public. Security is enforced by
 * Row Level Security in the database (public read, signed-in write) — see
 * supabase/schema.sql — NOT by hiding this key. There is no point putting it in a
 * GitHub Actions secret; it ends up in the deployed JS either way.
 *
 * Fill these from: Supabase Dashboard -> Project Settings -> API.
 *   url     = "Project URL"
 *   anonKey = "Project API keys" -> "anon" / "public"
 */
window.SUPABASE_CONFIG = {
  url: "https://ehbyqcmnfjdwuivldztc.supabase.co",
  // Supabase "publishable" key (new format, == public/anon). Safe to commit.
  // NEVER put the "secret" key (sb_secret_...) here or anywhere client-side —
  // it bypasses Row Level Security and grants full read/write to everyone.
  anonKey: "sb_publishable_ntZXEaw0c4TME866ypcjCQ_JFhXEVES",
};
