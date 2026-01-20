'use client'

import { jsb, cn } from '@/lib/styles'

type CompanyData = {
  companyName: string
  yourName: string
  websiteUrl: string
}

type Props = {
  data: CompanyData
  onChange: (data: CompanyData) => void
  onNext: () => void
  onBack: () => void
}

// Simple URL validation - accepts with or without protocol
function isValidUrl(url: string): boolean {
  if (!url.trim()) return false
  // Add protocol if missing for validation
  const urlToTest = url.startsWith('http') ? url : `https://${url}`
  try {
    new URL(urlToTest)
    return true
  } catch {
    return false
  }
}

export default function CompanyStep({ data, onChange, onNext, onBack }: Props) {
  const isValid =
    data.companyName.trim() &&
    data.yourName.trim() &&
    isValidUrl(data.websiteUrl)

  return (
    <div className="space-y-6">
      <div>
        <h2 className={cn(jsb.heading, 'text-xl mb-2')}>Tell us about your company</h2>
        <p className="text-gray-400">
          We'll analyze your website to build your ideal customer profile automatically
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="companyName" className={cn(jsb.label, 'block mb-2')}>
            Company name
          </label>
          <input
            id="companyName"
            type="text"
            value={data.companyName}
            onChange={(e) => onChange({ ...data, companyName: e.target.value })}
            className={cn(jsb.input, 'w-full px-4 py-3')}
            placeholder="Acme Inc."
          />
        </div>

        <div>
          <label htmlFor="yourName" className={cn(jsb.label, 'block mb-2')}>
            Your name
          </label>
          <input
            id="yourName"
            type="text"
            value={data.yourName}
            onChange={(e) => onChange({ ...data, yourName: e.target.value })}
            className={cn(jsb.input, 'w-full px-4 py-3')}
            placeholder="John Smith"
          />
        </div>

        <div>
          <label htmlFor="websiteUrl" className={cn(jsb.label, 'block mb-2')}>
            Company website
          </label>
          <input
            id="websiteUrl"
            type="text"
            value={data.websiteUrl}
            onChange={(e) => onChange({ ...data, websiteUrl: e.target.value })}
            className={cn(jsb.input, 'w-full px-4 py-3')}
            placeholder="yourcompany.com"
          />
          <p className="text-xs text-gray-500 mt-1">
            We'll use this to research your business and generate your ICP
          </p>
        </div>
      </div>

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
