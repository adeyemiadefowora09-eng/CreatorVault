import { NextFunction, Request, Response } from "express";
import { AuthRequest } from "../../types/index.js";
import { sendSuccess } from "../../utils/apiResponse.js";
<<<<<<< HEAD
import * as svc from "./payments.service.js";
import * as bank from "./bank.service.js";
import * as admin from "./admin.service.js";
import { reconcileOnce } from "./reconciler.js";

const uid = (req: Request) => (req as AuthRequest).user.id;
type H = (req: Request, res: Response) => Promise<unknown>;
const wrap = (fn: H) => async (req: Request, res: Response, next: NextFunction) => { try { await fn(req, res); } catch (e) { next(e); } };

export const initialize = wrap(async (req, res) => sendSuccess(res, await svc.initializePayment(uid(req), req.body.dealId, req.body.milestoneId), "Payment initialized"));
export const verify = wrap(async (req, res) => sendSuccess(res, await svc.verifyPayment(req.params.reference, uid(req)), "Payment status"));
export const simulate = wrap(async (req, res) => sendSuccess(res, await svc.simulateSandboxPayment(req.params.reference, uid(req)), "Sandbox payment requested"));
export const mode = wrap(async (_req, res) => sendSuccess(res, await svc.getPaymentMode(), "Payment mode retrieved"));
export const list = wrap(async (req, res) => { const r = await svc.listPayments(uid(req), req.query as any); sendSuccess(res, r.items, "Payments retrieved", 200, r.meta); });
export const stats = wrap(async (req, res) => sendSuccess(res, await svc.getPaymentStats(uid(req)), "Stats retrieved"));
export const payoutBalance = wrap(async (req, res) => sendSuccess(res, await svc.getPayoutBalance(uid(req)), "Balance retrieved"));
export const listPayouts = wrap(async (req, res) => sendSuccess(res, await svc.listPayouts(uid(req)), "Payouts retrieved"));
export const requestPayout = wrap(async (req, res) => {
  const key = (req.headers["idempotency-key"] as string | undefined) ?? null;
  sendSuccess(res, await svc.requestPayout(uid(req), req.body.amount, key), "Payout requested", 201);
});

export const banks = wrap(async (_req, res) => sendSuccess(res, await bank.listBanks(), "Banks retrieved"));
export const resolveBank = wrap(async (req, res) => sendSuccess(res, await bank.resolveBankAccount(uid(req), req.body.bankCode, req.body.accountNumber), "Account resolved"));
export const saveBank = wrap(async (req, res) => sendSuccess(res, await bank.saveBankAccount(uid(req), req.body), "Bank account saved"));

export const adminIntegrity = wrap(async (_req, res) => sendSuccess(res, await admin.integrityReport(), "Integrity report"));
export const adminReview = wrap(async (_req, res) => sendSuccess(res, await admin.listReviewPayments(), "Payments needing review"));
export const adminReconcile = wrap(async (_req, res) => sendSuccess(res, await reconcileOnce(), "Reconciliation run"));
export const adminResolveEscrow = wrap(async (req, res) => sendSuccess(res, await admin.resolveEscrow(req.params.milestoneId, req.body.action, req.body.reason, uid(req)), "Escrow resolved"));
export const adminSettleRefund = wrap(async (req, res) => sendSuccess(res, await admin.settleRefund(req.body.brandId, req.body.amount, req.body.reference, uid(req)), "Refund recorded"));
=======
import { config } from "../../config/env.js";
import * as paymentsService from "./payments.service.js";

export async function initialize(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).user;
    const { dealId, milestoneId } = req.body;
    const idempotencyKey = req.headers["idempotency-key"] as string | undefined;
    const result = await paymentsService.initializePayment(user.id, dealId, milestoneId, idempotencyKey);
    sendSuccess(res, result, "Payment initialized");
  } catch (err) {
    next(err);
  }
}

export async function verify(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).user;
    const result = await paymentsService.verifyPayment(req.params.reference, user?.id);
    sendSuccess(res, result, "Payment verified");
  } catch (err) {
    next(err);
  }
}

export async function mode(req: Request, res: Response, next: NextFunction) {
  try {
    const live = config.PAYMENTS_MODE === "live";
    sendSuccess(res, { live, mode: config.PAYMENTS_MODE }, "Payment mode retrieved");
  } catch (err) {
    next(err);
  }
}

export async function confirmMock(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).user;
    const result = await paymentsService.verifyPayment(req.params.reference, user.id);
    sendSuccess(res, result, "Payment confirmed");
  } catch (err) {
    next(err);
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).user;
    const result = await paymentsService.listPayments(user.id, req.query);
    sendSuccess(res, result.items, "Payments retrieved", 200, result.meta);
  } catch (err) {
    next(err);
  }
}

export async function stats(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).user;
    const result = await paymentsService.getPaymentStats(user.id);
    sendSuccess(res, result, "Stats retrieved");
  } catch (err) {
    next(err);
  }
}

export async function payoutBalance(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).user;
    const result = await paymentsService.getPayoutBalance(user.id);
    sendSuccess(res, result, "Balance retrieved");
  } catch (err) {
    next(err);
  }
}

export async function requestPayout(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).user;
    const idempotencyKey = req.headers["idempotency-key"] as string | undefined;
    const result = await paymentsService.requestPayout(user.id, req.body.amount, idempotencyKey);
    sendSuccess(res, result, "Payout requested", 201);
  } catch (err) {
    next(err);
  }
}

export async function listPayouts(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).user;
    const result = await paymentsService.listPayouts(user.id);
    sendSuccess(res, result, "Payouts retrieved");
  } catch (err) {
    next(err);
  }
}

export async function syncPayout(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).user;
    const result = await paymentsService.syncPayoutStatus(req.params.id, user.id);
    sendSuccess(res, result, "Payout status synced");
  } catch (err) {
    next(err);
  }
}

export async function resolveBank(req: Request, res: Response, next: NextFunction) {
  try {
    const { bankCode, accountNumber } = req.body;
    const result = await paymentsService.resolveBankDetails(bankCode, accountNumber);
    sendSuccess(res, result, "Bank account verified");
  } catch (err) {
    next(err);
  }
}

export async function saveBank(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).user;
    const result = await paymentsService.saveVerifiedBankAccount(user.id, req.body);
    sendSuccess(res, result, "Bank account verified and saved");
  } catch (err) {
    next(err);
  }
}

export async function refund(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).user;
    const { dealId, milestoneId, reason } = req.body;
    const result = await paymentsService.refundEscrow(dealId, milestoneId, reason, user.id);
    sendSuccess(res, result, "Escrow refunded");
  } catch (err) {
    next(err);
  }
}
>>>>>>> 9c15709e71866d0d287652bd5fa6ab5f84e07faf
