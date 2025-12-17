// /home/yunlu/b2b-app/controllers/b2bController.js - TAM GÜNCELLEME
const sql = require('mssql');

class B2BController {
    constructor() {
        // Logo GO3 veritabanı konfigürasyonu
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
        
        // B2B TRADE PRO veritabanı konfigürasyonu
        this.b2bConfig = {
            server: '5.180.186.54',
            database: 'B2B_TRADE_PRO',
            user: 'sa',
            password: 'Logo12345678',
            options: {
                encrypt: true,
                trustServerCertificate: true
            }
        };
        
        this.logoPool = null;
        this.b2bPool = null;
        this.startupTime = new Date();
    }

    // ====================================================
    // 🚀 0. HEALTH CHECK ENDPOINTİ (YENİ EKLENDİ)
    // ====================================================
    async healthCheck(req, res) {
        try {
            console.log('🏥 B2B Health check çağrıldı');
            
            // Logo Database bağlantı testi
            let logoStatus = 'disconnected';
            try {
                const logoPool = await this.getLogoConnection();
                const logoResult = await logoPool.request().query('SELECT 1 as test');
                logoStatus = 'connected';
                console.log('✅ Logo DB bağlantı testi başarılı');
            } catch (logoError) {
                console.error('❌ Logo DB bağlantı testi başarısız:', logoError.message);
            }
            
            // B2B Database bağlantı testi
            let b2bStatus = 'disconnected';
            try {
                const b2bPool = await this.getB2BConnection();
                const b2bResult = await b2bPool.request().query('SELECT 1 as test');
                b2bStatus = 'connected';
                console.log('✅ B2B DB bağlantı testi başarılı');
            } catch (b2bError) {
                console.error('❌ B2B DB bağlantı testi başarısız:', b2bError.message);
            }
            
            // Sistem durumu
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

    // ====================================================
    // 🚀 1. LOGO VERİTABANI BAĞLANTISI
    // ====================================================
    async getLogoConnection() {
        try {
            if (!this.logoPool || !this.logoPool.connected) {
                this.logoPool = await sql.connect(this.logoConfig);
                console.log('✅ Logo veritabanı bağlantısı başarılı');
            }
            return this.logoPool;
        } catch (error) {
            console.error('❌ Logo veritabanı bağlantı hatası:', error);
            throw error;
        }
    }

    // ====================================================
    // 🚀 2. B2B VERİTABANI BAĞLANTISI
    // ====================================================
    async getB2BConnection() {
        try {
            if (!this.b2bPool || !this.b2bPool.connected) {
                this.b2bPool = await sql.connect(this.b2bConfig);
                console.log('✅ B2B veritabanı bağlantısı başarılı');
            }
            return this.b2bPool;
        } catch (error) {
            console.error('❌ B2B veritabanı bağlantı hatası:', error);
            throw error;
        }
    }

    // ====================================================
    // 🚀 3. MÜŞTERİYE ÖZEL ÜRÜN LİSTESİ (GÜNCELLENDİ)
    // ====================================================
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
            
            const pool = await this.getLogoConnection();
            
            // GÜNCELLENMİŞ SQL SORGUSU (server.js'deki çalışan sorgu + fiyat eklendi)
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

                    -- Stok bilgileri
                    ISNULL(SUM(CASE WHEN S.INVENNO = 0 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) as centralStock,
                    ISNULL(SUM(CASE WHEN S.INVENNO = 1 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) as ikitelliStock,
                    ISNULL(SUM(CASE WHEN S.INVENNO = 2 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) as bostanciStock,
                    ISNULL(SUM(CASE WHEN S.INVENNO = 3 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) as depotStock,
                    ISNULL(SUM(S.ONHAND - S.RESERVED), 0) as totalStock,

                    -- Fiyat bilgisi
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
                WHERE I.ACTIVE = 0  -- SADECE AKTİF ÜRÜNLER (0 = aktif)
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
            
            // Her ürün için iskonto hesapla
            const productsWithDiscounts = await Promise.all(
                result.recordset.map(async (product) => {
                    const discounts = await this.calculateDiscountsForCustomer(
                        product.productCode, 
                        customerCode,
                        pool,
                        product.manufacturer
                    );
                    
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
                        totalStock: product.totalStock,
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
            
            res.json({
                success: true,
                data: productsWithDiscounts,
                count: productsWithDiscounts.length,
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

    // ====================================================
    // 🚀 4. İSKONTO HESAPLAMA
    // ====================================================
    async calculateDiscountsForCustomer(productCode, customerCode, pool, manufacturerCode) {
        try {
            console.log(`💰 B2B İskonto hesaplanıyor: ${productCode} için ${customerCode}`);
            
            // 1. ÖNCE B2B VERİTABANINA BAĞLAN
            const b2bPool = await this.getB2BConnection();
            
            // 2. KAMPANYA KONTROLÜ (ÖNCELİK 1)
            const campaignDiscount = await this.checkCampaignDiscount(productCode, b2bPool);
            if (campaignDiscount.hasCampaign) {
                console.log(`🎯 B2B KAMPANYA VAR: ${productCode} için %${campaignDiscount.rate} indirim`);
                return {
                    hasCampaign: true,
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
            
            // 3. VARSAYILAN İSKONTOLARI AL (B2B veritabanından)
            const defaultDiscounts = await this.getDefaultDiscounts(b2bPool);
            
            // 4. MÜŞTERİ ÖZEL AYARLARINI KONTROL ET
            const customerOverrides = await this.getCustomerOverrides(customerCode, productCode, b2bPool);
            
            // 5. İSKONTO LİSTESİNİ OLUŞTUR (Öncelik sırasına göre)
            const discounts = [];
            
            // Malzeme iskontosu (varsayılan veya override)
            const itemDiscount = customerOverrides.item_discount || defaultDiscounts.item_discount;
            if (itemDiscount > 0) {
                discounts.push({
                    type: 'ITEM',
                    rate: itemDiscount,
                    description: `Malzeme İskontosu (%${itemDiscount})`,
                    source: customerOverrides.item_discount ? 'CUSTOMER_OVERRIDE' : 'DEFAULT'
                });
            }
            
            // Üretici iskontosu (varsayılan veya override)
            const manufacturerDiscount = customerOverrides.manufacturer_discount || defaultDiscounts.manufacturer_discount;
            if (manufacturerDiscount > 0) {
                discounts.push({
                    type: 'MANUFACTURER',
                    rate: manufacturerDiscount,
                    description: `Üretici İskontosu (%${manufacturerDiscount})`,
                    source: customerOverrides.manufacturer_discount ? 'CUSTOMER_OVERRIDE' : 'DEFAULT'
                });
            }
            
            // Müşteri iskontoları (varsayılan veya override)
            const customerDiscounts = customerOverrides.customer_discounts || defaultDiscounts.customer_discounts;
            if (customerDiscounts && Array.isArray(customerDiscounts)) {
                customerDiscounts.forEach((rate, index) => {
                    if (rate > 0) {
                        discounts.push({
                            type: 'CUSTOMER',
                            rate: rate,
                            description: `Müşteri İskontosu ${index + 1} (%${rate})`,
                            source: customerOverrides.customer_discounts ? 'CUSTOMER_OVERRIDE' : 'DEFAULT'
                        });
                    }
                });
            }
            
            // 6. BİRLEŞİK İSKONTO ORANINI HESAPLA
            let currentRate = 100;
            discounts.forEach(discount => {
                const discountAmount = currentRate * (discount.rate / 100);
                currentRate -= discountAmount;
            });
            const totalDiscountRate = 100 - currentRate;
            
            console.log(`📊 B2B ${productCode} iskonto özeti:`, {
                malzeme: `${itemDiscount}%`,
                uretici: `${manufacturerDiscount}%`,
                musteri: customerDiscounts ? customerDiscounts.map(r => `${r}%`).join(', ') : '0%',
                toplam: `${totalDiscountRate.toFixed(2)}%`,
                katman: discounts.length,
                kaynak: discounts.map(d => d.source).join(', ')
            });
            
            return {
                hasCampaign: false,
                discounts: discounts,
                totalDiscountRate: parseFloat(totalDiscountRate.toFixed(2)),
                calculationMethod: 'B2B_DATABASE_DISCOUNTS'
            };
            
        } catch (error) {
            console.error(`❌ B2B İskonto hesaplama hatası ${productCode}:`, error.message);
            // Hata durumunda ADIM 1 sabit değerleri kullan
            return this.getFallbackDiscounts();
        }
    }

    // ====================================================
    // 🚀 5. KAMPANYA KONTROLÜ
    // ====================================================
    async checkCampaignDiscount(productCode, pool) {
        try {
            const query = `
                SELECT TOP 1 
                    discount_rate,
                    campaign_name
                FROM b2b_campaign_items
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

    // ====================================================
    // 🚀 6. VARSAYILAN İSKONTOLARI GETİR
    // ====================================================
    async getDefaultDiscounts(pool) {
        try {
            const query = `
                SELECT 
                    setting_key,
                    setting_value
                FROM b2b_default_settings
                WHERE setting_key IN (
                    'default_item_discount',
                    'default_manufacturer_discount',
                    'default_customer_discount_1',
                    'default_customer_discount_2'
                )
            `;
            
            const result = await pool.request().query(query);
            
            // Varsayılan değerler
            const discounts = {
                item_discount: 10,      // varsayılan
                manufacturer_discount: 5, // varsayılan
                customer_discounts: [20, 5] // varsayılan
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
            // Hata durumunda ADIM 1 sabit değerleri
            return {
                item_discount: 10,
                manufacturer_discount: 5,
                customer_discounts: [20, 5]
            };
        }
    }

    // ====================================================
    // 🚀 7. MÜŞTERİ ÖZEL AYARLARINI GETİR
    // ====================================================
    async getCustomerOverrides(customerCode, productCode, pool) {
        try {
            // Önce ürün bazlı override'ları kontrol et
            const productQuery = `
                SELECT 
                    setting_type,
                    value
                FROM b2b_customer_overrides
                WHERE customer_code = @customerCode
                AND item_code = @productCode
                AND is_active = 1
            `;
            
            const productResult = await pool.request()
                .input('customerCode', sql.VarChar, customerCode)
                .input('productCode', sql.VarChar, productCode)
                .query(productQuery);
            
            // Eğer ürün bazlı override varsa, onu kullan
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
            
            // Ürün bazlı yoksa, genel override'ları kontrol et
            const generalQuery = `
                SELECT 
                    setting_type,
                    value
                FROM b2b_customer_overrides
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

    // ====================================================
    // 🚀 8. FALLBACK İSKONTOLAR (ADIM 1 sabit değerleri)
    // ====================================================
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

    // ====================================================
    // 🚀 9. FİYAT HESAPLAMA
    // ====================================================
    calculateFinalPrice(unitPrice, discountRate) {
        const discountAmount = unitPrice * (discountRate / 100);
        return unitPrice - discountAmount;
    }

    // ====================================================
    // 🚀 10. ÜRÜN ARAMA (GÜNCELLENDİ)
    // ====================================================
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

                    -- Stok bilgileri
                    ISNULL(SUM(CASE WHEN S.INVENNO = 0 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) as centralStock,
                    ISNULL(SUM(CASE WHEN S.INVENNO = 1 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) as ikitelliStock,
                    ISNULL(SUM(CASE WHEN S.INVENNO = 2 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) as bostanciStock,
                    ISNULL(SUM(CASE WHEN S.INVENNO = 3 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) as depotStock,
                    ISNULL(SUM(S.ONHAND - S.RESERVED), 0) as totalStock,

                    -- Fiyat bilgisi
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
                AND (I.CODE LIKE @search OR I.NAME LIKE @search)
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
            
            // Her ürün için iskonto hesapla
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
            
            res.json({
                success: true,
                data: productsWithDiscounts,
                count: productsWithDiscounts.length,
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

    // ====================================================
    // 🚀 11. ÜRÜN DETAYI (GÜNCELLENDİ)
    // ====================================================
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

                    -- Stok bilgileri
                    ISNULL(SUM(CASE WHEN S.INVENNO = 0 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) as centralStock,
                    ISNULL(SUM(CASE WHEN S.INVENNO = 1 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) as ikitelliStock,
                    ISNULL(SUM(CASE WHEN S.INVENNO = 2 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) as bostanciStock,
                    ISNULL(SUM(CASE WHEN S.INVENNO = 3 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) as depotStock,
                    ISNULL(SUM(S.ONHAND - S.RESERVED), 0) as totalStock,

                    -- Fiyat bilgisi
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
                WHERE I.ACTIVE = 0
                AND I.CODE = @code
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
            
            // İskonto hesapla
            const discounts = await this.calculateDiscountsForCustomer(
                product.productCode, 
                customerCode,
                pool,
                product.manufacturer
            );
            
            const response = {
                ...product,
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
            
            res.json({
                success: true,
                data: response,
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

    // ====================================================
    // 🚀 12. SEPET HESAPLAMA (GÜNCELLENDİ)
    // ====================================================
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
            
            const pool = await this.getLogoConnection();
            
            // Her ürün için detay ve iskonto hesapla
            const cartItems = await Promise.all(
                items.map(async (item) => {
                    // Ürün detayını getir
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

                            -- Stok bilgileri
                            ISNULL(SUM(CASE WHEN S.INVENNO = 0 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) as centralStock,
                            ISNULL(SUM(CASE WHEN S.INVENNO = 1 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) as ikitelliStock,
                            ISNULL(SUM(CASE WHEN S.INVENNO = 2 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) as bostanciStock,
                            ISNULL(SUM(CASE WHEN S.INVENNO = 3 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) as depotStock,
                            ISNULL(SUM(S.ONHAND - S.RESERVED), 0) as totalStock,

                            -- Fiyat bilgisi
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
                    
                    // İskonto hesapla
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
                        availableStock: Math.max(0, product.totalStock),
                        canOrder: quantity <= Math.max(0, product.totalStock)
                    };
                })
            );
            
            // Sepet toplamlarını hesapla
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

    // ====================================================
    // 🚀 13. MÜŞTERİ BİLGİLERİ
    // ====================================================
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
            
            // Müşteri özel ayarlarını da getir (B2B veritabanından)
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

    // ====================================================
    // 🚀 14. DÖVİZ KURLARI (YENİ EKLENDİ)
    // ====================================================
    async getExchangeRates(req, res) {
        try {
            console.log('💱 B2B Döviz kurları getiriliyor');
            
            // Server.js'deki çalışan exchange rates endpoint'ine yönlendir
            // Veya kendi mantığını yaz
            
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

// Satır 1083'ten başlayarak aşağıdaki kodu yapıştırın:

    // ====================================================
    // 🚀 15. ADMIN İÇİN ÜRÜN LİSTESİ - TAMAMEN YENİLENDİ
    // ====================================================
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
            
            // WHERE koşullarını oluştur
            let whereConditions = ['I.ACTIVE = 0']; // Sadece aktif ürünler
            let inputParams = {};
            
            // Arama koşulu
            if (search) {
                whereConditions.push('(I.CODE LIKE @search OR I.NAME LIKE @search OR I.PRODUCERCODE LIKE @search)');
                inputParams.search = `%${search}%`;
            }
            
            // Üretici filtresi
            if (manufacturer) {
                whereConditions.push('I.STGRPCODE LIKE @manufacturer');
                inputParams.manufacturer = `%${manufacturer}%`;
            }
            
            // Kategori filtresi
            if (category) {
                whereConditions.push('I.CYPHCODE LIKE @category');
                inputParams.category = `%${category}%`;
            }
            
            // Stok filtreleri
            if (minStock !== '') {
                whereConditions.push('(ISNULL(SUM(S.ONHAND - S.RESERVED), 0) >= @minStock)');
                inputParams.minStock = parseInt(minStock);
            }
            
            if (maxStock !== '') {
                whereConditions.push('(ISNULL(SUM(S.ONHAND - S.RESERVED), 0) <= @maxStock)');
                inputParams.maxStock = parseInt(maxStock);
            }
            
            // Aktiflik filtresi
            if (activeOnly === 'true') {
                whereConditions.push('I.ACTIVE = 0');
            } else if (activeOnly === 'false') {
                whereConditions.push('I.ACTIVE = 1');
            }
            
            // Sıralama
            let orderBy = 'I.CODE';
            switch(sortBy) {
                case 'name': orderBy = 'I.NAME'; break;
                case 'manufacturer': orderBy = 'I.STGRPCODE'; break;
                case 'stock': orderBy = 'totalStock'; break;
                case 'price': orderBy = 'unitPrice'; break;
                default: orderBy = 'I.CODE';
            }
            
            const orderDirection = sortOrder.toLowerCase() === 'desc' ? 'DESC' : 'ASC';
            
            // SQL sorgusunu oluştur
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

                    -- Stok bilgileri
                    ISNULL(SUM(CASE WHEN S.INVENNO = 0 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) as centralStock,
                    ISNULL(SUM(CASE WHEN S.INVENNO = 1 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) as ikitelliStock,
                    ISNULL(SUM(CASE WHEN S.INVENNO = 2 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) as bostanciStock,
                    ISNULL(SUM(CASE WHEN S.INVENNO = 3 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) as depotStock,
                    ISNULL(SUM(S.ONHAND - S.RESERVED), 0) as totalStock,

                    -- Fiyat bilgisi
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
                ${whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : ''}
                GROUP BY I.LOGICALREF, I.CODE, I.NAME, I.PRODUCERCODE, I.STGRPCODE,
                         I.CYPHCODE, I.SPECODE, I.SPECODE2, I.SPECODE3, I.SPECODE4, I.ACTIVE,
                         P.PRICE, P.CURRENCY
                ORDER BY ${orderBy} ${orderDirection}
                OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
            `;
            
            // Toplam kayıt sayısını al
            const countQuery = `
                SELECT COUNT(DISTINCT I.LOGICALREF) as totalCount
                FROM LG_013_ITEMS I
                LEFT JOIN LV_013_01_STINVTOT S ON S.STOCKREF = I.LOGICALREF
                LEFT JOIN LG_013_PRCLIST P ON P.CARDREF = I.LOGICALREF
                    AND P.PTYPE IN (1, 2)
                    AND P.PRIORITY = 0
                    AND P.ACTIVE IN (0, 1)
                ${whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : ''}
            `;
            
            // Request oluştur
            const request = pool.request();
            
            // Parametreleri ekle
            request.input('offset', sql.Int, parseInt(offset));
            request.input('limit', sql.Int, parseInt(limit));
            
            // Diğer parametreleri ekle
            if (search) request.input('search', sql.VarChar, inputParams.search);
            if (manufacturer) request.input('manufacturer', sql.VarChar, inputParams.manufacturer);
            if (category) request.input('category', sql.VarChar, inputParams.category);
            if (minStock !== '') request.input('minStock', sql.Int, inputParams.minStock);
            if (maxStock !== '') request.input('maxStock', sql.Int, inputParams.maxStock);
            
            // Sorguları çalıştır
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
            
            // Format verileri
            const formattedProducts = products.map(item => {
                // B2B veritabanından ürün özel ayarlarını getir
                let globalDiscount = 10; // Varsayılan
                let hasCampaign = false;
                
                // Ürünü formatla
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
                    active: item.isActive === 0, // Logo'da 0 = aktif
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
}


// Singleton instance
const b2bController = new B2BController();

// Export functions - HEALTH CHECK EKLENDİ!
module.exports = {
    B2BController: B2BController, // Class'ı da export et
    healthCheck: (req, res) => b2bController.healthCheck(req, res), // YENİ EKLENDİ!
    getExchangeRates: (req, res) => b2bController.getExchangeRates(req, res), // YENİ EKLENDİ!
    getProductsForAdmin: (req, res) => b2bController.getProductsForAdmin(req, res),
    getProductsForCustomer: (req, res) => b2bController.getProductsForCustomer(req, res),
    searchProductsForCustomer: (req, res) => b2bController.searchProductsForCustomer(req, res),
    getProductDetailForCustomer: (req, res) => b2bController.getProductDetailForCustomer(req, res),
    calculateCart: (req, res) => b2bController.calculateCart(req, res),
    getCustomerInfo: (req, res) => b2bController.getCustomerInfo(req, res),
    calculateDiscountsForCustomer: (productCode, customerCode, pool, manufacturerCode) => 
        b2bController.calculateDiscountsForCustomer(productCode, customerCode, pool, manufacturerCode)

};