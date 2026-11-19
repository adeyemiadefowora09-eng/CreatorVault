import { describe, it, expect } from "vitest";
import { payazaClient } from "../payaza.client.js";

describe("PayazaClient", () => {
  it("generates correct base64 encoded Authorization and Tenant headers", () => {
    const headers = (payazaClient as any).getHeaders();
    expect(headers).toHaveProperty("Authorization");
    expect(headers.Authorization).toMatch(/^Payaza /);
    expect(headers).toHaveProperty("X-TenantID");
    expect(["test", "live"]).toContain(headers["X-TenantID"]);
  });

  it("handles trailing slash in baseUrl properly", () => {
    const url = (payazaClient as any).baseUrl;
    expect(url.endsWith("/")).toBe(true);
  });
});
