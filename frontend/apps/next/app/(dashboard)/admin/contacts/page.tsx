import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { ContactsListScreen } from '@/features/admin/ContactsListScreen'

export const metadata: Metadata = { title: 'Contactos' }

export default function AdminContactsPage() {
  return (
    <>
      <SetPageTitle title="Contactos" />
      <ContactsListScreen />
    </>
  )
}
