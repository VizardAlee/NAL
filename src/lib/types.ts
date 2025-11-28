
import { type DocumentData, type Timestamp } from 'firebase/firestore';

export type Deal = DocumentData & {
  id: string;
  dealName: string;
  clientId: string;
  clientName: string;
  principal: number;
  interestRate: number;
  duration: number;
  repaymentType: 'Equal Installments' | 'Balloon Payment';
  status: 'Pending' | 'Active' | 'Completed' | 'Terminated';
  createdAt: string; // Stored as a server-generated Timestamp, but comes to client as string
};
