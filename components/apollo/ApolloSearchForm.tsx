'use client'

import { useState } from 'react'
import { jsb, cn } from '@/lib/styles'
import { INDUSTRY_IDS } from '@/src/lib/apollo'

type SearchParams = {
  jobTitles: string
  industry: string
  locations: string
  minEmployees: string
  maxEmployees: string
}

type Props = {
  onSearch: (params: SearchParams) => void
  loading: boolean
}

const popularIndustries = [
  { value: 'computer software', label: 'Computer Software' },
  { value: 'information technology', label: 'Information Technology' },
  { value: 'marketing and advertising', label: 'Marketing & Advertising' },
  { value: 'financial services', label: 'Financial Services' },
  { value: 'hospital and healthcare', label: 'Healthcare' },
  { value: 'real estate', label: 'Real Estate' },
  { value: 'education management', label: 'Education' },
  { value: 'retail', label: 'Retail' },
]

const popularLocations = [
  'United States',
  'United Kingdom',
  'Canada',
  'Australia',
  'Germany',
]

export default function ApolloSearchForm({ onSearch, loading }: Props) {
  const [params, setParams] = useState<SearchParams>({
    jobTitles: '',
    industry: '',
    locations: '',
    minEmployees: '10',
    maxEmployees: '1000',
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSearch(params)
  }

  const isValid = params.jobTitles.trim() || params.industry

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Job Titles */}
      <div>
        <label htmlFor="jobTitles" className={cn(jsb.label, 'block mb-2')}>
          Job Titles
        </label>
        <input
          id="jobTitles"
          type="text"
          value={params.jobTitles}
          onChange={(e) => setParams({ ...params, jobTitles: e.target.value })}
          className={cn(jsb.input, 'w-full px-4 py-2.5')}
          placeholder="e.g., CEO, VP Marketing, Director of Sales"
        />
        <p className="text-xs text-gray-500 mt-1">Comma-separated list of titles</p>
      </div>

      {/* Industry */}
      <div>
        <label htmlFor="industry" className={cn(jsb.label, 'block mb-2')}>
          Industry
        </label>
        <select
          id="industry"
          value={params.industry}
          onChange={(e) => setParams({ ...params, industry: e.target.value })}
          className={cn(jsb.select, 'w-full px-4 py-2.5')}
        >
          <option value="">All industries</option>
          {popularIndustries.map((ind) => (
            <option key={ind.value} value={ind.value}>
              {ind.label}
            </option>
          ))}
          <option disabled>──────────</option>
          {Object.keys(INDUSTRY_IDS)
            .filter((key) => !popularIndustries.some((p) => p.value === key))
            .sort()
            .map((key) => (
              <option key={key} value={key}>
                {key.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
              </option>
            ))}
        </select>
      </div>

      {/* Locations */}
      <div>
        <label htmlFor="locations" className={cn(jsb.label, 'block mb-2')}>
          Locations
        </label>
        <input
          id="locations"
          type="text"
          value={params.locations}
          onChange={(e) => setParams({ ...params, locations: e.target.value })}
          className={cn(jsb.input, 'w-full px-4 py-2.5')}
          placeholder="e.g., United States, United Kingdom"
        />
        <div className="flex flex-wrap gap-1.5 mt-2">
          {popularLocations.map((loc) => (
            <button
              key={loc}
              type="button"
              onClick={() => {
                const current = params.locations.split(',').map((l) => l.trim()).filter(Boolean)
                if (!current.includes(loc)) {
                  setParams({
                    ...params,
                    locations: [...current, loc].join(', '),
                  })
                }
              }}
              className="px-2 py-0.5 text-xs bg-jsb-navy-lighter rounded hover:bg-jsb-navy transition-colors text-gray-400 hover:text-white"
            >
              + {loc}
            </button>
          ))}
        </div>
      </div>

      {/* Employee Range */}
      <div>
        <label className={cn(jsb.label, 'block mb-2')}>
          Company Size (Employees)
        </label>
        <div className="flex items-center gap-3">
          <input
            type="number"
            value={params.minEmployees}
            onChange={(e) => setParams({ ...params, minEmployees: e.target.value })}
            className={cn(jsb.input, 'w-28 px-3 py-2 text-center')}
            min="1"
            placeholder="Min"
          />
          <span className="text-gray-500">to</span>
          <input
            type="number"
            value={params.maxEmployees}
            onChange={(e) => setParams({ ...params, maxEmployees: e.target.value })}
            className={cn(jsb.input, 'w-28 px-3 py-2 text-center')}
            min="1"
            placeholder="Max"
          />
        </div>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={loading || !isValid}
        className={cn(jsb.buttonPrimary, 'w-full py-3')}
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Searching...
          </span>
        ) : (
          'Search Apollo'
        )}
      </button>
    </form>
  )
}
