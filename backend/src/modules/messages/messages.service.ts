import { prisma } from "../../config/db.js";
import { ApiError } from "../../utils/apiError.js";
import { getPaginationMeta } from "../../types/index.js";
import { createNotification } from "../notifications/notifications.service.js";
import { SendMessageInput, ListMessagesQuery } from "./messages.validation.js";

async function verifyDealParty(dealId: string, userId: string) {
  const deal = await prisma.deal.findUnique({ where: { id: dealId } });
  if (!deal) throw ApiError.notFound("Deal");

  if (deal.creatorId !== userId && deal.brandId !== userId) {
    throw ApiError.forbidden("You are not a party to this deal");
  }

  return deal;
}

/**
 * Previously the only way to "contact" the other party on a deal was to
 * copy their raw user ID from Discover. This is the actual chat thread,
 * scoped to a deal (so both sides always know what they're discussing).
 */
export async function sendMessage(dealId: string, userId: string, data: SendMessageInput) {
  const deal = await verifyDealParty(dealId, userId);

  const message = await prisma.message.create({
    data: {
      dealId,
      senderId: userId,
      body: data.body,
    },
    include: {
      sender: { select: { id: true, name: true, avatarUrl: true } },
    },
  });

  const recipientId = userId === deal.creatorId ? deal.brandId : deal.creatorId;
  await createNotification({
    userId: recipientId,
    type: "MESSAGE_RECEIVED",
    title: "New message",
    message: `You have a new message on "${deal.title}".`,
    metadata: { dealId, messageId: message.id },
  });

  return message;
}

export async function listMessages(dealId: string, userId: string, query: ListMessagesQuery) {
  await verifyDealParty(dealId, userId);

  const { page, limit } = query;
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    prisma.message.findMany({
      where: { dealId },
      include: { sender: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.message.count({ where: { dealId } }),
  ]);

  // Mark the other party's messages as read now that this user has fetched
  // the thread.
  await prisma.message.updateMany({
    where: { dealId, senderId: { not: userId }, read: false },
    data: { read: true },
  });

  return {
    items: items.reverse(), // oldest first for chat display
    meta: getPaginationMeta(page, limit, total),
  };
}

export async function unreadMessageCount(userId: string) {
  return prisma.message.count({
    where: {
      senderId: { not: userId },
      read: false,
      deal: { OR: [{ creatorId: userId }, { brandId: userId }] },
    },
  });
}
