import { SignUp } from '@clerk/nextjs'

export default function SignupPage() {
  return (
    <main style={styles.main}>
      <SignUp
        routing="path"
        path="/signup"
        signInUrl="/login"
        fallbackRedirectUrl="/onboarding"
      />
    </main>
  )
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    padding: '1rem',
    background: '#0a0a0a',
  },
}
