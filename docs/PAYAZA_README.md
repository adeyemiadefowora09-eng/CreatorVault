# Payaza Integration Guide

This project uses **Payaza** for handling milestone payments between brands and creators instead of Paystack.

## 1. Environment Variables

Make sure the following variables are set in your `.env` file:

```env
PAYAZA_API_KEY=your_payaza_api_key
PAYAZA_SECRET_KEY=your_payaza_secret_key
PAYAZA_BASE_URL=https://router-live.payaza.africa
```

*Note: For testing, use your test API and Secret keys from the Payaza dashboard.*

## 2. API Flow

1. **Initialize Payment**: 
   - Endpoint: `POST /api/v1/payments/initialize`
   - The brand calls this to fund a milestone.
   - The backend creates a pending `Payment` record and calls Payaza's checkout initialization endpoint.
   - Returns the checkout URL which the frontend uses to redirect the user.

2. **Verify Payment**:
   - Endpoint: `POST /api/v1/payments/verify/:reference`
   - After the user completes payment, they are redirected back to the app. 
   - The frontend calls this endpoint to confirm the transaction status with Payaza.
   - If successful, the milestone status changes to `PAID`.

3. **Webhooks**:
   - Endpoint: `POST /api/v1/payments/webhook/payaza`
   - Ensure you register your server's URL in the Payaza dashboard to receive async updates.
   - The server verifies the Payaza signature and processes `charge.success` events automatically.

## 3. Supported Currencies

By default, the platform sets payments in `NGN`, but Payaza also supports cross-border and multi-currency transactions. Make sure to map the deal `currency` correctly when initializing the transaction.
