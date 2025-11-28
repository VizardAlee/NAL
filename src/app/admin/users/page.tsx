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

// Mock data for now. This will be replaced with Firestore data.
const mockUsers = [
  { id: '1', name: 'Alice Investor', email: 'alice@example.com', role: 'Investor' },
  { id: '2', name: 'Bob Client', email: 'bob@example.com', role: 'Client' },
  { id: '3', name: 'Charlie Investor', email: 'charlie@example.com', role: 'Investor' },
];


export default function UsersPage() {
  const [isCreateUserOpen, setCreateUserOpen] = useState(false);
  const [users, setUsers] = useState(mockUsers); // Later, this will come from useCollection

  const handleUserCreated = (newUser: any) => {
    // This is a mock update. In the future, Firestore's real-time updates will handle this automatically.
    setUsers(currentUsers => [...currentUsers, { ...newUser, id: (Math.random() * 1000).toString() }]);
    setCreateUserOpen(false);
  }

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
            {users.map((user) => (
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
