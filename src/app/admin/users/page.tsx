
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
import { PlusCircle, Users } from 'lucide-react';
import { CreateUserForm } from './create-user-form';
import { useState, useMemo } from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, type DocumentData } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';

type User = DocumentData & {
    id: string;
    name: string;
    email: string;
    role: 'Admin' | 'Investor' | 'Client';
};

function UsersTable({ users, loading }: { users: User[] | null, loading: boolean }) {
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
          {loading &&
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell>
                  <Skeleton className="h-5 w-32" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-5 w-40" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-5 w-20" />
                </TableCell>
              </TableRow>
            ))}
          {!loading && users?.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="font-medium">{user.name}</TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell>
                <Badge variant={user.role === 'Admin' ? 'default' : 'secondary'}>
                  {user.role}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
       {!loading && users?.length === 0 && (
        <div className="p-4 text-center text-sm text-muted-foreground">
            No users found.
        </div>
       )}
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

  const filteredUsers = useMemo(() => {
    return {
      all: users,
      admin: users?.filter(u => u.role === 'Admin') || [],
      investor: users?.filter(u => u.role === 'Investor') || [],
      client: users?.filter(u => u.role === 'Client') || [],
    }
  }, [users]);

  const handleUserCreated = () => {
    setCreateUserOpen(false);
  };

  return (
    <div>
      <PageHeader
        title="User Management"
        description="Add, view, and manage investor and client profiles."
        icon={Users}
      >
        <Dialog open={isCreateUserOpen} onOpenChange={setCreateUserOpen}>
          <DialogTrigger asChild>
            <Button>
              <PlusCircle className="mr-2 h-4 w-4" />
              Create User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New User</DialogTitle>
            </DialogHeader>
            <CreateUserForm onUserCreated={handleUserCreated} />
          </DialogContent>
        </Dialog>
      </PageHeader>
      
      <Tabs defaultValue="all" className="w-full">
        <TabsList>
          <TabsTrigger value="all">All Users</TabsTrigger>
          <TabsTrigger value="admin">Admins</TabsTrigger>
          <TabsTrigger value="investor">Investors</TabsTrigger>
          <TabsTrigger value="client">Clients</TabsTrigger>
        </TabsList>
        <TabsContent value="all" className="mt-4">
           <UsersTable users={filteredUsers.all} loading={loading} />
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
      </Tabs>
    </div>
  );
}
