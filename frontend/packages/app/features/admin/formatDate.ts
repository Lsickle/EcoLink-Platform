// Sin librería de fechas en el proyecto todavía (ver CLAUDE.md, no fijar
// date-fns/dayjs sin confirmarlo) -- Intl.DateTimeFormat nativo alcanza
// para el formato "dd/mm/aaaa" que pide el mockup. timeZone: 'UTC' es
// deliberado: los timestamps del backend viajan en UTC y queremos el mismo
// día calendario sin importar la zona horaria del navegador (evita que un
// timestamp de medianoche UTC se muestre un día antes en máquinas al oeste
// de Greenwich).
//
// Extraído de RolesListScreen.tsx (columna "Creación", Figma "Roles
// Management", lote 3) para compartirlo con RoleDetailScreen.tsx (Figma
// "Detalle de Rol", lote 4: Fecha de Creación/Última Actualización) sin
// duplicar la lógica de formato -- mismo criterio ya aplicado a
// riskLevel.ts.
export function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}
