// /home/yunlu/b2b-app/controllers/b2bController.js - TAM GÜNCELLEME
const sql = require('mssql');

class B2BController {
    constructor() {
        const { b2bConfig } = require('../config/database');
        this.logoConfig = {
            server: '5.180.186.54',
            database: 'LOGOGO3',
            user: 'sa',
            password: 'Logo12345678',
            options: {
                encrypt: true,
                trustServerCertificate: true
            }
        };

        this.b2bConfig = b2bConfig;
        
        this.logoPool = null;
        this.b2bPool = null;
        this.startupTime = new Date();
    }

    async getGlobalSettingsForCustomer(req, res) {
        try {
            const pool = await this.getB2BConnection();

            const GLOBAL_CUSTOMER_CODE = '__GLOBAL__';
            const result = await pool.request()
                .input('customerCode', sql.VarChar(50), GLOBAL_CUSTOMER_CODE)
                .query(`
                    SELECT TOP 1 value
                    FROM B2B_TRADE_PRO.dbo.b2b_customer_overrides
                    WHERE customer_code = @customerCode
                      AND setting_type = 'buy_now_discount_rate'
                      AND item_code IS NULL
                      AND is_active = 1
                    ORDER BY id DESC
                `);

            const rate = result.recordset?.[0]?.value;

            return res.json({
                success: true,
                data: {
                    buy_now_discount_rate: Number(rate) || 0
                },
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    async getFiltersForCustomer(req, res) {
        try {
            const { customerCode } = req.query || {};

            if (!customerCode) {
                return res.status(400).json({
                    success: false,
                    error: 'Müşteri kodu gereklidir'
                });
            }

            const pool = await this.getLogoConnection();

            const manufacturersResult = await pool.request().query(`
                SELECT DISTINCT
                    NULLIF(LTRIM(RTRIM(I.STGRPCODE)), '') AS manufacturer
                FROM LG_013_ITEMS I
                WHERE I.ACTIVE = 0
                  AND I.CARDTYPE = 1
                  AND I.STGRPCODE IS NOT NULL
                  AND LEN(LTRIM(RTRIM(I.STGRPCODE))) > 0
                ORDER BY manufacturer
            `);

            const vehicleModelsResult = await pool.request().query(`
                SELECT DISTINCT
                    NULLIF(LTRIM(RTRIM(I.SPECODE)), '') AS vehicleModel
                FROM LG_013_ITEMS I
                WHERE I.ACTIVE = 0
                  AND I.CARDTYPE = 1
                  AND I.SPECODE IS NOT NULL
                  AND LEN(LTRIM(RTRIM(I.SPECODE))) > 0
                ORDER BY vehicleModel
            `);

            const manufacturers = (manufacturersResult.recordset || [])
                .map(r => r.manufacturer)
                .filter(Boolean);

            const vehicleModels = (vehicleModelsResult.recordset || [])
                .map(r => r.vehicleModel)
                .filter(Boolean);

            return res.json({
                success: true,
                customerCode,
                manufacturers,
                vehicleModels
            });
        } catch (error) {
            console.error('❌ Filtre listesi hatası:', error);
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    async getItemVisibilityOverrides(customerCode, productCodes) {
        try {
            if (!productCodes || productCodes.length === 0) {
                return new Map();
            }

            const b2bPool = await this.getB2BConnection();

            const normalizedCodes = Array.from(new Set(
                productCodes
                    .filter(Boolean)
                    .map(c => String(c).trim())
                    .filter(c => c.length > 0)
            ));

            if (normalizedCodes.length === 0) {
                return new Map();
            }

            const request = b2bPool.request();
            request.input('customerCode', sql.VarChar(50), String(customerCode || '').trim());
            request.input('globalCustomerCode', sql.VarChar(50), '__GLOBAL__');
            request.input('settingType', sql.VarChar(50), 'item_visibility');

            const placeholders = normalizedCodes.map((code, i) => {
                const name = `code${i}`;
                request.input(name, sql.VarChar(50), code);
                return `@${name}`;
            });

            const query = `
                WITH scoped AS (
                    SELECT
                        customer_code,
                        item_code,
                        value,
                        ROW_NUMBER() OVER (PARTITION BY customer_code, item_code ORDER BY id DESC) AS rn
                    FROM B2B_TRADE_PRO.dbo.b2b_customer_overrides
                    WHERE is_active = 1
                      AND setting_type = @settingType
                      AND item_code IN (${placeholders.join(', ')})
                      AND customer_code IN (@customerCode, @globalCustomerCode)
                )
                SELECT customer_code, item_code, value
                FROM scoped
                WHERE rn = 1;
            `;

            const result = await request.query(query);
            const map = new Map();

            for (const row of (result.recordset || [])) {
                const code = String(row.item_code || '').trim();
                if (!code) continue;

                const raw = String(row.value ?? '').trim().toLowerCase();
                const visible = raw === '1' || raw === 'true' || raw === 'yes' || raw === 'evet';

                if (!map.has(code)) {
                    map.set(code, { customer: null, global: null });
                }

                const entry = map.get(code);
                if (String(row.customer_code) === '__GLOBAL__') {
                    entry.global = visible;
                } else {
                    entry.customer = visible;
                }
            }

            return map;
        } catch (error) {
            console.error('❌ item_visibility override okunamadı:', error.message);
            return new Map();
        }
    }

    resolveVisibility(overrideEntry) {
        if (!overrideEntry) return true;
        if (overrideEntry.customer !== null && overrideEntry.customer !== undefined) return overrideEntry.customer;
        if (overrideEntry.global !== null && overrideEntry.global !== undefined) return overrideEntry.global;
        return true;
    }

    async getCustomerStockVisibility(customerCode) {
        try {
            const b2bPool = await this.getB2BConnection();

            let defaultResult;
            try {
                defaultResult = await b2bPool.request()
                    .input('key', sql.VarChar(100), 'show_stock_to_customer')
                    .query(`
                        SELECT TOP 1 setting_value
                        FROM B2B_TRADE_PRO.dbo.b2b_default_settings
                        WHERE setting_key = @key
                          AND (is_active = 1 OR is_active IS NULL)
                        ORDER BY setting_id DESC
                    `);
            } catch (e) {
                defaultResult = await b2bPool.request()
                    .input('key', sql.VarChar(100), 'show_stock_to_customer')
                    .query(`
                        SELECT TOP 1 setting_value
                        FROM B2B_TRADE_PRO.dbo.b2b_default_settings
                        WHERE setting_key = @key
                          AND (is_active = 1 OR is_active IS NULL)
                        ORDER BY id DESC
                    `);
            }

            let defaultShow = true;
            if (defaultResult.recordset && defaultResult.recordset.length > 0) {
                const v = String(defaultResult.recordset[0].setting_value ?? '').trim().toLowerCase();
                defaultShow = v === '1' || v === 'true' || v === 'yes' || v === 'evet';
            }

            const overrideResult = await b2bPool.request()
                .input('customerCode', sql.VarChar(50), customerCode)
                .query(`
                    SELECT TOP 1 value
                    FROM B2B_TRADE_PRO.dbo.b2b_customer_overrides
                    WHERE customer_code = @customerCode
                      AND setting_type = 'show_stock'
                      AND item_code IS NULL
                      AND is_active = 1
                    ORDER BY id DESC
                `);

            if (overrideResult.recordset && overrideResult.recordset.length > 0) {
                const v = String(overrideResult.recordset[0].value ?? '').trim().toLowerCase();
                return v === '1' || v === 'true' || v === 'yes' || v === 'evet';
            }

            return defaultShow;
        } catch (error) {
            console.error('❌ show_stock ayarı okunamadı:', error.message);
            return true;
        }
    }

    async getActiveWarehouses(customerCode) {
        try {
            const b2bPool = await this.getB2BConnection();

            let defaultResult;
            try {
                defaultResult = await b2bPool.request()
                    .input('key', sql.VarChar(100), 'active_warehouses_invenno')
                    .query(`
                        SELECT TOP 1 setting_value
                        FROM B2B_TRADE_PRO.dbo.b2b_default_settings
                        WHERE setting_key = @key
                          AND (is_active = 1 OR is_active IS NULL)
                        ORDER BY setting_id DESC
                    `);
            } catch (e) {
                defaultResult = await b2bPool.request()
                    .input('key', sql.VarChar(100), 'active_warehouses_invenno')
                    .query(`
                        SELECT TOP 1 setting_value
                        FROM B2B_TRADE_PRO.dbo.b2b_default_settings
                        WHERE setting_key = @key
                          AND (is_active = 1 OR is_active IS NULL)
                        ORDER BY id DESC
                    `);
            }

            let active = [1, 2];
            if (defaultResult.recordset && defaultResult.recordset.length > 0) {
                const raw = String(defaultResult.recordset[0].setting_value ?? '').trim();
                const parsed = raw
                    .split(',')
                    .map(v => parseInt(String(v).trim(), 10))
                    .filter(n => Number.isFinite(n));
                if (parsed.length > 0) active = parsed;
            }

            const overrideResult = await b2bPool.request()
                .input('customerCode', sql.VarChar(50), customerCode)
                .query(`
                    SELECT TOP 1 value
                    FROM B2B_TRADE_PRO.dbo.b2b_customer_overrides
                    WHERE customer_code = @customerCode
                      AND setting_type = 'active_warehouses'
                      AND item_code IS NULL
                      AND is_active = 1
                    ORDER BY id DESC
                `);

            if (overrideResult.recordset && overrideResult.recordset.length > 0) {
                const raw = String(overrideResult.recordset[0].value ?? '').trim();
                const parsed = raw
                    .split(',')
                    .map(v => parseInt(String(v).trim(), 10))
                    .filter(n => Number.isFinite(n));
                if (parsed.length > 0) active = parsed;
            }

            return Array.from(new Set(active));
        } catch (error) {
            console.error('❌ active_warehouses ayarı okunamadı:', error.message);
            return [1, 2];
        }
    }

    // ====================================================
    // 🚀 0. HELPER FONKSİYONLAR
    // ====================================================
    decodeUserData(req) {
        try {
            const base64Data = req.headers['x-user-data-base64'];
            if (base64Data) {
                const decodedString = Buffer.from(base64Data, 'base64').toString('utf-8');
                return JSON.parse(decodedString);
            }
            
            const userData = req.headers['x-user-data'];
            if (userData) {
                return JSON.parse(userData);
            }
            
            return null;
        } catch (error) {
            console.error('❌ Kullanıcı verisi decode hatası:', error.message);
            return null;
        }
    }

    async healthCheck(req, res) {
        try {
            console.log('🏥 B2B Health check çağrıldı');
            
            let logoStatus = 'disconnected';
            try {
                const logoPool = await this.getLogoConnection();
                const logoResult = await logoPool.request().query('SELECT 1 as test');
                logoStatus = 'connected';
                console.log('✅ Logo DB bağlantı testi başarılı');
            } catch (logoError) {
                console.error('❌ Logo DB bağlantı testi başarısız:', logoError.message);
            }
            
            let b2bStatus = 'disconnected';
            try {
                const b2bPool = await this.getB2BConnection();
                const b2bResult = await b2bPool.request().query('SELECT 1 as test');
                b2bStatus = 'connected';
                console.log('✅ B2B DB bağlantı testi başarılı');
            } catch (b2bError) {
                console.error('❌ B2B DB bağlantı testi başarısız:', b2bError.message);
            }
            
            const isHealthy = logoStatus === 'connected' && b2bStatus === 'connected';
            
            res.json({
                success: true,
                data: {
                    status: isHealthy ? 'healthy' : 'degraded',
                    logo_database: logoStatus,
                    b2b_database: b2bStatus,
                    uptime_seconds: Math.floor((new Date() - this.startupTime) / 1000),
                    timestamp: new Date().toISOString(),
                    message: isHealthy ? 'B2B API sağlıklı çalışıyor' : 'B2B API kısıtlı modda'
                }
            });
            
        } catch (error) {
            console.error('❌ Health check hatası:', error.message);
            res.status(500).json({
                success: false,
                error: error.message,
                data: {
                    status: 'unhealthy',
                    logo_database: 'error',
                    b2b_database: 'error',
                    uptime_seconds: Math.floor((new Date() - this.startupTime) / 1000),
                    timestamp: new Date().toISOString(),
                    message: 'B2B API sağlıksız durumda'
                }
            });
        }
    }

    async getLogoConnection() {
        try {
            if (this.logoPool && this.logoPool.connected) return this.logoPool;

            const pool = new sql.ConnectionPool(this.logoConfig);
            await pool.connect();
            this.logoPool = pool;
            console.log('✅ Logo veritabanı bağlantısı başarılı');
            return pool;
        } catch (error) {
            console.error('❌ Logo veritabanı bağlantı hatası:', error);
            throw error;
        }
    }

    async getB2BConnection() {
        try {
            if (this.b2bPool && this.b2bPool.connected) return this.b2bPool;

            const pool = new sql.ConnectionPool(this.b2bConfig);
            await pool.connect();
            this.b2bPool = pool;
            console.log('✅ B2B veritabanı bağlantısı başarılı');
            return pool;
        } catch (error) {
            console.error('❌ B2B veritabanı bağlantı hatası:', error);
            throw error;
        }
    }

    async getProductsForCustomer(req, res) {
        try {
            const { customerCode, limit = 50, offset = 0 } = req.query;
            
            if (!customerCode) {
                return res.status(400).json({
                    success: false,
                    error: 'Müşteri kodu gereklidir'
                });
            }

            console.log(`🛒 B2B Ürün listesi: ${customerCode}, limit: ${limit}, offset: ${offset}`);
            
            const userData = this.decodeUserData(req);
            if (userData) {
                console.log('✅ Kullanıcı verisi başarıyla decode edildi');
            }
            
            const pool = await this.getLogoConnection();
            
            const query = `
                SELECT
                    I.LOGICALREF as id,
                    I.CODE as productCode,
                    I.NAME as productName,
                    I.PRODUCERCODE as oemCode,
                    I.STGRPCODE as manufacturer,
                    I.SPECODE as vehicleModel,
                    I.SPECODE2 as centralShelf,
                    I.SPECODE3 as bostanciShelf,
                    I.SPECODE4 as ikitelliShelf,
                    I.ACTIVE as isActive,

                    ISNULL(SUM(CASE WHEN S.INVENNO = 0 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) as centralStock,
                    ISNULL(SUM(CASE WHEN S.INVENNO = 1 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) as ikitelliStock,
                    ISNULL(SUM(CASE WHEN S.INVENNO = 2 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) as bostanciStock,
                    ISNULL(SUM(CASE WHEN S.INVENNO = 3 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) as depotStock,
                    ISNULL(SUM(S.ONHAND - S.RESERVED), 0) as totalStock,

                    ISNULL(P.PRICE, 0) as unitPrice,
                    ISNULL(P.CURRENCY, 160) as currencyCode,
                    CASE ISNULL(P.CURRENCY, 160)
                        WHEN 1 THEN 'USD'
                        WHEN 20 THEN 'EUR'
                        WHEN 17 THEN 'GBP'
                        WHEN 160 THEN 'TL'
                        ELSE 'TL'
                    END as currency

                FROM LG_013_ITEMS I
                LEFT JOIN LV_013_01_STINVTOT S ON S.STOCKREF = I.LOGICALREF
                LEFT JOIN LG_013_PRCLIST P ON P.CARDREF = I.LOGICALREF
                    AND P.PTYPE IN (1, 2)
                    AND P.PRIORITY = 0
                    AND P.ACTIVE IN (0, 1)
                GROUP BY I.LOGICALREF, I.CODE, I.NAME, I.PRODUCERCODE, I.STGRPCODE,
                         I.SPECODE, I.SPECODE2, I.SPECODE3, I.SPECODE4, I.ACTIVE,
                         P.PRICE, P.CURRENCY
                ORDER BY I.CODE
                OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
            `;
            
            const result = await pool.request()
                .input('offset', sql.Int, parseInt(offset))
                .input('limit', sql.Int, parseInt(limit))
                .query(query);
            
            console.log(`✅ B2B: ${result.recordset.length} ürün bulundu`);
            
            const activeWarehouses = await this.getActiveWarehouses(customerCode);
            const showStock = await this.getCustomerStockVisibility(customerCode);

            const productsWithDiscounts = await Promise.all(
                result.recordset.map(async (product) => {
                    const discounts = await this.calculateDiscountsForCustomer(
                        product.productCode, 
                        customerCode,
                        pool,
                        product.manufacturer
                    );

                    const centralStock = Number(product.centralStock || 0);
                    const ikitelliStock = Number(product.ikitelliStock || 0);
                    const bostanciStock = Number(product.bostanciStock || 0);
                    const depotStock = Number(product.depotStock || 0);
                    const totalStock = (activeWarehouses || []).reduce((sum, inv) => {
                        if (inv === 0) return sum + centralStock;
                        if (inv === 1) return sum + ikitelliStock;
                        if (inv === 2) return sum + bostanciStock;
                        if (inv === 3) return sum + depotStock;
                        return sum;
                    }, 0);

                    const safeCentralStock = showStock ? centralStock : 0;
                    const safeIkitelliStock = showStock ? ikitelliStock : 0;
                    const safeBostanciStock = showStock ? bostanciStock : 0;
                    const safeDepotStock = showStock ? depotStock : 0;
                    const safeTotalStock = showStock ? totalStock : 0;
                    
                    return {
                        id: product.id,
                        productCode: product.productCode,
                        productName: product.productName,
                        oemCode: product.oemCode,
                        manufacturer: product.manufacturer,
                        vehicleModel: product.vehicleModel,
                        centralShelf: product.centralShelf,
                        bostanciShelf: product.bostanciShelf,
                        ikitelliShelf: product.ikitelliShelf,
                        isActive: product.isActive,
                        centralStock: product.centralStock,
                        ikitelliStock: product.ikitelliStock,
                        bostanciStock: product.bostanciStock,
                        depotStock: product.depotStock,
                        totalStock: totalStock,
                        unitPrice: product.unitPrice,
                        currencyCode: product.currencyCode,
                        currency: product.currency,
                        discounts: discounts.discounts,
                        totalDiscountRate: discounts.totalDiscountRate,
                        hasCampaign: discounts.hasCampaign,
                        finalPrice: this.calculateFinalPrice(
                            product.unitPrice, 
                            discounts.totalDiscountRate
                        ),
                        calculationMethod: discounts.calculationMethod,
                        customerCode: customerCode
                    };
                })
            );

            const visibilityMap = await this.getItemVisibilityOverrides(
                customerCode,
                productsWithDiscounts.map(p => p.productCode)
            );

            const filteredProducts = productsWithDiscounts.filter(p =>
                this.resolveVisibility(visibilityMap.get(p.productCode))
            );

            if (!showStock) {
                filteredProducts.forEach(p => {
                    p.centralStock = 0;
                    p.ikitelliStock = 0;
                    p.bostanciStock = 0;
                    p.depotStock = 0;
                    p.totalStock = 0;
                });
            }
            
            res.json({
                success: true,
                data: filteredProducts,
                count: filteredProducts.length,
                show_stock: showStock,
                active_warehouses: activeWarehouses,
                customerCode: customerCode,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('❌ B2B Ürün listesi hatası:', error.message);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    async calculateDiscountsForCustomer(productCode, customerCode, pool, manufacturerCode) {
        try {
            console.log(`💰 B2B İskonto hesaplanıyor: ${productCode} için ${customerCode}`);
            
            const b2bPool = await this.getB2BConnection();

            const priorityPolicy = await this.getGlobalPriorityDiscountPolicy(b2bPool);
            const inScope = this.isPriorityPolicyInScope({
                policy: priorityPolicy,
                productCode,
                manufacturerCode
            });

            const effectivePriorityRule = inScope
                ? this.selectEffectivePriorityRule({
                    policy: priorityPolicy,
                    productCode,
                    manufacturerCode
                })
                : null;
            
            if (inScope && !priorityPolicy.disableCampaigns && !effectivePriorityRule) {
                const campaignDiscount = await this.getCampaignDiscount(customerCode, productCode, b2bPool);
                if (campaignDiscount && campaignDiscount.rate > 0) {
                    const allowCampaign = !(priorityPolicy && priorityPolicy.disableCampaigns);
                    if (allowCampaign) {
                        console.log(`🎯 Kampanya iskontosu bulundu: %${campaignDiscount.rate}`);
                        return {
                            hasCampaign: true,
                            campaignDiscount,
                            discounts: [{
                                type: 'CAMPAIGN',
                                rate: campaignDiscount.rate,
                                description: `Kampanya İndirimi (%${campaignDiscount.rate})`,
                                source: 'B2B_CAMPAIGN',
                                campaignName: campaignDiscount.campaignName
                            }],
                            totalDiscountRate: campaignDiscount.rate,
                            calculationMethod: 'CAMPAIGN_DISCOUNT'
                        };
                    }
                }
            }
            
            const defaultDiscounts = await this.getDefaultDiscounts(b2bPool);
            
            const settings = await this.getCustomerDiscountSettings(customerCode, productCode, manufacturerCode, b2bPool);
            
            const generalRates = (settings.generalDiscounts && settings.generalDiscounts.length)
                ? settings.generalDiscounts
                : (defaultDiscounts.customer_discounts || []);
            
            const itemRate = settings.itemDiscount != null ? settings.itemDiscount : defaultDiscounts.item_discount;
            const manufacturerRate = settings.manufacturerDiscount != null ? settings.manufacturerDiscount : defaultDiscounts.manufacturer_discount;
            const priority = 'item>manufacturer>general';
            
            let discounts = this.buildDiscountListByPriority({
                priority,
                itemRate,
                manufacturerRate,
                generalRates
            });

            // Öncelikli iskonto kuralı eşleştiyse her şeyin önüne geçer.
            if (effectivePriorityRule && effectivePriorityRule.rates && effectivePriorityRule.rates.length) {
                discounts = this.buildPriorityDiscountList(effectivePriorityRule.rates, effectivePriorityRule.source);
            } else {
                // Backward-compatible: legacy single-policy behavior
                if (priorityPolicy && priorityPolicy.rates && priorityPolicy.rates.length) {
                    const primaryType = (discounts && discounts.length) ? String(discounts[0].type || '') : '';

                    const shouldOverrideByPriority =
                        (priorityPolicy.disableCustomerDiscounts && customerCode && String(customerCode) !== '__GLOBAL__')
                        || (priorityPolicy.disableItemDiscounts && primaryType === 'ITEM')
                        || (priorityPolicy.disableManufacturerDiscounts && primaryType === 'MANUFACTURER')
                        || (priorityPolicy.disableGeneralDiscounts && primaryType === 'GENERAL');

                    if (inScope && shouldOverrideByPriority) {
                        discounts = this.buildPriorityDiscountList(priorityPolicy.rates, 'GLOBAL_PRIORITY_DISCOUNT');
                    }
                }
            }

            const applied = this.applySequentialDiscounts(100, discounts.map(d => d.rate));
            const totalDiscountRate = applied.totalDiscountRate;

            console.log(`📊 B2B ${productCode} iskonto özeti:`, {
                priority,
                itemRate: `${itemRate}%`,
                manufacturerRate: `${manufacturerRate}%`,
                generalRates: generalRates.map(r => `${r}%`).join(', '),
                toplam: `${totalDiscountRate.toFixed(2)}%`,
                katman: discounts.length
            });
            
            return {
                hasCampaign: false,
                discounts,
                totalDiscountRate: parseFloat(totalDiscountRate.toFixed(2)),
                calculationMethod: priorityPolicy && priorityPolicy.rates && priorityPolicy.rates.length ? 'B2B_OVERLAY_OVERRIDES_WITH_PRIORITY_POLICY' : 'B2B_OVERLAY_OVERRIDES'
            };
            
        } catch (error) {
            console.error(`❌ B2B İskonto hesaplama hatası ${productCode}:`, error.message);
            return this.getFallbackDiscounts();
        }
    }

    async getGlobalPriorityDiscountPolicy(pool) {
        try {
            const GLOBAL_CUSTOMER_CODE = '__GLOBAL__';
            const query = `
                SELECT setting_type, value, item_code
                FROM B2B_TRADE_PRO.dbo.b2b_customer_overrides
                WHERE customer_code = @globalCode
                  AND is_active = 1
                  AND (
                        setting_type LIKE 'priority_discount_%'
                     OR setting_type LIKE 'priority_disable_%'
                     OR setting_type = 'priority_scope_item'
                     OR setting_type = 'priority_scope_manufacturer'
                     OR setting_type LIKE 'priority_rule_%'
                  )
            `;

            const result = await pool.request()
                .input('globalCode', sql.VarChar(100), GLOBAL_CUSTOMER_CODE)
                .query(query);

            const tiers = [];
            const scopeItems = new Set();
            const scopeManufacturers = new Set();
            const ruleMap = new Map();
            const flags = {
                disableCustomerDiscounts: false,
                disableGeneralDiscounts: false,
                disableManufacturerDiscounts: false,
                disableItemDiscounts: false,
                disableCampaigns: false,
                disableSpecialDiscounts: false
            };

            (result.recordset || []).forEach(r => {
                const st = String(r.setting_type || '').trim();
                const val = String(r.value == null ? '' : r.value).trim();
                const itemCode = String(r.item_code || '').trim();

                if (st.startsWith('priority_rule_')) {
                    const key = itemCode || 'GENERAL';
                    if (!ruleMap.has(key)) {
                        ruleMap.set(key, {
                            scopeKey: key,
                            ratesByIdx: new Map(),
                            disableCampaigns: false,
                            disableSpecialDiscounts: false,
                            disableCustomerDiscounts: false,
                            disableGeneralDiscounts: false,
                            disableManufacturerDiscounts: false,
                            disableItemDiscounts: false
                        });
                    }
                    const rule = ruleMap.get(key);

                    const rm = st.match(/^priority_rule_discount_(\d+)$/);
                    if (rm) {
                        const idx = Number(rm[1]);
                        const rate = Number(val);
                        if (idx > 0 && Number.isFinite(rate) && rate > 0) rule.ratesByIdx.set(idx, rate);
                        return;
                    }

                    const enabled = val === '1' || val.toLowerCase() === 'true';
                    if (st === 'priority_rule_disable_customer_discounts') rule.disableCustomerDiscounts = enabled;
                    else if (st === 'priority_rule_disable_general_discounts') rule.disableGeneralDiscounts = enabled;
                    else if (st === 'priority_rule_disable_manufacturer_discounts') rule.disableManufacturerDiscounts = enabled;
                    else if (st === 'priority_rule_disable_item_discounts') rule.disableItemDiscounts = enabled;
                    else if (st === 'priority_rule_disable_campaigns') rule.disableCampaigns = enabled;
                    else if (st === 'priority_rule_disable_special_discounts') rule.disableSpecialDiscounts = enabled;
                    return;
                }

                const m = st.match(/^priority_discount_(\d+)$/);
                if (m) {
                    const idx = Number(m[1]);
                    const rate = Number(val);
                    if (idx > 0 && Number.isFinite(rate) && rate > 0) tiers.push({ idx, rate });
                    return;
                }

                if (st === 'priority_scope_item') {
                    const code = String(r.item_code || '').trim();
                    if (code) scopeItems.add(code);
                    return;
                }
                if (st === 'priority_scope_manufacturer') {
                    const code = String(r.item_code || '').trim();
                    if (code) scopeManufacturers.add(code);
                    return;
                }

                const enabled = val === '1' || val.toLowerCase() === 'true';
                if (st === 'priority_disable_customer_discounts') flags.disableCustomerDiscounts = enabled;
                else if (st === 'priority_disable_general_discounts') flags.disableGeneralDiscounts = enabled;
                else if (st === 'priority_disable_manufacturer_discounts') flags.disableManufacturerDiscounts = enabled;
                else if (st === 'priority_disable_item_discounts') flags.disableItemDiscounts = enabled;
                else if (st === 'priority_disable_campaigns') flags.disableCampaigns = enabled;
                else if (st === 'priority_disable_special_discounts') flags.disableSpecialDiscounts = enabled;
            });

            return {
                rates: tiers.sort((a, b) => a.idx - b.idx).map(x => x.rate),
                scopeItems: Array.from(scopeItems),
                scopeManufacturers: Array.from(scopeManufacturers),
                rules: Array.from(ruleMap.values()).map(r => ({
                    scopeKey: r.scopeKey,
                    rates: Array.from(r.ratesByIdx.entries()).sort((a, b) => a[0] - b[0]).map(x => x[1]),
                    disableCustomerDiscounts: !!r.disableCustomerDiscounts,
                    disableGeneralDiscounts: !!r.disableGeneralDiscounts,
                    disableManufacturerDiscounts: !!r.disableManufacturerDiscounts,
                    disableItemDiscounts: !!r.disableItemDiscounts,
                    disableCampaigns: !!r.disableCampaigns,
                    disableSpecialDiscounts: !!r.disableSpecialDiscounts
                })),
                ...flags
            };
        } catch (error) {
            console.error('❌ B2B Öncelikli iskonto politikası okunamadı:', error.message);
            return {
                rates: [],
                scopeItems: [],
                scopeManufacturers: [],
                rules: [],
                disableCustomerDiscounts: false,
                disableGeneralDiscounts: false,
                disableManufacturerDiscounts: false,
                disableItemDiscounts: false,
                disableCampaigns: false,
                disableSpecialDiscounts: false
            };
        }
    }

    selectEffectivePriorityRule({ policy, productCode, manufacturerCode }) {
        const rules = (policy && Array.isArray(policy.rules)) ? policy.rules : [];
        if (!rules.length) return null;

        const pCode = String(productCode || '').trim();
        const mCode = String(manufacturerCode || '').trim();
        const byKey = new Map(rules.map(r => [String(r.scopeKey || '').trim(), r]));

        const itemKey = `ITEM:${pCode}`;
        const manKey = `MAN:${mCode}`;
        const generalKey = 'GENERAL';

        if (pCode && byKey.has(itemKey)) {
            return { ...byKey.get(itemKey), source: 'PRIORITY_RULE_ITEM' };
        }
        if (mCode && byKey.has(manKey)) {
            return { ...byKey.get(manKey), source: 'PRIORITY_RULE_MANUFACTURER' };
        }
        if (byKey.has(generalKey)) {
            return { ...byKey.get(generalKey), source: 'PRIORITY_RULE_GENERAL' };
        }
        return null;
    }

    isPriorityPolicyInScope({ policy, productCode, manufacturerCode }) {
        const p = policy || {};
        const itemList = Array.isArray(p.scopeItems) ? p.scopeItems : [];
        const manList = Array.isArray(p.scopeManufacturers) ? p.scopeManufacturers : [];

        const itemSet = itemList.length ? new Set(itemList.map(x => String(x || '').trim()).filter(Boolean)) : null;
        const manSet = manList.length ? new Set(manList.map(x => String(x || '').trim()).filter(Boolean)) : null;

        const pCode = String(productCode || '').trim();
        const mCode = String(manufacturerCode || '').trim();

        // Scope precedence: product > manufacturer > general
        if (itemSet) return itemSet.has(pCode);
        if (manSet) return manSet.has(mCode);
        return true;
    }

    buildPriorityDiscountList(rates, source) {
        return (Array.isArray(rates) ? rates : [])
            .map(r => Number(r) || 0)
            .filter(r => r > 0)
            .map((r, idx) => ({
                type: 'PRIORITY',
                rate: r,
                description: `Öncelikli İskonto ${idx + 1} (%${r})`,
                source: source || 'GLOBAL_PRIORITY_DISCOUNT'
            }));
    }

    applySequentialDiscounts(baseAmount, rates) {
        let current = Number(baseAmount) || 0;
        const steps = [];
        (Array.isArray(rates) ? rates : [])
            .map(r => Number(r) || 0)
            .filter(r => r > 0)
            .forEach((rate) => {
                const amount = current * (rate / 100);
                current -= amount;
                steps.push({ rate, amount });
            });

        const totalDiscountRate = baseAmount > 0 ? (1 - (current / baseAmount)) * 100 : 0;
        return {
            netAmount: current,
            totalDiscountRate,
            steps
        };
    }

    buildDiscountListByPriority({ priority, itemRate, manufacturerRate, generalRates }) {
        const pr = String(priority || '').trim() || 'item>manufacturer>general';

        const blocks = {
            item: (Number(itemRate) || 0) > 0
                ? [{ type: 'ITEM', rate: Number(itemRate), description: `Ürün İskontosu (%${Number(itemRate)})`, source: 'CUSTOMER_OVERRIDE' }]
                : [],
            manufacturer: (Number(manufacturerRate) || 0) > 0
                ? [{ type: 'MANUFACTURER', rate: Number(manufacturerRate), description: `Üretici İskontosu (%${Number(manufacturerRate)})`, source: 'CUSTOMER_OVERRIDE' }]
                : [],
            general: (Array.isArray(generalRates) ? generalRates : [])
                .map(r => Number(r) || 0)
                .filter(r => r > 0)
                .map((r, idx) => ({
                    type: 'GENERAL',
                    rate: r,
                    description: `Genel İskonto ${idx + 1} (%${r})`,
                    source: 'CUSTOMER_OVERRIDE'
                }))
        };

        const order = pr.split('>').map(s => s.trim()).filter(Boolean);
        const validOrder = order.length ? order : ['item', 'manufacturer', 'general'];

        // OVERRIDE MODE: only the highest-priority non-empty block is applied.
        // This prevents stacking item/manufacturer/general/global together.
        for (const k of validOrder) {
            if (k === 'item' && blocks.item.length) return blocks.item;
            if (k === 'manufacturer' && blocks.manufacturer.length) return blocks.manufacturer;
            if (k === 'general' && blocks.general.length) return blocks.general;
        }

        return [];
    }

    async checkCampaignDiscount(productCode, pool) {
        try {
            const query = `
                SELECT TOP 1 
                    discount_rate,
                    campaign_name
                FROM B2B_TRADE_PRO.dbo.b2b_campaign_items
                WHERE item_code = @productCode
                AND is_active = 1
                AND (start_date IS NULL OR start_date <= GETDATE())
                AND (end_date IS NULL OR end_date >= GETDATE())
            `;
            
            const result = await pool.request()
                .input('productCode', sql.VarChar, productCode)
                .query(query);
            
            if (result.recordset.length > 0) {
                return {
                    hasCampaign: true,
                    rate: parseFloat(result.recordset[0].discount_rate),
                    campaignName: result.recordset[0].campaign_name
                };
            }
            
            return { hasCampaign: false, rate: 0 };
            
        } catch (error) {
            console.error(`❌ B2B Kampanya kontrol hatası ${productCode}:`, error.message);
            return { hasCampaign: false, rate: 0 };
        }
    }

    async getDefaultDiscounts(pool) {
        try {
            const query = `
                SELECT 
                    setting_key,
                    setting_value
                FROM B2B_TRADE_PRO.dbo.b2b_default_settings
                WHERE setting_key IN (
                    'default_item_discount',
                    'default_manufacturer_discount',
                    'default_customer_discount_1',
                    'default_customer_discount_2'
                )
            `;
            
            const result = await pool.request().query(query);
            
            const discounts = {
                item_discount: 10,
                manufacturer_discount: 5,
                customer_discounts: [20, 5]
            };
            
            result.recordset.forEach(row => {
                switch(row.setting_key) {
                    case 'default_item_discount':
                        discounts.item_discount = parseFloat(row.setting_value) || 10;
                        break;
                    case 'default_manufacturer_discount':
                        discounts.manufacturer_discount = parseFloat(row.setting_value) || 5;
                        break;
                    case 'default_customer_discount_1':
                        discounts.customer_discounts[0] = parseFloat(row.setting_value) || 20;
                        break;
                    case 'default_customer_discount_2':
                        discounts.customer_discounts[1] = parseFloat(row.setting_value) || 5;
                        break;
                }
            });
            
            return discounts;
            
        } catch (error) {
            console.error('❌ B2B Varsayılan iskontolar getirme hatası:', error.message);
            return {
                item_discount: 10,
                manufacturer_discount: 5,
                customer_discounts: [20, 5]
            };
        }
    }

    async getCustomerOverrides(customerCode, productCode, pool) {
        try {
            const productQuery = `
                SELECT 
                    setting_type,
                    value
                FROM B2B_TRADE_PRO.dbo.b2b_customer_overrides
                WHERE customer_code = @customerCode
                AND item_code = @productCode
                AND is_active = 1
            `;
            
            const productResult = await pool.request()
                .input('customerCode', sql.VarChar, customerCode)
                .input('productCode', sql.VarChar, productCode)
                .query(productQuery);
            
            if (productResult.recordset.length > 0) {
                const overrides = {};
                productResult.recordset.forEach(row => {
                    if (row.setting_type === 'item_discount') {
                        overrides.item_discount = parseFloat(row.value);
                    } else if (row.setting_type === 'manufacturer_discount') {
                        overrides.manufacturer_discount = parseFloat(row.value);
                    }
                });
                return overrides;
            }
            
            const generalQuery = `
                SELECT 
                    setting_type,
                    value
                FROM B2B_TRADE_PRO.dbo.b2b_customer_overrides
                WHERE customer_code = @customerCode
                AND item_code IS NULL
                AND is_active = 1
            `;
            
            const generalResult = await pool.request()
                .input('customerCode', sql.VarChar, customerCode)
                .query(generalQuery);
            
            const overrides = {};
            generalResult.recordset.forEach(row => {
                if (row.setting_type === 'item_discount') {
                    overrides.item_discount = parseFloat(row.value);
                } else if (row.setting_type === 'manufacturer_discount') {
                    overrides.manufacturer_discount = parseFloat(row.value);
                } else if (row.setting_type === 'customer_discount') {
                    overrides.customer_discounts = [parseFloat(row.value)];
                }
            });
            
            return overrides;
            
        } catch (error) {
            console.error(`❌ B2B Müşteri override getirme hatası ${customerCode}:`, error.message);
            return {};
        }
    }

    async getCustomerDiscountSettings(customerCode, productCode, manufacturerCode, pool) {
        try {
            const GLOBAL_CUSTOMER_CODE = '__GLOBAL__';
            const query = `
                SELECT customer_code, setting_type, item_code, value
                FROM B2B_TRADE_PRO.dbo.b2b_customer_overrides
                WHERE customer_code IN (@customerCode, @globalCode)
                  AND is_active = 1
                  AND (
                        (setting_type = 'discount_item' AND item_code = @productCode)
                     OR (setting_type = 'discount_manufacturer' AND item_code = @manufacturerCode)
                     OR (setting_type LIKE 'discount_general_%' AND item_code IS NULL)
                     OR (setting_type = 'discount_priority' AND item_code IS NULL)
                  )
            `;

            const result = await pool.request()
                .input('customerCode', sql.VarChar(100), customerCode)
                .input('globalCode', sql.VarChar(100), GLOBAL_CUSTOMER_CODE)
                .input('productCode', sql.VarChar(100), productCode)
                .input('manufacturerCode', sql.VarChar(100), manufacturerCode || '')
                .query(query);

            const customerSettings = {
                itemDiscount: null,
                manufacturerDiscount: null,
                generalDiscounts: [],
                priority: null
            };

            const globalSettings = {
                itemDiscount: null,
                manufacturerDiscount: null,
                generalDiscounts: [],
                priority: null
            };

            (result.recordset || []).forEach(r => {
                const owner = String(r.customer_code || '').trim();
                const st = String(r.setting_type || '').trim();
                const val = Number(r.value);
                const target = owner === customerCode ? customerSettings : globalSettings;

                if (st === 'discount_item') target.itemDiscount = Number.isFinite(val) ? val : target.itemDiscount;
                else if (st === 'discount_manufacturer') target.manufacturerDiscount = Number.isFinite(val) ? val : target.manufacturerDiscount;
                else if (st === 'discount_priority') {
                    const code = Number.isFinite(val) ? val : 0;
                    if (code === 2) target.priority = 'manufacturer>item>general';
                    else if (code === 3) target.priority = 'general>manufacturer>item';
                    else target.priority = 'item>manufacturer>general';
                } else if (/^discount_general_(\d+)$/.test(st)) {
                    const m = st.match(/^discount_general_(\d+)$/);
                    const idx = m ? Number(m[1]) : 0;
                    if (idx > 0 && Number.isFinite(val) && val > 0) {
                        target.generalDiscounts.push({ idx, rate: val });
                    }
                }
            });

            const merged = {
                itemDiscount: customerSettings.itemDiscount != null ? customerSettings.itemDiscount : globalSettings.itemDiscount,
                manufacturerDiscount: customerSettings.manufacturerDiscount != null ? customerSettings.manufacturerDiscount : globalSettings.manufacturerDiscount,
                priority: customerSettings.priority || globalSettings.priority,
                generalDiscounts: (customerSettings.generalDiscounts && customerSettings.generalDiscounts.length)
                    ? customerSettings.generalDiscounts
                    : globalSettings.generalDiscounts
            };

            merged.generalDiscounts = (merged.generalDiscounts || [])
                .sort((a, b) => a.idx - b.idx)
                .map(x => x.rate);

            // LogoGO3 PAYMENTREF-based general discount profile takes precedence.
            if (customerCode && customerCode !== GLOBAL_CUSTOMER_CODE) {
                const logoRates = await this.getLogoGeneralDiscountRates(customerCode);
                if (logoRates && logoRates.length) {
                    merged.generalDiscounts = logoRates;
                }
            }

            return merged;
        } catch (error) {
            console.error(`❌ B2B Discount settings read error ${customerCode}:`, error.message);
            return {
                itemDiscount: null,
                manufacturerDiscount: null,
                generalDiscounts: [],
                priority: null
            };
        }
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
        try {
            if (!customerCode) return [];
            const logoPool = await this.getLogoConnection();
            const request = logoPool.request();
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
        } catch (e) {
            console.error(`❌ Logo PAYMENTREF discount read error ${customerCode}:`, e && e.message ? e.message : e);
            return [];
        }
    }

    getFallbackDiscounts() {
        return {
            hasCampaign: false,
            discounts: [
                { type: 'ITEM', rate: 10, description: 'Malzeme İskontosu (%10)', source: 'FALLBACK' },
                { type: 'MANUFACTURER', rate: 5, description: 'Üretici İskontosu (%5)', source: 'FALLBACK' },
                { type: 'CUSTOMER', rate: 20, description: 'Müşteri İskontosu (%20)', source: 'FALLBACK' },
                { type: 'CUSTOMER', rate: 5, description: 'Müşteri İskontosu (%5)', source: 'FALLBACK' }
            ],
            totalDiscountRate: 35.02,
            calculationMethod: 'FALLBACK_DISCOUNTS'
        };
    }

    calculateFinalPrice(unitPrice, discountRate) {
        const discountAmount = unitPrice * (discountRate / 100);
        return unitPrice - discountAmount;
    }

    async searchProductsForCustomer(req, res) {
        try {
            const { customerCode, search, limit = 20 } = req.query;
            
            if (!customerCode || !search) {
                return res.status(400).json({
                    success: false,
                    error: 'Müşteri kodu ve arama terimi gereklidir'
                });
            }

            console.log(`🔍 B2B Ürün aranıyor: "${search}" için ${customerCode}`);
            
            const userData = this.decodeUserData(req);
            if (userData) {
                console.log('✅ Kullanıcı verisi başarıyla decode edildi');
            }
            
            const pool = await this.getLogoConnection();
            
            const query = `
                SELECT
                    I.LOGICALREF as id,
                    I.CODE as productCode,
                    I.NAME as productName,
                    I.PRODUCERCODE as oemCode,
                    I.STGRPCODE as manufacturer,
                    I.SPECODE as vehicleModel,
                    I.SPECODE2 as centralShelf,
                    I.SPECODE3 as bostanciShelf,
                    I.SPECODE4 as ikitelliShelf,
                    I.ACTIVE as isActive,

                    ISNULL(SUM(CASE WHEN S.INVENNO = 0 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) as centralStock,
                    ISNULL(SUM(CASE WHEN S.INVENNO = 1 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) as ikitelliStock,
                    ISNULL(SUM(CASE WHEN S.INVENNO = 2 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) as bostanciStock,
                    ISNULL(SUM(CASE WHEN S.INVENNO = 3 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) as depotStock,
                    ISNULL(SUM(S.ONHAND - S.RESERVED), 0) as totalStock,

                    ISNULL(P.PRICE, 0) as unitPrice,
                    ISNULL(P.CURRENCY, 160) as currencyCode,
                    CASE ISNULL(P.CURRENCY, 160)
                        WHEN 1 THEN 'USD'
                        WHEN 20 THEN 'EUR'
                        WHEN 17 THEN 'GBP'
                        WHEN 160 THEN 'TL'
                        ELSE 'TL'
                    END as currency

                FROM LG_013_ITEMS I
                LEFT JOIN LV_013_01_STINVTOT S ON S.STOCKREF = I.LOGICALREF
                LEFT JOIN LG_013_PRCLIST P ON P.CARDREF = I.LOGICALREF
                    AND P.PTYPE IN (1, 2)
                    AND P.PRIORITY = 0
                    AND P.ACTIVE IN (0, 1)
                WHERE (I.CODE LIKE @search OR I.NAME LIKE @search)
                GROUP BY I.LOGICALREF, I.CODE, I.NAME, I.PRODUCERCODE, I.STGRPCODE,
                         I.SPECODE, I.SPECODE2, I.SPECODE3, I.SPECODE4, I.ACTIVE,
                         P.PRICE, P.CURRENCY
                ORDER BY I.CODE
                OFFSET 0 ROWS FETCH NEXT @limit ROWS ONLY
            `;
            
            const searchParam = `%${search}%`;
            const result = await pool.request()
                .input('search', sql.VarChar, searchParam)
                .input('limit', sql.Int, parseInt(limit))
                .query(query);
            
            const productsWithDiscounts = await Promise.all(
                result.recordset.map(async (product) => {
                    const discounts = await this.calculateDiscountsForCustomer(
                        product.productCode, 
                        customerCode,
                        pool,
                        product.manufacturer
                    );
                    
                    return {
                        ...product,
                        discounts: discounts.discounts,
                        totalDiscountRate: discounts.totalDiscountRate,
                        hasCampaign: discounts.hasCampaign,
                        finalPrice: this.calculateFinalPrice(
                            product.unitPrice, 
                            discounts.totalDiscountRate
                        )
                    };
                })
            );

            const visibilityMap = await this.getItemVisibilityOverrides(
                customerCode,
                productsWithDiscounts.map(p => p.productCode)
            );

            const filteredProducts = productsWithDiscounts.filter(p =>
                this.resolveVisibility(visibilityMap.get(p.productCode))
            );

            const showStock = await this.getCustomerStockVisibility(customerCode);

            if (!showStock) {
                filteredProducts.forEach(p => {
                    p.centralStock = 0;
                    p.ikitelliStock = 0;
                    p.bostanciStock = 0;
                    p.depotStock = 0;
                    p.totalStock = 0;
                });
            }
            
            res.json({
                success: true,
                data: filteredProducts,
                count: filteredProducts.length,
                show_stock: showStock,
                search: search,
                customerCode: customerCode,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('❌ B2B Ürün arama hatası:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    async getProductDetailForCustomer(req, res) {
        try {
            const { code } = req.params;
            const { customerCode } = req.query;
            
            if (!customerCode) {
                return res.status(400).json({
                    success: false,
                    error: 'Müşteri kodu gereklidir'
                });
            }

            console.log(`📦 B2B Ürün detayı getiriliyor: ${code} için ${customerCode}`);
            
            const userData = this.decodeUserData(req);
            if (userData) {
                console.log('✅ Kullanıcı verisi başarıyla decode edildi');
            }
            
            const pool = await this.getLogoConnection();
            
            const query = `
                SELECT
                    I.LOGICALREF as id,
                    I.CODE as productCode,
                    I.NAME as productName,
                    I.PRODUCERCODE as oemCode,
                    I.STGRPCODE as manufacturer,
                    I.SPECODE as vehicleModel,
                    I.SPECODE2 as centralShelf,
                    I.SPECODE3 as bostanciShelf,
                    I.SPECODE4 as ikitelliShelf,
                    I.ACTIVE as isActive,

                    ISNULL(SUM(CASE WHEN S.INVENNO = 0 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) as centralStock,
                    ISNULL(SUM(CASE WHEN S.INVENNO = 1 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) as ikitelliStock,
                    ISNULL(SUM(CASE WHEN S.INVENNO = 2 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) as bostanciStock,
                    ISNULL(SUM(CASE WHEN S.INVENNO = 3 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) as depotStock,
                    ISNULL(SUM(S.ONHAND - S.RESERVED), 0) as totalStock,

                    ISNULL(P.PRICE, 0) as unitPrice,
                    ISNULL(P.CURRENCY, 160) as currencyCode,
                    CASE ISNULL(P.CURRENCY, 160)
                        WHEN 1 THEN 'USD'
                        WHEN 20 THEN 'EUR'
                        WHEN 17 THEN 'GBP'
                        WHEN 160 THEN 'TL'
                        ELSE 'TL'
                    END as currency

                FROM LG_013_ITEMS I
                LEFT JOIN LV_013_01_STINVTOT S ON S.STOCKREF = I.LOGICALREF
                LEFT JOIN LG_013_PRCList P ON P.CARDREF = I.LOGICALREF
                    AND P.PTYPE IN (1, 2)
                    AND P.PRIORITY = 0
                    AND P.ACTIVE IN (0, 1)
                WHERE I.CODE = @code
                GROUP BY I.LOGICALREF, I.CODE, I.NAME, I.PRODUCERCODE, I.STGRPCODE,
                         I.SPECODE, I.SPECODE2, I.SPECODE3, I.SPECODE4, I.ACTIVE,
                         P.PRICE, P.CURRENCY
            `;
            
            const result = await pool.request()
                .input('code', sql.VarChar, code)
                .query(query);
            
            if (result.recordset.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Ürün bulunamadı'
                });
            }
            
            const product = result.recordset[0];

            const visibilityMap = await this.getItemVisibilityOverrides(customerCode, [product.productCode]);
            const visible = this.resolveVisibility(visibilityMap.get(product.productCode));
            if (!visible) {
                return res.status(404).json({
                    success: false,
                    error: 'Ürün bulunamadı'
                });
            }

            const activeWarehouses = await this.getActiveWarehouses(customerCode);
            const centralStock = Number(product.centralStock || 0);
            const ikitelliStock = Number(product.ikitelliStock || 0);
            const bostanciStock = Number(product.bostanciStock || 0);
            const depotStock = Number(product.depotStock || 0);
            const totalStock = (activeWarehouses || []).reduce((sum, inv) => {
                if (inv === 0) return sum + centralStock;
                if (inv === 1) return sum + ikitelliStock;
                if (inv === 2) return sum + bostanciStock;
                if (inv === 3) return sum + depotStock;
                return sum;
            }, 0);
            
            const discounts = await this.calculateDiscountsForCustomer(
                product.productCode, 
                customerCode,
                pool,
                product.manufacturer
            );
            
            const response = {
                ...product,
                totalStock: totalStock,
                discounts: discounts.discounts,
                totalDiscountRate: discounts.totalDiscountRate,
                hasCampaign: discounts.hasCampaign,
                finalPrice: this.calculateFinalPrice(
                    product.unitPrice, 
                    discounts.totalDiscountRate
                ),
                calculationMethod: discounts.calculationMethod,
                customerCode: customerCode
            };

            const showStock = await this.getCustomerStockVisibility(customerCode);

            if (!showStock) {
                response.centralStock = 0;
                response.ikitelliStock = 0;
                response.bostanciStock = 0;
                response.depotStock = 0;
                response.totalStock = 0;
            }
            
            res.json({
                success: true,
                data: response,
                active_warehouses: activeWarehouses,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('❌ B2B Ürün detayı getirme hatası:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    async calculateCart(req, res) {
        try {
            const { customerCode, items } = req.body;
            
            if (!customerCode || !items || !Array.isArray(items)) {
                return res.status(400).json({
                    success: false,
                    error: 'Müşteri kodu ve ürün listesi gereklidir'
                });
            }

            console.log(`🛍️  B2B Sepet hesaplanıyor: ${customerCode} için ${items.length} ürün`);
            
            const userData = this.decodeUserData(req);
            if (userData) {
                console.log('✅ Kullanıcı verisi başarıyla decode edildi');
            }
            
            const pool = await this.getLogoConnection();
            
            const activeWarehouses = await this.getActiveWarehouses(customerCode);

            const showStock = await this.getCustomerStockVisibility(customerCode);

            const cartItems = await Promise.all(
                items.map(async (item) => {
                    const query = `
                        SELECT
                            I.LOGICALREF as id,
                            I.CODE as productCode,
                            I.NAME as productName,
                            I.PRODUCERCODE as oemCode,
                            I.STGRPCODE as manufacturer,
                            I.SPECODE as vehicleModel,
                            I.SPECODE2 as centralShelf,
                            I.SPECODE3 as bostanciShelf,
                            I.SPECODE4 as ikitelliShelf,
                            I.ACTIVE as isActive,

                            ISNULL(SUM(CASE WHEN S.INVENNO = 0 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) as centralStock,
                            ISNULL(SUM(CASE WHEN S.INVENNO = 1 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) as ikitelliStock,
                            ISNULL(SUM(CASE WHEN S.INVENNO = 2 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) as bostanciStock,
                            ISNULL(SUM(CASE WHEN S.INVENNO = 3 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) as depotStock,
                            ISNULL(SUM(S.ONHAND - S.RESERVED), 0) as totalStock,

                            ISNULL(P.PRICE, 0) as unitPrice,
                            ISNULL(P.CURRENCY, 160) as currencyCode,
                            CASE ISNULL(P.CURRENCY, 160)
                                WHEN 1 THEN 'USD'
                                WHEN 20 THEN 'EUR'
                                WHEN 17 THEN 'GBP'
                                WHEN 160 THEN 'TL'
                                ELSE 'TL'
                            END as currency

                        FROM LG_013_ITEMS I
                        LEFT JOIN LV_013_01_STINVTOT S ON S.STOCKREF = I.LOGICALREF
                        LEFT JOIN LG_013_PRCLIST P ON P.CARDREF = I.LOGICALREF
                            AND P.PTYPE IN (1, 2)
                            AND P.PRIORITY = 0
                            AND P.ACTIVE IN (0, 1)
                        WHERE I.ACTIVE = 0
                        AND I.CODE = @code
                        GROUP BY I.LOGICALREF, I.CODE, I.NAME, I.PRODUCERCODE, I.STGRPCODE,
                                 I.SPECODE, I.SPECODE2, I.SPECODE3, I.SPECODE4, I.ACTIVE,
                                 P.PRICE, P.CURRENCY
                    `;
                    
                    const result = await pool.request()
                        .input('code', sql.VarChar, item.code)
                        .query(query);
                    
                    if (result.recordset.length === 0) {
                        throw new Error(`Ürün bulunamadı: ${item.code}`);
                    }
                    
                    const product = result.recordset[0];

                    const centralStock = Number(product.centralStock || 0);
                    const ikitelliStock = Number(product.ikitelliStock || 0);
                    const bostanciStock = Number(product.bostanciStock || 0);
                    const depotStock = Number(product.depotStock || 0);
                    const totalStock = (activeWarehouses || []).reduce((sum, inv) => {
                        if (inv === 0) return sum + centralStock;
                        if (inv === 1) return sum + ikitelliStock;
                        if (inv === 2) return sum + bostanciStock;
                        if (inv === 3) return sum + depotStock;
                        return sum;
                    }, 0);
                    
                    const discounts = await this.calculateDiscountsForCustomer(
                        product.productCode, 
                        customerCode,
                        pool,
                        product.manufacturer
                    );
                    
                    const quantity = parseInt(item.quantity) || 1;
                    const unitPrice = parseFloat(product.unitPrice);
                    const discountRate = discounts.totalDiscountRate;
                    const discountAmount = unitPrice * (discountRate / 100);
                    const finalUnitPrice = unitPrice - discountAmount;
                    const totalPrice = finalUnitPrice * quantity;
                    
                    return {
                        ...product,
                        totalStock: totalStock,
                        quantity: quantity,
                        requestedQuantity: item.quantity,
                        unitPrice: unitPrice,
                        discounts: discounts.discounts,
                        discountRate: discountRate,
                        discountAmount: discountAmount,
                        finalUnitPrice: finalUnitPrice,
                        totalPrice: totalPrice,
                        hasCampaign: discounts.hasCampaign,
                        calculationMethod: discounts.calculationMethod,
                        availableStock: showStock ? Math.max(0, totalStock) : 0,
                        canOrder: showStock ? (quantity <= Math.max(0, totalStock)) : true
                    };
                })
            );
            
            const totals = {
                totalItems: cartItems.length,
                totalQuantity: cartItems.reduce((sum, item) => sum + item.quantity, 0),
                totalUnitPrice: cartItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
                totalDiscountAmount: cartItems.reduce((sum, item) => sum + item.discountAmount * item.quantity, 0),
                totalFinalPrice: cartItems.reduce((sum, item) => sum + item.totalPrice, 0),
                totalDiscountRate: cartItems.length > 0 
                    ? (cartItems.reduce((sum, item) => sum + item.discountRate, 0) / cartItems.length)
                    : 0
            };
            
            res.json({
                success: true,
                data: {
                    items: cartItems,
                    totals: totals,
                    customerCode: customerCode,
                    currency: cartItems.length > 0 ? cartItems[0].currency : 'TL',
                    active_warehouses: activeWarehouses,
                    timestamp: new Date().toISOString()
                }
            });

        } catch (error) {
            console.error('❌ B2B Sepet hesaplama hatası:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    async getCustomerInfo(req, res) {
        try {
            const { code } = req.params;
            
            console.log(`👤 B2B Müşteri bilgileri getiriliyor: ${code}`);
            
            const pool = await this.getLogoConnection();
            
            const query = `
                SELECT 
                    CODE as customerCode,
                    DEFINITION_ as customerName,
                    SPECODE as specode,
                    CYPHCODE as cypherCode,
                    TELNRS1 as phone,
                    FAXNR as fax,
                    EMAILADDR as email,
                    ADDRESS1 as address
                FROM LG_013_CLCARD
                WHERE CODE = @code
                AND ACTIVE = 1
            `;
            
            const result = await pool.request()
                .input('code', sql.VarChar, code)
                .query(query);
            
            if (result.recordset.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Müşteri bulunamadı'
                });
            }
            
            const customer = result.recordset[0];
            
            try {
                const b2bPool = await this.getB2BConnection();
                const overridesQuery = `
                    SELECT COUNT(*) as override_count
                    FROM b2b_customer_overrides
                    WHERE customer_code = @customerCode
                    AND is_active = 1
                `;
                
                const overridesResult = await b2bPool.request()
                    .input('customerCode', sql.VarChar, code)
                    .query(overridesQuery);
                
                customer.hasOverrides = overridesResult.recordset[0].override_count > 0;
                customer.overrideCount = overridesResult.recordset[0].override_count;
                
            } catch (b2bError) {
                console.error('❌ B2B müşteri ayarları getirme hatası:', b2bError.message);
                customer.hasOverrides = false;
                customer.overrideCount = 0;
            }
            
            res.json({
                success: true,
                data: customer,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('❌ B2B Müşteri bilgileri getirme hatası:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    async getExchangeRates(req, res) {
        try {
            console.log('💱 B2B Döviz kurları getiriliyor');
            
            res.json({
                success: true,
                data: {
                    USD: { ForexBuying: 42.43, ForexSelling: 42.50 },
                    EUR: { ForexBuying: 49.45, ForexSelling: 49.55 },
                    GBP: { ForexBuying: 52.30, ForexSelling: 52.40 }
                },
                source: 'TCMB',
                timestamp: new Date().toISOString(),
                message: 'B2B API döviz kurları'
            });
        } catch (error) {
            console.error('❌ B2B Döviz kurları hatası:', error.message);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    async getProductsForAdmin(req, res) {
        try {
            const { 
                limit = 100, 
                offset = 0, 
                search = '',
                manufacturer = '',
                category = '',
                minStock = '',
                maxStock = '',
                activeOnly = 'true',
                sortBy = 'code',
                sortOrder = 'asc'
            } = req.query;
            
            console.log(`🔄 ADMIN: Ürünler yükleniyor - Limit: ${limit}, Offset: ${offset}, Search: "${search}"`);
            
            const pool = await this.getLogoConnection();
            
            let whereConditions = [];
            let inputParams = {};

            // Admin panelde LogoGO3'te pasif (ACTIVE=1) olan ürünler gösterilmesin
            whereConditions.push('I.ACTIVE = 0');
            
            if (search) {
                whereConditions.push('(I.CODE LIKE @search OR I.NAME LIKE @search OR I.PRODUCERCODE LIKE @search)');
                inputParams.search = `%${search}%`;
            }
            
            if (manufacturer) {
                whereConditions.push('I.STGRPCODE LIKE @manufacturer');
                inputParams.manufacturer = `%${manufacturer}%`;
            }
            
            if (category) {
                whereConditions.push('I.CYPHCODE LIKE @category');
                inputParams.category = `%${category}%`;
            }
            
            if (minStock !== '') {
                whereConditions.push('(ISNULL(SUM(S.ONHAND - S.RESERVED), 0) >= @minStock)');
                inputParams.minStock = parseInt(minStock);
            }
            
            if (maxStock !== '') {
                whereConditions.push('(ISNULL(SUM(S.ONHAND - S.RESERVED), 0) <= @maxStock)');
                inputParams.maxStock = parseInt(maxStock);
            }
            
            if (activeOnly === 'false') {
                console.log('⚠️ ADMIN: activeOnly=false isteği yok sayıldı (pasif ürünler listelenmez)');
            }
            
            let orderBy = 'I.CODE';
            switch(sortBy) {
                case 'name': orderBy = 'I.NAME'; break;
                case 'manufacturer': orderBy = 'I.STGRPCODE'; break;
                case 'stock': orderBy = 'totalStock'; break;
                case 'price': orderBy = 'unitPrice'; break;
                default: orderBy = 'I.CODE';
            }
            
            const orderDirection = sortOrder.toLowerCase() === 'desc' ? 'DESC' : 'ASC';
            
            const query = `
                SELECT
                    I.LOGICALREF as id,
                    I.CODE as productCode,
                    I.NAME as productName,
                    I.PRODUCERCODE as oemCode,
                    I.STGRPCODE as manufacturer,
                    I.CYPHCODE as category,
                    I.SPECODE as vehicleModel,
                    I.SPECODE2 as centralShelf,
                    I.SPECODE3 as bostanciShelf,
                    I.SPECODE4 as ikitelliShelf,
                    I.ACTIVE as isActive,

                    ISNULL(SUM(CASE WHEN S.INVENNO = 0 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) as centralStock,
                    ISNULL(SUM(CASE WHEN S.INVENNO = 1 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) as ikitelliStock,
                    ISNULL(SUM(CASE WHEN S.INVENNO = 2 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) as bostanciStock,
                    ISNULL(SUM(CASE WHEN S.INVENNO = 3 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) as depotStock,
                    ISNULL(SUM(S.ONHAND - S.RESERVED), 0) as totalStock,

                    ISNULL(P.PRICE, 0) as unitPrice,
                    ISNULL(P.CURRENCY, 160) as currencyCode,
                    CASE ISNULL(P.CURRENCY, 160)
                        WHEN 1 THEN 'USD'
                        WHEN 20 THEN 'EUR'
                        WHEN 17 THEN 'GBP'
                        WHEN 160 THEN 'TL'
                        ELSE 'TL'
                    END as currency

                FROM dbo.LG_013_ITEMS I
                LEFT JOIN dbo.LV_013_01_STINVTOT S ON S.STOCKREF = I.LOGICALREF
                LEFT JOIN dbo.LG_013_PRCLIST P ON P.CARDREF = I.LOGICALREF
                    AND P.PTYPE IN (1, 2)
                    AND P.PRIORITY = 0
                    AND P.ACTIVE IN (0, 1)
                ${whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : ''}
                GROUP BY I.LOGICALREF, I.CODE, I.NAME, I.PRODUCERCODE, I.STGRPCODE,
                         I.CYPHCODE, I.SPECODE, I.SPECODE2, I.SPECODE3, I.SPECODE4, I.ACTIVE,
                         P.PRICE, P.CURRENCY
                ORDER BY ${orderBy} ${orderDirection}
                OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
            `;
            
            const countQuery = `
                SELECT COUNT(DISTINCT I.LOGICALREF) as totalCount
                FROM dbo.LG_013_ITEMS I
                LEFT JOIN dbo.LV_013_01_STINVTOT S ON S.STOCKREF = I.LOGICALREF
                LEFT JOIN dbo.LG_013_PRCLIST P ON P.CARDREF = I.LOGICALREF
                    AND P.PTYPE IN (1, 2)
                    AND P.PRIORITY = 0
                    AND P.ACTIVE IN (0, 1)
                ${whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : ''}
            `;
            
            const request = pool.request();
            
            request.input('offset', sql.Int, parseInt(offset));
            request.input('limit', sql.Int, parseInt(limit));
            
            if (search) request.input('search', sql.VarChar, inputParams.search);
            if (manufacturer) request.input('manufacturer', sql.VarChar, inputParams.manufacturer);
            if (category) request.input('category', sql.VarChar, inputParams.category);
            if (minStock !== '') request.input('minStock', sql.Int, inputParams.minStock);
            if (maxStock !== '') request.input('maxStock', sql.Int, inputParams.maxStock);
            
            const [productsResult, countResult] = await Promise.all([
                request.query(query),
                pool.request().query(countQuery.replace(/@\w+/g, (match) => {
                    const paramName = match.substring(1);
                    return inputParams[paramName] !== undefined ? `'${inputParams[paramName]}'` : 'NULL';
                }))
            ]);
            
            const totalCount = countResult.recordset[0]?.totalCount || 0;
            const products = productsResult.recordset;
            
            console.log(`✅ ADMIN: ${products.length} ürün bulundu (Toplam: ${totalCount})`);

            const globalVisibilityMap = await this.getItemVisibilityOverrides('__GLOBAL__', products.map(p => p.productCode));
            
            const formattedProducts = products.map(item => {
                let globalDiscount = 10;
                let hasCampaign = false;

                const overrideEntry = globalVisibilityMap.get(item.productCode);
                const visible = this.resolveVisibility(overrideEntry);
                
                return {
                    code: item.productCode,
                    name: item.productName,
                    manufacturer: item.manufacturer || 'Belirsiz',
                    category: item.category || 'Genel',
                    price: {
                        original: parseFloat(item.unitPrice) || 0,
                        currency: item.currencyCode || 160
                    },
                    stock: {
                        total: parseInt(item.totalStock) || 0,
                        merkez: parseInt(item.centralStock) || 0,
                        ikitelli: parseInt(item.ikitelliStock) || 0,
                        bostanci: parseInt(item.bostanciStock) || 0,
                        depot: parseInt(item.depotStock) || 0
                    },
                    active: item.isActive === 0,
                    visibleToCustomers: visible,
                    oemCode: item.oemCode || '',
                    vehicleModel: item.vehicleModel || '',
                    shelves: {
                        central: item.centralShelf || '',
                        bostanci: item.bostanciShelf || '',
                        ikitelli: item.ikitelliShelf || ''
                    },
                    hasCampaign: hasCampaign,
                    globalDiscount: globalDiscount,
                    discounts: hasCampaign ? [] : [
                        { type: 'ITEM', rate: globalDiscount, description: `Temel İskonto (%${globalDiscount})` }
                    ],
                    currency: item.currency || 'TL',
                    unitPrice: parseFloat(item.unitPrice) || 0
                };
            });
            
            res.json({
                success: true,
                message: 'Admin ürünleri başarıyla yüklendi',
                data: formattedProducts,
                pagination: {
                    total: totalCount,
                    limit: parseInt(limit),
                    offset: parseInt(offset),
                    hasMore: (parseInt(offset) + parseInt(limit)) < totalCount
                },
                filters: {
                    search: search || '',
                    manufacturer: manufacturer || '',
                    category: category || '',
                    activeOnly: activeOnly === 'true',
                    sortBy: sortBy,
                    sortOrder: sortOrder
                },
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            console.error('❌ ADMIN ürün hatası:', error.message);
            console.error('Stack trace:', error.stack);
            res.status(500).json({
                success: false,
                error: error.message,
                details: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    }

    async updateProductStatusForAdmin(req, res) {
        try {
            const { productCode, active } = req.body || {};

            if (!productCode || typeof productCode !== 'string') {
                return res.status(400).json({
                    success: false,
                    error: 'productCode gereklidir'
                });
            }

            if (typeof active !== 'boolean') {
                return res.status(400).json({
                    success: false,
                    error: 'active alanı boolean olmalıdır'
                });
            }

            const b2bPool = await this.getB2BConnection();

            const normalizedCode = productCode.trim();
            const userData = this.decodeUserData(req);
            const userCode = userData?.user_code || userData?.cari_kodu || 'admin';

            const transaction = new sql.Transaction(b2bPool);
            await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);

            try {
                const deactivateQuery = `
                    UPDATE B2B_TRADE_PRO.dbo.b2b_customer_overrides
                    SET is_active = 0,
                        updated_at = GETDATE(),
                        updated_by = @updatedBy
                    WHERE customer_code = @customerCode
                      AND setting_type = @settingType
                      AND item_code = @itemCode
                      AND is_active = 1;
                `;

                const insertQuery = `
                    INSERT INTO B2B_TRADE_PRO.dbo.b2b_customer_overrides
                        (customer_code, setting_type, item_code, value, value_type, description, is_active, created_by, updated_by)
                    VALUES
                        (@customerCode, @settingType, @itemCode, @value, @valueType, @description, 1, @createdBy, @updatedBy);
                `;

                await new sql.Request(transaction)
                    .input('customerCode', sql.VarChar(50), '__GLOBAL__')
                    .input('settingType', sql.VarChar(50), 'item_visibility')
                    .input('itemCode', sql.VarChar(50), normalizedCode)
                    .input('updatedBy', sql.VarChar(50), userCode)
                    .query(deactivateQuery);

                await new sql.Request(transaction)
                    .input('customerCode', sql.VarChar(50), '__GLOBAL__')
                    .input('settingType', sql.VarChar(50), 'item_visibility')
                    .input('itemCode', sql.VarChar(50), normalizedCode)
                    .input('value', sql.VarChar(100), active ? '1' : '0')
                    .input('valueType', sql.VarChar(50), 'boolean')
                    .input('description', sql.NVarChar(500), 'Admin global ürün görünürlüğü')
                    .input('createdBy', sql.VarChar(50), userCode)
                    .input('updatedBy', sql.VarChar(50), userCode)
                    .query(insertQuery);

                await transaction.commit();
            } catch (err) {
                await transaction.rollback();
                throw err;
            }

            res.json({
                success: true,
                message: 'Ürün durumu güncellendi',
                data: {
                    productCode: normalizedCode,
                    active: active
                },
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('❌ ADMIN ürün durum güncelleme hatası:', error.message);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    async updateProductForAdmin(req, res) {
        try {
            const updates = req.body || {};
            const productCode = updates.code;

            if (!productCode || typeof productCode !== 'string') {
                return res.status(400).json({
                    success: false,
                    error: 'code gereklidir'
                });
            }

            res.json({
                success: true,
                message: 'Ürün güncellendi',
                data: {
                    code: productCode,
                    name: typeof updates.name === 'string' ? updates.name : undefined,
                    oemCode: typeof updates.oemCode === 'string' ? updates.oemCode : undefined,
                    manufacturer: typeof updates.manufacturer === 'string' ? updates.manufacturer : undefined,
                    category: typeof updates.category === 'string' ? updates.category : undefined,
                    description: typeof updates.description === 'string' ? updates.description : undefined,
                    adminNote: typeof updates.adminNote === 'string' ? updates.adminNote : undefined,
                    price: updates.price || undefined,
                    globalDiscount: updates.globalDiscount,
                    campaignDiscount: updates.campaignDiscount,
                    hasCampaign: updates.hasCampaign,
                    stock: updates.stock || undefined,
                    settings: updates.settings || undefined
                },
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('❌ ADMIN ürün güncelleme hatası:', error.message);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
}

const b2bController = new B2BController();

module.exports = {
    B2BController: B2BController,
    healthCheck: (req, res) => b2bController.healthCheck(req, res),
    getExchangeRates: (req, res) => b2bController.getExchangeRates(req, res),
    getProductsForAdmin: (req, res) => b2bController.getProductsForAdmin(req, res),
    updateProductStatusForAdmin: (req, res) => b2bController.updateProductStatusForAdmin(req, res),
    updateProductForAdmin: (req, res) => b2bController.updateProductForAdmin(req, res),
    getProductsForCustomer: (req, res) => b2bController.getProductsForCustomer(req, res),
    searchProductsForCustomer: (req, res) => b2bController.searchProductsForCustomer(req, res),
    getFiltersForCustomer: (req, res) => b2bController.getFiltersForCustomer(req, res),
    getGlobalSettingsForCustomer: (req, res) => b2bController.getGlobalSettingsForCustomer(req, res),
    getProductDetailForCustomer: (req, res) => b2bController.getProductDetailForCustomer(req, res),
    calculateCart: (req, res) => b2bController.calculateCart(req, res),
    getCustomerInfo: (req, res) => b2bController.getCustomerInfo(req, res),
    calculateDiscountsForCustomer: (productCode, customerCode, pool, manufacturerCode) => 
        b2bController.calculateDiscountsForCustomer(productCode, customerCode, pool, manufacturerCode)
};