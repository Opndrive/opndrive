import { redirect } from 'next/navigation';

export default function LandingPage() {
  const cognitoLoginUrl = process.env.NEXT_PUBLIC_COGNITO_REDIRECT_URI;

  if (cognitoLoginUrl) {
    redirect(cognitoLoginUrl);
  }

  redirect('/login');
}
