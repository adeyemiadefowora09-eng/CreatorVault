import crypto from "crypto";
import { afterEach, describe, expect, it } from "vitest";
import { classify, signaturesMatch } from "../../src/modules/payments/webhook.js";
import * as payaza from "../../src/modules/payments/payaza.client.js";
import { normalizePayazaBaseUrl } from "../../src/config/env.js";

const SECRET = "PZ78-SK-TEST-secret";
const body = Buffer.from(JSON.stringify({ transaction_reference: "CVabc", status: "Completed", amount_received: "100.00" }));
const sig = (enc: "base64" | "hex", key = SECRET, b = body) => crypto.createHmac("sha512", key).update(b).digest(enc);

describe("webhook signature", () => {
  it("accepts base64 and hex HMAC-SHA512 of the RAW bytes", () => {
    expect(signaturesMatch(body, sig("base64"), SECRET)).toBe(true);
    expect(signaturesMatch(body, sig("hex"), SECRET)).toBe(true);
  });
  it("rejects wrong key, tampered body, missing header and EMPTY secret (forgery with empty key)", () => {
    expect(signaturesMatch(body, sig("base64", "other"), SECRET)).toBe(false);
    expect(signaturesMatch(Buffer.from(body.toString().replace("100.00", "999.00")), sig("base64"), SECRET)).toBe(false);
    expect(signaturesMatch(body, undefined, SECRET)).toBe(false);
    expect(signaturesMatch(body, sig("base64", ""), "")).toBe(false);
  });
  it("re-serialised JSON with different whitespace would NOT match (why raw body is required)", () => {
    const pretty = Buffer.from(JSON.stringify(JSON.parse(body.toString()), null, 2));
    expect(signaturesMatch(pretty, sig("base64"), SECRET)).toBe(false);
  });
  it("classifies payload shapes from the Payaza docs", () => {
    expect(classify({ transaction_type: "DEBIT", transaction_status: "NIP_SUCCESS", sent_to: {} })).toBe("payout");
    expect(classify({ transaction_status: "Funds Received", merchant_reference: "x", channel: "VirtualAccount", status: "Completed" })).toBe("collection");
    expect(classify({ hello: 1 })).toBe("unknown");
  });
});

describe("payaza client contract", () => {
  afterEach(() => payaza.__setFetchForTests(null));
  const capture = () => {
    const calls: { url: string; init: RequestInit }[] = [];
    payaza.__setFetchForTests((async (url: any, init: any) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ response_code: 200, response_content: { response_status: "TRANSACTION_INITIATED" }, resp_code: "09" }), { status: 200 });
    }) as any);
    return calls;
  };

  it("normalises the base URL (fixes '.../live/' and '.../test' from old .env files)", () => {
    for (const u of ["https://api.payaza.africa/live/", "https://api.payaza.africa/test", "https://api.payaza.africa", "https://api.payaza.africa/live//"]) {
      expect(normalizePayazaBaseUrl(u)).toBe("https://api.payaza.africa/live");
    }
  });
  it("encodes the public key as base64 once (raw or already-encoded)", () => {
    const raw = "PZ78-PK-ABC123";
    const b64 = Buffer.from(raw).toString("base64");
    expect(payaza.encodePublicKey(raw)).toBe(b64);
    expect(payaza.encodePublicKey(b64)).toBe(b64);
  });
  it("payout request: 'Payaza <b64 public key>' auth, tenant header, documented body shape, no Bearer, no secret key", async () => {
    const calls = capture();
    const r = await payaza.initiateNubanTransfer({ reference: "CVPtest1", amount: 5000, accountNumber: "0123456789", accountName: "JOHN DOE", bankCode: "000013", narration: "CreatorVault payout" });
    expect(r.accepted).toBe(true);
    const { url, init } = calls[0];
    expect(url).toBe("https://api.payaza.africa/live/payout-receptor/payout");
    const h = init.headers as Record<string, string>;
    expect(h.Authorization).toBe(`Payaza ${Buffer.from(process.env.PAYAZA_API_KEY!).toString("base64")}`);
    expect(h.Authorization).not.toMatch(/Bearer/);
    expect(h["X-TenantID"]).toBe("test");
    expect(String(init.body)).not.toContain(process.env.PAYAZA_SECRET_KEY!);
    const b = JSON.parse(String(init.body));
    expect(b.transaction_type).toBe("nuban");
    expect(b.service_payload).toMatchObject({ payout_amount: 5000, transaction_pin: 482915, account_reference: "1010000000", currency: "NGN", country: "NGA" });
    expect(b.service_payload.payout_beneficiaries[0]).toMatchObject({ credit_amount: 5000, account_number: "0123456789", bank_code: "000013", transaction_reference: "CVPtest1" });
  });
  it("virtual account request uses the documented endpoint and Dynamic + amount validation", async () => {
    const calls: any[] = [];
    payaza.__setFetchForTests((async (url: any, init: any) => {
      calls.push({ url: String(url), body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ success: true, data: { account_number: "3340009013", account_name: "Payaza(X)", bank_name: "GLOBUS BANK", transaction_amount_payable: 25000, expires_in_minutes: 30, account_reference: "CVx" } }), { status: 200 });
    }) as any);
    const va = await payaza.createDynamicVirtualAccount({ reference: "CVx", amount: "25000", accountName: "X", description: "d", customer: { firstName: "A", lastName: "B", email: "a@b.co", phone: "07000000000" } });
    expect(calls[0].url).toBe("https://api.payaza.africa/live/merchant-collection/merchant/virtual_account/generate_virtual_account");
    expect(calls[0].body).toMatchObject({ account_type: "Dynamic", has_amount_validation: "true", account_reference: "CVx", transaction_amount: "25000" });
    expect(va.accountNumber).toBe("3340009013");
  });
  it("network failure and 5xx are flagged ambiguous (must not be treated as 'payout failed')", async () => {
    payaza.__setFetchForTests((async () => { throw new Error("boom"); }) as any);
    await expect(payaza.queryTransferStatus("CVP1")).rejects.toMatchObject({ ambiguous: true });
    payaza.__setFetchForTests((async () => new Response("{}", { status: 503 })) as any);
    await expect(payaza.queryTransferStatus("CVP1")).rejects.toMatchObject({ ambiguous: true });
  });
  it("a 4xx on status lookup means 'provider has no record'", async () => {
    payaza.__setFetchForTests((async () => new Response(JSON.stringify({ message: "not found" }), { status: 404 })) as any);
    expect(await payaza.queryTransferStatus("CVP1")).toMatchObject({ found: false });
  });
});
