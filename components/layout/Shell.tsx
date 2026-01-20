'use client'

import { useState, useEffect } from 'react'
import { Sidebar } from './Sidebar'
import SettingsChat from '../SettingsChat'

interface ShellProps {
  children: React.ReactNode
}

export function Shell({ children }: ShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Close mobile menu on route change (when clicking a link)
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setMobileMenuOpen(false)
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <div className="flex h-screen bg-jsb-navy overflow-hidden">
        {/* Mobile overlay */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}

        {/* Sidebar - hidden on mobile, shown as overlay when open */}
        <div className={`
          fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 ease-in-out lg:relative lg:transform-none
          ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}>
          <Sidebar
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
            onNavClick={() => setMobileMenuOpen(false)}
          />
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top header bar */}
          <header className="h-16 flex items-center justify-between px-6 border-b border-jsb-navy-lighter bg-jsb-navy-light/50">
            <div className="flex items-center gap-4">
              {/* Mobile menu button */}
              <button
                className="lg:hidden p-2 rounded-lg text-gray-400 hover:text-white hover:bg-jsb-navy-lighter transition-colors"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                </svg>
              </button>
            </div>

            {/* Right side actions */}
            <div className="flex items-center gap-4">
              {/* Status indicator */}
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-sm text-gray-400">Pipeline Active</span>
              </div>

              {/* Divider */}
              <div className="h-6 w-px bg-jsb-navy-lighter" />

              {/* Brand tag */}
              <span className="text-sm text-jsb-pink font-medium">Sales Agent</span>
            </div>
          </header>

          {/* Scrollable main content */}
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
        </div>

        {/* Floating Settings Chat */}
        <SettingsChat />
      </div>
  )
}
