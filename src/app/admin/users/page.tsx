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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PlusCircle, Users } from 'lucide-react';
import { CreateUserForm } from './create-user-form';
import { useState } from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';

export default function UsersPage() {
  const [isCreateUserOpen, setCreateUserOpen] = useState(false);
  // useFirestore now reliably returns a valid instance.
  const firestore = useFirestore();

  // No need for useMemo or null checks, as firestore is always available.
  const usersQuery = query(collection(firestore, 'users'));
  
  const { data: users, loading } = useCollection(usersQuery);

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
              <PlusCircle className="mr-2" />
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
              Array.from({ length: 3 }).map((_, i) => (
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
            {users?.map((user) => (
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
      </div>
    </div>
  );
}
