export type Role = 'admin' | 'sevadar' | 'user' | 'anon';

export interface User {
  id: string;
  email: string;
  role: Role;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  avatar?: string;
}
