'use client'

import { jsb, cn } from '@/lib/styles'
import { useState } from 'react'

export type BrandInfoData = {
  name: string
  description: string
  website: string
  logoUrl?: string
}

type Props = {
  data: BrandInfoData
  onChange: (data: BrandInfoData) => void
  onNext: () => void
  onBack?: () => void
}

// Simple URL validation - accepts with or without protocol
function isValidUrl(url: string): boolean {
  if (!url.trim()) return false
  const urlToTest = url.startsWith('http') ? url : `https://${url}`
  try {
    new URL(urlToTest)
    return true
  } catch {
    return false
  }
}

export default function BrandInfoStep({ data, onChange, onNext, onBack }: Props) {
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)

  const isValid =
    data.name.trim() &&
    data.website.trim() &&
    isValidUrl(data.website)

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file')
      return
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      alert('Image must be smaller than 2MB')
      return
    }

    setLogoFile(file)
    setUploadingLogo(true)

    try {
      // Create FormData and upload to your storage
      const formData = new FormData()
      formData.append('file', file)
      formData.append('type', 'brand-logo')

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) throw new Error('Upload failed')

      const result = await res.json()
      onChange({ ...data, logoUrl: result.url })
    } catch (error) {
      console.error('Logo upload failed:', error)
      alert('Failed to upload logo. You can add it later.')
    } finally {
      setUploadingLogo(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className={cn(jsb.heading, 'text-xl mb-2')}>Create Your Brand</h2>
        <p className="text-gray-400">
          A brand represents a company or product you're selling. Each brand has its own ICP,
          integrations, and messaging.
        </p>
      </div>

      <div className="space-y-4">
        {/* Brand Name */}
        <div>
          <label htmlFor="brandName" className={cn(jsb.label, 'block mb-2')}>
            Brand name <span className="text-red-400">*</span>
          </label>
          <input
            id="brandName"
            type="text"
            value={data.name}
            onChange={(e) => onChange({ ...data, name: e.target.value })}
            className={cn(jsb.input, 'w-full px-4 py-3')}
            placeholder="Acme Inc."
            autoFocus
          />
        </div>

        {/* Website */}
        <div>
          <label htmlFor="website" className={cn(jsb.label, 'block mb-2')}>
            Website <span className="text-red-400">*</span>
          </label>
          <input
            id="website"
            type="text"
            value={data.website}
            onChange={(e) => onChange({ ...data, website: e.target.value })}
            className={cn(jsb.input, 'w-full px-4 py-3')}
            placeholder="yourcompany.com"
          />
          <p className="text-xs text-gray-500 mt-1">
            We'll use this to research your business and generate your ICP
          </p>
        </div>

        {/* Description */}
        <div>
          <label htmlFor="description" className={cn(jsb.label, 'block mb-2')}>
            Description <span className="text-gray-500 text-xs font-normal">(optional)</span>
          </label>
          <textarea
            id="description"
            value={data.description}
            onChange={(e) => onChange({ ...data, description: e.target.value })}
            className={cn(jsb.input, 'w-full px-4 py-3 min-h-[100px] resize-y')}
            placeholder="A brief description of what this brand does..."
          />
        </div>

        {/* Logo Upload */}
        <div>
          <label className={cn(jsb.label, 'block mb-2')}>
            Brand Logo <span className="text-gray-500 text-xs font-normal">(optional)</span>
          </label>

          <div className="flex items-center gap-4">
            {/* Logo Preview */}
            {(data.logoUrl || logoFile) && (
              <div className="w-16 h-16 rounded-lg overflow-hidden bg-jsb-navy-lighter border border-jsb-pink/30">
                <img
                  src={data.logoUrl || (logoFile ? URL.createObjectURL(logoFile) : '')}
                  alt="Brand logo"
                  className="w-full h-full object-contain"
                />
              </div>
            )}

            {/* Upload Button */}
            <label
              htmlFor="logo-upload"
              className={cn(
                jsb.buttonSecondary,
                'px-4 py-2 cursor-pointer inline-block',
                uploadingLogo && 'opacity-50 cursor-not-allowed'
              )}
            >
              {uploadingLogo ? 'Uploading...' : data.logoUrl ? 'Change Logo' : 'Upload Logo'}
            </label>
            <input
              id="logo-upload"
              type="file"
              accept="image/*"
              onChange={handleLogoUpload}
              disabled={uploadingLogo}
              className="hidden"
            />
          </div>

          <p className="text-xs text-gray-500 mt-2">
            Recommended: Square image, PNG or JPG, max 2MB
          </p>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex gap-3 pt-4">
        {onBack && (
          <button onClick={onBack} className={cn(jsb.buttonSecondary, 'px-6 py-3')}>
            Back
          </button>
        )}
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
