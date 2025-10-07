'use client';

import { SettingsView } from '@/features/settings';
import { withAuthGuard } from '@/hooks/use-auth-guard';

function SettingsPage() {
  return <SettingsView />;
}

export default withAuthGuard(SettingsPage);
