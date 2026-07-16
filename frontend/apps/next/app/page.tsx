import { DashboardShell } from '@/components/dashboard-shell'
import { WelcomeScreen } from '@/features/home/WelcomeScreen'

export default function HomePage() {
  return (
    <DashboardShell>
      <WelcomeScreen />
    </DashboardShell>
  )
}
