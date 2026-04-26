"use client";

import React, { useEffect, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, CheckCheck, Circle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type Timestamp,
} from "firebase/firestore";
import { useCollection, useFirestore, useUser } from "@/firebase";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

export type AppNotification = {
  id: string;
  recipientId: string;
  title: string;
  message: string;
  link: string;
  category?: "approval" | "message" | "repayment" | "overdue" | "system" | "request-status";
  read: boolean;
  createdAt?: Timestamp;
  readAt?: Timestamp;
};

function formatNotificationDate(value?: Timestamp) {
  if (!value?.toDate) return "just now";
  return formatDistanceToNow(value.toDate(), { addSuffix: true });
}

export function useClearNotificationsByPath() {
  const firestore = useFirestore();
  const pathname = usePathname();
  const { user } = useUser();

  useEffect(() => {
    if (!firestore || !pathname || !user) return;

    const timer = setTimeout(async () => {
      const notificationsToClearQuery = query(
        collection(firestore, "notifications"),
        where("recipientId", "==", user.uid),
        where("link", "==", pathname),
        where("read", "==", false)
      );

      const snapshot = await getDocs(notificationsToClearQuery);
      if (snapshot.empty) return;

      const batch = writeBatch(firestore);
      snapshot.docs.forEach((notificationDoc) => {
        batch.update(notificationDoc.ref, {
          read: true,
          readAt: serverTimestamp(),
        });
      });

      await batch.commit();
    }, 500);

    return () => clearTimeout(timer);
  }, [firestore, pathname, user]);
}

export function NotificationBell({ historyHref }: { historyHref: string }) {
  const firestore = useFirestore();
  const router = useRouter();
  const { user } = useUser();

  useClearNotificationsByPath();

  const notificationsQuery = useMemo(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, "notifications"),
      where("recipientId", "==", user.uid),
      where("read", "==", false),
      orderBy("createdAt", "desc"),
      limit(20)
    );
  }, [firestore, user]);

  const { data: notifications } = useCollection<AppNotification>(notificationsQuery);
  const unreadCount = notifications?.length || 0;

  const handleNotificationClick = async (notification: AppNotification) => {
    if (!firestore) return;

    await updateDoc(doc(firestore, "notifications", notification.id), {
      read: true,
      readAt: serverTimestamp(),
    });
    router.push(notification.link);
  };

  const markAllRead = async () => {
    if (!firestore || !notifications?.length) return;

    const batch = writeBatch(firestore);
    notifications.forEach((notification) => {
      batch.update(doc(firestore, "notifications", notification.id), {
        read: true,
        readAt: serverTimestamp(),
      });
    });
    await batch.commit();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative rounded-full">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge className="absolute -right-1 -top-1 h-5 min-w-5 px-1 text-[10px]">
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
          <span className="sr-only">Open notifications</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={markAllRead}>
              <CheckCheck className="mr-1 h-3.5 w-3.5" />
              Mark all
            </Button>
          )}
        </div>
        <DropdownMenuSeparator />
        <ScrollArea className="max-h-96">
          <div className="p-1">
            {notifications && notifications.length > 0 ? (
              notifications.map((notification) => (
                <DropdownMenuItem
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className="flex cursor-pointer items-start gap-3"
                >
                  <Circle className="mt-1.5 h-2 w-2 fill-primary text-primary" />
                  <div className="grid gap-1">
                    <p className="font-medium">{notification.title}</p>
                    <p className="text-xs text-muted-foreground">{notification.message}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatNotificationDate(notification.createdAt)}
                    </p>
                  </div>
                </DropdownMenuItem>
              ))
            ) : (
              <DropdownMenuItem disabled>No new notifications</DropdownMenuItem>
            )}
          </div>
        </ScrollArea>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push(historyHref)} className="cursor-pointer justify-center">
          View notification history
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
