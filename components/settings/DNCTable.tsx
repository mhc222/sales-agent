'use client'

import { useState } from 'react'
import { jsb, cn, badgeColors } from '@/lib/styles'

type DNCEntry = {
  id: string
  email: string | null
  domain: string | null
  reason: string | null
  created_at: string
}

type Props = {
  entries: DNCEntry[]
  total: number
  page: number
  perPage: number
  onPageChange: (page: number) => void
  onDelete: (ids: string[]) => void
  deleting: boolean
}

export default function DNCTable({
  entries,
  total,
  page,
  perPage,
  onPageChange,
  onDelete,
  deleting,
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
    if (selected.size === entries.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(entries.map((e) => e.id)))
    }
  }

  const handleDelete = () => {
    onDelete([...selected])
    setSelected(new Set())
  }

  const totalPages = Math.ceil(total / perPage)

  if (entries.length === 0) {
    return (
      <div className="text-center py-12">
        <svg className="w-12 h-12 text-gray-600 mx-auto mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className={jsb.heading}>No entries found</p>
        <p className="text-gray-500 text-sm mt-1">Add emails or domains to your Do Not Contact list</p>
      </div>
    )
  }

  return (
    <div>
      {/* Actions bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <button
            onClick={toggleSelectAll}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            <input
              type="checkbox"
              checked={selected.size === entries.length && entries.length > 0}
              onChange={toggleSelectAll}
              className="w-4 h-4 rounded border-gray-600 bg-jsb-navy text-jsb-pink focus:ring-jsb-pink"
            />
            Select all
          </button>
          {selected.size > 0 && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className={cn(jsb.buttonDanger, 'px-3 py-1.5 text-sm')}
            >
              {deleting ? 'Removing...' : `Remove (${selected.size})`}
            </button>
          )}
        </div>
        <span className="text-sm text-gray-500">
          {total.toLocaleString()} total entries
        </span>
      </div>

      {/* Table */}
      <div className={cn(jsb.card, 'overflow-hidden')}>
        <table className={jsb.table}>
          <thead className={jsb.tableHeader}>
            <tr>
              <th className={cn(jsb.tableHeaderCell, 'w-12')}></th>
              <th className={jsb.tableHeaderCell}>Type</th>
              <th className={jsb.tableHeaderCell}>Value</th>
              <th className={jsb.tableHeaderCell}>Reason</th>
              <th className={jsb.tableHeaderCell}>Added</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-jsb-navy-lighter">
            {entries.map((entry) => (
              <tr key={entry.id} className={jsb.tableRow}>
                <td className={jsb.tableCell}>
                  <input
                    type="checkbox"
                    checked={selected.has(entry.id)}
                    onChange={() => toggleSelect(entry.id)}
                    className="w-4 h-4 rounded border-gray-600 bg-jsb-navy text-jsb-pink focus:ring-jsb-pink"
                  />
                </td>
                <td className={jsb.tableCell}>
                  <span className={cn(jsb.badge, entry.email ? badgeColors.info : badgeColors.purple)}>
                    {entry.email ? 'Email' : 'Domain'}
                  </span>
                </td>
                <td className={cn(jsb.tableCell, 'font-mono text-white')}>
                  {entry.email || entry.domain}
                </td>
                <td className={jsb.tableCell}>
                  {entry.reason || <span className="text-gray-600">—</span>}
                </td>
                <td className={jsb.tableCell}>
                  {new Date(entry.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-500">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page === 1}
              className={cn(jsb.buttonSecondary, 'px-3 py-1.5 text-sm')}
            >
              Previous
            </button>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page === totalPages}
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
