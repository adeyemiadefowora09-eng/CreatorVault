/**
 * src/types/messages.ts
 * Matches backend/src/modules/messages, mounted at
 * /api/v1/deals/:dealId/messages.
 */

export interface MessageSender {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface Message {
  id: string;
  dealId: string;
  senderId: string;
  body: string;
  read: boolean;
  createdAt: string;
  sender: MessageSender;
}
