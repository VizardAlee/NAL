
'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { useUser, useFirestore } from '@/firebase';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
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
    const firestore = useFirestore();
    const [permission, setPermission] = useState<NotificationPermission>('default');
    const [isSubscribing, setIsSubscribing] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        if ('Notification' in window) {
            setPermission(Notification.permission);
        }
    }, []);

    const requestPermission = useCallback(async () => {
        if (!('Notification' in window) || !('serviceWorker' in navigator) || !user) {
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
                const messaging = getMessaging();
                const currentToken = await getToken(messaging, {
                    vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
                });

                if (currentToken) {
                    await saveFcmToken(user.uid, currentToken);
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
    }, [user, toast]);

    useEffect(() => {
        if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
            const messaging = getMessaging();
            const unsubscribe = onMessage(messaging, (payload) => {
                console.log('Foreground message received.', payload);
                const notificationTitle = payload.notification?.title || 'New Notification';
                const notificationOptions = {
                    body: payload.notification?.body,
                    icon: payload.notification?.icon,
                };
                new Notification(notificationTitle, notificationOptions);
            });
            return () => unsubscribe();
        }
    }, []);

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
