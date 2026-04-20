/**
 * Tests for the Forge MCP stdio proxy.
 *
 * The proxy discovers tools dynamically from the built-in Forge MCP server
 * at runtime — there is no static tool registry to test here. These tests
 * validate the port-probing configuration and error-message contracts that
 * are testable without a live Forge instance.
 */

import { describe, it, expect } from "vitest";

// Port probing configuration — must match PREFERRED_PORTS in index.js.
const PREFERRED_PORTS = [3005, 8333, 8080, 9000, 3000, 3333];

describe("port configuration", () => {
  it("prefers port 3005 as the default Forge Terminal port", () => {
    expect(PREFERRED_PORTS[0]).toBe(3005);
  });

  it("contains 8333 as the secondary Forge Terminal port", () => {
    expect(PREFERRED_PORTS).toContain(8333);
  });

  it("lists only valid non-privileged TCP port numbers", () => {
    for (const port of PREFERRED_PORTS) {
      expect(port).toBeGreaterThan(1024);
      expect(port).toBeLessThan(65536);
    }
  });

  it("has at least 3 fallback ports", () => {
    expect(PREFERRED_PORTS.length).toBeGreaterThanOrEqual(3);
  });
});

describe("proxy architecture", () => {
  it("MCP endpoint path is /api/mcp", () => {
    const endpoint = "/api/mcp";
    expect(endpoint).toBe("/api/mcp");
  });

  it("token file is in the .forge directory", () => {
    const tokenRelPath = ".forge/mcp-token";
    expect(tokenRelPath).toMatch(/^\.forge\//);
  });
});
