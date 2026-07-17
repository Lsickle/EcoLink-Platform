import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeAll, describe, expect, test, vi } from "vitest"
import { SidebarProvider } from "@/components/ui/sidebar"
import { NavMain } from "./nav-main"

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

function renderNavMain(props: Parameters<typeof NavMain>[0]) {
  return render(
    <SidebarProvider>
      <NavMain {...props} />
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

  test("renders a clickable trigger with the label, open by default", () => {
    renderNavMain({ items, label: "Residuos" })

    const trigger = screen.getByRole("button", { name: "Residuos" })
    expect(trigger).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByText("Corrientes Y/A")).toBeInTheDocument()
  })

  test("collapses the group content when the trigger is clicked", () => {
    renderNavMain({ items, label: "Residuos" })

    const trigger = screen.getByRole("button", { name: "Residuos" })
    act(() => {
      fireEvent.click(trigger)
    })

    expect(trigger).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByText("Corrientes Y/A")).not.toBeInTheDocument()
  })

  test("expands again when the trigger is clicked a second time", () => {
    renderNavMain({ items, label: "Residuos" })

    const trigger = screen.getByRole("button", { name: "Residuos" })
    act(() => {
      fireEvent.click(trigger)
    })
    act(() => {
      fireEvent.click(trigger)
    })

    expect(trigger).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByText("Corrientes Y/A")).toBeInTheDocument()
  })
})
