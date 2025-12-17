// /home/yunlu/b2b-app/services/cacheService.js
const cache = new Map();

// Cache stratejileri
const CACHE_STRATEGIES = {
    CUSTOMER_PRODUCTS: (customerId, page, limit) => 
        `cust_${customerId}_products_page${page}_limit${limit}`,
    
    PRODUCT_DETAIL: (customerId, productCode) => 
        `cust_${customerId}_product_${productCode}`,
    
    CUSTOMER_PRICES: (customerId) => 
        `cust_${customerId}_prices`,
    
    REGIONAL_STOCK: (region, productCode) => 
        `stock_${region}_${productCode}`
};

exports.get = (key) => {
    const cached = cache.get(key);
    if (!cached) return null;
    
    const isExpired = Date.now() - cached.timestamp > cached.duration;
    if (isExpired) {
        cache.delete(key);
        return null;
    }
    
    return cached.data;
};

exports.set = (key, data, duration) => {
    cache.set(key, {
        data,
        timestamp: Date.now(),
        duration
    });
    
    // Cache temizleme (eski kayıtları sil)
    cleanupCache();
};

exports.delete = (key) => {
    cache.delete(key);
};

exports.clearByPattern = (pattern) => {
    for (const key of cache.keys()) {
        if (key.includes(pattern)) {
            cache.delete(key);
        }
    }
};

// Otomatik cache temizleme
function cleanupCache() {
    if (cache.size > 1000) { // 1000'den fazla cache varsa
        const now = Date.now();
        let deletedCount = 0;
        
        for (const [key, value] of cache.entries()) {
            if (now - value.timestamp > value.duration) {
                cache.delete(key);
                deletedCount++;
            }
        }
        
        if (deletedCount > 0) {
            console.log(`🧹 Cache temizlendi: ${deletedCount} eski kayıt silindi`);
        }
    }
}

// Cache istatistikleri
exports.getStats = () => {
    return {
        size: cache.size,
        keys: Array.from(cache.keys()),
        timestamp: new Date().toISOString()
    };
};

module.exports.CACHE_STRATEGIES = CACHE_STRATEGIES;