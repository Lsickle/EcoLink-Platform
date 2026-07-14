import { AuthLayout } from '@/features/auth/AuthLayout'
import { ResetPasswordForm } from '@/features/auth/ResetPasswordForm'

export default function ResetPasswordPage() {
  return (
    <AuthLayout>
      <ResetPasswordForm />
    </AuthLayout>
  )
}
