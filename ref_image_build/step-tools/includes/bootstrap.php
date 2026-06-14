<?php

declare(strict_types=1);

function step_tools_config(): array
{
    static $config = null;

    if ($config !== null) {
        return $config;
    }

    $paths = [
        '/etc/step-tools/config.php',
        dirname(__DIR__) . '/config.local.php',
    ];

    foreach ($paths as $path) {
        if (is_readable($path)) {
            $loaded = require $path;
            if (is_array($loaded)) {
                $config = $loaded;
                return $config;
            }
        }
    }

    $config = [
        'librenms_url' => 'http://127.0.0.1',
        'api_token' => '',
    ];

    return $config;
}

function step_tools_json_response(array $payload, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_THROW_ON_ERROR);
    exit;
}

function step_tools_librenms_request(string $path, string $method = 'GET', ?string $body = null): array
{
    $config = step_tools_config();
    $token = trim((string) ($config['api_token'] ?? ''));

    if ($token === '') {
        return [
            'ok' => false,
            'status' => 503,
            'error' => 'LibreNMS API token is not configured. Run generate-api-key.sh on the appliance.',
        ];
    }

    $pathOnly = strtok($path, '?') ?: $path;
    if (!preg_match('#^v0/[a-zA-Z0-9_./\-]+$#', $pathOnly)) {
        return [
            'ok' => false,
            'status' => 400,
            'error' => 'Invalid API path.',
        ];
    }

    $method = strtoupper($method);
    if ($method !== 'GET') {
        return [
            'ok' => false,
            'status' => 405,
            'error' => 'Only read-only GET requests are supported.',
        ];
    }

    $baseUrl = rtrim((string) ($config['librenms_url'] ?? ''), '/');
    $url = $baseUrl . '/api/' . $path;

    $ch = curl_init($url);
    if ($ch === false) {
        return [
            'ok' => false,
            'status' => 500,
            'error' => 'Unable to initialize API request.',
        ];
    }

    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'X-Auth-Token: ' . $token,
            'Accept: application/json',
        ],
        CURLOPT_TIMEOUT => 30,
        CURLOPT_CONNECTTIMEOUT => 5,
    ]);

    $responseBody = curl_exec($ch);
    $curlError = curl_error($ch);
    $httpStatus = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($responseBody === false) {
        return [
            'ok' => false,
            'status' => 502,
            'error' => 'LibreNMS API request failed: ' . $curlError,
        ];
    }

    try {
        $decoded = json_decode($responseBody, true, 512, JSON_THROW_ON_ERROR);
    } catch (JsonException) {
        return [
            'ok' => false,
            'status' => 502,
            'error' => 'LibreNMS returned invalid JSON.',
            'http_status' => $httpStatus,
        ];
    }

    if ($httpStatus >= 400) {
        return [
            'ok' => false,
            'status' => $httpStatus,
            'error' => $decoded['message'] ?? 'LibreNMS API error.',
            'data' => $decoded,
        ];
    }

    return [
        'ok' => true,
        'status' => $httpStatus,
        'data' => $decoded,
    ];
}
