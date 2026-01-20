'use client'

import { useState } from 'react'
import { jsb, cn } from '@/lib/styles'
import type { LLMProvider } from '@/src/lib/llm/types'
import { PROVIDER_NAMES, AVAILABLE_MODELS, DEFAULT_MODELS } from '@/src/lib/llm/types'

type LLMData = {
  provider: LLMProvider | ''
  apiKey: string
  model?: string
}

type Props = {
  data: LLMData
  onChange: (data: LLMData) => void
  onNext: () => void
  onBack: () => void
}

const PROVIDERS: { id: LLMProvider; name: string; description: string; icon: React.ReactNode }[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude models - excellent at analysis and writing',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
        <path d="M13.827 3.52l6.016 16.32h-3.36l-1.656-4.488H9.66L12.54 3.52h1.287zm-2.463 9.168h3.432l-1.716-4.656-1.716 4.656zM7.14 3.52L1.124 19.84h3.36l6.016-16.32H7.14z" />
      </svg>
    ),
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT models - widely used and versatile',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
        <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08-4.778 2.758a.795.795 0 0 0-.392.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
      </svg>
    ),
  },
  {
    id: 'google',
    name: 'Google',
    description: 'Gemini models - great multimodal capabilities',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
        <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
      </svg>
    ),
  },
]

export default function LLMProviderStep({ data, onChange, onNext, onBack }: Props) {
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null)
  const [testError, setTestError] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const selectedProvider = PROVIDERS.find((p) => p.id === data.provider)
  const availableModels = data.provider ? AVAILABLE_MODELS[data.provider] : []
  const defaultModel = data.provider ? DEFAULT_MODELS[data.provider] : ''

  const handleProviderSelect = (providerId: LLMProvider) => {
    onChange({
      ...data,
      provider: providerId,
      model: undefined, // Reset model when provider changes
    })
    setTestResult(null)
    setTestError(null)
  }

  const handleTestConnection = async () => {
    if (!data.provider || !data.apiKey) return

    setTesting(true)
    setTestResult(null)
    setTestError(null)

    try {
      const res = await fetch('/api/onboarding/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'llm',
          provider: data.provider,
          apiKey: data.apiKey,
        }),
      })

      const result = await res.json()

      if (res.ok && result.success) {
        setTestResult('success')
      } else {
        setTestResult('error')
        setTestError(result.error || 'Connection test failed')
      }
    } catch {
      setTestResult('error')
      setTestError('Failed to test connection')
    } finally {
      setTesting(false)
    }
  }

  const isValid = data.provider && data.apiKey && testResult === 'success'

  return (
    <div className="space-y-6">
      <div>
        <h2 className={cn(jsb.heading, 'text-xl mb-2')}>AI Provider</h2>
        <p className="text-gray-400">
          Choose your AI provider and enter your API key. This powers all the AI features including
          ICP research, email writing, and lead qualification.
        </p>
      </div>

      {/* Provider Selection */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-300">Select Provider</label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PROVIDERS.map((provider) => (
            <button
              key={provider.id}
              onClick={() => handleProviderSelect(provider.id)}
              className={cn(
                jsb.card,
                'p-4 text-left transition-all duration-200 hover:border-jsb-pink/50',
                data.provider === provider.id && 'border-jsb-pink bg-jsb-pink/10'
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    'text-gray-400 transition-colors',
                    data.provider === provider.id && 'text-jsb-pink'
                  )}
                >
                  {provider.icon}
                </div>
                <div>
                  <h3 className={cn(jsb.heading, 'text-base')}>{provider.name}</h3>
                  <p className="text-xs text-gray-500 mt-1">{provider.description}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* API Key Input */}
      {data.provider && (
        <div className="space-y-4 animate-fade-in">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              {PROVIDER_NAMES[data.provider]} API Key
            </label>
            <div className="flex gap-3">
              <input
                type="password"
                value={data.apiKey}
                onChange={(e) => {
                  onChange({ ...data, apiKey: e.target.value })
                  setTestResult(null)
                  setTestError(null)
                }}
                placeholder={`Enter your ${selectedProvider?.name} API key`}
                className={cn(jsb.input, 'flex-1 px-4 py-3')}
              />
              <button
                onClick={handleTestConnection}
                disabled={!data.apiKey || testing}
                className={cn(
                  jsb.buttonSecondary,
                  'px-4 py-3 whitespace-nowrap',
                  (!data.apiKey || testing) && 'opacity-50 cursor-not-allowed'
                )}
              >
                {testing ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-gray-500 border-t-white rounded-full animate-spin" />
                    Testing...
                  </span>
                ) : (
                  'Test Connection'
                )}
              </button>
            </div>

            {/* API Key Help */}
            <p className="text-xs text-gray-500 mt-2">
              {data.provider === 'anthropic' && (
                <>
                  Get your API key from{' '}
                  <a
                    href="https://console.anthropic.com/settings/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-jsb-pink hover:underline"
                  >
                    console.anthropic.com
                  </a>
                </>
              )}
              {data.provider === 'openai' && (
                <>
                  Get your API key from{' '}
                  <a
                    href="https://platform.openai.com/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-jsb-pink hover:underline"
                  >
                    platform.openai.com
                  </a>
                </>
              )}
              {data.provider === 'google' && (
                <>
                  Get your API key from{' '}
                  <a
                    href="https://aistudio.google.com/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-jsb-pink hover:underline"
                  >
                    Google AI Studio
                  </a>
                </>
              )}
            </p>

            {/* Test Result */}
            {testResult === 'success' && (
              <div className="mt-3 p-3 rounded-lg bg-green-500/10 border border-green-500/30 flex items-center gap-2">
                <svg
                  className="w-5 h-5 text-green-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span className="text-sm text-green-400">API key verified successfully!</span>
              </div>
            )}

            {testResult === 'error' && (
              <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                <div className="flex items-center gap-2">
                  <svg
                    className="w-5 h-5 text-red-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                  <span className="text-sm text-red-400">{testError || 'Connection failed'}</span>
                </div>
              </div>
            )}
          </div>

          {/* Advanced Settings */}
          <div>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
            >
              <svg
                className={cn('w-4 h-4 transition-transform', showAdvanced && 'rotate-180')}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              Advanced Settings
            </button>

            {showAdvanced && (
              <div className="mt-4 p-4 rounded-lg bg-jsb-navy-lighter/50 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Model (Optional)
                  </label>
                  <select
                    value={data.model || ''}
                    onChange={(e) => onChange({ ...data, model: e.target.value || undefined })}
                    className={cn(jsb.input, 'w-full px-4 py-3')}
                  >
                    <option value="">Default ({defaultModel})</option>
                    {availableModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Leave as default unless you have a specific preference
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex gap-3 pt-4">
        <button onClick={onBack} className={cn(jsb.buttonSecondary, 'px-6 py-3')}>
          Back
        </button>
        <button
          onClick={onNext}
          disabled={!isValid}
          className={cn(
            jsb.buttonPrimary,
            'flex-1 py-3',
            !isValid && 'opacity-50 cursor-not-allowed'
          )}
        >
          Continue
        </button>
      </div>
    </div>
  )
}
