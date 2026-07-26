<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

use Illuminate\Support\Facades\Config;

Route::get('/debug-env', function () {
    return response()->json([
        'SESSION_DRIVER' => config('session.driver'),
        'SESSION_SAME_SITE' => config('session.same_site'),
        'SESSION_SECURE_COOKIE' => config('session.secure'),
        'SANCTUM_STATEFUL_DOMAINS' => config('sanctum.stateful'),
        'FRONTEND_URL' => config('cors.allowed_origins'),
        'APP_ENV' => config('app.env'),
    ]);
});
