import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { PlantReceptionAgendaScreen } from '@/features/admin/unload-requests/PlantReceptionAgendaScreen'

export const metadata: Metadata = { title: 'Agenda de Recepciones en Planta' }

export default function AdminPlantReceptionAgendaPage() {
  return (
    <>
      <SetPageTitle title="Agenda de Recepciones en Planta" />
      <PlantReceptionAgendaScreen />
    </>
  )
}
