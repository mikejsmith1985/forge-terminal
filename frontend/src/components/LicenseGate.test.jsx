import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LicenseGate from "./LicenseGate";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});

describe("LicenseGate", () => {
  it("renders children when license status is ok", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "ok", email: "test@example.com" }),
    });

    render(
      <LicenseGate>
        <div data-testid="protected-content">Protected</div>
      </LicenseGate>
    );

    await waitFor(() =>
      expect(screen.getByTestId("protected-content")).toBeInTheDocument()
    );
  });

  it("renders activation form when license status is required", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "required" }),
    });

    render(
      <LicenseGate>
        <div>Protected</div>
      </LicenseGate>
    );

    await waitFor(() =>
      expect(
        screen.getByPlaceholderText(/license key/i) ||
          screen.getByRole("textbox")
      ).toBeInTheDocument()
    );
  });

  it("calls activate endpoint on form submit", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "required" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "ok", email: "user@example.com" }),
      });

    render(
      <LicenseGate>
        <div>Protected</div>
      </LicenseGate>
    );

    await waitFor(() => screen.getByRole("textbox"));

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "FORGE-TEST-KEY" } });
    fireEvent.submit(input.closest("form") || screen.getByRole("button"));

    await waitFor(() => {
      const activateCall = mockFetch.mock.calls.find((call) =>
        call[0]?.includes?.("activate")
      );
      expect(activateCall).toBeTruthy();
    });
  });
});
