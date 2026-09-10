import { prisma } from "../../config/db.js";
import { ApiError } from "../../utils/apiError.js";

export async function listNotifications(userId: string) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function unreadCount(userId: string) {
  return prisma.notification.count({ where: { userId, read: false } });
}

/**
 * markAsRead used to take only the notification ID and never checked that
 * the caller actually owned it — any authenticated user could mark any
 * other user's notification as read (IDOR). Now requires the owning
 * userId and 404s (not 403) on mismatch so it doesn't leak whether a
 * given notification ID exists for someone else.
 */
export async function markAsRead(notificationId: string, userId: string) {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
  });

  if (!notification || notification.userId !== userId) {
    throw ApiError.notFound("Notification");
  }

  return prisma.notification.update({
    where: { id: notificationId },
    data: { read: true },
  });
}

export async function markAllAsRead(userId: string) {
  await prisma.notification.updateMany({
    where: { userId, read: false },
    data: { read: true },
  });
}

/**
 * The single place that ever writes a notification. Before this, the
 * Notification model/endpoints existed but nothing in the codebase ever
 * called `prisma.notification.create` — deal proposals, milestone
 * approvals, payments, disputes, reviews and messages all happened
 * silently. Every write path below is now expected to call this.
 */
export type NotificationType =
  | "DEAL_PROPOSED"
  | "DEAL_ACCEPTED"
  | "DEAL_DECLINED"
  | "DEAL_COMPLETED"
  | "DEAL_CANCELLED"
  | "MILESTONE_ADDED"
  | "MILESTONE_SUBMITTED"
  | "MILESTONE_APPROVED"
  | "MILESTONE_REJECTED"
  | "PAYMENT_COMPLETED"
  | "PAYOUT_REQUESTED"
  | "PAYOUT_COMPLETED"
  | "PAYOUT_FAILED"
  | "DISPUTE_OPENED"
  | "DISPUTE_RESOLVED"
  | "REVIEW_RECEIVED"
  | "MESSAGE_RECEIVED";

export async function createNotification(params: {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    return await prisma.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        title: params.title,
        message: params.message,
        metadata: params.metadata as any,
      },
    });
  } catch (err) {
    // Notifications are best-effort — a failure here (e.g. bad userId)
    // should never roll back or block the action that triggered it.
    // eslint-disable-next-line no-console
    console.error("Failed to create notification:", err);
    return null;
  }
}
