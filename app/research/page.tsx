'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function ResearchPage() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<any>(null)
  const [additionalInfo, setAdditionalInfo] = useState('')
  const [refining, setRefining] = useState(false)

  const handleResearch = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setResult(null)
    setAdditionalInfo('')

    try {
      const res = await fetch('/api/research/icp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
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

  const handleRefine = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!additionalInfo.trim()) return

    setRefining(true)
    setError('')

    try {
      const res = await fetch('/api/research/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          current_icp: result.icp,
          additional_context: additionalInfo,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Refinement failed')
      }

      setResult(data)
      setAdditionalInfo('')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setRefining(false)
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
          <p className="text-slate-400">Research ideal customer profile from company website</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded text-red-400">
            {error}
          </div>
        )}

        {/* Step 1: Initial Research */}
        {!result && (
          <form onSubmit={handleResearch} className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
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

            <button
              type="submit"
              disabled={loading || !url}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 text-white rounded font-medium transition-colors"
            >
              {loading ? 'Researching...' : 'Start Research'}
            </button>
          </form>
        )}

        {/* Step 2: Results + Refinement */}
        {result && (
          <div className="space-y-6">
            {/* Initial Results */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold text-white">Initial ICP Research</h3>
                <button
                  onClick={() => {
                    setResult(null)
                    setUrl('')
                  }}
                  className="text-sm text-slate-400 hover:text-white"
                >
                  Start Over
                </button>
              </div>

              <div className="prose prose-invert max-w-none">
                <div className="whitespace-pre-wrap text-slate-200">{result.icp}</div>
              </div>

              {result.source_url && (
                <div className="mt-4 pt-4 border-t border-slate-700">
                  <p className="text-xs text-slate-500">
                    Researched from: <span className="text-blue-400">{result.source_url}</span>
                  </p>
                </div>
              )}
            </div>

            {/* Refinement Form */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-4">
                Refine ICP (Optional)
              </h3>
              <p className="text-sm text-slate-400 mb-4">
                Add any additional context, corrections, or specific requirements. AI will search for more info and update the ICP accordingly.
              </p>

              <form onSubmit={handleRefine} className="space-y-4">
                <textarea
                  value={additionalInfo}
                  onChange={(e) => setAdditionalInfo(e.target.value)}
                  rows={6}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded text-white focus:outline-none focus:border-blue-500"
                  placeholder="Example: Actually we're targeting Fortune 500 companies in healthcare specifically. Also they need to be using Salesforce. Our main competitor is XYZ Corp."
                />

                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={refining || !additionalInfo.trim()}
                    className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 text-white rounded font-medium transition-colors"
                  >
                    {refining ? 'Refining ICP...' : 'Refine ICP'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('Save this ICP and continue?')) {
                        // TODO: Save ICP
                        alert('ICP saved! (TODO: implement save)')
                      }
                    }}
                    className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-medium transition-colors"
                  >
                    Save ICP
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
