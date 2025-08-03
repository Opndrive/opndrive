import type { Metadata } from 'next';
import HomePage from './home/page';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: `Home - Opndrive`,
  };
}

export default async function RoleDashboardPage({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  const normalizedRole = role.toLowerCase();

  if (normalizedRole === 'admin') {
    return (
      <>
        <HomePage />
      </>
    );
  }

  return (
    <div className="flex h-full items-center justify-center">
      <h1 className="text-xl font-semibold text-destructive">
        Invalid dashboard role specified: {role}
      </h1>
    </div>
  );
}
