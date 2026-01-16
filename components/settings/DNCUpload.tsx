'use client'

import { useState, useRef } from 'react'
import { jsb, cn } from '@/lib/styles'

type Props = {
  onUploadComplete: () => void
}

export default function DNCUpload({ onUploadComplete }: Props) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ added: number; skipped: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setError(null)
    setSuccess(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('reason', 'Uploaded via CSV')

      const res = await fetch('/api/dnc/upload', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Upload failed')
        return
      }

      setSuccess({ added: data.added, skipped: data.skipped })
      onUploadComplete()
    } catch (err) {
      setError('Failed to upload file')
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.txt"
        onChange={handleUpload}
        disabled={uploading}
        className="hidden"
        id="dnc-file-upload"
      />

      <label
        htmlFor="dnc-file-upload"
        className={cn(
          jsb.card,
          'flex flex-col items-center justify-center py-8 cursor-pointer hover:border-jsb-pink transition-colors duration-150',
          uploading && 'opacity-50 cursor-not-allowed'
        )}
      >
        {uploading ? (
          <>
            <svg className="animate-spin h-8 w-8 text-jsb-pink mb-3" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className={jsb.heading}>Uploading...</p>
          </>
        ) : (
          <>
            <svg className="w-10 h-10 text-gray-500 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className={jsb.heading}>Upload CSV file</p>
            <p className="text-sm text-gray-500 mt-1">One email or domain per line</p>
          </>
        )}
      </label>

      {error && (
        <div className="p-3 rounded-md bg-red-500/10 border border-red-500/30">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {success && (
        <div className="p-3 rounded-md bg-emerald-500/10 border border-emerald-500/30">
          <p className="text-sm text-emerald-400">
            Added {success.added} entries
            {success.skipped > 0 && ` (${success.skipped} duplicates skipped)`}
          </p>
        </div>
      )}
    </div>
  )
}
