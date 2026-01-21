'use client'

import { TenantProvider } from '@/contexts/TenantContext'
import { Shell } from '@/components/layout/Shell'

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <TenantProvider>
      <Shell>{children}</Shell>
    </TenantProvider>
  )
}
