
import { type DocumentData, type Timestamp } from 'firebase/firestore';

export type Deal = DocumentData & {
  id: string;
  dealName: string;
  clientId: string;
  clientName: string;
  principal: number;
  interestRate: number;
  durationValue: number;
  durationUnit: 'Days' | 'Weeks' | 'Fortnights' | 'Months' | 'Years';
  repaymentType: 'Equal Installments' | 'Balloon Payment';
  repaymentFrequency: 'Daily' | 'Weekly' | 'Fortnightly' | 'Monthly';
  status: 'Pending' | 'Active' | 'Completed' | 'Terminated';
  createdAt: Timestamp; // Firestore Timestamp object
};

export type Investment = DocumentData & {
  id: string;
  investorId: string;
  dealId: string;
  amount: number;
  createdAt: Timestamp;
};

    