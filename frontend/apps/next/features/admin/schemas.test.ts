import { describe, expect, test } from 'vitest'
import { createOrganizationSchema, createUserSchema, roleGeneralInfoSchema } from 'app/features/admin/schemas'

// Payload base válido de createOrganizationSchema -- todos los campos
// `required` del backend (organizationStatusId/timezone/countryCode/
// currencyCode + legalName/taxId/taxIdType) más isActive/customFieldsEnabled
// (booleans sin default en el schema). Usado como base para los tests de
// validación cruzada taxId/taxIdType (punto 1 del lote de correcciones).
const validOrganizationPayload = {
  legalName: 'EcoRecicla S.A.S.',
  taxId: '900123456-1',
  taxIdType: 'NIT' as const,
  organizationStatusId: 1,
  timezone: 'America/Bogota' as const,
  countryCode: 'CO',
  currencyCode: 'COP' as const,
  isActive: true,
  customFieldsEnabled: true,
}

// Mecanismo de invitación (CU-006.1 modificado): createUserSchema ya no
// lleva password/passwordConfirmation -- store() ya no los acepta, ver
// contrato del lote en UserManagementController.
describe('admin schemas', () => {
  test('createUserSchema accepts a valid payload without optional fields', () => {
    const result = createUserSchema.safeParse({
      documentType: 'CC',
      documentNumber: '123',
      firstName: 'Ana',
      lastName: 'Gomez',
      username: 'ana',
      email: 'ana@example.com',
      roleIds: [1],
    })

    expect(result.success).toBe(true)
  })

  test('createUserSchema rejects a missing username', () => {
    const result = createUserSchema.safeParse({
      documentType: 'CC',
      documentNumber: '123',
      firstName: 'Ana',
      lastName: 'Gomez',
      username: '',
      email: 'ana@example.com',
      roleIds: [],
    })

    expect(result.success).toBe(false)
  })

  // Ayuda visual del wizard: "usar guión bajo" -- el código no puede tener
  // espacios ni caracteres especiales fuera de letras/números/_.
  test('roleGeneralInfoSchema rejects a code with spaces', () => {
    const result = roleGeneralInfoSchema.safeParse({
      code: 'coordinador logistica',
      name: 'Coordinador de logística',
    })

    expect(result.success).toBe(false)
  })

  test('roleGeneralInfoSchema accepts a code with underscores', () => {
    const result = roleGeneralInfoSchema.safeParse({
      code: 'COORD_LOGISTICA',
      name: 'Coordinador de logística',
    })

    expect(result.success).toBe(true)
  })

  // Punto 1 del lote de correcciones -- validación básica de formato de NIT
  // (dígitos, guión y dígito de verificación opcional), SOLO cuando
  // taxIdType='NIT'. Sin algoritmo módulo 11 DIAN (decisión explícita).
  test('createOrganizationSchema rejects a NIT with letters when taxIdType is NIT', () => {
    const result = createOrganizationSchema.safeParse({
      ...validOrganizationPayload,
      taxId: 'ABC123456-1',
      taxIdType: 'NIT',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      const taxIdIssue = result.error.issues.find((issue) => issue.path[0] === 'taxId')
      expect(taxIdIssue?.message).toBe('Formato de NIT inválido (ej. 900123456-1).')
    }
  })

  test('createOrganizationSchema accepts a NIT with the digits-and-check-digit format', () => {
    const result = createOrganizationSchema.safeParse({
      ...validOrganizationPayload,
      taxId: '900123456-1',
      taxIdType: 'NIT',
    })

    expect(result.success).toBe(true)
  })

  test('createOrganizationSchema accepts a NIT without the optional check digit', () => {
    const result = createOrganizationSchema.safeParse({
      ...validOrganizationPayload,
      taxId: '900123456',
      taxIdType: 'NIT',
    })

    expect(result.success).toBe(true)
  })

  test('createOrganizationSchema accepts any non-empty text for a CC (no format restriction)', () => {
    const result = createOrganizationSchema.safeParse({
      ...validOrganizationPayload,
      taxId: 'CC-cualquier-texto-123',
      taxIdType: 'CC',
    })

    expect(result.success).toBe(true)
  })
})
