
import { type DocumentData, type Timestamp } from 'firebase/firestore';
import { type User as AuthUser } from 'firebase/auth';

export type Deal = DocumentData & {
  id: string;
  dealName: string;
  clientId: string;
  clientName: string;
  principal: number;
  profitRate: number;
  managementFeeRate?: number;
  managementFeeAmount?: number;
  managementFeePaid?: boolean;
  financingMode?: 'Murabaha' | 'Ijara' | 'Mudaraba';
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

// This combines the Firebase Auth user with our Firestore user data
export type User = AuthUser & DocumentData & {
    id: string;
    name: string;
    email: string;
    role: 'Admin' | 'Investor' | 'Client' | 'Legal' | 'Recovery' | 'Marketer';
    referralCode?: string;
    rating?: number;
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
