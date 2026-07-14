import { describe, expect, test } from 'vitest'
import { changePasswordSchema, loginSchema, registerSchema } from 'app/features/auth/schemas'

describe('registerSchema', () => {
  const validPayload = {
    documentType: 'CC' as const,
    documentNumber: '123456789',
    firstName: 'Ana',
    lastName: 'Gomez',
    email: 'ana@example.com',
    phone: '',
    password: 'Passw0rd123',
    passwordConfirmation: 'Passw0rd123',
  }

  test('accepts a valid payload', () => {
    expect(registerSchema.safeParse(validPayload).success).toBe(true)
  })

  test('rejects a password without an uppercase letter', () => {
    const result = registerSchema.safeParse({ ...validPayload, password: 'passw0rd123', passwordConfirmation: 'passw0rd123' })
    expect(result.success).toBe(false)
  })

  test('rejects when passwords do not match', () => {
    const result = registerSchema.safeParse({ ...validPayload, passwordConfirmation: 'Otra12345' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes('passwordConfirmation'))).toBe(true)
    }
  })

  test('rejects a missing document number', () => {
    const result = registerSchema.safeParse({ ...validPayload, documentNumber: '' })
    expect(result.success).toBe(false)
  })

  test('rejects an invalid email', () => {
    const result = registerSchema.safeParse({ ...validPayload, email: 'not-an-email' })
    expect(result.success).toBe(false)
  })
})

describe('loginSchema', () => {
  test('accepts a valid payload', () => {
    expect(loginSchema.safeParse({ login: 'ana@example.com', password: 'anything' }).success).toBe(true)
  })

  test('rejects an empty login', () => {
    expect(loginSchema.safeParse({ login: '', password: 'anything' }).success).toBe(false)
  })
})

// PUT /api/password (AuthController::changePassword) exige current_password +
// password con la misma política de complejidad que el registro.
describe('changePasswordSchema', () => {
  const validPayload = {
    currentPassword: 'OldPassw0rd',
    newPassword: 'NewPassw0rd1',
    newPasswordConfirmation: 'NewPassw0rd1',
  }

  test('accepts a valid payload', () => {
    expect(changePasswordSchema.safeParse(validPayload).success).toBe(true)
  })

  test('rejects an empty current password', () => {
    const result = changePasswordSchema.safeParse({ ...validPayload, currentPassword: '' })
    expect(result.success).toBe(false)
  })

  test('rejects a new password without the required complexity', () => {
    const result = changePasswordSchema.safeParse({
      ...validPayload,
      newPassword: 'lowercase1',
      newPasswordConfirmation: 'lowercase1',
    })
    expect(result.success).toBe(false)
  })

  test('rejects when the new password confirmation does not match', () => {
    const result = changePasswordSchema.safeParse({ ...validPayload, newPasswordConfirmation: 'Otra12345' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes('newPasswordConfirmation'))).toBe(true)
    }
  })
})
