import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { PageTitleProvider } from "@/components/page-title"

// Shell visual compartido para las pantallas autenticadas (sidebar + header
// de contenido), basado en el bloque shadcn/ui "dashboard-01". Mismo patrón
// de composición SidebarProvider -> AppSidebar + SidebarInset (SiteHeader +
// contenido) que traía app/dashboard/page.tsx (demo, ya eliminado).
//
// Vive en `app/(dashboard)/layout.tsx` (layout compartido, no en cada
// page.tsx) para persistir entre navegaciones -- antes cada página lo
// instanciaba por su cuenta y Next.js desmontaba/remontaba el sidebar
// completo en cada click, al no haber ningún layout común a esas rutas. Por
// eso ya no recibe `title` como prop: un layout no puede recibirlo de sus
// páginas hijas. Cada página lo declara con `<SetPageTitle title="..." />`
// (ver components/page-title.tsx).
export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <PageTitleProvider>
      <SidebarProvider
        style={
          {
            "--sidebar-width": "calc(var(--spacing) * 72)",
            "--header-height": "calc(var(--spacing) * 12)",
          } as React.CSSProperties
        }
      >
        <AppSidebar variant="inset" />
        <SidebarInset>
          <SiteHeader />
          <div className="flex flex-1 flex-col">
            <div className="@container/main flex flex-1 flex-col gap-2">
              <div className="flex flex-col gap-4 p-4 md:gap-6 md:p-6">{children}</div>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </PageTitleProvider>
  )
}
