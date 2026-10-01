import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { RoleWizard } from '@/features/admin/RoleWizard'

export const metadata: Metadata = { title: 'Crear Rol' }

export default function AdminNewRolePage() {
  return (
    <>
      <SetPageTitle title="Crear Rol" />
      <RoleWizard />
    </>
  )
}
