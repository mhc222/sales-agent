import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Link from 'next/link'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'JSB Media - Sales Agent',
  description: 'Lead management and email sequence dashboard',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="min-h-screen bg-jsb-navy">
          {/* Header */}
          <header className="bg-jsb-navy-light border-b border-jsb-navy-lighter">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between items-center h-16">
                <div className="flex items-center">
                  <Link href="/" className="flex items-center">
                    <span className="text-xl font-bold text-white">JSB</span>
                    <span className="text-xl font-normal text-white">Media</span>
                  </Link>
                  <nav className="ml-10 flex items-center space-x-1">
                    <Link
                      href="/"
                      className="text-gray-300 hover:text-white hover:bg-jsb-navy-lighter px-3 py-2 rounded-md text-sm font-medium transition-colors"
                    >
                      Leads
                    </Link>
                    <Link
                      href="#"
                      className="text-gray-400 hover:text-white hover:bg-jsb-navy-lighter px-3 py-2 rounded-md text-sm font-medium transition-colors"
                    >
                      Sequences
                    </Link>
                    <Link
                      href="#"
                      className="text-gray-400 hover:text-white hover:bg-jsb-navy-lighter px-3 py-2 rounded-md text-sm font-medium transition-colors"
                    >
                      Analytics
                    </Link>
                  </nav>
                </div>
                <div className="flex items-center space-x-4">
                  <span className="text-sm text-jsb-pink font-medium">Sales Agent</span>
                </div>
              </div>
            </div>
          </header>

          {/* Main content */}
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
