import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LicenseGate from "./LicenseGate";

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});

describe("LicenseGate", () => {
  it("renders activation heading for 'required' status", () => {
    render(<LicenseGate status="required" />);
    expect(screen.getByRole("heading")).toHaveTextContent("Activate your license");
  });

  it("renders expired heading for 'expired' status", () => {
    render(<LicenseGate status="expired" />);
    expect(screen.getByRole("heading")).toHaveTextContent("Subscription ended");
  });

  it("renders the license key input", () => {
    render(<LicenseGate status="required" />);
    const input = screen.getByPlaceholderText("XXXX-XXXX-XXXX-XXXX");
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("type", "text");
  });

  it("renders Activate button", () => {
    render(<LicenseGate status="required" />);
    expect(screen.getByRole("button", { name: /activate/i })).toBeInTheDocument();
  });

  it("shows error when submitting empty key", async () => {
    render(<LicenseGate status="required" />);
    fireEvent.submit(screen.getByRole("button", { name: /activate/i }));
    await waitFor(() =>
      expect(screen.getByText(/please enter your license key/i)).toBeInTheDocument()
    );
  });

  it("calls /api/license/activate with the entered key", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    const reloadMock = vi.fn();
    Object.defineProperty(window, "location", {
      value: { reload: reloadMock },
      writable: true,
    });

    render(<LicenseGate status="required" />);
    fireEvent.change(screen.getByPlaceholderText("XXXX-XXXX-XXXX-XXXX"), {
      target: { value: "FORGE-TEST-KEY" },
    });
    fireEvent.submit(screen.getByRole("button", { name: /activate/i }));

    await waitFor(() => expect(mockFetch).toHaveBeenCalledOnce());
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/license/activate");
    expect(JSON.parse(opts.body)).toEqual({ key: "FORGE-TEST-KEY" });
  });

  it("shows machine-limit error on 402 response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 402, text: async () => "" });
    render(<LicenseGate status="required" />);
    fireEvent.change(screen.getByPlaceholderText("XXXX-XXXX-XXXX-XXXX"), {
      target: { value: "FORGE-KEY" },
    });
    fireEvent.submit(screen.getByRole("button", { name: /activate/i }));
    await waitFor(() =>
      expect(screen.getByText(/machine limit reached/i)).toBeInTheDocument()
    );
  });

  it("shows renewal link for expired status", () => {
    render(<LicenseGate status="expired" />);
    expect(screen.getByRole("link", { name: /renew/i })).toBeInTheDocument();
  });

  it("shows buy link for required status", () => {
    render(<LicenseGate status="required" />);
    expect(screen.getByRole("link", { name: /buy a license/i })).toBeInTheDocument();
  });
});
