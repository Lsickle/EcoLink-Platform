import * as React from "react"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest"
import { SidebarProvider } from "@/components/ui/sidebar"
import { NavMain } from "./nav-main"

// Ruta actual mutable -- `open` por defecto depende de si algún item del
// grupo matchea `mockPathname` (ver findActiveItem en nav-main.tsx). Mismo
// criterio ya usado en app-sidebar.test.tsx / AuthProvider.test.tsx.
let mockPathname = "/"
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}))

afterEach(() => {
  mockPathname = "/"
})

// SidebarProvider depende de useIsMobile(), que usa matchMedia -- jsdom no
// lo implementa por defecto (mismo setup que nav-user.test.tsx).
beforeAll(() => {
  window.matchMedia =
    window.matchMedia ??
    ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
})

const items = [
  { title: "Residuos", url: "/admin/wastes" },
  { title: "Corrientes Y/A", url: "/admin/waste-streams" },
]

// `isOpen`/`onOpenChange` son ahora controlados por el padre (app-sidebar.tsx
// mantiene un único "cuál sección está abierta" para el comportamiento tipo
// acordeón, 2026-09-30 -- ver ese archivo). Este harness simula ese control
// con estado local, para poder seguir probando el toggle de un `NavMain`
// aislado sin reimplementar el acordeón completo aquí (eso vive en
// app-sidebar.test.tsx).
function renderNavMain(props: Parameters<typeof NavMain>[0] & { isOpen?: boolean }) {
  function Harness() {
    const [isOpen, setIsOpen] = React.useState(props.isOpen ?? false)
    return <NavMain {...props} isOpen={isOpen} onOpenChange={setIsOpen} />
  }
  return render(
    <SidebarProvider>
      <Harness />
    </SidebarProvider>
  )
}

describe("NavMain", () => {
  test("renders items without a collapsible trigger when no label is given", () => {
    renderNavMain({ items })

    expect(screen.getByText("Residuos")).toBeInTheDocument()
    expect(screen.getByText("Corrientes Y/A")).toBeInTheDocument()
    // Sin label, no hay ningún encabezado ni botón que colapsar.
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })

  test("renders collapsed when isOpen is false", () => {
    renderNavMain({ items, label: "Residuos", isOpen: false })

    const trigger = screen.getByRole("button", { name: "Residuos" })
    expect(trigger).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByText("Corrientes Y/A")).not.toBeInTheDocument()
  })

  test("renders open when isOpen is true", () => {
    renderNavMain({ items, label: "Residuos", isOpen: true })

    const trigger = screen.getByRole("button", { name: "Residuos" })
    expect(trigger).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByText("Corrientes Y/A")).toBeInTheDocument()
  })

  test("expands when the trigger is clicked", () => {
    renderNavMain({ items, label: "Residuos", isOpen: false })

    const trigger = screen.getByRole("button", { name: "Residuos" })
    act(() => {
      fireEvent.click(trigger)
    })

    expect(trigger).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByText("Corrientes Y/A")).toBeInTheDocument()
  })

  test("collapses again when an open group's trigger is clicked", () => {
    renderNavMain({ items, label: "Residuos", isOpen: true })

    const trigger = screen.getByRole("button", { name: "Residuos" })
    act(() => {
      fireEvent.click(trigger)
    })

    expect(trigger).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByText("Corrientes Y/A")).not.toBeInTheDocument()
  })
})

// Corrección de bug reportado por el usuario tras la reorganización en 7
// grupos (2026-09-28): resaltar la página actual en el sidebar.
describe("NavMain -- resaltar la página activa", () => {
  test("marca isActive en el ítem cuya url coincide exactamente con la ruta actual", () => {
    mockPathname = "/admin/wastes"
    renderNavMain({ items, label: "Residuos", isOpen: true })

    expect(screen.getByRole("link", { name: "Residuos" })).toHaveAttribute("data-active")
    expect(screen.getByRole("link", { name: "Corrientes Y/A" })).not.toHaveAttribute("data-active")
  })

  test("una ruta más específica (sub-recurso) también activa su propio ítem, no el de un ítem hermano que sea prefijo de su url", () => {
    const wasteItems = [
      { title: "Residuos", url: "/admin/wastes" },
      { title: "Carga Masiva de Residuos", url: "/admin/wastes/bulk-import" },
    ]
    mockPathname = "/admin/wastes/bulk-import"
    renderNavMain({ items: wasteItems, label: "Residuos", isOpen: true })

    expect(screen.getByRole("link", { name: "Carga Masiva de Residuos" })).toHaveAttribute("data-active")
    expect(screen.getByRole("link", { name: "Residuos" })).not.toHaveAttribute("data-active")
  })

  test("ningún ítem queda marcado activo si la ruta actual no pertenece al grupo", () => {
    mockPathname = "/admin/users"
    renderNavMain({ items, label: "Residuos", isOpen: true })

    expect(screen.getByRole("link", { name: "Residuos" })).not.toHaveAttribute("data-active")
    expect(screen.getByRole("link", { name: "Corrientes Y/A" })).not.toHaveAttribute("data-active")
  })

  test("también resalta el ítem activo en un grupo sin label (ej. 'Inicio')", () => {
    mockPathname = "/"
    renderNavMain({ items: [{ title: "Inicio", url: "/" }] })

    expect(screen.getByRole("link", { name: "Inicio" })).toHaveAttribute("data-active")
  })
})

// Color por grupo (reorganización del sidebar en 7 grupos temáticos,
// 2026-09-28) -- barra vertical + tinte de ícono, ambos derivados de
// `colorVar`. TODOS los grupos con color (no solo Administración) se pintan
// como gradiente `${colorVar}-from` -> `${colorVar}-to` (pedido explícito
// del usuario). Grupos sin `colorVar` (Inicio, Plataforma) no deben mostrar
// ninguna de las dos cosas (cubierto arriba, sin colorVar en esas pruebas).
describe("NavMain -- color por grupo (colorVar)", () => {
  test("pinta la barra vertical del grupo como gradiente --sidebar-group-residuos-from/-to", () => {
    const { container } = renderNavMain({ items, label: "Residuos", colorVar: "--sidebar-group-residuos" })

    const bar = container.querySelector('[data-slot="nav-main-color-bar"]')
    expect(bar).not.toBeNull()
    expect(bar).toHaveStyle({
      background:
        "linear-gradient(180deg, var(--sidebar-group-residuos-from), var(--sidebar-group-residuos-to))",
    })
  })

  test("tiñe el ícono de cada ítem con el extremo --to del gradiente", () => {
    mockPathname = "/admin/wastes"
    const itemsWithIcon = [{ title: "Residuos", url: "/admin/wastes", icon: <svg data-testid="waste-icon" /> }]
    render(
      <SidebarProvider>
        <NavMain items={itemsWithIcon} label="Residuos" colorVar="--sidebar-group-residuos" isOpen onOpenChange={() => {}} />
      </SidebarProvider>
    )

    expect(screen.getByTestId("waste-icon")).toHaveStyle({ color: "var(--sidebar-group-residuos-to)" })
  })

  test("el grupo Administración también usa el gradiente (mismo mecanismo, plateado claro -> oscuro)", () => {
    const { container } = renderNavMain({ items, label: "Administración", colorVar: "--sidebar-group-administracion" })

    const bar = container.querySelector('[data-slot="nav-main-color-bar"]')
    expect(bar).toHaveStyle({
      background:
        "linear-gradient(180deg, var(--sidebar-group-administracion-from), var(--sidebar-group-administracion-to))",
    })
  })

  test("no rompe el render si item.icon no es un elemento React válido", () => {
    mockPathname = "/admin/wastes"
    const itemsWithBadIcon = [{ title: "Residuos", url: "/admin/wastes", icon: "not-a-react-element" as unknown as React.ReactNode }]
    render(
      <SidebarProvider>
        <NavMain items={itemsWithBadIcon} label="Otro Grupo" colorVar="--sidebar-group-residuos" isOpen onOpenChange={() => {}} />
      </SidebarProvider>
    )

    expect(screen.getByText("Residuos")).toBeInTheDocument()
  })
})
