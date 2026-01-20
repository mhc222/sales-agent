'use client'

import { jsb, cn } from '@/lib/styles'

export interface ChannelData {
  channels: ('email' | 'linkedin')[]
  smartleadCampaignId: string
  heyreachCampaignId: string
}

type Props = {
  data: ChannelData
  hasSmartlead: boolean
  hasHeyreach: boolean
  onChange: (data: ChannelData) => void
  onNext: () => void
  onBack: () => void
}

const channelOptions = [
  {
    id: 'email' as const,
    label: 'Email',
    description: 'Deploy leads to SmartLead email campaigns',
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    id: 'linkedin' as const,
    label: 'LinkedIn',
    description: 'Deploy leads to HeyReach LinkedIn campaigns',
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
      </svg>
    ),
  },
]

export default function ChannelsStep({
  data,
  hasSmartlead,
  hasHeyreach,
  onChange,
  onNext,
  onBack,
}: Props) {
  const toggleChannel = (channel: 'email' | 'linkedin') => {
    const current = data.channels
    if (current.includes(channel)) {
      // Don't allow removing last channel
      if (current.length === 1) return
      onChange({ ...data, channels: current.filter((c) => c !== channel) })
    } else {
      onChange({ ...data, channels: [...current, channel] })
    }
  }

  // Validation: must have at least one channel with a valid campaign ID
  const emailSelected = data.channels.includes('email')
  const linkedinSelected = data.channels.includes('linkedin')

  const isValid = (() => {
    if (data.channels.length === 0) return false
    // If email selected, should have smartlead campaign ID (or tenant has smartlead)
    if (emailSelected && !data.smartleadCampaignId && !hasSmartlead) return false
    // If linkedin selected, should have heyreach campaign ID (or tenant has heyreach)
    if (linkedinSelected && !data.heyreachCampaignId && !hasHeyreach) return false
    return true
  })()

  return (
    <div className="space-y-6">
      <div>
        <h2 className={cn(jsb.heading, 'text-xl mb-2')}>Outreach Channels</h2>
        <p className="text-gray-400">Select how leads from this campaign will be contacted</p>
      </div>

      {/* Channel Selection */}
      <div>
        <label className={cn(jsb.label, 'block mb-3')}>Select Channels</label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {channelOptions.map((option) => {
            const isSelected = data.channels.includes(option.id)
            const isDisabled =
              (option.id === 'email' && !hasSmartlead) ||
              (option.id === 'linkedin' && !hasHeyreach)

            return (
              <button
                key={option.id}
                onClick={() => !isDisabled && toggleChannel(option.id)}
                disabled={isDisabled}
                className={cn(
                  jsb.card,
                  'p-4 text-left transition-all duration-200',
                  isDisabled
                    ? 'opacity-50 cursor-not-allowed'
                    : isSelected
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
                          isSelected ? 'bg-jsb-pink border-jsb-pink' : 'border-gray-500'
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
                    {isDisabled && (
                      <p className="text-xs text-amber-400 mt-2">
                        {option.id === 'email' ? 'SmartLead' : 'HeyReach'} not configured in tenant settings
                      </p>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Campaign ID Inputs */}
      {(emailSelected || linkedinSelected) && (
        <div className={cn(jsb.card, 'p-5 space-y-4')}>
          <h3 className={cn(jsb.heading, 'text-sm')}>Platform Campaign Links</h3>
          <p className="text-sm text-gray-400">
            Link this campaign to existing campaigns in your outreach platforms.
            Create template campaigns in each platform first.
          </p>

          {emailSelected && (
            <div>
              <label className={cn(jsb.label, 'block mb-2')}>SmartLead Campaign ID</label>
              <input
                type="text"
                value={data.smartleadCampaignId}
                onChange={(e) => onChange({ ...data, smartleadCampaignId: e.target.value })}
                className={cn(jsb.input, 'w-full px-4 py-3')}
                placeholder="e.g., 12345"
              />
              <p className="text-xs text-gray-500 mt-1">
                Find this in SmartLead under Campaign Settings
              </p>
            </div>
          )}

          {linkedinSelected && (
            <div>
              <label className={cn(jsb.label, 'block mb-2')}>HeyReach Campaign ID</label>
              <input
                type="text"
                value={data.heyreachCampaignId}
                onChange={(e) => onChange({ ...data, heyreachCampaignId: e.target.value })}
                className={cn(jsb.input, 'w-full px-4 py-3')}
                placeholder="e.g., abc-123"
              />
              <p className="text-xs text-gray-500 mt-1">
                Find this in HeyReach under Campaign Settings
              </p>
            </div>
          )}
        </div>
      )}

      {/* Summary */}
      {data.channels.length > 0 && (
        <div className={cn(jsb.card, 'p-4 bg-jsb-navy-lighter/50')}>
          <p className="text-sm text-gray-400">
            <span className="text-white font-medium">Selected:</span>{' '}
            {data.channels.map((c) => (c === 'email' ? 'Email' : 'LinkedIn')).join(' + ')} outreach
          </p>
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
          className={cn(jsb.buttonPrimary, 'flex-1 py-3')}
        >
          Continue
        </button>
      </div>
    </div>
  )
}
