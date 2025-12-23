// ============================================
// 7. ADIM: NODE.JS ARAMA API'Sİ
// ============================================

// Dosya: /home/yunlu/b2b-app/controllers/b2bSearchController.js

const sql = require('mssql');
const { b2bConfig, logoConfig } = require('../config/database');
const smartSearchHelper = require('./smart-search');

class B2BSearchController {
    constructor() {
        const { b2bConfig, logoConfig } = require('../config/database');
        
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
    
    // Basit fiyat formatlama: null/undefined durumunda 0 döndürür, sayıyı 2 haneye yuvarlar
    formatPrice(value) {
        const num = Number(value) || 0;
        return Number(num.toFixed(2));
    }
    
    // Arama tipini sorgunun yapısına göre belirle (sadece istatistik/label amaçlı)
    determineSearchType(query) {
        if (!query) return 'unknown';
        const q = query.trim();
        if (q.length <= 4) return 'short_code';
        if (/^\d+$/.test(q)) return 'numeric';
        return 'text';
    }

    async getCustomerStockVisibility(customerCode) {
        try {
            const pool = await sql.connect(b2bConfig);

            let defaultResult;
            try {
                defaultResult = await pool.request()
                    .input('key', sql.VarChar(100), 'show_stock_to_customer')
                    .query(`
                        SELECT TOP 1 setting_value
                        FROM B2B_TRADE_PRO.dbo.b2b_default_settings
                        WHERE setting_key = @key
                          AND (is_active = 1 OR is_active IS NULL)
                        ORDER BY setting_id DESC
                    `);
            } catch (e) {
                defaultResult = await pool.request()
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

            const overrideResult = await pool.request()
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
            console.error('❌ smartSearch show_stock ayarı okunamadı:', error.message);
            return true;
        }
    }

    async getActiveWarehouses(customerCode) {
        try {
            const pool = await sql.connect(b2bConfig);

            let defaultResult;
            try {
                defaultResult = await pool.request()
                    .input('key', sql.VarChar(100), 'active_warehouses_invenno')
                    .query(`
                        SELECT TOP 1 setting_value
                        FROM B2B_TRADE_PRO.dbo.b2b_default_settings
                        WHERE setting_key = @key
                          AND (is_active = 1 OR is_active IS NULL)
                        ORDER BY setting_id DESC
                    `);
            } catch (e) {
                defaultResult = await pool.request()
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

            const overrideResult = await pool.request()
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
            console.error('❌ smartSearch active_warehouses ayarı okunamadı:', error.message);
            return [1, 2];
        }
    }
    
    
    // 7.1 AKILLI ARAMA API'Sİ (LOGO LOGOGO3 tabanlı basit ürün araması)
    async smartSearch(req, res) {
        const startTime = Date.now();
        const { query, customerCode = 'S1981' } = req.body || {};

        try {
            if (!query || query.trim().length < 2) {
                return res.status(400).json({
                    success: false,
                    error: 'En az 2 karakter girin'
                });
            }

            console.log(`🎯 Smart search: ${query} for ${customerCode}`);

            const helperResult = await smartSearchHelper.smartSearch(query, customerCode, 50);

            const activeWarehouses = await this.getActiveWarehouses(customerCode);

            let products = [];
            let matchType = (helperResult && helperResult.type) ? helperResult.type : 'UNKNOWN';
            let groupId = null;

            if (helperResult && (helperResult.type === 'GROUP_MATCH' || helperResult.type === 'OEM_MATCH') && Array.isArray(helperResult.groups) && helperResult.groups.length > 0) {
                const bestGroup = helperResult.groups[0];
                groupId = bestGroup.group_id || null;

                const logicalrefs = Array.from(
                    new Set(
                        (bestGroup.items || [])
                            .map(i => i.logo_logicalref)
                            .filter(v => Number.isFinite(Number(v)))
                            .map(v => Number(v))
                    )
                );

                const logoRows = await this.getLogoProductsByLogicalrefs(logicalrefs);
                products = logoRows.map(item => {
                    const centralStock = Number(item.central_stock || 0);
                    const ikitelliStock = Number(item.ikitelli_stock || 0);
                    const bostanciStock = Number(item.bostanci_stock || 0);
                    const depotStock = Number(item.depot_stock || 0);
                    const totalStock = (activeWarehouses || []).reduce((sum, inv) => {
                        if (inv === 0) return sum + centralStock;
                        if (inv === 1) return sum + ikitelliStock;
                        if (inv === 2) return sum + bostanciStock;
                        if (inv === 3) return sum + depotStock;
                        return sum;
                    }, 0);

                    const currencyCode = Number(item.currency_code || 160);
                    const currency = currencyCode === 1 ? 'USD'
                        : currencyCode === 20 ? 'EUR'
                        : currencyCode === 17 ? 'GBP'
                        : currencyCode === 160 ? 'TL'
                        : 'TL';

                    return {
                    kod: item.item_code,
                    ad: item.item_name,
                    oem_kodu: item.oem_code,
                    uretici: item.manufacturer,
                    fiyat: this.formatPrice(item.price || 0),
                    stok: totalStock > 0 ? 'Var' : 'Stokta Yok',
                    centralStock,
                    ikitelliStock,
                    bostanciStock,
                    depotStock,
                    totalStock,
                    birim: 'Adet',
                    currencyCode,
                    para_birimi: currency
                    };
                });
            } else {
                const fallback = await this.getLogoProductsBySearchQuery(query);
                products = fallback.map(item => {
                    const centralStock = Number(item.central_stock || 0);
                    const ikitelliStock = Number(item.ikitelli_stock || 0);
                    const bostanciStock = Number(item.bostanci_stock || 0);
                    const depotStock = Number(item.depot_stock || 0);
                    const totalStock = (activeWarehouses || []).reduce((sum, inv) => {
                        if (inv === 0) return sum + centralStock;
                        if (inv === 1) return sum + ikitelliStock;
                        if (inv === 2) return sum + bostanciStock;
                        if (inv === 3) return sum + depotStock;
                        return sum;
                    }, 0);

                    const currencyCode = Number(item.currency_code || 160);
                    const currency = currencyCode === 1 ? 'USD'
                        : currencyCode === 20 ? 'EUR'
                        : currencyCode === 17 ? 'GBP'
                        : currencyCode === 160 ? 'TL'
                        : 'TL';

                    return {
                    kod: item.item_code,
                    ad: item.item_name,
                    oem_kodu: item.oem_code,
                    uretici: item.manufacturer,
                    fiyat: this.formatPrice(item.price || 0),
                    stok: totalStock > 0 ? 'Var' : 'Stokta Yok',
                    centralStock,
                    ikitelliStock,
                    bostanciStock,
                    depotStock,
                    totalStock,
                    birim: 'Adet',
                    currencyCode,
                    para_birimi: currency
                    };
                });
                matchType = 'FALLBACK_SEARCH';
            }

            const durationMs = Date.now() - startTime;
            const normalizedQuery = this.normalizeQuery(query);
            const showStock = await this.getCustomerStockVisibility(customerCode);

            res.json({
                success: true,
                query: query,
                orijinal: query,
                normalized_query: normalizedQuery,
                match_type: matchType,
                group_id: groupId,
                total_results: products.length,
                sonuç: products.length,
                search_type: this.determineSearchType(query),
                response_time_ms: durationMs,
                süre: `${durationMs}ms`,
                customer_code: customerCode,
                show_stock: showStock,
                active_warehouses: activeWarehouses,
                ürünler: products,
                results: [
                    {
                        group_name: 'Ürünler',
                        group_type: 'products',
                        items: products
                    }
                ]
            });

            console.log(`✅ Smart search tamamlandı: ${durationMs}ms, ${products.length} sonuç`);
        } catch (error) {
            console.error('❌ Smart search error:', error);

            const durationMs = Date.now() - startTime;

            res.status(500).json({
                success: false,
                query: query,
                error: 'Arama sırasında bir hata oluştu',
                response_time_ms: durationMs,
                sonuç: 0,
                ürünler: [],
                results: []
            });
        }
    }

    async getLogoProductsByLogicalrefs(logicalrefs, limit = 50) {
        if (!Array.isArray(logicalrefs) || logicalrefs.length === 0) return [];

        const pool = await sql.connect(logoConfig);
        const request = pool.request();
        request.input('refs', sql.NVarChar(sql.MAX), logicalrefs.join(','));
        request.input('limit', sql.Int, limit);

        const query = `
            SELECT TOP (@limit)
                I.CODE AS item_code,
                I.NAME AS item_name,
                I.PRODUCERCODE AS oem_code,
                I.STGRPCODE AS manufacturer,
                ISNULL(SUM(CASE WHEN S.INVENNO IN (0,1,2,3) THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) AS stock_qty,
                ISNULL(SUM(CASE WHEN S.INVENNO = 0 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) AS central_stock,
                ISNULL(SUM(CASE WHEN S.INVENNO = 1 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) AS ikitelli_stock,
                ISNULL(SUM(CASE WHEN S.INVENNO = 2 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) AS bostanci_stock,
                ISNULL(SUM(CASE WHEN S.INVENNO = 3 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) AS depot_stock,
                (
                    SELECT TOP 1 P.PRICE
                    FROM LG_013_PRCLIST P
                    WHERE P.CARDREF = I.LOGICALREF
                      AND P.ACTIVE = 0
                      AND P.PRIORITY = 0
                    ORDER BY P.BEGDATE DESC
                ) AS price
                ,(
                    SELECT TOP 1 P.CURRENCY
                    FROM LG_013_PRCLIST P
                    WHERE P.CARDREF = I.LOGICALREF
                      AND P.ACTIVE = 0
                      AND P.PRIORITY = 0
                    ORDER BY P.BEGDATE DESC
                ) AS currency_code
            FROM LG_013_ITEMS I
            LEFT JOIN LV_013_01_STINVTOT S ON S.STOCKREF = I.LOGICALREF
            WHERE I.ACTIVE = 0
              AND I.CARDTYPE = 1
              AND I.LOGICALREF IN (
                  SELECT TRY_CAST(value AS INT)
                  FROM STRING_SPLIT(@refs, ',')
              )
            GROUP BY 
                I.LOGICALREF,
                I.CODE,
                I.NAME,
                I.PRODUCERCODE,
                I.STGRPCODE
            ORDER BY I.CODE
        `;

        const result = await request.query(query);
        return result.recordset || [];
    }

    async getLogoProductsBySearchQuery(query, limit = 50) {
        const pool = await sql.connect(logoConfig);
        const request = pool.request();
        request.input('searchQuery', sql.NVarChar(100), `%${query}%`);
        request.input('limit', sql.Int, limit);

        const sqlQuery = `
            SELECT TOP (@limit)
                I.CODE AS item_code,
                I.NAME AS item_name,
                I.PRODUCERCODE AS oem_code,
                I.STGRPCODE AS manufacturer,
                ISNULL(SUM(CASE WHEN S.INVENNO IN (0,1,2,3) THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) AS stock_qty,
                ISNULL(SUM(CASE WHEN S.INVENNO = 0 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) AS central_stock,
                ISNULL(SUM(CASE WHEN S.INVENNO = 1 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) AS ikitelli_stock,
                ISNULL(SUM(CASE WHEN S.INVENNO = 2 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) AS bostanci_stock,
                ISNULL(SUM(CASE WHEN S.INVENNO = 3 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) AS depot_stock,
                (
                    SELECT TOP 1 P.PRICE
                    FROM LG_013_PRCLIST P
                    WHERE P.CARDREF = I.LOGICALREF
                      AND P.ACTIVE = 0
                      AND P.PRIORITY = 0
                    ORDER BY P.BEGDATE DESC
                ) AS price
                ,(
                    SELECT TOP 1 P.CURRENCY
                    FROM LG_013_PRCLIST P
                    WHERE P.CARDREF = I.LOGICALREF
                      AND P.ACTIVE = 0
                      AND P.PRIORITY = 0
                    ORDER BY P.BEGDATE DESC
                ) AS currency_code
            FROM LG_013_ITEMS I
            LEFT JOIN LV_013_01_STINVTOT S ON S.STOCKREF = I.LOGICALREF
            WHERE I.ACTIVE = 0
              AND I.CARDTYPE = 1
              AND (
                    I.CODE LIKE @searchQuery
                 OR I.NAME LIKE @searchQuery
                 OR I.NAME2 LIKE @searchQuery
                 OR I.NAME3 LIKE @searchQuery
                 OR I.PRODUCERCODE LIKE @searchQuery
                 OR I.STGRPCODE LIKE @searchQuery
              )
            GROUP BY 
                I.LOGICALREF,
                I.CODE,
                I.NAME,
                I.PRODUCERCODE,
                I.STGRPCODE
            ORDER BY I.CODE
        `;

        const result = await request.query(sqlQuery);
        return result.recordset || [];
    }
    
    // 7.2 QUERY NORMALİZASYONU
    normalizeQuery(query) {
        if (!query) return '';
        
        // Türkçe karakter düzeltme
        let normalized = query
            .replace(/ı/g, 'i').replace(/İ/g, 'I')
            .replace(/ğ/g, 'g').replace(/Ğ/g, 'G')
            .replace(/ü/g, 'u').replace(/Ü/g, 'U')
            .replace(/ş/g, 's').replace(/Ş/g, 'S')
            .replace(/ö/g, 'o').replace(/Ö/g, 'O')
            .replace(/ç/g, 'c').replace(/Ç/g, 'C');
        
        // Büyük harfe çevir
        normalized = normalized.toUpperCase();
        
        // Sadece harf ve rakam kalacak
        normalized = normalized.replace(/[^A-Z0-9]/g, '');
        
        return normalized;
    }
    
    // 7.3 KISA KOD ARAMA (≤4 karakter)
    async searchShortCode(query, customerCode) {
        console.log(`🔍 Kısa kod arama: "${query}" (${query.length} karakter)`);
        
        // Öncelik: OEM kodunda tam eşleşme
        const oemResults = await this.searchByExactOEM(query);
        
        if (oemResults.length > 0) {
            console.log(`✅ OEM eşleşmesi bulundu: ${oemResults.length} kayıt`);
            return await this.getGroupsForItems(oemResults);
        }
        
        // OEM bulunamadı, karakter bazlı arama
        console.log(`⚠️ OEM eşleşmesi bulunamadı, karakter aramasına geçiliyor`);
        return await this.searchByCharacterMatch(query, customerCode);
    }
    
    // 7.4 KARAKTER BAZLI ARAMA (≥5 karakter)
    async searchByCharacterMatch(query, customerCode, limit = 50) {
        console.log(`🔍 Karakter bazlı arama: "${query}"`);
        
        // B2B_TRADE_PRO içindeki grupları kullan
        const pool = await sql.connect(b2bConfig);
        
        const request = pool.request();
        request.input('query', sql.NVarChar(100), query);
        request.input('limit', sql.Int, limit);
        
        const sqlQuery = `
            SELECT TOP (@limit)
                g.group_id,
                g.hash_key,
                g.normalized_codes,
                g.original_codes_json,
                g.item_count,
                g.sample_item_code,
                g.sample_manufacturer,
                g.search_text,
                g.char_index,
                g.created_at,
                g.updated_at
            FROM B2B_TRADE_PRO.dbo.b2b_item_groups g
            WHERE g.is_active = 1
            AND dbo.ContainsCharsInOrder(@query, g.char_index) = 1
            ORDER BY 
                -- Öncelik 1: Tam başlangıç eşleşmesi
                CASE WHEN g.char_index LIKE @query + '%' THEN 1 ELSE 2 END,
                -- Öncelik 2: Küçük gruplar önce (daha spesifik)
                g.item_count ASC,
                -- Öncelik 3: Güncel olanlar
                g.updated_at DESC
        `;
        
        const result = await request.query(sqlQuery);
        
        // Grup üyelerini getir
        const groupsWithItems = await Promise.all(
            result.recordset.map(async (group) => {
                const items = await this.getGroupItems(group.group_id);
                return {
                    ...group,
                    items: items
                };
            })
        );
        
        return groupsWithItems;
    }
    
    // 7.5 OEM KODUNDA TAM EŞLEŞME ARAMA
    async searchByExactOEM(query) {
        // Stok bilgisi LOGOGO3 üzerinden alınır
        const pool = await sql.connect(logoConfig);
        
        const request = pool.request();
        request.input('query', sql.NVarChar(100), query);
        
        const sqlQuery = `
            SELECT TOP 20
                LOGICALREF,
                CODE,
                NAME,
                PRODUCERCODE,
                STGRPCODE,
                dbo.NormalizeForSearch(PRODUCERCODE) as normalized_oem
            FROM LG_013_ITEMS
            WHERE PRODUCERCODE IS NOT NULL
            AND LEN(PRODUCERCODE) > 0
            AND dbo.NormalizeForSearch(PRODUCERCODE) = @query
            ORDER BY CODE
        `;
        
        const result = await request.query(sqlQuery);
        return result.recordset;
    }
    
    // 7.6 GRUP ÜYELERİNİ GETİR
    async getGroupItems(groupId) {
        const pool = await sql.connect(b2bConfig);
        
        const request = pool.request();
        request.input('groupId', sql.NVarChar(20), groupId);
        
        const sqlQuery = `
            SELECT 
                m.logo_logicalref,
                m.item_code,
                m.manufacturer_code,
                m.normalized_item_code,
                m.char_index_item,
                m.match_score,
                m.added_at
            FROM B2B_TRADE_PRO.dbo.b2b_group_members m
            WHERE m.group_id = @groupId
            ORDER BY m.match_score DESC
        `;
        
        const result = await request.query(sqlQuery);
        return result.recordset;
    }
    
    // 7.7 MÜŞTERİYE ÖZEL FİYATLARI EKLE
    async addCustomerPrices(groups, customerCode) {
        if (!customerCode || groups.length === 0) return groups;
        
        const pool = await sql.connect(b2bConfig);
        
        return Promise.all(groups.map(async (group) => {
            const itemsWithPrices = await Promise.all(group.items.map(async (item) => {
                const request = pool.request();
                request.input('itemCode', sql.NVarChar(50), item.item_code);
                request.input('customerCode', sql.NVarChar(50), customerCode);
                
                const priceQuery = `
                    SELECT TOP 1 price, currency, discount_rate
                    FROM B2B_TRADE_PRO.dbo.b2b_customer_prices
                    WHERE item_code = @itemCode
                    AND customer_code = @customerCode
                    AND is_active = 1
                    ORDER BY created_at DESC
                `;
                
                const priceResult = await request.query(priceQuery);
                
                return {
                    ...item,
                    customer_price: priceResult.recordset[0] || null
                };
            }));
            
            return {
                ...group,
                items: itemsWithPrices
            };
        }));
    }
    
    // 7.8 STOK BİLGİLERİNİ EKLE
    async addStockInfo(groups) {
        const pool = await sql.connect(logoConfig);
        
        return Promise.all(groups.map(async (group) => {
            const itemsWithStock = await Promise.all(group.items.map(async (item) => {
                const request = pool.request();
                request.input('logicalref', sql.Int, item.logo_logicalref);
                
                const stockQuery = `
                    SELECT 
                        ISNULL(ONHAND, 0) as total_stock,
                        ISNULL(REQUESTS, 0) as requests,
                        ISNULL(ONORDER, 0) as on_order
                    FROM LG_013_ITEMS
                    WHERE LOGICALREF = @logicalref
                `;
                
                const stockResult = await request.query(stockQuery);
                
                return {
                    ...item,
                    stock_info: stockResult.recordset[0] || { total_stock: 0 }
                };
            }));
            
            return {
                ...group,
                items: itemsWithStock
            };
        }));
    }
    
    // 7.9 GRUPLAR İÇİN MADDELERİ GETİR
    async getGroupsForItems(items) {
        if (!items || items.length === 0) return [];
        
        const pool = await sql.connect(b2bConfig);
        
        const logicalrefs = items.map(item => item.LOGICALREF);
        const placeholders = logicalrefs.map((_, i) => `@ref${i}`).join(',');
        
        const request = pool.request();
        logicalrefs.forEach((ref, i) => {
            request.input(`ref${i}`, sql.Int, ref);
        });
        
        const sqlQuery = `
            SELECT DISTINCT g.*
            FROM B2B_TRADE_PRO.dbo.b2b_item_groups g
            INNER JOIN B2B_TRADE_PRO.dbo.b2b_group_members m ON g.group_id = m.group_id
            WHERE m.logo_logicalref IN (${placeholders})
            AND g.is_active = 1
            ORDER BY g.item_count ASC
        `;
        
        const result = await request.query(sqlQuery);
        
        // Her grup için üyeleri getir
        const groupsWithItems = await Promise.all(
            result.recordset.map(async (group) => {
                const items = await this.getGroupItems(group.group_id);
                return {
                    ...group,
                    items: items
                };
            })
        );
        
        return groupsWithItems;
    }
    
    // 7.10 FALLBACK ARAMA (ESKİ LIKE ARAMASI)
    async fallbackSearch(query, customerCode) {
        console.log(`⚠️ Fallback arama: "${query}"`);
        
        const pool = await sql.connect(logoConfig);
        
        const request = pool.request();
        request.input('query', sql.NVarChar(100), `%${query}%`);
        request.input('limit', sql.Int, 50);
        
        const sqlQuery = `
            SELECT TOP (@limit)
                LOGICALREF,
                CODE,
                NAME,
                PRODUCERCODE,
                STGRPCODE,
                ONHAND as stock
            FROM LG_013_ITEMS
            WHERE CODE LIKE @query
                OR NAME LIKE @query
                OR NAME2 LIKE @query
                OR NAME3 LIKE @query
                OR PRODUCERCODE LIKE @query
            ORDER BY CODE
        `;
        
        const result = await request.query(sqlQuery);
        
        return {
            type: 'fallback_search',
            items: result.recordset,
            total: result.recordset.length
        };
    }


     async resolveLogoStockTotalsTableName(pool) {
         const req = pool.request();

         // Prefer well-known names first.
         const candidates = [
             'LV_013_01_STINVTOT',
             'LG_013_01_STINVTOT',
             'LV_013_STINVTOT',
             'LG_013_STINVTOT'
         ];

         // Check both default schema and dbo schema.
         for (const name of candidates) {
             for (const prefix of ['', 'dbo.']) {
                 try {
                     const full = `${prefix}${name}`;
                     const existsRes = await req.query(`SELECT OBJECT_ID('${full}', 'U') as objU, OBJECT_ID('${full}', 'V') as objV`);
                     const row = (existsRes.recordset || [])[0] || {};
                     if (row.objU || row.objV) {
                         const parts = full.split('.');
                         const schema = parts.length === 2 ? parts[0] : 'dbo';
                         const obj = parts.length === 2 ? parts[1] : parts[0];
                         return `[${schema}].[${obj}]`;
                     }
                 } catch (e) {
                     // ignore and continue
                 }
             }
         }

         // Wider search: any table/view whose name ends with STINVTOT (across schemas)
         const sysRes = await req.query(`
             SELECT TOP 1
                 s.name AS schema_name,
                 o.name AS object_name,
                 o.type AS object_type
             FROM sys.objects o
             INNER JOIN sys.schemas s ON s.schema_id = o.schema_id
             WHERE (o.type = 'U' OR o.type = 'V')
               AND o.name LIKE '%STINVTOT'
             ORDER BY
                 CASE WHEN o.name LIKE 'LV_%' THEN 1 ELSE 2 END,
                 o.name
         `);

         const schema = String(sysRes.recordset?.[0]?.schema_name || '').trim();
         const obj = String(sysRes.recordset?.[0]?.object_name || '').trim();
         if (schema && obj) return `[${schema}].[${obj}]`;

         // Fallback: INFORMATION_SCHEMA (some DBs hide objects from it)
         const likeRes = await req.query(`
             SELECT TOP 1 TABLE_SCHEMA, TABLE_NAME
             FROM INFORMATION_SCHEMA.TABLES
             WHERE TABLE_NAME LIKE '%STINVTOT'
             ORDER BY CASE WHEN TABLE_NAME LIKE 'LV_%' THEN 1 ELSE 2 END, TABLE_NAME
         `);

         const foundSchema = String(likeRes.recordset?.[0]?.TABLE_SCHEMA || '').trim();
         const foundName = String(likeRes.recordset?.[0]?.TABLE_NAME || '').trim();
         if (foundSchema && foundName) return `[${foundSchema}].[${foundName}]`;

         throw new Error('STINVTOT table/view not found in Logo DB');
     }

     async getLogoStockMapByLogicalrefs(logicalrefs) {
         const refs = Array.from(new Set((logicalrefs || []).map(r => Number(r)).filter(n => Number.isFinite(n))));
         if (refs.length === 0) return new Map();

         const pool = await sql.connect(logoConfig);
         const request = pool.request();
         request.input('refs', sql.NVarChar(sql.MAX), refs.join(','));

         const stinvTotName = await this.resolveLogoStockTotalsTableName(pool);

         const q = `
             SELECT
                 S.STOCKREF as stockref,
                 S.INVENNO as invenno,
                 ISNULL(SUM(S.ONHAND - S.RESERVED), 0) as avail
             FROM ${stinvTotName} S
             WHERE S.STOCKREF IN (
                 SELECT TRY_CAST(value AS INT)
                 FROM STRING_SPLIT(@refs, ',')
             )
               AND S.INVENNO IN (0,1,2,3)
             GROUP BY S.STOCKREF, S.INVENNO
         `;

         const result = await request.query(q);
         const map = new Map();
         for (const row of (result.recordset || [])) {
             const ref = Number(row.stockref);
             const inv = Number(row.invenno);
             const avail = Number(row.avail) || 0;
             if (!map.has(ref)) map.set(ref, new Map());
             map.get(ref).set(inv, avail);
         }
         return map;
     }


     async meiliSearchEnriched(req, res) {
         const startTime = Date.now();
         try {
             const body = req.body || {};
             const query = String(body.query || body.q || '').trim();
             const limit = Number(body.limit);
             const offset = Number(body.offset);

             const customerCode = String(
                 body.customerCode ||
                 (req.user && (req.user.cari_kodu || req.user.customerCode)) ||
                 ''
             ).trim();

             if (!query || query.length < 2) {
                 return res.status(400).json({ success: false, error: 'En az 2 karakter girin' });
             }

             const result = await meiliSearchService.search(query, {
                 limit: Number.isFinite(limit) ? limit : 50,
                 offset: Number.isFinite(offset) ? offset : 0
             });

             const hits = Array.isArray(result?.hits) ? result.hits : [];

             let activeWarehouses = [0, 1, 2, 3];
             let stockMap = new Map();
             let stockError = null;

             try {
                 activeWarehouses = await this.getActiveWarehouses(customerCode);
                 const logicalrefs = hits
                     .map(h => Number(h?.id))
                     .filter(n => Number.isFinite(n));
                 stockMap = await this.getLogoStockMapByLogicalrefs(logicalrefs);
             } catch (e) {
                 stockError = e?.message || String(e);
                 console.error('❌ Stock enrichment failed (continuing without stock):', stockError);
             }

             const mapped = hits.map((h) => {
                 const itemCode = String(h?.itemCode || h?.code || '').trim();
                 const name = String(h?.name || h?.name2 || h?.name3 || '').trim();
                 const oem = String(h?.oemCode || '').trim();
                 const manufacturer = String(h?.manufacturer || '').trim();
                 const ref = Number(h?.id);
                 const invMap = Number.isFinite(ref) ? (stockMap.get(ref) || new Map()) : new Map();
                 const centralStock = Number(invMap.get(0)) || 0;
                 const ikitelliStock = Number(invMap.get(1)) || 0;
                 const bostanciStock = Number(invMap.get(2)) || 0;
                 const depotStock = Number(invMap.get(3)) || 0;

                 const totalStock = (activeWarehouses || []).reduce((sum, inv) => {
                     if (inv === 0) return sum + centralStock;
                     if (inv === 1) return sum + ikitelliStock;
                     if (inv === 2) return sum + bostanciStock;
                     if (inv === 3) return sum + depotStock;
                     return sum;
                 }, 0);

                 return {
                     logoLogicalref: Number.isFinite(ref) ? ref : null,
                     productCode: itemCode,
                     productName: name,
                     oemCode: oem,
                     manufacturer,
                     totalStock,
                     centralStock,
                     ikitelliStock,
                     bostanciStock,
                     depotStock,
                     discounts: [],
                     totalDiscountRate: 0,
                     unitPrice: 0,
                     finalPrice: 0,
                     currencyCode: 160,
                     customerCode
                 };
             });

             const durationMs = Date.now() - startTime;

             return res.json({
                 success: true,
                 query,
                 customer_code: customerCode,
                 active_warehouses: activeWarehouses,
                 stock_error: stockError,
                 total_results: mapped.length,
                 results: mapped,
                 response_time_ms: durationMs,
                 estimated_total_hits: (result && (result.estimatedTotalHits ?? result.nbHits)) ?? mapped.length,
                 offset: (result && result.offset !== undefined) ? result.offset : (Number.isFinite(offset) ? offset : 0),
                 limit: (result && result.limit !== undefined) ? result.limit : (Number.isFinite(limit) ? limit : 50)
             });
         } catch (error) {
             const durationMs = Date.now() - startTime;
             console.error('❌ meiliSearchEnriched error:', error);
             return res.status(500).json({
                 success: false,
                 error: error?.message || 'Meili arama hatası',
                 response_time_ms: durationMs
             });
         }
     }

     async meiliSearchEnrichedSmart(req, res) {
         // Şimdilik "smart" varyantı aynı handler üzerinden çalışsın.
         // Dashboard bu endpoint'i kullanıyor; ileride müşteri özel sıralama/filtre eklenebilir.
         return this.meiliSearchEnriched(req, res);
     }
    
    // 7.11 ARAMA İSTATİSTİKLERİ
    async getSearchStats(req, res) {
        try {
            const pool = await sql.connect(b2bConfig);
            
            // Son 24 saatteki aramalar
            const statsQuery = `
                SELECT 
                    COUNT(*) as total_searches,
                    AVG(response_time_ms) as avg_response_time,
                    SUM(CASE WHEN cache_hit = 1 THEN 1 ELSE 0 END) as cache_hits,
                    COUNT(DISTINCT customer_code) as unique_customers,
                    MAX(created_at) as last_search
                FROM b2b_search_logs
                WHERE created_at >= DATEADD(HOUR, -24, GETDATE())
            `;
            
            const statsResult = await pool.request().query(statsQuery);
            
            // Popüler aramalar
            const popularQuery = `
                SELECT TOP 10 
                    query,
                    COUNT(*) as search_count,
                    AVG(response_time_ms) as avg_time,
                    MAX(created_at) as last_searched
                FROM b2b_search_logs
                WHERE created_at >= DATEADD(DAY, -7, GETDATE())
                GROUP BY query
                ORDER BY search_count DESC
            `;
            
            const popularResult = await pool.request().query(popularQuery);
            
            res.json({
                success: true,
                stats: statsResult.recordset[0],
                popular_searches: popularResult.recordset
            });
            
        } catch (error) {
            console.error('İstatistik hatası:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    // 7.12 MEILI ENRICHED WRAPPER (temporary - delegates to MeiliSearchController)
    async meiliSearchEnriched(req, res) {
        try {
            const meiliSearchController = require('./meiliSearchController');
            
            // MeiliSearchController doğrudan response döndürür, biz enrich yapacağız
            const response = await new Promise((resolve, reject) => {
                const originalRes = {
                    json: (data) => resolve(data),
                    status: (code) => ({
                        json: (data) => resolve({ ...data, statusCode: code })
                    })
                };
                
                meiliSearchController.search(req, originalRes).catch(reject);
            });
            
            // Response'u enrich et
            if (response && response.hits && Array.isArray(response.hits)) {
                const enrichedHits = await Promise.all(response.hits.map(async (hit) => {
                    // Stok bilgisini ekle
                    const stockInfo = await this.addStockInfoForSingleItem(hit.itemCode || hit.id);
                    // Fiyat bilgisini ekle
                    const priceInfo = await this.addPriceInfoForSingleItem(hit.itemCode || hit.id, req.user?.cari_kodu);
                    
                    return {
                        ...hit,
                        ...stockInfo,
                        ...priceInfo
                    };
                }));
                
                response.hits = enrichedHits;
                return res.json(response);
            }
            
            return res.json(response);
        } catch (error) {
            console.error('meiliSearchEnriched error:', error);
            return res.status(500).json({
                success: false,
                error: 'Arama sıralanamadı'
            });
        }
    }

    // 7.13 MEILISEARCH ARAMA (ENRICHED SMART STRATEGY)
    async meiliSearchEnrichedSmart(req, res) {
        try {
            const meiliSearchController = require('./meiliSearchController');
            
            // MeiliSearch'e delegasyon - Response'u yakalamak için mock nesne kullanıyoruz
            const result = await new Promise((resolve, reject) => {
                const originalRes = {
                    json: (data) => resolve(data),
                    status: (code) => ({
                        json: (data) => resolve({ ...data, statusCode: code })
                    })
                };
                
                meiliSearchController.search(req, originalRes).catch(reject);
            });
            
            // Her hit için stok ve fiyat enrich
            if (result.hits && Array.isArray(result.hits)) {
                const enrichedHits = await Promise.all(result.hits.map(async (hit) => {
                    const itemCode = hit.itemCode || hit.CODE;
                    
                    // Stok enrich
                    const stockInfo = await this.addStockInfoForSingleItem(itemCode);
                    
                    // Fiyat enrich
                    const priceInfo = await this.addPriceInfoForSingleItem(itemCode, req.user?.customerCode);
                    
                    return {
                        ...hit,
                        ...stockInfo,
                        ...priceInfo
                    };
                }));
                result.hits = enrichedHits;
            }
            
            return res.json(result);
        } catch (error) {
            console.error('meiliSearchEnrichedSmart error:', error);
            return res.status(500).json({
                success: false,
                error: 'Arama sıralanamadı'
            });
        }
    }

    // ... (unchanged code)

    // 7.14 TEK ÜRÜN İÇİN STOK BİLGİSİ
    async addStockInfoForSingleItem(itemCode) {
        if (!itemCode) return {};
        
        try {
            const pool = await sql.connect(this.logoConfig);
            const request = pool.request();
            request.input('itemCode', sql.NVarChar(50), itemCode);
            
            // DOĞRU STOK SORGUSU - LV_013_01_STINVTOT view kullanılarak
            const result = await request.query(`
                SELECT 
                    -- Merkez stok (INVENNO = 0)
                    ISNULL(SUM(CASE WHEN S.INVENNO = 0 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) AS centralStock,
                    -- İkitelli (INVENNO = 1)
                    ISNULL(SUM(CASE WHEN S.INVENNO = 1 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) AS ikitelliStock,
                    -- Bostancı (INVENNO = 2)
                    ISNULL(SUM(CASE WHEN S.INVENNO = 2 THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) AS bostanciStock,
                    -- Depo stokları (INVENNO = 1, 2 toplamı - Geriye dönük uyumluluk için)
                    ISNULL(SUM(CASE WHEN S.INVENNO IN (1, 2) THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) AS depotStock,
                    -- Toplam stok
                    ISNULL(SUM(S.ONHAND - S.RESERVED), 0) AS totalStock
                FROM LOGOGO3.dbo.LG_013_ITEMS I
                LEFT JOIN LOGOGO3.dbo.LV_013_01_STINVTOT S ON S.STOCKREF = I.LOGICALREF
                WHERE I.CODE = @itemCode
                GROUP BY I.CODE
            `);
            
            console.log(`Stok sorgusu - ${itemCode}:`, result.recordset.length, 'kayıt bulundu');
            
            const stock = result.recordset[0] || {};
            return {
                centralStock: stock.centralStock || 0,
                ikitelliStock: stock.ikitelliStock || 0,
                bostanciStock: stock.bostanciStock || 0,
                depotStock: stock.depotStock || 0,
                totalStock: stock.totalStock || 0
            };
        } catch (error) {
            console.error('Stok bilgisi alınamadı:', itemCode, error.message);
            return {
                centralStock: 0,
                depotStock: 0,
                totalStock: 0
            };
        }
    }

    // 7.15 TEK ÜRÜN İÇİN FİYAT BİLGİSİ
    async addPriceInfoForSingleItem(itemCode, customerCode) {
        if (!itemCode) return {};
        
        try {
            const pool = await sql.connect(this.logoConfig);
            const request = pool.request();
            request.input('itemCode', sql.NVarChar(50), itemCode);
            if (customerCode) {
                request.input('customerCode', sql.NVarChar(50), customerCode);
            }
            
            // 1. DOĞRU FİYAT SORGUSU - Logo GO3'den fiyat bilgisi al
            const priceResult = await request.query(`
                SELECT TOP 1
                    ISNULL(ROUND(
                        CASE 
                            WHEN PR.CURRENCY = 160 THEN PR.PRICE
                            ELSE PR.PRICE * ISNULL(C.AVGCURRVAL, 1)
                        END, 2
                    ), 0) AS price,
                    CASE PR.CURRENCY
                        WHEN 160 THEN 'TL'
                        WHEN 1 THEN 'USD'
                        WHEN 20 THEN 'EUR'
                        WHEN 17 THEN 'GBP'
                        ELSE 'DİĞER'
                    END AS currency
                FROM LOGOGO3.dbo.LG_013_ITEMS I
                LEFT JOIN LOGOGO3.dbo.LG_013_PRCLIST PR ON PR.CARDREF = I.LOGICALREF
                LEFT JOIN LOGOGO3.dbo.LG_013_AVGCURRS C ON C.CURRTYPE = PR.CURRENCY
                WHERE I.CODE = @itemCode
                    AND PR.PTYPE = 2  -- Satış fiyatı
                    AND (PR.GRPCODE IS NULL OR PR.GRPCODE = '')  -- GRPCODE boş olan varsayılan fiyat
                ORDER BY PR.BEGDATE DESC
            `);
            
            const priceData = priceResult.recordset[0] || {};

            // 2. İskonto Sorgusu (B2B - b2b_customer_overrides tablosundan)
            let discounts = [];
            if (customerCode) {
                // Not: Aynı request nesnesini kullanabiliriz çünkü input'lar aynı scope'da
                const discountResult = await request.query(`
                    SELECT setting_type, value 
                    FROM B2B_TRADE_PRO.dbo.b2b_customer_overrides 
                    WHERE customer_code = @customerCode 
                      AND is_active = 1 
                      AND setting_type LIKE 'discount_general_%'
                      AND item_code IS NULL
                    ORDER BY setting_type
                `);
                
                discounts = discountResult.recordset.map(d => ({
                    type: d.setting_type,
                    rate: Number(d.value) || 0
                }));
            }
            
            console.log(`✅ Fiyat/İskonto sorgusu - ${itemCode}:`, {
                price: priceData.price, 
                discounts: discounts.length
            });
            
            // Frontend sayısal currency kodları bekliyor (160=TL, 1=USD, 20=EUR)
            let currencyCode = 160; // Varsayılan TL
            if (priceData.currency === 'USD') currencyCode = 1;
            if (priceData.currency === 'EUR') currencyCode = 20;
            if (priceData.currency === 'GBP') currencyCode = 17;
            if (priceData.currency === 'TL') currencyCode = 160;

            return {
                price: priceData.price || 0,
                discountRate: 0, // Ana indirim oranı (hesaplanmış) frontend tarafından yapılabilir veya buraya eklenebilir
                discounts: discounts, // Frontend bu diziyi sırayla uygular
                currency: currencyCode
            };
        } catch (error) {
            console.error('❌ Fiyat bilgisi alınamadı:', itemCode, error.message);
            return {
                price: 0,
                discountRate: 0,
                discounts: [],
                currency: 160
            };
        }
    }
}

module.exports = new B2BSearchController();