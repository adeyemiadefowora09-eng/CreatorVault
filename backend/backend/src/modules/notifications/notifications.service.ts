import { prisma } from "../../config/db.js";

export async function listNotifications(userId: string) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" }
  });
}

export async function markAsRead(notificationId: string) {
  return prisma.notification.update({
    where: { id: notificationId },
    data: { read: true }
  });
}
