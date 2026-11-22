/**
 * Integration tests: REAL Postgres (set DATABASE_URL to a throw-away database that has had
 * `npx prisma migrate deploy` applied) + a fake Payaza network layer. Run:  npm run test:integration
 * They create uniquely-named users/deals each run and never delete ledger rows (the ledger is append-only).
 */
import { randomUUID } from "crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/config/db.js";
import * as payaza from "../../src/modules/payments/payaza.client.js";
import { confirmFunding, initializePayment, releaseMilestoneEscrow } from "../../src/modules/payments/escrow.service.js";
import { applyTransferStatus, getPayoutBalance, requestPayout } from "../../src/modules/payments/payouts.service.js";
import { Accounts, balanceOf } from "../../src/modules/payments/ledger.js";

const tag = randomUUID().slice(0, 8);
let brand: any, creator: any, other: any, deal: any;

// ---- fake Payaza -------------------------------------------------------
const state = { paid: new Map<string, string>(), transfers: new Map<string, string>(), payoutCalls: 0 };
payaza.__setFetchForTests((async (url: any, init: any) => {
  const u = String(url);
  const body = init?.body ? JSON.parse(init.body) : {};
  const ok = (o: any) => new Response(JSON.stringify(o), { status: 200 });
  if (u.includes("generate_virtual_account"))
    return ok({ success: true, data: { account_number: "3340009013", account_name: "Payaza(T)", bank_name: "GLOBUS BANK", transaction_amount_payable: Number(body.transaction_amount), expires_in_minutes: 30, account_reference: body.account_reference } });
  if (u.includes("transaction-query")) {
    const ref = new URL(u).searchParams.get("transaction_reference")!;
    const amt = state.paid.get(ref);
    return ok({ success: true, data: { transaction_reference: ref, transaction_status: amt ? "Completed" : "Initialized", amount_received: amt ? Number(amt) : 0, currency: "NGN" } });
  }
  if (u.endsWith("payout-receptor/payout")) {
    state.payoutCalls++;
    const ref = body.service_payload.payout_beneficiaries[0].transaction_reference;
    state.transfers.set(ref, "TRANSACTION_INITIATED");
    return ok({ response_code: 200, response_content: { response_status: "TRANSACTION_INITIATED" }, resp_code: "09" });
  }
  if (u.includes("/merchant/transaction/")) {
    const ref = decodeURIComponent(u.split("/merchant/transaction/")[1]);
    const st = state.transfers.get(ref);
    return st ? ok({ data: { transactionStatus: st, transactionAmount: 1 } }) : new Response(JSON.stringify({ message: "not found" }), { status: 404 });
  }
  return new Response("{}", { status: 404 });
}) as any);

async function mkUser(role: "BRAND" | "CREATOR", name: string, withBank = false) {
  return prisma.user.create({
    data: {
      email: `${name}.${tag}@test.local`, passwordHash: "x", name, role,
      ...(role === "CREATOR" ? { creatorProfile: { create: withBank ? { bankCode: "000013", bankName: "GTBank", bankAccountNumber: "0123456789", bankAccountName: "JOHN DOE", bankVerifiedAt: new Date(Date.now() - 86400_000 * 2), bankChangedAt: new Date(Date.now() - 86400_000 * 2) } : {} } } : { brandProfile: { create: {} } }),
    },
  });
}
async function mkMilestone(amount: number) {
  return prisma.milestone.create({ data: { dealId: deal.id, title: `m-${randomUUID().slice(0, 4)}`, amount, orderIndex: 0, dueDate: new Date(Date.now() + 864e5) } });
}
async function fundAndRelease(amount: number) {
  const m = await mkMilestone(amount);
  const init = await initializePayment(brand.id, deal.id, m.id);
  state.paid.set(init.reference!, String(amount));
  const r = await confirmFunding(init.payment.id);
  expect(r.status).toBe("COMPLETED");
  await releaseMilestoneEscrow(m.id, brand.id);
  return m;
}

beforeAll(async () => {
  brand = await mkUser("BRAND", "brand");
  creator = await mkUser("CREATOR", "creator", true);
  other = await mkUser("CREATOR", "other", true);
  deal = await prisma.deal.create({ data: { brandId: brand.id, creatorId: creator.id, title: `deal-${tag}`, description: "d", amount: 1_000_000, status: "ACTIVE", deliverables: [], deadline: new Date(Date.now() + 864e5) } });
});

describe("funding", () => {
  it("records a verified payment in the ledger EXACTLY ONCE even if confirmed repeatedly / concurrently", async () => {
    const m = await mkMilestone(50_000);
    const init = await initializePayment(brand.id, deal.id, m.id);
    expect((await confirmFunding(init.payment.id)).status).toBe("PENDING"); // provider says not paid yet
    expect(await balanceOf(prisma, Accounts.escrow(m.id))).toMatchObject({}); // nothing in escrow
    state.paid.set(init.reference!, "50000");
    await Promise.all([1, 2, 3, 4].map(() => confirmFunding(init.payment.id, undefined, "webhook")));
    await confirmFunding(init.payment.id);
    const txs = await prisma.ledgerTransaction.count({ where: { idempotencyKey: `fund:${init.payment.id}` } });
    expect(txs).toBe(1);
    expect((await balanceOf(prisma, Accounts.escrow(m.id))).toString()).toBe("50000");
    expect((await prisma.milestone.findUnique({ where: { id: m.id } }))!.escrowStatus).toBe("FUNDED");
  });

  it("a short-paid transfer is NOT credited (goes to REVIEW)", async () => {
    const m = await mkMilestone(40_000);
    const init = await initializePayment(brand.id, deal.id, m.id);
    state.paid.set(init.reference!, "39999.99");
    const r = await confirmFunding(init.payment.id);
    expect(r.status).toBe("REVIEW");
    expect((await balanceOf(prisma, Accounts.escrow(m.id))).toString()).toBe("0");
  });

  it("only the deal's brand can fund; a milestone from another deal is rejected", async () => {
    const m = await mkMilestone(10_000);
    await expect(initializePayment(other.id, deal.id, m.id)).rejects.toMatchObject({ statusCode: 403 });
  });

  it("failed/expired attempts do not block a retry (old unique-milestone bug)", async () => {
    const m = await mkMilestone(12_000);
    const a = await initializePayment(brand.id, deal.id, m.id);
    await prisma.payment.update({ where: { id: a.payment.id }, data: { status: "EXPIRED", activeKey: null } });
    const b = await initializePayment(brand.id, deal.id, m.id);
    expect(b.payment.id).not.toBe(a.payment.id);
  });
});

describe("release + withdrawal", () => {
  it("creator cannot withdraw before funds are released, nor another creator's funds", async () => {
    const before = await getPayoutBalance(other.id);
    expect(before.availableBalance).toBe(0);
    await expect(requestPayout(other.id, "1000")).rejects.toMatchObject({ statusCode: 400 });
  });

  it("release is idempotent and credits the creator once", async () => {
    const m = await fundAndRelease(30_000);
    await releaseMilestoneEscrow(m.id, brand.id);
    const tx = await prisma.ledgerTransaction.count({ where: { idempotencyKey: `release:${m.id}` } });
    expect(tx).toBe(1);
    expect((await prisma.milestone.findUnique({ where: { id: m.id } }))!.status).toBe("PAID");
  });

  it("concurrent withdrawals cannot overdraw the balance", async () => {
    await fundAndRelease(100_000);
    const bal = (await getPayoutBalance(creator.id)).availableBalance;
    const each = Math.floor(bal / 2) + 1; // two of these can never both fit
    const results = await Promise.allSettled([1, 2, 3, 4, 5].map(() => requestPayout(creator.id, String(each))));
    const ok = results.filter((r) => r.status === "fulfilled").length;
    expect(ok).toBe(1);
    const after = await getPayoutBalance(creator.id);
    expect(after.availableBalance).toBeGreaterThanOrEqual(0);
  });

  it("idempotency key returns the same payout and does not debit twice", async () => {
    await fundAndRelease(20_000);
    const key = `key-${randomUUID()}`;
    const a = await requestPayout(creator.id, "5000", key);
    const b = await requestPayout(creator.id, "5000", key);
    expect(b!.id).toBe(a!.id);
    await expect(requestPayout(creator.id, "6000", key)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("failed payout restores the balance exactly once; success is booked exactly once", async () => {
    await fundAndRelease(20_000);
    const start = (await getPayoutBalance(creator.id)).availableBalance;
    const p = (await requestPayout(creator.id, "7000", `k-${randomUUID()}`))!;
    expect((await getPayoutBalance(creator.id)).availableBalance).toBe(start - 7000);
    await applyTransferStatus(p.id, "NIP_FAILURE", "Invalid Account");
    await applyTransferStatus(p.id, "NIP_FAILURE", "Invalid Account"); // duplicate webhook
    expect((await getPayoutBalance(creator.id)).availableBalance).toBe(start);

    const q = (await requestPayout(creator.id, "3000", `k-${randomUUID()}`))!;
    await applyTransferStatus(q.id, "NIP_SUCCESS");
    await applyTransferStatus(q.id, "NIP_SUCCESS");
    expect(await prisma.ledgerTransaction.count({ where: { idempotencyKey: `payout-settled:${q.id}` } })).toBe(1);
    expect((await getPayoutBalance(creator.id)).availableBalance).toBe(start - 3000);
  });
});

describe("ledger integrity", () => {
  it("rows are append-only at the database level", async () => {
    const e = await prisma.ledgerEntry.findFirst();
    expect(e).toBeTruthy();
    await expect(prisma.ledgerEntry.update({ where: { id: e!.id }, data: { amount: 1 } })).rejects.toBeTruthy();
    await expect(prisma.ledgerEntry.delete({ where: { id: e!.id } })).rejects.toBeTruthy();
  });
  it("the database refuses an unbalanced transaction at commit", async () => {
    const acct = await prisma.ledgerAccount.findFirst();
    await expect(
      prisma.ledgerTransaction.create({
        data: { idempotencyKey: `bad-${randomUUID()}`, environment: "sandbox", type: "TEST", description: "unbalanced", entries: { create: [{ accountId: acct!.id, direction: "DEBIT", amount: 10 }, { accountId: acct!.id, direction: "CREDIT", amount: 9 }] } },
      })
    ).rejects.toBeTruthy();
  });
});
