# Notas de pruebas — staging

**Entorno**: https://ecolink-platform.vercel.app
**Fecha de inicio**: 2026-08-08
**Usuarios de prueba**: Felipe Martinez, Katherine Arciniegas, Fernanda Quintero (rol Administrador)

Cada hallazgo: módulo/pantalla, descripción, tipo (bug / UX / copy / dato faltante / permiso), estado.

---

## Usuarios

- **[BUG resuelto — revisión de fondo pendiente]** `Lista de Usuarios` (`/admin/users`) en blanco al entrar como **administrador de EcoLink** (usuario de plataforma). Causa: `users.person_id` es **nullable** (`backend/database/migrations/2026_07_12_120005_create_users_table.php:26`) y el backend ya lo trata como opcional (`UserManagementController.php:307` usa `$user->person?->`), pero el frontend declaraba `person: AdminPersonInfo` como obligatorio (`frontend/packages/app/features/admin/types.ts:126`) y hacía `user.person.full_name` directo — cualquier usuario sin registro en `people` rompía el render de toda la pantalla. Tipo: bug. Estado: **resuelto** (`person` pasa a opcional en el tipo, y las 18 lecturas caen a `user.person?.full_name ?? user.username` en 6 pantallas: `UsersListScreen`, `UserDetailScreen`, `BranchDetailScreen`, `LinkedGeneratorDetailScreen`, `OrganizationDetailScreen`, `PermissionDetailScreen`, `RoleDetailScreen`; typecheck en 0 errores).

  **Pendiente de decisión de negocio**: el fallback evita el crash pero no responde *por qué* el admin de EcoLink no tiene registro en `people`. Hay que definir si (a) los usuarios de plataforma **deben** tener un `people` asociado — y entonces corregir el seeder/alta y volver `person` obligatorio —, o (b) es un caso legítimo y el username es la identificación correcta para ellos. Mientras no se decida, la lista muestra el username para esos usuarios. Revisar junto con el modelo de roles de 3 ejes (`roles-canonicos.md`), que es donde se distingue usuario de plataforma vs. usuario de organización.

## Roles

## Permisos / Matriz de Permisos

## Organizaciones

## Sucursales

## Contactos

## Catálogos (países, departamentos, municipios, localidades, tipos de sucursal, áreas organizacionales, etc.)

## Residuos / Residuos Preaprobados

- **[BUG confirmado en código]** `Editar Declaración de Residuo` (`/admin/wastes/{id}/edit`, Paso 4 — Evidencias y Documentos), componente `frontend/apps/next/features/admin/waste/WasteWizard.tsx` (líneas ~974-1044, las 3 zonas: Fotografías, Ficha SDS, Documento Adicional): el texto invita a "Arrastra fotos aquí o haz clic para seleccionar" pero no hay ningún `onDrop`/`onDragOver`/`preventDefault` implementado — solo un `<label>` con `<input type="file" class="sr-only">`. Al soltar un archivo arrastrado, el navegador ejecuta su acción por defecto (lo abre en una pestaña nueva) en vez de adjuntarlo. El click-to-select sí funciona correctamente (verificado). Tipo: bug. Estado: **resuelto** (agregado `onDragOver`/`onDrop` con `preventDefault()` en las 3 zonas, reutilizando `handleUploadPhotos`/`handleUploadSds`/`handleUploadAdditionalDocument`; 4 tests nuevos en `WasteWizard.test.tsx`, suite completa en verde). Pendiente: volver a desplegar a staging y verificar en el navegador con un archivo real.

## Solicitudes de Servicio

## Programación de Recolección / Dispatch / Rutas de Transporte

## Manifiestos (Cargue / Descargue)

## Autorizaciones de Transportador

## Workflows

## Otros / Transversal
