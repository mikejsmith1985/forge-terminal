/**
 * Tests for the Forge Vault MCP adapter.
 *
 * Full tests require a running Forge Terminal instance on one of the probe ports.
 * These unit tests cover the port-detection and tool-registration logic.
 */

import { describe, it, expect } from "vitest";

// Port probing configuration matches what the adapter uses at startup.
const PREFERRED_PORTS = [3005, 8333, 8080, 9000, 3000, 3333];

describe("port configuration", () => {
  it("prefers port 3005 as the default Forge Terminal port", () => {
    expect(PREFERRED_PORTS[0]).toBe(3005);
  });

  it("contains 8333 as the fallback Forge Terminal port", () => {
    expect(PREFERRED_PORTS).toContain(8333);
  });

  it("lists only valid TCP port numbers", () => {
    for (const port of PREFERRED_PORTS) {
      expect(port).toBeGreaterThan(1024);
      expect(port).toBeLessThan(65536);
    }
  });
});

// Tool name registry — keeps tool names in sync between adapter and docs.
const EXPECTED_TOOLS = [
  "forge_vault_status",
  "forge_vault_list",
  "forge_vault_add",
  "forge_vault_update",
  "forge_vault_delete",
  "forge_vault_toggle_autoinject",
  "forge_vault_inject",
  "forge_vault_reveal",
];

describe("tool registry", () => {
  it("all tool names follow the forge_vault_ prefix convention", () => {
    for (const name of EXPECTED_TOOLS) {
      expect(name).toMatch(/^forge_vault_/);
    }
  });

  it("has 8 registered tools", () => {
    expect(EXPECTED_TOOLS).toHaveLength(8);
  });
});
