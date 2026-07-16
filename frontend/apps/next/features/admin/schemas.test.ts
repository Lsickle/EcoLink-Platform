import { describe, expect, test } from 'vitest'
import { createUserSchema, roleGeneralInfoSchema } from 'app/features/admin/schemas'

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
})
