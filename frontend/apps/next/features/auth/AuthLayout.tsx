'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useTheme } from 'next-themes'
import { ThemeToggle } from '@/components/theme-toggle'

// El logo tiene una variante por tema (Figma: secciones "Logos Light"/"Logos
// Dark") -- el texto de apoyo y "360°" usan colores fijos (#4B5563/#003A7F)
// que no son legibles sobre fondo oscuro, así que no basta con un solo SVG.
// Mismo patrón anti-mismatch de hidratación que ThemeToggle: el tema real
// solo se conoce en cliente, así que se evita renderizar cualquiera de las
// dos variantes hasta montar.
export function AuthLayout({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const logoSrc = !mounted ? null : resolvedTheme === 'dark' ? '/logo-ecolink-dark.svg' : '/logo-ecolink.svg'

  return (
    <div className="flex min-h-screen flex-col items-center">
      <header className="flex h-20 w-full max-w-5xl items-center justify-between px-5">
        {logoSrc && <Image src={logoSrc} alt="EcoLink" width={200} height={54} priority unoptimized />}
        <ThemeToggle />
      </header>
      <main className="flex flex-1 w-full items-center justify-center px-4 py-8">{children}</main>
    </div>
  )
}
