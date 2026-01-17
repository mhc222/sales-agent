import SignupForm from '@/components/auth/SignupForm'
import { jsb, cn } from '@/lib/styles'

export default function SignupPage() {
  return (
    <div className="relative min-h-screen">
      {/* Background Image */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: 'url(/jsb-team.jpg)' }}
      />
      {/* Dark Overlay with gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-jsb-navy/95 via-jsb-navy/85 to-jsb-navy/90" />

      {/* Content */}
      <div className="relative z-10 flex items-center justify-center min-h-screen py-12">
        <div className="w-full max-w-md px-6">
          {/* Logo / Brand */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-jsb-pink/20 backdrop-blur-sm rounded-xl mb-4 border border-jsb-pink/30">
              <svg className="w-8 h-8 text-jsb-pink" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h1 className={cn(jsb.heading, 'text-2xl mb-2')}>Create your account</h1>
            <p className={jsb.subheading}>Start automating your sales outreach</p>
          </div>

          {/* Signup Form Card */}
          <div className={cn(jsb.card, 'p-8 backdrop-blur-sm bg-jsb-navy-light/80 border-jsb-navy-lighter/50')}>
            <SignupForm />
          </div>

          {/* Footer */}
          <p className="text-center text-xs text-gray-500 mt-8">
            By creating an account, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </div>
    </div>
  )
}
