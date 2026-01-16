'use client'

import { jsb, cn } from '@/lib/styles'

type CompanyData = {
  companyName: string
  yourName: string
}

type Props = {
  data: CompanyData
  onChange: (data: CompanyData) => void
  onNext: () => void
}

export default function CompanyStep({ data, onChange, onNext }: Props) {
  const isValid = data.companyName.trim() && data.yourName.trim()

  return (
    <div className="space-y-6">
      <div>
        <h2 className={cn(jsb.heading, 'text-xl mb-2')}>Tell us about your company</h2>
        <p className="text-gray-400">This helps us personalize your experience</p>
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
      </div>

      <div className="pt-4">
        <button
          onClick={onNext}
          disabled={!isValid}
          className={cn(jsb.buttonPrimary, 'w-full py-3')}
        >
          Continue
        </button>
      </div>
    </div>
  )
}
