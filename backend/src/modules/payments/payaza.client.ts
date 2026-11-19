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
