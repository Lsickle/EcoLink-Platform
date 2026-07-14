import { AuthLayout } from '@/features/auth/AuthLayout'
import { WelcomeScreen } from '@/features/home/WelcomeScreen'

export default function HomePage() {
  return (
    <AuthLayout>
      <WelcomeScreen />
    </AuthLayout>
  )
}
