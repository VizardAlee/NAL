
"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, type User as AuthUser } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { useAuth, useFirestore } from "@/firebase/provider";
import { type User } from "@/lib/types";
import {
  loadAuthenticatedProfileAction,
  type AuthenticatedProfile,
} from "@/app/login/actions";

function mergeAuthenticatedUser(
  authUser: AuthUser,
  profile?: AuthenticatedProfile | Record<string, unknown>
): User {
  const profileName =
    profile && 'name' in profile && typeof profile.name === 'string'
      ? profile.name
      : authUser.displayName;

  return {
    ...authUser,
    uid: authUser.uid,
    id: authUser.uid,
    email: authUser.email || '',
    displayName: profileName,
    ...profile,
  } as User;
}

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
        const loadServerProfile = async () => {
          try {
            const authToken = await authUser.getIdToken();
            const result = await loadAuthenticatedProfileAction({ authToken });
            setUser(
              result.success
                ? mergeAuthenticatedUser(authUser, result.profile)
                : mergeAuthenticatedUser(authUser)
            );
          } catch (error) {
            console.warn('Unable to load fallback user profile.', error);
            setUser(mergeAuthenticatedUser(authUser));
          } finally {
            setLoading(false);
          }
        };

        const userDocRef = doc(firestore, 'users', authUser.uid);

        unsubscribeFirestore = onSnapshot(userDocRef, (userDoc) => {
          if (userDoc.exists()) {
            const firestoreData = userDoc.data();
            setUser(mergeAuthenticatedUser(authUser, firestoreData));
            setLoading(false);
          } else {
            void loadServerProfile();
          }
        }, (err: any) => {
          if (err.code !== 'permission-denied') {
            console.error('Error fetching user document:', err);
          }
          void loadServerProfile();
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
