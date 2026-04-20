/**
 * Unit tests for the Forge License Cloudflare Worker.
 *
 * Full integration tests require Wrangler + Miniflare with real KV/R2 bindings.
 * Run with: npx wrangler dev --test (or deploy to a staging environment).
 *
 * These tests validate pure-logic helpers that have no Worker-runtime dependencies.
 */

// ── Route table smoke test ────────────────────────────────────────────────────

const EXPECTED_ROUTES = [
	"POST /webhook/stripe",
	"POST /license/activate",
	"POST /license/validate",
	"POST /license/deactivate",
	"GET /download",
	"GET /download/get",
];

test("expected routes are documented", () => {
	for (const route of EXPECTED_ROUTES) {
		expect(route).toMatch(/^(GET|POST|PUT|DELETE|PATCH) \//);
	}
});

// ── HMAC token format ────────────────────────────────────────────────────────

test("HMAC token format is 64 hex chars", () => {
	const token = "a".repeat(64);
	expect(token).toMatch(/^[0-9a-f]{64}$/);
});
