
'use server';

import { adminDb } from '@/firebase/admin-app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import Papa from 'papaparse';
import { z } from 'zod';

type ActionResponse = {
  success: boolean;
  message: string;
  summary?: {
    total: number;
    success: number;
    failed: number;
  };
};

const fileSchema = z.instanceof(File);

async function parseCsv(file: File): Promise<any[]> {
  const text = await file.text();
  return new Promise((resolve, reject) => {
    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results.data),
      error: (error) => reject(error),
    });
  });
}

// --- USER IMPORT ACTION ---
export async function importUsersAction(
  prevState: any,
  formData: FormData
): Promise<ActionResponse> {
  const file = formData.get('csvFile');
  const validation = fileSchema.safeParse(file);

  if (!validation.success) {
    return { success: false, message: 'No file was uploaded.' };
  }

  try {
    const records = await parseCsv(validation.data);
    const auth = getAuth(adminDb.app);
    let successCount = 0;
    let failedCount = 0;

    for (const record of records) {
      if (!record.email || !record.name || !record.role) {
        failedCount++;
        continue;
      }

      try {
        const userExists = await auth
          .getUserByEmail(record.email)
          .catch(() => null);

        if (userExists) {
          // Update existing user if necessary
          const userDocRef = adminDb.collection('users').doc(userExists.uid);
          await userDocRef.set({
              name: record.name,
              email: record.email,
              role: record.role,
          }, { merge: true });
          await auth.setCustomUserClaims(userExists.uid, { role: record.role });

        } else {
          // Create new user
          const userRecord = await auth.createUser({
            email: record.email,
            displayName: record.name,
            password: `password_${Math.random().toString(36).slice(-8)}`,
            emailVerified: true,
          });

          await auth.setCustomUserClaims(userRecord.uid, { role: record.role });
          
          const userDocRef = adminDb.collection('users').doc(userRecord.uid);
          await userDocRef.set({
            name: record.name,
            email: record.email,
            role: record.role,
          });
        }
        successCount++;
      } catch (e) {
        console.error(`Failed to import user ${record.email}:`, e);
        failedCount++;
      }
    }

    return {
      success: true,
      message: 'User import process completed.',
      summary: { total: records.length, success: successCount, failed: failedCount },
    };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'An unknown error occurred' };
  }
}

// --- DEALS IMPORT ACTION ---
export async function importDealsAction(
  prevState: any,
  formData: FormData
): Promise<ActionResponse> {
  const file = formData.get('csvFile');
  const validation = fileSchema.safeParse(file);

  if (!validation.success) {
    return { success: false, message: 'No file was uploaded.' };
  }

  try {
    const records = await parseCsv(validation.data);
    let successCount = 0;
    let failedCount = 0;

    const auth = getAuth(adminDb.app);

    for (const record of records) {
      try {
        const client = await auth.getUserByEmail(record.clientEmail);
        if (!client) {
            failedCount++;
            continue;
        }

        await adminDb.collection('deals').add({
            dealName: record.dealName,
            clientId: client.uid,
            clientName: client.displayName || record.clientEmail,
            principal: parseFloat(record.principal),
            profitRate: parseFloat(record.profitRate),
            durationValue: parseInt(record.durationValue, 10),
            durationUnit: record.durationUnit,
            repaymentType: record.repaymentType,
            repaymentFrequency: record.repaymentFrequency,
            status: record.status,
            createdAt: record.createdAt ? new Date(record.createdAt) : FieldValue.serverTimestamp(),
        });
        successCount++;
      } catch (e) {
        console.error(`Failed to import deal ${record.dealName}:`, e);
        failedCount++;
      }
    }
    
    return {
      success: true,
      message: 'Deal import process completed.',
      summary: { total: records.length, success: successCount, failed: failedCount },
    };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'An unknown error occurred' };
  }
}

// --- INVESTMENTS IMPORT ACTION ---
export async function importInvestmentsAction(
  prevState: any,
  formData: FormData
): Promise<ActionResponse> {
  const file = formData.get('csvFile');
  const validation = fileSchema.safeParse(file);

  if (!validation.success) {
    return { success: false, message: 'No file was uploaded.' };
  }

  try {
    const records = await parseCsv(validation.data);
    let successCount = 0;
    let failedCount = 0;

    const auth = getAuth(adminDb.app);

    for (const record of records) {
      try {
        const investor = await auth.getUserByEmail(record.investorEmail);
        const dealsQuery = await adminDb.collection('deals').where('dealName', '==', record.dealName).limit(1).get();
        
        if (!investor || dealsQuery.empty) {
            failedCount++;
            continue;
        }
        const dealId = dealsQuery.docs[0].id;

        await adminDb.collection('investments').add({
            investorId: investor.uid,
            dealId: dealId,
            amount: parseFloat(record.amount),
            createdAt: record.createdAt ? new Date(record.createdAt) : FieldValue.serverTimestamp(),
        });

        successCount++;
      } catch (e) {
        console.error(`Failed to import investment for ${record.investorEmail} in ${record.dealName}:`, e);
        failedCount++;
      }
    }
    
    return {
      success: true,
      message: 'Investment import process completed.',
      summary: { total: records.length, success: successCount, failed: failedCount },
    };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'An unknown error occurred' };
  }
}
