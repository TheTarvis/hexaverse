'use client'

import { useAccountOptional } from '@/components/account-provider'
import { HudButton } from '@/components/hud/HudControls'
import { HudSection } from './HudCardShell'
import { HudHeading, HudText } from './HudTypography'

export function GameAccountSettings() {
  const session = useAccountOptional()
  if (!session?.user) return null
  return <AccountSettingsContent email={session.account?.email ?? session.user.email} onSignOut={session.signOut} />
}

/** Account actions belong to the existing Arrange/settings card, never the map footer. */
export function AccountSettingsContent({ email, onSignOut }: { email: string | null; onSignOut: () => void }) {
  return <HudSection aria-label="Account settings">
    <HudHeading variant="section" level={3}>Account</HudHeading>
    {email && <HudText className="break-all">{email}</HudText>}
    <HudButton onClick={onSignOut} data-testid="sign-out-button">Sign out</HudButton>
  </HudSection>
}
