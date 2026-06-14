<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/includes/bootstrap.php';

$path = trim((string) ($_GET['path'] ?? ''), '/');
$query = $_GET;
unset($query['path']);

if ($path === '') {
    step_tools_json_response([
        'ok' => false,
        'error' => 'Missing path parameter.',
    ], 400);
}

if ($query !== []) {
    $path .= '?' . http_build_query($query);
}

$result = step_tools_librenms_request($path, 'GET');

if (!$result['ok']) {
    step_tools_json_response([
        'ok' => false,
        'error' => $result['error'] ?? 'Request failed.',
        'details' => $result['data'] ?? null,
    ], $result['status'] ?? 502);
}

step_tools_json_response([
    'ok' => true,
    'data' => $result['data'],
]);
