<?php

/*
| Mensajes de autenticación. `AuthController` ya emite sus propios textos en
| español, pero estas claves las usa el propio framework (p. ej. el
| middleware de throttling y `Illuminate\Auth`), así que se traducen para que
| no se cuele inglés por esa vía.
*/

return [

    'failed' => 'Las credenciales indicadas no coinciden con nuestros registros.',
    'password' => 'La contraseña es incorrecta.',
    'throttle' => 'Demasiados intentos de acceso. Por favor intente de nuevo en :seconds segundos.',

];
