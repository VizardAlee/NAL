
'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { useUser, useFirebase } from '@/firebase';
import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';
import { saveFcmToken } from '@/app/common/actions/notification-actions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Loader2, Bell } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type NotificationContextType = {
    permission: NotificationPermission;
    requestPermission: () => void;
    isSubscribing: boolean;
};

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
    const { user } = useUser();
    const { app } = useFirebase();
    const [permission, setPermission] = useState<NotificationPermission>('default');
    const [isSubscribing, setIsSubscribing] = useState(false);
    const [messagingSupported, setMessagingSupported] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        if ('Notification' in window) {
            setPermission(Notification.permission);
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        const checkSupport = async () => {
            const supported = app ? await isSupported() : false;
            if (!cancelled) {
                setMessagingSupported(supported);
            }
        };
        void checkSupport();
        return () => {
            cancelled = true;
        };
    }, [app]);

    const requestPermission = useCallback(async () => {
        if (!('Notification' in window) || !('serviceWorker' in navigator) || !user || !app || !messagingSupported) {
            return;
        }

        if (Notification.permission === 'granted') {
             toast({ title: 'Success', description: 'Notifications are already enabled.' });
            return;
        }
        if (Notification.permission === 'denied') {
             toast({ variant: 'destructive', title: 'Error', description: 'Notifications are blocked. Please enable them in your browser settings.' });
            return;
        }

        setIsSubscribing(true);
        try {
            const permissionResult = await Notification.requestPermission();
            setPermission(permissionResult);

            if (permissionResult === 'granted') {
                const messaging = getMessaging(app);
                const serviceWorkerRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
                    scope: '/',
                    updateViaCache: 'none',
                });
                const currentToken = await getToken(messaging, {
                    vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
                    serviceWorkerRegistration,
                });

                if (currentToken) {
                    const authToken = await user.getIdToken();
                    await saveFcmToken({ authToken, userId: user.uid, token: currentToken });
                    toast({ title: 'Success', description: 'Browser notifications have been enabled.' });
                } else {
                     toast({ variant: 'destructive', title: 'Error', description: 'Could not get notification token. Please try again.' });
                }
            }
        } catch (error) {
            console.error('Error requesting notification permission:', error);
            toast({ variant: 'destructive', title: 'Error', description: 'Failed to enable notifications.' });
        } finally {
            setIsSubscribing(false);
        }
    }, [user, toast, app, messagingSupported]);

    useEffect(() => {
        if (typeof window !== 'undefined' && 'serviceWorker' in navigator && app && messagingSupported) {
            const messaging = getMessaging(app);
            const unsubscribe = onMessage(messaging, (payload) => {
                const notificationTitle = payload.notification?.title || 'New Notification';
                const description = payload.notification?.body || 'Open notifications to view details.';
                toast({ title: notificationTitle, description });
            });
            return () => unsubscribe();
        }
    }, [app, messagingSupported, toast]);

    return (
        <NotificationContext.Provider value={{ permission, requestPermission, isSubscribing }}>
            {children}
        </NotificationContext.Provider>
    );
}

export const useNotification = () => {
    const context = useContext(NotificationContext);
    if (context === undefined) {
        throw new Error('useNotification must be used within a NotificationProvider');
    }
    return context;
};

// A reusable UI component for settings pages
export function NotificationSettingsCard() {
    const { permission, requestPermission, isSubscribing } = useNotification();

    return (
         <Card>
            <CardHeader>
                <CardTitle>Browser Notifications</CardTitle>
                <CardDescription>Receive push notifications for important events directly in your browser.</CardDescription>
            </CardHeader>
            <CardContent>
                {permission === 'granted' ? (
                    <p className="text-sm text-green-600 font-medium">You have enabled browser notifications.</p>
                ) : (
                    <Button onClick={requestPermission} disabled={isSubscribing || permission === 'denied'}>
                        {isSubscribing ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Bell className="mr-2 h-4 w-4" />}
                        {permission === 'denied' ? 'Notifications Blocked' : 'Enable Notifications'}
                    </Button>
                )}
                 {permission === 'denied' && (
                    <p className="text-xs text-muted-foreground mt-2">You have blocked notifications. To enable them, you need to go to your browser's site settings.</p>
                )}
            </CardContent>
        </Card>
    )
}
