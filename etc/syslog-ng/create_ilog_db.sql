USE ilog;

CREATE TABLE `syslog` (
    `host` varchar(32) DEFAULT NULL,
    `sourceip` varchar(32) DEFAULT NULL,
    `facility` varchar(10) DEFAULT NULL,
    `priority` varchar(10) DEFAULT NULL,
    `level` varchar(10) DEFAULT NULL,
    `tag` varchar(10) DEFAULT NULL,
    `datetime` datetime DEFAULT NULL,
    `program` varchar(32) DEFAULT NULL,
    `msg` text,
    `seq` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
    PRIMARY KEY (`seq`),
    KEY `host` (`host`),
    KEY `sourceip` (`sourceip`),
    KEY `program` (`program`),
    KEY `datetime` (`datetime`),
    KEY `priority` (`priority`),
    KEY `facility` (`facility`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
