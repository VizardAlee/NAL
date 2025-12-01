
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
import { CreateUserForm } from './create-user-form';
import { useState, useMemo } from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, type DocumentData } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouter } from 'next/navigation';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { useIsMobile } from '@/hooks/use-mobile';


type User = DocumentData & {
    id: string;
    name: string;
    email: string;
    role: 'Admin' | 'Investor' | 'Client';
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
                              <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 space-y-1">
                              <p className="font-medium">{user.name}</p>
                              <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                              <Badge variant={user.role === 'Admin' ? 'default' : 'secondary'}>{user.role}</Badge>
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
                        <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <span>{user.name}</span>
                </div>
              </TableCell>
              <TableCell data-label="Email">{user.email}</TableCell>
              <TableCell data-label="Role">
                <Badge variant={user.role === 'Admin' ? 'default' : 'secondary'}>
                  {user.role}
                </Badge>
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

    

    