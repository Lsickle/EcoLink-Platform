import { AuthLayout } from '@/features/auth/AuthLayout'
import { RequestInvitationForm } from '@/features/auth/RequestInvitationForm'

export default function RequestInvitationPage() {
  return (
    <AuthLayout>
      <RequestInvitationForm />
    </AuthLayout>
  )
}
