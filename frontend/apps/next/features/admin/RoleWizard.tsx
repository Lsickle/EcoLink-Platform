'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  ApiValidationError,
  assignPermissionToRole,
  createRole,
  fetchPermissions,
  fetchRole,
  fetchRoles,
  type AdminPermission,
  type AdminRole,
} from 'app/features/admin/api'
import { priorityLevelOptions, roleGeneralInfoSchema } from 'app/features/admin/schemas'
import { moduleLabel } from 'app/features/admin/moduleLabels'
import { useRequireAuth } from 'app/provider/auth'

const TOTAL_STEPS = 4

function priorityLabel(level: number): string {
  return priorityLevelOptions.find((option) => option.value === level)?.label ?? String(level)
}

type WizardState = {
  code: string
  name: string
  description: string
  templateRoleId: number | null
  priorityLevel: 1 | 2 | 3 | 4 | 5
  selectedPermissionIds: number[]
}

// CU "Crear Rol" (RBAC), wizard de 4 pasos confirmado con el usuario (no
// simplificar a formulario único). Estado completo vive aquí, en el
// componente padre -- cada paso es solo presentación de un slice de este
// estado, así que "Atrás" nunca pierde lo ya llenado.
export function RoleWizard() {
  const router = useRouter()
  const { isAuthorized } = useRequireAuth('roles.read')
  const [step, setStep] = useState(1)
  const [state, setState] = useState<WizardState>({
    code: '',
    name: '',
    description: '',
    templateRoleId: null,
    priorityLevel: 1,
    selectedPermissionIds: [],
  })

  const [templates, setTemplates] = useState<AdminRole[]>([])
  const [templateApplied, setTemplateApplied] = useState(false)
  const [permissions, setPermissions] = useState<AdminPermission[]>([])
  const [step1Error, setStep1Error] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!isAuthorized) return
    fetchRoles({ perPage: 100 })
      .then((result) => setTemplates(result.data))
      .catch(() => setTemplates([]))
    fetchPermissions({ perPage: 50 })
      .then((result) => setPermissions(result.data))
      .catch(() => setPermissions([]))
  }, [isAuthorized])

  const groupedPermissions = useMemo(() => {
    const groups = new Map<string, AdminPermission[]>()
    for (const permission of permissions) {
      const list = groups.get(permission.module) ?? []
      list.push(permission)
      groups.set(permission.module, list)
    }
    return Array.from(groups.entries())
  }, [permissions])

  async function handleTemplateChange(value: string | null) {
    if (!value || value === 'none') {
      setState((current) => ({ ...current, templateRoleId: null }))
      setTemplateApplied(false)
      return
    }
    const roleId = Number(value)
    setState((current) => ({ ...current, templateRoleId: roleId }))
    try {
      const { role } = await fetchRole(roleId)
      setState((current) => ({ ...current, selectedPermissionIds: role.permissions.map((permission) => permission.id) }))
      setTemplateApplied(true)
    } catch {
      setTemplateApplied(false)
    }
  }

  function togglePermission(permissionId: number) {
    setState((current) => ({
      ...current,
      selectedPermissionIds: current.selectedPermissionIds.includes(permissionId)
        ? current.selectedPermissionIds.filter((id) => id !== permissionId)
        : [...current.selectedPermissionIds, permissionId],
    }))
  }

  function goNext() {
    if (step === 1) {
      const parsed = roleGeneralInfoSchema.safeParse({
        code: state.code,
        name: state.name,
        description: state.description,
      })
      if (!parsed.success) {
        setStep1Error(parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.')
        return
      }
      setStep1Error(null)
    }
    setStep((current) => Math.min(TOTAL_STEPS, current + 1))
  }

  function goBack() {
    setStep((current) => Math.max(1, current - 1))
  }

  async function handleCreateRole() {
    setSubmitError(null)
    setIsSubmitting(true)
    try {
      const { role } = await createRole({
        code: state.code,
        name: state.name,
        description: state.description || undefined,
        priority_level: state.priorityLevel,
      })
      await Promise.all(
        state.selectedPermissionIds.map((permissionId) => assignPermissionToRole(permissionId, { role_id: role.id }))
      )
      router.push(`/admin/roles/${role.id}`)
    } catch (error) {
      setSubmitError(
        error instanceof ApiValidationError
          ? (error.firstError('code') ?? error.message)
          : error instanceof Error
            ? error.message
            : 'Error inesperado.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const permissionsByModuleCount = useMemo(() => {
    const counts = new Map<string, number>()
    for (const permission of permissions) {
      if (state.selectedPermissionIds.includes(permission.id)) {
        counts.set(permission.module, (counts.get(permission.module) ?? 0) + 1)
      }
    }
    return Array.from(counts.entries())
  }, [permissions, state.selectedPermissionIds])

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
        <CardTitle className="text-xl">Crear Rol</CardTitle>
        <p className="text-sm text-muted-foreground">
          Paso {step} de {TOTAL_STEPS}
        </p>
        <ol className="flex gap-2 pt-2" aria-hidden="true">
          {['Información general', 'Configuración', 'Permisos', 'Confirmación'].map((label, index) => {
            const stepNumber = index + 1
            return (
              <li
                key={label}
                className={`flex-1 rounded-full py-1 text-center text-xs font-medium ${
                  stepNumber === step
                    ? 'bg-primary text-primary-foreground'
                    : stepNumber < step
                      ? 'bg-primary/30 text-foreground'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {stepNumber}. {label}
              </li>
            )
          })}
        </ol>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {step === 1 && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="code">Código</Label>
              <Input
                id="code"
                value={state.code}
                onChange={(event) => setState((current) => ({ ...current, code: event.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Sin espacios -- usa guión bajo (_) para separar palabras, ej. COORD_LOGISTICA.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Nombre</Label>
              <Input
                id="name"
                value={state.name}
                onChange={(event) => setState((current) => ({ ...current, name: event.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="description">Descripción</Label>
              <textarea
                id="description"
                className="min-h-20 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                value={state.description}
                onChange={(event) => setState((current) => ({ ...current, description: event.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="templateRoleId">
                Usar como plantilla <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Select
                value={state.templateRoleId ? String(state.templateRoleId) : 'none'}
                onValueChange={handleTemplateChange}
              >
                <SelectTrigger id="templateRoleId">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin plantilla</SelectItem>
                  {templates.map((role) => (
                    <SelectItem key={role.id} value={String(role.id)}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {templateApplied && (
                <p className="text-xs text-muted-foreground">
                  Permisos precargados desde la plantilla -- puedes ajustarlos en el paso 3.
                </p>
              )}
            </div>
            {step1Error && (
              <p className="text-sm text-destructive" role="alert">
                {step1Error}
              </p>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="priorityLevel">Nivel</Label>
              <Select
                value={String(state.priorityLevel)}
                onValueChange={(value) =>
                  setState((current) => ({ ...current, priorityLevel: Number(value) as WizardState['priorityLevel'] }))
                }
              >
                <SelectTrigger id="priorityLevel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {priorityLevelOptions.map((option) => (
                    <SelectItem key={option.value} value={String(option.value)}>
                      {option.value}. {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-4">
            {groupedPermissions.length === 0 && (
              <p className="text-sm text-muted-foreground">No hay permisos disponibles.</p>
            )}
            {groupedPermissions.map(([module, modulePermissions]) => (
              <div key={module} className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">{moduleLabel(module)}</h3>
                <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
                  {modulePermissions.map((permission) => (
                    <div key={permission.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`perm-${permission.id}`}
                        checked={state.selectedPermissionIds.includes(permission.id)}
                        onCheckedChange={() => togglePermission(permission.id)}
                      />
                      <Label htmlFor={`perm-${permission.id}`} className="font-normal">
                        {permission.name}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-3">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Código</dt>
              <dd>{state.code}</dd>
              <dt className="text-muted-foreground">Nombre</dt>
              <dd>{state.name}</dd>
              <dt className="text-muted-foreground">Nivel</dt>
              <dd>{priorityLabel(state.priorityLevel)}</dd>
            </dl>
            <p className="text-sm">{state.selectedPermissionIds.length} permisos seleccionados</p>
            <ul className="text-sm text-muted-foreground">
              {permissionsByModuleCount.map(([module, count]) => (
                <li key={module}>
                  {moduleLabel(module)}: {count}
                </li>
              ))}
            </ul>
            {submitError && (
              <p className="text-sm text-destructive" role="alert">
                {submitError}
              </p>
            )}
          </div>
        )}

        <div className="flex justify-between">
          <Button type="button" variant="outline" disabled={step === 1} onClick={goBack}>
            Atrás
          </Button>
          {step < TOTAL_STEPS ? (
            <Button type="button" onClick={goNext}>
              Siguiente
            </Button>
          ) : (
            <Button type="button" disabled={isSubmitting} onClick={handleCreateRole}>
              {isSubmitting ? 'Creando…' : 'Crear Rol'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
