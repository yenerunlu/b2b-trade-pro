// /home/yunlu/b2b-app/controllers/b2bAdminController.js - BASE64 DESTEKLİ GÜNCELLENMİŞ VERSİYON
const sql = require('mssql');
const { b2bConfig, logoConfig } = require('../config/database');

let __logoPool = null;
async function getLogoPool() {
    if (__logoPool && __logoPool.connected) return __logoPool;

    __logoPool = await new sql.ConnectionPool(logoConfig).connect();
    __logoPool.on('error', (err) => {
        console.error('❌ Logo pool error (b2bAdminController):', err && err.message ? err.message : err);
        __logoPool = null;
    });

    return __logoPool;
}

class B2BAdminController {
    constructor() {
        this.b2bConfig = b2bConfig;
        
        this.b2bPool = null;
        this.cache = new Map();
        this._defaultSettingsColumnsCache = null;
    }

    async getDefaultSettingsColumns(pool) {
        if (this._defaultSettingsColumnsCache) return this._defaultSettingsColumnsCache;
        const result = await pool.request().query(`
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = 'dbo'
              AND TABLE_NAME = 'b2b_default_settings'
        `);
        const set = new Set((result.recordset || []).map(r => String(r.COLUMN_NAME || '').trim()).filter(Boolean));
        this._defaultSettingsColumnsCache = set;
        return set;
    }

    async getDefaultSettingsIdColumn(pool) {
        const cols = await this.getDefaultSettingsColumns(pool);
        if (cols.has('setting_id')) return 'setting_id';
        if (cols.has('id')) return 'id';
        return 'setting_id';
    }

    normalizeOverrideValue(settingType, valueType, value) {
        const st = String(settingType || '').trim();
        const vt = String(valueType || '').trim();

        if (vt === 'string') {
            if (st === 'payment_mode') {
                const mode = String(value || '').trim();
                if (mode === 'installment') return 2;
                if (mode === 'single') return 1;
                return 0;
            }

            if (st === 'discount_priority') {
                const p = String(value || '').trim();
                if (p === 'item>manufacturer>general') return 1;
                if (p === 'manufacturer>item>general') return 2;
                if (p === 'general>manufacturer>item') return 3;
                return 0;
            }

            const n = Number(value);
            return Number.isFinite(n) ? n : 0;
        }

        if (vt === 'boolean') {
            if (value === true || value === '1' || value === 1) return 1;
            return 0;
        }

        const n = Number(value);
        return Number.isFinite(n) ? n : 0;
    }

    denormalizeOverrideValue(settingType, valueType, value) {
        const st = String(settingType || '').trim();
        const vt = String(valueType || '').trim();

        if (vt === 'string') {
            if (st === 'payment_mode') {
                const n = Number(value);
                if (n === 2) return 'installment';
                if (n === 1) return 'single';
                return 'single';
            }

            if (st === 'discount_priority') {
                const n = Number(value);
                if (n === 2) return 'manufacturer>item>general';
                if (n === 3) return 'general>manufacturer>item';
                return 'item>manufacturer>general';
            }
        }

        return value;
    }

    parsePaymentPlanCodeToRates(code) {
        const raw = String(code || '').trim();
        if (!raw) return [];
        return raw
            .split('+')
            .map(x => Number(String(x || '').trim()))
            .filter(n => Number.isFinite(n) && n > 0);
    }

    async getLogoGeneralDiscountRates(customerCode) {
        if (!customerCode) return [];
        const pool = await getLogoPool();
        const request = pool.request();
        request.input('code', sql.VarChar(50), customerCode);
        const q = `
            SELECT TOP 1
                C.PAYMENTREF,
                P.CODE AS plan_code
            FROM dbo.LG_013_CLCARD C
            LEFT JOIN dbo.LG_013_PAYPLANS P ON P.LOGICALREF = C.PAYMENTREF
            WHERE C.CODE = @code
        `;
        const result = await request.query(q);
        const row = result.recordset && result.recordset[0] ? result.recordset[0] : null;
        if (!row || row.PAYMENTREF == null) return [];
        return this.parsePaymentPlanCodeToRates(row.plan_code);
    }

    async syncLogoGeneralDiscountOverrides({ customerCode, logoRates, userCode }) {
        const code = String(customerCode || '').trim();
        if (!code) return;
        const pool = await this.getB2BConnection();

        const tx = new sql.Transaction(pool);
        await tx.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);

        try {
            const rates = Array.isArray(logoRates) ? logoRates : [];

            if (rates.length) {
                for (let i = 0; i < rates.length; i++) {
                    const st = `discount_general_${i + 1}`;
                    const val = Number(rates[i]);
                    if (!Number.isFinite(val) || val <= 0) continue;

                    const findExistingQuery = `
                        SELECT TOP 1 id
                        FROM B2B_TRADE_PRO.dbo.b2b_customer_overrides
                        WHERE customer_code = @customerCode
                          AND setting_type = @settingType
                          AND item_code IS NULL
                        ORDER BY id DESC
                    `;
                    const existingResult = await tx.request()
                        .input('customerCode', sql.VarChar(50), code)
                        .input('settingType', sql.VarChar(50), st)
                        .query(findExistingQuery);

                    const existingId = existingResult.recordset?.[0]?.id;
                    if (existingId) {
                        const updateExistingQuery = `
                            UPDATE B2B_TRADE_PRO.dbo.b2b_customer_overrides
                            SET value = @value,
                                value_type = 'percent',
                                description = 'LOGO_PAYMENTREF',
                                is_active = 1,
                                updated_at = GETDATE(),
                                updated_by = @updatedBy
                            WHERE id = @id
                        `;
                        await tx.request()
                            .input('id', sql.Int, existingId)
                            .input('value', sql.Decimal(10, 2), val)
                            .input('updatedBy', sql.VarChar(50), userCode || 'system')
                            .query(updateExistingQuery);
                    } else {
                        const insertQuery = `
                            INSERT INTO B2B_TRADE_PRO.dbo.b2b_customer_overrides
                            (customer_code, setting_type, item_code, value, value_type, description, is_active, created_by, updated_by)
                            VALUES
                            (@customerCode, @settingType, NULL, @value, 'percent', 'LOGO_PAYMENTREF', 1, @createdBy, @updatedBy)
                        `;
                        await tx.request()
                            .input('customerCode', sql.VarChar(50), code)
                            .input('settingType', sql.VarChar(50), st)
                            .input('value', sql.Decimal(10, 2), val)
                            .input('createdBy', sql.VarChar(50), userCode || 'system')
                            .input('updatedBy', sql.VarChar(50), userCode || 'system')
                            .query(insertQuery);
                    }
                }

                // Disable any old Logo-synced tiers beyond current length.
                const disableQuery = `
                    UPDATE B2B_TRADE_PRO.dbo.b2b_customer_overrides
                    SET is_active = 0,
                        updated_at = GETDATE(),
                        updated_by = @updatedBy
                    WHERE customer_code = @customerCode
                      AND item_code IS NULL
                      AND description = 'LOGO_PAYMENTREF'
                      AND setting_type LIKE 'discount_general_%'
                      AND TRY_CONVERT(int, REPLACE(setting_type, 'discount_general_', '')) > @maxTier
                `;
                await tx.request()
                    .input('customerCode', sql.VarChar(50), code)
                    .input('maxTier', sql.Int, rates.length)
                    .input('updatedBy', sql.VarChar(50), userCode || 'system')
                    .query(disableQuery);
            } else {
                // Logo cleared: disable any previously synced tiers so manual/global can take over.
                const clearQuery = `
                    UPDATE B2B_TRADE_PRO.dbo.b2b_customer_overrides
                    SET is_active = 0,
                        updated_at = GETDATE(),
                        updated_by = @updatedBy
                    WHERE customer_code = @customerCode
                      AND item_code IS NULL
                      AND description = 'LOGO_PAYMENTREF'
                      AND setting_type LIKE 'discount_general_%'
                `;
                await tx.request()
                    .input('customerCode', sql.VarChar(50), code)
                    .input('updatedBy', sql.VarChar(50), userCode || 'system')
                    .query(clearQuery);
            }

            await tx.commit();
        } catch (e) {
            await tx.rollback();
            throw e;
        }
    }

    // ====================================================
    // 🚀 YENİ: KULLANICI VERİSİ DECODE HELPER
    // ====================================================
    decodeUserData(req) {
        try {
            const base64Data = req.headers['x-user-data-base64'];
            if (base64Data) {
                const decodedString = Buffer.from(base64Data, 'base64').toString('utf-8');
                const userData = JSON.parse(decodedString);
                console.log('✅ Admin: Base64 kullanıcı verisi decode edildi');
                return userData;
            }
            
            const userData = req.headers['x-user-data'];
            if (userData) {
                const parsedData = JSON.parse(userData);
                console.log('✅ Admin: Standart kullanıcı verisi parse edildi');
                return parsedData;
            }
            
            console.log('⚠️ Admin: Kullanıcı verisi header\'ı bulunamadı');
            return null;
            
        } catch (error) {
            console.error('❌ Admin kullanıcı verisi decode hatası:', error.message);
            return null;
        }
    }

    // ====================================================
    // 🚀 2.1 SİPARİŞ DAĞITIM AYARLARI (BÖLGE -> AMBAR ÖNCELİKLERİ)
    // ====================================================
    async getOrderDistributionSettings(req, res) {
        try {
            const userData = this.decodeUserData(req);

            if (!this.checkAdminAuth(req)) {
                return res.status(403).json({
                    success: false,
                    error: 'Bu işlem için admin yetkisi gereklidir'
                });
            }

            const pool = await this.getB2BConnection();
            const key = 'order_distribution_settings';

            const idCol = await this.getDefaultSettingsIdColumn(pool);
            const cols = await this.getDefaultSettingsColumns(pool);

            const activeWhere = cols.has('is_active')
                ? 'AND (is_active = 1 OR is_active IS NULL)'
                : '';

            const selectCols = [
                `${idCol} AS _id`,
                `setting_key`,
                `setting_value`
            ];
            if (cols.has('setting_type')) selectCols.push('setting_type');
            if (cols.has('description')) selectCols.push('description');

            const result = await pool.request()
                .input('key', sql.VarChar(100), key)
                .query(`
                    SELECT TOP 1 ${selectCols.join(', ')}
                    FROM dbo.b2b_default_settings
                    WHERE setting_key = @key
                      ${activeWhere}
                    ORDER BY ${idCol} DESC
                `);

            const row = result.recordset?.[0];
            let parsed = null;
            if (row && row.setting_value != null && String(row.setting_value).trim().length > 0) {
                try {
                    parsed = JSON.parse(String(row.setting_value));
                } catch (e) {
                    parsed = null;
                }
            }

            const defaults = {
                warehouses: [
                    { invNo: 0, name: 'MERKEZ' },
                    { invNo: 1, name: 'IKITELLI' },
                    { invNo: 2, name: 'BOSTANCI' },
                    { invNo: 3, name: 'DEPO' }
                ],
                regions: ['34', '35', '36', '37', '38', '102'],
                prioritySettings: {
                    '34': [0, 1, 2, 3],
                    '35': [1, 2, 3, 0],
                    '36': [2, 1, 3, 0],
                    '37': [1, 2, 3, 0],
                    '38': [1, 2, 3, 0],
                    '102': [0, 1, 2, 3]
                },
                unfulfilledWarehouse: 3,
                unfulfilledDocodeText: 'KARŞILANAMADI'
            };

            const data = parsed && typeof parsed === 'object' ? { ...defaults, ...parsed } : defaults;

            return res.json({
                success: true,
                data,
                meta: row ? {
                    setting_id: row._id,
                    setting_key: row.setting_key,
                    setting_type: row.setting_type,
                    description: row.description
                } : null,
                user: userData ? {
                    user_code: userData.user_code || userData.cari_kodu,
                    user_name: userData.kullanici || userData.musteri_adi
                } : null,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('❌ Sipariş dağıtım ayarları getirilemedi:', error.message);
            return res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    async updateOrderDistributionSettings(req, res) {
        try {
            const userData = this.decodeUserData(req);

            if (!this.checkAdminAuth(req)) {
                return res.status(403).json({
                    success: false,
                    error: 'Bu işlem için admin yetkisi gereklidir'
                });
            }

            const payload = req.body?.settings;
            if (!payload || typeof payload !== 'object') {
                return res.status(400).json({
                    success: false,
                    error: 'settings objesi gereklidir'
                });
            }

            const key = 'order_distribution_settings';
            const userCode = userData?.user_code || userData?.cari_kodu || 'admin';
            const pool = await this.getB2BConnection();

            const idCol = await this.getDefaultSettingsIdColumn(pool);
            const cols = await this.getDefaultSettingsColumns(pool);

            const activeWhere = cols.has('is_active')
                ? 'AND (is_active = 1 OR is_active IS NULL)'
                : '';

            const safeJson = JSON.stringify(payload);

            // Upsert (insert if missing)
            const tx = new sql.Transaction(pool);
            await tx.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);

            try {
                const reqTx = new sql.Request(tx);
                reqTx.input('key', sql.VarChar(100), key);
                reqTx.input('value', sql.NVarChar(sql.MAX), safeJson);
                reqTx.input('type', sql.VarChar(50), 'json');
                reqTx.input('desc', sql.NVarChar(500), 'Admin: Sipariş dağıtım ayarları (bölge->ambar öncelikleri, karşılanamayan ayarları)');
                reqTx.input('user', sql.VarChar(50), userCode);

                const existing = await reqTx.query(`
                    SELECT TOP 1 ${idCol} AS _id
                    FROM dbo.b2b_default_settings
                    WHERE setting_key = @key
                      ${activeWhere}
                    ORDER BY ${idCol} DESC
                `);

                if (existing.recordset && existing.recordset.length > 0) {
                    const settingId = existing.recordset[0]._id;
                    const upd = new sql.Request(tx);

                    const setParts = [
                        'setting_value = @value'
                    ];
                    if (cols.has('setting_type')) setParts.push('setting_type = @type');
                    if (cols.has('description')) setParts.push('description = @desc');
                    if (cols.has('is_active')) setParts.push('is_active = 1');
                    if (cols.has('updated_at')) setParts.push('updated_at = GETDATE()');
                    if (cols.has('updated_by')) setParts.push('updated_by = @user');

                    await upd
                        .input('id', sql.Int, settingId)
                        .input('value', sql.NVarChar(sql.MAX), safeJson)
                        .input('type', sql.VarChar(50), 'json')
                        .input('desc', sql.NVarChar(500), 'Admin: Sipariş dağıtım ayarları (bölge->ambar öncelikleri, karşılanamayan ayarları)')
                        .input('user', sql.VarChar(50), userCode)
                        .query(`
                            UPDATE dbo.b2b_default_settings
                            SET ${setParts.join(', ')}
                            WHERE ${idCol} = @id
                        `);
                } else {
                    const insertCols = ['setting_key', 'setting_value'];
                    const insertVals = ['@key', '@value'];
                    if (cols.has('setting_type')) { insertCols.push('setting_type'); insertVals.push('@type'); }
                    if (cols.has('description')) { insertCols.push('description'); insertVals.push('@desc'); }
                    if (cols.has('is_active')) { insertCols.push('is_active'); insertVals.push('1'); }
                    if (cols.has('created_at')) { insertCols.push('created_at'); insertVals.push('GETDATE()'); }
                    if (cols.has('updated_at')) { insertCols.push('updated_at'); insertVals.push('GETDATE()'); }
                    if (cols.has('created_by')) { insertCols.push('created_by'); insertVals.push('@user'); }
                    if (cols.has('updated_by')) { insertCols.push('updated_by'); insertVals.push('@user'); }

                    await reqTx.query(`
                        INSERT INTO dbo.b2b_default_settings
                        (${insertCols.join(', ')})
                        VALUES
                        (${insertVals.join(', ')})
                    `);
                }

                await tx.commit();

                this.clearB2BCache('b2b_settings');
                await this.logAction('order_settings_update', 'Sipariş dağıtım ayarları güncellendi', userCode, req.ip);

                return res.json({
                    success: true,
                    message: 'Sipariş dağıtım ayarları kaydedildi',
                    timestamp: new Date().toISOString()
                });
            } catch (e) {
                await tx.rollback();
                throw e;
            }
        } catch (error) {
            console.error('❌ Sipariş dağıtım ayarları güncellenemedi:', error.message);
            return res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    // B2B veritabanı bağlantısı
    async getB2BConnection() {
        try {
            if (!this.b2bPool || !this.b2bPool.connected) {
                console.log("🔗 B2B_TRADE_PRO bağlanıyor...");
                this.b2bPool = await new sql.ConnectionPool(this.b2bConfig).connect();
                this.b2bPool.on('error', err => {
                    console.error('❌ B2B_TRADE_PRO bağlantı hatası:', err.message);
                    this.b2bPool = null;
                });
                console.log("✅ B2B bağlantısı başarılı");
            }
            return this.b2bPool;
        } catch (error) {
            console.error("❌ B2B bağlantı hatası:", error.message);
            throw new Error(`B2B DB bağlantı hatası: ${error.message}`);
        }
    }

    // Admin yetki kontrolü
    checkAdminAuth(req) {
        try {
            const userData = this.decodeUserData(req) || 
                           (req.session ? req.session.user : null);
            
            if (!userData) {
                console.log("❌ Admin: User data bulunamadı");
                return false;
            }

            const isAdmin = userData.user_type === 'admin' || 
                          userData.user_type === '1' || 
                          userData.user_type === 1 ||
                          userData.kullanici_tipi === 'admin' ||
                          userData.kullanici_tipi === 1;
            
            console.log(`🔐 Admin Auth kontrolü: user_type=${userData.user_type}, isAdmin=${isAdmin}`);
            return isAdmin;
        } catch (error) {
            console.error("❌ Admin Auth kontrol hatası:", error);
            return false;
        }
    }

    // Cache temizleme
    clearB2BCache(cacheKey = null) {
        try {
            if (cacheKey) {
                if (this.cache.has(cacheKey)) {
                    this.cache.delete(cacheKey);
                    console.log(`🧹 Admin Cache temizlendi: ${cacheKey}`);
                }
            } else {
                const previousSize = this.cache.size;
                this.cache.clear();
                console.log(`🧹 Admin Tüm cache temizlendi: ${previousSize} kayıt silindi`);
            }
        } catch (error) {
            console.error('❌ Admin Cache temizleme hatası:', error);
        }
    }

    // Log kaydı
    async logAction(logType, message, userCode, ipAddress = '') {
        try {
            const pool = await this.getB2BConnection();
            const query = `
                INSERT INTO B2B_TRADE_PRO.dbo.b2b_system_logs 
                (log_type, module, message, user_code, ip_address, created_at)
                VALUES 
                (@logType, 'b2b_admin', @message, @userCode, @ipAddress, GETDATE())
            `;
            
            await pool.request()
                .input('logType', sql.VarChar(50), logType)
                .input('message', sql.NVarChar(500), message)
                .input('userCode', sql.VarChar(50), userCode)
                .input('ipAddress', sql.VarChar(50), ipAddress)
                .query(query);
                
            console.log(`📝 Admin Log kaydedildi: ${logType} - ${message}`);
        } catch (error) {
            console.error('❌ Admin Log kaydetme hatası:', error.message);
        }
    }

    // Sistem istatistikleri
    async getSystemStats() {
        try {
            const pool = await this.getB2BConnection();
            
            const queries = [
                `SELECT COUNT(*) as campaign_count FROM B2B_TRADE_PRO.dbo.b2b_campaign_items WHERE is_active = 1`,
                `SELECT COUNT(DISTINCT customer_code) as customer_override_count FROM B2B_TRADE_PRO.dbo.b2b_customer_overrides WHERE is_active = 1`,
                `SELECT COUNT(*) as settings_count FROM B2B_TRADE_PRO.dbo.b2b_default_settings`,
                `SELECT COUNT(*) as log_count FROM B2B_TRADE_PRO.dbo.b2b_system_logs WHERE created_at >= DATEADD(DAY, -7, GETDATE())`,
                `SELECT COUNT(*) as active_customers FROM B2B_TRADE_PRO.dbo.b2b_customer_overrides WHERE is_active = 1 GROUP BY customer_code`
            ];

            const results = await Promise.all(
                queries.map(query => pool.request().query(query))
            );

            return {
                activeCampaigns: results[0].recordset[0]?.campaign_count || 0,
                customerOverrides: results[1].recordset[0]?.customer_override_count || 0,
                totalSettings: results[2].recordset[0]?.settings_count || 0,
                weeklyLogs: results[3].recordset[0]?.log_count || 0,
                activeCustomers: results[4]?.recordset?.length || 0,
                b2bDatabase: 'B2B_TRADE_PRO',
                updatedAt: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ Admin Sistem istatistikleri hatası:', error.message);
            return {
                activeCampaigns: 0,
                customerOverrides: 0,
                totalSettings: 0,
                weeklyLogs: 0,
                activeCustomers: 0,
                b2bDatabase: 'B2B_TRADE_PRO',
                error: error.message
            };
        }
    }

    // ====================================================
    // 🚀 1. AYARLARI GETİR
    // ====================================================
    async getSettings(req, res) {
        try {
            console.log('⚙️  B2B ayarları getiriliyor...');
            
            const userData = this.decodeUserData(req);
            console.log('👤 Admin user data:', userData ? 'Var' : 'Yok');
            
            // Cache kontrolü
            const cacheKey = 'b2b_settings';
            if (this.cache.has(cacheKey)) {
                console.log('📦 Cache\'ten ayarlar getiriliyor');
                const cachedData = this.cache.get(cacheKey);
                return res.json(cachedData);
            }

            // Auth kontrolü - sadece admin
            if (!this.checkAdminAuth(req)) {
                return res.status(403).json({
                    success: false,
                    error: 'Bu işlem için admin yetkisi gereklidir'
                });
            }

            const pool = await this.getB2BConnection();
            
            const query = `
                SELECT 
                    setting_id,
                    setting_key,
                    setting_value,
                    setting_type,
                    description,
                    is_active,
                    created_at,
                    updated_at,
                    created_by,
                    updated_by
                FROM B2B_TRADE_PRO.dbo.b2b_default_settings
                WHERE is_active = 1
                ORDER BY setting_id
            `;
            
            console.log('📋 SQL çalıştırılıyor...');
            const result = await pool.request().query(query);
            console.log(`✅ SQL başarılı, ${result.recordset.length} kayıt`);
            
            // Sistem istatistiklerini de ekle
            const stats = await this.getSystemStats();

            const responseData = {
                success: true,
                data: result.recordset,
                stats: stats,
                count: result.recordset.length,
                timestamp: new Date().toISOString(),
                user: userData ? {
                    user_code: userData.user_code || userData.cari_kodu,
                    user_name: userData.kullanici || userData.musteri_adi
                } : null
            };

            // Cache'e kaydet (5 dakika)
            this.cache.set(cacheKey, responseData);
            setTimeout(() => this.cache.delete(cacheKey), 5 * 60 * 1000);

            res.json(responseData);

        } catch (error) {
            console.error('❌ Ayarlar getirme hatası:', error.message);
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    // ====================================================
    // 🚀 2. AYARLARI GÜNCELLE
    // ====================================================
    async updateSettings(req, res) {
        try {
            console.log('⚙️  B2B ayarları güncelleniyor...');
            
            const userData = this.decodeUserData(req);
            
            // Auth kontrolü
            if (!this.checkAdminAuth(req)) {
                return res.status(403).json({
                    success: false,
                    error: 'Bu işlem için admin yetkisi gereklidir'
                });
            }

            const { settings } = req.body;
            
            if (!settings || !Array.isArray(settings)) {
                return res.status(400).json({
                    success: false,
                    error: 'Geçerli ayar array\'i gereklidir'
                });
            }

            const userCode = userData?.user_code || userData?.cari_kodu || 'admin';
            const pool = await this.getB2BConnection();
            
            // Transaction başlat
            const transaction = new sql.Transaction(pool);
            await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
            
            try {
                let updatedCount = 0;
                
                for (const setting of settings) {
                    const { setting_id, setting_value, setting_type, description } = setting;
                    
                    if (!setting_id || setting_value === undefined) {
                        console.warn(`⚠️ Geçersiz ayar:`, setting);
                        continue;
                    }

                    const updateQuery = `
                        UPDATE B2B_TRADE_PRO.dbo.b2b_default_settings 
                        SET setting_value = @value,
                            setting_type = @type,
                            description = @description,
                            updated_at = GETDATE(),
                            updated_by = @updatedBy
                        WHERE setting_id = @id
                        AND is_active = 1
                    `;
                    
                    const request = new sql.Request(transaction);
                    await request
                        .input('id', sql.Int, setting_id)
                        .input('value', sql.VarChar(100), setting_value.toString())
                        .input('type', sql.VarChar(50), setting_type || 'text')
                        .input('description', sql.NVarChar(500), description || '')
                        .input('updatedBy', sql.VarChar(50), userCode)
                        .query(updateQuery);
                    
                    updatedCount++;
                    console.log(`✅ Ayar güncellendi ID: ${setting_id}`);
                }
                
                await transaction.commit();
                
                // Log kaydı
                await this.logAction('settings_update', 
                    `${updatedCount} ayar güncellendi`, 
                    userCode, 
                    req.ip);
                
                // Cache'i temizle
                this.clearB2BCache('b2b_settings');
                
                res.json({
                    success: true,
                    message: `${updatedCount} ayar başarıyla güncellendi`,
                    updatedCount: updatedCount,
                    userCode: userCode,
                    timestamp: new Date().toISOString()
                });

            } catch (error) {
                await transaction.rollback();
                throw error;
            }

        } catch (error) {
            console.error('❌ Ayarlar güncelleme hatası:', error.message);
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    // ====================================================
    // 🚀 3. KAMPANYALARI LİSTELE
    // ====================================================
    async getCampaigns(req, res) {
        try {
            console.log('🎯 Kampanyalar listeleniyor...');
            
            const userData = this.decodeUserData(req);
            
            // Cache kontrolü
            const cacheKey = `b2b_campaigns_${req.query.activeOnly || 'all'}`;
            if (this.cache.has(cacheKey)) {
                console.log('📦 Cache\'ten kampanyalar getiriliyor');
                const cachedData = this.cache.get(cacheKey);
                return res.json(cachedData);
            }

            // Auth kontrolü
            if (!this.checkAdminAuth(req)) {
                return res.status(403).json({
                    success: false,
                    error: 'Bu işlem için admin yetkisi gereklidir'
                });
            }

            const { activeOnly = 'true' } = req.query;
            const pool = await this.getB2BConnection();
            
            let query = `
                SELECT 
                    id,
                    item_code,
                    campaign_name,
                    discount_rate,
                    start_date,
                    end_date,
                    is_active,
                    created_at,
                    updated_at,
                    created_by,
                    updated_by
                FROM B2B_TRADE_PRO.dbo.b2b_campaign_items
                WHERE 1=1
            `;
            
            if (activeOnly === 'true') {
                query += ` AND is_active = 1 
                          AND (start_date IS NULL OR start_date <= GETDATE())
                          AND (end_date IS NULL OR end_date >= GETDATE())`;
            }
            
            query += ` ORDER BY created_at DESC`;
            
            const result = await pool.request().query(query);
            
            const responseData = {
                success: true,
                data: result.recordset,
                count: result.recordset.length,
                activeOnly: activeOnly === 'true',
                user: userData ? {
                    user_code: userData.user_code || userData.cari_kodu,
                    user_name: userData.kullanici || userData.musteri_adi
                } : null,
                timestamp: new Date().toISOString()
            };

            // Cache'e kaydet (2 dakika)
            this.cache.set(cacheKey, responseData);
            setTimeout(() => this.cache.delete(cacheKey), 2 * 60 * 1000);
            
            res.json(responseData);

        } catch (error) {
            console.error('❌ Kampanyalar listeleme hatası:', error.message);
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    // ====================================================
    // 🚀 4. KAMPANYA EKLE/GÜNCELLE
    // ====================================================
    async saveCampaign(req, res) {
        try {
            console.log('🎯 Kampanya kaydediliyor...');
            
            const userData = this.decodeUserData(req);
            
            // Auth kontrolü
            if (!this.checkAdminAuth(req)) {
                return res.status(403).json({
                    success: false,
                    error: 'Bu işlem için admin yetkisi gereklidir'
                });
            }

            const campaign = req.body;
            const userCode = userData?.user_code || userData?.cari_kodu || 'admin';
            
            // Validasyon
            if (!campaign.item_code || campaign.discount_rate === undefined) {
                return res.status(400).json({
                    success: false,
                    error: 'Ürün kodu ve iskonto oranı gereklidir'
                });
            }

            const pool = await this.getB2BConnection();
            
            // Transaction başlat
            const transaction = new sql.Transaction(pool);
            await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
            
            try {
                let message = '';
                let logMessage = '';
                let campaignId = campaign.id;
                
                if (campaign.id) {
                    // Güncelleme
                    const updateQuery = `
                        UPDATE B2B_TRADE_PRO.dbo.b2b_campaign_items 
                        SET item_code = @itemCode,
                            campaign_name = @campaignName,
                            discount_rate = @discountRate,
                            start_date = @startDate,
                            end_date = @endDate,
                            is_active = @isActive,
                            updated_at = GETDATE(),
                            updated_by = @updatedBy
                        WHERE id = @id
                    `;
                    
                    await transaction.request()
                        .input('id', sql.Int, campaign.id)
                        .input('itemCode', sql.VarChar(50), campaign.item_code)
                        .input('campaignName', sql.VarChar(100), campaign.campaign_name || '')
                        .input('discountRate', sql.Decimal(5,2), parseFloat(campaign.discount_rate))
                        .input('startDate', sql.DateTime, campaign.start_date || null)
                        .input('endDate', sql.DateTime, campaign.end_date || null)
                        .input('isActive', sql.Bit, campaign.is_active !== undefined ? campaign.is_active : 1)
                        .input('updatedBy', sql.VarChar(50), userCode)
                        .query(updateQuery);
                        
                    message = 'Kampanya başarıyla güncellendi';
                    logMessage = `Kampanya güncellendi: ${campaign.item_code} (ID: ${campaign.id})`;
                    console.log(`✅ Kampanya güncellendi: ${campaign.item_code}`);
                    
                } else {
                    // Yeni ekleme
                    const insertQuery = `
                        INSERT INTO B2B_TRADE_PRO.dbo.b2b_campaign_items 
                        (item_code, campaign_name, discount_rate, start_date, end_date, is_active, created_by, updated_by)
                        VALUES 
                        (@itemCode, @campaignName, @discountRate, @startDate, @endDate, @isActive, @createdBy, @updatedBy);
                        SELECT SCOPE_IDENTITY() as newId;
                    `;
                    
                    const result = await transaction.request()
                        .input('itemCode', sql.VarChar(50), campaign.item_code)
                        .input('campaignName', sql.VarChar(100), campaign.campaign_name || '')
                        .input('discountRate', sql.Decimal(5,2), parseFloat(campaign.discount_rate))
                        .input('startDate', sql.DateTime, campaign.start_date || null)
                        .input('endDate', sql.DateTime, campaign.end_date || null)
                        .input('isActive', sql.Bit, campaign.is_active !== undefined ? campaign.is_active : 1)
                        .input('createdBy', sql.VarChar(50), userCode)
                        .input('updatedBy', sql.VarChar(50), userCode)
                        .query(insertQuery);
                        
                    campaignId = result.recordset[0].newId;
                    message = 'Kampanya başarıyla eklendi';
                    logMessage = `Yeni kampanya eklendi: ${campaign.item_code} (ID: ${campaignId})`;
                    console.log(`✅ Yeni kampanya eklendi: ${campaign.item_code} (ID: ${campaignId})`);
                }
                
                await transaction.commit();
                
                // Log kaydı
                await this.logAction('campaign_save', logMessage, userCode, req.ip);
                
                // Cache'i temizle
                this.clearB2BCache('b2b_campaigns_');
                
                res.json({
                    success: true,
                    message: message,
                    campaignId: campaignId,
                    userCode: userCode,
                    timestamp: new Date().toISOString()
                });

            } catch (error) {
                await transaction.rollback();
                throw error;
            }

        } catch (error) {
            console.error('❌ Kampanya kaydetme hatası:', error.message);
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    // ====================================================
    // 🚀 5. MÜŞTERİ ÖZEL AYARLARI
    // ====================================================
    async getCustomerOverrides(req, res) {
        try {
            console.log('👤 Müşteri özel ayarları getiriliyor...');
            
            const userData = this.decodeUserData(req);
            const { customerCode } = req.params;
            
            if (!customerCode) {
                return res.status(400).json({
                    success: false,
                    error: 'Müşteri kodu gereklidir'
                });
            }

            // Cache kontrolü (devre dışı: admin/panel güncellemeleri anında yansısın)
            const cacheKey = `b2b_overrides_${customerCode}`;

            // Auth kontrolü
            if (!this.checkAdminAuth(req)) {
                return res.status(403).json({
                    success: false,
                    error: 'Bu işlem için admin yetkisi gereklidir'
                });
            }

            const pool = await this.getB2BConnection();
            
            const query = `
                SELECT 
                    id,
                    customer_code,
                    setting_type,
                    item_code,
                    value,
                    value_type,
                    description,
                    is_active,
                    created_at,
                    updated_at,
                    created_by,
                    updated_by
                FROM B2B_TRADE_PRO.dbo.b2b_customer_overrides
                WHERE customer_code = @customerCode
                AND is_active = 1
                ORDER BY setting_type, item_code
            `;
            
            const result = await pool.request()
                .input('customerCode', sql.VarChar(50), customerCode)
                .query(query);

            const logoRates = await this.getLogoGeneralDiscountRates(customerCode);

            try {
                await this.syncLogoGeneralDiscountOverrides({
                    customerCode,
                    logoRates,
                    userCode: (userData?.user_code || userData?.cari_kodu || 'admin')
                });
            } catch (e) {
                console.error('❌ Logo->B2B general discount sync failed:', e && e.message ? e.message : e);
            }

            let rows = (result.recordset || []).map(r => ({
                ...r,
                value: this.denormalizeOverrideValue(r.setting_type, r.value_type, r.value)
            }));

            if (logoRates && logoRates.length) {
                // If Logo defines PAYMENTREF, use it as the source of truth for general discounts in UI.
                rows = rows.filter(r => !/^discount_general_\d+$/.test(String(r.setting_type || '')));
                const generated = logoRates.map((rate, idx) => ({
                    id: null,
                    customer_code: customerCode,
                    setting_type: `discount_general_${idx + 1}`,
                    item_code: null,
                    value: rate,
                    value_type: 'percent',
                    description: 'LOGO_PAYMENTREF',
                    is_active: 1,
                    created_at: null,
                    updated_at: null,
                    created_by: null,
                    updated_by: null
                }));
                rows = [...rows, ...generated].sort((a, b) => {
                    const at = String(a.setting_type || '');
                    const bt = String(b.setting_type || '');
                    return at.localeCompare(bt);
                });
            }
            
            const responseData = {
                success: true,
                data: rows,
                customerCode: customerCode,
                count: rows.length,
                user: userData ? {
                    user_code: userData.user_code || userData.cari_kodu,
                    user_name: userData.kullanici || userData.musteri_adi
                } : null,
                timestamp: new Date().toISOString()
            };

            // Cache'e kaydetme (devre dışı)
            
            res.json(responseData);

        } catch (error) {
            console.error('❌ Müşteri ayarları getirme hatası:', error.message);
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    // ====================================================
    // 🚀 6. SİSTEM İSTATİSTİKLERİ API
    // ====================================================
    async getStatistics(req, res) {
        try {
            console.log('📊 Sistem istatistikleri getiriliyor...');
            
            const userData = this.decodeUserData(req);
            
            // Auth kontrolü
            if (!this.checkAdminAuth(req)) {
                return res.status(403).json({
                    success: false,
                    error: 'Bu işlem için admin yetkisi gereklidir'
                });
            }

            const stats = await this.getSystemStats();
            
            res.json({
                success: true,
                data: stats,
                user: userData ? {
                    user_code: userData.user_code || userData.cari_kodu,
                    user_name: userData.kullanici || userData.musteri_adi
                } : null,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('❌ İstatistikler getirme hatası:', error.message);
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    // ====================================================
    // 🚀 7. KAMPANYA SİL
    // ====================================================
    async deleteCampaign(req, res) {
        try {
            console.log('🗑️  Kampanya siliniyor...');
            
            const userData = this.decodeUserData(req);
            
            // Auth kontrolü
            if (!this.checkAdminAuth(req)) {
                return res.status(403).json({
                    success: false,
                    error: 'Bu işlem için admin yetkisi gereklidir'
                });
            }

            const { id } = req.params;
            const userCode = userData?.user_code || userData?.cari_kodu || 'admin';
            
            if (!id) {
                return res.status(400).json({
                    success: false,
                    error: 'Kampanya ID gereklidir'
                });
            }

            const pool = await this.getB2BConnection();
            
            // Soft delete yap (is_active = 0)
            const query = `
                UPDATE B2B_TRADE_PRO.dbo.b2b_campaign_items 
                SET is_active = 0,
                    updated_at = GETDATE(),
                    updated_by = @updatedBy
                WHERE id = @id
            `;
            
            const result = await pool.request()
                .input('id', sql.Int, id)
                .input('updatedBy', sql.VarChar(50), userCode)
                .query(query);
            
            if (result.rowsAffected[0] > 0) {
                // Log kaydı
                await this.logAction('campaign_delete', 
                    `Kampanya silindi ID: ${id}`, 
                    userCode, 
                    req.ip);
                
                // Cache'i temizle
                this.clearB2BCache('b2b_campaigns_');
                
                res.json({
                    success: true,
                    message: 'Kampanya başarıyla silindi',
                    userCode: userCode,
                    timestamp: new Date().toISOString()
                });
            } else {
                res.status(404).json({
                    success: false,
                    error: 'Kampanya bulunamadı',
                    timestamp: new Date().toISOString()
                });
            }

        } catch (error) {
            console.error('❌ Kampanya silme hatası:', error.message);
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    // ====================================================
    // 🚀 8. MÜŞTERİ OVERRIDE EKLE/GÜNCELLE
    // ====================================================
    async saveCustomerOverride(req, res) {
        try {
            console.log('👤 Müşteri override kaydediliyor...');
            
            const userData = this.decodeUserData(req);
            
            // Auth kontrolü
            if (!this.checkAdminAuth(req)) {
                return res.status(403).json({
                    success: false,
                    error: 'Bu işlem için admin yetkisi gereklidir'
                });
            }

            const override = req.body;
            const userCode = userData?.user_code || userData?.cari_kodu || 'admin';
            
            // Validasyon
            if (!override.customer_code || !override.setting_type || override.value === undefined) {
                return res.status(400).json({
                    success: false,
                    error: 'Müşteri kodu, ayar tipi ve değer gereklidir'
                });
            }

            if (/^discount_general_\d+$/.test(String(override.setting_type || '')) && String(override.customer_code || '') !== '__GLOBAL__') {
                const logoRates = await this.getLogoGeneralDiscountRates(String(override.customer_code || ''));
                if (logoRates && logoRates.length) {
                    return res.status(409).json({
                        success: false,
                        error: 'Bu müşteride genel iskonto LOGO tarafından yönetiliyor. LOGO doluyken manuel genel iskonto kaydedilemez.'
                    });
                }
            }

            const pool = await this.getB2BConnection();
            
            // Transaction başlat
            const transaction = new sql.Transaction(pool);
            await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
            
            try {
                let message = '';
                let logMessage = '';
                let overrideId = override.id;

                const normalizedValue = this.normalizeOverrideValue(override.setting_type, override.value_type, override.value);
                const normalizedIsActive = override.is_active !== undefined ? (override.is_active ? 1 : 0) : 1;
                
                if (override.id) {
                    // Güncelleme
                    const updateQuery = `
                        UPDATE B2B_TRADE_PRO.dbo.b2b_customer_overrides 
                        SET customer_code = @customerCode,
                            setting_type = @settingType,
                            item_code = @itemCode,
                            value = @value,
                            value_type = @valueType,
                            description = @description,
                            is_active = @isActive,
                            updated_at = GETDATE(),
                            updated_by = @updatedBy
                        WHERE id = @id
                    `;
                    
                    await transaction.request()
                        .input('id', sql.Int, override.id)
                        .input('customerCode', sql.VarChar(50), override.customer_code)
                        .input('settingType', sql.VarChar(50), override.setting_type)
                        .input('itemCode', sql.VarChar(50), override.item_code || null)
                        .input('value', sql.Decimal(10, 2), normalizedValue)
                        .input('valueType', sql.VarChar(50), override.value_type || 'percent')
                        .input('description', sql.NVarChar(500), override.description || '')
                        .input('isActive', sql.Bit, normalizedIsActive)
                        .input('updatedBy', sql.VarChar(50), userCode)
                        .query(updateQuery);
                        
                    message = 'Müşteri override başarıyla güncellendi';
                    logMessage = `Müşteri override güncellendi: ${override.customer_code} - ${override.setting_type}`;
                } else {
                    // Upsert: Aynı müşteri + setting_type + item_code varsa INSERT yerine UPDATE (tekrar aktif et)
                    const findExistingQuery = `
                        SELECT TOP 1 id
                        FROM B2B_TRADE_PRO.dbo.b2b_customer_overrides
                        WHERE customer_code = @customerCode
                          AND setting_type = @settingType
                          AND ISNULL(NULLIF(LTRIM(RTRIM(item_code)), ''), '__NULL__') =
                              ISNULL(NULLIF(LTRIM(RTRIM(@itemCode)), ''), '__NULL__')
                        ORDER BY id DESC
                    `;

                    const itemCodeParam = override.item_code || null;
                    const existingResult = await transaction.request()
                        .input('customerCode', sql.VarChar(50), override.customer_code)
                        .input('settingType', sql.VarChar(50), override.setting_type)
                        .input('itemCode', sql.VarChar(50), itemCodeParam)
                        .query(findExistingQuery);

                    const existingId = existingResult.recordset?.[0]?.id;

                    if (existingId) {
                        const updateExistingQuery = `
                            UPDATE B2B_TRADE_PRO.dbo.b2b_customer_overrides
                            SET value = @value,
                                value_type = @valueType,
                                description = @description,
                                is_active = @isActive,
                                updated_at = GETDATE(),
                                updated_by = @updatedBy
                            WHERE id = @id
                        `;

                        await transaction.request()
                            .input('id', sql.Int, existingId)
                            .input('value', sql.Decimal(10, 2), normalizedValue)
                            .input('valueType', sql.VarChar(50), override.value_type || 'percent')
                            .input('description', sql.NVarChar(500), override.description || '')
                            .input('isActive', sql.Bit, normalizedIsActive)
                            .input('updatedBy', sql.VarChar(50), userCode)
                            .query(updateExistingQuery);

                        overrideId = existingId;
                        message = 'Müşteri override başarıyla güncellendi';
                        logMessage = `Müşteri override güncellendi (upsert): ${override.customer_code} - ${override.setting_type}`;
                        console.log(`✅ Müşteri override upsert (update): ${override.customer_code} (${override.setting_type})`);
                    } else {
                        // Yeni ekleme
                        const insertQuery = `
                            INSERT INTO B2B_TRADE_PRO.dbo.b2b_customer_overrides 
                            (customer_code, setting_type, item_code, value, value_type, description, is_active, created_by, updated_by)
                            VALUES 
                            (@customerCode, @settingType, @itemCode, @value, @valueType, @description, @isActive, @createdBy, @updatedBy)
                            SELECT SCOPE_IDENTITY() as newId;
                        `;

                        const insertResult = await transaction.request()
                            .input('customerCode', sql.VarChar(50), override.customer_code)
                            .input('settingType', sql.VarChar(50), override.setting_type)
                            .input('itemCode', sql.VarChar(50), itemCodeParam)
                            .input('value', sql.Decimal(10, 2), normalizedValue)
                            .input('valueType', sql.VarChar(50), override.value_type || 'percent')
                            .input('description', sql.NVarChar(500), override.description || '')
                            .input('isActive', sql.Bit, normalizedIsActive)
                            .input('createdBy', sql.VarChar(50), userCode)
                            .input('updatedBy', sql.VarChar(50), userCode)
                            .query(insertQuery);

                        overrideId = insertResult.recordset?.[0]?.newId || overrideId;
                        message = 'Müşteri override başarıyla eklendi';
                        logMessage = `Yeni müşteri override eklendi: ${override.customer_code} - ${override.setting_type}`;
                        console.log(`✅ Yeni müşteri override eklendi: ${override.customer_code}`);
                    }
                }
                
                await transaction.commit();
                
                // Log kaydı
                await this.logAction('customer_override_save', logMessage, userCode, req.ip);
                
                // Cache'i temizle
                this.clearB2BCache(`b2b_overrides_${override.customer_code}`);
                
                res.json({
                    success: true,
                    message: message,
                    overrideId: overrideId,
                    userCode: userCode,
                    timestamp: new Date().toISOString()
                });

            } catch (error) {
                await transaction.rollback();
                throw error;
            }

        } catch (error) {
            const details = {
                message: error?.message,
                code: error?.code,
                number: error?.number,
                state: error?.state,
                class: error?.class,
                lineNumber: error?.lineNumber,
                procName: error?.procName,
                serverName: error?.serverName,
                originalError: error?.originalError?.message,
                precedingErrors: Array.isArray(error?.precedingErrors)
                    ? error.precedingErrors.map(e => ({ message: e.message, number: e.number, code: e.code }))
                    : undefined
            };

            console.error('❌ Müşteri override kaydetme hatası:', details);
            res.status(500).json({
                success: false,
                error: error?.message || 'Sunucu hatası',
                details,
                timestamp: new Date().toISOString()
            });
        }
    }

    // ====================================================
    // 🚀 9. MÜŞTERİ OVERRIDES TOPLU KAYDET (BATCH)
    // ====================================================
    async saveCustomerOverridesBatch(req, res) {
        try {
            console.log('👥 Müşteri overrides batch kaydediliyor...');

            const userData = this.decodeUserData(req);

            // Auth kontrolü
            if (!this.checkAdminAuth(req)) {
                return res.status(403).json({
                    success: false,
                    error: 'Bu işlem için admin yetkisi gereklidir'
                });
            }

            const { customerCode } = req.params;
            const body = req.body || {};
            const overrides = Array.isArray(body.overrides) ? body.overrides : [];
            const userCode = userData?.user_code || userData?.cari_kodu || 'admin';

            if (!customerCode) {
                return res.status(400).json({
                    success: false,
                    error: 'Müşteri kodu gereklidir'
                });
            }

            if (!overrides.length) {
                return res.status(400).json({
                    success: false,
                    error: 'Overrides listesi boş'
                });
            }

            if (customerCode !== '__GLOBAL__') {
                const hasGeneralEdits = overrides.some(o => /^discount_general_\d+$/.test(String(o?.setting_type || '')));
                if (hasGeneralEdits) {
                    const logoRates = await this.getLogoGeneralDiscountRates(String(customerCode || ''));
                    if (logoRates && logoRates.length) {
                        return res.status(409).json({
                            success: false,
                            error: 'Bu müşteride genel iskonto LOGO tarafından yönetiliyor. LOGO doluyken manuel genel iskonto kaydedilemez.'
                        });
                    }
                }
            }

            // Basit validasyon
            for (const o of overrides) {
                if (!o || !o.setting_type || o.value === undefined) {
                    return res.status(400).json({
                        success: false,
                        error: 'Her override için setting_type ve value gereklidir'
                    });
                }
            }

            const pool = await this.getB2BConnection();
            const transaction = new sql.Transaction(pool);
            await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);

            const results = [];

            try {
                for (const o of overrides) {
                    const normalized = {
                        id: o.id,
                        customer_code: customerCode,
                        setting_type: String(o.setting_type),
                        item_code: (o.item_code === '' || o.item_code === undefined) ? null : o.item_code,
                        value: this.normalizeOverrideValue(o.setting_type, o.value_type, o.value),
                        value_type: o.value_type || 'percent',
                        description: o.description || '',
                        is_active: o.is_active !== undefined ? (o.is_active ? 1 : 0) : 1
                    };

                    let overrideId = normalized.id;

                    if (overrideId) {
                        const updateQuery = `
                            UPDATE B2B_TRADE_PRO.dbo.b2b_customer_overrides 
                            SET customer_code = @customerCode,
                                setting_type = @settingType,
                                item_code = @itemCode,
                                value = @value,
                                value_type = @valueType,
                                description = @description,
                                is_active = @isActive,
                                updated_at = GETDATE(),
                                updated_by = @updatedBy
                            WHERE id = @id
                        `;

                        await transaction.request()
                            .input('id', sql.Int, overrideId)
                            .input('customerCode', sql.VarChar(50), normalized.customer_code)
                            .input('settingType', sql.VarChar(50), normalized.setting_type)
                            .input('itemCode', sql.VarChar(50), normalized.item_code)
                            .input('value', sql.Decimal(10, 2), normalized.value)
                            .input('valueType', sql.VarChar(50), normalized.value_type)
                            .input('description', sql.NVarChar(500), normalized.description)
                            .input('isActive', sql.Bit, normalized.is_active)
                            .input('updatedBy', sql.VarChar(50), userCode)
                            .query(updateQuery);

                        results.push({
                            id: overrideId,
                            setting_type: normalized.setting_type,
                            item_code: normalized.item_code,
                            action: 'update'
                        });
                        continue;
                    }

                    // Upsert by (customer_code, setting_type, item_code)
                    const findExistingQuery = `
                        SELECT TOP 1 id
                        FROM B2B_TRADE_PRO.dbo.b2b_customer_overrides
                        WHERE customer_code = @customerCode
                          AND setting_type = @settingType
                          AND ISNULL(NULLIF(LTRIM(RTRIM(item_code)), ''), '__NULL__') =
                              ISNULL(NULLIF(LTRIM(RTRIM(@itemCode)), ''), '__NULL__')
                        ORDER BY id DESC
                    `;

                    const existingResult = await transaction.request()
                        .input('customerCode', sql.VarChar(50), normalized.customer_code)
                        .input('settingType', sql.VarChar(50), normalized.setting_type)
                        .input('itemCode', sql.VarChar(50), normalized.item_code)
                        .query(findExistingQuery);

                    const existingId = existingResult.recordset?.[0]?.id;
                    if (existingId) {
                        const updateExistingQuery = `
                            UPDATE B2B_TRADE_PRO.dbo.b2b_customer_overrides
                            SET value = @value,
                                value_type = @valueType,
                                description = @description,
                                is_active = @isActive,
                                updated_at = GETDATE(),
                                updated_by = @updatedBy
                            WHERE id = @id
                        `;

                        await transaction.request()
                            .input('id', sql.Int, existingId)
                            .input('value', sql.Decimal(10, 2), normalized.value)
                            .input('valueType', sql.VarChar(50), normalized.value_type)
                            .input('description', sql.NVarChar(500), normalized.description)
                            .input('isActive', sql.Bit, normalized.is_active)
                            .input('updatedBy', sql.VarChar(50), userCode)
                            .query(updateExistingQuery);

                        results.push({
                            id: existingId,
                            setting_type: normalized.setting_type,
                            item_code: normalized.item_code,
                            action: 'upsert_update'
                        });
                        continue;
                    }

                    const insertQuery = `
                        INSERT INTO B2B_TRADE_PRO.dbo.b2b_customer_overrides 
                        (customer_code, setting_type, item_code, value, value_type, description, is_active, created_by, updated_by)
                        VALUES 
                        (@customerCode, @settingType, @itemCode, @value, @valueType, @description, @isActive, @createdBy, @updatedBy)
                        SELECT SCOPE_IDENTITY() as newId;
                    `;

                    const insertResult = await transaction.request()
                        .input('customerCode', sql.VarChar(50), normalized.customer_code)
                        .input('settingType', sql.VarChar(50), normalized.setting_type)
                        .input('itemCode', sql.VarChar(50), normalized.item_code)
                        .input('value', sql.Decimal(10, 2), normalized.value)
                        .input('valueType', sql.VarChar(50), normalized.value_type)
                        .input('description', sql.NVarChar(500), normalized.description)
                        .input('isActive', sql.Bit, normalized.is_active)
                        .input('createdBy', sql.VarChar(50), userCode)
                        .input('updatedBy', sql.VarChar(50), userCode)
                        .query(insertQuery);

                    const newId = insertResult.recordset?.[0]?.newId;
                    results.push({
                        id: newId,
                        setting_type: normalized.setting_type,
                        item_code: normalized.item_code,
                        action: 'insert'
                    });
                }

                await transaction.commit();

                // Cache temizle
                this.clearB2BCache(`b2b_overrides_${customerCode}`);

                res.json({
                    success: true,
                    customerCode,
                    savedCount: results.length,
                    results,
                    userCode,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                await transaction.rollback();
                throw error;
            }
        } catch (error) {
            const details = {
                message: error?.message,
                code: error?.code,
                number: error?.number,
                state: error?.state,
                class: error?.class,
                lineNumber: error?.lineNumber,
                procName: error?.procName,
                serverName: error?.serverName,
                originalError: error?.originalError?.message,
                precedingErrors: Array.isArray(error?.precedingErrors)
                    ? error.precedingErrors.map(e => ({ message: e.message, number: e.number, code: e.code }))
                    : undefined
            };
            console.error('❌ Müşteri overrides batch kaydetme hatası:', details);
            res.status(500).json({
                success: false,
                error: error?.message || 'Sunucu hatası',
                details,
                timestamp: new Date().toISOString()
            });
        }
    }
}

// Singleton instance oluştur
const b2bAdminController = new B2BAdminController();

// Export functions - ESKI YAPIYLA UYUMLU
module.exports = {
    getSettings: (req, res) => b2bAdminController.getSettings(req, res),
    updateSettings: (req, res) => b2bAdminController.updateSettings(req, res),
    getOrderDistributionSettings: (req, res) => b2bAdminController.getOrderDistributionSettings(req, res),
    updateOrderDistributionSettings: (req, res) => b2bAdminController.updateOrderDistributionSettings(req, res),
    getCampaigns: (req, res) => b2bAdminController.getCampaigns(req, res),
    saveCampaign: (req, res) => b2bAdminController.saveCampaign(req, res),
    deleteCampaign: (req, res) => b2bAdminController.deleteCampaign(req, res),
    getCustomerOverrides: (req, res) => b2bAdminController.getCustomerOverrides(req, res),
    saveCustomerOverride: (req, res) => b2bAdminController.saveCustomerOverride(req, res),
    saveCustomerOverridesBatch: (req, res) => b2bAdminController.saveCustomerOverridesBatch(req, res),
    getStatistics: (req, res) => b2bAdminController.getStatistics(req, res)
};