
'use server';

import { adminDb } from '@/firebase/admin-app';
import { FieldValue } from 'firebase-admin/firestore';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const addLogSchema = z.object({
  taskId: z.string().min(1),
  logText: z.string().min(1, 'Log entry cannot be empty.'),
  authorId: z.string().min(1),
  authorName: z.string().min(1),
});

export async function addRecoveryLogAction(input: z.infer<typeof addLogSchema>) {
  const validated = addLogSchema.safeParse(input);
  if (!validated.success) {
    return { success: false, message: 'Invalid data provided for log entry.' };
  }
  
  const { taskId, logText, authorId, authorName } = validated.data;

  try {
    const taskRef = adminDb.collection('recoveryTasks').doc(taskId);
    const taskDoc = await taskRef.get();
    if (!taskDoc.exists) {
        throw new Error("Recovery task not found.");
    }

    const logRef = taskRef.collection('logs').doc();
    const batch = adminDb.batch();

    // 1. Create the new log entry
    batch.set(logRef, {
        text: logText,
        authorId: authorId,
        authorName: authorName,
        createdAt: FieldValue.serverTimestamp(),
    });
    
    // 2. Update the parent task
    const taskUpdateData: { lastLog: string; updatedAt: FirebaseFirestore.FieldValue, assigneeId?: string, assigneeName?: string } = {
        lastLog: logText,
        updatedAt: FieldValue.serverTimestamp(),
    };

    // If the task is unassigned, assign it to the current user
    if (!taskDoc.data()?.assigneeId) {
        taskUpdateData.assigneeId = authorId;
        taskUpdateData.assigneeName = authorName;
    }

    batch.update(taskRef, taskUpdateData);

    await batch.commit();

    revalidatePath('/recovery/dashboard');
    revalidatePath('/legal/dashboard');

    return { success: true, message: 'Log entry added successfully.' };

  } catch (error: any) {
    console.error("ADD RECOVERY LOG ERROR:", error);
    return { success: false, message: error.message || 'An unknown error occurred.' };
  }
}
