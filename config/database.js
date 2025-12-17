// /home/yunlu/b2b-app/config/database.js
// MSSQL bağlantı ayarları: Logo GO3 ve B2B_TRADE_PRO

const logoConfig = {
    server: '5.180.186.54',
    database: 'LOGOGO3',
    user: 'sa',
    password: 'Logo12345678',
    options: {
        encrypt: true,
        trustServerCertificate: true,
        connectTimeout: 30000,
        requestTimeout: 60000,
        enableArithAbort: true
    },
    pool: {
        max: 10,
        min: 1,
        idleTimeoutMillis: 30000,
        acquireTimeoutMillis: 60000
    }
};

const b2bConfig = {
    server: '5.180.186.54',
    database: 'B2B_TRADE_PRO',
    user: 'sa',
    password: 'Logo12345678',
    options: {
        encrypt: true,
        trustServerCertificate: true,
        connectTimeout: 30000,
        requestTimeout: 60000,
        enableArithAbort: true
    },
    pool: {
        max: 5,
        min: 1,
        idleTimeoutMillis: 30000,
        acquireTimeoutMillis: 60000
    }
};

module.exports = {
    logoConfig,
    b2bConfig
};
