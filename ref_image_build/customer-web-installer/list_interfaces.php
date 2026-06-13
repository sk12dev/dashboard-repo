<?php

require_once __DIR__ . '/network_utils.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Method not allowed']);
    exit;
}

$serverIp = $_SERVER['SERVER_ADDR'] ?? null;
$interfaces = list_ethernet_interfaces();
$defaultInterface = suggest_default_interface($serverIp);

echo json_encode([
    'status' => 'success',
    'interfaces' => $interfaces,
    'default_interface' => $defaultInterface,
]);
