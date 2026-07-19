import { DashboardShell } from '@/components/dashboard-shell'
import { TransportDispatchBoardScreen } from '@/features/admin/transport-schedules/TransportDispatchBoardScreen'

export default function AdminTransportDispatchBoardPage() {
  return (
    <DashboardShell title="Tablero de Despacho — Agrupar en Rutas">
      <TransportDispatchBoardScreen />
    </DashboardShell>
  )
}
