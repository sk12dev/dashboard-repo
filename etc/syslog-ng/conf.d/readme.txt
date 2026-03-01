# Files in conf.d are processed by syslog-ng in alphabetic order, first files beginning with uppercase 
# characters, then files beginning with lowercase characters

# A-drop.conf 
# Look for messages with certain expressions and log them to /opt/www/syslog/trash.log and STOP processing

# B-ilog.conf  
# log Ignition Server Access logs(CatId=10) to table mysql database("ilog") table("ignition_catId_10")
# log Ignition Server Access logs(CatId=10) to /opt/www/syslog/ignition_access.log and STOP
# send ALL syslog to mysql database("ilog") table("syslog")
# send Ignition Server logs that match { match("^catId=" value("PROGRAM")) and match("^msgId=" value("MESSAGE")) 
# and match("ADDomainAsset=" #value("MESSAGE")); };
# to /opt/www/syslog/ignition_access.log and STOP

# C-librenms.conf  
# send logs to librenms

# z-stepcg.conf
# catch all logs and send to /opt/www/syslog/all.log
# send VOSS cli commands via a string match and STOP
# send voss logs to /opt/www/syslog/voss.log
