<?php

/*
|--------------------------------------------------------------------------
| Mensajes de validación en español
|--------------------------------------------------------------------------
|
| Laravel NO trae el directorio `lang/` ni traducciones al español por
| defecto (se publican con `artisan lang:publish`, que solo genera el inglés).
| Sin este archivo, cada 422 llegaba al frontend en inglés ("The name field
| is required"), que es lo que el usuario reportó en el wizard de Residuos.
|
| Traducir AQUÍ resuelve el problema en TODOS los formularios y wizards a la
| vez, porque `lib/api-client.ts` muestra tal cual el `message`/`errors` que
| devuelve Laravel -- no hay copias de estos textos en el frontend.
|
| `attributes` (abajo) traduce además el NOMBRE del campo, para que el
| mensaje diga "El campo nombre es obligatorio" y no "El campo name...".
|
*/

return [

    'accepted' => 'El campo :attribute debe ser aceptado.',
    'accepted_if' => 'El campo :attribute debe ser aceptado cuando :other sea :value.',
    'active_url' => 'El campo :attribute debe ser una URL válida.',
    'after' => 'El campo :attribute debe ser una fecha posterior a :date.',
    'after_or_equal' => 'El campo :attribute debe ser una fecha posterior o igual a :date.',
    'alpha' => 'El campo :attribute solo debe contener letras.',
    'alpha_dash' => 'El campo :attribute solo debe contener letras, números, guiones y guiones bajos.',
    'alpha_num' => 'El campo :attribute solo debe contener letras y números.',
    'any_of' => 'El campo :attribute no es válido.',
    'array' => 'El campo :attribute debe ser un conjunto de valores.',
    'ascii' => 'El campo :attribute solo debe contener caracteres alfanuméricos y símbolos de un solo byte.',
    'before' => 'El campo :attribute debe ser una fecha anterior a :date.',
    'before_or_equal' => 'El campo :attribute debe ser una fecha anterior o igual a :date.',
    'between' => [
        'array' => 'El campo :attribute debe tener entre :min y :max elementos.',
        'file' => 'El archivo :attribute debe pesar entre :min y :max kilobytes.',
        'numeric' => 'El campo :attribute debe estar entre :min y :max.',
        'string' => 'El campo :attribute debe tener entre :min y :max caracteres.',
    ],
    'boolean' => 'El campo :attribute debe ser verdadero o falso.',
    'can' => 'El campo :attribute contiene un valor no autorizado.',
    'confirmed' => 'La confirmación de :attribute no coincide.',
    'contains' => 'Al campo :attribute le falta un valor requerido.',
    'current_password' => 'La contraseña es incorrecta.',
    'date' => 'El campo :attribute debe ser una fecha válida.',
    'date_equals' => 'El campo :attribute debe ser una fecha igual a :date.',
    'date_format' => 'El campo :attribute no corresponde al formato :format.',
    'decimal' => 'El campo :attribute debe tener :decimal decimales.',
    'declined' => 'El campo :attribute debe ser rechazado.',
    'declined_if' => 'El campo :attribute debe ser rechazado cuando :other sea :value.',
    'different' => 'Los campos :attribute y :other deben ser diferentes.',
    'digits' => 'El campo :attribute debe tener :digits dígitos.',
    'digits_between' => 'El campo :attribute debe tener entre :min y :max dígitos.',
    'dimensions' => 'La imagen :attribute tiene dimensiones no válidas.',
    'distinct' => 'El campo :attribute contiene un valor duplicado.',
    'doesnt_contain' => 'El campo :attribute no debe contener ninguno de los siguientes valores: :values.',
    'doesnt_end_with' => 'El campo :attribute no debe terminar con ninguno de los siguientes valores: :values.',
    'doesnt_start_with' => 'El campo :attribute no debe comenzar con ninguno de los siguientes valores: :values.',
    'email' => 'El campo :attribute debe ser una dirección de correo válida.',
    'encoding' => 'El campo :attribute debe estar codificado en :encoding.',
    'ends_with' => 'El campo :attribute debe terminar con alguno de los siguientes valores: :values.',
    'enum' => 'El valor seleccionado en :attribute no es válido.',
    'exists' => 'El valor seleccionado en :attribute no es válido.',
    'extensions' => 'El archivo :attribute debe tener alguna de las siguientes extensiones: :values.',
    'file' => 'El campo :attribute debe ser un archivo.',
    'filled' => 'El campo :attribute debe tener un valor.',
    'gt' => [
        'array' => 'El campo :attribute debe tener más de :value elementos.',
        'file' => 'El archivo :attribute debe pesar más de :value kilobytes.',
        'numeric' => 'El campo :attribute debe ser mayor que :value.',
        'string' => 'El campo :attribute debe tener más de :value caracteres.',
    ],
    'gte' => [
        'array' => 'El campo :attribute debe tener :value elementos o más.',
        'file' => 'El archivo :attribute debe pesar :value kilobytes o más.',
        'numeric' => 'El campo :attribute debe ser mayor o igual que :value.',
        'string' => 'El campo :attribute debe tener :value caracteres o más.',
    ],
    'hex_color' => 'El campo :attribute debe ser un color hexadecimal válido.',
    'image' => 'El campo :attribute debe ser una imagen.',
    'in' => 'El valor seleccionado en :attribute no es válido.',
    'in_array' => 'El campo :attribute debe existir en :other.',
    'in_array_keys' => 'El campo :attribute debe contener al menos una de las siguientes claves: :values.',
    'integer' => 'El campo :attribute debe ser un número entero.',
    'ip' => 'El campo :attribute debe ser una dirección IP válida.',
    'ipv4' => 'El campo :attribute debe ser una dirección IPv4 válida.',
    'ipv6' => 'El campo :attribute debe ser una dirección IPv6 válida.',
    'json' => 'El campo :attribute debe ser una cadena JSON válida.',
    'list' => 'El campo :attribute debe ser una lista.',
    'lowercase' => 'El campo :attribute debe estar en minúsculas.',
    'lt' => [
        'array' => 'El campo :attribute debe tener menos de :value elementos.',
        'file' => 'El archivo :attribute debe pesar menos de :value kilobytes.',
        'numeric' => 'El campo :attribute debe ser menor que :value.',
        'string' => 'El campo :attribute debe tener menos de :value caracteres.',
    ],
    'lte' => [
        'array' => 'El campo :attribute debe tener :value elementos o menos.',
        'file' => 'El archivo :attribute debe pesar :value kilobytes o menos.',
        'numeric' => 'El campo :attribute debe ser menor o igual que :value.',
        'string' => 'El campo :attribute debe tener :value caracteres o menos.',
    ],
    'mac_address' => 'El campo :attribute debe ser una dirección MAC válida.',
    'max' => [
        'array' => 'El campo :attribute no debe tener más de :max elementos.',
        'file' => 'El archivo :attribute no debe pesar más de :max kilobytes.',
        'numeric' => 'El campo :attribute no debe ser mayor que :max.',
        'string' => 'El campo :attribute no debe tener más de :max caracteres.',
    ],
    'max_digits' => 'El campo :attribute no debe tener más de :max dígitos.',
    'mimes' => 'El campo :attribute debe ser un archivo de tipo: :values.',
    'mimetypes' => 'El campo :attribute debe ser un archivo de tipo: :values.',
    'min' => [
        'array' => 'El campo :attribute debe tener al menos :min elementos.',
        'file' => 'El archivo :attribute debe pesar al menos :min kilobytes.',
        'numeric' => 'El campo :attribute debe ser al menos :min.',
        'string' => 'El campo :attribute debe tener al menos :min caracteres.',
    ],
    'min_digits' => 'El campo :attribute debe tener al menos :min dígitos.',
    'missing' => 'El campo :attribute no debe estar presente.',
    'missing_if' => 'El campo :attribute no debe estar presente cuando :other sea :value.',
    'missing_unless' => 'El campo :attribute no debe estar presente a menos que :other sea :value.',
    'missing_with' => 'El campo :attribute no debe estar presente si :values está presente.',
    'missing_with_all' => 'El campo :attribute no debe estar presente si :values están presentes.',
    'multiple_of' => 'El campo :attribute debe ser múltiplo de :value.',
    'not_in' => 'El valor seleccionado en :attribute no es válido.',
    'not_regex' => 'El formato del campo :attribute no es válido.',
    'numeric' => 'El campo :attribute debe ser un número.',
    'password' => [
        'letters' => 'El campo :attribute debe contener al menos una letra.',
        'mixed' => 'El campo :attribute debe contener al menos una letra mayúscula y una minúscula.',
        'numbers' => 'El campo :attribute debe contener al menos un número.',
        'symbols' => 'El campo :attribute debe contener al menos un símbolo.',
        'uncompromised' => 'El :attribute indicado apareció en una filtración de datos. Por favor elija otro.',
    ],
    'present' => 'El campo :attribute debe estar presente.',
    'present_if' => 'El campo :attribute debe estar presente cuando :other sea :value.',
    'present_unless' => 'El campo :attribute debe estar presente a menos que :other sea :value.',
    'present_with' => 'El campo :attribute debe estar presente si :values está presente.',
    'present_with_all' => 'El campo :attribute debe estar presente si :values están presentes.',
    'prohibited' => 'El campo :attribute está prohibido.',
    'prohibited_if' => 'El campo :attribute está prohibido cuando :other sea :value.',
    'prohibited_if_accepted' => 'El campo :attribute está prohibido cuando :other sea aceptado.',
    'prohibited_if_declined' => 'El campo :attribute está prohibido cuando :other sea rechazado.',
    'prohibited_unless' => 'El campo :attribute está prohibido a menos que :other esté en :values.',
    'prohibits' => 'El campo :attribute prohíbe que :other esté presente.',
    'regex' => 'El formato del campo :attribute no es válido.',
    'required' => 'El campo :attribute es obligatorio.',
    'required_array_keys' => 'El campo :attribute debe contener entradas para: :values.',
    'required_if' => 'El campo :attribute es obligatorio cuando :other sea :value.',
    'required_if_accepted' => 'El campo :attribute es obligatorio cuando :other sea aceptado.',
    'required_if_declined' => 'El campo :attribute es obligatorio cuando :other sea rechazado.',
    'required_unless' => 'El campo :attribute es obligatorio a menos que :other esté en :values.',
    'required_with' => 'El campo :attribute es obligatorio cuando :values está presente.',
    'required_with_all' => 'El campo :attribute es obligatorio cuando :values están presentes.',
    'required_without' => 'El campo :attribute es obligatorio cuando :values no está presente.',
    'required_without_all' => 'El campo :attribute es obligatorio cuando ninguno de :values está presente.',
    'same' => 'Los campos :attribute y :other deben coincidir.',
    'size' => [
        'array' => 'El campo :attribute debe contener :size elementos.',
        'file' => 'El archivo :attribute debe pesar :size kilobytes.',
        'numeric' => 'El campo :attribute debe ser :size.',
        'string' => 'El campo :attribute debe tener :size caracteres.',
    ],
    'starts_with' => 'El campo :attribute debe comenzar con alguno de los siguientes valores: :values.',
    'string' => 'El campo :attribute debe ser una cadena de texto.',
    'timezone' => 'El campo :attribute debe ser una zona horaria válida.',
    'unique' => 'El valor del campo :attribute ya está en uso.',
    'uploaded' => 'No se pudo subir el archivo :attribute.',
    'uppercase' => 'El campo :attribute debe estar en mayúsculas.',
    'url' => 'El campo :attribute debe ser una URL válida.',
    'ulid' => 'El campo :attribute debe ser un ULID válido.',
    'uuid' => 'El campo :attribute debe ser un UUID válido.',

    /*
    |--------------------------------------------------------------------------
    | Mensajes de validación personalizados
    |--------------------------------------------------------------------------
    */

    'custom' => [
        'attribute-name' => [
            'rule-name' => 'mensaje-personalizado',
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Nombres de los campos
    |--------------------------------------------------------------------------
    |
    | Traduce el `:attribute` que se interpola arriba. Sin esto, el mensaje
    | quedaría a medias ("El campo name es obligatorio"). Se cubren los campos
    | reales del dominio (ver los `validationRules()` de los controllers), no
    | una lista genérica -- si aparece uno nuevo sin traducir, Laravel cae al
    | nombre de la columna con los guiones bajos convertidos en espacios, que
    | sigue siendo legible.
    |
    */

    'attributes' => [
        // Identificación y datos generales
        'name' => 'nombre',
        'legal_name' => 'razón social',
        'trade_name' => 'nombre comercial',
        'code' => 'código',
        'description' => 'descripción',
        'observations' => 'observaciones',
        'reason' => 'motivo',
        'notes' => 'notas',
        'operational_notes' => 'notas operativas',
        'internal_reference' => 'referencia interna',
        'title' => 'título',

        // Contacto
        'email' => 'correo electrónico',
        'billing_email' => 'correo de facturación',
        'support_email' => 'correo de soporte',
        'phone' => 'teléfono',
        'website' => 'sitio web',
        'address' => 'dirección',
        'street' => 'dirección',

        // Autenticación
        'password' => 'contraseña',
        'password_confirmation' => 'confirmación de contraseña',
        'current_password' => 'contraseña actual',
        'new_password' => 'contraseña nueva',
        'username' => 'nombre de usuario',
        'token' => 'token',

        // Documento e identificación tributaria
        'tax_id' => 'NIT',
        'tax_id_type' => 'tipo de documento',
        'document_type' => 'tipo de documento',
        'document_number' => 'número de documento',

        // Persona
        'first_name' => 'nombre',
        'middle_name' => 'segundo nombre',
        'last_name' => 'apellido',
        'second_last_name' => 'segundo apellido',
        'birth_date' => 'fecha de nacimiento',
        'gender' => 'género',
        'position_id' => 'cargo',

        // Organización y estructura
        'organization_id' => 'organización',
        'tenant_organization_id' => 'organización',
        'parent_organization_id' => 'organización matriz',
        'branch_id' => 'sucursal',
        'branch_type' => 'tipo de sucursal',
        'business_role_id' => 'rol de negocio',
        'role_id' => 'rol',
        'permission_id' => 'permiso',
        'user_id' => 'usuario',
        'contact_id' => 'contacto',

        // Geografía
        'country_id' => 'país',
        'department_id' => 'departamento',
        'municipality_id' => 'municipio',
        'locality_id' => 'localidad',
        'latitude' => 'latitud',
        'longitude' => 'longitud',

        // Residuos
        'waste_id' => 'residuo',
        'waste_category_id' => 'categoría de residuo',
        'waste_type_id' => 'tipo de residuo',
        'waste_stream_id' => 'corriente',
        'waste_stream_ids' => 'corrientes',
        'un_code_id' => 'código UN',
        'un_code_ids' => 'códigos UN',
        'hazard_characteristic_ids' => 'características de peligrosidad',
        'physical_state_id' => 'estado físico',
        'measurement_unit_id' => 'unidad de medida',
        'generation_frequency_id' => 'frecuencia de generación',
        'operational_status_id' => 'estado operativo',
        'average_weight' => 'peso promedio',
        'quantity' => 'cantidad',
        'generation_date' => 'fecha de generación',
        'requires_characterization' => 'requiere caracterización',
        'requires_sds' => 'requiere ficha de seguridad',
        'requires_special_transport' => 'requiere transporte especial',
        'requires_special_ppe' => 'requiere EPP especial',
        'is_template' => 'es plantilla',

        // Tratamientos y aprobaciones
        'treatment_id' => 'tratamiento',
        'branch_treatment_id' => 'tratamiento por sede',
        'waste_treatment_approval_id' => 'aprobación de tratamiento',
        'technical_status' => 'estado técnico',
        'commercial_status' => 'estado comercial',
        'unit_price' => 'precio unitario',
        'currency' => 'moneda',
        'valid_from' => 'vigente desde',
        'valid_until' => 'vigente hasta',

        // Transporte y logística
        'vehicle_id' => 'vehículo',
        'plate_number' => 'placa',
        'vehicle_type' => 'tipo de vehículo',
        'transport_personnel_id' => 'conductor',
        'license_number' => 'número de licencia',
        'carrier_organization_id' => 'organización transportadora',
        'destination_branch_id' => 'sede de destino',
        'source_branch_id' => 'sede de origen',

        // Fechas y archivos
        'date' => 'fecha',
        'start_date' => 'fecha de inicio',
        'end_date' => 'fecha de fin',
        'expiration_date' => 'fecha de vencimiento',
        'file' => 'archivo',
        'files' => 'archivos',

        // Estado
        'status' => 'estado',
        'is_active' => 'activo',
        'priority' => 'prioridad',
    ],

];
