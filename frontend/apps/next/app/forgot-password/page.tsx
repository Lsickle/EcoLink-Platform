import { AuthLayout } from '@/features/auth/AuthLayout'
import { ForgotPasswordForm } from '@/features/auth/ForgotPasswordForm'

export default function ForgotPasswordPage() {
  return (
    <AuthLayout>
      <ForgotPasswordForm />
    </AuthLayout>
  )
}
