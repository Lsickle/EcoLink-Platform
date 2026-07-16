import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { ProvisionalDataNotice } from './ProvisionalDataNotice'

// Aviso compartido "Catálogos Maestros" (Batch 3/3, último): PackagingCondition
// y VehicleType se sembraron con datos PROVISIONALES (sin RN-XXX/fuente de
// negocio confirmada, solo del mockup de Figma -- ver AVISO en
// PackagingConditionSeeder.php/VehicleTypeSeeder.php). Este componente
// reemplaza repetir el mismo banner en cada una de las dos pantallas.
describe('ProvisionalDataNotice', () => {
  test('renders a visible, non-decorative notice that the catalog data is provisional', () => {
    render(<ProvisionalDataNotice />)

    const notice = screen.getByRole('status')
    expect(notice).toHaveTextContent(/provisional/i)
    expect(notice).toHaveTextContent(/sin.*fuente de negocio confirmada|pendiente/i)
  })
})
