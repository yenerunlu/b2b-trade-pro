// /home/yunlu/b2b-app/config/database.js
// MSSQL bağlantı ayarları: Logo GO3 ve B2B_TRADE_PRO

function envOrDefault(key, def) {
    const v = process.env[key];
    if (v === undefined || v === null || String(v).trim() === '') return def;
    return String(v);
}

function requiredEnv(key) {
    const v = process.env[key];
    if (v === undefined || v === null || String(v).trim() === '') {
        throw new Error(`Missing required env: ${key}`);
    }
    return String(v);
}

const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production';

const DEFAULT_DB_HOST = '127.0.0.1';
const DEFAULT_DB_USER = 'sa';
const DEFAULT_DB_PASSWORD = '';

const sharedDb = {
    server: isProd ? requiredEnv('MSSQL_HOST') : envOrDefault('MSSQL_HOST', DEFAULT_DB_HOST),
    user: isProd ? requiredEnv('MSSQL_USER') : envOrDefault('MSSQL_USER', DEFAULT_DB_USER),
    password: isProd ? requiredEnv('MSSQL_PASSWORD') : envOrDefault('MSSQL_PASSWORD', DEFAULT_DB_PASSWORD),
    options: {
        encrypt: envOrDefault('MSSQL_ENCRYPT', 'true') === 'true',
        trustServerCertificate: envOrDefault('MSSQL_TRUST_CERT', 'true') === 'true',
        connectTimeout: 30000,
        requestTimeout: 60000,
        enableArithAbort: true
    }
};

const logoConfig = {
    ...sharedDb,
    database: envOrDefault('LOGO_DB_NAME', 'LOGOGO3'),
    pool: {
        max: 10,
        min: 1,
        idleTimeoutMillis: 30000,
        acquireTimeoutMillis: 60000
    }
};

const b2bConfig = {
    ...sharedDb,
    database: envOrDefault('B2B_DB_NAME', 'B2B_TRADE_PRO'),
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
