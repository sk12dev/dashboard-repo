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

$result = step_tools_librenms_request('v0', 'GET');

step_tools_json_response([
    'ok' => $result['ok'],
    'checks' => $checks,
    'librenms_status' => $result['status'] ?? null,
    'librenms_message' => $result['ok']
        ? ($result['data']['message'] ?? 'API reachable')
        : ($result['error'] ?? 'Unknown error'),
    'hint' => !$result['ok'] && $token !== ''
        ? 'If unauthorized, run: sudo generate-api-key.sh (older installs stored an MD5 hash instead of the plain token)'
        : null,
]);
