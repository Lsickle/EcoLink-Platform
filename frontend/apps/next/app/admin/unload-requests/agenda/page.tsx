import { DashboardShell } from '@/components/dashboard-shell'
import { PlantReceptionAgendaScreen } from '@/features/admin/unload-requests/PlantReceptionAgendaScreen'

export default function AdminPlantReceptionAgendaPage() {
  return (
    <DashboardShell title="Agenda de Recepciones en Planta">
      <PlantReceptionAgendaScreen />
    </DashboardShell>
  )
}
