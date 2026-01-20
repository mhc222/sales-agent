'use client'

import { useState, useRef } from 'react'
import { jsb, cn } from '@/lib/styles'

/**
 * Normalize a domain or URL to just the root domain
 */
function normalizeDomain(input: string): string {
  let domain = input.toLowerCase().trim()
  domain = domain.replace(/^https?:\/\//, '')
  domain = domain.replace(/^www\./, '')
  domain = domain.split('/')[0].split('?')[0].split('#')[0]
  domain = domain.split(':')[0]
  return domain
}

type DNCData = {
  entries: Array<{ type: 'email' | 'domain'; value: string }>
  skip: boolean
}

type Props = {
  data: DNCData
  onChange: (data: DNCData) => void
  onComplete: () => void
  onBack: () => void
  loading: boolean
}

export default function DNCStep({ data, onChange, onComplete, onBack, loading }: Props) {
  const [manualEntry, setManualEntry] = useState('')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleAddEntry = () => {
    if (!manualEntry.trim()) return

    const raw = manualEntry.trim().toLowerCase()
    const isEmail = raw.includes('@')
    const value = isEmail ? raw : normalizeDomain(raw)

    // Check for duplicates
    if (data.entries.some(e => e.value === value)) {
      return
    }

    onChange({
      ...data,
      entries: [...data.entries, { type: isEmail ? 'email' : 'domain', value }],
      skip: false,
    })
    setManualEntry('')
  }

  const handleRemoveEntry = (index: number) => {
    onChange({
      ...data,
      entries: data.entries.filter((_, i) => i !== index),
    })
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadError(null)

    try {
      const text = await file.text()
      const lines = text.split(/[\n,]/).map(l => l.trim().toLowerCase()).filter(Boolean)

      const newEntries: DNCData['entries'] = []
      for (const line of lines) {
        // Skip header rows
        if (line === 'email' || line === 'domain') continue

        const isEmail = line.includes('@')
        const value = isEmail ? line : normalizeDomain(line)
        const type = isEmail ? 'email' : 'domain'

        if (!data.entries.some(e => e.value === value) && !newEntries.some(e => e.value === value)) {
          newEntries.push({ type, value })
        }
      }

      onChange({
        ...data,
        entries: [...data.entries, ...newEntries],
        skip: false,
      })
    } catch (err) {
      setUploadError('Failed to parse file')
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleSkip = () => {
    onChange({ ...data, skip: true, entries: [] })
    onComplete()
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className={cn(jsb.heading, 'text-xl mb-2')}>Do Not Contact List</h2>
        <p className="text-gray-400">Optional: Add emails or domains you never want to contact</p>
      </div>

      {/* Info Card */}
      <div className={cn(jsb.card, 'p-4 flex items-start gap-4')}>
        <div className="w-10 h-10 bg-amber-500/20 rounded-lg flex items-center justify-center shrink-0">
          <svg className="w-5 h-5 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <div>
          <p className={cn(jsb.heading, 'text-sm mb-1')}>Protect your reputation</p>
          <p className="text-sm text-gray-400">
            Add existing customers, competitors, or anyone you don't want to reach out to. You can always update this later.
          </p>
        </div>
      </div>

      {/* Upload CSV */}
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.txt"
          onChange={handleFileUpload}
          className="hidden"
          id="dnc-upload"
        />
        <label
          htmlFor="dnc-upload"
          className={cn(
            jsb.card,
            'flex flex-col items-center justify-center py-8 cursor-pointer hover:border-jsb-pink transition-colors duration-150'
          )}
        >
          <svg className="w-10 h-10 text-gray-500 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p className={jsb.heading}>Upload a CSV file</p>
          <p className="text-sm text-gray-500 mt-1">One email or domain per line</p>
        </label>
        {uploadError && (
          <p className="text-sm text-red-400 mt-2">{uploadError}</p>
        )}
      </div>

      {/* Manual Entry */}
      <div>
        <label htmlFor="manualEntry" className={cn(jsb.label, 'block mb-2')}>
          Or add manually
        </label>
        <div className="flex gap-2">
          <input
            id="manualEntry"
            type="text"
            value={manualEntry}
            onChange={(e) => setManualEntry(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddEntry()}
            className={cn(jsb.input, 'flex-1 px-4 py-2')}
            placeholder="email@example.com or example.com"
          />
          <button
            onClick={handleAddEntry}
            disabled={!manualEntry.trim()}
            className={cn(jsb.buttonSecondary, 'px-4 py-2')}
          >
            Add
          </button>
        </div>
      </div>

      {/* Entry List */}
      {data.entries.length > 0 && (
        <div className={cn(jsb.card, 'p-4')}>
          <p className={cn(jsb.label, 'mb-3')}>{data.entries.length} entries added</p>
          <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
            {data.entries.map((entry, index) => (
              <span
                key={index}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-jsb-navy rounded-full text-sm text-gray-300"
              >
                <span className={cn(
                  'w-1.5 h-1.5 rounded-full',
                  entry.type === 'email' ? 'bg-blue-400' : 'bg-purple-400'
                )} />
                {entry.value}
                <button
                  onClick={() => handleRemoveEntry(index)}
                  className="ml-1 text-gray-500 hover:text-white transition-colors"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex gap-3 pt-4">
        <button
          onClick={onBack}
          className={cn(jsb.buttonSecondary, 'px-6 py-3')}
        >
          Back
        </button>
        <button
          onClick={handleSkip}
          disabled={loading}
          className={cn(jsb.buttonGhost, 'px-6 py-3')}
        >
          Skip for now
        </button>
        <button
          onClick={onComplete}
          disabled={loading}
          className={cn(jsb.buttonPrimary, 'flex-1 py-3')}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Completing setup...
            </span>
          ) : (
            'Complete setup'
          )}
        </button>
      </div>
    </div>
  )
}
