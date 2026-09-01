import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Cycle 23 — « Déconnexion » doit appeler signOut, pas seulement
 * naviguer vers /connexion (qui redirige vers /login sans casser la session).
 */
describe("Cycle 23 — déconnexion réelle", () => {
  it("les menus dashboard et workflow appellent signOutWithSession avant /login", () => {
    const dashboard = readFileSync(
      join(process.cwd(), "src/design-system/layouts/DashboardLayout.tsx"),
      "utf8",
    );
    const workflow = readFileSync(
      join(process.cwd(), "src/design-system/layouts/WorkflowLayout.tsx"),
      "utf8",
    );
    const auth = readFileSync(join(process.cwd(), "src/lib/lmnp/auth/auth-session.ts"), "utf8");

    assert.match(auth, /export async function signOutWithSession/);
    assert.match(auth, /supabase\.auth\.signOut/);
    assert.match(dashboard, /signOutWithSession/);
    assert.match(workflow, /signOutWithSession/);
    assert.match(dashboard, /window\.location\.assign\("\/login"\)/);
    assert.match(workflow, /window\.location\.assign\("\/login"\)/);
  });
});
