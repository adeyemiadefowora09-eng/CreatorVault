/**
 * Safety net for lost webhooks and crashed requests. Everything it calls is idempotent and
 * row-locked, so running it on several instances at once is harmless.
 */
import { prisma } from "../../config/db.js";
import { config, paymentsEnabled, paymentsEnvironment } from "../../config/env.js";
import { logger } from "../../utils/logger.js";
import { confirmFunding, expirePayment } from "./escrow.service.js";
import { applyTransferStatus, dispatchPayout } from "./payouts.service.js";
import * as payaza from "./payaza.client.js";

let running = false;

export async function reconcileOnce() {
  if (!paymentsEnabled() || running) return { skipped: true };
  running = true;
  const stats = { payments: 0, payouts: 0 };
  try {
    const env = paymentsEnvironment();

    // 1. unpaid virtual accounts: confirm if paid; expire if stale
    const pending = await prisma.payment.findMany({
      where: { status: "PENDING", isDemo: false, environment: env, createdAt: { lt: new Date(Date.now() - 60_000) } },
      orderBy: { createdAt: "asc" }, take: 50,
    });
    for (const p of pending) {
      stats.payments++;
      const r = await confirmFunding(p.id, undefined, "reconciler").catch((e) => { logger.warn(`reconcile payment ${p.id}: ${e.message}`); return null; });
      if (r && r.status === "PENDING" && p.expiresAt && p.expiresAt.getTime() + 15 * 60_000 < Date.now()) {
        await expirePayment(p.id, "Virtual account expired unpaid");
      }
    }

    // 2. in-flight payouts: ask the provider
    const payouts = await prisma.payout.findMany({
      where: { status: { in: ["PENDING", "PROCESSING"] }, isDemo: false, environment: env, requestedAt: { lt: new Date(Date.now() - 45_000) } },
      orderBy: { requestedAt: "asc" }, take: 25,
    });
    for (const po of payouts) {
      stats.payouts++;
      try {
        const s = await payaza.queryTransferStatus(po.providerRef!);
        if (s.found) await applyTransferStatus(po.id, s.status, s.responseMessage);
        else if (po.status === "PENDING" && Date.now() - po.requestedAt.getTime() > 2 * 60_000) await dispatchPayout(po.id); // never submitted (crash) -> safe retry, reference is unique
      } catch (e) {
        logger.warn(`reconcile payout ${po.id}: ${(e as Error).message}`);
      }
    }
  } finally {
    running = false;
  }
  return stats;
}

export function startReconciler() {
  if (!config.ENABLE_RECONCILER || !paymentsEnabled()) return;
  const t = setInterval(() => reconcileOnce().catch((e) => logger.error(`reconciler: ${e.message}`)), config.RECONCILE_INTERVAL_SECONDS * 1000);
  t.unref();
  logger.info(`Payment reconciler started (every ${config.RECONCILE_INTERVAL_SECONDS}s)`);
}
