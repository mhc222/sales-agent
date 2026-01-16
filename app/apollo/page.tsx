'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Shell } from '@/components/layout/Shell'
import ApolloSearchForm from '@/components/apollo/ApolloSearchForm'
import ApolloResults from '@/components/apollo/ApolloResults'
import { jsb, cn, badgeColors } from '@/lib/styles'
import type { ApolloLead } from '@/src/lib/apollo'

type SearchParams = {
  jobTitles: string
  industry: string
  locations: string
  minEmployees: string
  maxEmployees: string
}

type SearchResult = {
  leads: ApolloLead[]
  pagination: {
    page: number
    per_page: number
    total_entries: number
    total_pages: number
  }
}

export default function ApolloPage() {
  const [searching, setSearching] = useState(false)
  const [importing, setImporting] = useState(false)
  const [results, setResults] = useState<SearchResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastParams, setLastParams] = useState<SearchParams | null>(null)
  const [importSuccess, setImportSuccess] = useState<{ count: number } | null>(null)
  const [dncEmails, setDncEmails] = useState<Set<string>>(new Set())
  const [dncDomains, setDncDomains] = useState<Set<string>>(new Set())
  const router = useRouter()

  // Load DNC list on mount
  useEffect(() => {
    fetch('/api/dnc')
      .then((res) => res.json())
      .then((data) => {
        if (data.entries) {
          const emails = new Set<string>()
          const domains = new Set<string>()
          data.entries.forEach((entry: { email?: string; domain?: string }) => {
            if (entry.email) emails.add(entry.email.toLowerCase())
            if (entry.domain) domains.add(entry.domain.toLowerCase())
          })
          setDncEmails(emails)
          setDncDomains(domains)
        }
      })
      .catch(() => {})
  }, [])

  const handleSearch = async (params: SearchParams, page = 1) => {
    setSearching(true)
    setError(null)
    setImportSuccess(null)
    setLastParams(params)

    try {
      const res = await fetch('/api/apollo/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobTitles: params.jobTitles.split(',').map((t) => t.trim()).filter(Boolean),
          industry: params.industry,
          locations: params.locations.split(',').map((l) => l.trim()).filter(Boolean),
          employeeRange: {
            min: parseInt(params.minEmployees) || 10,
            max: parseInt(params.maxEmployees) || 1000000,
          },
          page,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Search failed')
        return
      }

      setResults(data)
    } catch (err) {
      setError('Failed to search Apollo')
    } finally {
      setSearching(false)
    }
  }

  const handlePageChange = (page: number) => {
    if (lastParams) {
      handleSearch(lastParams, page)
    }
  }

  const handleImport = async (leads: ApolloLead[]) => {
    setImporting(true)
    setError(null)
    setImportSuccess(null)

    try {
      const res = await fetch('/api/apollo/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leads }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Import failed')
        return
      }

      setImportSuccess({ count: data.imported })

      // Clear results after successful import
      setTimeout(() => {
        setResults(null)
        setImportSuccess(null)
      }, 3000)
    } catch (err) {
      setError('Failed to import leads')
    } finally {
      setImporting(false)
    }
  }

  return (
    <Shell>
      <div className="p-6 lg:p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className={cn(jsb.heading, 'text-2xl mb-2')}>Apollo Search</h1>
          <p className="text-gray-400">Find and import leads from Apollo.io</p>
        </div>

        {/* Success message */}
        {importSuccess && (
          <div className="mb-6 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-500/20 rounded-full flex items-center justify-center">
              <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className={jsb.heading}>Successfully imported {importSuccess.count} leads</p>
              <p className="text-sm text-emerald-400/80">They're now being processed in your pipeline</p>
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/30">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Search Form */}
          <div className="lg:col-span-1">
            <div className={cn(jsb.card, 'p-6')}>
              <h2 className={cn(jsb.heading, 'text-lg mb-4')}>Search Criteria</h2>
              <ApolloSearchForm onSearch={handleSearch} loading={searching} />
            </div>

            {/* DNC Info */}
            {(dncEmails.size > 0 || dncDomains.size > 0) && (
              <div className={cn(jsb.card, 'p-4 mt-4')}>
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <svg className="w-4 h-4 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>
                    {dncEmails.size + dncDomains.size} entries on your Do Not Contact list
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Results */}
          <div className="lg:col-span-2">
            {results ? (
              <ApolloResults
                leads={results.leads}
                pagination={results.pagination}
                onPageChange={handlePageChange}
                onImport={handleImport}
                importing={importing}
                dncEmails={dncEmails}
                dncDomains={dncDomains}
              />
            ) : (
              <div className={cn(jsb.card, 'p-12 text-center')}>
                <div className="w-16 h-16 mx-auto bg-jsb-navy-lighter rounded-full flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <h3 className={cn(jsb.heading, 'text-lg mb-2')}>Search for leads</h3>
                <p className="text-gray-500">
                  Use the search form to find leads matching your criteria
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Shell>
  )
}
