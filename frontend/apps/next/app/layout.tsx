import { StylesProvider } from './styles-provider'
import './globals.css'
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { ThemeProvider } from '@/components/theme-provider'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from 'app/provider/auth'

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata = {
  title: 'EcoLink',
  description: 'Plataforma de gestión de residuos y logística ambiental',
  // Favicon adaptado a preferencia de sistema (prefers-color-scheme), no al
  // toggle de tema in-app -- es el comportamiento correcto para un ícono
  // que vive en el chrome del navegador, fuera del control de la página.
  icons: {
    icon: [
      { url: '/icon-light.png' },
      { url: '/icon-dark.png', media: '(prefers-color-scheme: dark)' },
    ],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" className={cn("font-sans", geist.variable)} suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <AuthProvider>
            <TooltipProvider>
              <StylesProvider>{children}</StylesProvider>
            </TooltipProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
