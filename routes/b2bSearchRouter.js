// Dosya: /home/yunlu/b2b-app/routes/b2bSearchRouter.js

const express = require('express');
const router = express.Router();
const b2bSearchController = require('../controllers/b2bSearchController');
const meiliSearchController = require('../controllers/meiliSearchController');

// 7.12 AUTH MIDDLEWARE
const authenticateCustomer = (req, res, next) => {
    try {
        const userDataBase64 = req.headers['x-user-data-base64'];
        if (!userDataBase64) {
            return res.status(401).json({ 
                success: false, 
                error: 'Kimlik doğrulama gerekli' 
            });
        }
        
        // Base64 decode
        const decoded = Buffer.from(userDataBase64, 'base64').toString('utf-8');
        const userData = JSON.parse(decoded);

        const role = String(userData?.rol || userData?.user_type || '').toLowerCase();
        if (role !== 'customer') {
            return res.status(401).json({
                success: false,
                error: 'Müşteri oturumu gerekli'
            });
        }

        if (!userData?.cari_kodu && !userData?.customerCode) {
            return res.status(401).json({
                success: false,
                error: 'Müşteri kodu gerekli'
            });
        }

        if (!userData.customerCode) {
            userData.customerCode = userData.cari_kodu;
        }
        
        req.user = userData;
        next();
    } catch (error) {
        console.error('Auth error:', error);
        res.status(401).json({ success: false, error: 'Geçersiz kimlik bilgisi' });
    }
};

// 7.13 ROUTE TANIMLARI

// Akıllı arama (POST - gerçek akıllı arama)
router.post('/smart-search', authenticateCustomer, async (req, res) => {
    return res.status(410).json({
        success: false,
        error: 'Bu arama endpointi devre dışı. Sadece MeiliSearch kullanılabilir.'
    });
});

// Meilisearch - Autocomplete
router.post('/meili-autocomplete', authenticateCustomer, async (req, res) => {
    await meiliSearchController.autocomplete(req, res);
});

// Alias: Autocomplete
router.post('/autocomplete', authenticateCustomer, async (req, res) => {
    await meiliSearchController.autocomplete(req, res);
});

// Meilisearch - Search
router.post('/meili-search', authenticateCustomer, async (req, res) => {
    await meiliSearchController.search(req, res);
});

// Meilisearch - Search (enriched with Logo DB price + warehouse stocks)
router.post('/meili-search-enriched', authenticateCustomer, async (req, res) => {
    await b2bSearchController.meiliSearchEnriched(req, res);
});

// Alias: Search
router.post('/search', authenticateCustomer, async (req, res) => {
    await meiliSearchController.search(req, res);
});

// Meilisearch - Reindex (ops)
router.post('/meili-reindex', authenticateCustomer, async (req, res) => {
    await meiliSearchController.reindex(req, res);
});

// Akıllı arama (GET - test ve debug için)
router.get('/smart-search', authenticateCustomer, async (req, res) => {
    return res.status(410).json({
        success: false,
        error: 'Bu arama endpointi devre dışı. Sadece MeiliSearch kullanılabilir.'
    });
});

// Arama istatistikleri (admin için)
router.get('/stats', authenticateCustomer, async (req, res) => {
    await b2bSearchController.getSearchStats(req, res);
});

// Test endpoint'i
router.get('/test', async (req, res) => {
    res.json({
        success: true,
        message: 'B2B Search API çalışıyor',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

module.exports = router;