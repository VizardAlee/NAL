export type User = {
  id: string;
  name: string;
  email: string;
  role: 'Admin' | 'Investor' | 'Client';
  avatarUrl: string;
};

export const loggedInUser: User = {
  id: 'user-1',
  name: 'Admin User',
  email: 'admin@finhub.com',
  role: 'Admin',
  avatarUrl: 'https://picsum.photos/seed/user-1/40/40'
};
