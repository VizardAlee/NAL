
import { type DocumentData, type Timestamp } from 'firebase/firestore';
import { type User as AuthUser } from 'firebase/auth';
import { type AccessRole, type Persona, type PrimaryPortal } from '@/lib/access-control';

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
  wakalahGranted?: boolean;
  wakalahAssetDescription?: string;
  wakalahSupplierName?: string;
  guarantorName?: string;
  guarantorAddress?: string;
  guarantorPhoneNumber?: string;
  guarantorOccupation?: string;
  guarantorPhotoURL?: string;
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
  fundBatchId?: string;
  amount: number;
  createdAt: Timestamp;
  specialInvestment?: boolean;
};

// This combines the Firebase Auth user with our Firestore user data
export type User = AuthUser & DocumentData & {
    id: string;
    name: string;
    email: string;
    role: 'Admin' | 'Investor' | 'Client' | 'Legal' | 'Recovery' | 'Marketer';
    roles?: Array<'Admin' | 'Investor' | 'Client' | 'Legal' | 'Recovery' | 'Marketer'>;
    accessRole?: AccessRole;
    personas?: Persona[];
    primaryPortal?: PrimaryPortal;
    isMuslim?: boolean;
    referralCode?: string;
    rating?: number;
    photoURL?: string;
    photoStoragePath?: string;
    address?: string;
    bankName?: string;
    bankAccountName?: string;
    bankAccountNumber?: string;
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
