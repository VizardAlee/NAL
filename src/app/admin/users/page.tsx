
'use client';

import { PageHeader } from '@/components/page-header';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PlusCircle, Users, ChevronRight } from 'lucide-react';
import { InviteUserForm } from './invite-user-form';
import { useState, useMemo } from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, type DocumentData } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouter } from 'next/navigation';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { useIsMobile } from '@/hooks/use-mobile';
import { canWriteAdmin, normalizeAccessModel } from '@/lib/access-control';


type User = DocumentData & {
  id: string;
  name: string;
  email: string;
  role: 'Admin' | 'Investor' | 'Client' | 'Legal' | 'Recovery' | 'Marketer';
  accessRole?: 'OWNER' | 'ADMIN' | 'STAFF' | 'USER';
  personas?: ('INVESTOR' | 'CLIENT' | 'LEGAL' | 'RECOVERY' | 'MARKETER' | 'STAFF_MEMBER')[];
  primaryPortal?: 'admin' | 'investor' | 'client' | 'legal' | 'recovery' | 'marketer';
};

function UsersTable({ users, loading }: { users: User[] | null, loading: boolean }) {
  const router = useRouter();
  const isMobile = useIsMobile();

  const handleRowClick = (userId: string) => {
    router.push(`/admin/users/${userId}`);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (!users || users.length === 0) {
    return (
      <div className="p-4 py-12 text-center text-sm text-muted-foreground border rounded-lg">
        No users found in this category.
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className="space-y-3">
        {users.map(user => (
          <Card key={user.id} onClick={() => handleRowClick(user.id)} className="cursor-pointer hover:bg-muted/50">
            <CardContent className="flex items-center gap-4 p-4">
              <Avatar className="h-12 w-12">
                <AvatarImage src={`https://picsum.photos/seed/${user.id}/128/128`} alt={user.name} />
                <AvatarFallback>{user.name??.charAt(0) || 'U'}</AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-1">
                <p className="font-medium">{user.name || 'Unknown User'}</p>
                <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                <div className="flex flex-wrap items-center gap-1">
                  <Badge variant={normalizeAccessModel(user).accessRole === 'ADMIN' ? 'default' : 'secondary'}>
                    {normalizeAccessModel(user).accessRole}
                  </Badge>
                  <Badge variant="outline">{user.role}</Badge>
                  {(normalizeAccessModel(user).personas || []).map((persona) => (
                    <Badge key={`${user.id}-${persona}`} variant="outline">{persona}</Badge>
                  ))}
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="rounded-lg border shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users?.map((user) => (
            <TableRow key={user.id} onClick={() => handleRowClick(user.id)} className="cursor-pointer">
              <TableCell data-label="Name" className="font-medium">
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarImage src={`https://picsum.photos/seed/${user.id}/128/128`} alt={user.name} />
                    <AvatarFallback>{user.name??.charAt(0) || 'U'}</AvatarFallback>
                  </Avatar>
                  <span>{user.name || 'Unknown User'}</span>
                </div>
              </TableCell>
              <TableCell data-label="Email">{user.email}</TableCell>
              <TableCell data-label="Role">
                <div className="flex flex-wrap gap-1">
                  <Badge variant={normalizeAccessModel(user).accessRole === 'ADMIN' ? 'default' : 'secondary'}>
                    {normalizeAccessModel(user).accessRole}
                  </Badge>
                  <Badge variant="outline">{user.role}</Badge>
                  {(normalizeAccessModel(user).personas || []).map((persona) => (
                    <Badge key={`${user.id}-${persona}`} variant="outline">{persona}</Badge>
                  ))}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}


export default function UsersPage() {
  const [isCreateUserOpen, setCreateUserOpen] = useState(false);
  const firestore = useFirestore();
  const { user } = useUser();

  const usersQuery = useMemo(() => {
    if (!firestore || !user) return null;
    return query(collection(firestore, 'users'));
  }, [firestore, user]);

  const { data: users, loading } = useCollection<User>(usersQuery);
  const canInvite = canWriteAdmin(user);

  const filteredUsers = useMemo(() => {
    const owners = users?.filter(u => normalizeAccessModel(u).accessRole === 'OWNER') || [];
    const staff = users?.filter(u => normalizeAccessModel(u).accessRole === 'STAFF' || normalizeAccessModel(u).personas.includes('STAFF_MEMBER')) || [];
    return {
      all: users,
      owners,
      staff,
      admin: users?.filter(u => u.role === 'Admin') || [],
      investor: users?.filter(u => u.role === 'Investor') || [],
      client: users?.filter(u => u.role === 'Client') || [],
      legal: users?.filter(u => u.role === 'Legal') || [],
      recovery: users?.filter(u => u.role === 'Recovery') || [],
      marketer: users?.filter(u => u.role === 'Marketer') || [],
    }
  }, [users]);

  const handleUserCreated = () => {
    setCreateUserOpen(false);
  };

  return (
    <div>
      <PageHeader
        title="User Management"
        description="Invite, view, and manage user profiles."
        icon={Users}
      >
        {canInvite && (
          <Dialog open={isCreateUserOpen} onOpenChange={setCreateUserOpen}>
            <DialogTrigger asChild>
              <Button>
                <PlusCircle className="mr-2 h-4 w-4" />
                Invite User
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite New User</DialogTitle>
              </DialogHeader>
              <InviteUserForm onInviteCreated={handleUserCreated} />
            </DialogContent>
          </Dialog>
        )}
      </PageHeader>

      <Tabs defaultValue="all" className="w-full">
        <TabsList className="grid w-full grid-cols-3 sm:grid-cols-9">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="owners">Owners</TabsTrigger>
          <TabsTrigger value="staff">Staff</TabsTrigger>
          <TabsTrigger value="admin">Admins</TabsTrigger>
          <TabsTrigger value="investor">Investors</TabsTrigger>
          <TabsTrigger value="client">Clients</TabsTrigger>
          <TabsTrigger value="marketer">Marketers</TabsTrigger>
          <TabsTrigger value="legal">Legal</TabsTrigger>
          <TabsTrigger value="recovery">Recovery</TabsTrigger>
        </TabsList>
        <TabsContent value="all" className="mt-4">
          <UsersTable users={filteredUsers.all} loading={loading} />
        </TabsContent>
        <TabsContent value="owners" className="mt-4">
          <UsersTable users={filteredUsers.owners} loading={loading} />
        </TabsContent>
        <TabsContent value="staff" className="mt-4">
          <UsersTable users={filteredUsers.staff} loading={loading} />
        </TabsContent>
        <TabsContent value="admin" className="mt-4">
          <UsersTable users={filteredUsers.admin} loading={loading} />
        </TabsContent>
        <TabsContent value="investor" className="mt-4">
          <UsersTable users={filteredUsers.investor} loading={loading} />
        </TabsContent>
        <TabsContent value="client" className="mt-4">
          <UsersTable users={filteredUsers.client} loading={loading} />
        </TabsContent>
        <TabsContent value="marketer" className="mt-4">
          <UsersTable users={filteredUsers.marketer} loading={loading} />
        </TabsContent>
        <TabsContent value="legal" className="mt-4">
          <UsersTable users={filteredUsers.legal} loading={loading} />
        </TabsContent>
        <TabsContent value="recovery" className="mt-4">
          <UsersTable users={filteredUsers.recovery} loading={loading} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
