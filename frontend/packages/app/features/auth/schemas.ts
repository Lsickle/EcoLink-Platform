import { z } from 'zod'

// Espejo de las reglas de validación del backend (AuthController::register,
// backend/app/Http/Controllers/Api/AuthController.php) — mismos mínimos de
// contraseña, mismos campos obligatorios de esquema-bd (people/users).
export const documentTypeOptions = [
  { value: 'CC', label: 'Cédula de ciudadanía' },
  { value: 'CE', label: 'Cédula de extranjería' },
  { value: 'PA', label: 'Pasaporte' },
] as const

const passwordSchema = z
  .string()
  .min(8, 'Debe tener al menos 8 caracteres.')
  .regex(/[a-z]/, 'Debe incluir al menos una minúscula.')
  .regex(/[A-Z]/, 'Debe incluir al menos una mayúscula.')
  .regex(/[0-9]/, 'Debe incluir al menos un número.')

export const registerSchema = z
  .object({
    documentType: z.enum(['CC', 'CE', 'PA']),
    documentNumber: z.string().trim().min(1, 'Ingresa tu número de documento.'),
    firstName: z.string().trim().min(1, 'Ingresa tus nombres.'),
    lastName: z.string().trim().min(1, 'Ingresa tus apellidos.'),
    email: z.string().trim().email('Ingresa un correo válido.'),
    phone: z.string().trim().optional().or(z.literal('')),
    password: passwordSchema,
    passwordConfirmation: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    message: 'Las contraseñas no coinciden.',
    path: ['passwordConfirmation'],
  })

export type RegisterFormValues = z.infer<typeof registerSchema>

export const loginSchema = z.object({
  login: z.string().trim().min(1, 'Ingresa tu correo.'),
  password: z.string().min(1, 'Ingresa tu contraseña.'),
})

export type LoginFormValues = z.infer<typeof loginSchema>

// Espejo de PUT /api/password (AuthController::changePassword) -- misma
// política de complejidad que el registro. RN-039 (no reutilizar las
// últimas contraseñas) se valida solo en el backend (necesita el historial
// de hashes), no se duplica aquí.
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Ingresa tu contraseña actual.'),
    newPassword: passwordSchema,
    newPasswordConfirmation: z.string(),
  })
  .refine((data) => data.newPassword === data.newPasswordConfirmation, {
    message: 'Las contraseñas no coinciden.',
    path: ['newPasswordConfirmation'],
  })

export type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>

// CU-009 (PasswordRecoveryController): recuperación de contraseña por
// autoservicio en dos pasos -- forgot (paso 0), verify-code (paso 1) y
// reset (paso 2), mismo shape de payload que espera cada endpoint.
export const requestRecoverySchema = z.object({
  email: z.string().trim().email('Ingresa un correo válido.'),
})

export type RequestRecoveryFormValues = z.infer<typeof requestRecoverySchema>

export const verifyRecoveryCodeSchema = z.object({
  email: z.string().trim().email('Ingresa un correo válido.'),
  code: z.string().regex(/^\d{6}$/, 'Ingresa el código de 6 dígitos.'),
})

export type VerifyRecoveryCodeFormValues = z.infer<typeof verifyRecoveryCodeSchema>

export const resetPasswordSchema = z
  .object({
    email: z.string().trim().email('Ingresa un correo válido.'),
    code: z.string().regex(/^\d{6}$/, 'Ingresa el código de 6 dígitos.'),
    password: passwordSchema,
    passwordConfirmation: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    message: 'Las contraseñas no coinciden.',
    path: ['passwordConfirmation'],
  })

export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>
