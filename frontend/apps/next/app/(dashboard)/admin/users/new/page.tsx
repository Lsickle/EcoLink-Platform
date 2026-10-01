import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { CreateUserForm } from '@/features/admin/CreateUserForm'

export const metadata: Metadata = { title: 'Crear Usuario' }

export default function AdminNewUserPage() {
  return (
    <>
      <SetPageTitle title="Crear Usuario" />
      <CreateUserForm />
    </>
  )
}
