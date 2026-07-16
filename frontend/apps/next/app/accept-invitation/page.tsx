import { Suspense } from 'react'
import { AuthLayout } from '@/features/auth/AuthLayout'
import { AcceptInvitationForm } from '@/features/auth/AcceptInvitationForm'

export default function AcceptInvitationPage() {
  return (
    <AuthLayout>
      <Suspense>
        <AcceptInvitationForm />
      </Suspense>
    </AuthLayout>
  )
}
