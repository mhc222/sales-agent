'use client'

import { jsb, cn } from '@/lib/styles'

type ChannelData = {
  outreachChannels: ('email' | 'linkedin')[]
  dataSources: ('apollo' | 'audiencelab')[]
}

type Props = {
  data: ChannelData
  onChange: (data: ChannelData) => void
  onNext: () => void
  onBack: () => void
}

const outreachOptions = [
  {
    id: 'email',
    label: 'Email Outreach',
    description: 'Send personalized email sequences via Smartlead, Nureply, or Instantly',
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    id: 'linkedin',
    label: 'LinkedIn Outreach',
    description: 'Automated connection requests and messages via HeyReach',
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
      </svg>
    ),
  },
] as const

const sourceOptions = [
  {
    id: 'apollo',
    label: 'Apollo',
    description: 'Search and enrich leads from Apollo.io database',
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <path strokeLinecap="round" d="M12 6v6l4 2" />
      </svg>
    ),
  },
  {
    id: 'audiencelab',
    label: 'AudienceLab',
    description: 'Import leads from your website pixel and intent data feeds',
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
] as const

export default function ChannelsStep({ data, onChange, onNext, onBack }: Props) {
  const toggleChannel = (channel: 'email' | 'linkedin') => {
    const current = data.outreachChannels
    if (current.includes(channel)) {
      // Don't allow removing last channel
      if (current.length === 1) return
      onChange({ ...data, outreachChannels: current.filter((c) => c !== channel) })
    } else {
      onChange({ ...data, outreachChannels: [...current, channel] })
    }
  }

  const toggleSource = (source: 'apollo' | 'audiencelab') => {
    const current = data.dataSources
    if (current.includes(source)) {
      // Don't allow removing last data source
      if (current.length === 1) return
      onChange({ ...data, dataSources: current.filter((s) => s !== source) })
    } else {
      onChange({ ...data, dataSources: [...current, source] })
    }
  }

  // Valid if at least one channel and at least one data source
  const isValid = data.outreachChannels.length > 0 && data.dataSources.length > 0

  return (
    <div className="space-y-8">
      <div>
        <h2 className={cn(jsb.heading, 'text-xl mb-2')}>Outreach Channels & Data Sources</h2>
        <p className="text-gray-400">
          Choose how you want to reach prospects and where to find them
        </p>
      </div>

      {/* Outreach Channels */}
      <div>
        <h3 className={cn(jsb.heading, 'text-sm mb-3 flex items-center gap-2')}>
          <span className="w-6 h-6 rounded-full bg-jsb-pink/20 text-jsb-pink flex items-center justify-center text-xs">1</span>
          Outreach Channels
        </h3>
        <p className="text-sm text-gray-500 mb-4">Select one or both channels for reaching prospects</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {outreachOptions.map((option) => {
            const isSelected = data.outreachChannels.includes(option.id)
            return (
              <button
                key={option.id}
                onClick={() => toggleChannel(option.id)}
                className={cn(
                  jsb.card,
                  'p-4 text-left transition-all duration-200',
                  isSelected
                    ? 'border-jsb-pink bg-jsb-pink/10'
                    : 'hover:border-gray-600'
                )}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={cn(
                      'w-12 h-12 rounded-lg flex items-center justify-center shrink-0',
                      isSelected ? 'bg-jsb-pink/20 text-jsb-pink' : 'bg-jsb-navy-lighter text-gray-400'
                    )}
                  >
                    {option.icon}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className={cn(jsb.heading, 'text-sm')}>{option.label}</span>
                      <div
                        className={cn(
                          'w-5 h-5 rounded border-2 flex items-center justify-center transition-colors',
                          isSelected
                            ? 'bg-jsb-pink border-jsb-pink'
                            : 'border-gray-500'
                        )}
                      >
                        {isSelected && (
                          <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{option.description}</p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Data Sources */}
      <div>
        <h3 className={cn(jsb.heading, 'text-sm mb-3 flex items-center gap-2')}>
          <span className="w-6 h-6 rounded-full bg-jsb-pink/20 text-jsb-pink flex items-center justify-center text-xs">2</span>
          Data Sources
        </h3>
        <p className="text-sm text-gray-500 mb-4">Where should we find and import leads from?</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sourceOptions.map((option) => {
            const isSelected = data.dataSources.includes(option.id)
            return (
              <button
                key={option.id}
                onClick={() => toggleSource(option.id)}
                className={cn(
                  jsb.card,
                  'p-4 text-left transition-all duration-200',
                  isSelected
                    ? 'border-jsb-pink bg-jsb-pink/10'
                    : 'hover:border-gray-600'
                )}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={cn(
                      'w-12 h-12 rounded-lg flex items-center justify-center shrink-0',
                      isSelected ? 'bg-jsb-pink/20 text-jsb-pink' : 'bg-jsb-navy-lighter text-gray-400'
                    )}
                  >
                    {option.icon}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className={cn(jsb.heading, 'text-sm')}>{option.label}</span>
                      <div
                        className={cn(
                          'w-5 h-5 rounded border-2 flex items-center justify-center transition-colors',
                          isSelected
                            ? 'bg-jsb-pink border-jsb-pink'
                            : 'border-gray-500'
                        )}
                      >
                        {isSelected && (
                          <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{option.description}</p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
        <p className="text-xs text-gray-500 mt-2">Select at least one data source</p>
      </div>

      {/* Summary */}
      <div className={cn(jsb.card, 'p-4 bg-jsb-navy-lighter/50')}>
        <p className="text-sm text-gray-400">
          <span className="text-white font-medium">Selected:</span>{' '}
          {data.outreachChannels.map((c) => c === 'email' ? 'Email' : 'LinkedIn').join(' + ')} outreach via{' '}
          {data.dataSources.map((s) => s === 'apollo' ? 'Apollo' : 'AudienceLab').join(' + ')} data
        </p>
      </div>

      {/* Navigation */}
      <div className="flex gap-3 pt-4">
        <button onClick={onBack} className={cn(jsb.buttonSecondary, 'px-6 py-3')}>
          Back
        </button>
        <button
          onClick={onNext}
          disabled={!isValid}
          className={cn(jsb.buttonPrimary, 'flex-1 py-3')}
        >
          Continue
        </button>
      </div>
    </div>
  )
}
