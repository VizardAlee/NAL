

import { type DocumentData, type Timestamp } from 'firebase/firestore';

export type Deal = DocumentData & {
  id: string;
  dealName: string;
  clientId: string;
  clientName: string;
  principal: number;
  profitRate: number;
  durationValue: number;
  durationUnit: 'Days' | 'Weeks' | 'Fortnights' | 'Months' | 'Years';
  repaymentType: 'Equal Installments' | 'Balloon Payment';
  repaymentFrequency: 'Daily' | 'Weekly' | 'Fortnightly' | 'Monthly';
  status: 'Pending' | 'Active' | 'Completed' | 'Terminated';
  createdAt: Timestamp; // Firestore Timestamp object
  startDate?: Timestamp; // The official start date of the financing term
};

export type Investment = DocumentData & {
  id: string;
  investorId: string;
  dealId: string;
  amount: number;
  createdAt: Timestamp;
};

export type User = DocumentData & {
    id: string;
    name: string;
    email: string;
    role: 'Admin' | 'Investor' | 'Client';
};

export type Repayment = DocumentData & {
  id: string;
  dealId: string;
  amount: number;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
  lodgedAt: Timestamp;
  dueDate: Timestamp;
  installmentNumber: number;
};
