<?php
// read_log.php
$logFile = '/tmp/install.log';

if (file_exists($logFile)) {
    // Read and output the entire file
    echo file_get_contents($logFile);
} else {
    echo "Waiting for log file to be generated...\n";
}
