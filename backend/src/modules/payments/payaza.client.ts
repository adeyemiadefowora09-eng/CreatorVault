<<<<<<< HEAD
/**
 * Single place that talks to Payaza. Contracts below were taken from
 * https://docs.payaza.africa (Virtual Accounts, Transfers, Webhooks guides).
 *
 *  - Auth:      Authorization: Payaza <base64(PUBLIC key)>   (NOT Bearer, NOT the secret key)
 *  - Tenant:    X-TenantID: test | live   (the "/live" in the URL never changes)
 *  - Secret key is used only to verify webhook signatures (see webhook.ts).
 *
 * Nothing in here logs request bodies or headers (they contain the payout PIN / keys).
 */
import { config, paymentsEnvironment } from "../../config/env.js";
import { ApiError } from "../../utils/apiError.js";

export class PayazaError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly body: unknown,
    /** true when we could not tell whether Payaza acted on the request (timeout / network / 5xx). */
    public readonly ambiguous: boolean
  ) {
    super(message);
  }
}

/** Accepts either the raw public key or one that is already base64 encoded. */
export function encodePublicKey(key: string): string {
  const k = key.trim();
  try {
    const decoded = Buffer.from(k, "base64").toString("utf8");
    if (/^PZ\d*-PK/i.test(decoded) || /^PZ[\w-]*PK/i.test(decoded)) return k; // already encoded
  } catch { /* not base64 */ }
  return Buffer.from(k, "utf8").toString("base64");
}

function tenant(): "test" | "live" {
  return paymentsEnvironment() === "live" ? "live" : "test";
}

function headers(): Record<string, string> {
  return {
    Authorization: `Payaza ${encodePublicKey(config.PAYAZA_API_KEY)}`,
    "X-TenantID": tenant(),
    "Content-Type": "application/json",
  };
}

type FetchLike = typeof fetch;
let fetchImpl: FetchLike = (...a) => fetch(...a);
/** Test hook: lets unit/integration tests inject a fake network layer. */
export function __setFetchForTests(f: FetchLike | null) {
  fetchImpl = f ?? ((...a) => fetch(...a));
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown, timeoutMs = 20_000): Promise<T> {
  const url = `${config.PAYAZA_BASE_URL}/${path.replace(/^\/+/, "")}`;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method,
      headers: headers(),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new PayazaError(`Payaza network error (${(err as Error).name})`, null, null, true);
  }

  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }

  if (!res.ok) {
    const msg = json?.message ?? json?.response_message ?? `HTTP ${res.status}`;
    throw new PayazaError(`Payaza ${method} ${path.split("?")[0]} failed: ${msg}`, res.status, json ?? text.slice(0, 300), res.status >= 500 || res.status === 408 || res.status === 429);
  }
  return json as T;
}

// ---------------------------------------------------------------- collections
export interface DynamicVaInput {
  reference: string;
  amount: string; // decimal string, e.g. "25000" or "25000.50"
  customer: { firstName: string; lastName: string; email: string; phone: string };
  description: string;
  accountName: string;
}
export interface DynamicVa {
  accountNumber: string;
  accountName: string;
  bankName: string;
  amountPayable: string | null;
  expiresInMinutes: number | null;
  reference: string;
}

export async function createDynamicVirtualAccount(input: DynamicVaInput): Promise<DynamicVa> {
  const res = await call<any>("POST", "merchant-collection/merchant/virtual_account/generate_virtual_account", {
    account_name: input.accountName,
    account_type: "Dynamic",
    bank_code: config.PAYAZA_VA_BANK_CODE,
    bvn: "",
    has_amount_validation: "true",
    account_reference: input.reference,
    customer_first_name: input.customer.firstName,
    customer_last_name: input.customer.lastName,
    customer_email: input.customer.email,
    customer_phone_number: input.customer.phone,
    transaction_description: input.description,
    transaction_amount: input.amount,
    expires_in_minutes: String(config.PAYAZA_VA_EXPIRY_MINUTES),
  });
  const d = res?.data;
  if (!res?.success || !d?.account_number) {
    throw new PayazaError("Payaza did not return a virtual account", 200, res, false);
  }
  return {
    accountNumber: String(d.account_number),
    accountName: String(d.account_name ?? input.accountName),
    bankName: String(d.bank_name ?? ""),
    amountPayable: d.transaction_amount_payable != null ? String(d.transaction_amount_payable) : null,
    expiresInMinutes: d.expires_in_minutes != null ? Number(d.expires_in_minutes) : null,
    reference: String(d.account_reference ?? input.reference),
  };
}

export interface VaTransaction {
  status: "Initialized" | "Completed" | string;
  amountReceived: string | null;
  currency: string | null;
  reference: string;
  virtualAccountNumber: string | null;
}

/** Independent server-to-server verification of a dynamic VA payment. */
export async function queryVirtualAccountTransaction(reference: string): Promise<VaTransaction> {
  const res = await call<any>(
    "GET",
    `merchant-collection/transfer_notification_controller/transaction-query?transaction_reference=${encodeURIComponent(reference)}`
  );
  const d = res?.data;
  if (!d) throw new PayazaError("Payaza transaction-query returned no data", 200, res, false);
  return {
    status: String(d.transaction_status),
    amountReceived: d.amount_received != null ? String(d.amount_received) : null,
    currency: d.currency ?? null,
    reference: String(d.transaction_reference ?? reference),
    virtualAccountNumber: d.virtual_account_number ?? null,
  };
}

/** SANDBOX ONLY: simulates a customer paying a dynamic virtual account. Triggers a real webhook. */
export async function fundTestVirtualAccount(input: {
  accountNumber: string;
  accountName: string;
  reference: string;
  amount: string;
}) {
  if (paymentsEnvironment() !== "sandbox") throw ApiError.forbidden("Test funding is only available in sandbox mode");
  return call<any>("POST", "merchant-collection/payaza/virtual_account/fund_test_virtual_account", {
    account_name: input.accountName,
    account_number: input.accountNumber,
    initiation_transaction_reference: input.reference,
    transaction_amount: input.amount,
    currency: "NGN",
    source_account_number: "0123456789",
    source_account_name: "Sandbox Payer",
    source_bank_name: "Test Bank",
  });
}

// ---------------------------------------------------------------- transfers
export async function listNigerianBanks(): Promise<{ code: string; name: string }[]> {
  const res = await call<any>("GET", "payaza-account/api/v1/mainaccounts/merchant/banks/NGN");
  const rows: any[] = Array.isArray(res?.data) ? res.data : [];
  return rows
    .filter((b) => b.active !== false && b.block_transaction !== true && (b.type ?? "bank") !== "mobile_money")
    .map((b) => ({ code: String(b.code), name: String(b.name) }));
}

export async function accountNameEnquiry(bankCode: string, accountNumber: string): Promise<{ accountName: string; accountNumber: string; bankCode: string }> {
  const res = await call<any>("POST", "payaza-account/api/v1/mainaccounts/merchant/provider/enquiry", {
    service_payload: { currency: "NGN", bank_code: bankCode, account_number: accountNumber },
  });
  const c = res?.response_content;
  if (res?.response_code !== 200 || !c?.account_name) {
    throw new PayazaError("Account name enquiry failed", 200, res, false);
  }
  return { accountName: String(c.account_name), accountNumber: String(c.account_number ?? accountNumber), bankCode: String(c.bank_code ?? bankCode) };
}

let cachedAccountRef: string | null = null;
export async function getPayoutAccountReference(): Promise<string> {
  if (config.PAYAZA_ACCOUNT_REFERENCE) return config.PAYAZA_ACCOUNT_REFERENCE;
  if (cachedAccountRef) return cachedAccountRef;
  const res = await call<any>("GET", "payaza-account/api/v1/mainaccounts/merchant/enquiry/main");
  const ngn = (Array.isArray(res?.data) ? res.data : []).find((a: any) => a.currency === "NGN");
  if (!ngn?.payazaAccountReference) throw new PayazaError("No NGN Payaza account found for this key", 200, null, false);
  cachedAccountRef = String(ngn.payazaAccountReference);
  return cachedAccountRef;
}

export async function getMainAccountBalanceNGN(): Promise<number | null> {
  const res = await call<any>("GET", "payaza-account/api/v1/mainaccounts/merchant/enquiry/main");
  const ngn = (Array.isArray(res?.data) ? res.data : []).find((a: any) => a.currency === "NGN");
  return ngn?.accountBalance != null ? Number(ngn.accountBalance) : null;
}

export interface TransferInput {
  reference: string;
  amount: number;
  accountNumber: string;
  accountName: string;
  bankCode: string;
  narration: string;
}

/** Returns true when Payaza accepted the transfer for processing. Throws PayazaError otherwise. */
export async function initiateNubanTransfer(t: TransferInput): Promise<{ accepted: boolean; raw: any }> {
  const accountReference = await getPayoutAccountReference();
  const res = await call<any>("POST", "payout-receptor/payout", {
    transaction_type: "nuban",
    service_payload: {
      payout_amount: t.amount,
      transaction_pin: Number(config.PAYAZA_TRANSACTION_PIN),
      account_reference: accountReference,
      currency: "NGN",
      country: "NGA",
      payout_beneficiaries: [
        {
          credit_amount: t.amount,
          account_number: t.accountNumber,
          account_name: t.accountName,
          bank_code: t.bankCode,
          narration: t.narration,
          transaction_reference: t.reference,
        },
      ],
    },
  });
  const status = res?.response_content?.response_status;
  const accepted = res?.response_code === 200 && (status === "TRANSACTION_INITIATED" || res?.resp_code === "09");
  return { accepted, raw: res };
}

export interface TransferStatus {
  status: string; // NIP_SUCCESS | NIP_FAILURE | NIP_PENDING | TRANSACTION_INITIATED | ESCROW_SUCCESS | ...
  amount: string | null;
  responseMessage: string | null;
  found: boolean;
}

export async function queryTransferStatus(reference: string): Promise<TransferStatus> {
  try {
    const res = await call<any>("GET", `payaza-account/api/v1/mainaccounts/merchant/transaction/${encodeURIComponent(reference)}`);
    const d = res?.data;
    if (!d) return { status: "UNKNOWN", amount: null, responseMessage: null, found: false };
    return {
      status: String(d.transactionStatus),
      amount: d.transactionAmount != null ? String(d.transactionAmount) : null,
      responseMessage: d.responseMessage ?? null,
      found: true,
    };
  } catch (err) {
    if (err instanceof PayazaError && err.status !== null && err.status >= 400 && err.status < 500 && err.status !== 408 && err.status !== 429) {
      return { status: "NOT_FOUND", amount: null, responseMessage: err.message, found: false };
    }
    throw err;
  }
}
=======
import { config } from "../../config/env.js";

export interface PayoutBeneficiary {
  credit_amount: number;
  account_number: string;
  account_name: string;
  bank_code: string;
}

export interface PayazaPayoutPayload {
  payout_amount: number;
  currency: string;
  country?: string;
  beneficiaries: PayoutBeneficiary[];
  narration?: string;
}

export interface BankEnquiryPayload {
  currency: string;
  bank_code: string;
  account_number: string;
}

export class PayazaClient {
  private get baseUrl(): string {
    let url = config.PAYAZA_BASE_URL.trim();
    if (!url.endsWith("/")) url += "/";
    return url;
  }

  private getPublicKey(): string {
    return config.PAYAZA_PUBLIC_KEY || config.PAYAZA_API_KEY || "";
  }

  private getHeaders(): Record<string, string> {
    const rawKey = this.getPublicKey();
    const encodedKey = Buffer.from(rawKey).toString("base64");
    return {
      "Content-Type": "application/json",
      Authorization: `Payaza ${encodedKey}`,
      "X-TenantID": config.PAYAZA_TENANT,
    };
  }

  /**
   * Initializes a checkout session for Brand funding into Escrow
   */
  async initializeCheckout(params: {
    amount: number;
    currency: string;
    email: string;
    firstName: string;
    lastName: string;
    reference: string;
    callbackUrl: string;
  }): Promise<{ checkoutUrl: string; rawResponse?: any }> {
    const payload = {
      service_type: "Account",
      service_payload: {
        request_application: "Payaza",
        application_module: "USER_MODULE",
        application_version: "1.0.0",
        request_class: "CheckoutRequest",
        connection_map: {
          amount: params.amount,
          checkout_amount: params.amount,
          currency_code: params.currency,
          email_address: params.email,
          first_name: params.firstName,
          last_name: params.lastName,
          transaction_reference: params.reference,
          callback_url: params.callbackUrl,
        },
      },
    };

    const endpoint = `${this.baseUrl}api/v1/applications/initialize`;

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`Payaza checkout call failed [${response.status}]: ${errorText}`);
        return {
          checkoutUrl: `${config.CORS_ORIGIN}/payments/verify/${params.reference}?mock=true`,
        };
      }

      const data: any = await response.json();
      const checkoutUrl = data?.response_content?.checkout_url || data?.data?.checkout_url;
      return {
        checkoutUrl: checkoutUrl || `${config.CORS_ORIGIN}/payments/verify/${params.reference}?mock=true`,
        rawResponse: data,
      };
    } catch (err: any) {
      console.warn("Payaza client fetch warning (using sandbox callback):", err.message);
      return {
        checkoutUrl: `${config.CORS_ORIGIN}/payments/verify/${params.reference}?mock=true`,
      };
    }
  }

  /**
   * Resolves Account Name via Payaza Account Enquiry API
   */
  async resolveAccount(params: BankEnquiryPayload): Promise<{ account_name?: string; success: boolean }> {
    const endpoint = `${this.baseUrl}payaza-account/api/v1/mainaccounts/merchant/provider/enquiry`;
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) return { success: false };
      const data: any = await response.json();
      return {
        success: true,
        account_name: data?.data?.account_name || data?.response_content?.account_name,
      };
    } catch {
      return { success: false };
    }
  }

  /**
   * Disburses funds via Payaza Payout Receptor API
   */
  async disbursePayout(params: PayazaPayoutPayload): Promise<{ success: boolean; reference?: string; data?: any }> {
    const endpoint = `${this.baseUrl}payout-receptor/payout`;

    const payload = {
      transaction_type: "nuban",
      service_payload: {
        payout_amount: params.payout_amount,
        transaction_pin: config.PAYAZA_TRANSACTION_PIN || "0000",
        account_reference: config.PAYAZA_ACCOUNT_REFERENCE || "CREATORVAULT_MERCHANT",
        currency: params.currency,
        country: params.country || "NGA",
        payout_beneficiaries: params.beneficiaries.map((b) => ({
          credit_amount: b.credit_amount,
          account_number: b.account_number,
          account_name: b.account_name,
          bank_code: b.bank_code,
        })),
      },
    };

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20000),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`Payaza payout response [${response.status}]: ${errorText}`);
        return { success: false, data: errorText };
      }

      const data: any = await response.json();
      return { success: true, data };
    } catch (err: any) {
      console.warn("Payaza payout call error:", err.message);
      return { success: false, data: err.message };
    }
  }

  /**
   * Checks the status of a transfer transaction
   */
  async getTransferStatus(reference: string): Promise<any> {
    const endpoint = `${this.baseUrl}payaza-account/api/v1/mainaccounts/transaction/status?transaction_reference=${encodeURIComponent(
      reference
    )}`;

    try {
      const response = await fetch(endpoint, {
        method: "GET",
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }
}

export const payazaClient = new PayazaClient();
>>>>>>> 9c15709e71866d0d287652bd5fa6ab5f84e07faf
