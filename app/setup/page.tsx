'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function SetupPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // AI Provider
  const [aiProvider, setAiProvider] = useState<'openai' | 'anthropic'>('anthropic')
  const [aiApiKey, setAiApiKey] = useState('')

  // Smartlead
  const [smartleadApiKey, setSmartleadApiKey] = useState('')

  // Apollo
  const [apolloApiKey, setApolloApiKey] = useState('')

  // AudienceLab
  const [audienceLabUrl, setAudienceLabUrl] = useState('')
  const [audienceLabApiKey, setAudienceLabApiKey] = useState('')

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/settings/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ai_provider: aiProvider,
          ai_api_key: aiApiKey,
          smartlead_api_key: smartleadApiKey,
          apollo_api_key: apolloApiKey,
          audiencelab_api_url: audienceLabUrl,
          audiencelab_api_key: audienceLabApiKey,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save credentials')
      }

      router.push('/research')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white mb-2">Setup Credentials</h1>
          <p className="text-slate-400">Enter your API keys and configuration</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-6">
          {/* AI Provider */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-white mb-4">AI Provider</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Provider
                </label>
                <select
                  value={aiProvider}
                  onChange={(e) => setAiProvider(e.target.value as 'openai' | 'anthropic')}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="openai">OpenAI (GPT-4)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  API Key
                </label>
                <input
                  type="password"
                  value={aiApiKey}
                  onChange={(e) => setAiApiKey(e.target.value)}
                  required
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded text-white focus:outline-none focus:border-blue-500"
                  placeholder="sk-ant-... or sk-..."
                />
              </div>
            </div>
          </div>

          {/* Smartlead */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Smartlead</h2>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                API Key
              </label>
              <input
                type="password"
                value={smartleadApiKey}
                onChange={(e) => setSmartleadApiKey(e.target.value)}
                className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded text-white focus:outline-none focus:border-blue-500"
                placeholder="Optional - for email campaigns"
              />
            </div>
          </div>

          {/* Apollo */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Apollo</h2>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                API Key
              </label>
              <input
                type="password"
                value={apolloApiKey}
                onChange={(e) => setApolloApiKey(e.target.value)}
                className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded text-white focus:outline-none focus:border-blue-500"
                placeholder="Optional - for lead sourcing"
              />
            </div>
          </div>

          {/* AudienceLab */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-white mb-4">AudienceLab</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  API URL
                </label>
                <input
                  type="url"
                  value={audienceLabUrl}
                  onChange={(e) => setAudienceLabUrl(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded text-white focus:outline-none focus:border-blue-500"
                  placeholder="https://api.audiencelab.io/..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  API Key
                </label>
                <input
                  type="password"
                  value={audienceLabApiKey}
                  onChange={(e) => setAudienceLabApiKey(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded text-white focus:outline-none focus:border-blue-500"
                  placeholder="Optional - for intent data"
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-4">
            <button
              type="submit"
              disabled={loading || !aiApiKey}
              className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 text-white rounded font-medium transition-colors"
            >
              {loading ? 'Saving...' : 'Save & Continue'}
            </button>
            <Link
              href="/research"
              className="px-6 py-3 border border-slate-700 text-slate-300 hover:text-white hover:border-slate-600 rounded font-medium transition-colors text-center"
            >
              Skip for now
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
