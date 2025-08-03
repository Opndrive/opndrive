import { Button } from '@/components/ui/button';
import { FcGoogle } from 'react-icons/fc';
import { FaApple } from 'react-icons/fa6';

export function SocialLoginButton({
  provider,
  onClick,
  disabled,
}: {
  provider: 'google' | 'apple';
  onClick: () => void;
  disabled: boolean;
}) {
  const isGoogle = provider === 'google';

  const icon = isGoogle ? (
    <FcGoogle className="h-5 w-5" />
  ) : (
    <FaApple className="h-5 w-5 text-foreground" />
  );

  return (
    <Button
      type="button"
      variant="outline"
      className="flex h-11 w-full items-center justify-center gap-2 border border-border transition-colors hover:bg-accent"
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
      <span className="font-medium text-foreground">{isGoogle ? 'Google' : 'Apple'}</span>
    </Button>
  );
}
