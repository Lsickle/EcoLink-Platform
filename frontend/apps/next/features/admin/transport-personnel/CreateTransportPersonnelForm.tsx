'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiValidationError, createTransportPersonnel } from 'app/features/admin/api'
import { createTransportPersonnelSchema } from 'app/features/admin/schemas'
import { useAuth, useRequireAuth } from 'app/provider/auth'
import { ContactSearchSelect } from '../ContactSearchSelect'
import { OrganizationSearchSelect } from '../OrganizationSearchSelect'

type FieldErrors = Partial<Record<'personId', string>>

/**
 * Formulario de registro de Conductor (POST /api/admin/transport-personnel)
 * -- cierre del GAP DE CONTRATO señalado en el lote anterior de Programación
 * Logística (2026-07-19, ver docblock completo de
 * `TransportPersonnelController`/`TransportPersonnelPolicy`).
 *
 * Decisión de negocio verbatim (usuario, 2026-07-19): "los conductores
 * vendrían siendo personas de la lista de contactos con el cargo
 * conductor" -- un conductor NO es una entidad separada con su propio alta
 * de persona, es una `Person` YA existente como contacto de la organización
 * (`organization_contacts.position_title`, texto libre) a la que se le
 * agregan los atributos de `transport_personnel`. Por eso este formulario
 * usa `ContactSearchSelect` (mismo componente ya construido para
 * "Responsable" en `CreateOrganizationalAreaForm.tsx`) en vez de un
 * formulario de alta de persona nueva.
 *
 * AVISO -- gap de UX señalado explícitamente, no corregido en este lote:
 * `GET /api/admin/organizations/contacts/search` (`searchContacts()`) NO
 * selecciona `position_title` (ese campo vive en el pivote
 * `organization_contacts`, no en `people`, y el endpoint solo trae
 * id/first_name/last_name/document_number/email -- ver
 * `ContactSearchResult` en types.ts). Corregirlo requeriría tocar un
 * contrato de backend YA CUBIERTO por un test que fija explícitamente las 5
 * columnas de la respuesta (`OrganizationContactControllerTest.php`,
 * "searchContacts NO acota resultados cuando el actor es platform staff") --
 * decisión de este lote: NO forzar ese cambio de contrato desde el
 * frontend, se deja como recomendación explícita para un lote futuro
 * (backend + frontend coordinados). Mitigación mínima aquí: un texto de
 * ayuda bajo el selector, para que quien registra el conductor confirme el
 * cargo en el listado de Contactos si hay resultados ambiguos.
 *
 * `person_id` elegido se valida contra la organización actora en el
 * backend (`TransportPersonnelController::assertPersonBelongsToOrganization()`,
 * anti-IDOR ya implementado) -- no se duplica esa validación aquí, solo se
 * confía en el 422 si ocurriera. La colisión de unicidad ("persona ya
 * registrada como conductor", `UniqueConstraintViolationException` del
 * backend) se muestra como error de formulario legible.
 */
export function CreateTransportPersonnelForm() {
  const router = useRouter()
  const { user } = useAuth()
  const { isAuthorized } = useRequireAuth('transport_personnel.create')
  const isPlatformStaff = Boolean(user?.is_platform_staff)

  const [organizationId, setOrganizationId] = useState<number | null>(null)
  const [organizationLabel, setOrganizationLabel] = useState<string | null>(null)
  const [personId, setPersonId] = useState<number | null>(null)
  const [personLabel, setPersonLabel] = useState<string | null>(null)

  const [licenseNumber, setLicenseNumber] = useState('')
  const [licenseCategory, setLicenseCategory] = useState('')
  const [licenseExpirationDate, setLicenseExpirationDate] = useState('')
  const [hasHazmatPermit, setHasHazmatPermit] = useState(false)

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)

    const parsed = createTransportPersonnelSchema.safeParse({
      organizationId: isPlatformStaff ? (organizationId ?? undefined) : undefined,
      personId: personId ?? 0,
      licenseNumber,
      licenseCategory,
      licenseExpirationDate,
      hasHazmatPermit,
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
      setFormError('Selecciona la organización dueña del conductor.')
      return
    }

    setFieldErrors({})
    setIsSubmitting(true)
    try {
      const { transport_personnel: created } = await createTransportPersonnel({
        organization_id: isPlatformStaff ? (parsed.data.organizationId ?? undefined) : undefined,
        person_id: parsed.data.personId,
        license_number: parsed.data.licenseNumber || undefined,
        license_category: parsed.data.licenseCategory || undefined,
        license_expiration_date: parsed.data.licenseExpirationDate || undefined,
        has_hazmat_permit: parsed.data.hasHazmatPermit,
      })
      router.push(`/admin/transport-personnel/${created.id}`)
    } catch (error) {
      if (error instanceof ApiValidationError) {
        setFormError(error.firstError('person_id') ?? error.message)
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
        <CardTitle className="text-xl">Registrar Conductor</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
          {isPlatformStaff && (
            <OrganizationSearchSelect
              label="Organización dueña"
              htmlId="organizationId"
              selectedId={organizationId}
              selectedLabel={organizationLabel}
              onSelect={(result) => {
                setOrganizationId(result.id)
                setOrganizationLabel(`${result.legal_name} (${result.tax_id})`)
              }}
              onClear={() => {
                setOrganizationId(null)
                setOrganizationLabel(null)
              }}
            />
          )}

          <div className="flex flex-col gap-1.5">
            <ContactSearchSelect
              label="Contacto"
              htmlId="personId"
              selectedId={personId}
              selectedLabel={personLabel}
              onSelect={(result) => {
                setPersonId(result.id)
                setPersonLabel(`${result.first_name} ${result.last_name} (${result.document_number})`)
              }}
              onClear={() => {
                setPersonId(null)
                setPersonLabel(null)
              }}
            />
            <p className="text-xs text-muted-foreground">
              El conductor debe existir como contacto de la organización con cargo Conductor. Si hay varios
              resultados con nombres similares, verifica el cargo en el listado de Contactos antes de continuar.
            </p>
            {fieldErrors.personId && (
              <p className="text-xs text-destructive" role="alert">
                {fieldErrors.personId}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="licenseNumber">
                Número de Licencia <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Input id="licenseNumber" value={licenseNumber} onChange={(event) => setLicenseNumber(event.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="licenseCategory">
                Categoría <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id="licenseCategory"
                value={licenseCategory}
                onChange={(event) => setLicenseCategory(event.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="licenseExpirationDate">
                Vencimiento de Licencia <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id="licenseExpirationDate"
                type="date"
                value={licenseExpirationDate}
                onChange={(event) => setLicenseExpirationDate(event.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 sm:mt-6">
              <Checkbox
                id="hasHazmatPermit"
                checked={hasHazmatPermit}
                onCheckedChange={(checked) => setHasHazmatPermit(checked === true)}
              />
              <Label htmlFor="hasHazmatPermit" className="font-normal">
                Cuenta con permiso de mercancías peligrosas
              </Label>
            </div>
          </div>

          {formError && (
            <p className="text-sm text-destructive" role="alert" aria-live="polite">
              {formError}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.push('/admin/transport-personnel')}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Registrando…' : 'Registrar Conductor'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
