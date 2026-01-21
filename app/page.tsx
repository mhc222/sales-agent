'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function HomePage() {
  const router = useRouter()

  useEffect(() => {
    // Check if user is authenticated
    fetch('/api/auth/me')
      .then((res) => {
        if (res.ok) {
          router.push('/research')
        } else {
          router.push('/signup')
        }
      })
      .catch(() => {
        router.push('/signup')
      })
  }, [router])

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
    </div>
  )
}
