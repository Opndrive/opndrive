'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/hooks/use-auth';
import { useNotification } from '@/context/notification-context';
import { SocialLoginButton } from '../social-login-buttons';
import Navbar from '@/components/landing-page/navbar';

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Please enter a valid email address'),
  password: z
    .string()
    .min(1, 'Password is required')
    .min(5, 'Password must be at least 5 characters'),
  rememberMe: z.boolean().default(false),
});

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loginAttempts, setLoginAttempts] = useState(0);
  const notification = useNotification();
  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', rememberMe: false },
  });

  const isAccountLocked = loginAttempts >= 5;

  async function onSubmit(values: z.infer<typeof loginSchema>) {
    if (isAccountLocked) {
      notification.error('Account temporarily locked. Please try again later.');
      return;
    }
    setIsLoading(true);

    try {
      const user = await login(values.email, values.password, notification);
      notification.success(`Welcome back!`);
      setLoginAttempts(0);
      if (values.rememberMe) {
        localStorage.setItem('rememberMe', 'true');
      }
      router.push(`/dashboard/${user.role}`);
    } catch (error: unknown) {
      setLoginAttempts((prev) => prev + 1);
      if (error instanceof Error && error.message?.includes('invalid_credentials')) {
        notification.error('Invalid email or password. Please try again.');
      } else {
        notification.error('An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Navbar showAuthButtons={false} />
      <main className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-foreground">Welcome Back</h1>
            <p className="text-muted-foreground">Login to access your cloud storage</p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input placeholder="Email" disabled={isLoading} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <div className="relative">
                      <FormControl>
                        <Input
                          type={showPassword ? 'text' : 'password'}
                          placeholder="Enter your password"
                          disabled={isLoading}
                          {...field}
                        />
                      </FormControl>
                      <button
                        type="button"
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                      </button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex items-center justify-between">
                <FormField
                  control={form.control}
                  name="rememberMe"
                  render={({ field }) => (
                    <FormItem className="flex items-center space-x-2">
                      <Checkbox
                        id="rememberMe"
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isLoading}
                      />
                      <label
                        htmlFor="rememberMe"
                        className="text-sm font-medium leading-none text-muted-foreground"
                      >
                        Remember me
                      </label>
                    </FormItem>
                  )}
                />
                <Button
                  type="button"
                  variant="link"
                  className="px-0 text-sm"
                  onClick={() => router.push('/auth/forgot-password')}
                >
                  Forgot password?
                </Button>
              </div>
              <Button type="submit" className="w-full h-11" disabled={isLoading || isAccountLocked}>
                {isLoading ? 'Logging in...' : 'Login'}
              </Button>
            </form>
          </Form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <Separator />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <SocialLoginButton provider="google" onClick={() => {}} disabled={isLoading} />
            <SocialLoginButton provider="apple" onClick={() => {}} disabled={isLoading} />
          </div>
          <p className="text-center text-sm text-muted-foreground">
            Don't have an account?{' '}
            <Button
              type="button"
              variant="link"
              className="px-0"
              onClick={() => router.push('/signup')}
            >
              Sign Up
            </Button>
          </p>
        </div>
      </main>
    </div>
  );
}
