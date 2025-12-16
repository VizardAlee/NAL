
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
    const unsubscribeAuth = onAuthStateChanged(auth, (authUser: AuthUser | null) => {
      if (authUser) {
        const userDocRef = doc(firestore, 'users', authUser.uid);
        
        const unsubscribeFirestore = onSnapshot(userDocRef, (userDoc) => {
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
        });

        return () => unsubscribeFirestore();
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, [auth, firestore]);

  return { user, loading };
}
