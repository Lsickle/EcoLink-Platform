import { DashboardShell } from "@/components/dashboard-shell"

// Layout compartido por "/" y todo "/admin/**" (route group, no afecta las
// URLs). El sidebar/header vive AQUÍ (una sola vez) en vez de en cada
// page.tsx -- así Next.js lo mantiene montado entre navegaciones dentro de
// este grupo, en vez de desmontarlo y volver a montarlo en cada click.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>
}
