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
    await b2bSearchController.smartSearch(req, res);
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
    try {
        const query = req.query.q || req.query.query || '';
        const customerCode = req.query.customerCode || req.query.customer_code || '';

        if (!query || query.trim().length < 2) {
            return res.status(400).json({
                success: false,
                error: 'En az 2 karakter girin'
            });
        }

        console.log(`🔍 [GET] Smart search test: "${query}" - Customer: ${customerCode}`);

        res.json({
            success: true,
            message: 'Smart search GET endpoint aktif',
            query,
            customerCode,
            note: 'Asıl işlev için POST /api/b2b/search/smart-search kullanın'
        });
    } catch (error) {
        console.error('GET smart-search error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
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