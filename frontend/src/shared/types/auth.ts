import type { User } from './user';
import type { NotificationContextType } from '@/context/notification-context';

export interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string, n: NotificationContextType) => Promise<User>;
  signup: (
    payload: { firstName: string; lastName: string; email: string; password: string },
    n: NotificationContextType
  ) => Promise<void>;
  logout: () => void;
}
