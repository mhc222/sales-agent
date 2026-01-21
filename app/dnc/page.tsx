'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

export default function DNCPage() {
  const [emails, setEmails] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [file, setFile] = useState<File | null>(null)

  useEffect(() => {
    fetchDNC()
  }, [])

  const fetchDNC = async () => {
    try {
      const res = await fetch('/api/dnc')
      const data = await res.json()

      if (res.ok) {
        setEmails(data.emails || [])
      }
    } catch (err) {
      console.error('Failed to fetch DNC list:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleAddEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newEmail) return

    setUploading(true)
    setError('')

    try {
      const res = await fetch('/api/dnc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to add email')
      }

      setNewEmail('')
      fetchDNC()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return

    setUploading(true)
    setError('')

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/dnc/upload', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to upload file')
      }

      setFile(null)
      fetchDNC()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (email: string) => {
    if (!confirm(`Remove ${email} from DNC list?`)) return

    try {
      const res = await fetch('/api/dnc', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      if (res.ok) {
        fetchDNC()
      }
    } catch (err) {
      console.error('Failed to delete email:', err)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Simple nav */}
      <nav className="border-b border-slate-800 bg-slate-900">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-white">Sales Agent</h1>
          <div className="flex gap-4">
            <Link href="/research" className="text-slate-400 hover:text-white">
              Research
            </Link>
            <Link href="/dnc" className="text-blue-400 hover:text-blue-300">
              DNC List
            </Link>
            <Link href="/setup" className="text-slate-400 hover:text-white">
              Settings
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto p-6">
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-white mb-2">Do Not Contact List</h2>
          <p className="text-slate-400">Manage emails that should never be contacted</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded text-red-400">
            {error}
          </div>
        )}

        {/* Add single email */}
        <div className="mb-6 bg-slate-900 border border-slate-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Add Email</h3>
          <form onSubmit={handleAddEmail} className="flex gap-3">
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="flex-1 px-4 py-2 bg-slate-800 border border-slate-700 rounded text-white focus:outline-none focus:border-blue-500"
              placeholder="email@example.com"
            />
            <button
              type="submit"
              disabled={uploading || !newEmail}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 text-white rounded font-medium transition-colors"
            >
              Add
            </button>
          </form>
        </div>

        {/* Upload CSV */}
        <div className="mb-6 bg-slate-900 border border-slate-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Upload CSV</h3>
          <form onSubmit={handleFileUpload} className="flex gap-3">
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="flex-1 px-4 py-2 bg-slate-800 border border-slate-700 rounded text-white focus:outline-none focus:border-blue-500"
            />
            <button
              type="submit"
              disabled={uploading || !file}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 text-white rounded font-medium transition-colors"
            >
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </form>
          <p className="mt-2 text-xs text-slate-500">CSV should have an "email" column</p>
        </div>

        {/* DNC List */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">
              DNC Emails ({emails.length})
            </h3>
          </div>

          {loading ? (
            <div className="text-center py-8 text-slate-400">Loading...</div>
          ) : emails.length === 0 ? (
            <div className="text-center py-8 text-slate-400">No emails in DNC list</div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {emails.map((email, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 bg-slate-800 rounded border border-slate-700"
                >
                  <span className="text-white">{email}</span>
                  <button
                    onClick={() => handleDelete(email)}
                    className="text-red-400 hover:text-red-300 text-sm"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
