'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  ApiValidationError,
  createOrganizationalArea,
  fetchOrganizationalAreas,
  type AdminOrganizationalArea,
} from 'app/features/admin/api'
import { createOrganizationalAreaSchema } from 'app/features/admin/schemas'
import { ORGANIZATIONAL_AREA_LEVELS, type OrganizationalAreaLevel } from 'app/features/admin/types'
import { useRequireAuth } from 'app/provider/auth'
import { ContactSearchSelect } from '../ContactSearchSelect'
import { OrganizationSearchSelect } from '../OrganizationSearchSelect'

type FieldErrors = Partial<Record<'code' | 'name' | 'level', string>>

const levelOptions = ORGANIZATIONAL_AREA_LEVELS.map((level) => ({ value: level, label: level }))
const noParentValue = 'none'

/**
 * Formulario de creación de un Área Organizacional -- mismo patrón EXACTO
 * que CreateBranchTypeForm.tsx (catálogo simple, sin wizard). Gateado por
 * `organizational_areas.manage` (ver OrganizationalAreaController::store()
 * -> OrganizationalAreaPolicy::create()).
 *
 * Cierre de brecha de UX (2026-07-18): `organization_id` (solo visible para
 * `is_platform_staff`) ahora es un `OrganizationSearchSelect` -- combo de
 * búsqueda con debounce, mismo componente EXACTO que
 * CreateBranchTreatmentForm.tsx -- OBLIGATORIO para poder enviar (a
 * diferencia del filtro opcional de OrganizationalAreasListScreen.tsx): el
 * schema lo deja opcional (compartido con la ausencia de selector para un
 * actor no-staff), así que la obligatoriedad para platform staff se valida
 * a mano tras el `safeParse`, mismo mecanismo que
 * CreateBranchTreatmentForm.tsx. `responsible_person_id` ahora usa
 * `ContactSearchSelect` (combo sobre `GET /api/admin/organizations/
 * contacts/search`, OPCIONAL -- el campo es nullable en backend). AVISO --
 * ese endpoint no filtra por la organización elegida arriba: un platform
 * staff podría en teoría asignar un responsable sin relación real con la
 * organización del área (gap de backend ya conocido y aceptado, no se
 * corrige aquí). `parent_area_id` sigue siendo un Select real --
 * `fetchOrganizationalAreas` ya existe y, para un actor no-staff, el backend
 * scopea automáticamente al tenant propio; para un actor staff de
 * plataforma, se resuelve contra la organización recién seleccionada.
 */
export function CreateOrganizationalAreaForm() {
  const router = useRouter()
  const { isAuthorized, user } = useRequireAuth('organizational_areas.manage')
  const isPlatformStaff = Boolean(user?.is_platform_staff)

  const [organizationId, setOrganizationId] = useState<number | null>(null)
  const [organizationLabel, setOrganizationLabel] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [level, setLevel] = useState<OrganizationalAreaLevel>('Coordinación')
  const [parentAreaId, setParentAreaId] = useState<string>(noParentValue)
  const [responsiblePersonId, setResponsiblePersonId] = useState<number | null>(null)
  const [responsiblePersonLabel, setResponsiblePersonLabel] = useState<string | null>(null)

  const [parentOptions, setParentOptions] = useState<AdminOrganizationalArea[]>([])

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Opciones del selector de área padre: para un actor no-staff el backend
  // ya scopea a su propio tenant (sin organizationId en el query); para un
  // actor is_platform_staff, solo se resuelve una vez que eligió una
  // organización vía OrganizationSearchSelect.
  useEffect(() => {
    if (!isAuthorized) return
    let cancelled = false

    async function loadParentOptions() {
      if (isPlatformStaff && !organizationId) {
        if (!cancelled) setParentOptions([])
        return
      }
      try {
        const result = await fetchOrganizationalAreas({
          organizationId: isPlatformStaff ? organizationId! : undefined,
          status: 'active',
          perPage: 200,
        })
        if (!cancelled) setParentOptions(result.data)
      } catch {
        if (!cancelled) setParentOptions([])
      }
    }

    loadParentOptions()
    return () => {
      cancelled = true
    }
  }, [isAuthorized, isPlatformStaff, organizationId])

  const parentAreaItems = [
    { value: noParentValue, label: 'Ninguna (área raíz)' },
    ...parentOptions.map((area) => ({ value: String(area.id), label: `${area.code} · ${area.name}` })),
  ]

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)

    const parsedParentAreaId = parentAreaId === noParentValue ? undefined : Number(parentAreaId)

    const parsed = createOrganizationalAreaSchema.safeParse({
      organizationId: isPlatformStaff ? (organizationId ?? undefined) : undefined,
      code,
      name,
      level,
      parentAreaId: parsedParentAreaId,
      responsiblePersonId: responsiblePersonId ?? undefined,
    })

    if (!parsed.success) {
      const errors: FieldErrors = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FieldErrors
        errors[key] ??= issue.message
      }
      setFieldErrors(errors)
      return
    }

    if (isPlatformStaff && !parsed.data.organizationId) {
      setFormError('Selecciona la organización dueña del área organizacional.')
      return
    }

    setFieldErrors({})
    setIsSubmitting(true)
    try {
      const { organizational_area: created } = await createOrganizationalArea({
        organization_id: parsed.data.organizationId,
        code: parsed.data.code,
        name: parsed.data.name,
        level: parsed.data.level,
        parent_area_id: parsed.data.parentAreaId,
        responsible_person_id: parsed.data.responsiblePersonId,
      })
      router.push(`/admin/catalogs/organizational-areas/${created.id}`)
    } catch (error) {
      if (error instanceof ApiValidationError) {
        setFormError(error.firstError('code') ?? error.firstError('name') ?? error.firstError('organization_id') ?? error.message)
      } else {
        setFormError(error instanceof Error ? error.message : 'Error inesperado.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isAuthorized) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Cargando…
      </p>
    )
  }

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="text-xl">Crear Área Organizacional</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
          {isPlatformStaff && (
            <OrganizationSearchSelect
              label="Organización"
              htmlId="organizationId"
              selectedId={organizationId}
              selectedLabel={organizationLabel}
              onSelect={(result) => {
                setOrganizationId(result.id)
                setOrganizationLabel(result.legal_name)
                setParentAreaId(noParentValue)
              }}
              onClear={() => {
                setOrganizationId(null)
                setOrganizationLabel(null)
                setParentAreaId(noParentValue)
              }}
            />
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="code">Código</Label>
              <Input
                id="code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                aria-invalid={Boolean(fieldErrors.code)}
              />
              {fieldErrors.code && (
                <p className="text-xs text-destructive" role="alert">
                  {fieldErrors.code}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="level">Nivel</Label>
              <Select
                items={levelOptions}
                value={level}
                onValueChange={(value) => setLevel(value as OrganizationalAreaLevel)}
              >
                <SelectTrigger id="level" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {levelOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Nombre</Label>
            <Input
              id="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-invalid={Boolean(fieldErrors.name)}
            />
            {fieldErrors.name && (
              <p className="text-xs text-destructive" role="alert">
                {fieldErrors.name}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="parentAreaId">Área Padre</Label>
            <Select items={parentAreaItems} value={parentAreaId} onValueChange={(value) => value && setParentAreaId(value)}>
              <SelectTrigger id="parentAreaId" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {parentAreaItems.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <ContactSearchSelect
            label="Responsable"
            htmlId="responsiblePersonId"
            selectedId={responsiblePersonId}
            selectedLabel={responsiblePersonLabel}
            onSelect={(result) => {
              setResponsiblePersonId(result.id)
              setResponsiblePersonLabel(`${result.first_name} ${result.last_name} (${result.document_number})`)
            }}
            onClear={() => {
              setResponsiblePersonId(null)
              setResponsiblePersonLabel(null)
            }}
          />

          {formError && (
            <p className="text-sm text-destructive" role="alert" aria-live="polite">
              {formError}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.push('/admin/catalogs/organizational-areas')}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creando…' : 'Crear Área'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
