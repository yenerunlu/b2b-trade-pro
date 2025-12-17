// public/shared/js/main.js
class B2BUtils {
    constructor() {
        this.init();
    }

    init() {
        this.setupGlobalErrorHandling();
        this.setupLoadingIndicator();
        this.setupTheme();
        this.setupConfigListener();
    }

    // YENİ: Config değişikliklerini dinle
    setupConfigListener() {
        window.addEventListener('b2bConfigChanged', (event) => {
            this.setupTheme(); // Theme'i yeniden yükle
            this.showNotification('Sistem ayarları güncellendi', 'success', 3000);
        });
    }

    // Global error handling - MEVCUT (MÜKEMMEL)
    setupGlobalErrorHandling() {
        window.addEventListener('error', (event) => {
            console.error('Global Error:', event.error);
            this.showNotification('Bir hata oluştu', 'error');
        });

        window.addEventListener('unhandledrejection', (event) => {
            console.error('Unhandled Promise Rejection:', event.reason);
            this.showNotification('İşlem sırasında hata oluştu', 'error');
        });
    }

    // Loading indicator - MEVCUT (GÜNCELLENDİ)
    setupLoadingIndicator() {
        // Stil zaten eklenmiş mi kontrol et
        if (document.querySelector('#b2b-loading-styles')) return;

        const style = document.createElement('style');
        style.id = 'b2b-loading-styles';
        style.textContent = `
            .b2b-loading {
                display: none;
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(255, 255, 255, 0.9);
                z-index: 9999;
                justify-content: center;
                align-items: center;
                flex-direction: column;
                backdrop-filter: blur(2px);
            }
            .b2b-loading.active {
                display: flex;
            }
            .b2b-spinner {
                width: 50px;
                height: 50px;
                border: 4px solid #f3f3f3;
                border-top: 4px solid ${B2BConfig.theme.colors.primary};
                border-radius: 50%;
                animation: b2b-spin 1s linear infinite;
                margin-bottom: 1rem;
            }
            .b2b-loading-text {
                color: ${B2BConfig.theme.colors.primary};
                font-size: 1.1rem;
                font-weight: 500;
            }
            @keyframes b2b-spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);

        // Loading div'i oluştur
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'b2b-loading';
        loadingDiv.innerHTML = `
            <div class="b2b-spinner"></div>
            <div class="b2b-loading-text">Yükleniyor...</div>
        `;
        document.body.appendChild(loadingDiv);
    }

    // Theme setup - MEVCUT (GÜNCELLENDİ)
    setupTheme() {
        const root = document.documentElement;
        
        // CSS değişkenlerini ayarla - YENİ YAPISI
        Object.entries(B2BConfig.theme.colors).forEach(([key, value]) => {
            if (typeof value === 'object') {
                // Nested colors (background gibi)
                Object.entries(value).forEach(([subKey, subValue]) => {
                    root.style.setProperty(`--color-${key}-${subKey}`, subValue);
                });
            } else {
                root.style.setProperty(`--color-${key}`, value);
            }
        });

        // Layout değişkenleri
        Object.entries(B2BConfig.theme.layout).forEach(([key, value]) => {
            if (typeof value === 'object') {
                // Nested layout (spacing gibi)
                Object.entries(value).forEach(([subKey, subValue]) => {
                    root.style.setProperty(`--${key}-${subKey}`, subValue);
                });
            } else {
                root.style.setProperty(`--${key}`, value);
            }
        });

        // Shadow değişkenleri
        Object.entries(B2BConfig.theme.shadows).forEach(([key, value]) => {
            root.style.setProperty(`--shadow-${key}`, value);
        });
    }

    // Loading methods - MEVCUT (MÜKEMMEL)
    showLoading(text = 'Yükleniyor...') {
        const loading = document.querySelector('.b2b-loading');
        if (loading) {
            const textElement = loading.querySelector('.b2b-loading-text');
            if (textElement) textElement.textContent = text;
            loading.classList.add('active');
        }
    }

    hideLoading() {
        const loading = document.querySelector('.b2b-loading');
        if (loading) loading.classList.remove('active');
    }

    // Notification system - MEVCUT (GÜNCELLENDİ)
    showNotification(message, type = 'info', duration = 5000) {
        // Stil ekle (henüz yoksa)
        if (!document.querySelector('#b2b-notification-styles')) {
            const style = document.createElement('style');
            style.id = 'b2b-notification-styles';
            style.textContent = `
                .b2b-notification {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background: white;
                    border-left: 4px solid var(--color-primary);
                    border-radius: var(--borderRadius);
                    box-shadow: var(--shadow-default);
                    padding: 1rem 1.25rem;
                    min-width: 320px;
                    max-width: 500px;
                    display: flex;
                    align-items: center;
                    z-index: 10000;
                    animation: b2b-slideIn 0.3s ease;
                    font-family: var(--font-family, inherit);
                }
                .b2b-notification-success { 
                    border-left-color: var(--color-success);
                    background: #f0fdf4;
                }
                .b2b-notification-error { 
                    border-left-color: var(--color-error);
                    background: #fef2f2;
                }
                .b2b-notification-warning { 
                    border-left-color: var(--color-warning);
                    background: #fffbeb;
                }
                .b2b-notification-info { 
                    border-left-color: var(--color-info);
                    background: #f0f9ff;
                }
                .b2b-notification-icon {
                    margin-right: 0.75rem;
                    font-weight: bold;
                    font-size: 1.2rem;
                    width: 24px;
                    text-align: center;
                }
                .b2b-notification-content {
                    flex: 1;
                    font-size: 0.9rem;
                    line-height: 1.4;
                    color: #374151;
                }
                .b2b-notification-close {
                    background: none;
                    border: none;
                    font-size: 1.5rem;
                    cursor: pointer;
                    margin-left: 0.5rem;
                    color: #6b7280;
                    padding: 0;
                    width: 24px;
                    height: 24px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 4px;
                    transition: all 0.2s ease;
                }
                .b2b-notification-close:hover {
                    background: #f3f4f6;
                    color: #374151;
                }
                @keyframes b2b-slideIn {
                    from { 
                        transform: translateX(100%); 
                        opacity: 0; 
                    }
                    to { 
                        transform: translateX(0); 
                        opacity: 1; 
                    }
                }
                @keyframes b2b-slideOut {
                    from { 
                        transform: translateX(0); 
                        opacity: 1; 
                    }
                    to { 
                        transform: translateX(100%); 
                        opacity: 0; 
                    }
                }
            `;
            document.head.appendChild(style);
        }

        const notification = document.createElement('div');
        notification.className = `b2b-notification b2b-notification-${type}`;
        
        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };

        notification.innerHTML = `
            <div class="b2b-notification-icon">${icons[type] || icons.info}</div>
            <div class="b2b-notification-content">${message}</div>
            <button class="b2b-notification-close" onclick="this.parentElement.remove()">×</button>
        `;

        document.body.appendChild(notification);

        // Otomatik kapanma
        if (duration > 0) {
            setTimeout(() => {
                if (notification.parentElement) {
                    notification.style.animation = 'b2b-slideOut 0.3s ease';
                    setTimeout(() => {
                        if (notification.parentElement) {
                            notification.remove();
                        }
                    }, 300);
                }
            }, duration);
        }

        return notification;
    }

    // Format methods - MEVCUT (MÜKEMMEL)
    formatCurrency(amount, currency = B2BConfig.settings.price.currency) {
        const formatter = new Intl.NumberFormat('tr-TR', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: B2BConfig.settings.price.decimalPlaces
        });
        return formatter.format(amount);
    }

    formatDate(date, format = B2BConfig.settings.display.dateFormat) {
        const d = new Date(date);
        const day = d.getDate().toString().padStart(2, '0');
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        const year = d.getFullYear();

        return format.replace('DD', day).replace('MM', month).replace('YYYY', year);
    }

    formatNumber(number, decimals = 2) {
        return new Intl.NumberFormat('tr-TR', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }).format(number);
    }

    // YENİ: Zaman formatı
    formatTime(date, format = B2BConfig.settings.display.timeFormat) {
        const d = new Date(date);
        const hours = d.getHours().toString().padStart(2, '0');
        const minutes = d.getMinutes().toString().padStart(2, '0');
        
        if (format === '12h') {
            const period = hours >= 12 ? 'PM' : 'AM';
            const twelveHour = hours % 12 || 12;
            return `${twelveHour}:${minutes} ${period}`;
        }
        
        return `${hours}:${minutes}`;
    }

    // Validation methods - MEVCUT (MÜKEMMEL)
    validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }

    validatePhone(phone) {
        const re = /^(\+90|0)?[5][0-9]{9}$/;
        return re.test(phone.replace(/\s/g, ''));
    }

    validateTCKN(tckn) {
        if (tckn.length !== 11) return false;
        if (isNaN(tckn)) return false;
        
        let sum = 0;
        for (let i = 0; i < 10; i++) {
            sum += parseInt(tckn[i]);
        }
        
        return sum % 10 === parseInt(tckn[10]);
    }

    // YENİ: Boşluk kontrolü
    isEmpty(value) {
        if (value === null || value === undefined) return true;
        if (typeof value === 'string') return value.trim() === '';
        if (Array.isArray(value)) return value.length === 0;
        if (typeof value === 'object') return Object.keys(value).length === 0;
        return false;
    }

    // Storage methods - MEVCUT (GÜNCELLENDİ)
    setStorage(key, value) {
        try {
            localStorage.setItem(`${B2BConfig.storage.prefix || 'b2b'}_${key}`, JSON.stringify(value));
            return true;
        } catch (error) {
            console.error('Storage error:', error);
            this.showNotification('Depolama alanı dolu', 'error');
            return false;
        }
    }

    getStorage(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(`${B2BConfig.storage.prefix || 'b2b'}_${key}`);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            console.error('Storage read error:', error);
            return defaultValue;
        }
    }

    removeStorage(key) {
        localStorage.removeItem(`${B2BConfig.storage.prefix || 'b2b'}_${key}`);
    }

    // YENİ: Tüm storage'ı temizle (logout için)
    clearStorage() {
        const prefix = B2BConfig.storage.prefix || 'b2b';
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith(prefix + '_')) {
                localStorage.removeItem(key);
            }
        });
    }

    // DOM utilities - MEVCUT (MÜKEMMEL)
    $(selector) {
        return document.querySelector(selector);
    }

    $$(selector) {
        return document.querySelectorAll(selector);
    }

    createElement(tag, classes = '', content = '') {
        const element = document.createElement(tag);
        if (classes) element.className = classes;
        if (content) element.innerHTML = content;
        return element;
    }

    // YENİ: Element göster/gizle
    showElement(selector) {
        const element = this.$(selector);
        if (element) element.style.display = '';
    }

    hideElement(selector) {
        const element = this.$(selector);
        if (element) element.style.display = 'none';
    }

    // Navigation - MEVCUT (GÜNCELLENDİ)
    redirectTo(path) {
        window.location.href = path;
    }

    reloadPage() {
        window.location.reload();
    }

    // YENİ: Geri butonu
    goBack() {
        window.history.back();
    }

    // User type check - MEVCUT (GÜNCELLENDİ)
    getUserType() {
        return this.getStorage(B2BConfig.storage.userType);
    }

    isAdmin() {
        return this.getUserType() === 'admin';
    }

    isSales() {
        return this.getUserType() === 'sales';
    }

    isCustomer() {
        return this.getUserType() === 'customer';
    }

    // YENİ: Kullanıcı verilerini getir
    getUserData() {
        return this.getStorage(B2BConfig.storage.userData, {});
    }

    // Permission check - MEVCUT (GÜNCELLENDİ)
    hasPermission(permission) {
        const userType = this.getUserType();
        const userConfig = B2BConfig.getUserTypeConfig(userType);
        
        if (!userConfig) return false;
        if (userConfig.permissions.includes('all')) return true;
        
        return userConfig.permissions.includes(permission);
    }

    // YENİ: Sayfa koruma
    protectPage(allowedRoles = ['admin']) {
        const userType = this.getUserType();
        if (!userType || !allowedRoles.includes(userType)) {
            this.showNotification('Bu sayfaya erişim yetkiniz yok', 'error');
            this.redirectTo('/login.html');
            return false;
        }
        return true;
    }

    // Debounce function - MEVCUT (MÜKEMMEL)
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Throttle function - MEVCUT (MÜKEMMEL)
    throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    // API wrapper with loading - MEVCUT (GÜNCELLENDİ)
    async apiCall(apiCall, showLoading = true, loadingText = 'Yükleniyor...') {
        if (showLoading) this.showLoading(loadingText);
        
        try {
            const result = await apiCall;
            return result;
        } catch (error) {
            const errorMessage = error.message || 'İşlem başarısız';
            this.showNotification(errorMessage, 'error');
            throw error;
        } finally {
            if (showLoading) this.hideLoading();
        }
    }

    // YENİ: Confirm dialog
    async confirm(message, title = 'Onay') {
        return new Promise((resolve) => {
            const modal = this.createElement('div', 'b2b-confirm-modal');
            modal.innerHTML = `
                <div class="b2b-confirm-overlay">
                    <div class="b2b-confirm-dialog">
                        <div class="b2b-confirm-header">
                            <h3>${title}</h3>
                        </div>
                        <div class="b2b-confirm-body">
                            <p>${message}</p>
                        </div>
                        <div class="b2b-confirm-footer">
                            <button class="b2b-btn b2b-btn-cancel">İptal</button>
                            <button class="b2b-btn b2b-btn-confirm">Onayla</button>
                        </div>
                    </div>
                </div>
            `;
            
            // Stil ekle
            if (!document.querySelector('#b2b-confirm-styles')) {
                const style = this.createElement('style');
                style.id = 'b2b-confirm-styles';
                style.textContent = `
                    .b2b-confirm-overlay {
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        background: rgba(0,0,0,0.5);
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        z-index: 10001;
                    }
                    .b2b-confirm-dialog {
                        background: white;
                        border-radius: var(--borderRadius);
                        padding: 1.5rem;
                        min-width: 400px;
                        max-width: 500px;
                        box-shadow: var(--shadow-hover);
                    }
                    .b2b-confirm-header h3 {
                        margin: 0 0 1rem 0;
                        color: var(--color-primary);
                    }
                    .b2b-confirm-body {
                        margin-bottom: 1.5rem;
                    }
                    .b2b-confirm-footer {
                        display: flex;
                        gap: 0.75rem;
                        justify-content: flex-end;
                    }
                    .b2b-btn {
                        padding: 0.5rem 1rem;
                        border: none;
                        border-radius: var(--borderRadius);
                        cursor: pointer;
                        font-size: 0.9rem;
                    }
                    .b2b-btn-cancel {
                        background: #6b7280;
                        color: white;
                    }
                    .b2b-btn-confirm {
                        background: var(--color-primary);
                        color: white;
                    }
                `;
                document.head.appendChild(style);
            }

            document.body.appendChild(modal);

            const cancelBtn = modal.querySelector('.b2b-btn-cancel');
            const confirmBtn = modal.querySelector('.b2b-btn-confirm');

            cancelBtn.onclick = () => {
                modal.remove();
                resolve(false);
            };

            confirmBtn.onclick = () => {
                modal.remove();
                resolve(true);
            };
        });
    }
}

// Global instance oluştur
const b2bUtils = new B2BUtils();

// Global functions for easy access
window.showLoading = (text) => b2bUtils.showLoading(text);
window.hideLoading = () => b2bUtils.hideLoading();
window.showNotification = (message, type, duration) => 
    b2bUtils.showNotification(message, type, duration);
window.formatCurrency = (amount, currency) => 
    b2bUtils.formatCurrency(amount, currency);
window.formatDate = (date, format) => 
    b2bUtils.formatDate(date, format);
window.formatTime = (date, format) =>
    b2bUtils.formatTime(date, format);
window.protectPage = (allowedRoles) =>
    b2bUtils.protectPage(allowedRoles);
window.confirm = (message, title) =>
    b2bUtils.confirm(message, title);

// YENİ: Logout fonksiyonu
window.logout = function() {
    b2bUtils.clearStorage();
    b2bUtils.redirectTo('/login.html');
};

// DOM ready helper - MEVCUT (GÜNCELLENDİ)
document.addEventListener('DOMContentLoaded', function() {
    // Maintenance mod kontrolü
    if (B2BConfig.system.maintenance && !b2bUtils.isAdmin()) {
        document.body.innerHTML = `
            <div style="
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                background: var(--color-background-primary);
                text-align: center;
                font-family: var(--font-family);
            ">
                <div>
                    <h1 style="color: var(--color-primary); margin-bottom: 1rem;">⏳ Bakım Modu</h1>
                    <p style="color: var(--color-secondary);">Sistem şuanda bakımda, lütfen daha sonra tekrar deneyin.</p>
                    ${B2BConfig.system.maintenanceMessage ? 
                        `<p style="color: var(--color-warning); margin-top: 1rem;">${B2BConfig.system.maintenanceMessage}</p>` : ''}
                </div>
            </div>
        `;
        return;
    }

    // Auto-init components with data-b2b attributes
    const autoInitElements = document.querySelectorAll('[data-b2b]');
    autoInitElements.forEach(element => {
        const component = element.getAttribute('data-b2b');
        // Component initialization logic can be added here
        console.log(`Initializing B2B component: ${component}`);
    });

    // Session timeout kontrolü
    const sessionTimeout = B2BConfig.settings.security.sessionTimeout * 60 * 1000;
    if (sessionTimeout) {
        let timeoutId;
        
        const resetTimer = () => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                b2bUtils.showNotification('Oturum süreniz doldu', 'warning');
                logout();
            }, sessionTimeout);
        };

        // Kullanıcı aktivitelerini dinle
        ['mousedown', 'keypress', 'scroll', 'touchstart'].forEach(event => {
            document.addEventListener(event, resetTimer, false);
        });

        resetTimer();
    }
});

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { B2BUtils, b2bUtils };
}