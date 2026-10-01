<?php

// Backend API pura -- no existe ninguna ruta 'login' con nombre (routes/web.php
// solo tiene la vista welcome). Sin `redirectGuestsTo` en bootstrap/app.php,
// Laravel intenta route('login') por defecto cuando una petición sin
// autenticar llega SIN `Accept: application/json` (ej. navegación de
// navegador plana a un endpoint protegido, en vez de un `fetch`), y como esa
// ruta no existe, explota con RouteNotFoundException en vez de un 401 limpio.
//
// Síntoma real reportado: al intentar descargar un archivo desde el
// frontend, en vez de un 401 manejable, la app mostraba
// `{"message": "Route [login] not defined."}`.
//
// `get()` plano de Pest/Laravel se usa a propósito (NO `getJson()`, que ya
// manda `Accept: application/json` por defecto y no reproduciría el bug).

test('una peticion sin autenticar a una ruta protegida por auth:sanctum, sin Accept:json, responde 401 JSON limpio', function () {
    $response = $this->get('/api/user');

    $response->assertUnauthorized();
    $response->assertJson(['message' => 'Unauthenticated.']);
});

test('una peticion sin autenticar a otra ruta protegida (admin) tambien responde 401 JSON limpio', function () {
    $response = $this->get('/api/admin/users');

    $response->assertUnauthorized();
});
