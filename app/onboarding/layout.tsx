'use client'

import { jsb, cn } from '@/lib/styles'

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className={cn(jsb.page, 'min-h-screen')}>
      {/* Minimal header */}
      <header className="border-b border-jsb-navy-lighter">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-jsb-pink/20 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-jsb-pink" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className={cn(jsb.heading, 'text-lg')}>Sales Agent</span>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        {children}
      </main>
    </div>
  )
}
