'use client'

import { useState, useEffect } from 'react'
import { Shell } from '@/components/layout/Shell'

interface Correction {
  id: string
  correction_type: string
  company_domain: string | null
  company_name: string | null
  incorrect_content: string
  correct_content: string
  context: string | null
  category: string | null
  severity: string
  status: string
  created_at: string
}

interface CompanyOverride {
  id: string
  company_domain: string
  company_name: string | null
  business_type: string | null
  industry_vertical: string | null
  company_description: string | null
  avoid_topics: string[] | null
  preferred_angles: string[] | null
  verified_at: string
}

export default function CorrectionsPage() {
  const [corrections, setCorrections] = useState<Correction[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showOverrideModal, setShowOverrideModal] = useState(false)
  const [filter, setFilter] = useState<'all' | 'company' | 'content'>('all')

  // Form state for new correction
  const [newCorrection, setNewCorrection] = useState({
    companyDomain: '',
    companyName: '',
    incorrectContent: '',
    correctContent: '',
    context: '',
    category: 'business_type',
    severity: 'medium',
    makeGlobal: false,
  })
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Form state for company override
  const [newOverride, setNewOverride] = useState({
    companyDomain: '',
    companyName: '',
    businessType: '',
    industryVertical: '',
    companyDescription: '',
    avoidTopics: '',
    preferredAngles: '',
  })

  useEffect(() => {
    fetchCorrections()
  }, [filter])

  async function fetchCorrections() {
    try {
      const params = new URLSearchParams()
      if (filter !== 'all') {
        params.set('type', filter)
      }
      const res = await fetch(`/api/corrections?${params}`)
      const data = await res.json()
      setCorrections(data.corrections || [])
    } catch (error) {
      console.error('Error fetching corrections:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleAddCorrection(e: React.FormEvent) {
    e.preventDefault()
    try {
      const res = await fetch('/api/corrections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'correction',
          correctionType: 'company',
          ...newCorrection,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setShowAddModal(false)
        setNewCorrection({
          companyDomain: '',
          companyName: '',
          incorrectContent: '',
          correctContent: '',
          context: '',
          category: 'business_type',
          severity: 'medium',
          makeGlobal: false,
        })
        fetchCorrections()

        // Show success message
        if (data.promotedToGlobal) {
          setSuccessMessage('Correction saved and promoted to global guideline! It will apply to ALL future emails.')
        } else {
          setSuccessMessage('Correction saved! It will apply to future emails for this company.')
        }
        setTimeout(() => setSuccessMessage(null), 5000)
      }
    } catch (error) {
      console.error('Error adding correction:', error)
    }
  }

  async function handleAddOverride(e: React.FormEvent) {
    e.preventDefault()
    try {
      const res = await fetch('/api/corrections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'company_override',
          companyDomain: newOverride.companyDomain,
          companyName: newOverride.companyName,
          businessType: newOverride.businessType || null,
          industryVertical: newOverride.industryVertical || null,
          companyDescription: newOverride.companyDescription || null,
          avoidTopics: newOverride.avoidTopics
            ? newOverride.avoidTopics.split(',').map(s => s.trim())
            : null,
          preferredAngles: newOverride.preferredAngles
            ? newOverride.preferredAngles.split(',').map(s => s.trim())
            : null,
        }),
      })

      if (res.ok) {
        setShowOverrideModal(false)
        setNewOverride({
          companyDomain: '',
          companyName: '',
          businessType: '',
          industryVertical: '',
          companyDescription: '',
          avoidTopics: '',
          preferredAngles: '',
        })
        fetchCorrections()
      }
    } catch (error) {
      console.error('Error adding override:', error)
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 text-red-800'
      case 'high':
        return 'bg-orange-100 text-orange-800'
      case 'medium':
        return 'bg-yellow-100 text-yellow-800'
      case 'low':
        return 'bg-green-100 text-green-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <Shell>
      <div className="p-6 lg:p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Corrections & Feedback</h1>
          <p className="text-gray-400 mt-2">
            Provide feedback on AI-generated content. Corrections are automatically applied to future emails.
          </p>
        </div>

        {/* Actions and Filters */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === 'all'
                  ? 'bg-jsb-navy text-white'
                  : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('company')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === 'company'
                  ? 'bg-jsb-navy text-white'
                  : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              Company
            </button>
            <button
              onClick={() => setFilter('content')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === 'content'
                  ? 'bg-jsb-navy text-white'
                  : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              Content
            </button>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setShowOverrideModal(true)}
              className="px-4 py-2 bg-white border border-jsb-navy text-jsb-navy rounded-lg hover:bg-jsb-navy hover:text-white transition-colors font-medium"
            >
              + Company Profile
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-jsb-pink text-white rounded-lg hover:bg-pink-600 transition-colors font-medium"
            >
              + Add Correction
            </button>
          </div>
        </div>

        {/* Success Message */}
        {successMessage && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 flex items-center gap-3">
            <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-green-800 font-medium">{successMessage}</p>
          </div>
        )}

        {/* Info Card */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-blue-900 mb-2">How Corrections Work</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• <strong>Corrections</strong> fix specific mistakes (e.g., "travel agency" → "marketing agency focused on travel")</li>
            <li>• <strong>Company Profiles</strong> set verified facts that override AI inferences for a specific company</li>
            <li>• All corrections are automatically injected into future email generation for matching companies</li>
          </ul>
        </div>

        {/* Corrections List */}
        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading corrections...</div>
        ) : corrections.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <div className="text-gray-400 text-5xl mb-4">📝</div>
            <h3 className="text-lg font-semibold text-gray-700 mb-2">No corrections yet</h3>
            <p className="text-gray-500 mb-4">
              When you spot an error in AI-generated content, add a correction here.
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-jsb-pink text-white rounded-lg hover:bg-pink-600 transition-colors"
            >
              Add Your First Correction
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {corrections.map((correction) => (
              <div
                key={correction.id}
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg font-semibold text-jsb-navy">
                        {correction.company_name || correction.company_domain || 'General'}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${getSeverityColor(
                          correction.severity
                        )}`}
                      >
                        {correction.severity}
                      </span>
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                        {correction.category}
                      </span>
                    </div>
                    {correction.company_domain && (
                      <p className="text-sm text-gray-500">{correction.company_domain}</p>
                    )}
                  </div>
                  <span className="text-sm text-gray-400">
                    {new Date(correction.created_at).toLocaleDateString()}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                    <p className="text-xs font-medium text-red-700 mb-1">INCORRECT</p>
                    <p className="text-red-900">{correction.incorrect_content}</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                    <p className="text-xs font-medium text-green-700 mb-1">CORRECT</p>
                    <p className="text-green-900">{correction.correct_content}</p>
                  </div>
                </div>

                {correction.context && (
                  <div className="mt-4 text-sm text-gray-600">
                    <span className="font-medium">Context:</span> {correction.context}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Add Correction Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
              <h2 className="text-xl font-bold text-jsb-navy mb-4">Add Correction</h2>
              <form onSubmit={handleAddCorrection} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Company Name
                    </label>
                    <input
                      type="text"
                      value={newCorrection.companyName}
                      onChange={(e) =>
                        setNewCorrection({ ...newCorrection, companyName: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-jsb-navy focus:border-transparent"
                      placeholder="Alliance Connection"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Company Domain
                    </label>
                    <input
                      type="text"
                      value={newCorrection.companyDomain}
                      onChange={(e) =>
                        setNewCorrection({ ...newCorrection, companyDomain: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-jsb-navy focus:border-transparent"
                      placeholder="allianceconnection.com"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    What was incorrect? *
                  </label>
                  <input
                    type="text"
                    value={newCorrection.incorrectContent}
                    onChange={(e) =>
                      setNewCorrection({ ...newCorrection, incorrectContent: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-jsb-navy focus:border-transparent"
                    placeholder="travel agency"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    What is correct? *
                  </label>
                  <input
                    type="text"
                    value={newCorrection.correctContent}
                    onChange={(e) =>
                      setNewCorrection({ ...newCorrection, correctContent: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-jsb-navy focus:border-transparent"
                    placeholder="marketing agency focused on the travel space"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Context (optional)
                  </label>
                  <textarea
                    value={newCorrection.context}
                    onChange={(e) =>
                      setNewCorrection({ ...newCorrection, context: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-jsb-navy focus:border-transparent"
                    rows={2}
                    placeholder="They are not a travel agency - they help travel brands with marketing"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                    <select
                      value={newCorrection.category}
                      onChange={(e) =>
                        setNewCorrection({ ...newCorrection, category: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-jsb-navy focus:border-transparent"
                    >
                      <option value="business_type">Business Type</option>
                      <option value="industry">Industry</option>
                      <option value="fact">Factual Error</option>
                      <option value="name">Name/Title</option>
                      <option value="tone">Tone/Style</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Severity</label>
                    <select
                      value={newCorrection.severity}
                      onChange={(e) =>
                        setNewCorrection({ ...newCorrection, severity: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-jsb-navy focus:border-transparent"
                    >
                      <option value="critical">Critical</option>
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-lg border border-purple-200">
                  <input
                    type="checkbox"
                    id="makeGlobal"
                    checked={newCorrection.makeGlobal}
                    onChange={(e) =>
                      setNewCorrection({ ...newCorrection, makeGlobal: e.target.checked })
                    }
                    className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                  />
                  <div>
                    <label htmlFor="makeGlobal" className="text-sm font-medium text-purple-900 cursor-pointer">
                      Apply to ALL future emails (not just this company)
                    </label>
                    <p className="text-xs text-purple-700">
                      Use this for general rules, not company-specific facts.
                      Critical/High severity corrections are automatically made global.
                    </p>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-jsb-pink text-white rounded-lg hover:bg-pink-600"
                  >
                    Add Correction
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Add Company Override Modal */}
        {showOverrideModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl font-bold text-jsb-navy mb-4">Add Company Profile</h2>
              <p className="text-sm text-gray-600 mb-4">
                Set verified facts about a company that will override AI inferences.
              </p>
              <form onSubmit={handleAddOverride} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Company Domain *
                    </label>
                    <input
                      type="text"
                      value={newOverride.companyDomain}
                      onChange={(e) =>
                        setNewOverride({ ...newOverride, companyDomain: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-jsb-navy focus:border-transparent"
                      placeholder="allianceconnection.com"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Company Name
                    </label>
                    <input
                      type="text"
                      value={newOverride.companyName}
                      onChange={(e) =>
                        setNewOverride({ ...newOverride, companyName: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-jsb-navy focus:border-transparent"
                      placeholder="Alliance Connection"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Business Type
                  </label>
                  <input
                    type="text"
                    value={newOverride.businessType}
                    onChange={(e) =>
                      setNewOverride({ ...newOverride, businessType: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-jsb-navy focus:border-transparent"
                    placeholder="Marketing agency focused on the travel space"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    What type of business is this? (e.g., "marketing agency", "SaaS company")
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Industry Vertical
                  </label>
                  <input
                    type="text"
                    value={newOverride.industryVertical}
                    onChange={(e) =>
                      setNewOverride({ ...newOverride, industryVertical: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-jsb-navy focus:border-transparent"
                    placeholder="Travel & Hospitality Marketing"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Company Description
                  </label>
                  <textarea
                    value={newOverride.companyDescription}
                    onChange={(e) =>
                      setNewOverride({ ...newOverride, companyDescription: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-jsb-navy focus:border-transparent"
                    rows={3}
                    placeholder="Alliance Connection is a marketing agency that specializes in helping travel and hospitality brands..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Topics to Avoid (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={newOverride.avoidTopics}
                    onChange={(e) =>
                      setNewOverride({ ...newOverride, avoidTopics: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-jsb-navy focus:border-transparent"
                    placeholder="competitor X, past issues"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Topics AI should NOT mention in emails to this company
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Preferred Angles (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={newOverride.preferredAngles}
                    onChange={(e) =>
                      setNewOverride({ ...newOverride, preferredAngles: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-jsb-navy focus:border-transparent"
                    placeholder="partnership, white-label, capacity overflow"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Good conversation angles for this company
                  </p>
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowOverrideModal(false)}
                    className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-jsb-navy text-white rounded-lg hover:bg-opacity-90"
                  >
                    Save Company Profile
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Shell>
  )
}
