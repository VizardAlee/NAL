import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

export async function approveRepayment(repaymentId: string) {
  const ref = doc(db, "repayments", repaymentId);

  await updateDoc(ref, {
    status: "Approved",
    approvedAt: serverTimestamp(),
  });
}

export async function rejectRepayment(
  repaymentId: string,
  reason?: string
) {
  const ref = doc(db, "repayments", repaymentId);

  await updateDoc(ref, {
    status: "Rejected",
    rejectionReason: reason ?? null,
    rejectedAt: serverTimestamp(),
  });
}
