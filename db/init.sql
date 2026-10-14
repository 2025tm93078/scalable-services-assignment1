CREATE USER inventory_user     WITH PASSWORD 'inventory_pass';
CREATE USER order_user         WITH PASSWORD 'order_pass';
CREATE USER payment_user       WITH PASSWORD 'payment_pass';
CREATE USER notification_user  WITH PASSWORD 'notification_pass';

CREATE DATABASE inventory_db     OWNER inventory_user;
CREATE DATABASE order_db         OWNER order_user;
CREATE DATABASE payment_db       OWNER payment_user;
CREATE DATABASE notification_db  OWNER notification_user;
