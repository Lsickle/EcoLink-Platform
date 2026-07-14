import { describe, expect, test } from 'vitest'
import { passwordStrength } from 'app/features/auth/password-strength'

describe('passwordStrength', () => {
  test('empty password is weak', () => {
    expect(passwordStrength('')).toBe('weak')
  })

  test('short password without variety is weak', () => {
    expect(passwordStrength('abc')).toBe('weak')
  })

  test('meets the minimum policy (8 chars, upper, lower, number) is fair', () => {
    expect(passwordStrength('Passw0rd')).toBe('fair')
  })

  test('long password with symbols is strong', () => {
    expect(passwordStrength('Passw0rd123!Extra')).toBe('strong')
  })
})
