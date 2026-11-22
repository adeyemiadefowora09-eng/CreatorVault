import { NextFunction, Request, Response } from "express";
import { AuthRequest } from "../../types/index.js";
import { sendSuccess } from "../../utils/apiResponse.js";
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
