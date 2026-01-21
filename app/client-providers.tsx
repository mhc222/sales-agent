'use client'

import { TenantProvider } from '@/contexts/TenantContext'

export function ClientProviders({
  children,
}: {
  children: React.ReactNode
}) {
  return <TenantProvider>{children}</TenantProvider>
}
