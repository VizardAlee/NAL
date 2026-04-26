
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
import { Input } from '@/components/ui/input';


type User = DocumentData & {
  id: string;
  name: string;
  email: string;
  role: 'Admin' | 'Investor' | 'Client' | 'Legal' | 'Recovery' | 'Marketer';
  accessRole?: 'OWNER' | 'ADMIN' | 'STAFF' | 'USER';
  personas?: ('INVESTOR' | 'CLIENT' | 'LEGAL' | 'RECOVERY' | 'MARKETER' | 'STAFF_MEMBER')[];
  primaryPortal?: 'owner' | 'admin' | 'investor' | 'client' | 'legal' | 'recovery' | 'marketer';
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
                <AvatarFallback>{user.name?.charAt(0) || 'U'}</AvatarFallback>
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
                    <AvatarFallback>{user.name?.charAt(0) || 'U'}</AvatarFallback>
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
  const [searchTerm, setSearchTerm] = useState('');
  const firestore = useFirestore();
  const { user } = useUser();

  const usersQuery = useMemo(() => {
    if (!firestore || !user) return null;
    return query(collection(firestore, 'users'));
  }, [firestore, user]);

  const { data: users, loading } = useCollection<User>(usersQuery);
  const canInvite = canWriteAdmin(user);

  const searchableUsers = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const allUsers = users || [];

    if (!normalizedSearch) return allUsers;

    return allUsers.filter((u) => {
      const model = normalizeAccessModel(u);
      return [
        u.name,
        u.email,
        u.role,
        model.accessRole,
        model.primaryPortal,
        ...(model.personas || []),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedSearch));
    });
  }, [searchTerm, users]);

  const filteredUsers = useMemo(() => {
    const owners = searchableUsers.filter(u => normalizeAccessModel(u).accessRole === 'OWNER');
    const staff = searchableUsers.filter(u => normalizeAccessModel(u).accessRole === 'STAFF' || normalizeAccessModel(u).personas.includes('STAFF_MEMBER'));
    return {
      all: searchableUsers,
      owners,
      staff,
      admin: searchableUsers.filter(u => u.role === 'Admin'),
      investor: searchableUsers.filter(u => u.role === 'Investor'),
      client: searchableUsers.filter(u => u.role === 'Client'),
      legal: searchableUsers.filter(u => u.role === 'Legal'),
      recovery: searchableUsers.filter(u => u.role === 'Recovery'),
      marketer: searchableUsers.filter(u => u.role === 'Marketer'),
    }
  }, [searchableUsers]);

  const handleUserCreated = () => {
    // Keep dialog open after link generation so admin can copy/share the invite URL.
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
            <DialogContent className="max-h-[90vh] h-[85vh] p-0 overflow-hidden flex flex-col sm:max-w-xl">
              <DialogHeader className="p-6 pb-2 border-b shrink-0">
                <DialogTitle>Invite New User</DialogTitle>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto p-6 pt-4">
                <InviteUserForm onInviteCreated={handleUserCreated} />
              </div>
            </DialogContent>
          </Dialog>
        )}
      </PageHeader>

      <div className="mb-4">
        <Input
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search users by name, email, role, or persona"
        />
      </div>

      <Tabs defaultValue="all" className="w-full">
        <TabsList className="flex h-auto w-full justify-start overflow-x-auto">
          <TabsTrigger value="all">All ({filteredUsers.all.length})</TabsTrigger>
          <TabsTrigger value="owners">Owners ({filteredUsers.owners.length})</TabsTrigger>
          <TabsTrigger value="staff">Staff ({filteredUsers.staff.length})</TabsTrigger>
          <TabsTrigger value="admin">Admins ({filteredUsers.admin.length})</TabsTrigger>
          <TabsTrigger value="investor">Investors ({filteredUsers.investor.length})</TabsTrigger>
          <TabsTrigger value="client">Clients ({filteredUsers.client.length})</TabsTrigger>
          <TabsTrigger value="marketer">Marketers ({filteredUsers.marketer.length})</TabsTrigger>
          <TabsTrigger value="legal">Legal ({filteredUsers.legal.length})</TabsTrigger>
          <TabsTrigger value="recovery">Recovery ({filteredUsers.recovery.length})</TabsTrigger>
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
