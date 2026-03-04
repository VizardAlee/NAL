
'use server';

import { sendMessageAction as commonSendMessageAction } from '@/app/common/actions/chat-actions';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';

const messageSchema = z.object({
  authToken: z.string().min(1),
  conversationId: z.string().min(1),
  senderId: z.string().min(1),
  text: z.string().optional(),
  attachmentUrl: z.string().optional(),
  attachmentName: z.string().optional(),
});

export async function sendMessageAction(input: z.infer<typeof messageSchema>) {
  const result = await commonSendMessageAction(input);

  if (result.success) {
    // Revalidate the path to show the new message instantly
    revalidatePath(`/investor/messages/${input.conversationId}`);
    revalidatePath(`/investor/messages`); // Also revalidate inbox to update last message
  }

  return result;
}

    
