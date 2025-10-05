import '@/app/globals.css';
import { AuthProvider } from '@/context/auth-context';
import { NotificationProvider } from '@/context/notification-context';
import { UploadProvider } from '@/features/upload/context/upload-context';
import { ThemeProvider } from '@/providers/theme-provider';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <title>Opndrive</title>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  const storageKey = 'ui-theme';
                  const theme = localStorage.getItem(storageKey);
                  const root = document.documentElement;
                  
                  if (theme === 'dark') {
                    root.setAttribute('data-theme', 'dark');
                  } else if (theme === 'light') {
                    root.setAttribute('data-theme', 'light');
                  } else {
                    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                    root.setAttribute('data-theme', systemTheme);
                  }
                } catch (e) {
                  // Theme setup failed, use default
                }
              })();
            `,
          }}
        />
      </head>
      <body>
        <AuthProvider>
          <ThemeProvider defaultTheme="system" storageKey="ui-theme">
            <UploadProvider>
              <NotificationProvider>{children}</NotificationProvider>
            </UploadProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
