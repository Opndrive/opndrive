import type { User } from './user';
import type { NotificationContextType } from '@/context/notification-context';

export interface AuthContextType {
  user: User | null; // current user
  isLoading: boolean; // auth check in progress
  login: (email: string, password: string, n: NotificationContextType) => Promise<User>;
  signup: (
    payload: { firstName: string; lastName: string; email: string; password: string },
    n: NotificationContextType
  ) => Promise<void>;
  logout: () => void;
}
