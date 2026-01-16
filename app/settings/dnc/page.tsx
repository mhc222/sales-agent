'use client'

import { useState, useEffect, useCallback } from 'react'
import { Shell } from '@/components/layout/Shell'
import DNCTable from '@/components/settings/DNCTable'
import DNCUpload from '@/components/settings/DNCUpload'
import { jsb, cn } from '@/lib/styles'

type DNCEntry = {
  id: string
  email: string | null
  domain: string | null
  reason: string | null
  created_at: string
}

export default function DNCPage() {
  const [entries, setEntries] = useState<DNCEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'email' | 'domain'>('all')
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [manualEntry, setManualEntry] = useState('')
  const [addingManual, setAddingManual] = useState(false)
  const perPage = 50

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        limit: String(perPage),
        offset: String((page - 1) * perPage),
      })
      if (search) params.set('search', search)
      if (typeFilter !== 'all') params.set('type', typeFilter)

      const res = await fetch(`/api/dnc?${params}`)
      const data = await res.json()

      if (res.ok) {
        setEntries(data.entries)
        setTotal(data.total)
      }
    } catch (err) {
      console.error('Failed to fetch DNC entries:', err)
    } finally {
      setLoading(false)
    }
  }, [page, search, typeFilter])

  useEffect(() => {
    fetchEntries()
  }, [fetchEntries])

  const handleDelete = async (ids: string[]) => {
    setDeleting(true)
    try {
      const res = await fetch('/api/dnc', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })

      if (res.ok) {
        fetchEntries()
      }
    } catch (err) {
      console.error('Failed to delete entries:', err)
    } finally {
      setDeleting(false)
    }
  }

  const handleAddManual = async () => {
    if (!manualEntry.trim()) return

    setAddingManual(true)
    try {
      const value = manualEntry.trim().toLowerCase()
      const type = value.includes('@') ? 'email' : 'domain'

      const res = await fetch('/api/dnc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries: [{ type, value, reason: 'Added manually' }],
        }),
      })

      if (res.ok) {
        setManualEntry('')
        fetchEntries()
      }
    } catch (err) {
      console.error('Failed to add entry:', err)
    } finally {
      setAddingManual(false)
    }
  }

  return (
    <Shell>
      <div className="p-6 lg:p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className={cn(jsb.heading, 'text-2xl mb-2')}>Do Not Contact List</h1>
          <p className="text-gray-400">Manage emails and domains you never want to contact</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Add entries panel */}
          <div className="lg:col-span-1 space-y-6">
            {/* CSV Upload */}
            <div>
              <h2 className={cn(jsb.heading, 'text-lg mb-4')}>Upload CSV</h2>
              <DNCUpload onUploadComplete={fetchEntries} />
            </div>

            {/* Manual entry */}
            <div>
              <h2 className={cn(jsb.heading, 'text-lg mb-4')}>Add Manually</h2>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={manualEntry}
                  onChange={(e) => setManualEntry(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddManual()}
                  className={cn(jsb.input, 'flex-1 px-4 py-2')}
                  placeholder="email@example.com or example.com"
                />
                <button
                  onClick={handleAddManual}
                  disabled={!manualEntry.trim() || addingManual}
                  className={cn(jsb.buttonPrimary, 'px-4 py-2')}
                >
                  {addingManual ? '...' : 'Add'}
                </button>
              </div>
            </div>
          </div>

          {/* List panel */}
          <div className="lg:col-span-2">
            {/* Filters */}
            <div className="flex flex-wrap gap-4 mb-6">
              <div className="flex-1 min-w-[200px]">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setPage(1)
                  }}
                  className={cn(jsb.input, 'w-full px-4 py-2')}
                  placeholder="Search emails or domains..."
                />
              </div>
              <div className="flex gap-1">
                {(['all', 'email', 'domain'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => {
                      setTypeFilter(type)
                      setPage(1)
                    }}
                    className={cn(
                      'px-3 py-2 text-sm rounded-md transition-colors duration-150',
                      typeFilter === type
                        ? 'bg-jsb-pink text-white'
                        : 'bg-jsb-navy-lighter text-gray-400 hover:text-white'
                    )}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Table */}
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <svg className="animate-spin h-8 w-8 text-jsb-pink" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            ) : (
              <DNCTable
                entries={entries}
                total={total}
                page={page}
                perPage={perPage}
                onPageChange={setPage}
                onDelete={handleDelete}
                deleting={deleting}
              />
            )}
          </div>
        </div>
      </div>
    </Shell>
  )
}
