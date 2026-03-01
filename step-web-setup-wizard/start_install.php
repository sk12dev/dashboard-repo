<?php
// start_install.php
$logFile = '/tmp/install.log';

// Clear out any old logs from previous attempts
file_put_contents($logFile, "Starting LibreNMS Installation Script...\n");

// Execute the bash script in the background.
// > routes stdout to the log
// 2>&1 routes stderr to stdout (so errors show up in the log too)
// & puts it in the background
shell_exec("nohup sudo /usr/local/bin/install_librenms.sh > /tmp/install.log 2>&1 &");

// Immediately return success to the browser
echo json_encode(["status" => "started"]);
