import { TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ProvisionalDataNoticeProps {
  className?: string
}

// Aviso visual compartido del patrón "Catálogos Maestros" (Batch 3/3,
// último): PackagingCondition y VehicleType se sembraron con datos
// PROVISIONALES -- sin regla de negocio (RN-XXX) ni fuente confirmada
// detrás, solo los valores de ejemplo del mockup de Figma (ver AVISO
// explícito en PackagingConditionSeeder.php/VehicleTypeSeeder.php).
// Reutilizado por PackagingConditionsListScreen/PackagingConditionDetailScreen/
// CreatePackagingConditionForm y sus equivalentes de VehicleType para no
// duplicar el mismo banner cuatro veces -- cualquier admin que entre a
// cualquiera de esas pantallas (lista, detalle o creación) debe verlo,
// nunca solo en el listado.
export function ProvisionalDataNotice({ className }: ProvisionalDataNoticeProps) {
  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-400',
        className
      )}
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p>
        <span className="font-semibold">Datos provisionales.</span> Este catálogo todavía no tiene una fuente de
        negocio confirmada -- los valores sembrados vienen del mockup de diseño y están pendientes de validación
        real.
      </p>
    </div>
  )
}
