// ORTAK UYGULAMA YÖNETİCİSİ
class AppManager {
    constructor() {
        this.currentUser = null;
        this.cart = [];
        this.campaignCart = [];
        this.init();
    }

    init() {
        this.loadUserData();
        this.loadCartData();
        this.setupEventListeners();
        this.updateUI();
    }

    // KULLANICI İŞLEMLERİ
    loadUserData() {
        const userData = localStorage.getItem('currentUser');
        const userRole = localStorage.getItem('userRole');
        
        if (userData) {
            this.currentUser = JSON.parse(userData);
            console.log('Kullanıcı yüklendi:', this.currentUser);
        } else {
            // Demo kullanıcı (login olmadan test için)
            this.currentUser = {
                ad: 'Ahmet',
                soyad: 'Yılmaz',
                kod: 'S6064',
                rol: 'customer'
            };
        }
    }

    // SEPET İŞLEMLERİ
    loadCartData() {
        this.cart = JSON.parse(localStorage.getItem('cart')) || [];
        this.campaignCart = JSON.parse(localStorage.getItem('campaignCart')) || [];
    }

    saveCartData() {
        localStorage.setItem('cart', JSON.stringify(this.cart));
        localStorage.setItem('campaignCart', JSON.stringify(this.campaignCart));
    }

    addToCart(product, quantity = 1, isCampaign = false) {
        const cart = isCampaign ? this.campaignCart : this.cart;
        const existingItem = cart.find(item => item.id === product.id);

        if (existingItem) {
            existingItem.quantity += quantity;
        } else {
            cart.push({
                ...product,
                quantity: quantity,
                isCampaign: isCampaign,
                addedAt: new Date().toISOString()
            });
        }

        this.saveCartData();
        this.updateCartUI();
        this.showNotification(`${product.name} (${quantity} adet) sepete eklendi!`, 'success');
        
        return true;
    }

    removeFromCart(productId, isCampaign = false) {
        const cart = isCampaign ? this.campaignCart : this.cart;
        const index = cart.findIndex(item => item.id === productId);
        
        if (index > -1) {
            cart.splice(index, 1);
            this.saveCartData();
            this.updateCartUI();
            this.showNotification('Ürün sepetten kaldırıldı!', 'info');
            return true;
        }
        return false;
    }

    updateCartQuantity(productId, quantity, isCampaign = false) {
        const cart = isCampaign ? this.campaignCart : this.cart;
        const item = cart.find(item => item.id === productId);
        
        if (item && quantity > 0) {
            item.quantity = quantity;
            this.saveCartData();
            this.updateCartUI();
            return true;
        }
        return false;
    }

    getCartTotal(isCampaign = false) {
        const cart = isCampaign ? this.campaignCart : this.cart;
        return cart.reduce((total, item) => total + (item.cost * item.quantity), 0);
    }

    getCartItemCount(isCampaign = false) {
        const cart = isCampaign ? this.campaignCart : this.cart;
        return cart.reduce((total, item) => total + item.quantity, 0);
    }

    clearCart(isCampaign = false) {
        if (isCampaign) {
            this.campaignCart = [];
        } else {
            this.cart = [];
        }
        this.saveCartData();
        this.updateCartUI();
        this.showNotification('Sepet temizlendi!', 'info');
    }

    // UI GÜNCELLEME
    updateCartUI() {
        // Header'daki sepet sayılarını güncelle
        const cartCountElement = document.getElementById('header-cart-count');
        const campaignCountElement = document.getElementById('header-campaign-count');
        const sidebarCampaignCount = document.getElementById('sidebar-campaign-count');
        
        if (cartCountElement) {
            cartCountElement.textContent = this.getCartItemCount(false);
        }
        if (campaignCountElement) {
            campaignCountElement.textContent = this.getCartItemCount(true);
        }
        if (sidebarCampaignCount) {
            sidebarCampaignCount.textContent = this.getCartItemCount(true);
        }
    }

    updateUserUI() {
        // Kullanıcı bilgilerini güncelle
        const userNameElement = document.getElementById('user-name');
        const userCodeElement = document.getElementById('user-code');
        const userAvatarElement = document.getElementById('user-avatar');
        const welcomeTitleElement = document.getElementById('welcome-title');

        if (this.currentUser) {
            const fullName = `${this.currentUser.ad} ${this.currentUser.soyad}`;
            const userCode = this.currentUser.kod;
            const initials = (this.currentUser.ad?.[0] || '') + (this.currentUser.soyad?.[0] || '');

            if (userNameElement) userNameElement.textContent = fullName;
            if (userCodeElement) userCodeElement.textContent = `Müşteri Kodu: ${userCode}`;
            if (userAvatarElement) userAvatarElement.textContent = initials;
            if (welcomeTitleElement) welcomeTitleElement.textContent = `Hoş Geldiniz, ${this.currentUser.ad} Bey`;
        }
    }

    updateUI() {
        this.updateUserUI();
        this.updateCartUI();
    }

    // BİLDİRİM SİSTEMİ
    showNotification(message, type = 'info') {
        // Mevcut bildirimi kaldır
        const existingNotification = document.getElementById('global-notification');
        if (existingNotification) {
            existingNotification.remove();
        }

        // Yeni bildirim oluştur
        const notification = document.createElement('div');
        notification.id = 'global-notification';
        notification.className = `notification alert alert-${type}`;
        notification.innerHTML = `
            <i class="fas fa-${this.getNotificationIcon(type)}"></i>
            <span>${message}</span>
        `;

        document.body.appendChild(notification);

        // 3 saniye sonra kaldır
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 3000);
    }

    getNotificationIcon(type) {
        const icons = {
            success: 'check-circle',
            error: 'exclamation-circle',
            warning: 'exclamation-triangle',
            info: 'info-circle'
        };
        return icons[type] || 'info-circle';
    }

    // EVENT LISTENER'LAR
    setupEventListeners() {
        // Logout butonları (hem header hem sidebar için)
        document.addEventListener('click', (e) => {
            if (e.target.closest('#logout-btn') || e.target.closest('.sidebar-logout-btn')) {
                e.preventDefault();
                this.logout();
            }
        });

        // Global error handler
        window.addEventListener('error', (e) => {
            console.error('Global error:', e.error);
            this.showNotification('Bir hata oluştu!', 'error');
        });
    }

    // ÇIKIŞ İŞLEMİ
    logout() {
        if (confirm('Çıkış yapmak istediğinizden emin misiniz?')) {
            localStorage.removeItem('currentUser');
            localStorage.removeItem('userRole');
            localStorage.removeItem('cart');
            localStorage.removeItem('campaignCart');
            
            window.location.href = 'login.html';
        }
    }

    // UTILITY FONKSİYONLAR
    formatCurrency(amount) {
        return new Intl.NumberFormat('tr-TR', {
            style: 'currency',
            currency: 'TRY'
        }).format(amount);
    }

    formatDate(date) {
        return new Intl.DateTimeFormat('tr-TR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        }).format(new Date(date));
    }

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
}

// SEPET YÖNETİCİSİ - Kampanya modülü için export edilecek
class CartManager {
    static getItems(isCampaign = false) {
        const cartData = localStorage.getItem(isCampaign ? 'campaignCart' : 'cart');
        return cartData ? JSON.parse(cartData) : [];
    }

    static addItem(item, isCampaign = false) {
        const cart = this.getItems(isCampaign);
        const existingItem = cart.find(cartItem => cartItem.id === item.id);

        if (existingItem) {
            existingItem.quantity += item.quantity || 1;
        } else {
            cart.push({
                ...item,
                quantity: item.quantity || 1,
                addedAt: new Date().toISOString()
            });
        }

        localStorage.setItem(isCampaign ? 'campaignCart' : 'cart', JSON.stringify(cart));
        
        // Header'ı güncelle
        App.updateCartUI();
        
        return true;
    }

    static removeItem(productId, isCampaign = false) {
        const cart = this.getItems(isCampaign);
        const filteredCart = cart.filter(item => item.id !== productId);
        
        localStorage.setItem(isCampaign ? 'campaignCart' : 'cart', JSON.stringify(filteredCart));
        App.updateCartUI();
        
        return true;
    }

    static updateQuantity(productId, quantity, isCampaign = false) {
        const cart = this.getItems(isCampaign);
        const item = cart.find(item => item.id === productId);
        
        if (item && quantity > 0) {
            item.quantity = quantity;
            localStorage.setItem(isCampaign ? 'campaignCart' : 'cart', JSON.stringify(cart));
            App.updateCartUI();
            return true;
        }
        return false;
    }

    static clearCart(isCampaign = false) {
        localStorage.setItem(isCampaign ? 'campaignCart' : 'cart', JSON.stringify([]));
        App.updateCartUI();
        return true;
    }

    static getTotalCount(isCampaign = false) {
        const cart = this.getItems(isCampaign);
        return cart.reduce((total, item) => total + item.quantity, 0);
    }

    static getTotalAmount(isCampaign = false) {
        const cart = this.getItems(isCampaign);
        return cart.reduce((total, item) => total + (item.cost * item.quantity), 0);
    }
}

// UTILITY FONKSİYONLAR - Kampanya modülü için export edilecek
const AppUtils = {
    formatCurrency: (amount) => {
        return new Intl.NumberFormat('tr-TR', {
            style: 'currency',
            currency: 'TRY'
        }).format(amount);
    },

    formatDate: (date) => {
        return new Intl.DateTimeFormat('tr-TR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        }).format(new Date(date));
    },

    debounce: (func, wait) => {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    logout: function() {
        if (confirm('Çıkış yapmak istediğinizden emin misiniz?')) {
            localStorage.removeItem('currentUser');
            localStorage.removeItem('userRole');
            localStorage.removeItem('cart');
            localStorage.removeItem('campaignCart');
            window.location.href = 'login.html';
        }
    }
};

// BİLDİRİM FONKSİYONU - Kampanya modülü için export edilecek
const showNotification = (message, type = 'success') => {
    const notification = document.getElementById('notification');
    const notificationText = document.getElementById('notification-text');
    
    if (!notification || !notificationText) {
        // Eğer bildirim elementi yoksa, AppManager'ın bildirim sistemini kullan
        App.showNotification(message, type);
        return;
    }
    
    // Tip'e göre stil ayarla
    const typeStyles = {
        success: 'linear-gradient(135deg, var(--success-color), var(--success-dark))',
        warning: 'linear-gradient(135deg, var(--warning-color), #d97706)',
        error: 'linear-gradient(135deg, var(--danger-color), #dc2626)',
        info: 'linear-gradient(135deg, var(--info-color), #1d4ed8)'
    };
    
    notification.style.background = typeStyles[type] || typeStyles.success;
    notificationText.textContent = message;
    notification.style.display = 'flex';
    
    // 3 saniye sonra otomatik kapan
    setTimeout(() => {
        notification.style.display = 'none';
    }, 3000);
};

// GLOBAL APP INSTANCE
const App = new AppManager();

// COMPONENT LOADER
function loadComponent(containerId, componentPath) {
    fetch(componentPath)
        .then(response => {
            if (!response.ok) {
                throw new Error('Component bulunamadı');
            }
            return response.text();
        })
        .then(data => {
            document.getElementById(containerId).innerHTML = data;
            // Component yüklendikten sonra UI'ı güncelle
            App.updateUI();
        })
        .catch(error => {
            console.error('Component yüklenirken hata:', error);
            document.getElementById(containerId).innerHTML = `
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-triangle"></i>
                    Component yüklenemedi: ${componentPath}
                </div>
            `;
        });
}

// SAYFA YÜKLENDİĞİNDE
document.addEventListener('DOMContentLoaded', function() {
    console.log('B2B Trade Pro uygulaması başlatıldı');
    
    // Component'leri yükle - pages klasöründen components klasörüne giden yol
    const headerComponent = document.getElementById('header-component');
    const sidebarComponent = document.getElementById('sidebar-component');
    
    if (headerComponent) {
        loadComponent('header-component', '../components/header.html');
    }
    
    if (sidebarComponent) {
        loadComponent('sidebar-component', '../components/sidebar.html');
    }
    
    // Kullanıcı bilgilerini güncelle
    App.updateUI();
    
    // Mevcut tarihi güncelle
    const currentDateElement = document.getElementById('current-date');
    if (currentDateElement) {
        currentDateElement.textContent = App.formatDate(new Date());
    }
});

// DIŞA AKTARIMLAR - Kampanya modülü için
export { CartManager, AppUtils, showNotification };