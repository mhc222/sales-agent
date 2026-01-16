'use client'

import { useState } from 'react'
import { jsb, cn, badgeColors } from '@/lib/styles'
import type { ApolloLead } from '@/src/lib/apollo'

type Props = {
  leads: ApolloLead[]
  pagination: {
    page: number
    per_page: number
    total_entries: number
    total_pages: number
  }
  onPageChange: (page: number) => void
  onImport: (leads: ApolloLead[]) => void
  importing: boolean
  dncEmails?: Set<string>
  dncDomains?: Set<string>
}

export default function ApolloResults({
  leads,
  pagination,
  onPageChange,
  onImport,
  importing,
  dncEmails = new Set(),
  dncDomains = new Set(),
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selected)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelected(newSelected)
  }

  const toggleSelectAll = () => {
    if (selected.size === leads.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(leads.map((l) => l.id)))
    }
  }

  const isBlocked = (lead: ApolloLead): boolean => {
    if (!lead.email) return false
    if (dncEmails.has(lead.email.toLowerCase())) return true
    const domain = lead.email.split('@')[1]?.toLowerCase()
    if (domain && dncDomains.has(domain)) return true
    return false
  }

  const handleImport = () => {
    const selectedLeads = leads.filter((l) => selected.has(l.id) && !isBlocked(l))
    onImport(selectedLeads)
  }

  const selectedCount = [...selected].filter((id) => {
    const lead = leads.find((l) => l.id === id)
    return lead && !isBlocked(lead)
  }).length

  if (leads.length === 0) {
    return (
      <div className="text-center py-12">
        <svg className="w-12 h-12 text-gray-600 mx-auto mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <p className={jsb.heading}>No results found</p>
        <p className="text-gray-500 text-sm mt-1">Try adjusting your search criteria</p>
      </div>
    )
  }

  return (
    <div>
      {/* Header with actions */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <button
            onClick={toggleSelectAll}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            <input
              type="checkbox"
              checked={selected.size === leads.length}
              onChange={toggleSelectAll}
              className="w-4 h-4 rounded border-gray-600 bg-jsb-navy text-jsb-pink focus:ring-jsb-pink"
            />
            Select all
          </button>
          <span className="text-sm text-gray-500">
            {pagination.total_entries.toLocaleString()} results found
          </span>
        </div>

        <button
          onClick={handleImport}
          disabled={selectedCount === 0 || importing}
          className={cn(jsb.buttonPrimary, 'px-4 py-2')}
        >
          {importing ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Importing...
            </span>
          ) : (
            `Import ${selectedCount > 0 ? `(${selectedCount})` : ''}`
          )}
        </button>
      </div>

      {/* Results list */}
      <div className="space-y-2">
        {leads.map((lead) => {
          const blocked = isBlocked(lead)
          return (
            <div
              key={lead.id}
              className={cn(
                jsb.card,
                'p-4 flex items-start gap-4 transition-all duration-150',
                blocked
                  ? 'opacity-50'
                  : selected.has(lead.id)
                  ? 'ring-1 ring-jsb-pink border-jsb-pink'
                  : 'hover:border-jsb-navy-lighter'
              )}
            >
              <input
                type="checkbox"
                checked={selected.has(lead.id)}
                onChange={() => toggleSelect(lead.id)}
                disabled={blocked}
                className="mt-1 w-4 h-4 rounded border-gray-600 bg-jsb-navy text-jsb-pink focus:ring-jsb-pink disabled:opacity-50"
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className={cn(jsb.heading, 'text-sm')}>
                      {lead.first_name} {lead.last_name}
                    </p>
                    <p className="text-sm text-gray-400">{lead.title}</p>
                  </div>
                  {blocked && (
                    <span className={cn(jsb.badge, badgeColors.error, 'text-xs')}>
                      On DNC list
                    </span>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                  {lead.email && (
                    <span className="flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      {lead.email}
                    </span>
                  )}
                  {lead.organization?.name && (
                    <span className="flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5" />
                      </svg>
                      {lead.organization.name}
                    </span>
                  )}
                  {lead.organization?.estimated_num_employees && (
                    <span className="flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      {lead.organization.estimated_num_employees.toLocaleString()} employees
                    </span>
                  )}
                  {(lead.city || lead.country) && (
                    <span className="flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      {[lead.city, lead.country].filter(Boolean).join(', ')}
                    </span>
                  )}
                </div>
              </div>

              {lead.linkedin_url && (
                <a
                  href={lead.linkedin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-500 hover:text-sky-400 transition-colors"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                  </svg>
                </a>
              )}
            </div>
          )
        })}
      </div>

      {/* Pagination */}
      {pagination.total_pages > 1 && (
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-jsb-navy-lighter">
          <p className="text-sm text-gray-500">
            Page {pagination.page} of {pagination.total_pages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => onPageChange(pagination.page - 1)}
              disabled={pagination.page === 1}
              className={cn(jsb.buttonSecondary, 'px-3 py-1.5 text-sm')}
            >
              Previous
            </button>
            <button
              onClick={() => onPageChange(pagination.page + 1)}
              disabled={pagination.page === pagination.total_pages}
              className={cn(jsb.buttonSecondary, 'px-3 py-1.5 text-sm')}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
