// /home/yunlu/b2b-app/routes/b2bRouter.js - TAM GÜNCELLENMİŞ
const express = require('express');
const router = express.Router();
const b2bController = require('../controllers/b2bController');
const b2bAdminController = require('../controllers/b2bAdminController');
const b2bSearchRouter = require('./b2bSearchRouter');

const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: {
        success: false,
        error: 'Çok fazla istek gönderildi. Lütfen 1 dakika sonra tekrar deneyin.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

const adminAuthMiddleware = (req, res, next) => {
    try {
        const userDataHeader = req.headers['x-user-data-base64'] || req.headers['x-user-data'];
        const userType = req.headers['x-user-type'];
        const userCode = req.headers['x-user-code'];
        
        console.log(` Auth Middleware: userType=${userType}, userCode=${userCode}`);
        
        if (!userDataHeader && !userType) {
            if (req.session && req.session.user) {
                req.user = req.session.user;
                console.log(` Session auth: ${req.user.user_type}`);
                return next();
            }
            
            return res.status(401).json({
                success: false,
                error: 'Yetkilendirme gereklidir'
            });
        }

        let userData;
        try {
            if (req.headers['x-user-data-base64']) {
                const decodedString = Buffer.from(req.headers['x-user-data-base64'], 'base64').toString('utf-8');
                userData = JSON.parse(decodedString);
                console.log(' Base64 kullanıcı verisi decode edildi');
            } else if (req.headers['x-user-data']) {
                userData = JSON.parse(req.headers['x-user-data']);
                console.log(' Standart kullanıcı verisi parse edildi');
            }
        } catch (e) {
            userData = null;
            console.error(' Kullanıcı verisi parse hatası:', e.message);
        }

        const isAdmin = userType === 'admin' || 
                       userType === '1' || 
                       (userData && (userData.user_type === 'admin' || userData.user_type === 1));
        
        if (!isAdmin) {
            return res.status(403).json({
                success: false,
                error: 'Bu işlem için admin yetkisi gereklidir'
            });
        }

        req.user = {
            user_type: userType || (userData ? userData.user_type : null),
            user_code: userCode || (userData ? userData.user_code : null),
            ...userData
        };
        
        console.log(` Admin auth başarılı: ${req.user.user_code}`);
        next();
    } catch (error) {
        console.error(' Auth middleware hatası:', error);
        res.status(500).json({
            success: false,
            error: 'Yetkilendirme hatası'
        });
    }
};

const cacheControl = (duration = 300) => {
    return (req, res, next) => {
        if (req.method === 'GET') {
            res.set('Cache-Control', `public, max-age=${duration}`);
        } else {
            res.set('Cache-Control', 'no-store');
        }
        next();
    };
};

const requestLogger = (req, res, next) => {
    const startTime = Date.now();
    const originalSend = res.send;
    
    res.send = function(data) {
        const duration = Date.now() - startTime;
        console.log(` ${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms`);
        
        if (req.originalUrl.includes('/api/b2b/admin/') && res.statusCode >= 400) {
            // DB log yazımı geçici olarak devre dışı (şema/trigger uyuşmazlığı 500 tetikliyor)
        }
        
        return originalSend.call(this, data);
    };
    
    next();
};

router.use(requestLogger);
router.use(limiter);

const customerAuthMiddleware = (req, res, next) => {
    try {
        const userDataBase64 = req.headers['x-user-data-base64'];
        if (!userDataBase64) {
            return res.status(401).json({ success: false, error: 'Kimlik doğrulama gerekli' });
        }
        const decoded = Buffer.from(userDataBase64, 'base64').toString('utf-8');
        const userData = JSON.parse(decoded);
        const role = String(userData?.rol || userData?.user_type || '').toLowerCase();
        if (role !== 'customer') {
            return res.status(401).json({ success: false, error: 'Müşteri oturumu gerekli' });
        }
        req.user = userData;
        next();
    } catch (e) {
        return res.status(401).json({ success: false, error: 'Geçersiz kimlik bilgisi' });
    }
};

router.use('/search', b2bSearchRouter);

router.get('/products', 
    cacheControl(180),
    b2bController.getProductsForCustomer
);

router.get('/products/search', 
    cacheControl(60),
    async (req, res) => {
        return res.status(410).json({
            success: false,
            error: 'Bu arama endpointi devre dışı. Sadece MeiliSearch kullanılabilir.'
        });
    }
);

router.get('/filters',
    cacheControl(600),
    b2bController.getFiltersForCustomer
);

// Global bulk settings for customer payment flow
router.get('/global-settings',
    cacheControl(60),
    customerAuthMiddleware,
    b2bController.getGlobalSettingsForCustomer
);

// Yeni akıllı ürün arama endpoint'i (grup tabanlı smart search)
router.post('/products/smart-search',
    cacheControl(0),
    async (req, res) => {
        return res.status(410).json({
            success: false,
            error: 'Bu arama endpointi devre dışı. Sadece MeiliSearch kullanılabilir.'
        });
    }
);

router.get('/products/:code', 
    cacheControl(300),
    b2bController.getProductDetailForCustomer
);

router.post('/cart/calculate', 
    cacheControl(0),
    b2bController.calculateCart
);

router.get('/customers/:code/info', 
    cacheControl(600),
    b2bController.getCustomerInfo
);

router.get('/exchange-rates',
    cacheControl(3600),
    b2bController.getExchangeRates
);

router.get('/health',
    cacheControl(0),
    async (req, res) => {
        try {
            const healthData = {
                status: 'healthy',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                database: 'connected',
                b2b_api: 'online',
                version: '2.0.0'
            };
            
            try {
                const sql = require('mssql');
                const { b2bConfig } = require('../config/database');
                const pool = await sql.connect(b2bConfig);
                await pool.request().query('SELECT 1 as test');
                healthData.database = 'connected';
            } catch (dbError) {
                healthData.database = 'disconnected';
                healthData.db_error = dbError.message;
            }
            
            res.json({
                success: true,
                data: healthData
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

router.use('/admin', (req, res, next) => {
    console.log(`🛡️ Admin route kontrolü: ${req.originalUrl}`);
    
    if (req.method === 'GET' && req.originalUrl.includes('/api/b2b/admin/products')) {
        console.log('✅ /admin/products için auth gerektirmeden geçiliyor');
        return next();
    }
    
    console.log('🔐 Diğer admin endpoint\'leri için auth uygulanıyor');
    return adminAuthMiddleware(req, res, next);
});

router.get('/admin/products',
    cacheControl(60),
    b2bController.getProductsForAdmin
);

router.put('/admin/products/status',
    cacheControl(0),
    b2bController.updateProductStatusForAdmin
);

router.put('/admin/products/update',
    cacheControl(0),
    b2bController.updateProductForAdmin
);

router.get('/admin/settings',
    cacheControl(300),
    b2bAdminController.getSettings
);

router.put('/admin/settings',
    cacheControl(0),
    b2bAdminController.updateSettings
);

router.get('/admin/order-settings',
    cacheControl(60),
    b2bAdminController.getOrderDistributionSettings
);

router.put('/admin/order-settings',
    cacheControl(0),
    b2bAdminController.updateOrderDistributionSettings
);

router.get('/admin/campaigns',
    cacheControl(120),
    b2bAdminController.getCampaigns
);

router.post('/admin/campaigns',
    cacheControl(0),
    b2bAdminController.saveCampaign
);

router.delete('/admin/campaigns/:id',
    cacheControl(0),
    b2bAdminController.deleteCampaign
);

router.get('/admin/customers/:customerCode/overrides',
    cacheControl(0),
    b2bAdminController.getCustomerOverrides
);

router.post('/admin/customers/:customerCode/overrides/batch',
    cacheControl(0),
    b2bAdminController.saveCustomerOverridesBatch
);

router.post('/admin/customers/overrides',
    cacheControl(0),
    b2bAdminController.saveCustomerOverride
);

router.get('/admin/statistics',
    cacheControl(60),
    b2bAdminController.getStatistics
);

router.get('/admin/logs',
    cacheControl(0),
    async (req, res) => {
        try {
            const { limit = 100, offset = 0, log_type, start_date, end_date } = req.query;
            
            const sql = require('mssql');
            const { b2bConfig } = require('../config/database');
            const pool = await sql.connect(b2bConfig);
            
            let query = `
                SELECT 
                    id,
                    log_type,
                    module,
                    message,
                    user_code,
                    ip_address,
                    duration_ms,
                    created_at
                FROM b2b_system_logs
                WHERE 1=1
            `;
            
            const request = pool.request();
            
            if (log_type) {
                query += ` AND log_type = @logType`;
                request.input('logType', sql.VarChar(50), log_type);
            }
            
            if (start_date) {
                query += ` AND created_at >= @startDate`;
                request.input('startDate', sql.DateTime, new Date(start_date));
            }
            
            if (end_date) {
                query += ` AND created_at <= @endDate`;
                request.input('endDate', sql.DateTime, new Date(end_date));
            }
            
            query += ` ORDER BY created_at DESC
                      OFFSET @offset ROWS
                      FETCH NEXT @limit ROWS ONLY`;
            
            request.input('offset', sql.Int, parseInt(offset));
            request.input('limit', sql.Int, parseInt(limit));
            
            const countQuery = `
                SELECT COUNT(*) as total 
                FROM b2b_system_logs
                WHERE 1=1
                ${log_type ? 'AND log_type = @logType' : ''}
                ${start_date ? 'AND created_at >= @startDate' : ''}
                ${end_date ? 'AND created_at <= @endDate' : ''}
            `;
            
            const [logsResult, countResult] = await Promise.all([
                request.query(query),
                pool.request()
                    .input('logType', sql.VarChar(50), log_type)
                    .input('startDate', sql.DateTime, start_date ? new Date(start_date) : null)
                    .input('endDate', sql.DateTime, end_date ? new Date(end_date) : null)
                    .query(countQuery)
            ]);
            
            res.json({
                success: true,
                data: logsResult.recordset,
                pagination: {
                    total: countResult.recordset[0]?.total || 0,
                    limit: parseInt(limit),
                    offset: parseInt(offset),
                    hasMore: (parseInt(offset) + parseInt(limit)) < (countResult.recordset[0]?.total || 0)
                },
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            console.error('❌ Loglar getirme hatası:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

router.post('/admin/cache/clear',
    cacheControl(0),
    async (req, res) => {
        try {
            const { cacheKey } = req.body;
            
            if (b2bAdminController.clearB2BCache) {
                b2bAdminController.clearB2BCache(cacheKey);
            }
            
            const mainServer = require('../server');
            if (mainServer.getCache && mainServer.getCache()) {
                if (cacheKey) {
                    mainServer.getCache().delete(cacheKey);
                } else {
                    mainServer.getCache().clear();
                }
            }
            
            const message = cacheKey 
                ? `Cache temizlendi: ${cacheKey}`
                : 'Tüm cache temizlendi';
                
            const userCode = req.headers['x-user-code'] || 'admin';
            const sql = require('mssql');
            const { b2bConfig } = require('../config/database');
            const pool = await sql.connect(b2bConfig);
            
            await pool.request()
                .input('logType', sql.VarChar(50), 'cache_clear')
                .input('module', sql.VarChar(50), 'b2b_admin')
                .input('message', sql.NVarChar(500), message)
                .input('userCode', sql.VarChar(50), userCode)
                .input('ipAddress', sql.VarChar(50), req.ip)
                .query(`
                    INSERT INTO b2b_system_logs 
                    (log_type, module, message, user_code, ip_address, created_at)
                    VALUES (@logType, @module, @message, @userCode, @ipAddress, GETDATE())
                `);
            
            res.json({
                success: true,
                message: message,
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            console.error('❌ Cache temizleme hatası:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

router.get('/admin/customers',
    cacheControl(300),
    async (req, res) => {
        try {
            const { limit = 50, offset = 0, search } = req.query;
            
            const sql = require('mssql');
            const { logoConfig } = require('../config/database');
            const pool = await sql.connect(logoConfig);
            
            let query = `
                SELECT 
                    C.CODE as customer_code,
                    C.DEFINITION_ as customer_name,
                    C.CYPHCODE as group_code,
                    COUNT(DISTINCT O.id) as override_count
                FROM LOGOGO3.dbo.LG_013_CLCARD C
                LEFT JOIN B2B_TRADE_PRO.dbo.b2b_customer_overrides O 
                    ON C.CODE = O.customer_code AND O.is_active = 1
                WHERE C.ACTIVE = 0
            `;
            
            const request = pool.request();
            
            if (search) {
                query += ` AND (C.CODE LIKE @search OR C.DEFINITION_ LIKE @search)`;
                request.input('search', sql.NVarChar(100), `%${search}%`);
            }
            
            query += ` GROUP BY C.CODE, C.DEFINITION_, C.CYPHCODE
                      ORDER BY C.CODE
                      OFFSET @offset ROWS
                      FETCH NEXT @limit ROWS ONLY`;
            
            request.input('offset', sql.Int, parseInt(offset));
            request.input('limit', sql.Int, parseInt(limit));
            
            const result = await request.query(query);
            
            res.json({
                success: true,
                data: result.recordset,
                count: result.recordset.length,
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            console.error('❌ Müşteriler listeleme hatası:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

router.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: `Endpoint bulunamadı: ${req.originalUrl}`,
        available_endpoints: {
            public: [
                'GET /api/b2b/products',
                'GET /api/b2b/products/search',
                'GET /api/b2b/products/:code',
                'POST /api/b2b/cart/calculate',
                'GET /api/b2b/customers/:code/info',
                'GET /api/b2b/exchange-rates',
                'GET /api/b2b/health'
            ],
            admin: [
                'GET /api/b2b/admin/products',
                'GET /api/b2b/admin/settings',
                'PUT /api/b2b/admin/settings',
                'GET /api/b2b/admin/campaigns',
                'POST /api/b2b/admin/campaigns',
                'DELETE /api/b2b/admin/campaigns/:id',
                'GET /api/b2b/admin/customers/:customerCode/overrides',
                'POST /api/b2b/admin/customers/overrides',
                'GET /api/b2b/admin/statistics',
                'GET /api/b2b/admin/logs',
                'POST /api/b2b/admin/cache/clear',
                'GET /api/b2b/admin/customers'
            ]
        }
    });
});

router.use((err, req, res, next) => {
    console.error('🔥 Global hata yakalandı:', err);
    
    const errorResponse = {
        success: false,
        error: process.env.NODE_ENV === 'development' ? err.message : 'Sunucu hatası',
        timestamp: new Date().toISOString(),
        path: req.originalUrl
    };
    
    if (process.env.NODE_ENV === 'development') {
        errorResponse.stack = err.stack;
    }
    
    res.status(err.status || 500).json(errorResponse);
});

module.exports = router;