'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function ResearchPage() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<any>(null)
  const [overrideText, setOverrideText] = useState('')

  const handleResearch = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setResult(null)

    try {
      const res = await fetch('/api/research/icp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          override: overrideText || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Research failed')
      }

      setResult(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Simple nav */}
      <nav className="border-b border-slate-800 bg-slate-900">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-white">Sales Agent</h1>
          <div className="flex gap-4">
            <Link href="/research" className="text-blue-400 hover:text-blue-300">
              Research
            </Link>
            <Link href="/dnc" className="text-slate-400 hover:text-white">
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
          <h2 className="text-3xl font-bold text-white mb-2">ICP Research</h2>
          <p className="text-slate-400">Enter a URL to research ideal customer profile</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleResearch} className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Company URL
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded text-white focus:outline-none focus:border-blue-500"
                  placeholder="https://example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Override ICP (Optional)
                </label>
                <textarea
                  value={overrideText}
                  onChange={(e) => setOverrideText(e.target.value)}
                  rows={4}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded text-white focus:outline-none focus:border-blue-500"
                  placeholder="Enter your own ICP description to override AI research..."
                />
                <p className="mt-1 text-xs text-slate-500">
                  Leave blank to let AI research the ICP automatically
                </p>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !url}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 text-white rounded font-medium transition-colors"
          >
            {loading ? 'Researching...' : 'Start Research'}
          </button>
        </form>

        {/* Results */}
        {result && (
          <div className="mt-8 bg-slate-900 border border-slate-800 rounded-lg p-6">
            <h3 className="text-xl font-semibold text-white mb-4">Research Results</h3>

            {result.icp && (
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-slate-400 mb-2">Ideal Customer Profile</h4>
                  <p className="text-white whitespace-pre-wrap">{result.icp}</p>
                </div>

                {result.industries && result.industries.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-slate-400 mb-2">Industries</h4>
                    <div className="flex flex-wrap gap-2">
                      {result.industries.map((industry: string, i: number) => (
                        <span
                          key={i}
                          className="px-3 py-1 bg-blue-500/10 border border-blue-500/30 text-blue-400 rounded text-sm"
                        >
                          {industry}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {result.titles && result.titles.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-slate-400 mb-2">Target Titles</h4>
                    <div className="flex flex-wrap gap-2">
                      {result.titles.map((title: string, i: number) => (
                        <span
                          key={i}
                          className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded text-sm"
                        >
                          {title}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
