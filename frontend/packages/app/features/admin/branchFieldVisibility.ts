// Qué campos de una SEDE aplican según el rol de negocio de la organización
// dueña (confirmado por el usuario, 2026-08-14):
//   - Licencia ambiental y su vencimiento: solo si es GESTOR.
//   - Capacidad operativa (kg/litros/m3): si es GESTOR o SUBGESTOR.
//
// Se compara por CÓDIGO de rol y no por capacidad (`can_treat_waste` y
// compañía) por un motivo concreto del catálogo real: `SUBGESTOR` y
// `TRANSPORTER` tienen exactamente los mismos flags (solo
// `can_transport_waste`), así que ninguna combinación de capacidades logra
// distinguirlos -- y un Transportador puro no declara capacidad de sede.
//
// La relación organización-rol es N:N: una organización puede ser Generador Y
// Gestor a la vez. Basta con tener AL MENOS UNO de los roles que habilitan
// cada grupo, nunca "ser exactamente" ese rol.
//
// El backend aplica la MISMA regla y descarta en silencio lo que no aplique
// (ver `BranchController::stripFieldsNotApplicableToOrganization()`); esto es
// la mitad de UI, para no mostrar campos que no van a guardarse.

const ENVIRONMENTAL_LICENSE_ROLES = ['GESTOR']
const OPERATIONAL_CAPACITY_ROLES = ['GESTOR', 'SUBGESTOR']

export function showsEnvironmentalLicenseFields(businessRoleCodes: string[]): boolean {
  return businessRoleCodes.some((code) => ENVIRONMENTAL_LICENSE_ROLES.includes(code))
}

export function showsOperationalCapacityFields(businessRoleCodes: string[]): boolean {
  return businessRoleCodes.some((code) => OPERATIONAL_CAPACITY_ROLES.includes(code))
}
