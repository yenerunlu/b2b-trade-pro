// b2b-app/public/js/common.js
// Sistem Yönetimi - Ortak Fonksiyonlar

console.log('✅ Common.js yüklendi');

// ==================== SİSTEM KULLANICILARI YÖNETİMİ ====================

class SystemUserManager {
    constructor() {
        this.STORAGE_KEY = 'b2b_system_users';
        this.init();
    }

    init() {
        console.log('🔧 SystemUserManager başlatılıyor...');
        
        // localStorage'da sistem kullanıcıları yoksa başlat
        if (!localStorage.getItem(this.STORAGE_KEY)) {
            console.log('📦 Sistem kullanıcı veritabanı oluşturuluyor...');
            this.initializeDefaultUsers();
        }
        
        this.loadCurrentUser();
        console.log('✅ SystemUserManager hazır');
    }

    // Varsayılan kullanıcıları oluştur
    initializeDefaultUsers() {
        const defaultUsers = [
            {
                id: 1,
                username: 'ADMIN',
                password: 'admin123', // Demo - gerçek şifre backend'den gelmeli
                email: 'admin@firma.com',
                type: 'admin',
                status: 'active',
                createdAt: new Date().toISOString(),
                avatarText: 'A',
                fullName: 'Sistem Yöneticisi',
                lastLogin: null,
                permissions: {
                    dashboard: true,
                    products: true,
                    customers: true,
                    orders: true,
                    inventory: true,
                    sales: true,
                    settings: true,
                    userManagement: true,
                    reports: true
                }
            },
            {
                id: 2,
                username: 'PLASIYER',
                password: 'plasiyer123',
                email: 'sales@firma.com',
                type: 'plasiyer',
                status: 'active',
                createdAt: new Date().toISOString(),
                avatarText: 'P',
                fullName: 'Satış Temsilcisi',
                lastLogin: null,
                permissions: {
                    dashboard: true,
                    products: true,
                    customers: true,
                    orders: true,
                    inventory: false,
                    sales: false,
                    settings: false,
                    userManagement: false,
                    reports: false
                },
                plasiyerCode: 'PL001',
                regions: [],
                specialCustomers: []
            }
        ];
        
        this.saveUsers(defaultUsers);
    }

    // Tüm kullanıcıları getir
    getAllUsers() {
        const usersJson = localStorage.getItem(this.STORAGE_KEY);
        return usersJson ? JSON.parse(usersJson) : [];
    }

    // Kullanıcıları kaydet
    saveUsers(users) {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(users));
        console.log(`💾 ${users.length} kullanıcı kaydedildi`);
        
        // Badge güncelleme event'i gönder
        this.triggerBadgeUpdate();
    }

    // Kullanıcı ekle
    addUser(userData) {
        const users = this.getAllUsers();
        const newId = users.length > 0 ? Math.max(...users.map(u => u.id)) + 1 : 1;
        
        const newUser = {
            id: newId,
            username: userData.username,
            password: userData.password,
            email: userData.email,
            type: userData.type,
            status: 'active',
            createdAt: new Date().toISOString(),
            avatarText: userData.username.charAt(0).toUpperCase(),
            fullName: userData.fullName || userData.username,
            lastLogin: null,
            permissions: this.getDefaultPermissions(userData.type),
            plasiyerCode: userData.plasiyerCode || null,
            regions: userData.regions || [],
            specialCustomers: userData.specialCustomers || []
        };

        users.push(newUser);
        this.saveUsers(users);
        console.log(`➕ Yeni ${userData.type} eklendi: ${userData.username}`);
        return newUser;
    }

    // Varsayılan yetkiler
    getDefaultPermissions(userType) {
        const basePermissions = {
            dashboard: true,
            products: true,
            customers: true,
            orders: true,
            inventory: false,
            sales: false,
            settings: false,
            userManagement: false,
            reports: false
        };

        if (userType === 'admin') {
            return {
                ...basePermissions,
                inventory: true,
                sales: true,
                settings: true,
                userManagement: true,
                reports: true
            };
        }
        
        if (userType === 'plasiyer') {
            return {
                ...basePermissions,
                customers: true
            };
        }
        
        return basePermissions;
    }

    // Kullanıcı güncelle
    updateUser(userId, userData) {
        const users = this.getAllUsers();
        const index = users.findIndex(user => user.id === userId);
        
        if (index === -1) return false;
        
        // Şifre değişmediyse koru
        if (!userData.password) {
            userData.password = users[index].password;
        }
        
        users[index] = { ...users[index], ...userData };
        this.saveUsers(users);
        console.log(`✏️ Kullanıcı güncellendi: ${users[index].username}`);
        return true;
    }

    // Kullanıcı sil
    deleteUser(userId) {
        const users = this.getAllUsers();
        const filteredUsers = users.filter(user => user.id !== userId);
        
        if (filteredUsers.length === users.length) return false;
        
        this.saveUsers(filteredUsers);
        console.log(`🗑️ Kullanıcı silindi: ID ${userId}`);
        return true;
    }

    // Kullanıcı bul
    getUserById(id) {
        const users = this.getAllUsers();
        return users.find(user => user.id === id);
    }

    getUserByUsername(username) {
        const users = this.getAllUsers();
        return users.find(user => user.username === username);
    }

    // Şifre değiştir
    changePassword(userId, newPassword) {
        return this.updateUser(userId, { password: newPassword });
    }

    // Durum değiştir (aktif/pasif)
    toggleUserStatus(userId) {
        const user = this.getUserById(userId);
        if (!user) return false;
        
        const newStatus = user.status === 'active' ? 'banned' : 'active';
        return this.updateUser(userId, { status: newStatus });
    }

    // ==================== OTURUM YÖNETİMİ ====================

    // Mevcut kullanıcıyı yükle
    loadCurrentUser() {
        const userData = sessionStorage.getItem('b2b_user_data') || 
                        localStorage.getItem('b2b_user_data');
        
        if (userData) {
            try {
                this.currentUser = JSON.parse(userData);
                console.log(`👤 Oturum açık: ${this.currentUser.kullanici}`);
            } catch (error) {
                console.error('❌ Kullanıcı verisi okunamadı:', error);
                this.currentUser = null;
            }
        } else {
            this.currentUser = null;
        }
        
        return this.currentUser;
    }

    // Kullanıcı giriş kontrolü
    checkAdminAuth() {
        const user = this.loadCurrentUser();
        
        if (!user) {
            console.log('❌ Oturum bulunamadı');
            return false;
        }
        
        if (user.type !== 'admin') {
            console.log(`❌ Yetkisiz erişim: ${user.type}`);
            return false;
        }
        
        return true;
    }

    // ==================== BADGE YÖNETİMİ ====================

    // Badge güncelleme event'i gönder
    triggerBadgeUpdate() {
        const event = new CustomEvent('systemUsersUpdated', {
            detail: { 
                count: this.getAllUsers().length,
                timestamp: new Date().toISOString()
            }
        });
        window.dispatchEvent(event);
    }

    // Badge güncelle
    updateBadges() {
        const users = this.getAllUsers();
        const adminCount = users.filter(u => u.type === 'admin').length;
        const plasiyerCount = users.filter(u => u.type === 'plasiyer').length;
        const totalCount = users.length;
        
        console.log(`📊 Sistem kullanıcıları: ${totalCount} (${adminCount} admin, ${plasiyerCount} plasiyer)`);
        
        // Tüm badge'leri güncelle
        document.querySelectorAll('.system-user-count').forEach(element => {
            element.textContent = totalCount;
        });
        
        return { adminCount, plasiyerCount, totalCount };
    }

    // ==================== İSTATİSTİKLER ====================

    getStats() {
        const users = this.getAllUsers();
        return {
            total: users.length,
            admin: users.filter(u => u.type === 'admin').length,
            plasiyer: users.filter(u => u.type === 'plasiyer').length,
            active: users.filter(u => u.status === 'active').length,
            banned: users.filter(u => u.status === 'banned').length,
            lastUpdated: new Date().toISOString()
        };
    }
}

// ==================== GLOBAL DEĞİŞKENLER ====================

let systemUserManager = null;

// Sayfa yüklendiğinde başlat
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Common.js - Sistem yöneticisi başlatılıyor');
    
    systemUserManager = new SystemUserManager();
    
    // Event listener'ları kur
    window.addEventListener('systemUsersUpdated', function(e) {
        console.log('🔔 Sistem kullanıcıları güncellendi:', e.detail);
        if (systemUserManager) {
            systemUserManager.updateBadges();
        }
    });
    
    // Badge'leri ilk yüklemede güncelle
    setTimeout(() => {
        if (systemUserManager) {
            systemUserManager.updateBadges();
        }
    }, 500);
    
    // Her 30 saniyede bir güncelle
    setInterval(() => {
        if (systemUserManager && !document.hidden) {
            systemUserManager.updateBadges();
        }
    }, 30000);
});

// Global export
window.SystemUserManager = SystemUserManager;
window.getSystemUserManager = () => systemUserManager;

console.log('✅ Common.js hazır - SistemUserManager global olarak kullanılabilir');
