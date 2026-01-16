'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
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

type ParsedParams = {
  searchParams: {
    jobTitles: string[]
    industry?: string
    locations?: string[]
    employeeRange?: { min: number; max: number }
  }
  reasoning: string
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
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [results, setResults] = useState<SearchResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastParams, setLastParams] = useState<SearchParams | null>(null)
  const [importSuccess, setImportSuccess] = useState<{ count: number } | null>(null)
  const [dncEmails, setDncEmails] = useState<Set<string>>(new Set())
  const [dncDomains, setDncDomains] = useState<Set<string>>(new Set())

  // NL Search state
  const [nlQuery, setNlQuery] = useState('')
  const [parsedParams, setParsedParams] = useState<ParsedParams | null>(null)
  const [showManualForm, setShowManualForm] = useState(false)

  // Save search state
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saveDescription, setSaveDescription] = useState('')
  const [scheduleEnabled, setScheduleEnabled] = useState(false)

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

  const handleParseNL = async () => {
    if (!nlQuery.trim()) return

    setParsing(true)
    setError(null)
    setParsedParams(null)

    try {
      const res = await fetch('/api/apollo/parse-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: nlQuery }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to parse query')
        return
      }

      setParsedParams(data)
    } catch (err) {
      setError('Failed to parse search query')
    } finally {
      setParsing(false)
    }
  }

  const handleSearchFromParsed = async (page = 1) => {
    if (!parsedParams) return

    setSearching(true)
    setError(null)
    setImportSuccess(null)

    try {
      const { searchParams } = parsedParams
      const res = await fetch('/api/apollo/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobTitles: searchParams.jobTitles,
          industry: searchParams.industry,
          locations: searchParams.locations,
          employeeRange: searchParams.employeeRange,
          page,
          nlQuery,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Search failed')
        return
      }

      setResults(data)

      // Store for pagination
      setLastParams({
        jobTitles: searchParams.jobTitles?.join(', ') || '',
        industry: searchParams.industry || '',
        locations: searchParams.locations?.join(', ') || '',
        minEmployees: String(searchParams.employeeRange?.min || 10),
        maxEmployees: String(searchParams.employeeRange?.max || 1000),
      })
    } catch (err) {
      setError('Failed to search Apollo')
    } finally {
      setSearching(false)
    }
  }

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
    if (parsedParams) {
      handleSearchFromParsed(page)
    } else if (lastParams) {
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

  const handleSaveSearch = async () => {
    if (!saveName.trim() || !lastParams) return

    setSaving(true)
    setError(null)

    try {
      const res = await fetch('/api/apollo/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobTitles: lastParams.jobTitles.split(',').map((t) => t.trim()).filter(Boolean),
          industry: lastParams.industry,
          locations: lastParams.locations.split(',').map((l) => l.trim()).filter(Boolean),
          employeeRange: {
            min: parseInt(lastParams.minEmployees) || 10,
            max: parseInt(lastParams.maxEmployees) || 1000000,
          },
          page: 1,
          saveSearch: {
            name: saveName,
            description: saveDescription,
          },
          scheduleCron: scheduleEnabled ? '0 11 * * *' : null,
          nlQuery: nlQuery || null,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to save search')
        return
      }

      setShowSaveModal(false)
      setSaveName('')
      setSaveDescription('')
      setScheduleEnabled(false)
    } catch (err) {
      setError('Failed to save search')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Shell>
      <div className="p-6 lg:p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className={cn(jsb.heading, 'text-2xl mb-2')}>Apollo Search</h1>
            <p className="text-gray-400">Find and import leads from Apollo.io</p>
          </div>
          <Link
            href="/apollo/saved-searches"
            className={cn(jsb.buttonSecondary, 'px-4 py-2 flex items-center gap-2')}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            Saved Searches
          </Link>
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

        {/* NL Search Section */}
        <div className={cn(jsb.card, 'p-6 mb-8')}>
          <h2 className={cn(jsb.heading, 'text-lg mb-4')}>Search with Natural Language</h2>
          <div className="flex gap-4">
            <input
              type="text"
              value={nlQuery}
              onChange={(e) => setNlQuery(e.target.value)}
              className={cn(jsb.input, 'flex-1 px-4 py-3')}
              placeholder="e.g., Find VPs of Marketing at fintech companies in Texas with 50-500 employees"
              onKeyDown={(e) => e.key === 'Enter' && handleParseNL()}
            />
            <button
              onClick={handleParseNL}
              disabled={parsing || !nlQuery.trim()}
              className={cn(jsb.buttonPrimary, 'px-6 py-3')}
            >
              {parsing ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Parsing...
                </span>
              ) : (
                'Parse with AI'
              )}
            </button>
          </div>

          {/* Parsed Params Display */}
          {parsedParams && (
            <div className="mt-6 p-4 bg-jsb-navy rounded-lg border border-jsb-navy-lighter">
              <div className="flex items-start justify-between mb-4">
                <h3 className={cn(jsb.heading, 'text-sm')}>Extracted Filters</h3>
                <button
                  onClick={() => setShowManualForm(!showManualForm)}
                  className="text-xs text-gray-400 hover:text-white transition-colors"
                >
                  {showManualForm ? 'Hide' : 'Edit'} manually
                </button>
              </div>

              <div className="space-y-2 text-sm">
                {parsedParams.searchParams.jobTitles?.length > 0 && (
                  <div className="flex gap-2">
                    <span className="text-gray-500 w-28">Job Titles:</span>
                    <span className="text-gray-300">{parsedParams.searchParams.jobTitles.join(', ')}</span>
                  </div>
                )}
                {parsedParams.searchParams.industry && (
                  <div className="flex gap-2">
                    <span className="text-gray-500 w-28">Industry:</span>
                    <span className="text-gray-300">{parsedParams.searchParams.industry}</span>
                  </div>
                )}
                {parsedParams.searchParams.locations && parsedParams.searchParams.locations.length > 0 && (
                  <div className="flex gap-2">
                    <span className="text-gray-500 w-28">Location:</span>
                    <span className="text-gray-300">{parsedParams.searchParams.locations.join(', ')}</span>
                  </div>
                )}
                {parsedParams.searchParams.employeeRange && (
                  <div className="flex gap-2">
                    <span className="text-gray-500 w-28">Company Size:</span>
                    <span className="text-gray-300">
                      {parsedParams.searchParams.employeeRange.min.toLocaleString()} - {parsedParams.searchParams.employeeRange.max.toLocaleString()} employees
                    </span>
                  </div>
                )}
              </div>

              <p className="mt-4 text-xs text-gray-500 italic">{parsedParams.reasoning}</p>

              <div className="mt-4 flex gap-3">
                <button
                  onClick={() => handleSearchFromParsed()}
                  disabled={searching}
                  className={cn(jsb.buttonPrimary, 'px-4 py-2')}
                >
                  {searching ? 'Searching...' : 'Search Apollo'}
                </button>
                {results && lastParams && (
                  <button
                    onClick={() => setShowSaveModal(true)}
                    className={cn(jsb.buttonSecondary, 'px-4 py-2 flex items-center gap-2')}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                    </svg>
                    Save Search
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Toggle for manual form */}
          {!parsedParams && (
            <button
              onClick={() => setShowManualForm(!showManualForm)}
              className="mt-4 text-sm text-gray-400 hover:text-white transition-colors"
            >
              {showManualForm ? 'Hide' : 'Or search'} with manual filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Search Form (shown when toggled or no NL parse) */}
          {showManualForm && (
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
          )}

          {/* Results */}
          <div className={showManualForm ? 'lg:col-span-2' : 'lg:col-span-3'}>
            {results ? (
              <>
                {/* Save button above results */}
                {lastParams && (
                  <div className="flex justify-end mb-4">
                    <button
                      onClick={() => setShowSaveModal(true)}
                      className={cn(jsb.buttonSecondary, 'px-4 py-2 flex items-center gap-2')}
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                      </svg>
                      Save Search
                    </button>
                  </div>
                )}
                <ApolloResults
                  leads={results.leads}
                  pagination={results.pagination}
                  onPageChange={handlePageChange}
                  onImport={handleImport}
                  importing={importing}
                  dncEmails={dncEmails}
                  dncDomains={dncDomains}
                />
              </>
            ) : (
              <div className={cn(jsb.card, 'p-12 text-center')}>
                <div className="w-16 h-16 mx-auto bg-jsb-navy-lighter rounded-full flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <h3 className={cn(jsb.heading, 'text-lg mb-2')}>Search for leads</h3>
                <p className="text-gray-500">
                  Use natural language or the search form to find leads matching your criteria
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Save Search Modal */}
        {showSaveModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className={cn(jsb.card, 'w-full max-w-md p-6')}>
              <h3 className={cn(jsb.heading, 'text-lg mb-4')}>Save Search</h3>

              <div className="space-y-4">
                <div>
                  <label htmlFor="saveName" className={cn(jsb.label, 'block mb-2')}>
                    Search Name *
                  </label>
                  <input
                    id="saveName"
                    type="text"
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    className={cn(jsb.input, 'w-full px-4 py-2.5')}
                    placeholder="e.g., Fintech VPs in Texas"
                  />
                </div>

                <div>
                  <label htmlFor="saveDescription" className={cn(jsb.label, 'block mb-2')}>
                    Description (optional)
                  </label>
                  <textarea
                    id="saveDescription"
                    value={saveDescription}
                    onChange={(e) => setSaveDescription(e.target.value)}
                    className={cn(jsb.input, 'w-full px-4 py-2.5 min-h-[80px]')}
                    placeholder="Notes about this search..."
                  />
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="scheduleEnabled"
                    checked={scheduleEnabled}
                    onChange={(e) => setScheduleEnabled(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-600 bg-jsb-navy text-jsb-pink focus:ring-jsb-pink"
                  />
                  <label htmlFor="scheduleEnabled" className="text-sm text-gray-300">
                    Run daily at 11am UTC and import new leads automatically
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowSaveModal(false)}
                  className={cn(jsb.buttonSecondary, 'px-4 py-2')}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveSearch}
                  disabled={saving || !saveName.trim()}
                  className={cn(jsb.buttonPrimary, 'px-4 py-2')}
                >
                  {saving ? 'Saving...' : 'Save Search'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Shell>
  )
}
