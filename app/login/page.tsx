import LoginForm from '@/components/auth/LoginForm'
import { jsb, cn } from '@/lib/styles'

export default function LoginPage() {
  return (
    <div className="relative min-h-screen">
      {/* Background Image - scaled down */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat scale-110"
        style={{ backgroundImage: 'url(/jsb-team.jpg)' }}
      />
      {/* Lighter overlay to show more of the image */}
      <div className="absolute inset-0 bg-gradient-to-br from-jsb-navy/80 via-jsb-navy/60 to-jsb-navy/70" />

      {/* Content */}
      <div className="relative z-10 flex items-center justify-center min-h-screen">
        <div className="w-full max-w-md px-6">
          {/* Logo / Brand */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-jsb-pink/20 backdrop-blur-sm rounded-xl mb-4 border border-jsb-pink/30">
              <svg className="w-8 h-8 text-jsb-pink" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h1 className={cn(jsb.heading, 'text-2xl mb-2')}>Welcome back</h1>
            <p className={jsb.subheading}>Sign in to your account to continue</p>
          </div>

          {/* Login Form Card - more transparent with better blur */}
          <div className={cn(jsb.card, 'p-8 backdrop-blur-md bg-jsb-navy-light/50 border-white/10 shadow-2xl')}>
            <LoginForm />
          </div>

          {/* Footer */}
          <p className="text-center text-xs text-gray-500 mt-8">
            By signing in, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </div>
    </div>
  )
}
