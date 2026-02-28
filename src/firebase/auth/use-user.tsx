
"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, type User as AuthUser } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { useAuth, useFirestore } from "@/firebase/provider";
import { type User } from "@/lib/types";

export function useUser() {
  const auth = useAuth();
  const firestore = useFirestore();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth || !firestore) {
      setUser(null);
      setLoading(false);
      return;
    }

    let unsubscribeFirestore: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, (authUser: AuthUser | null) => {
      if (unsubscribeFirestore) {
        unsubscribeFirestore();
        unsubscribeFirestore = undefined;
      }

      if (authUser) {
        const userDocRef = doc(firestore, 'users', authUser.uid);

        unsubscribeFirestore = onSnapshot(userDocRef, (userDoc) => {
          if (userDoc.exists()) {
            const firestoreData = userDoc.data();
            setUser({
              ...authUser,
              id: authUser.uid,
              ...firestoreData,
            } as User);
          } else {
            // User exists in Auth but not Firestore. This can happen during signup.
            // We provide a basic user object, but roles might not work until the doc is created.
            setUser(authUser as User);
          }
          setLoading(false);
        }, (err: any) => {
          if (err.code !== 'permission-denied') {
            console.error('Error fetching user document:', err);
          }
          setLoading(false); // Ensure loading is set to false even on error
        });

      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      if (unsubscribeFirestore) unsubscribeFirestore();
      unsubscribeAuth();
    };
  }, [auth, firestore]);

  return { user, loading };
}
