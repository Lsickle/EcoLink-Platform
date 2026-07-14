import { AuthLayout } from '@/features/auth/AuthLayout'
import { ChangePasswordForm } from '@/features/auth/ChangePasswordForm'

export default function ChangePasswordPage() {
  return (
    <AuthLayout>
      <ChangePasswordForm />
    </AuthLayout>
  )
}
