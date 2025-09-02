// user roles
export type Role = 'admin' | 'sevadar' | 'user' | 'anon';

// user profile
export interface User {
  id: string; // UUID from Supabase
  email: string; // primary email
  role: Role; // permissions
  firstName?: string; // given name
  lastName?: string; // family name
  avatarUrl?: string;
  avatar?: string; // profile pic
}
