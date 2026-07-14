import { passwordStrength } from 'app/features/auth/password-strength'
import { cn } from '@/lib/utils'

const labels = { weak: 'Débil', fair: 'Aceptable', strong: 'Fuerte' } as const
const colors = {
  weak: 'bg-destructive',
  fair: 'bg-amber-500',
  strong: 'bg-emerald-500',
} as const
const widths = { weak: 'w-1/3', fair: 'w-2/3', strong: 'w-full' } as const

export function PasswordStrengthMeter({ password }: { password: string }) {
  if (!password) return null

  const strength = passwordStrength(password)

  return (
    <div className="flex items-center gap-2" aria-live="polite">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-all', colors[strength], widths[strength])}
        />
      </div>
      <span className="text-xs text-muted-foreground">{labels[strength]}</span>
    </div>
  )
}
