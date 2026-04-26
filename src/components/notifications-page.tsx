"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import {
  collection,
  doc,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { Bell, CheckCheck, ExternalLink } from "lucide-react";
import { useCollection, useFirestore, useUser } from "@/firebase";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { type AppNotification } from "@/components/notification-bell";

function formatNotificationDate(notification: AppNotification) {
  if (!notification.createdAt?.toDate) return "just now";
  return formatDistanceToNow(notification.createdAt.toDate(), { addSuffix: true });
}

export function NotificationsPage() {
  const firestore = useFirestore();
  const { user } = useUser();

  const notificationsQuery = useMemo(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, "notifications"),
      where("recipientId", "==", user.uid),
      orderBy("createdAt", "desc"),
      limit(100)
    );
  }, [firestore, user]);

  const { data: notifications, loading } = useCollection<AppNotification>(notificationsQuery);
  const unreadNotifications = notifications?.filter((notification) => !notification.read) || [];

  const markNotificationRead = async (notification: AppNotification) => {
    if (!firestore || notification.read) return;
    await updateDoc(doc(firestore, "notifications", notification.id), {
      read: true,
      readAt: serverTimestamp(),
    });
  };

  const markAllRead = async () => {
    if (!firestore || unreadNotifications.length === 0) return;
    const batch = writeBatch(firestore);
    unreadNotifications.forEach((notification) => {
      batch.update(doc(firestore, "notifications", notification.id), {
        read: true,
        readAt: serverTimestamp(),
      });
    });
    await batch.commit();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title="Notifications"
          description="Recent system alerts, request updates, payment reminders, and messages."
          icon={Bell}
        />
        <Button onClick={markAllRead} disabled={unreadNotifications.length === 0}>
          <CheckCheck className="mr-2 h-4 w-4" />
          Mark all read
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : notifications && notifications.length > 0 ? (
        <div className="space-y-3">
          {notifications.map((notification) => (
            <Card key={notification.id} className={notification.read ? "bg-background" : "border-primary/40 bg-primary/5"}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{notification.title}</h3>
                    {!notification.read && <Badge>Unread</Badge>}
                    {notification.category && <Badge variant="outline">{notification.category}</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">{notification.message}</p>
                  <p className="text-xs text-muted-foreground">{formatNotificationDate(notification)}</p>
                </div>
                <Button variant="outline" size="sm" asChild onClick={() => markNotificationRead(notification)}>
                  <Link href={notification.link}>
                    Open
                    <ExternalLink className="ml-2 h-3.5 w-3.5" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <Bell className="h-10 w-10 text-muted-foreground" />
            <div>
              <h3 className="font-semibold">No notifications yet</h3>
              <p className="text-sm text-muted-foreground">New alerts and request updates will appear here.</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
