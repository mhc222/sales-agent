'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTenant } from '@/contexts/TenantContext'
import { cn } from '@/lib/styles'

interface BrandSwitcherProps {
  collapsed?: boolean
}

export function BrandSwitcher({ collapsed = false }: BrandSwitcherProps) {
  const { tenants, activeTenant, loading, switchTenant, createTenant } = useTenant()
  const [isOpen, setIsOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [newBrandName, setNewBrandName] = useState('')
  const [createLoading, setCreateLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setIsCreating(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSwitch = async (tenantId: string) => {
    if (tenantId === activeTenant?.id) {
      setIsOpen(false)
      return
    }
    await switchTenant(tenantId)
    setIsOpen(false)
  }

  const handleCreateBrand = async () => {
    if (!newBrandName.trim()) return

    setCreateLoading(true)
    const tenant = await createTenant(newBrandName.trim())
    setCreateLoading(false)

    if (tenant) {
      setNewBrandName('')
      setIsCreating(false)
      setIsOpen(false)
      // Navigate to onboarding for the new brand
      await switchTenant(tenant.id)
      router.push('/onboarding')
    }
  }

  if (loading) {
    return (
      <div className={cn(
        'px-3 py-2 rounded-lg bg-jsb-navy-lighter animate-pulse',
        collapsed ? 'w-10 h-10' : 'h-12'
      )} />
    )
  }

  if (!activeTenant) {
    return null
  }

  // Get initials for avatar
  const initials = activeTenant.name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-150',
          'bg-jsb-navy-lighter hover:bg-jsb-navy-lighter/80',
          'border border-white/5 hover:border-white/10',
          isOpen && 'border-jsb-pink/30 bg-jsb-pink/5'
        )}
        title={collapsed ? activeTenant.name : undefined}
      >
        {/* Brand Avatar */}
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-jsb-pink/80 to-jsb-pink flex items-center justify-center flex-shrink-0">
          <span className="text-white text-xs font-bold">{initials}</span>
        </div>

        {!collapsed && (
          <>
            <div className="flex-1 text-left min-w-0">
              <p className="text-sm font-medium text-white truncate">{activeTenant.name}</p>
              <p className="text-xs text-gray-500 capitalize">{activeTenant.role}</p>
            </div>

            {/* Chevron */}
            <svg
              className={cn(
                'w-4 h-4 text-gray-400 transition-transform duration-200',
                isOpen && 'rotate-180'
              )}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && !collapsed && (
        <div className="absolute left-0 right-0 mt-2 py-2 bg-jsb-navy-light border border-white/10 rounded-lg shadow-xl z-50">
          {/* Current brand label */}
          <div className="px-3 py-1 mb-1">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Your Brands</p>
          </div>

          {/* Brand list */}
          <div className="max-h-48 overflow-y-auto">
            {tenants.map((tenant) => (
              <button
                key={tenant.id}
                onClick={() => handleSwitch(tenant.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 text-left transition-colors',
                  tenant.id === activeTenant.id
                    ? 'bg-jsb-pink/10 text-jsb-pink'
                    : 'text-gray-300 hover:bg-jsb-navy-lighter hover:text-white'
                )}
              >
                {/* Brand Avatar */}
                <div className={cn(
                  'w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0',
                  tenant.id === activeTenant.id
                    ? 'bg-jsb-pink'
                    : 'bg-jsb-navy-lighter'
                )}>
                  <span className="text-white text-xs font-medium">
                    {tenant.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{tenant.name}</p>
                </div>

                {/* Check mark for active */}
                {tenant.id === activeTenant.id && (
                  <svg className="w-4 h-4 text-jsb-pink flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="my-2 border-t border-white/10" />

          {/* Create new brand */}
          {isCreating ? (
            <div className="px-3 py-2">
              <input
                type="text"
                value={newBrandName}
                onChange={(e) => setNewBrandName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateBrand()
                  if (e.key === 'Escape') {
                    setIsCreating(false)
                    setNewBrandName('')
                  }
                }}
                placeholder="Brand name..."
                className={cn(
                  'w-full px-3 py-2 rounded-md text-sm',
                  'bg-jsb-navy-lighter border border-white/10',
                  'text-white placeholder-gray-500',
                  'focus:border-jsb-pink focus:outline-none'
                )}
                autoFocus
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleCreateBrand}
                  disabled={!newBrandName.trim() || createLoading}
                  className={cn(
                    'flex-1 px-3 py-1.5 rounded-md text-xs font-medium',
                    'bg-jsb-pink text-white',
                    'hover:bg-jsb-pink/90 transition-colors',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  {createLoading ? 'Creating...' : 'Create'}
                </button>
                <button
                  onClick={() => {
                    setIsCreating(false)
                    setNewBrandName('')
                  }}
                  className="px-3 py-1.5 rounded-md text-xs font-medium text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsCreating(true)}
              className="w-full flex items-center gap-3 px-3 py-2 text-gray-400 hover:text-white hover:bg-jsb-navy-lighter transition-colors"
            >
              <div className="w-7 h-7 rounded-md bg-jsb-navy-lighter flex items-center justify-center border border-dashed border-gray-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <span className="text-sm">Add new brand</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
