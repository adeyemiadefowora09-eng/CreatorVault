import { PrismaClient, Prisma } from "@prisma/client";
import { prisma } from "../../config/db.js";

type PrismaTx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export class LedgerService {
  /**
   * Ensures a ledger account exists or creates it
   */
  async getOrCreateAccount(
    tx: PrismaTx,
    name: string,
    type: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE",
    userId?: string,
    currency = "NGN"
  ) {
    const existing = await tx.ledgerAccount.findUnique({ where: { name } });
    if (existing) return existing;

    return tx.ledgerAccount.create({
      data: {
        name,
        type,
        userId: userId || null,
        currency,
      },
    });
  }

  /**
   * Records Brand funds settling in CreatorVault Escrow
   * Debit: SYSTEM_PAYAZA_VAULT (Asset +)
   * Credit: SYSTEM_ESCROW_HOLDING (Liability +)
   */
  async recordEscrowHold(
    tx: PrismaTx,
    params: {
      reference: string;
      amount: number | Prisma.Decimal;
      currency?: string;
      dealId: string;
      milestoneId?: string;
    }
  ) {
    const currency = params.currency || "NGN";
    const amount = new Prisma.Decimal(params.amount);

    const vaultAccount = await this.getOrCreateAccount(tx, "SYSTEM_PAYAZA_VAULT", "ASSET", undefined, currency);
    const escrowAccount = await this.getOrCreateAccount(tx, "SYSTEM_ESCROW_HOLDING", "LIABILITY", undefined, currency);

    const transaction = await tx.ledgerTransaction.create({
      data: {
        reference: `LEDGER_HOLD_${params.reference}`,
        description: `Escrow Hold for Milestone ${params.milestoneId || params.dealId}`,
        entries: {
          create: [
            {
              accountId: vaultAccount.id,
              direction: "DEBIT",
              amount,
            },
            {
              accountId: escrowAccount.id,
              direction: "CREDIT",
              amount,
            },
          ],
        },
      },
    });

    return transaction;
  }

  /**
   * Records Escrow Release upon Brand approval
   * Debit: SYSTEM_ESCROW_HOLDING (grossAmount)
   * Credit: USER_PAYABLE_<creatorId> (netPayoutAmount)
   * Credit: SYSTEM_PLATFORM_REVENUE (feeAmount = 100 NGN)
   */
  async recordEscrowRelease(
    tx: PrismaTx,
    params: {
      reference: string;
      grossAmount: number | Prisma.Decimal;
      feeAmount: number | Prisma.Decimal;
      netPayoutAmount: number | Prisma.Decimal;
      creatorId: string;
      currency?: string;
      milestoneId: string;
    }
  ) {
    const currency = params.currency || "NGN";
    const gross = new Prisma.Decimal(params.grossAmount);
    const fee = new Prisma.Decimal(params.feeAmount);
    const net = new Prisma.Decimal(params.netPayoutAmount);

    const escrowAccount = await this.getOrCreateAccount(tx, "SYSTEM_ESCROW_HOLDING", "LIABILITY", undefined, currency);
    const creatorAccount = await this.getOrCreateAccount(tx, `USER_PAYABLE_${params.creatorId}`, "LIABILITY", params.creatorId, currency);
    const revenueAccount = await this.getOrCreateAccount(tx, "SYSTEM_PLATFORM_REVENUE", "REVENUE", undefined, currency);

    const transaction = await tx.ledgerTransaction.create({
      data: {
        reference: `LEDGER_RELEASE_${params.reference}`,
        description: `Escrow Release for Milestone ${params.milestoneId} (Net: ${net}, Fee: ${fee})`,
        entries: {
          create: [
            {
              accountId: escrowAccount.id,
              direction: "DEBIT",
              amount: gross,
            },
            {
              accountId: creatorAccount.id,
              direction: "CREDIT",
              amount: net,
            },
            {
              accountId: revenueAccount.id,
              direction: "CREDIT",
              amount: fee,
            },
          ],
        },
      },
    });

    return transaction;
  }

  /**
   * Records Withdrawal / Payout Disbursement from user balance to bank
   * Debit: USER_PAYABLE_<creatorId> (amount)
   * Credit: SYSTEM_PAYAZA_VAULT (amount)
   */
  async recordPayoutDisbursement(
    tx: PrismaTx,
    params: {
      reference: string;
      amount: number | Prisma.Decimal;
      creatorId: string;
      currency?: string;
    }
  ) {
    const currency = params.currency || "NGN";
    const amount = new Prisma.Decimal(params.amount);

    const creatorAccount = await this.getOrCreateAccount(tx, `USER_PAYABLE_${params.creatorId}`, "LIABILITY", params.creatorId, currency);
    const vaultAccount = await this.getOrCreateAccount(tx, "SYSTEM_PAYAZA_VAULT", "ASSET", undefined, currency);

    const transaction = await tx.ledgerTransaction.create({
      data: {
        reference: `LEDGER_PAYOUT_${params.reference}`,
        description: `Payout withdrawal to bank for Creator ${params.creatorId}`,
        entries: {
          create: [
            {
              accountId: creatorAccount.id,
              direction: "DEBIT",
              amount,
            },
            {
              accountId: vaultAccount.id,
              direction: "CREDIT",
              amount,
            },
          ],
        },
      },
    });

    return transaction;
  }

  /**
   * Reverses a failed payout disbursement (restores creator balance)
   * Debit: SYSTEM_PAYAZA_VAULT (amount)
   * Credit: USER_PAYABLE_<creatorId> (amount)
   */
  async recordPayoutFailureReversal(
    tx: PrismaTx,
    params: {
      reference: string;
      amount: number | Prisma.Decimal;
      creatorId: string;
      currency?: string;
      reason?: string;
    }
  ) {
    const currency = params.currency || "NGN";
    const amount = new Prisma.Decimal(params.amount);

    const vaultAccount = await this.getOrCreateAccount(tx, "SYSTEM_PAYAZA_VAULT", "ASSET", undefined, currency);
    const creatorAccount = await this.getOrCreateAccount(tx, `USER_PAYABLE_${params.creatorId}`, "LIABILITY", params.creatorId, currency);

    const transaction = await tx.ledgerTransaction.create({
      data: {
        reference: `LEDGER_REVERSAL_${params.reference}`,
        description: `Reversal of failed payout ${params.reference}: ${params.reason || "Provider rejected transfer"}`,
        entries: {
          create: [
            {
              accountId: vaultAccount.id,
              direction: "DEBIT",
              amount,
            },
            {
              accountId: creatorAccount.id,
              direction: "CREDIT",
              amount,
            },
          ],
        },
      },
    });

    return transaction;
  }

  /**
   * Records a refund of escrowed funds back to the brand
   * Debit: SYSTEM_ESCROW_HOLDING (amount)
   * Credit: SYSTEM_PAYAZA_VAULT (amount)
   */
  async recordEscrowRefund(
    tx: PrismaTx,
    params: {
      reference: string;
      amount: number | Prisma.Decimal;
      dealId: string;
      milestoneId?: string;
      currency?: string;
      reason?: string;
    }
  ) {
    const currency = params.currency || "NGN";
    const amount = new Prisma.Decimal(params.amount);

    const escrowAccount = await this.getOrCreateAccount(tx, "SYSTEM_ESCROW_HOLDING", "LIABILITY", undefined, currency);
    const vaultAccount = await this.getOrCreateAccount(tx, "SYSTEM_PAYAZA_VAULT", "ASSET", undefined, currency);

    const transaction = await tx.ledgerTransaction.create({
      data: {
        reference: `LEDGER_REFUND_${params.reference}`,
        description: `Refund for milestone ${params.milestoneId || params.dealId}: ${params.reason || "Dispute resolution / cancellation"}`,
        entries: {
          create: [
            {
              accountId: escrowAccount.id,
              direction: "DEBIT",
              amount,
            },
            {
              accountId: vaultAccount.id,
              direction: "CREDIT",
              amount,
            },
          ],
        },
      },
    });

    return transaction;
  }

  /**
   * Calculates immutable ledger balance for a user
   * Does NOT hide negative balances with Math.max(0, ...) so deficits are detected
   */
  async getCreatorLedgerBalance(userId: string): Promise<number> {
    const account = await prisma.ledgerAccount.findUnique({
      where: { name: `USER_PAYABLE_${userId}` },
      include: { entries: true },
    });

    if (!account) return 0;

    let balance = 0;
    for (const entry of account.entries) {
      if (entry.direction === "CREDIT") {
        balance += Number(entry.amount);
      } else if (entry.direction === "DEBIT") {
        balance -= Number(entry.amount);
      }
    }

    if (balance < 0) {
      console.error(`CRITICAL LEDGER WARNING: User ${userId} has negative balance: ${balance}`);
    }

    return balance;
  }
}

export const ledgerService = new LedgerService();
