// public/shared/js/config.js
const B2BConfig = {
    // SYSTEM GENEL AYARLARI
    system: {
        companyName: "B2B TRADE PRO",
        version: "1.0.0",
        maintenance: false,
        environment: "production",
        lastConfigUpdate: new Date().toISOString()
    },

    // API Configuration
    api: {
        baseURL: "http://192.168.219.128:8081",
        endpoints: {
            auth: {
                login: "/api/auth/login",
                logout: "/api/auth/logout",
                refresh: "/api/auth/refresh"
            },
            admin: {
                users: "/api/admin/users",
                settings: "/api/admin/settings",
                reports: "/api/admin/reports",
                dashboard: "/api/admin/dashboard",
                updateConfig: "/api/admin/update-config"
            },
            sales: {
                customers: "/api/sales/customers",
                orders: "/api/sales/orders",
                targets: "/api/sales/targets",
                dashboard: "/api/sales/dashboard"
            },
            customer: {
                profile: "/api/customer/profile",
                orders: "/api/customer/orders",
                products: "/api/customer/products",
                dashboard: "/api/customer/dashboard",
                cart: "/api/customer/cart"
            },
            common: {
                upload: "/api/common/upload",
                notifications: "/api/common/notifications",
                search: "/api/common/search"
            }
        },
        timeout: 30000,
        retryAttempts: 3
    },

    // User Type Definitions
    userTypes: {
        admin: {
            id: 1,
            name: "admin",
            displayName: "Yönetici",
            dashboard: "/admin/pages/dashboard.html",
            permissions: ["all"],
            features: ["config_management", "user_management", "reports"]
        },
        sales: {
            id: 2,
            name: "sales", 
            displayName: "Plasiyer",
            dashboard: "/sales/pages/dashboard.html",
            permissions: ["customer_management", "order_management", "reports_view"],
            features: ["customer_dashboard", "order_tracking", "targets"]
        },
        customer: {
            id: 3,
            name: "customer",
            displayName: "Müşteri", 
            dashboard: "/customer/pages/dashboard.html",
            permissions: ["order_history", "product_catalog", "profile_management"],
            features: ["shopping_cart", "order_history", "wishlist", "quick_order"]
        }
    },

    // System Settings
    settings: {
        stock: {
            visibility: true,
            lowStockThreshold: 10,
            showExactQuantity: false,
            allowBackorder: false,
            showStockLocations: true
        },
        price: {
            currency: "TRY",
            symbol: "₺",
            decimalPlaces: 2,
            showTax: true,
            taxRate: 0.20,
            showWithoutTax: false,
            showDiscounts: true
        },
        display: {
            language: "tr",
            dateFormat: "DD.MM.YYYY",
            timeFormat: "24h",
            itemsPerPage: 25,
            theme: "light",
            defaultView: "list",
            showProductImages: true
        },
        features: {
            multiCurrency: false,
            advancedReports: true,
            bulkOperations: true,
            notifications: true,
            quickOrder: true,
            wishlist: true,
            compareProducts: false,
            productSearch: true,
            advancedFilters: true,
            sliderEnabled: true,
            multiSession: true // YENİ: Çoklu oturum desteği
        },
        security: {
            sessionTimeout: 60,
            maxLoginAttempts: 5,
            passwordMinLength: 8,
            autoLogout: true,
            storageType: "sessionStorage" // YENİ: Storage tipi
        },
        dashboard: {
            showStats: true,
            showSlider: true,
            showRecentProducts: true,
            enableSearch: true,
            defaultSort: "name"
        }
    },

    // Theme Configuration
    theme: {
        colors: {
            primary: "#2563eb",
            secondary: "#64748b", 
            success: "#16a34a",
            warning: "#d97706",
            error: "#dc2626",
            info: "#0ea5e9",
            background: {
                primary: "#f5f7fb",
                white: "#ffffff",
                light: "#f8fafc",
                sidebar: "linear-gradient(135deg, #1e3a8a 0%, #3730a3 100%)"
            }
        },
        layout: {
            sidebarWidth: "260px",
            headerHeight: "64px",
            borderRadius: "8px",
            spacing: {
                xs: "0.5rem",
                sm: "1rem", 
                md: "1.5rem",
                lg: "2rem",
                xl: "3rem"
            }
        },
        shadows: {
            default: "0 4px 15px rgba(0,0,0,0.08)",
            hover: "0 8px 25px rgba(0,0,0,0.12)",
            sidebar: "4px 0 15px rgba(0,0,0,0.1)",
            card: "0 2px 8px rgba(0,0,0,0.05)"
        }
    },

    // Storage Keys - YENİ: sessionStorage desteği eklendi
    storage: {
        token: "b2b_access_token",
        userData: "b2b_user_data", 
        userType: "b2b_user_type",
        settings: "b2b_user_settings",
        config: "b2b_system_config",
        cart: "b2b_cart",
        recentProducts: "b2b_recent_products",
        // YENİ: Session storage keys
        sessionId: "b2b_session_id",
        currentSession: "b2b_current_session"
    },

    // 🔽🔽🔽 BURAYA YENİ METODLARI EKLEYİN 🔽🔽🔽

    // YENİ: Session kontrolü için basit metod
    checkSession: function() {
        // Önce sessionStorage kontrol et
        let userData = sessionStorage.getItem(this.storage.userData);
        console.log('🔍 SessionStorage kontrol:', userData ? 'Mevcut' : 'Yok');
        
        // Eğer sessionStorage'da yoksa, localStorage kontrol et
        if (!userData) {
            userData = localStorage.getItem(this.storage.userData);
            console.log('🔍 LocalStorage kontrol:', userData ? 'Mevcut' : 'Yok');
        }
        
        return userData;
    },

    // YENİ: Basit session kontrolü
    isLoggedInSimple: function() {
        return !!this.checkSession();
    },

    // YENİ: Basit kullanıcı verisi alma
    getCurrentUserSimple: function() {
        const userData = this.checkSession();
        if (!userData) return null;
        
        try {
            return JSON.parse(userData);
        } catch (error) {
            console.error('Kullanıcı verisi parse hatası:', error);
            return null;
        }
    },


    // YENİ: Storage yardımcı fonksiyonları
    getStorage: function() {
        return this.settings.security.storageType === "sessionStorage" ? sessionStorage : localStorage;
    },

    setItem: function(key, value) {
        try {
            const storage = this.getStorage();
            storage.setItem(key, value);
            return true;
        } catch (error) {
            console.error('Storage set error:', error);
            return false;
        }
    },

    getItem: function(key) {
        try {
            const storage = this.getStorage();
            return storage.getItem(key);
        } catch (error) {
            console.error('Storage get error:', error);
            return null;
        }
    },

    removeItem: function(key) {
        try {
            const storage = this.getStorage();
            storage.removeItem(key);
            return true;
        } catch (error) {
            console.error('Storage remove error:', error);
            return false;
        }
    },

    // YENİ: Oturum kontrol fonksiyonları
    isLoggedIn: function() {
        const userData = this.getItem(this.storage.userData);
        return !!userData;
    },

    getCurrentUser: function() {
        const userData = this.getItem(this.storage.userData);
        if (!userData) return null;
        
        try {
            return JSON.parse(userData);
        } catch (error) {
            console.error('User data parse error:', error);
            return null;
        }
    },

    getUserType: function() {
        const user = this.getCurrentUser();
        return user ? user.type : null;
    },

    redirectToDashboard: function() {
        const userType = this.getUserType();
        if (!userType) {
            window.location.href = '/login.html';
            return;
        }

        const userConfig = this.userTypes[userType];
        if (userConfig && userConfig.dashboard) {
            window.location.href = userConfig.dashboard;
        } else {
            window.location.href = '/login.html';
        }
    },

    // YENİ: Login sonrası işlemler
    handleLoginSuccess: function(userData) {
        // Kullanıcı verilerini kaydet
        this.setItem(this.storage.userData, JSON.stringify(userData));
        this.setItem(this.storage.userType, userData.type);
        
        // Session ID oluştur (çoklu oturum için)
        if (this.settings.features.multiSession) {
            const sessionId = 'b2b_session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            this.setItem(this.storage.sessionId, sessionId);
        }
        
        // Dashboard'a yönlendir
        setTimeout(() => {
            this.redirectToDashboard();
        }, 1000);
    },

    logout: function() {
        // Tüm storage'ı temizle
        const keys = Object.values(this.storage);
        keys.forEach(key => {
            this.removeItem(key);
        });
        
        // Login sayfasına yönlendir
        window.location.href = '/login.html';
    },

    // Mevcut metodlar...
    getUserTypeConfig: function(userType) {
        return this.userTypes[userType] || null;
    },

    getApiUrl: function(endpointKey) {
        const keys = endpointKey.split('.');
        let endpoint = this.api.endpoints;
        
        for (const key of keys) {
            if (endpoint[key]) {
                endpoint = endpoint[key];
            } else {
                console.error(`Endpoint not found: ${endpointKey}`);
                return null;
            }
        }
        
        return this.api.baseURL + endpoint;
    },

    isFeatureEnabled: function(featurePath) {
        const keys = featurePath.split('.');
        let value = this.settings;
        
        for (const key of keys) {
            if (value[key] === undefined) return false;
            value = value[key];
        }
        
        return value === true;
    },

    getConfigValue: function(configPath, defaultValue = null) {
        const keys = configPath.split('.');
        let value = this;
        
        for (const key of keys) {
            if (value[key] === undefined) return defaultValue;
            value = value[key];
        }
        
        return value;
    },

    updateSettings: function(newSettings) {
        this.mergeDeep(this.settings, newSettings);
        localStorage.setItem(this.storage.settings, JSON.stringify(this.settings));
        this.triggerConfigChange();
        
        if (this.isAdminUser()) {
            this.syncSettingsToServer(newSettings);
        }
    },

    isAdminUser: function() {
        const user = this.getCurrentUser();
        return user ? user.type === 'admin' : false;
    },

    syncSettingsToServer: function(settings) {
        if (!this.isAdminUser()) return;
        
        fetch(this.getApiUrl('admin.updateConfig'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.getItem(this.storage.token)}`
            },
            body: JSON.stringify({
                settings: settings,
                updatedAt: new Date().toISOString()
            })
        })
        .then(response => response.json())
        .then(data => {
            console.log('Settings synced to server:', data);
        })
        .catch(error => {
            console.error('Settings sync failed:', error);
        });
    },

    triggerConfigChange: function() {
        const event = new CustomEvent('b2bConfigChanged', {
            detail: { 
                config: this,
                timestamp: new Date().toISOString()
            }
        });
        window.dispatchEvent(event);
    },

    setMaintenanceMode: function(enabled, message = "") {
        this.system.maintenance = enabled;
        this.system.maintenanceMessage = message;
        this.saveToStorage();
        this.triggerConfigChange();
    },

    saveToStorage: function() {
        try {
            const configToSave = {
                settings: this.settings,
                system: this.system,
                theme: this.theme,
                lastUpdated: new Date().toISOString()
            };
            localStorage.setItem(this.storage.config, JSON.stringify(configToSave));
        } catch (error) {
            console.error('Config save error:', error);
        }
    },

    loadFromStorage: function() {
        try {
            const savedConfig = localStorage.getItem(this.storage.config);
            if (savedConfig) {
                const parsedConfig = JSON.parse(savedConfig);
                
                if (parsedConfig.settings) {
                    this.mergeDeep(this.settings, parsedConfig.settings);
                }
                
                if (parsedConfig.system) {
                    Object.assign(this.system, parsedConfig.system);
                }
                if (parsedConfig.theme) {
                    Object.assign(this.theme, parsedConfig.theme);
                }
            }
        } catch (error) {
            console.error('Config load error:', error);
        }
    },

    mergeDeep: function(target, source) {
        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                if (!target[key]) target[key] = {};
                this.mergeDeep(target[key], source[key]);
            } else {
                target[key] = source[key];
            }
        }
    },

    loadUserSettings: function() {
        const savedSettings = localStorage.getItem(this.storage.settings);
        if (savedSettings) {
            try {
                const parsedSettings = JSON.parse(savedSettings);
                this.settings = { ...this.settings, ...parsedSettings };
            } catch (error) {
                console.error('User settings load error:', error);
            }
        }
    },

    onConfigChange: function(callback) {
        window.addEventListener('b2bConfigChanged', (event) => {
            callback(event.detail.config, event.detail.timestamp);
        });
    },

    getDashboardConfig: function() {
        return {
            showStock: this.isFeatureEnabled('stock.visibility'),
            showPrices: this.isFeatureEnabled('price.showTax'),
            showSlider: this.isFeatureEnabled('dashboard.showSlider'),
            enableSearch: this.isFeatureEnabled('dashboard.enableSearch'),
            quickOrderEnabled: this.isFeatureEnabled('features.quickOrder'),
            theme: this.getConfigValue('theme.colors.primary', '#2563eb')
        };
    },

    initialize: function() {
        this.loadFromStorage();
        this.loadUserSettings();
        
        console.log('🚀 B2B Trade Pro Config initialized', {
            version: this.system.version,
            environment: this.system.environment,
            features: this.settings.features,
            storageType: this.settings.security.storageType
        });
    }
};

// Initialize configuration
B2BConfig.initialize();

// Global erişim
window.B2BConfig = B2BConfig;

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = B2BConfig;
}