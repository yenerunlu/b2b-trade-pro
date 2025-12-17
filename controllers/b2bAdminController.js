// /home/yunlu/b2b-app/controllers/b2bAdminController.js - BASE64 DESTEKLİ GÜNCELLENMİŞ VERSİYON
const sql = require('mssql');
const b2bConfig = {
    server: '5.180.186.54',
    database: 'B2B_TRADE_PRO',
    user: 'sa',
    password: 'Logo12345678',
    options: {
        encrypt: true,
        trustServerCertificate: true,
        enableArithAbort: true
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

class B2BAdminController {
    constructor() {
        this.b2bConfig = b2bConfig || {
            server: '5.180.186.54',
            database: 'B2B_TRADE_PRO',
            user: 'sa',
            password: 'Logo12345678',
            options: {
                encrypt: true,
                trustServerCertificate: true,
                enableArithAbort: true
            },
            pool: {
                max: 10,
                min: 0,
                idleTimeoutMillis: 30000
            }
        };
        
        this.b2bPool = null;
        this.cache = new Map();
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

    // B2B veritabanı bağlantısı
    async getB2BConnection() {
        try {
            if (!this.b2bPool || !this.b2bPool.connected) {
                console.log("🔗 B2B_TRADE_PRO bağlanıyor...");
                this.b2bPool = await sql.connect(this.b2bConfig);
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

            // Cache kontrolü
            const cacheKey = `b2b_overrides_${customerCode}`;
            if (this.cache.has(cacheKey)) {
                console.log('📦 Cache\'ten müşteri ayarları getiriliyor');
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
            
            const responseData = {
                success: true,
                data: result.recordset,
                customerCode: customerCode,
                count: result.recordset.length,
                user: userData ? {
                    user_code: userData.user_code || userData.cari_kodu,
                    user_name: userData.kullanici || userData.musteri_adi
                } : null,
                timestamp: new Date().toISOString()
            };

            // Cache'e kaydet (3 dakika)
            this.cache.set(cacheKey, responseData);
            setTimeout(() => this.cache.delete(cacheKey), 3 * 60 * 1000);
            
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

            const pool = await this.getB2BConnection();
            
            // Transaction başlat
            const transaction = new sql.Transaction(pool);
            await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
            
            try {
                let message = '';
                let logMessage = '';
                let overrideId = override.id;
                
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
                        .input('value', sql.VarChar(100), override.value.toString())
                        .input('valueType', sql.VarChar(50), override.value_type || 'percent')
                        .input('description', sql.NVarChar(500), override.description || '')
                        .input('isActive', sql.Bit, override.is_active !== undefined ? override.is_active : 1)
                        .input('updatedBy', sql.VarChar(50), userCode)
                        .query(updateQuery);
                        
                    message = 'Müşteri override başarıyla güncellendi';
                    logMessage = `Müşteri override güncellendi: ${override.customer_code} - ${override.setting_type}`;
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
                        .input('itemCode', sql.VarChar(50), override.item_code || null)
                        .input('value', sql.VarChar(100), override.value.toString())
                        .input('valueType', sql.VarChar(50), override.value_type || 'percent')
                        .input('description', sql.NVarChar(500), override.description || '')
                        .input('isActive', sql.Bit, override.is_active !== undefined ? override.is_active : 1)
                        .input('createdBy', sql.VarChar(50), userCode)
                        .input('updatedBy', sql.VarChar(50), userCode)
                        .query(insertQuery);

                    overrideId = insertResult.recordset?.[0]?.newId || overrideId;
                    message = 'Müşteri override başarıyla eklendi';
                    logMessage = `Yeni müşteri override eklendi: ${override.customer_code} - ${override.setting_type}`;
                    console.log(`✅ Yeni müşteri override eklendi: ${override.customer_code}`);
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
            console.error('❌ Müşteri override kaydetme hatası:', error.message);
            res.status(500).json({
                success: false,
                error: error.message,
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
    getCampaigns: (req, res) => b2bAdminController.getCampaigns(req, res),
    saveCampaign: (req, res) => b2bAdminController.saveCampaign(req, res),
    deleteCampaign: (req, res) => b2bAdminController.deleteCampaign(req, res),
    getCustomerOverrides: (req, res) => b2bAdminController.getCustomerOverrides(req, res),
    saveCustomerOverride: (req, res) => b2bAdminController.saveCustomerOverride(req, res),
    getStatistics: (req, res) => b2bAdminController.getStatistics(req, res)
};