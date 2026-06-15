<?php
// apply_librepulse.php

header('Content-Type: application/json');

const APPLY_LIBREPULSE_SCRIPT = '/opt/customer-web-installer/scripts/configure-librepulse-from-web.sh';
const TMP_KEY_FILE = '/tmp/librepulse-api-key';

/**
 * Confirm www-data can sudo the apply script and prerequisites are ready.
 *
 * @return array{ok: bool, message: string}
 */
function verify_librepulse_apply_ready(): array
{
    $script = APPLY_LIBREPULSE_SCRIPT;

    if (!is_file($script) || !is_executable($script)) {
        return [
            'ok' => false,
            'message' => 'LibrePulse apply script is missing or not executable',
        ];
    }

    $cmd = 'sudo -n ' . escapeshellarg($script) . ' --verify 2>&1';
    exec($cmd, $output, $code);

    if ($code !== 0) {
        $detail = trim(implode("\n", $output));
        if ($detail === '') {
            $detail = 'Unable to run LibrePulse apply script (sudo permission denied)';
        }

        return ['ok' => false, 'message' => $detail];
    }

    return ['ok' => true, 'message' => ''];
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['status' => 'error', 'message' => 'Invalid request method']);
    exit;
}

$apiKey = trim($_POST['api_key'] ?? '');

if ($apiKey === '') {
    echo json_encode(['status' => 'error', 'message' => 'API key is required']);
    exit;
}

if (strlen($apiKey) < 8 || strlen($apiKey) > 256) {
    echo json_encode(['status' => 'error', 'message' => 'API key must be between 8 and 256 characters']);
    exit;
}

if (strpbrk($apiKey, "\r\n\"'`\\$") !== false) {
    echo json_encode(['status' => 'error', 'message' => 'API key contains invalid characters']);
    exit;
}

if (file_put_contents(TMP_KEY_FILE, $apiKey) === false) {
    echo json_encode(['status' => 'error', 'message' => 'Failed to stage API key for configuration']);
    exit;
}

@chmod(TMP_KEY_FILE, 0600);

$verify = verify_librepulse_apply_ready();
if (!$verify['ok']) {
    @unlink(TMP_KEY_FILE);
    echo json_encode(['status' => 'error', 'message' => $verify['message']]);
    exit;
}

$applyCmd = 'sudo -n ' . escapeshellarg(APPLY_LIBREPULSE_SCRIPT) . ' 2>&1';
exec($applyCmd, $applyOutput, $applyCode);

@unlink(TMP_KEY_FILE);

if ($applyCode !== 0) {
    $detail = trim(implode("\n", $applyOutput));
    if ($detail === '') {
        $detail = 'LibrePulse configuration failed';
    }
    echo json_encode(['status' => 'error', 'message' => $detail]);
    exit;
}

echo json_encode([
    'status' => 'success',
    'message' => 'LibrePulse heartbeat scheduled every 5 minutes.',
]);
