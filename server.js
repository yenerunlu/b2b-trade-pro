const express = require('express');
const path = require('path');
const sql = require('mssql');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3');

const app = express();
const port = parseInt(process.env.PORT, 10) || 3000;

// ====================================================
// 🚀 0.0 - TEMEL KONFİGÜRASYON
// ====================================================

// Kullanıcı dosyası
const USERS_FILE = path.join(__dirname, 'users.json');
const PASSWORD_CHANGES_FILE = path.join(__dirname, 'password_changes.json');

const LOCAL_DB_PATH = process.env.B2B_LOCAL_DB_PATH || '/var/lib/b2b-app/b2b_local.db';

let localAuthDb = null;

// ====================================================
// 🚀 0.1 - CACHE MEKANİZMASI
// ====================================================
const cache = new Map();
const CACHE_DURATION = {
    PRODUCTS: 15 * 60 * 1000,
    PRICES: 10 * 60 * 1000,
    CUSTOMER_INFO: 30 * 60 * 1000,
    STOCK: 2 * 60 * 1000,
    ORDERS: 5 * 60 * 1000,
    SUMMARY: 5 * 60 * 1000,
    EXCHANGE_RATES: 30 * 60 * 1000
};

const getCacheKey = (action, params) => {
    return `${action}_${JSON.stringify(params)}`;
};

const setCache = (key, data, duration) => {
    cache.set(key, {
        data,
        timestamp: Date.now(),
        duration
    });

};

const getCache = (key) => {
    const cached = cache.get(key);
    if (!cached) return null;
    
    const isExpired = Date.now() - cached.timestamp > cached.duration;
    if (isExpired) {
        cache.delete(key);
        return null;
    }
    
    return cached.data;
};

const getCacheConfig = (action) => {
    const cacheMap = {
        'products': { duration: CACHE_DURATION.PRODUCTS },
        'product-search': { duration: CACHE_DURATION.PRODUCTS },
        'prices': { duration: CACHE_DURATION.PRICES },
        'stock': { duration: CACHE_DURATION.STOCK },
        'customer-info': { duration: CACHE_DURATION.CUSTOMER_INFO },
        'summary': { duration: CACHE_DURATION.SUMMARY },
        'orders': { duration: CACHE_DURATION.ORDERS },
        'min-quantities': { duration: CACHE_DURATION.STOCK },
        'discounts': { duration: CACHE_DURATION.PRICES }
    };
    
    return cacheMap[action] || null;
};

// ====================================================
// 🚀 0.2 - CONNECTION POOL YÖNETİMİ
// ====================================================
// 1. Logo GO3 config
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

// 2. B2B_TRADE_PRO config
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

// 3. Connection Pool Yönetimi
let logoConnectionPool = null;
let b2bConnectionPool = null;

// Logo connection pool fonksiyonları
const initializeConnectionPool = async () => {
    if (logoConnectionPool && logoConnectionPool.connected) {
        return logoConnectionPool;
    }
    
    try {
        console.log('🔄 SQL Server bağlantısı başlatılıyor...');
        logoConnectionPool = await sql.connect(logoConfig);
        console.log('✅ SQL Server bağlantısı başarılı');
        
        logoConnectionPool.on('error', err => {
            console.error('❌ SQL Server bağlantı hatası:', err.message);
            logoConnectionPool = null;
        });
        
        return logoConnectionPool;
    } catch (err) {
        console.error('❌ SQL Server bağlantı başlatma hatası:', err.message);
        throw new Error(`Database bağlantı hatası: ${err.message}`);
    }
};

const getLogoConnection = async () => {
    try {
        if (!logoConnectionPool || !logoConnectionPool.connected) {
            logoConnectionPool = await initializeConnectionPool();
        }
        
        const request = logoConnectionPool.request();
        await request.query('SELECT 1 as test');
        
        return logoConnectionPool;
    } catch (err) {
        console.error('❌ Bağlantı test hatası, yeniden bağlanılıyor...', err.message);
        logoConnectionPool = null;
        return await initializeConnectionPool();
    }
};

// B2B connection pool fonksiyonu
const getB2BConnection = async () => {
    try {
        if (!b2bConnectionPool || !b2bConnectionPool.connected) {
            b2bConnectionPool = await sql.connect(b2bConfig);
            console.log('✅ B2B_TRADE_PRO bağlantısı başarılı');
            
            b2bConnectionPool.on('error', err => {
                console.error('❌ B2B_TRADE_PRO bağlantı hatası:', err.message);
                b2bConnectionPool = null;
            });
        }
        
        const request = b2bConnectionPool.request();
        await request.query('SELECT 1 as test');
        
        return b2bConnectionPool;
    } catch (err) {
        console.error('❌ B2B bağlantı test hatası, yeniden bağlanılıyor...', err.message);
        b2bConnectionPool = null;
        return await sql.connect(b2bConfig);
    }
};

// Config ve connection fonksiyonlarını export et
module.exports.config = {
    logoConfig,
    b2bConfig,
    getLogoConnection: async () => {
        if (!logoConnectionPool || !logoConnectionPool.connected) {
            logoConnectionPool = await sql.connect(logoConfig);
        }
        return logoConnectionPool;
    },
    getB2BConnection: async () => {
        if (!b2bConnectionPool || !b2bConnectionPool.connected) {
            b2bConnectionPool = await sql.connect(b2bConfig);
        }
        return b2bConnectionPool;
    }
};

module.exports.getLogoConnection = getLogoConnection;
module.exports.sql = sql;
module.exports.getCache = () => cache;



// ====================================================
// 🚀 0.3 - RATE LIMITING
// ====================================================
const generalLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 100,
    message: {
        success: false,
        error: 'Çok fazla istek gönderildi. Lütfen 1 dakika sonra tekrar deneyin.'
    }
});

const searchLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 50,
    message: {
        success: false, 
        error: 'Arama limitine ulaştınız. Lütfen 1 dakika sonra tekrar deneyin.'
    }
});

// ====================================================
// 🚀 0.4 - ÖZEL HATA SINIFLARI
// ====================================================
class LogoAPIError extends Error {
    constructor(message, action, details = null) {
        super(message);
        this.name = 'LogoAPIError';
        this.action = action;
        this.details = details;
        this.timestamp = new Date().toISOString();
    }
}

class ValidationError extends LogoAPIError {
    constructor(message, action, field) {
        super(message, action, { field });
        this.name = 'ValidationError';
    }
}

// ====================================================
// 🚀 0.5 - LOGGING SİSTEMİ
// ====================================================
const logger = {
    info: (message, data = {}) => {
        console.log(`📗 [INFO] ${new Date().toISOString()} - ${message}`, data);
    },
    error: (message, error = {}) => {
        console.error(`📕 [ERROR] ${new Date().toISOString()} - ${message}`, {
            error: error.message,
            stack: error.stack,
            action: error.action,
            details: error.details
        });
    },
    warn: (message, data = {}) => {
        console.warn(`📙 [WARN] ${new Date().toISOString()} - ${message}`, data);
    }
};

// ====================================================
// 🚀 0.6 - MIDDLEWARE AYARLARI
// ====================================================
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

// ====================================================
// 🚀 0.7 - DOSYA İŞLEMLERİ
// ====================================================
async function readUsersFile() {
    try {
        const data = await fs.readFile(USERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        const defaultUsers = {
            ADMIN: {
                password: await bcrypt.hash('YUNLU', 10),
                musteri_adi: 'Yönetici',
                rol: 'admin',
                email: 'admin@firma.com',
                aktif: true,
                ilk_giris: false,
                created_at: new Date().toISOString()
            },
            PLASIYER: {
                password: await bcrypt.hash('YUNLU', 10),
                musteri_adi: 'Satış Temsilcisi',
                rol: 'sales',
                email: 'sales@firma.com',
                aktif: true,
                ilk_giris: true,
                created_at: new Date().toISOString()
            }
        };
        await writeUsersFile(defaultUsers);
        return defaultUsers;
    }
}

async function writeUsersFile(users) {
    await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

async function readPasswordChangesFile() {
    try {
        const data = await fs.readFile(PASSWORD_CHANGES_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        const defaultChanges = {
            S1981: {
                degistirilemez: true,
                neden: 'Test müşterisi, şifre sabit kalacak'
            }
        };
        await writePasswordChangesFile(defaultChanges);
        return defaultChanges;
    }
}

async function writePasswordChangesFile(changes) {
    await fs.writeFile(PASSWORD_CHANGES_FILE, JSON.stringify(changes, null, 2), 'utf8');
}

function sqliteRun(db, sqlText, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sqlText, params, function(err) {
            if (err) return reject(err);
            resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}

function sqliteGet(db, sqlText, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sqlText, params, (err, row) => {
            if (err) return reject(err);
            resolve(row || null);
        });
    });
}

function sqliteAll(db, sqlText, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sqlText, params, (err, rows) => {
            if (err) return reject(err);
            resolve(rows || []);
        });
    });
}

async function getLocalAuthDb() {
    if (localAuthDb) return localAuthDb;
    localAuthDb = new sqlite3.Database(LOCAL_DB_PATH);
    await sqliteRun(localAuthDb, 'PRAGMA journal_mode = WAL');
    await sqliteRun(localAuthDb, 'PRAGMA foreign_keys = ON');
    await sqliteRun(localAuthDb, `
        CREATE TABLE IF NOT EXISTS auth_users (
            user_code TEXT PRIMARY KEY,
            role TEXT NOT NULL,
            password_hash TEXT,
            customer_name TEXT,
            email TEXT,
            active INTEGER NOT NULL DEFAULT 1,
            must_change_password INTEGER NOT NULL DEFAULT 0,
            locked_until TEXT,
            failed_attempts INTEGER NOT NULL DEFAULT 0,
            last_login_at TEXT,
            last_login_ip TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    `);

    const cols = await sqliteAll(localAuthDb, 'PRAGMA table_info(auth_users)');
    const colNames = new Set(cols.map(c => String(c.name)));
    if (!colNames.has('last_login_at')) {
        try {
            await sqliteRun(localAuthDb, 'ALTER TABLE auth_users ADD COLUMN last_login_at TEXT');
        } catch (e) {}
    }
    if (!colNames.has('last_login_ip')) {
        try {
            await sqliteRun(localAuthDb, 'ALTER TABLE auth_users ADD COLUMN last_login_ip TEXT');
        } catch (e) {}
    }

    await sqliteRun(localAuthDb, `
        CREATE INDEX IF NOT EXISTS idx_auth_users_role ON auth_users(role)
    `);
    return localAuthDb;
}

async function upsertAuthUser(user) {
    const db = await getLocalAuthDb();
    const now = new Date().toISOString();
    const createdAt = user.created_at || now;
    const updatedAt = now;
    await sqliteRun(
        db,
        `
        INSERT INTO auth_users
            (user_code, role, password_hash, customer_name, email, active, must_change_password, locked_until, failed_attempts, created_at, updated_at)
        VALUES
            (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_code) DO UPDATE SET
            role=excluded.role,
            password_hash=COALESCE(excluded.password_hash, auth_users.password_hash),
            customer_name=COALESCE(excluded.customer_name, auth_users.customer_name),
            email=COALESCE(excluded.email, auth_users.email),
            active=excluded.active,
            must_change_password=excluded.must_change_password,
            locked_until=excluded.locked_until,
            failed_attempts=excluded.failed_attempts,
            updated_at=excluded.updated_at
        `,
        [
            user.user_code,
            user.role,
            user.password_hash || null,
            user.customer_name || null,
            user.email || null,
            user.active ? 1 : 0,
            user.must_change_password ? 1 : 0,
            user.locked_until || null,
            Number.isFinite(user.failed_attempts) ? user.failed_attempts : 0,
            createdAt,
            updatedAt
        ]
    );
}

async function getAuthUser(userCode) {
    const db = await getLocalAuthDb();
    return await sqliteGet(db, 'SELECT * FROM auth_users WHERE user_code = ?', [userCode]);
}

async function setAuthUserPassword(userCode, passwordHash, mustChangePassword) {
    const db = await getLocalAuthDb();
    const now = new Date().toISOString();
    await sqliteRun(
        db,
        `
        UPDATE auth_users
        SET password_hash = ?, must_change_password = ?, failed_attempts = 0, locked_until = NULL, updated_at = ?
        WHERE user_code = ?
        `,
        [passwordHash, mustChangePassword ? 1 : 0, now, userCode]
    );
}

async function recordAuthFailure(userCode) {
    const db = await getLocalAuthDb();
    const now = new Date().toISOString();
    const user = await getAuthUser(userCode);
    const currentAttempts = user ? (parseInt(user.failed_attempts, 10) || 0) : 0;
    const nextAttempts = currentAttempts + 1;
    let lockedUntil = null;
    if (nextAttempts >= 10) {
        lockedUntil = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    } else if (nextAttempts >= 5) {
        lockedUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    }

    if (!user) return;

    await sqliteRun(
        db,
        `
        UPDATE auth_users
        SET failed_attempts = ?, locked_until = ?, updated_at = ?
        WHERE user_code = ?
        `,
        [nextAttempts, lockedUntil, now, userCode]
    );
}

async function resetAuthFailures(userCode) {
    const db = await getLocalAuthDb();
    const now = new Date().toISOString();
    await sqliteRun(
        db,
        `
        UPDATE auth_users
        SET failed_attempts = 0, locked_until = NULL, updated_at = ?
        WHERE user_code = ?
        `,
        [now, userCode]
    );
}

async function recordAuthSuccess(userCode, ipAddress) {
    const db = await getLocalAuthDb();
    const now = new Date().toISOString();
    await sqliteRun(
        db,
        `
        UPDATE auth_users
        SET last_login_at = ?, last_login_ip = ?, updated_at = ?
        WHERE user_code = ?
        `,
        [now, ipAddress || null, now, userCode]
    );
}

function isAdminFromRequest(req) {
    try {
        const userType = req.headers['x-user-type'];
        if (userType && String(userType).toLowerCase() === 'admin') return true;
        if (userType && String(userType) === '1') return true;

        const base64Data = req.headers['x-user-data-base64'];
        if (base64Data) {
            const decodedString = Buffer.from(base64Data, 'base64').toString('utf-8');
            const userData = JSON.parse(decodedString);
            const t = userData?.user_type ?? userData?.rol ?? userData?.role;
            return t === 'admin' || t === 1 || t === '1';
        }

        const userDataHeader = req.headers['x-user-data'];
        if (userDataHeader) {
            const userData = JSON.parse(userDataHeader);
            const t = userData?.user_type ?? userData?.rol ?? userData?.role;
            return t === 'admin' || t === 1 || t === '1';
        }
    } catch (e) {
        return false;
    }
    return false;
}

function requireAdmin(req, res, next) {
    if (isAdminFromRequest(req)) return next();
    return res.status(403).json({ success: false, error: 'Bu işlem için admin yetkisi gereklidir' });
}

// ====================================================
// 🚀 2.3 - ADMIN: SQLITE AUTH USERS MANAGEMENT
// ====================================================

app.get('/api/admin/auth-users', requireAdmin, async (req, res) => {
    try {
        const { q = '', role = '', active = '' } = req.query || {};
        const db = await getLocalAuthDb();

        const where = [];
        const params = [];

        if (role && String(role).trim()) {
            where.push('role = ?');
            params.push(String(role).trim());
        }

        if (active === '1' || active === '0') {
            where.push('active = ?');
            params.push(parseInt(active, 10));
        }

        if (q && String(q).trim()) {
            const term = `%${String(q).trim().toUpperCase()}%`;
            where.push('(UPPER(user_code) LIKE ? OR UPPER(COALESCE(customer_name, "")) LIKE ? OR UPPER(COALESCE(email, "")) LIKE ?)');
            params.push(term, term, term);
        }

        const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

        const rows = await sqliteAll(
            db,
            `
            SELECT
                user_code,
                role,
                customer_name,
                email,
                active,
                must_change_password,
                locked_until,
                failed_attempts,
                last_login_at,
                last_login_ip,
                created_at,
                updated_at
            FROM auth_users
            ${whereSql}
            ORDER BY updated_at DESC
            `,
            params
        );

        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('❌ Admin auth-users list error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/admin/auth-users', requireAdmin, async (req, res) => {
    try {
        const { user_code, role, email, customer_name, active = true, must_change_password = false, password } = req.body || {};
        if (!user_code || !role) {
            return res.status(400).json({ success: false, error: 'user_code ve role zorunludur' });
        }

        const code = String(user_code).toUpperCase().trim();
        const r = String(role).trim();

        let password_hash = null;
        if (password && String(password).trim()) {
            password_hash = await bcrypt.hash(String(password).toUpperCase().trim(), 10);
        }

        await upsertAuthUser({
            user_code: code,
            role: r,
            password_hash,
            customer_name: customer_name || null,
            email: email || null,
            active: active !== false,
            must_change_password: must_change_password === true || must_change_password === 1,
            locked_until: null,
            failed_attempts: 0,
            created_at: new Date().toISOString()
        });

        res.json({ success: true });
    } catch (error) {
        console.error('❌ Admin auth-users create error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/admin/auth-users/:userCode', requireAdmin, async (req, res) => {
    try {
        const userCode = String(req.params.userCode || '').toUpperCase().trim();
        const existing = await getAuthUser(userCode);
        if (!existing) {
            return res.status(404).json({ success: false, error: 'Kullanıcı bulunamadı' });
        }

        const { role, email, customer_name, active, must_change_password } = req.body || {};

        await upsertAuthUser({
            user_code: userCode,
            role: role ? String(role).trim() : existing.role,
            password_hash: null,
            customer_name: (customer_name !== undefined) ? customer_name : existing.customer_name,
            email: (email !== undefined) ? email : existing.email,
            active: (active === undefined) ? (existing.active === 1) : (active === true || active === 1),
            must_change_password: (must_change_password === undefined)
                ? (existing.must_change_password === 1)
                : (must_change_password === true || must_change_password === 1),
            locked_until: existing.locked_until,
            failed_attempts: parseInt(existing.failed_attempts, 10) || 0,
            created_at: existing.created_at
        });

        res.json({ success: true });
    } catch (error) {
        console.error('❌ Admin auth-users update error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/admin/auth-users/:userCode/reset-password', requireAdmin, async (req, res) => {
    try {
        const userCode = String(req.params.userCode || '').toUpperCase().trim();
        const { new_password, must_change_password = true } = req.body || {};
        if (!new_password || !String(new_password).trim()) {
            return res.status(400).json({ success: false, error: 'new_password zorunludur' });
        }

        const user = await getAuthUser(userCode);
        if (!user) {
            return res.status(404).json({ success: false, error: 'Kullanıcı bulunamadı' });
        }

        const hashed = await bcrypt.hash(String(new_password).toUpperCase().trim(), 10);
        await setAuthUserPassword(userCode, hashed, must_change_password === true || must_change_password === 1);
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Admin auth-users reset-password error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/admin/auth-users/:userCode/unlock', requireAdmin, async (req, res) => {
    try {
        const userCode = String(req.params.userCode || '').toUpperCase().trim();
        const db = await getLocalAuthDb();
        const now = new Date().toISOString();
        await sqliteRun(
            db,
            `
            UPDATE auth_users
            SET failed_attempts = 0, locked_until = NULL, updated_at = ?
            WHERE user_code = ?
            `,
            [now, userCode]
        );
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Admin auth-users unlock error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

async function migrateFileAuthToSqlite() {
    const db = await getLocalAuthDb();
    const existingAny = await sqliteGet(db, 'SELECT user_code FROM auth_users LIMIT 1');
    if (existingAny) return;

    let users = null;
    try {
        users = await readUsersFile();
    } catch (e) {
        users = null;
    }

    if (users && typeof users === 'object') {
        for (const [code, u] of Object.entries(users)) {
            if (!u) continue;
            await upsertAuthUser({
                user_code: code.toUpperCase(),
                role: u.rol || (code === 'ADMIN' ? 'admin' : (code.includes('PLASIYER') ? 'sales' : 'customer')),
                password_hash: u.password || null,
                customer_name: u.musteri_adi || null,
                email: u.email || null,
                active: u.aktif !== false,
                must_change_password: u.ilk_giris === true,
                created_at: u.created_at || new Date().toISOString()
            });
        }
    }

    let pwChanges = null;
    try {
        pwChanges = await readPasswordChangesFile();
    } catch (e) {
        pwChanges = null;
    }

    if (pwChanges && typeof pwChanges === 'object') {
        for (const [code, entry] of Object.entries(pwChanges)) {
            if (!entry || !entry.new_password) continue;
            const userCode = code.toUpperCase();
            const hashed = await bcrypt.hash(String(entry.new_password).toUpperCase().trim(), 10);
            await upsertAuthUser({
                user_code: userCode,
                role: 'customer',
                password_hash: hashed,
                customer_name: null,
                email: null,
                active: true,
                must_change_password: false,
                created_at: entry.changed_at || new Date().toISOString()
            });
        }
    }
}

// ====================================================
// 🚀 1.0 - SIP-000001 FİŞ NUMARASI FONKSİYONU (KORUNDU)
// ====================================================
async function getNextFicheNo() {
    try {
        console.log('🔍 Son SIP numarası kontrol ediliyor...');
        
        const pool = await getLogoConnection();
        const lastFicheRequest = pool.request();
        const lastFicheQuery = `
            SELECT TOP 1 FICHENO 
            FROM LG_013_01_ORFICHE 
            WHERE FICHENO LIKE 'SIP-%' 
            AND TRCODE = 1 
            ORDER BY FICHENO DESC
        `;
        
        const lastFicheResult = await lastFicheRequest.query(lastFicheQuery);
        
        let nextNumber = 1;
        
        if (lastFicheResult.recordset.length > 0) {
            const lastFicheNo = lastFicheResult.recordset[0].FICHENO;
            console.log('📊 Son SIP numarası:', lastFicheNo);
            
            const match = lastFicheNo.match(/SIP-(\d+)/);
            if (match) {
                const lastNumber = parseInt(match[1]);
                nextNumber = lastNumber + 1;
                console.log(`📈 Bir sonraki numara: ${lastNumber} + 1 = ${nextNumber}`);
            }
        } else {
            console.log('📊 Hiç SIP numarası bulunamadı, ilk numarayı kullanıyor: 1');
        }
        
        const paddedNumber = nextNumber.toString().padStart(6, '0');
        const sipFicheNo = `SIP-${paddedNumber}`;
        
        console.log('✅ Yeni SIP numarası:', sipFicheNo);
        
        return sipFicheNo;
        
    } catch (error) {
        console.error('❌ Son fiş numarası alınamadı:', error.message);
        const timestamp = Date.now().toString().slice(-6);
        return `SIP-${timestamp}`;
    }
}

// ====================================================
// 🚀 1.1 - İSKONTO SİSTEMİ FONKSİYONLARI (4 KATMAN - ADIM 1)
// ====================================================

// 1. KAMPANYA İSKONTOSU KONTROLÜ (ADIM 1 - BOŞ)
async function checkCampaignDiscount(itemRef) {
    // ADIM 1: Kampanya kontrolü YOK
    // ADIM 4: B2B Admin Panel'den kontrol edilecek
    return {
        hasCampaign: false,
        discountRate: 0,
        campaignName: ''
    };
}

// 2. MALZEME İSKONTOSU (ADIM 1 - SABİT %10)
async function getItemDiscountRate(itemRef, itemCode) {
    // ADIM 1: Sabit %10
    // ADIM 4: Varsayılan → B2B → Logo sırası
    console.log(`💰 Malzeme iskontosu (ADIM 1 - Sabit): ${itemCode} → %10`);
    return 10.0; // %10
}

// 3. ÜRETİCİ İSKONTOSU (ADIM 1 - SABİT %5)
async function getManufacturerDiscountRate(manufacturerCode) {
    // ADIM 1: Sabit %5 (tüm üreticiler)
    // ADIM 4: Varsayılan → B2B → Logo sırası
    console.log(`🏭 Üretici iskontosu (ADIM 1 - Sabit): ${manufacturerCode || 'Tüm'} → %5`);
    return 5.0; // %5
}

// 4. MÜŞTERİ İSKONTOSU (ADIM 1 - SABİT %20, %5)
async function getCustomerDiscountRates(customerRef) {
    // ADIM 1: Sabit %20, %5
    // ADIM 4: Varsayılan → B2B → Logo sırası
    console.log(`👤 Müşteri iskontosu (ADIM 1 - Sabit): %20, %5`);
    return [20.0, 5.0]; // %20, %5
}

// 5. TÜM İSKONTOLARI TOPLA (4 KATMAN)
async function getAllDiscountsForItem(itemRef, itemCode, manufacturerCode, customerRef) {
    console.log(`🔍 İskontolar hesaplanıyor: ${itemCode}`);
    
    // 1. KAMPANYA KONTROLÜ (ÖNCELİK 1 - OVERRIDE)
    const campaign = await checkCampaignDiscount(itemRef);
    if (campaign.hasCampaign) {
        console.log(`🎯 KAMPANYA VAR! Tüm iskontolar devre dışı. Sadece: %${campaign.discountRate}`);
        return {
            hasCampaign: true,
            discounts: [{
                type: 'CAMPAIGN',
                rate: campaign.discountRate,
                description: campaign.campaignName || 'Kampanya İndirimi'
            }],
            totalDiscountRate: campaign.discountRate
        };
    }
    
    // 2. MALZEME İSKONTOSU
    const itemDiscount = await getItemDiscountRate(itemRef, itemCode);
    
    // 3. ÜRETİCİ İSKONTOSU
    const manufacturerDiscount = await getManufacturerDiscountRate(manufacturerCode);
    
    // 4. MÜŞTERİ İSKONTOSU
    const customerDiscounts = await getCustomerDiscountRates(customerRef);
    
    // Tüm iskontoları topla
    const allDiscounts = [];
    let totalDiscountRate = 0;
    
    if (itemDiscount > 0) {
        allDiscounts.push({
            type: 'ITEM',
            rate: itemDiscount,
            description: 'Malzeme İskontosu'
        });
    }
    
    if (manufacturerDiscount > 0) {
        allDiscounts.push({
            type: 'MANUFACTURER',
            rate: manufacturerDiscount,
            description: 'Üretici İskontosu'
        });
    }
    
    if (customerDiscounts.length > 0) {
        customerDiscounts.forEach((rate, index) => {
            allDiscounts.push({
                type: 'CUSTOMER',
                rate: rate,
                description: `Müşteri İskontosu ${index + 1}`
            });
        });
    }
    
    // Toplam iskonto oranını hesapla (birleşik)
    let currentRate = 100;
    allDiscounts.forEach(discount => {
        const discountAmount = currentRate * (discount.rate / 100);
        currentRate -= discountAmount;
    });
    totalDiscountRate = 100 - currentRate;
    
    console.log(`📊 ${itemCode} iskonto özeti:`, {
        malzeme: `${itemDiscount}%`,
        uretici: `${manufacturerDiscount}%`,
        musteri: customerDiscounts.map(r => `${r}%`).join(', '),
        toplam: `${totalDiscountRate.toFixed(2)}%`,
        katman: allDiscounts.length
    });
    
    return {
        hasCampaign: false,
        discounts: allDiscounts,
        totalDiscountRate: totalDiscountRate
    };
}

// ====================================================
// 🚀 2.0 - GELİŞMİŞ LOGIN SİSTEMİ
// ====================================================
app.post('/api/auth/login', async (req, res) => {
    const startTime = Date.now();
    
    try {
        const { kullanici, sifre } = req.body;
        
        logger.info('Login denendi', { kullanici });

        if (!kullanici || !sifre) {
            throw new ValidationError('Kullanıcı adı ve şifre gereklidir', 'login', 'credentials');
        }

        const userCode = kullanici.toUpperCase().trim();
        const password = sifre.toUpperCase().trim();

        if (userCode === 'ADMIN') {
            console.log('🔐 ADMIN giriş denemesi');

            const adminUser = await getAuthUser('ADMIN');
            if (!adminUser || adminUser.active !== 1) {
                throw new LogoAPIError('Admin kullanıcısı bulunamadı', 'login', { userCode });
            }

            if (adminUser.locked_until && Date.parse(adminUser.locked_until) > Date.now()) {
                throw new LogoAPIError('Hesap geçici olarak kilitli', 'login', { userCode });
            }

            const passwordMatch = await bcrypt.compare(password, adminUser.password_hash);
            if (!passwordMatch) {
                await recordAuthFailure('ADMIN');
                throw new LogoAPIError('Geçersiz şifre', 'login', { userCode });
            }

            await resetAuthFailures('ADMIN');

            await recordAuthSuccess('ADMIN', req.ip);
            
            console.log('✅ ADMIN giriş başarılı');
            
            const userData = {
                kullanici: 'ADMIN',
                rol: 'admin',
                musteri_adi: 'Yönetici',
                cari_kodu: 'ADMIN',
                aktif: true,
                ilk_giris: false,
                isLogoUser: false
            };
            
            return res.json({
                success: true,
                message: 'Admin girişi başarılı',
                user: userData,
                redirect: 'admin',
                timestamp: new Date().toISOString(),
                responseTime: Date.now() - startTime
            });
        }

        if (userCode.includes('PLASIYER')) {
            console.log('🔐 PLASİYER giriş denemesi:', userCode);

            const plasiyerUser = await getAuthUser(userCode);
            if (!plasiyerUser) {
                throw new LogoAPIError('Plasiyer bulunamadı', 'login', { userCode });
            }

            if (plasiyerUser.active !== 1) {
                throw new LogoAPIError('Plasiyer aktif değil', 'login', { userCode });
            }

            if (plasiyerUser.locked_until && Date.parse(plasiyerUser.locked_until) > Date.now()) {
                throw new LogoAPIError('Hesap geçici olarak kilitli', 'login', { userCode });
            }

            const passwordMatch = await bcrypt.compare(password, plasiyerUser.password_hash);
            if (!passwordMatch) {
                await recordAuthFailure(userCode);
                throw new LogoAPIError('Geçersiz şifre', 'login', { userCode });
            }

            await resetAuthFailures(userCode);

            await recordAuthSuccess(userCode, req.ip);
            
            console.log('✅ PLASİYER giriş başarılı:', userCode);
            
            const userData = {
                kullanici: userCode,
                rol: 'sales',
                musteri_adi: plasiyerUser.customer_name,
                cari_kodu: userCode,
                aktif: true,
                ilk_giris: plasiyerUser.must_change_password === 1,
                isLogoUser: false
            };
            
            return res.json({
                success: true,
                message: 'Plasiyer girişi başarılı',
                user: userData,
                redirect: (plasiyerUser.must_change_password === 1) ? 'change-password' : 'sales',
                timestamp: new Date().toISOString(),
                responseTime: Date.now() - startTime
            });
        }

        console.log('🔐 LOGO MÜŞTERİ giriş denemesi:', userCode);
        
        if (!userCode.startsWith('S') && !userCode.startsWith('M')) {
            throw new ValidationError('Geçerli bir müşteri kodu giriniz (S veya M ile başlar)', 'login', 'userCode');
        }

        if (userCode === 'S1981') {
            if (password !== 'YUNLU') {
                throw new LogoAPIError('Geçersiz şifre', 'login', { userCode });
            }
        }

        const customerAuth = await getAuthUser(userCode);
        if (customerAuth && customerAuth.active !== 1) {
            throw new LogoAPIError('Müşteri aktif değil', 'login', { userCode });
        }

        if (customerAuth && customerAuth.locked_until && Date.parse(customerAuth.locked_until) > Date.now()) {
            throw new LogoAPIError('Hesap geçici olarak kilitli', 'login', { userCode });
        }

        if (customerAuth && customerAuth.password_hash) {
            const ok = await bcrypt.compare(password, customerAuth.password_hash);
            if (!ok) {
                await recordAuthFailure(userCode);
                throw new LogoAPIError('Geçersiz şifre', 'login', { userCode });
            }
            await resetAuthFailures(userCode);

            await recordAuthSuccess(userCode, req.ip);
        } else {
            if (password !== 'YUNLU') {
                throw new LogoAPIError('Geçersiz şifre', 'login', { userCode });
            }
        }

        const pool = await getLogoConnection();
        
        const query = `
            SELECT 
                LOGICALREF as id,
                CODE as CariKodu,
                DEFINITION_ as MusteriAdi,
                ADDR1 as Adres1,
                ADDR2 as Adres2,
                TOWN as Ilce,
                CITY as Sehir,
                TELNRS1 as Telefon,
                INCHARGE as Yetkili,
                SPECODE as OzelKod,
                CYPHCODE as BolgeKodu,
                ACTIVE as Aktif
                
            FROM LG_013_CLCARD 
            WHERE CODE = @userCode
            AND ACTIVE = 0
        `;

        const result = await pool.request()
            .input('userCode', sql.VarChar, userCode)
            .query(query);

        if (result.recordset.length === 0) {
            throw new LogoAPIError('Müşteri bulunamadı veya aktif değil', 'login', { userCode });
        }

        const customer = result.recordset[0];
        
        const isS1981 = userCode === 'S1981';

        let ilk_giris = false;
        if (!customerAuth || !customerAuth.password_hash) {
            ilk_giris = !isS1981;
        } else if (customerAuth.must_change_password === 1) {
            ilk_giris = true;
        }

        let redirect = 'customer';
        
        if (ilk_giris && !isS1981) {
            redirect = 'change-password';
        }

        try {
            await upsertAuthUser({
                user_code: userCode,
                role: 'customer',
                password_hash: null,
                customer_name: customer.MusteriAdi || null,
                email: null,
                active: true,
                must_change_password: (!isS1981 && ilk_giris),
                locked_until: (customerAuth && customerAuth.locked_until) ? customerAuth.locked_until : null,
                failed_attempts: (customerAuth && Number.isFinite(parseInt(customerAuth.failed_attempts, 10)))
                    ? (parseInt(customerAuth.failed_attempts, 10) || 0)
                    : 0,
                created_at: (customerAuth && customerAuth.created_at) ? customerAuth.created_at : new Date().toISOString()
            });
        } catch (e) {
            console.error('❌ auth_users müşteri upsert hatası:', e.message);
        }

        await recordAuthSuccess(userCode, req.ip);

        logger.info('Logo müşteri login başarılı', { 
            userCode, 
            customerName: customer.MusteriAdi,
            ilk_giris,
            isS1981
        });

        res.json({
            success: true,
            message: 'Giriş başarılı!',
            user: {
                kullanici: userCode,
                rol: 'customer',
                cari_kodu: userCode,
                musteri_adi: customer.MusteriAdi,
                adres: customer.Adres1,
                ilce: customer.Ilce,
                sehir: customer.Sehir,
                telefon: customer.Telefon,
                yetkili: customer.Yetkili,
                aktif: true,
                ilk_giris: ilk_giris,
                isLogoUser: true,
                isS1981: isS1981,
                // Ek müşteri bilgileri
                adres1: customer.Adres1,
                adres2: customer.Adres2,
                ozel_kod: customer.OzelKod,
                bolge_kodu: customer.BolgeKodu
            },
            redirect: redirect,
            timestamp: new Date().toISOString(),
            responseTime: Date.now() - startTime
        });

    } catch (error) {
        logger.error('Login hatası', error);
        
        const errorResponse = {
            success: false,
            error: error.message,
            action: 'login',
            timestamp: new Date().toISOString(),
            responseTime: Date.now() - startTime
        };

        if (error.details) {
            errorResponse.details = error.details;
        }

        let statusCode = 500;
        if (error instanceof ValidationError) statusCode = 400;
        if (error.message.includes('bulunamadı')) statusCode = 404;

        res.status(statusCode).json(errorResponse);
    }
});

// ====================================================
// 🚀 2.1 - ŞİFRE DEĞİŞTİRME ENDPOINT'İ
// ====================================================
app.post('/api/auth/change-password', async (req, res) => {
    const startTime = Date.now();
    
    try {
        const { kullanici, mevcut_sifre, yeni_sifre, yeni_sifre_tekrar } = req.body;
        
        logger.info('Şifre değiştirme isteği', { kullanici });

        if (!kullanici || !mevcut_sifre || !yeni_sifre || !yeni_sifre_tekrar) {
            throw new ValidationError('Tüm alanlar gereklidir', 'change-password', 'fields');
        }

        if (yeni_sifre !== yeni_sifre_tekrar) {
            throw new ValidationError('Yeni şifreler eşleşmiyor', 'change-password', 'password_match');
        }

        if (yeni_sifre.length < 4) {
            throw new ValidationError('Şifre en az 4 karakter olmalıdır', 'change-password', 'password_length');
        }

        const userCode = kullanici.toUpperCase().trim();
        const currentPassword = mevcut_sifre.toUpperCase().trim();
        const newPassword = yeni_sifre.toUpperCase().trim();

        if (userCode === 'S1981') {
            throw new LogoAPIError('S1981 müşterisinin şifresi değiştirilemez', 'change-password', { 
                userCode,
                reason: 'Test müşterisi'
            });
        }

        if (userCode === 'ADMIN' || userCode.includes('PLASIYER')) {
            const user = await getAuthUser(userCode);
            if (!user) {
                throw new LogoAPIError('Kullanıcı bulunamadı', 'change-password', { userCode });
            }

            const passwordMatch = await bcrypt.compare(currentPassword, user.password_hash);
            if (!passwordMatch) {
                throw new LogoAPIError('Mevcut şifre hatalı', 'change-password', { userCode });
            }

            const hashedPassword = await bcrypt.hash(newPassword, 10);
            await setAuthUserPassword(userCode, hashedPassword, false);

            console.log('✅ Admin/Plasiyer şifre değiştirildi:', userCode);

            return res.json({
                success: true,
                message: 'Şifre başarıyla değiştirildi!',
                timestamp: new Date().toISOString(),
                responseTime: Date.now() - startTime
            });
        }

        if (!userCode.startsWith('S') && !userCode.startsWith('M')) {
            throw new ValidationError('Geçerli bir müşteri kodu giriniz (S veya M ile başlar)', 'change-password', 'userCode');
        }

        const pool = await getLogoConnection();
        const query = `
            SELECT 
                LOGICALREF as id,
                CODE as CariKodu,
                DEFINITION_ as MusteriAdi,
                ACTIVE as Aktif
            FROM LG_013_CLCARD 
            WHERE CODE = @userCode
            AND ACTIVE = 0
        `;

        const result = await pool.request()
            .input('userCode', sql.VarChar, userCode)
            .query(query);

        if (result.recordset.length === 0) {
            throw new LogoAPIError('Müşteri bulunamadı veya aktif değil', 'change-password', { userCode });
        }

        const authUser = await getAuthUser(userCode);
        if (authUser && authUser.password_hash) {
            const match = await bcrypt.compare(currentPassword, authUser.password_hash);
            if (!match) {
                throw new LogoAPIError('Mevcut şifre hatalı', 'change-password', { userCode });
            }
        } else {
            if (currentPassword !== 'YUNLU') {
                throw new LogoAPIError('Mevcut şifre hatalı', 'change-password', { userCode });
            }
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await upsertAuthUser({
            user_code: userCode,
            role: 'customer',
            password_hash: hashedPassword,
            customer_name: result.recordset[0].MusteriAdi,
            email: null,
            active: true,
            must_change_password: false,
            created_at: authUser ? authUser.created_at : new Date().toISOString()
        });
        await resetAuthFailures(userCode);

        console.log('✅ Müşteri şifre değiştirildi:', userCode);

        return res.json({
            success: true,
            message: 'Şifre başarıyla değiştirildi!',
            timestamp: new Date().toISOString(),
            responseTime: Date.now() - startTime
        });

    } catch (error) {
        logger.error('Şifre değiştirme hatası', error);
        
        const errorResponse = {
            success: false,
            error: error.message,
            action: 'change-password',
            timestamp: new Date().toISOString(),
            responseTime: Date.now() - startTime
        };

        if (error.details) {
            errorResponse.details = error.details;
        }

        let statusCode = 500;
        if (error instanceof ValidationError) statusCode = 400;
        if (error.message.includes('değiştirilemez')) statusCode = 403;

        res.status(statusCode).json(errorResponse);
    }
});

// ====================================================
// 🚀 2.2 - ŞİFRE KONTROL ENDPOINT'İ
// ====================================================
app.post('/api/auth/check-password', async (req, res) => {
    try {
        const { kullanici, sifre } = req.body;
        
        if (!kullanici || !sifre) {
            return res.json({ success: false, error: 'Kullanıcı adı ve şifre gereklidir' });
        }

        const userCode = kullanici.toUpperCase().trim();
        const password = sifre.toUpperCase().trim();

        if (userCode === 'S1981') {
            if (password === 'YUNLU') {
                return res.json({ 
                    success: true, 
                    password_changed: false,
                    message: 'S1981 müşterisi için şifre değiştirilemez'
                });
            }
            return res.json({ success: false, error: 'Geçersiz şifre' });
        }

        const authUser = await getAuthUser(userCode);
        if (authUser && authUser.active !== 1) {
            return res.json({ success: false, error: 'Kullanıcı aktif değil' });
        }

        if (authUser && authUser.locked_until && Date.parse(authUser.locked_until) > Date.now()) {
            return res.json({ success: false, error: 'Hesap geçici olarak kilitli' });
        }

        if (authUser && authUser.password_hash) {
            const ok = await bcrypt.compare(password, authUser.password_hash);
            if (!ok) {
                await recordAuthFailure(userCode);
                return res.json({ success: false, error: 'Geçersiz şifre' });
            }
            await resetAuthFailures(userCode);
            return res.json({
                success: true,
                password_changed: true,
                first_login: authUser.must_change_password === 1,
                requires_password_change: authUser.must_change_password === 1
            });
        }

        if (password === 'YUNLU') {
            return res.json({
                success: true,
                password_changed: false,
                first_login: true,
                requires_password_change: true
            });
        }

        return res.json({ success: false, error: 'Geçersiz şifre' });

    } catch (error) {
        console.error('Şifre kontrol hatası:', error);
        res.status(500).json({ success: false, error: 'Sunucu hatası' });
    }
});

// ====================================================
// 🚀 3.0 - MERKEZİ API ENDPOINT
// ====================================================
app.get('/api/logo/data', generalLimiter, async (req, res) => {
    const startTime = Date.now();
    
    try {
        const { action, search, page = 1, limit = 50, customerCode, itemCode } = req.query;
        
        if (!action) {
            throw new ValidationError('Action parametresi gereklidir', 'validation', 'action');
        }

        const cacheKey = getCacheKey(action, { search, page, limit, customerCode, itemCode });
        const cacheConfig = getCacheConfig(action);
        
        if (cacheConfig) {
            const cachedData = getCache(cacheKey);
            if (cachedData) {
                return res.json({
                    ...cachedData,
                    cached: true,
                    responseTime: Date.now() - startTime
                });
            }
        }

        const pool = await getLogoConnection();
        let result;
        const offset = (page - 1) * limit;

        logger.info('API isteği başlatıldı', { action, search, page, limit, customerCode, itemCode });

        if (action === 'products') {
            const query = `
                SELECT 
                    I.LOGICALREF as id,
                    I.CODE as MalzemeKodu,
                    I.NAME as MalzemeAdi,
                    I.PRODUCERCODE as OEMKodu,
                    I.STGRPCODE as Uretici,
                    I.SPECODE as AracModeli,
                    I.SPECODE2 as MerkezRaf,
                    I.SPECODE3 as BostanciRaf,
                    I.SPECODE4 as IkitelliRaf,
                    I.ACTIVE as Aktif,
                    
                    ISNULL(SUM(CASE WHEN S.INVENNO = 0 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) as MerkezStok,
                    ISNULL(SUM(CASE WHEN S.INVENNO = 1 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) as IkitelliStok,
                    ISNULL(SUM(CASE WHEN S.INVENNO = 2 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) as BostanciStok,
                    ISNULL(SUM(CASE WHEN S.INVENNO = 3 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) as DepoStok,
                    ISNULL(SUM(S.ONHAND - S.RESERVED), 0) as ToplamStok
                    
                FROM LG_013_ITEMS I
                LEFT JOIN LV_013_01_STINVTOT S ON S.STOCKREF = I.LOGICALREF
                WHERE I.ACTIVE = 0
                GROUP BY I.LOGICALREF, I.CODE, I.NAME, I.PRODUCERCODE, I.STGRPCODE, 
                         I.SPECODE, I.SPECODE2, I.SPECODE3, I.SPECODE4, I.ACTIVE
                ORDER BY I.CODE
                OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY
            `;
            result = await pool.request().query(query);
        }
        else if (action === 'product-search') {
            if (!search || search.trim().length < 2) {
                throw new ValidationError('Arama terimi en az 2 karakter olmalıdır', 'product-search', 'search');
            }

            const query = `
                SELECT 
                    I.LOGICALREF as id,
                    I.CODE as MalzemeKodu,
                    I.NAME as MalzemeAdi,
                    I.PRODUCERCODE as OEMKodu,
                    I.STGRPCODE as Uretici,
                    I.SPECODE as AracModeli,
                    
                    ISNULL(SUM(CASE WHEN S.INVENNO = 0 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) as MerkezStok,
                    ISNULL(SUM(CASE WHEN S.INVENNO = 1 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) as IkitelliStok,
                    ISNULL(SUM(CASE WHEN S.INVENNO = 2 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) as BostanciStok,
                    ISNULL(SUM(S.ONHAND - S.RESERVED), 0) as ToplamStok
                    
                FROM LG_013_ITEMS I
                LEFT JOIN LV_013_01_STINVTOT S ON S.STOCKREF = I.LOGICALREF
                WHERE I.ACTIVE = 0
                AND (I.CODE LIKE '%' + @search + '%' OR I.PRODUCERCODE LIKE '%' + @search + '%')
                GROUP BY I.LOGICALREF, I.CODE, I.NAME, I.PRODUCERCODE, I.STGRPCODE, I.SPECODE
                ORDER BY I.CODE
                OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY
            `;
            result = await pool.request()
                .input('search', sql.VarChar, search.trim())
                .query(query);
        }
        else if (action === 'prices') {
            const query = `
                SELECT 
                    I.CODE as MalzemeKodu,
                    I.NAME as MalzemeAdi,
                    P.PRICE as BirimFiyat,
                    P.CURRENCY as DovizKodu,
                    CASE P.CURRENCY 
                        WHEN 1 THEN 'USD'
                        WHEN 20 THEN 'EUR' 
                        WHEN 17 THEN 'GBP'
                        WHEN 160 THEN 'TL'
                    END as DovizAdi,
                    P.PTYPE as FiyatTipi
                    
                FROM LG_013_ITEMS I
                INNER JOIN LG_013_PRCLIST P ON P.CARDREF = I.LOGICALREF
                WHERE P.ACTIVE = 0 
                AND P.PRIORITY = 0
                AND I.ACTIVE = 0
                ORDER BY I.CODE
            `;
            result = await pool.request().query(query);
        }
        else if (action === 'stock') {
            if (!itemCode) {
                throw new ValidationError('Malzeme kodu gereklidir', 'stock', 'itemCode');
            }

            const query = `
                SELECT 
                    I.CODE as MalzemeKodu,
                    I.NAME as MalzemeAdi,
                    SUM(CASE WHEN S.INVENNO = 0 THEN S.ONHAND - S.RESERVED ELSE 0 END) as MerkezStok,
                    SUM(CASE WHEN S.INVENNO = 1 THEN S.ONHAND - S.RESERVED ELSE 0 END) as IkitelliStok,
                    SUM(CASE WHEN S.INVENNO = 2 THEN S.ONHAND - S.RESERVED ELSE 0 END) as BostanciStok,
                    SUM(S.ONHAND - S.RESERVED) as ToplamStok
                    
                FROM LG_013_ITEMS I
                LEFT JOIN LV_013_01_STINVTOT S ON S.STOCKREF = I.LOGICALREF
                WHERE I.CODE = @itemCode
                GROUP BY I.CODE, I.NAME
            `;
            result = await pool.request()
                .input('itemCode', sql.VarChar, itemCode)
                .query(query);
        }
        else if (action === 'customer-info') {
            if (!customerCode) {
                throw new ValidationError('Müşteri kodu gereklidir', 'customer-info', 'customerCode');
            }

            const query = `
                SELECT 
                    LOGICALREF as MusteriRef,
                    CODE as CariKodu,
                    DEFINITION_ as MusteriAdi,
                    ADDR1 as Adres1,
                    ADDR2 as Adres2,
                    TOWN as Ilce,
                    CITY as Sehir,
                    TELNRS1 as Telefon,
                    INCHARGE as Yetkili,
                    SPECODE as OzelKod,
                    CYPHCODE as BolgeKodu,
                    EMAILADDR as Email,
                    TAXNR as VergiNo,
                    TAXOFFICE as VergiDairesi,
                    POSTCODE as PostaKodu,
                    COUNTRY as Ulke
                    
                FROM LG_013_CLCARD 
                WHERE CODE = @customerCode
                AND ACTIVE = 0
            `;
            result = await pool.request()
                .input('customerCode', sql.VarChar, customerCode)
                .query(query);
        }
        else if (action === 'summary') {
            if (!customerCode) {
                throw new ValidationError('Müşteri kodu gereklidir', 'summary', 'customerCode');
            }

            const customerResult = await pool.request()
                .input('customerCode', sql.VarChar, customerCode)
                .query('SELECT LOGICALREF FROM LG_013_CLCARD WHERE CODE = @customerCode AND ACTIVE = 0');

            if (customerResult.recordset.length === 0) {
                throw new LogoAPIError('Müşteri bulunamadı', 'summary', { customerCode });
            }

            const customerRef = customerResult.recordset[0].LOGICALREF;

            const query = `
                SELECT 
                    SUM(CASE WHEN DEBIT > 0 THEN DEBIT ELSE 0 END) as ToplamBorc,
                    SUM(CASE WHEN CREDIT > 0 THEN CREDIT ELSE 0 END) as ToplamAlacak,
                    SUM(DEBIT - CREDIT) as Bakiye,
                    MAX(DATE_) as SonIslemTarihi,
                    COUNT(*) as IslemSayisi
                    
                FROM LG_013_01_CLFLINE 
                WHERE CLIENTREF = @customerRef
                AND DATE_ >= DATEADD(MONTH, -3, GETDATE())
            `;
            result = await pool.request()
                .input('customerRef', sql.Int, customerRef)
                .query(query);
        }
        else if (action === 'orders') {
            if (!customerCode) {
                throw new ValidationError('Müşteri kodu gereklidir', 'orders', 'customerCode');
            }

            const customerResult = await pool.request()
                .input('customerCode', sql.VarChar, customerCode)
                .query('SELECT LOGICALREF FROM LG_013_CLCARD WHERE CODE = @customerCode AND ACTIVE = 0');

            if (customerResult.recordset.length === 0) {
                throw new LogoAPIError('Müşteri bulunamadı', 'orders', { customerCode });
            }

            const customerRef = customerResult.recordset[0].LOGICALREF;

            const query = `
                SELECT 
                    O.LOGICALREF as SiparisRef,
                    O.FICHENO as SiparisNo,
                    O.DATE_ as SiparisTarihi,
                    C.DEFINITION_ as MusteriAdi,
                    OL.AMOUNT as Miktar,
                    I.CODE as MalzemeKodu,
                    I.NAME as MalzemeAdi,
                    O.SOURCEINDEX as AmbarKodu,
                    CASE 
                        WHEN OL.CLOSED = 1 THEN 'Tamamlandı'
                        WHEN OL.CLOSED = 0 THEN 'Açık'
                        ELSE 'Bilinmiyor'
                    END as Durum
                    
                FROM LG_013_01_ORFICHE O
                INNER JOIN LG_013_01_ORFLINE OL ON OL.ORDFICHEREF = O.LOGICALREF
                INNER JOIN LG_013_ITEMS I ON I.LOGICALREF = OL.STOCKREF
                INNER JOIN LG_013_CLCARD C ON C.LOGICALREF = O.CLIENTREF
                WHERE O.CLIENTREF = @customerRef
                AND O.TRCODE = 12
                ORDER BY O.DATE_ DESC
                OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY
            `;
            result = await pool.request()
                .input('customerRef', sql.Int, customerRef)
                .query(query);
        }
        else if (action === 'min-quantities') {
            result = { recordset: [] };
        }
        else if (action === 'discounts') {
            result = { recordset: [] };
        }
        else {
            throw new ValidationError('Geçersiz action parametresi', 'validation', 'action');
        }

        const responseData = {
            success: true,
            action: action,
            data: result.recordset,
            total: result.recordset.length,
            page: parseInt(page),
            limit: parseInt(limit),
            timestamp: new Date().toISOString(),
            responseTime: Date.now() - startTime
        };

        if (cacheConfig) {
            try {
                setCache(cacheKey, responseData, cacheConfig.duration);
            } catch (cacheError) {
                logger.warn('Cache kaydetme hatası', cacheError);
            }
        }

        logger.info('API isteği başarılı', { 
            action, 
            responseTime: responseData.responseTime,
            recordCount: result.recordset.length 
        });

        res.json(responseData);

    } catch (error) {
        const responseTime = Date.now() - startTime;
        logger.error('API isteği hatası', error);
        
        const errorResponse = {
            success: false,
            error: error.message,
            action: req.query.action,
            timestamp: new Date().toISOString(),
            responseTime: responseTime
        };

        if (error.details) {
            errorResponse.details = error.details;
        }

        let statusCode = 500;
        if (error instanceof ValidationError) statusCode = 400;
        if (error instanceof LogoAPIError && error.message.includes('bulunamadı')) statusCode = 404;

        res.status(statusCode).json(errorResponse);
    }
});

// ====================================================
// 🚀 4.0 - 4 KATMANLI İSKONTO SİSTEMİ İLE SIPARIŞ OLUŞTURMA (ADIM 1)
// ====================================================
app.post('/api/logo/create-order', generalLimiter, async (req, res) => {
    const startTime = Date.now();
    let transaction;
    
    try {
        const { customerCode, items, orderNote, b2bOrderNo } = req.body;

        console.log('🚀 SIPARIŞ İSTEĞİ (4 KATMANLI İSKONTO - ADIM 1):', { 
            customerCode, 
            itemCount: items?.length, 
            b2bOrderNo,
            orderNote 
        });

        // Validasyon
        if (!customerCode) {
            throw new ValidationError('Müşteri kodu gereklidir', 'create-order', 'customerCode');
        }
        
        if (!items || !Array.isArray(items) || items.length === 0) {
            throw new ValidationError('Malzeme listesi gereklidir ve en az 1 ürün içermelidir', 'create-order', 'items');
        }

        const pool = await getLogoConnection();
        transaction = new sql.Transaction(pool);
        
        await transaction.begin();

        // 1. MÜŞTERİ BUL
        console.log('🔍 Müşteri kontrolü:', customerCode);
        const customerRequest = new sql.Request(transaction);
        customerRequest.input('customerCode', sql.VarChar, customerCode);
        const customerResult = await customerRequest.query(`
            SELECT LOGICALREF, CODE, DEFINITION_, CYPHCODE 
            FROM LG_013_CLCARD 
            WHERE CODE = @customerCode AND ACTIVE = 0
        `);

        if (customerResult.recordset.length === 0) {
            throw new LogoAPIError('Müşteri bulunamadı veya aktif değil', 'create-order', { customerCode });
        }

        const customer = customerResult.recordset[0];
        const customerRef = customer.LOGICALREF;
        console.log('✅ Müşteri bulundu:', { ref: customerRef, name: customer.DEFINITION_ });

        // 2. FİŞ NUMARASI AL (MEVCUT SİSTEM)
        const sipFicheNo = await getNextFicheNo();
        console.log('🎯 SIP Fiche No:', sipFicheNo);

        // 3. TÜM MALZEMELERİ VE İSKONTOLARI HESAPLA
        console.log('🧮 Tüm malzemeler ve iskontolar hesaplanıyor...');
        
        let brutTotal = 0;
        let totalDiscounts = 0;
        const itemDetails = [];

        for (const item of items) {
            const malzemeKodu = item.code || item.itemCode;
            const quantity = item.quantity || 1;
            let unitPrice = item.unitPrice || 0;

            // Malzeme referansını ve üreticisini bul
            const itemRequest = new sql.Request(transaction);
            itemRequest.input('itemCode', sql.VarChar, malzemeKodu);
            const itemResult = await itemRequest.query(`
                SELECT LOGICALREF, CODE, NAME, STGRPCODE 
                FROM LG_013_ITEMS 
                WHERE CODE = @itemCode AND ACTIVE = 0
            `);

            if (itemResult.recordset.length === 0) {
                throw new LogoAPIError('Malzeme bulunamadı: ' + malzemeKodu, 'create-order', { 
                    itemCode: malzemeKodu
                });
            }

            const product = itemResult.recordset[0];
            const manufacturerCode = product.STGRPCODE; // Üretici kodu
            
            // Eğer fiyat 0 ise, fiyat listesinden al
            if (unitPrice === 0) {
                const priceRequest = new sql.Request(transaction);
                priceRequest.input('itemRef', sql.Int, product.LOGICALREF);
                const priceResult = await priceRequest.query(`
                    SELECT TOP 1 PRICE
                    FROM LG_013_PRCLIST 
                    WHERE CARDREF = @itemRef
                    AND ACTIVE = 0
                    AND GETDATE() BETWEEN ISNULL(BEGDATE, '1900-01-01') AND ISNULL(ENDDATE, '2100-12-31')
                    ORDER BY PRIORITY, BEGDATE DESC
                `);
                
                if (priceResult.recordset.length > 0) {
                    unitPrice = priceResult.recordset[0].PRICE;
                    console.log(`💰 ${malzemeKodu} fiyatı bulundu:`, unitPrice);
                } else {
                    console.warn(`⚠️ ${malzemeKodu} için fiyat bulunamadı, 100 TL varsayıldı`);
                    unitPrice = 100;
                }
            }

            const itemBrutTotal = unitPrice * quantity;
            brutTotal += itemBrutTotal;

            // 4 KATMANLI İSKONTOLARI HESAPLA
            const discountInfo = await getAllDiscountsForItem(
                product.LOGICALREF,
                product.CODE,
                manufacturerCode,
                customerRef
            );

            // İskonto tutarlarını hesapla
            let itemNetTotal = itemBrutTotal;
            const itemDiscounts = [];

            if (discountInfo.hasCampaign) {
                // KAMPANYA VARSA: Sadece kampanya iskontosu
                const campaignDiscount = discountInfo.discounts[0];
                const discountAmount = itemBrutTotal * (campaignDiscount.rate / 100);
                itemNetTotal -= discountAmount;
                totalDiscounts += discountAmount;
                
                itemDiscounts.push({
                    type: campaignDiscount.type,
                    rate: campaignDiscount.rate,
                    amount: discountAmount,
                    description: campaignDiscount.description
                });
                
                console.log(`   🎯 ${malzemeKodu}: KAMPANYA %${campaignDiscount.rate} = ${discountAmount.toFixed(2)} TL`);
            } else if (discountInfo.discounts.length > 0) {
                // NORMAL İSKONTOLAR
                let currentAmount = itemBrutTotal;
                
                for (const discount of discountInfo.discounts) {
                    const discountAmount = currentAmount * (discount.rate / 100);
                    currentAmount -= discountAmount;
                    totalDiscounts += discountAmount;
                    
                    itemDiscounts.push({
                        type: discount.type,
                        rate: discount.rate,
                        amount: discountAmount,
                        description: discount.description
                    });
                    
                    console.log(`   ${discount.type === 'ITEM' ? '📦' : discount.type === 'MANUFACTURER' ? '🏭' : '👤'} ${malzemeKodu}: ${discount.description} %${discount.rate} = ${discountAmount.toFixed(2)} TL`);
                }
                
                itemNetTotal = currentAmount;
            }

            itemDetails.push({
                ref: product.LOGICALREF,
                code: product.CODE,
                name: product.NAME,
                manufacturer: manufacturerCode,
                quantity: quantity,
                unitPrice: unitPrice,
                brutTotal: itemBrutTotal,
                netTotal: itemNetTotal,
                discounts: itemDiscounts,
                totalDiscountAmount: itemBrutTotal - itemNetTotal
            });
        }

        const netTotal = brutTotal - totalDiscounts;
        const vatRate = 20;
        const vatAmount = netTotal * (vatRate / 100);
        const grandTotal = netTotal + vatAmount;

        console.log('📈 GENEL HESAPLAMALAR:');
        console.log('  Toplam Brüt:', brutTotal.toFixed(2), 'TL');
        console.log('  Toplam İndirim:', totalDiscounts.toFixed(2), 'TL');
        console.log('  Net Tutar (KDV Matrahı):', netTotal.toFixed(2), 'TL');
        console.log('  KDV (%20):', vatAmount.toFixed(2), 'TL');
        console.log('  Genel Toplam:', grandTotal.toFixed(2), 'TL');

        // 4. ORFICHE KAYDI (SIP-000005 FORMATI)
        console.log('📝 ORFICHE kaydı oluşturuluyor...');
        
        const currentDate = new Date();
        const currentTime = (currentDate.getHours() * 10000) + 
                           (currentDate.getMinutes() * 100) + 
                           currentDate.getSeconds();

        const orficheRequest = new sql.Request(transaction);
        const orficheQuery = `
            INSERT INTO LG_013_01_ORFICHE (
                TRCODE, FICHENO, DATE_, TIME_, DOCODE, 
                CLIENTREF, SOURCEINDEX, SOURCECOSTGRP, STATUS,
                CAPIBLOCK_CREATEDBY, CAPIBLOCK_CREADEDDATE, CAPIBLOCK_CREATEDHOUR, CAPIBLOCK_CREATEDMIN,
                GENEXCTYP, LINEEXCTYP, SITEID, RECSTATUS, ORGLOGOID,
                TRCURR, TRRATE, TRNET, UPDCURR, REPORTRATE,
                TOTALDISCOUNTS, TOTALDISCOUNTED, TOTALVAT, GROSSTOTAL, NETTOTAL,
                PAYDEFREF, TEXTINC, SPECODE, CYPHCODE, DEPARTMENT, BRANCH,
                PRINTCNT, PRINTDATE, SENDCNT
            )
            OUTPUT INSERTED.LOGICALREF
            VALUES (
                @trCode, @ficheNo, @date, @time, @docode,
                @clientRef, @sourceIndex, @sourceCostGrp, @status,
                @createdBy, @createdDate, @createdHour, @createdMin,
                @genExcTyp, @lineExcTyp, @siteId, @recStatus, @orgLogoId,
                @trCurr, @trRate, @trNet, @updCurr, @reportRate,
                @totalDiscounts, @totalDiscounted, @totalVat, @grossTotal, @netTotal,
                @paydefRef, @textInc, @specode, @cyphcode, @department, @branch,
                @printCnt, @printDate, @sendCnt
            )
        `;

        orficheRequest.input('trCode', sql.SmallInt, 1);
        orficheRequest.input('ficheNo', sql.VarChar, sipFicheNo);
        orficheRequest.input('date', sql.DateTime, currentDate);
        orficheRequest.input('time', sql.Int, currentTime);
        orficheRequest.input('docode', sql.VarChar, '');
        orficheRequest.input('clientRef', sql.Int, customerRef);
        orficheRequest.input('sourceIndex', sql.SmallInt, 1);
        orficheRequest.input('sourceCostGrp', sql.SmallInt, 1);
        orficheRequest.input('status', sql.SmallInt, 4);
        orficheRequest.input('createdBy', sql.SmallInt, 29);
        orficheRequest.input('createdDate', sql.DateTime, currentDate);
        orficheRequest.input('createdHour', sql.SmallInt, currentDate.getHours());
        orficheRequest.input('createdMin', sql.SmallInt, currentDate.getMinutes());
        orficheRequest.input('genExcTyp', sql.SmallInt, 1);
        orficheRequest.input('lineExcTyp', sql.SmallInt, 0);
        orficheRequest.input('siteId', sql.SmallInt, 0);
        orficheRequest.input('recStatus', sql.SmallInt, 0);
        orficheRequest.input('orgLogoId', sql.VarChar, null);
        orficheRequest.input('trCurr', sql.SmallInt, 0);
        orficheRequest.input('trRate', sql.Float, 0.0);
        orficheRequest.input('trNet', sql.Float, grandTotal);
        orficheRequest.input('updCurr', sql.SmallInt, 0);
        orficheRequest.input('reportRate', sql.Float, 42.4369);
        orficheRequest.input('totalDiscounts', sql.Float, totalDiscounts);
        orficheRequest.input('totalDiscounted', sql.Float, netTotal); // NET TUTAR
        orficheRequest.input('totalVat', sql.Float, vatAmount);
        orficheRequest.input('grossTotal', sql.Float, brutTotal);
        orficheRequest.input('netTotal', sql.Float, grandTotal); // GENEL TOPLAM
        orficheRequest.input('paydefRef', sql.Int, 15);
        orficheRequest.input('textInc', sql.SmallInt, 0);
        orficheRequest.input('specode', sql.VarChar, '');
        orficheRequest.input('cyphcode', sql.VarChar, '');
        orficheRequest.input('department', sql.SmallInt, 0);
        orficheRequest.input('branch', sql.SmallInt, 0);
        orficheRequest.input('printCnt', sql.SmallInt, 0);
        orficheRequest.input('printDate', sql.DateTime, null);
        orficheRequest.input('sendCnt', sql.SmallInt, 0);

        const orficheResult = await orficheRequest.query(orficheQuery);
        const orderRef = orficheResult.recordset[0].LOGICALREF;
        console.log('✅ ORFICHE kaydı başarılı! Ref:', orderRef);

        // 5. MALZEME VE İSKONTO SATIRLARI (4 KATMAN)
        console.log('📦 Malzeme ve iskonto satırları oluşturuluyor...');
        
        let lineNo = 10;
        
        for (const item of itemDetails) {
            // MALZEME SATIRI
            console.log(`   📦 ${item.code} malzeme satırı (${lineNo})`);
            
            const malzemeRequest = new sql.Request(transaction);
            const malzemeQuery = `
                INSERT INTO LG_013_01_ORFLINE (
                    ORDFICHEREF, STOCKREF, LINETYPE, DETLINE, LINENO_, TRCODE, DATE_, TIME_,
                    AMOUNT, PRICE, TOTAL, 
                    VAT, VATAMNT, VATMATRAH,
                    UOMREF, USREF,
                    UINFO1, UINFO2, VATINC,
                    SOURCEINDEX, STATUS, CLIENTREF,
                    SHIPPEDAMOUNT, CLOSED,
                    RESERVEAMOUNT, DORESERVE, RESERVEDATE,
                    SITEID, RECSTATUS,
                    TRCURR, TRRATE,
                    SPECODE, DISCPER, TEXTINC
                )
                VALUES (
                    @orderRef, @stockRef, @lineType, @detLine, @lineNo, @trCode, @date, @time,
                    @amount, @price, @total, 
                    @vat, @vatAmount, @vatMatrah,
                    @uomRef, @usRef,
                    @uInfo1, @uInfo2, @vatInc,
                    @sourceIndex, @status, @clientRef,
                    @shippedAmount, @closed,
                    @reserveAmount, @doReserve, @reserveDate,
                    @siteId, @recStatus,
                    @trCurr, @trRate,
                    @specode, @discPer, @textInc
                )
            `;

            const itemVatAmount = item.brutTotal * (vatRate / 100);
            const itemVatMatrah = item.brutTotal;

            malzemeRequest.input('orderRef', sql.Int, orderRef);
            malzemeRequest.input('stockRef', sql.Int, item.ref);
            malzemeRequest.input('lineType', sql.SmallInt, 0);
            malzemeRequest.input('detLine', sql.SmallInt, 0);
            malzemeRequest.input('lineNo', sql.Int, lineNo);
            malzemeRequest.input('trCode', sql.SmallInt, 1);
            malzemeRequest.input('date', sql.DateTime, currentDate);
            malzemeRequest.input('time', sql.Int, currentTime);
            malzemeRequest.input('amount', sql.Float, item.quantity);
            malzemeRequest.input('price', sql.Float, item.unitPrice);
            malzemeRequest.input('total', sql.Float, item.brutTotal);
            malzemeRequest.input('vat', sql.Float, vatRate);
            malzemeRequest.input('vatAmount', sql.Float, itemVatAmount);
            malzemeRequest.input('vatMatrah', sql.Float, itemVatMatrah);
            malzemeRequest.input('uomRef', sql.Int, 23);
            malzemeRequest.input('usRef', sql.Int, 5);
            malzemeRequest.input('uInfo1', sql.SmallInt, 1);
            malzemeRequest.input('uInfo2', sql.SmallInt, 1);
            malzemeRequest.input('vatInc', sql.SmallInt, 0);
            malzemeRequest.input('sourceIndex', sql.SmallInt, 1);
            malzemeRequest.input('status', sql.SmallInt, 4);
            malzemeRequest.input('clientRef', sql.Int, customerRef);
            malzemeRequest.input('shippedAmount', sql.Float, 0);
            malzemeRequest.input('closed', sql.SmallInt, 0);
            malzemeRequest.input('reserveAmount', sql.Float, item.quantity);
            malzemeRequest.input('doReserve', sql.SmallInt, 1);
            malzemeRequest.input('reserveDate', sql.DateTime, currentDate);
            malzemeRequest.input('siteId', sql.SmallInt, 0);
            malzemeRequest.input('recStatus', sql.SmallInt, 1);
            malzemeRequest.input('trCurr', sql.SmallInt, 0);
            malzemeRequest.input('trRate', sql.Float, 0.0);
            malzemeRequest.input('specode', sql.VarChar, '');
            malzemeRequest.input('discPer', sql.Float, 0);
            malzemeRequest.input('textInc', sql.SmallInt, 0);

            await malzemeRequest.query(malzemeQuery);
            lineNo += 10;

            // İSKONTO SATIRLARI (4 KATMAN)
            for (const discount of item.discounts) {
                console.log(`      ${discount.type === 'CAMPAIGN' ? '🎯' : discount.type === 'ITEM' ? '📦' : discount.type === 'MANUFACTURER' ? '🏭' : '👤'} ${discount.description} satırı (${lineNo})`);
                
                const discountRequest = new sql.Request(transaction);
                const discountQuery = `
                    INSERT INTO LG_013_01_ORFLINE (
                        ORDFICHEREF, STOCKREF, LINETYPE, DETLINE, LINENO_, TRCODE, DATE_, TIME_,
                        AMOUNT, PRICE, TOTAL, 
                        VAT, VATAMNT, VATMATRAH,
                        UOMREF, USREF,
                        UINFO1, UINFO2, VATINC,
                        SOURCEINDEX, STATUS, CLIENTREF,
                        SHIPPEDAMOUNT, CLOSED,
                        RESERVEAMOUNT, DORESERVE, RESERVEDATE,
                        SITEID, RECSTATUS,
                        TRCURR, TRRATE,
                        SPECODE, DISCPER, TEXTINC
                    )
                    VALUES (
                        @orderRef, @stockRef, @lineType, @detLine, @lineNo, @trCode, @date, @time,
                        @amount, @price, @total, 
                        @vat, @vatAmount, @vatMatrah,
                        @uomRef, @usRef,
                        @uInfo1, @uInfo2, @vatInc,
                        @sourceIndex, @status, @clientRef,
                        @shippedAmount, @closed,
                        @reserveAmount, @doReserve, @reserveDate,
                        @siteId, @recStatus,
                        @trCurr, @trRate,
                        @specode, @discPer, @textInc
                    )
                `;

                discountRequest.input('orderRef', sql.Int, orderRef);
                discountRequest.input('stockRef', sql.Int, 0);
                discountRequest.input('lineType', sql.SmallInt, 2);
                discountRequest.input('detLine', sql.SmallInt, 0);
                discountRequest.input('lineNo', sql.Int, lineNo);
                discountRequest.input('trCode', sql.SmallInt, 1);
                discountRequest.input('date', sql.DateTime, currentDate);
                discountRequest.input('time', sql.Int, currentTime);
                discountRequest.input('amount', sql.Float, 0);
                discountRequest.input('price', sql.Float, 0);
                discountRequest.input('total', sql.Float, discount.amount); // POZİTİF TUTAR
                discountRequest.input('vat', sql.Float, 0);
                discountRequest.input('vatAmount', sql.Float, 0);
                discountRequest.input('vatMatrah', sql.Float, 0);
                discountRequest.input('uomRef', sql.Int, 0);
                discountRequest.input('usRef', sql.Int, 0);
                discountRequest.input('uInfo1', sql.SmallInt, 0);
                discountRequest.input('uInfo2', sql.SmallInt, 0);
                discountRequest.input('vatInc', sql.SmallInt, 0);
                discountRequest.input('sourceIndex', sql.SmallInt, 0);
                discountRequest.input('status', sql.SmallInt, 4);
                discountRequest.input('clientRef', sql.Int, customerRef);
                discountRequest.input('shippedAmount', sql.Float, 0);
                discountRequest.input('closed', sql.SmallInt, 0);
                discountRequest.input('reserveAmount', sql.Float, null);
                discountRequest.input('doReserve', sql.SmallInt, null);
                discountRequest.input('reserveDate', sql.DateTime, null);
                discountRequest.input('siteId', sql.SmallInt, 0);
                discountRequest.input('recStatus', sql.SmallInt, 1);
                discountRequest.input('trCurr', sql.SmallInt, 0);
                discountRequest.input('trRate', sql.Float, 0.0);
                discountRequest.input('specode', sql.VarChar, '');
                discountRequest.input('discPer', sql.Float, discount.rate);
                discountRequest.input('textInc', sql.SmallInt, 0);

                await discountRequest.query(discountQuery);
                lineNo += 10;
            }
        }

        // 6. STLINE KAYDI YOK (SIP-000005 formatında yok)

        await transaction.commit();
        console.log('🎉 SIPARIŞ BAŞARILI! (4 KATMANLI İSKONTO - ADIM 1)');
        console.log('📊 Fiş No:', sipFicheNo, 'Ref:', orderRef);
        
        // İskonto özeti
        const discountSummary = {};
        itemDetails.forEach(item => {
            item.discounts.forEach(disc => {
                const key = `${disc.type}_${disc.rate}`;
                if (!discountSummary[key]) {
                    discountSummary[key] = {
                        type: disc.type,
                        rate: disc.rate,
                        description: disc.description,
                        totalAmount: 0,
                        itemCount: 0
                    };
                }
                discountSummary[key].totalAmount += disc.amount;
                discountSummary[key].itemCount += 1;
            });
        });
        
        res.json({
            success: true,
            orderNo: sipFicheNo,
            orderRef: orderRef,
            message: 'Sipariş başarıyla oluşturuldu! 🎉 (4 Katmanlı İskonto)',
            amounts: {
                brutTotal: brutTotal.toFixed(2),
                totalDiscounts: totalDiscounts.toFixed(2),
                netTotal: netTotal.toFixed(2),
                vatRate: vatRate + '%',
                vatAmount: vatAmount.toFixed(2),
                grandTotal: grandTotal.toFixed(2)
            },
            discountSummary: Object.values(discountSummary).map(d => ({
                type: d.type,
                rate: d.rate + '%',
                description: d.description,
                totalAmount: d.totalAmount.toFixed(2),
                itemCount: d.itemCount
            })),
            items: itemDetails.map(item => ({
                code: item.code,
                quantity: item.quantity,
                unitPrice: item.unitPrice.toFixed(2),
                brutTotal: item.brutTotal.toFixed(2),
                netTotal: item.netTotal.toFixed(2),
                discountCount: item.discounts.length,
                discounts: item.discounts.map(d => ({
                    type: d.type,
                    rate: d.rate + '%',
                    description: d.description,
                    amount: d.amount.toFixed(2)
                }))
            })),
            format: 'SIP-000005',
            step: 'ADIM_1_4_KATMANLI_ISKONTO',
            timestamp: new Date().toISOString(),
            responseTime: Date.now() - startTime
        });

    } catch (error) {
        if (transaction) {
            try {
                await transaction.rollback();
                console.log('🔄 Transaction rolled back due to error');
            } catch (rollbackError) {
                console.error('❌ Transaction rollback hatası:', rollbackError);
            }
        }
        
        console.error('❌ SIPARIŞ HATASI:', {
            message: error.message,
            stack: error.stack,
            customerCode: req.body?.customerCode,
            itemCount: req.body?.items?.length
        });
        
        const errorResponse = {
            success: false,
            error: error.message,
            details: error.details || {
                action: 'create-order',
                timestamp: new Date().toISOString()
            },
            action: 'create-order',
            timestamp: new Date().toISOString(),
            responseTime: Date.now() - startTime
        };

        res.status(500).json(errorResponse);
    }
});

// ====================================================
// 🚀 5.0 - TCMB DÖVİZ KURU ENDPOINT'İ
// ====================================================
app.get('/api/exchange-rates', generalLimiter, async (req, res) => {
    const startTime = Date.now();
    
    try {
        console.log('💰 TCMB döviz kurları isteniyor...');
        
        const cacheKey = 'tcmb_exchange_rates';
        const cachedData = getCache(cacheKey);
        
        if (cachedData) {
            console.log('✅ TCMB verileri cacheden döndü');
            return res.json({
                ...cachedData,
                cached: true,
                responseTime: Date.now() - startTime
            });
        }

        const tcmbResponse = await fetch('https://www.tcmb.gov.tr/kurlar/today.xml', {
            timeout: 10000
        });
        
        if (!tcmbResponse.ok) {
            throw new Error(`TCMB HTTP hatası: ${tcmbResponse.status}`);
        }
        
        const xmlData = await tcmbResponse.text();
        const rates = parseTCMBXML(xmlData);
        
        const responseData = {
            success: true,
            source: 'TCMB',
            timestamp: new Date().toISOString(),
            data: {
                EUR: rates.EUR,
                USD: rates.USD,
                lastUpdated: new Date().toISOString()
            },
            responseTime: Date.now() - startTime
        };
        
        setCache(cacheKey, responseData, CACHE_DURATION.EXCHANGE_RATES);
        
        console.log('✅ TCMB verileri başarıyla çekildi:', rates);
        res.json(responseData);
        
    } catch (error) {
        console.error('❌ TCMB veri çekme hatası:', error.message);
        
        const cacheKey = 'tcmb_exchange_rates';
        const cachedData = getCache(cacheKey);
        
        if (cachedData) {
            console.log('⚠️ TCMB hatası, cache verileri kullanılıyor');
            return res.json({
                ...cachedData,
                cached: true,
                error: `TCMB'den güncel veri alınamadı. Cache verisi kullanılıyor. (${error.message})`,
                responseTime: Date.now() - startTime
            });
        }
        
        res.json({
            success: true,
            source: 'CACHE_DEFAULT',
            timestamp: new Date().toISOString(),
            data: {
                EUR: { ForexBuying: 49.45, CurrencyName: 'EURO' },
                USD: { ForexBuying: 42.43, CurrencyName: 'US DOLLAR' }
            },
            error: `TCMB'den veri alınamadı. Varsayılan değerler kullanılıyor. (${error.message})`,
            responseTime: Date.now() - startTime
        });
    }
});

function parseTCMBXML(xmlData) {
    try {
        console.log('🔍 TCMB XML parse ediliyor...');
        
        const currencies = {};
        
        const currencyRegex = /<Currency\s+.*?CurrencyCode="(USD|EUR)".*?>([\s\S]*?)<\/Currency>/g;
        let match;
        
        while ((match = currencyRegex.exec(xmlData)) !== null) {
            const currencyCode = match[1];
            const currencyBlock = match[2];
            
            const forexBuyingMatch = currencyBlock.match(/<ForexBuying>([0-9,.]+)<\/ForexBuying>/);
            const currencyNameMatch = currencyBlock.match(/<CurrencyName>([^<]+)<\/CurrencyName>/);
            
            if (forexBuyingMatch && currencyNameMatch) {
                const rate = parseFloat(forexBuyingMatch[1].replace(',', '.'));
                const name = currencyNameMatch[1].trim();
                
                currencies[currencyCode] = {
                    ForexBuying: rate,
                    CurrencyName: name
                };
                
                console.log(`✅ ${currencyCode} bulundu: ${rate} ${name}`);
            }
        }
        
        if (!currencies.USD || !currencies.EUR) {
            throw new Error('USD veya EUR bulunamadı');
        }
        
        return currencies;
        
    } catch (error) {
        console.error('❌ XML parse hatası:', error);
        throw new Error(`XML parse edilemedi: ${error.message}`);
    }
}

// ====================================================
// 🚀 6.0 - ANA SAYFA ROUTE
// ====================================================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// ====================================================
// 🚀 7.0 - HEALTH CHECK
// ====================================================
app.get('/health', async (req, res) => {
    try {
        const pool = await getLogoConnection();
        const result = await pool.request().query('SELECT 1 as status');
        
        res.json({
            status: 'OK',
            database: 'connected',
            timestamp: new Date().toISOString(),
            cacheSize: cache.size
        });
    } catch (error) {
        res.status(500).json({
            status: 'ERROR',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// ====================================================
// 🚀 8.0 - CACHE TEMİZLEME ENDPOINT'İ
// ====================================================
app.delete('/api/cache/clear', (req, res) => {
    const previousSize = cache.size;
    cache.clear();
    
    logger.info('Cache temizlendi', { previousSize });
    
    res.json({
        success: true,
        message: 'Cache başarıyla temizlendi',
        clearedEntries: previousSize,
        timestamp: new Date().toISOString()
    });
});

// ====================================================
// 🚀 B2B API KATMANI - YENİ ROUTER
// ====================================================

try {
    console.log('🔄 B2B Router yükleniyor...');
    const b2bRouter = require('./routes/b2bRouter');
    app.use('/api/b2b', b2bRouter);
    console.log('✅ B2B API Katmanı aktif: /api/b2b/*');
} catch (error) {
    console.error('❌ B2B Router yüklenemedi:', error.message);
    console.error('❌ Hata detayı:', error.stack);
}

// ====================================================
// 🚀 9.0 - SUNUCU BAŞLATMA
// ====================================================
app.listen(port, async () => {
    console.log(`=========================================`);
    console.log(`🚀 B2B TRADE PRO SUNUCUSU AKTİF!`);
    console.log(`=========================================`);
    console.log(`📍 http://localhost:${port}`);
    console.log(`🎯 BAĞLANTI YÖNETİMİ:`);
    console.log(`   ✅ Logo GO3 Connection Pool: Aktif`);
    console.log(`   ✅ B2B_TRADE_PRO Connection Pool: Aktif`);
    console.log(`   ✅ Max Connections: 10 (Logo), 5 (B2B)`);
    console.log(`🎯 CACHE SİSTEMİ:`);
    console.log(`   ✅ Ürünler: 15 dakika`);
    console.log(`   ✅ Fiyatlar: 10 dakika`);
    console.log(`   ✅ Döviz Kurları: 30 dakika`);
    console.log(`🎯 YENİ ARAMA SİSTEMİ:`);
    console.log(`   ✅ Akıllı Arama: Aktif`);
    console.log(`   ✅ Gruplama Sistemi: Aktif`);
    console.log(`   ✅ Karakter Bazlı Arama: Aktif`);
    console.log(`   ✅ Kısa Kod OEM Arama: Aktif`);
    console.log(`🎯 API KATMANLARI:`);
    console.log(`   ✅ /api/b2b/* - B2B API`);
    console.log(`   ✅ /api/b2b/search/* - Akıllı Arama`);
    console.log(`   ✅ /api/logo/data - Logo API`);
    console.log(`=========================================`);
    
    try {
        await getLocalAuthDb();
        await migrateFileAuthToSqlite();
        await initializeConnectionPool();
        console.log('✅ Logo GO3 connection pool başlatıldı');
        
        await getB2BConnection();
        console.log('✅ B2B_TRADE_PRO connection pool başlatıldı');
    } catch (error) {
        console.error('❌ Başlangıç connection pool hatası:', error.message);
    }
});

// ====================================================
// 🚀 10.0 - PROCESS SONLANDIRMA YÖNETİMİ
// ====================================================
process.on('SIGINT', async () => {
    logger.info('Sunucu kapatılıyor...', { cacheSize: cache.size });
    console.log('🛑 Sunucu kapatılıyor...');
    
    if (logoConnectionPool && logoConnectionPool.connected) {
        try {
            await logoConnectionPool.close();
            console.log('✅ Logo GO3 connection pool kapatıldı');
        } catch (error) {
            console.error('❌ Logo connection pool kapatma hatası:', error.message);
        }
    }
    
    if (b2bConnectionPool && b2bConnectionPool.connected) {
        try {
            await b2bConnectionPool.close();
            console.log('✅ B2B_TRADE_PRO connection pool kapatıldı');
        } catch (error) {
            console.error('❌ B2B connection pool kapatma hatası:', error.message);
        }
    }
    
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    logger.error('Beklenmeyen hata', error);
    console.log('❌ Kritik hata:', error.message);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Handle edilmemiş promise', { reason, promise });
    console.log('❌ Handle edilmemiş promise:', reason);
});

// ====================================================
// 🚀 B2B CACHE EXPORT
// ====================================================
module.exports.getCache = () => cache;
module.exports.getB2BCache = () => cache; // Aynı cache'i kullanıyoruz
module.exports.getLogoConnection = getLogoConnection;
module.exports.sql = sql;
