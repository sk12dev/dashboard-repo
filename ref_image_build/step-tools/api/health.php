<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/includes/bootstrap.php';

$config = step_tools_config();
$token = trim((string) ($config['api_token'] ?? ''));
$baseUrl = rtrim((string) ($config['librenms_url'] ?? ''), '/');

$checks = [
    'config_file' => is_readable('/etc/step-tools/config.php') ? 'ok' : 'missing',
    'api_token_set' => $token !== '' ? 'ok' : 'missing',
    'api_token_length' => strlen($token),
    'librenms_url' => $baseUrl !== '' ? $baseUrl : '(not set)',
];

$result = step_tools_librenms_request('v0/devices', 'GET');

step_tools_json_response([
    'ok' => $result['ok'],
    'checks' => $checks,
    'librenms_status' => $result['status'] ?? null,
    'librenms_message' => $result['ok']
        ? ('API OK — ' . ($result['data']['count'] ?? 0) . ' device(s) visible')
        : ($result['error'] ?? 'Unknown error'),
    'hint' => !$result['ok'] && ($result['status'] ?? 0) === 401
        ? 'Unauthorized: run sudo generate-api-key.sh to create a matching token in LibreNMS'
        : (!$result['ok'] && ($result['status'] ?? 0) === 502
            ? 'Cannot reach LibreNMS at ' . $baseUrl . ' — try librenms_url http://127.0.0.1 in /etc/step-tools/config.php'
            : null),
]);
