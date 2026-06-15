import { Suspense } from 'react'
import { isGoogleAuthConfigured } from '@/lib/auth/google'
import { LoginForm } from './LoginForm'

export default function LoginPage() {
  const googleAuthEnabled = isGoogleAuthConfigured()

  return (
    <Suspense>
      <LoginForm googleAuthEnabled={googleAuthEnabled} />
    </Suspense>
  )
}
