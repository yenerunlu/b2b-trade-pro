// ============================================
// 7. ADIM: NODE.JS ARAMA API'Sİ
// ============================================

// Dosya: /home/yunlu/b2b-app/controllers/b2bSearchController.js

const sql = require('mssql');
const { b2bConfig, logoConfig } = require('../config/database');
const cacheService = require('../services/cacheService');
const smartSearchHelper = require('./smart-search');
const meiliSearchService = require('../services/meiliSearchService');

 let __logoPool = null;
 async function getLogoPool() {
     if (__logoPool && __logoPool.connected) return __logoPool;
 
     __logoPool = await new sql.ConnectionPool(logoConfig).connect();
     __logoPool.on('error', (err) => {
         console.error('❌ Logo pool error (b2bSearchController):', err && err.message ? err.message : err);
         __logoPool = null;
     });
 
     return __logoPool;
 }

class B2BSearchController {
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

    normalizeKey(value) {
        return String(value || '')
            .trim()
            .toUpperCase();
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
            steps,
            totalDiscountRate
        };
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
        } catch (e) {
            console.error(`❌ Logo PAYMENTREF discount read error (b2bSearchController) ${customerCode}:`, e && e.message ? e.message : e);
            return [];
        }
    }

    async loadCustomerDiscountConfig(customerCode) {
        const GLOBAL_CUSTOMER_CODE = '__GLOBAL__';
        const pool = await sql.connect(b2bConfig);
        const result = await pool.request()
            .input('customerCode', sql.VarChar(50), customerCode)
            .input('globalCode', sql.VarChar(50), GLOBAL_CUSTOMER_CODE)
            .query(`
                SELECT customer_code, setting_type, item_code, value
                FROM B2B_TRADE_PRO.dbo.b2b_customer_overrides
                WHERE customer_code IN (@customerCode, @globalCode)
                  AND is_active = 1
                  AND (
                        setting_type = 'discount_item'
                     OR setting_type = 'discount_manufacturer'
                     OR setting_type = 'discount_priority'
                     OR setting_type LIKE 'discount_general_%'
                  )
            `);

        const customerCfg = {
            priority: null,
            generalRates: [],
            itemRates: new Map(),
            manufacturerRates: new Map()
        };
        const globalCfg = {
            priority: null,
            generalRates: [],
            itemRates: new Map(),
            manufacturerRates: new Map()
        };

        const customerTiers = [];
        const globalTiers = [];

        (result.recordset || []).forEach(r => {
            const owner = String(r.customer_code || '').trim();
            const st = String(r.setting_type || '').trim();
            const itemCode = r.item_code == null ? null : this.normalizeKey(r.item_code);
            const val = Number(r.value);

            const target = owner === customerCode ? customerCfg : globalCfg;
            const tierTarget = owner === customerCode ? customerTiers : globalTiers;

            if (st === 'discount_priority') {
                const code = Number.isFinite(val) ? val : 0;
                if (code === 2) target.priority = 'manufacturer>item>general';
                else if (code === 3) target.priority = 'general>manufacturer>item';
                else target.priority = 'item>manufacturer>general';
            } else if (st === 'discount_item' && itemCode) {
                if (Number.isFinite(val) && val > 0) target.itemRates.set(itemCode, val);
            } else if (st === 'discount_manufacturer' && itemCode) {
                if (Number.isFinite(val) && val > 0) target.manufacturerRates.set(itemCode, val);
            } else if (/^discount_general_(\d+)$/.test(st)) {
                const m = st.match(/^discount_general_(\d+)$/);
                const idx = m ? Number(m[1]) : 0;
                if (idx > 0 && Number.isFinite(val) && val > 0) tierTarget.push({ idx, rate: val });
            }
        });

        customerCfg.generalRates = customerTiers.sort((a, b) => a.idx - b.idx).map(x => x.rate);
        globalCfg.generalRates = globalTiers.sort((a, b) => a.idx - b.idx).map(x => x.rate);

        // Merge: customer overrides win; general tiers/priority fall back to global if customer has none.
        const cfg = {
            priority: customerCfg.priority || globalCfg.priority || 'item>manufacturer>general',
            generalRates: (customerCfg.generalRates && customerCfg.generalRates.length) ? customerCfg.generalRates : (globalCfg.generalRates || []),
            itemRates: new Map([...globalCfg.itemRates, ...customerCfg.itemRates]),
            manufacturerRates: new Map([...globalCfg.manufacturerRates, ...customerCfg.manufacturerRates])
        };

        const priorityPolicy = await this.getGlobalPriorityDiscountPolicy(pool);

        // If Logo defines PAYMENTREF, it becomes the source of truth for general discounts.
        const logoRates = await this.getLogoGeneralDiscountRates(customerCode);
        if (logoRates && logoRates.length) {
            cfg.generalRates = logoRates;
        }

        return {
            ...cfg,
            priorityPolicy
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

    async getGlobalPriorityDiscountPolicy(pool) {
        try {
            const GLOBAL_CUSTOMER_CODE = '__GLOBAL__';
            const query = `
                SELECT setting_type, value
                      , item_code
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
                .input('globalCode', sql.VarChar(50), GLOBAL_CUSTOMER_CODE)
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
                            ratesByIdx: new Map()
                        });
                    }
                    const rule = ruleMap.get(key);

                    const rm = st.match(/^priority_rule_discount_(\d+)$/);
                    if (rm) {
                        const idx = Number(rm[1]);
                        const rate = Number(val);
                        if (idx > 0 && Number.isFinite(rate) && rate > 0) rule.ratesByIdx.set(idx, rate);
                    }
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
                    rates: Array.from(r.ratesByIdx.entries()).sort((a, b) => a[0] - b[0]).map(x => x[1])
                })),
                ...flags
            };
        } catch (error) {
            console.error('❌ Öncelikli iskonto politikası okunamadı:', error.message);
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

        if (pCode && byKey.has(itemKey)) return byKey.get(itemKey);
        if (mCode && byKey.has(manKey)) return byKey.get(manKey);
        if (byKey.has(generalKey)) return byKey.get(generalKey);
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

        if (itemSet) return itemSet.has(pCode);
        if (manSet) return manSet.has(mCode);
        return true;
    }

    buildPriorityDiscountList(rates) {
        return (Array.isArray(rates) ? rates : [])
            .map(r => Number(r) || 0)
            .filter(r => r > 0)
            .map((r, idx) => ({
                type: 'PRIORITY',
                rate: r,
                description: `Öncelikli İskonto ${idx + 1} (%${r})`,
                source: 'GLOBAL_PRIORITY_DISCOUNT'
            }));
    }

    async loadCustomerDiscountConfig(customerCode) {
        const GLOBAL_CUSTOMER_CODE = '__GLOBAL__';
        const pool = await sql.connect(b2bConfig);
        const result = await pool.request()
            .input('customerCode', sql.VarChar(50), customerCode)
            .input('globalCode', sql.VarChar(50), GLOBAL_CUSTOMER_CODE)
            .query(`
                SELECT customer_code, setting_type, item_code, value
                FROM B2B_TRADE_PRO.dbo.b2b_customer_overrides
                WHERE customer_code IN (@customerCode, @globalCode)
                  AND is_active = 1
                  AND (
                        setting_type = 'discount_item'
                     OR setting_type = 'discount_manufacturer'
                     OR setting_type = 'discount_priority'
                     OR setting_type LIKE 'discount_general_%'
                  )
            `);

        const customerCfg = {
            priority: null,
            generalRates: [],
            itemRates: new Map(),
            manufacturerRates: new Map()
        };
        const globalCfg = {
            priority: null,
            generalRates: [],
            itemRates: new Map(),
            manufacturerRates: new Map()
        };

        const customerTiers = [];
        const globalTiers = [];

        (result.recordset || []).forEach(r => {
            const owner = String(r.customer_code || '').trim();
            const st = String(r.setting_type || '').trim();
            const itemCode = r.item_code == null ? null : this.normalizeKey(r.item_code);
            const val = Number(r.value);

            const target = owner === customerCode ? customerCfg : globalCfg;
            const tierTarget = owner === customerCode ? customerTiers : globalTiers;

            if (st === 'discount_priority') {
                const code = Number.isFinite(val) ? val : 0;
                if (code === 2) target.priority = 'manufacturer>item>general';
                else if (code === 3) target.priority = 'general>manufacturer>item';
                else target.priority = 'item>manufacturer>general';
            } else if (st === 'discount_item' && itemCode) {
                if (Number.isFinite(val) && val > 0) target.itemRates.set(itemCode, val);
            } else if (st === 'discount_manufacturer' && itemCode) {
                if (Number.isFinite(val) && val > 0) target.manufacturerRates.set(itemCode, val);
            } else if (/^discount_general_(\d+)$/.test(st)) {
                const m = st.match(/^discount_general_(\d+)$/);
                const idx = m ? Number(m[1]) : 0;
                if (idx > 0 && Number.isFinite(val) && val > 0) tierTarget.push({ idx, rate: val });
            }
        });

        customerCfg.generalRates = customerTiers.sort((a, b) => a.idx - b.idx).map(x => x.rate);
        globalCfg.generalRates = globalTiers.sort((a, b) => a.idx - b.idx).map(x => x.rate);

        // Merge: customer overrides win; general tiers/priority fall back to global if customer has none.
        const cfg = {
            priority: customerCfg.priority || globalCfg.priority || 'item>manufacturer>general',
            generalRates: (customerCfg.generalRates && customerCfg.generalRates.length) ? customerCfg.generalRates : (globalCfg.generalRates || []),
            itemRates: new Map([...globalCfg.itemRates, ...customerCfg.itemRates]),
            manufacturerRates: new Map([...globalCfg.manufacturerRates, ...customerCfg.manufacturerRates])
        };

        const priorityPolicy = await this.getGlobalPriorityDiscountPolicy(pool);

        // If Logo defines PAYMENTREF, it becomes the source of truth for general discounts.
        const logoRates = await this.getLogoGeneralDiscountRates(customerCode);
        if (logoRates && logoRates.length) {
            cfg.generalRates = logoRates;
        }

        return {
            ...cfg,
            priorityPolicy
        };
    }

    enrichProductsWithDiscounts(products, discountCfg) {
        const cfg = discountCfg || { priority: 'item>manufacturer>general', generalRates: [], itemRates: new Map(), manufacturerRates: new Map(), priorityPolicy: null };

        return (Array.isArray(products) ? products : []).map(p => {
            const code = this.normalizeKey(p.code);
            const manufacturer = this.normalizeKey(p.manufacturer);

            const itemRate = cfg.itemRates.has(code) ? cfg.itemRates.get(code) : 0;
            const manufacturerRate = cfg.manufacturerRates.has(manufacturer) ? cfg.manufacturerRates.get(manufacturer) : 0;

            const discounts = this.buildDiscountListByPriority({
                priority: cfg.priority,
                itemRate,
                manufacturerRate,
                generalRates: cfg.generalRates
            });

            let effectiveDiscounts = discounts;
            const policy = cfg.priorityPolicy;
            const inScope = this.isPriorityPolicyInScope({
                policy,
                productCode: code,
                manufacturerCode: manufacturer
            });

            const effRule = inScope
                ? this.selectEffectivePriorityRule({ policy, productCode: code, manufacturerCode: manufacturer })
                : null;

            if (effRule && effRule.rates && effRule.rates.length) {
                effectiveDiscounts = this.buildPriorityDiscountList(effRule.rates);
            } else if (policy && policy.rates && policy.rates.length) {
                const primaryType = (effectiveDiscounts && effectiveDiscounts.length) ? String(effectiveDiscounts[0].type || '') : '';
                const shouldOverrideByPriority =
                    (policy.disableCustomerDiscounts)
                    || (policy.disableItemDiscounts && primaryType === 'ITEM')
                    || (policy.disableManufacturerDiscounts && primaryType === 'MANUFACTURER')
                    || (policy.disableGeneralDiscounts && primaryType === 'GENERAL');

                if (inScope && shouldOverrideByPriority) {
                    effectiveDiscounts = this.buildPriorityDiscountList(policy.rates);
                }
            }

            const applied = this.applySequentialDiscounts(100, effectiveDiscounts.map(d => d.rate));
            const totalDiscountRate = applied.totalDiscountRate;

            const unitPrice = this.formatPrice(p.unitPrice || 0);
            const netUnitPrice = this.applySequentialDiscounts(unitPrice, effectiveDiscounts.map(d => d.rate)).netAmount;

            return {
                ...p,
                discounts: effectiveDiscounts,
                totalDiscountRate: Number(totalDiscountRate.toFixed(2)),
                finalPrice: this.formatPrice(netUnitPrice)
            };
        });
    }

    async meiliSearchEnriched(req, res) {
        const startTime = Date.now();
        const {
            query,
            customerCode = (req.user && (req.user.cari_kodu || req.user.customerCode)) || 'S1981',
            limit = 100,
            offset = 0,
            manufacturerCodes = [],
            vehicleModels = []
        } = req.body || {};

        try {
            const discountCfg = await this.loadCustomerDiscountConfig(customerCode);
            const manufacturerFilter = Array.from(Array.isArray(manufacturerCodes) ? manufacturerCodes : [])
                .map(v => String(v || '').trim())
                .filter(Boolean);
            const vehicleModelFilter = Array.from(Array.isArray(vehicleModels) ? vehicleModels : [])
                .map(v => String(v || '').trim())
                .filter(Boolean);
            const hasAnyFilter = manufacturerFilter.length > 0 || vehicleModelFilter.length > 0;

            const q = String(query || '').trim();
            if (!q && !hasAnyFilter) {
                return res.status(400).json({
                    success: false,
                    error: 'Arama yapın veya filtre seçin'
                });
            }

            const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 200);
            const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);

            // Filter-only search: do NOT use Meilisearch with '*' because it returns arbitrary hits.
            // Instead, query Logo DB directly with pagination so that manufacturer/model filters always work.
            if (!q && hasAnyFilter) {
                const activeWarehouses = await this.getActiveWarehouses(customerCode);
                const { rows: logoRows, total } = await this.getLogoProductsByFiltersPaginated({
                    limit: safeLimit,
                    offset: safeOffset,
                    manufacturerCodes: manufacturerFilter,
                    vehicleModels: vehicleModelFilter
                });

                const products = (logoRows || []).map(item => {
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

                    const unitPrice = this.formatPrice(item.price || 0);
                    const currencyCode = Number(item.currency_code || 160);

                    return {
                        code: item.item_code,
                        name: item.item_name,
                        oemCode: item.oem_code,
                        manufacturer: item.manufacturer,
                        centralStock,
                        ikitelliStock,
                        bostanciStock,
                        depotStock,
                        unitPrice,
                        currencyCode,
                        finalPrice: unitPrice,
                        totalDiscountRate: 0,
                        discounts: [],
                        totalStock
                    };
                });

                const enrichedProducts = this.enrichProductsWithDiscounts(products, discountCfg);

                enrichedProducts.sort((a, b) => Number(b.totalStock || 0) - Number(a.totalStock || 0));

                return res.json({
                    success: true,
                    query: '',
                    total_results: Number(total || 0),
                    results: enrichedProducts,
                    response_time_ms: Date.now() - startTime
                });
            }

            const meiliQuery = q || '*';
            let meiliResult = null;
            let meiliHits = [];
            try {
                meiliResult = await meiliSearchService.search(meiliQuery, {
                    limit: safeLimit,
                    offset: safeOffset
                });
                meiliHits = (meiliResult && Array.isArray(meiliResult.hits)) ? meiliResult.hits : [];
            } catch (meiliErr) {
                console.error('❌ Meili search failed, fallback to Logo DB:', meiliErr && meiliErr.message ? meiliErr.message : meiliErr);

                const activeWarehouses = await this.getActiveWarehouses(customerCode);
                const fallbackRows = await this.getLogoProductsBySearchQuery(q, safeLimit, {
                    manufacturerCodes: manufacturerFilter,
                    vehicleModels: vehicleModelFilter,
                    offset: safeOffset
                });

                const products = (fallbackRows || []).map(item => {
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

                    const unitPrice = this.formatPrice(item.price || 0);
                    const currencyCode = Number(item.currency_code || 160);

                    return {
                        code: item.item_code,
                        name: item.item_name,
                        oemCode: item.oem_code,
                        manufacturer: item.manufacturer,
                        centralStock,
                        ikitelliStock,
                        bostanciStock,
                        depotStock,
                        unitPrice,
                        currencyCode,
                        finalPrice: unitPrice,
                        totalDiscountRate: 0,
                        discounts: [],
                        totalStock
                    };
                });

                const enrichedProducts = this.enrichProductsWithDiscounts(products, discountCfg);
                enrichedProducts.sort((a, b) => Number(b.totalStock || 0) - Number(a.totalStock || 0));

                return res.json({
                    success: true,
                    query: meiliQuery,
                    total_results: enrichedProducts.length,
                    results: enrichedProducts,
                    response_time_ms: Date.now() - startTime,
                    match_type: 'FALLBACK_DB'
                });
            }
            const logicalrefs = Array.from(
                new Set(
                    meiliHits
                        .map(h => h && h.id)
                        .filter(v => Number.isFinite(Number(v)))
                        .map(v => Number(v))
                )
            );

            if (logicalrefs.length === 0) {
                return res.json({
                    success: true,
                    query: meiliQuery,
                    total_results: 0,
                    results: [],
                    response_time_ms: Date.now() - startTime
                });
            }

            const activeWarehouses = await this.getActiveWarehouses(customerCode);
            const logoRows = await this.getLogoProductsByLogicalrefs(logicalrefs, safeLimit, {
                manufacturerCodes: manufacturerFilter,
                vehicleModels: vehicleModelFilter
            });

            const products = (logoRows || []).map(item => {
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

                const unitPrice = this.formatPrice(item.price || 0);
                const currencyCode = Number(item.currency_code || 160);

                return {
                    code: item.item_code,
                    name: item.item_name,
                    oemCode: item.oem_code,
                    manufacturer: item.manufacturer,
                    centralStock,
                    ikitelliStock,
                    bostanciStock,
                    depotStock,
                    unitPrice,
                    currencyCode,
                    finalPrice: unitPrice,
                    totalDiscountRate: 0,
                    discounts: [],
                    totalStock
                };
            });

            const enrichedProducts = this.enrichProductsWithDiscounts(products, discountCfg);

            enrichedProducts.sort((a, b) => Number(b.totalStock || 0) - Number(a.totalStock || 0));

            const totalResults =
                (typeof meiliResult?.estimatedTotalHits === 'number')
                    ? meiliResult.estimatedTotalHits
                    : (typeof meiliResult?.nbHits === 'number')
                        ? meiliResult.nbHits
                        : products.length;

            res.json({
                success: true,
                query: meiliQuery,
                total_results: totalResults,
                results: enrichedProducts,
                response_time_ms: Date.now() - startTime
            });
        } catch (error) {
            const msg = (error && error.message) ? error.message : String(error);
            console.error('❌ Meili enriched search error:', msg);
            // Frontend throws on non-2xx, so never return 500 here.
            return res.json({
                success: true,
                query: String(query || '').trim(),
                total_results: 0,
                results: [],
                response_time_ms: Date.now() - startTime,
                match_type: 'ERROR_DEGRADED',
                error: msg
            });
        }
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
                try {
                    defaultResult = await pool.request()
                        .input('key', sql.VarChar(100), 'show_stock_to_customer')
                        .query(`
                            SELECT TOP 1 setting_value
                            FROM B2B_TRADE_PRO.dbo.b2b_default_settings
                            WHERE setting_key = @key
                            ORDER BY setting_id DESC
                        `);
                } catch (e2) {
                    defaultResult = await pool.request()
                        .input('key', sql.VarChar(100), 'show_stock_to_customer')
                        .query(`
                            SELECT TOP 1 setting_value
                            FROM B2B_TRADE_PRO.dbo.b2b_default_settings
                            WHERE setting_key = @key
                            ORDER BY id DESC
                        `);
                }
            }

            let defaultShow = true;
            if (defaultResult.recordset && defaultResult.recordset.length > 0) {
                const v = String(defaultResult.recordset[0].setting_value ?? '').trim().toLowerCase();
                defaultShow = v === '1' || v === 'true' || v === 'yes' || v === 'evet';
            }

            let overrideResult;
            try {
                overrideResult = await pool.request()
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
            } catch (e) {
                overrideResult = await pool.request()
                    .input('customerCode', sql.VarChar(50), customerCode)
                    .query(`
                        SELECT TOP 1 value
                        FROM B2B_TRADE_PRO.dbo.b2b_customer_overrides
                        WHERE customer_code = @customerCode
                          AND setting_type = 'show_stock'
                          AND item_code IS NULL
                        ORDER BY id DESC
                    `);
            }

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
                try {
                    defaultResult = await pool.request()
                        .input('key', sql.VarChar(100), 'active_warehouses_invenno')
                        .query(`
                            SELECT TOP 1 setting_value
                            FROM B2B_TRADE_PRO.dbo.b2b_default_settings
                            WHERE setting_key = @key
                            ORDER BY setting_id DESC
                        `);
                } catch (e2) {
                    defaultResult = await pool.request()
                        .input('key', sql.VarChar(100), 'active_warehouses_invenno')
                        .query(`
                            SELECT TOP 1 setting_value
                            FROM B2B_TRADE_PRO.dbo.b2b_default_settings
                            WHERE setting_key = @key
                            ORDER BY id DESC
                        `);
                }
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

            let overrideResult;
            try {
                overrideResult = await pool.request()
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
            } catch (e) {
                overrideResult = await pool.request()
                    .input('customerCode', sql.VarChar(50), customerCode)
                    .query(`
                        SELECT TOP 1 value
                        FROM B2B_TRADE_PRO.dbo.b2b_customer_overrides
                        WHERE customer_code = @customerCode
                          AND setting_type = 'active_warehouses'
                          AND item_code IS NULL
                        ORDER BY id DESC
                    `);
            }

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
	    const {
	        query,
	        customerCode = 'S1981',
	        manufacturerCodes = [],
	        vehicleModels = []
	    } = req.body || {};

	    const manufacturerFilter = Array.from(Array.isArray(manufacturerCodes) ? manufacturerCodes : [])
	        .map(v => String(v || '').trim())
	        .filter(Boolean);
	    const vehicleModelFilter = Array.from(Array.isArray(vehicleModels) ? vehicleModels : [])
	        .map(v => String(v || '').trim())
	        .filter(Boolean);

        try {
            if (!query || query.trim().length < 2) {
                return res.status(400).json({
                    success: false,
                    error: 'En az 2 karakter girin'
                });
            }

            console.log(`🎯 Smart search: ${query} for ${customerCode}`);

            // Kod/OEM benzeri sorgularda Meilisearch'i birincil kaynak olarak kullan
            let meiliUsed = false;
            let meiliHits = [];
            try {
                const nq = (meiliSearchService && typeof meiliSearchService.normalizeQuery === 'function')
                    ? meiliSearchService.normalizeQuery(query)
                    : { isCodeLike: false };

                if (nq && nq.isCodeLike) {
                    const qForMeili = (nq && nq.compact) ? nq.compact : query;
                    const meiliResult = await meiliSearchService.search(qForMeili, { limit: 50, offset: 0 });
                    meiliHits = (meiliResult && Array.isArray(meiliResult.hits)) ? meiliResult.hits : [];
                    if (meiliHits.length > 0) {
                        meiliUsed = true;
                        console.log(`✅ Meili code/OEM match: ${meiliHits.length} hit`);
                    }
                }
            } catch (e) {
                console.error('❌ Meili integration error (smart-search):', e.message);
            }

            const helperResult = meiliUsed
                ? { success: true, type: 'MEILI_MATCH' }
                : await smartSearchHelper.smartSearch(query, customerCode, 50);

            const activeWarehouses = await this.getActiveWarehouses(customerCode);

            let products = [];
            let matchType = (helperResult && helperResult.type) ? helperResult.type : 'UNKNOWN';
            let groupId = null;

	            if (meiliUsed) {
                const logicalrefs = Array.from(
                    new Set(
                        (meiliHits || [])
                            .map(h => h.id)
                            .filter(v => Number.isFinite(Number(v)))
                            .map(v => Number(v))
                    )
                );

	                const logoRows = await this.getLogoProductsByLogicalrefs(logicalrefs, 50, {
	                    manufacturerCodes: manufacturerFilter,
	                    vehicleModels: vehicleModelFilter
	                });
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

                products.sort((a, b) => Number(b.totalStock || 0) - Number(a.totalStock || 0));
            }

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

                const logoRows = await this.getLogoProductsByLogicalrefs(logicalrefs, 50, {
                    manufacturerCodes: manufacturerFilter,
                    vehicleModels: vehicleModelFilter
                });
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
                if (!meiliUsed) {
                    const fallback = await this.getLogoProductsBySearchQuery(query, 50, {
                        manufacturerCodes: manufacturerFilter,
                        vehicleModels: vehicleModelFilter
                    });
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

    async getLogoProductsByLogicalrefs(logicalrefs, limit = 50, filters = {}) {
        if (!Array.isArray(logicalrefs) || logicalrefs.length === 0) return [];

	    const manufacturerCodes = Array.from(Array.isArray(filters.manufacturerCodes) ? filters.manufacturerCodes : [])
	        .map(v => String(v || '').trim())
	        .filter(Boolean);
	    const vehicleModels = Array.from(Array.isArray(filters.vehicleModels) ? filters.vehicleModels : [])
	        .map(v => String(v || '').trim())
	        .filter(Boolean);

        const pool = await getLogoPool();
        const request = pool.request();
        request.input('refs', sql.NVarChar(sql.MAX), logicalrefs.join(','));
        request.input('limit', sql.Int, limit);

	    const manufacturerPlaceholders = manufacturerCodes.map((v, i) => {
	        const key = `m${i}`;
	        request.input(key, sql.NVarChar(50), v);
	        return `@${key}`;
	    });

	    const vehiclePlaceholders = vehicleModels.map((v, i) => {
	        const key = `vm${i}`;
	        request.input(key, sql.NVarChar(100), v);
	        return `@${key}`;
	    });

	    const manufacturerWhere = manufacturerPlaceholders.length > 0
	        ? ` AND I.STGRPCODE IN (${manufacturerPlaceholders.join(', ')})`
	        : '';
	    const vehicleWhere = vehiclePlaceholders.length > 0
	        ? ` AND I.SPECODE IN (${vehiclePlaceholders.join(', ')})`
	        : '';

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
                    FROM dbo.LG_013_PRCLIST P
                    WHERE P.CARDREF = I.LOGICALREF
                      AND P.ACTIVE = 0
                      AND P.PRIORITY = 0
                    ORDER BY P.BEGDATE DESC
                ) AS price
                ,(
                    SELECT TOP 1 P.CURRENCY
                    FROM dbo.LG_013_PRCLIST P
                    WHERE P.CARDREF = I.LOGICALREF
                      AND P.ACTIVE = 0
                      AND P.PRIORITY = 0
                    ORDER BY P.BEGDATE DESC
                ) AS currency_code
            FROM dbo.LG_013_ITEMS I
            LEFT JOIN dbo.LV_013_01_STINVTOT S ON S.STOCKREF = I.LOGICALREF
            WHERE I.ACTIVE = 0
              AND I.CARDTYPE = 1
              AND I.LOGICALREF IN (
                  SELECT TRY_CAST(value AS INT)
                  FROM STRING_SPLIT(@refs, ',')
              )
              ${manufacturerWhere}
              ${vehicleWhere}
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

    async getLogoProductsBySearchQuery(query, limit = 50, filters = {}) {
        const pool = await getLogoPool();
        const request = pool.request();
        request.input('searchQuery', sql.NVarChar(100), `%${query}%`);
        request.input('limit', sql.Int, limit);

	    const manufacturerCodes = Array.from(Array.isArray(filters.manufacturerCodes) ? filters.manufacturerCodes : [])
	        .map(v => String(v || '').trim())
	        .filter(Boolean);
	    const vehicleModels = Array.from(Array.isArray(filters.vehicleModels) ? filters.vehicleModels : [])
	        .map(v => String(v || '').trim())
	        .filter(Boolean);

	    const manufacturerPlaceholders = manufacturerCodes.map((v, i) => {
	        const key = `m${i}`;
	        request.input(key, sql.NVarChar(50), v);
	        return `@${key}`;
	    });

	    const vehiclePlaceholders = vehicleModels.map((v, i) => {
	        const key = `vm${i}`;
	        request.input(key, sql.NVarChar(100), v);
	        return `@${key}`;
	    });

	    const manufacturerWhere = manufacturerPlaceholders.length > 0
	        ? ` AND I.STGRPCODE IN (${manufacturerPlaceholders.join(', ')})`
	        : '';
	    const vehicleWhere = vehiclePlaceholders.length > 0
	        ? ` AND I.SPECODE IN (${vehiclePlaceholders.join(', ')})`
	        : '';

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
                    FROM dbo.LG_013_PRCLIST P
                    WHERE P.CARDREF = I.LOGICALREF
                      AND P.ACTIVE = 0
                      AND P.PRIORITY = 0
                    ORDER BY P.BEGDATE DESC
                ) AS price
                ,(
                    SELECT TOP 1 P.CURRENCY
                    FROM dbo.LG_013_PRCLIST P
                    WHERE P.CARDREF = I.LOGICALREF
                      AND P.ACTIVE = 0
                      AND P.PRIORITY = 0
                    ORDER BY P.BEGDATE DESC
                ) AS currency_code
            FROM dbo.LG_013_ITEMS I
            LEFT JOIN dbo.LV_013_01_STINVTOT S ON S.STOCKREF = I.LOGICALREF
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
              ${manufacturerWhere}
              ${vehicleWhere}
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

    async getLogoProductsByFiltersPaginated({ limit = 50, offset = 0, manufacturerCodes = [], vehicleModels = [] } = {}) {
        const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
        const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);

        const manufacturerFilter = Array.from(Array.isArray(manufacturerCodes) ? manufacturerCodes : [])
            .map(v => String(v || '').trim())
            .filter(Boolean);
        const vehicleModelFilter = Array.from(Array.isArray(vehicleModels) ? vehicleModels : [])
            .map(v => String(v || '').trim())
            .filter(Boolean);

        const pool = await getLogoPool();
        const request = pool.request();
        request.input('limit', sql.Int, safeLimit);
        request.input('offset', sql.Int, safeOffset);

        const manufacturerPlaceholders = manufacturerFilter.map((v, i) => {
            const key = `mfp${i}`;
            request.input(key, sql.NVarChar(50), v);
            return `@${key}`;
        });

        const vehiclePlaceholders = vehicleModelFilter.map((v, i) => {
            const key = `vmfp${i}`;
            request.input(key, sql.NVarChar(100), v);
            return `@${key}`;
        });

        const manufacturerWhere = manufacturerPlaceholders.length > 0
            ? ` AND I.STGRPCODE IN (${manufacturerPlaceholders.join(', ')})`
            : '';
        const vehicleWhere = vehiclePlaceholders.length > 0
            ? ` AND I.SPECODE IN (${vehiclePlaceholders.join(', ')})`
            : '';

        const countQuery = `
            SELECT COUNT(DISTINCT I.LOGICALREF) AS total
            FROM dbo.LG_013_ITEMS I
            WHERE I.ACTIVE = 0
              AND I.CARDTYPE = 1
              ${manufacturerWhere}
              ${vehicleWhere}
        `;

        const listQuery = `
            SELECT
                I.LOGICALREF,
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
                    FROM dbo.LG_013_PRCLIST P
                    WHERE P.CARDREF = I.LOGICALREF
                      AND P.ACTIVE = 0
                      AND P.PRIORITY = 0
                    ORDER BY P.BEGDATE DESC
                ) AS price,
                (
                    SELECT TOP 1 P.CURRENCY
                    FROM dbo.LG_013_PRCLIST P
                    WHERE P.CARDREF = I.LOGICALREF
                      AND P.ACTIVE = 0
                      AND P.PRIORITY = 0
                    ORDER BY P.BEGDATE DESC
                ) AS currency_code
            FROM dbo.LG_013_ITEMS I
            LEFT JOIN dbo.LV_013_01_STINVTOT S ON S.STOCKREF = I.LOGICALREF
            WHERE I.ACTIVE = 0
              AND I.CARDTYPE = 1
              ${manufacturerWhere}
              ${vehicleWhere}
            GROUP BY
                I.LOGICALREF,
                I.CODE,
                I.NAME,
                I.PRODUCERCODE,
                I.STGRPCODE
            ORDER BY I.CODE
            OFFSET @offset ROWS
            FETCH NEXT @limit ROWS ONLY
        `;

        const countResult = await request.query(countQuery);
        const total = (countResult.recordset && countResult.recordset[0]) ? Number(countResult.recordset[0].total || 0) : 0;

        const listResult = await request.query(listQuery);
        const rows = listResult.recordset || [];

        return { rows, total };
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
            FROM dbo.LG_013_ITEMS
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
                    FROM dbo.LG_013_ITEMS
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
            FROM dbo.LG_013_ITEMS
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
}

module.exports = new B2BSearchController();