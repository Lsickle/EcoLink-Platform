"use client"

import * as React from "react"

// El sidebar/header ahora vive en un layout compartido
// (app/(dashboard)/layout.tsx) para persistir entre navegaciones -- antes
// cada page.tsx envolvía su propio <DashboardShell title="..."> y Next.js
// desmontaba/remontaba TODO (sidebar incluido) en cada click, porque no
// había ningún layout.tsx común a esas rutas. Con el shell en el layout,
// ya no puede recibir el título como prop directo de la página (los
// layouts no reciben props de sus páginas hijas) -- cada página declara su
// título con <SetPageTitle title="..." /> en su lugar.
type PageTitleContextValue = {
  title: string
  setTitle: (title: string) => void
}

const PageTitleContext = React.createContext<PageTitleContextValue | null>(null)

export function PageTitleProvider({ children }: { children: React.ReactNode }) {
  const [title, setTitle] = React.useState("Inicio")
  const value = React.useMemo(() => ({ title, setTitle }), [title])
  return <PageTitleContext.Provider value={value}>{children}</PageTitleContext.Provider>
}

function usePageTitleContext(): PageTitleContextValue {
  const context = React.useContext(PageTitleContext)
  if (!context) {
    throw new Error("usePageTitle/SetPageTitle deben usarse dentro de <PageTitleProvider> (ver DashboardShell)")
  }
  return context
}

// Consumido por SiteHeader para pintar el <h1> del encabezado.
export function usePageTitle(): string {
  return usePageTitleContext().title
}

// Cada page.tsx que antes hacía `<DashboardShell title="X">` ahora hace
// `<><SetPageTitle title="X" />{contenido}</>` -- este componente no
// renderiza nada visible, solo informa el título al SiteHeader compartido.
// Vía useEffect (no durante el render): `setTitle` pertenece a un ancestro
// (PageTitleProvider), no a este componente -- llamarlo en el efecto evita
// mutar el estado de otro componente mientras este todavía se está
// renderizando. El costo es un frame con el título anterior en cada
// navegación, imperceptible frente al remount completo que había antes.
export function SetPageTitle({ title }: { title: string }) {
  const { setTitle } = usePageTitleContext()
  React.useEffect(() => {
    setTitle(title)
  }, [title, setTitle])
  return null
}
