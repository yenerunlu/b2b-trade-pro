// ====================================================
// 🚀 SISTEM KULLANICI YÖNETIM SISTEMI - common.js
// ====================================================
// Tüm B2B Trade Pro uygulamasında kullanılacak merkezi kullanıcı yönetimi
// Version: 1.0.0
// ====================================================

console.log('✅ common.js yükleniyor - SystemUserManager başlatılıyor...');

// ====================================================
// 🏗️ SYSTEM USER MANAGER CLASS
// ====================================================
class SystemUserManager {
    constructor() {
        this.STORAGE_KEY = 'b2b_system_users';
        this.CURRENT_USER_KEY = 'b2b_current_user';
        this.LAST_SYNC_KEY = 'b2b_users_last_sync';
        this.ADMIN_TYPES = ['admin', 'superadmin'];
        this.SYNC_INTERVAL = 5 * 60 * 1000; // 5 dakika
        
        this.init();
    }

    // ====================================================
    // 🎯 BAŞLANGIÇ ve INIT
    // ====================================================
    init() {
        console.log('🔧 SystemUserManager başlatılıyor...');
        
        // 1. localStorage'da veritabanı yoksa oluştur
        if (!this.getUsersFromStorage()) {
            this.createInitialDatabase();
        }
        
        // 2. Backend senkronizasyonunu kontrol et
        this.checkBackendSync();
        
        // 3. Event listener'ları kur
        this.setupEventListeners();
        
        console.log('✅ SystemUserManager başlatıldı!');
    }

    // ====================================================
    // 💾 VERİTABANI İŞLEMLERİ
    // ====================================================
    createInitialDatabase() {
        console.log('📦 İlk kullanıcı veritabanı oluşturuluyor...');
        
        const defaultUsers = [
            {
                id: 1,
                username: 'admin',
                email: 'admin@irazot.com',
                password: 'admin123',
                type: 'admin',
                fullName: 'Sistem Yöneticisi',
                status: 'active',
                avatarText: 'A',
                createdAt: new Date().toISOString(),
                lastLogin: null,
                isFromBackend: false,
                permissions: {
                    dashboard: true,
                    products: true,
                    customers: true,
                    orders: true,
                    inventory: true,
                    sales: true,
                    settings: true,
                    userManagement: true,
                    reports: true,
                    systemAdmin: true
                }
            },
            {
                id: 2,
                username: 'PLASIYER001',
                email: 'plasiyer@irazot.com',
                password: 'plasiyer123',
                type: 'plasiyer',
                fullName: 'Ahmet Yılmaz',
                status: 'active',
                avatarText: 'A',
                createdAt: new Date().toISOString(),
                lastLogin: null,
                isFromBackend: false,
                plasiyerCode: 'PL001',
                permissions: {
                    dashboard: true,
                    products: true,
                    customers: true,
                    orders: true,
                    inventory: true,
                    sales: false,
                    settings: false,
                    userManagement: false,
                    reports: true,
                    systemAdmin: false
                },
                regions: ['istanbul', 'ankara'],
                specialCustomers: ['S6064', 'M7890'],
                dailyOrderLimit: 20,
                maxOrderAmount: 50000
            },
            {
                id: 3,
                username: 'PLASIYER002',
                email: 'plasiyer2@irazot.com',
                password: 'plasiyer123',
                type: 'plasiyer',
                fullName: 'Mehmet Demir',
                status: 'active',
                avatarText: 'M',
                createdAt: new Date().toISOString(),
                lastLogin: null,
                isFromBackend: false,
                plasiyerCode: 'PL002',
                permissions: {
                    dashboard: true,
                    products: true,
                    customers: true,
                    orders: true,
                    inventory: false,
                    sales: false,
                    settings: false,
                    userManagement: false,
                    reports: false,
                    systemAdmin: false
                },
                regions: ['izmir', 'bursa'],
                specialCustomers: ['S4521'],
                dailyOrderLimit: 15,
                maxOrderAmount: 30000
            },
            // Logo'dan gelen müşteriler (backend senkronizasyonu ile eklenecek)
            {
                id: 1001,
                username: 'S6064',
                email: 'irazot@irazot.com',
                password: 'yunlu',
                type: 'musteri',
                fullName: 'İraz Otomotiv',
                status: 'active',
                avatarText: 'İ',
                createdAt: '2024-01-15T10:30:00Z',
                lastLogin: null,
                isFromBackend: true,
                customerCode: 'S6064',
                permissions: {
                    dashboard: true,
                    products: true,
                    customers: false,
                    orders: true,
                    inventory: false,
                    sales: false,
                    settings: false,
                    userManagement: false,
                    reports: false,
                    systemAdmin: false
                },
                restrictions: {
                    maxOrderAmount: 100000,
                    creditLimit: 250000,
                    canSeePrices: true,
                    canSeeStock: true
                }
            },
            {
                id: 1002,
                username: 'M7890',
                email: 'aydinoto@aydin.com',
                password: 'yunlu',
                type: 'musteri',
                fullName: 'Aydın Oto',
                status: 'active',
                avatarText: 'A',
                createdAt: '2024-01-20T14:45:00Z',
                lastLogin: null,
                isFromBackend: true,
                customerCode: 'M7890',
                permissions: {
                    dashboard: true,
                    products: true,
                    customers: false,
                    orders: true,
                    inventory: false,
                    sales: false,
                    settings: false,
                    userManagement: false,
                    reports: false,
                    systemAdmin: false
                },
                restrictions: {
                    maxOrderAmount: 50000,
                    creditLimit: 100000,
                    canSeePrices: true,
                    canSeeStock: true
                }
            }
        ];
        
        this.saveUsersToStorage(defaultUsers);
        console.log('✅ Varsayılan kullanıcı veritabanı oluşturuldu:', defaultUsers.length, 'kullanıcı');
    }

    getUsersFromStorage() {
        try {
            const usersJson = localStorage.getItem(this.STORAGE_KEY);
            return usersJson ? JSON.parse(usersJson) : null;
        } catch (error) {
            console.error('❌ Kullanıcı verileri okunamadı:', error);
            return null;
        }
    }

    saveUsersToStorage(users) {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(users));
            
            // Event tetikle (diğer sayfaların güncellemeleri görmesi için)
            this.triggerUsersUpdatedEvent();
            
            return true;
        } catch (error) {
            console.error('❌ Kullanıcı verileri kaydedilemedi:', error);
            return false;
        }
    }

    // ====================================================
    // 🔄 BACKEND SENKRONİZASYONU
    // ====================================================
    async checkBackendSync() {
        const lastSync = localStorage.getItem(this.LAST_SYNC_KEY);
        const now = Date.now();
        
        // 5 dakikadan eskiyse veya hiç senkronize olmadıysa
        if (!lastSync || (now - parseInt(lastSync)) > this.SYNC_INTERVAL) {
            console.log('🔄 Backend senkronizasyonu başlatılıyor...');
            await this.syncWithBackend();
        } else {
            console.log('✅ Backend senkronizasyonu güncel:', new Date(parseInt(lastSync)).toLocaleString());
        }
    }

    async syncWithBackend() {
        try {
            console.log('📡 Backend users.json senkronizasyonu yapılıyor...');
            
            // Backend'den kullanıcıları çek
            const response = await fetch('/api/admin/users');
            
            if (!response.ok) {
                throw new Error(`Backend hatası: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (result.success && result.users) {
                await this.mergeBackendUsers(result.users);
                localStorage.setItem(this.LAST_SYNC_KEY, Date.now().toString());
                console.log('✅ Backend senkronizasyonu tamamlandı!');
            } else {
                throw new Error('Backend kullanıcı verileri alınamadı');
            }
            
        } catch (error) {
            console.error('❌ Backend senkronizasyon hatası:', error);
            
            // Fallback: Demo backend verileri (geliştirme ortamı için)
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                console.log('⚠️ Demo backend verileri kullanılıyor (geliştirme modu)');
                await this.useDemoBackendData();
            }
        }
    }

    async mergeBackendUsers(backendUsers) {
        const currentUsers = this.getAllUsers();
        const mergedUsers = [...currentUsers];
        
        // Backend'den gelen kullanıcıları işle
        Object.entries(backendUsers).forEach(([username, backendUser]) => {
            const existingIndex = mergedUsers.findIndex(u => u.username === username);
            
            if (existingIndex !== -1) {
                // Mevcut kullanıcıyı güncelle (backed verileriyle)
                mergedUsers[existingIndex] = {
                    ...mergedUsers[existingIndex],
                    ...this.convertBackendUser(backendUser, username),
                    isFromBackend: true,
                    lastBackendSync: new Date().toISOString()
                };
            } else {
                // Yeni backend kullanıcısı ekle
                mergedUsers.push({
                    ...this.convertBackendUser(backendUser, username),
                    id: this.generateUserId(),
                    isFromBackend: true,
                    lastBackendSync: new Date().toISOString()
                });
            }
        });
        
        this.saveUsersToStorage(mergedUsers);
        console.log(`🔄 ${Object.keys(backendUsers).length} backend kullanıcısı senkronize edildi`);
    }

    convertBackendUser(backendUser, username) {
        // Backend formatını frontend formatına dönüştür
        const type = backendUser.rol === 'admin' ? 'admin' : 
                    backendUser.rol === 'sales' ? 'plasiyer' : 'musteri';
        
        return {
            username: username,
            email: backendUser.email || `${username.toLowerCase()}@firma.com`,
            password: backendUser.password || 'yunlu',
            type: type,
            fullName: backendUser.musteri_adi || username,
            status: backendUser.aktif ? 'active' : 'inactive',
            avatarText: username.charAt(0).toUpperCase(),
            createdAt: backendUser.created_at || new Date().toISOString(),
            lastLogin: null,
            permissions: this.getDefaultPermissions(type),
            ...(type === 'plasiyer' && {
                plasiyerCode: `PL${username.replace('PLASIYER', '').padStart(3, '0')}`,
                regions: [],
                specialCustomers: []
            }),
            ...(type === 'musteri' && {
                customerCode: username,
                restrictions: {
                    maxOrderAmount: 50000,
                    creditLimit: 100000,
                    canSeePrices: true,
                    canSeeStock: true
                }
            })
        };
    }

    async useDemoBackendData() {
        const demoBackendUsers = {
            'ADMIN': {
                password: '$2b$10$hashed_password_here',
                musteri_adi: 'Yönetici',
                rol: 'admin',
                email: 'admin@firma.com',
                aktif: true,
                ilk_giris: false,
                created_at: '2024-01-01T00:00:00Z'
            },
            'PLASIYER003': {
                password: '$2b$10$hashed_password_here',
                musteri_adi: 'Ayşe Kara',
                rol: 'sales',
                email: 'plasiyer3@firma.com',
                aktif: true,
                ilk_giris: true,
                created_at: '2024-02-01T00:00:00Z'
            },
            'S1981': {
                password: 'YUNLU',
                musteri_adi: 'Test Müşterisi',
                rol: 'customer',
                email: 'test@firma.com',
                aktif: true,
                ilk_giris: false,
                created_at: '2024-01-10T00:00:00Z'
            }
        };
        
        await this.mergeBackendUsers(demoBackendUsers);
        localStorage.setItem(this.LAST_SYNC_KEY, Date.now().toString());
    }

    // ====================================================
    // 👤 KULLANICI İŞLEMLERİ
    // ====================================================
    getAllUsers() {
        return this.getUsersFromStorage() || [];
    }

    getUserById(userId) {
        const users = this.getAllUsers();
        return users.find(user => user.id === userId);
    }

    getUserByUsername(username) {
        const users = this.getAllUsers();
        return users.find(user => user.username.toLowerCase() === username.toLowerCase());
    }

    getUsersByType(type) {
        const users = this.getAllUsers();
        return users.filter(user => user.type === type);
    }

    getStats() {
        const users = this.getAllUsers();
        
        return {
            total: users.length,
            admin: users.filter(u => u.type === 'admin').length,
            plasiyer: users.filter(u => u.type === 'plasiyer').length,
            musteri: users.filter(u => u.type === 'musteri').length,
            active: users.filter(u => u.status === 'active').length,
            banned: users.filter(u => u.status === 'banned').length,
            backendUsers: users.filter(u => u.isFromBackend).length,
            localUsers: users.filter(u => !u.isFromBackend).length
        };
    }

    generateUserId() {
        const users = this.getAllUsers();
        const maxId = users.reduce((max, user) => Math.max(max, user.id || 0), 0);
        return maxId + 1;
    }

    addUser(userData) {
        const users = this.getAllUsers();
        
        // Kullanıcı adı kontrolü
        if (this.getUserByUsername(userData.username)) {
            throw new Error('Bu kullanıcı adı zaten kullanılıyor!');
        }
        
        const newUser = {
            id: this.generateUserId(),
            username: userData.username,
            email: userData.email || `${userData.username.toLowerCase()}@firma.com`,
            password: userData.password,
            type: userData.type || 'plasiyer',
            fullName: userData.fullName || userData.username,
            status: userData.status || 'active',
            avatarText: (userData.fullName || userData.username).charAt(0).toUpperCase(),
            createdAt: new Date().toISOString(),
            lastLogin: null,
            isFromBackend: false,
            permissions: userData.permissions || this.getDefaultPermissions(userData.type),
            ...(userData.type === 'plasiyer' && {
                plasiyerCode: userData.plasiyerCode || `PL${String(users.length + 1).padStart(3, '0')}`,
                regions: userData.regions || [],
                specialCustomers: userData.specialCustomers || [],
                dailyOrderLimit: userData.dailyOrderLimit || 10,
                maxOrderAmount: userData.maxOrderAmount || 25000
            }),
            ...(userData.type === 'musteri' && {
                customerCode: userData.customerCode || userData.username,
                restrictions: userData.restrictions || {
                    maxOrderAmount: 50000,
                    creditLimit: 100000,
                    canSeePrices: true,
                    canSeeStock: true
                }
            })
        };
        
        users.push(newUser);
        this.saveUsersToStorage(users);
        
        console.log('✅ Yeni kullanıcı eklendi:', newUser);
        return newUser;
    }

    updateUser(userId, updateData) {
        const users = this.getAllUsers();
        const userIndex = users.findIndex(user => user.id === userId);
        
        if (userIndex === -1) {
            throw new Error('Kullanıcı bulunamadı!');
        }
        
        // Username değişikliği kontrolü
        if (updateData.username && updateData.username !== users[userIndex].username) {
            if (this.getUserByUsername(updateData.username)) {
                throw new Error('Bu kullanıcı adı zaten kullanılıyor!');
            }
        }
        
        // Şifre değişikliği
        if (updateData.password) {
            updateData.password = updateData.password; // Şifreyi olduğu gibi kaydet (hash'lenmiş olarak gelmeli)
        }
        
        // Kullanıcıyı güncelle
        users[userIndex] = {
            ...users[userIndex],
            ...updateData,
            updatedAt: new Date().toISOString()
        };
        
        this.saveUsersToStorage(users);
        
        console.log('✅ Kullanıcı güncellendi:', users[userIndex]);
        return users[userIndex];
    }

    deleteUser(userId) {
        const users = this.getAllUsers();
        const user = this.getUserById(userId);
        
        if (!user) {
            throw new Error('Kullanıcı bulunamadı!');
        }
        
        // Admin silinemez
        if (user.type === 'admin') {
            throw new Error('Admin kullanıcısı silinemez!');
        }
        
        // Backend'den gelen kullanıcıları silme (sadece pasif yap)
        if (user.isFromBackend) {
            console.log('⚠️ Backend kullanıcısı silinemez, pasif yapılıyor:', user.username);
            return this.updateUser(userId, { status: 'inactive' });
        }
        
        const filteredUsers = users.filter(user => user.id !== userId);
        this.saveUsersToStorage(filteredUsers);
        
        console.log('✅ Kullanıcı silindi:', user.username);
        return true;
    }

    changePassword(userId, newPassword) {
        if (!newPassword || newPassword.length < 4) {
            throw new Error('Şifre en az 4 karakter olmalıdır!');
        }
        
        return this.updateUser(userId, { password: newPassword });
    }

    toggleUserStatus(userId) {
        const user = this.getUserById(userId);
        
        if (!user) {
            throw new Error('Kullanıcı bulunamadı!');
        }
        
        const newStatus = user.status === 'active' ? 'banned' : 'active';
        return this.updateUser(userId, { status: newStatus });
    }

    // ====================================================
    // 🔐 AUTH ve OTURUM YÖNETİMİ
    // ====================================================
    login(username, password) {
        const user = this.getUserByUsername(username);
        
        if (!user) {
            throw new Error('Kullanıcı bulunamadı!');
        }
        
        if (user.status !== 'active') {
            throw new Error('Bu hesap yasaklı veya pasif durumda!');
        }
        
        if (user.password !== password) {
            throw new Error('Şifre hatalı!');
        }
        
        // Son giriş tarihini güncelle
        user.lastLogin = new Date().toISOString();
        this.updateUser(user.id, { lastLogin: user.lastLogin });
        
        // Oturum bilgilerini kaydet
        this.saveCurrentUser(user);
        
        console.log('✅ Giriş başarılı:', user.username);
        return user;
    }

    saveCurrentUser(user) {
        const userData = {
            id: user.id,
            username: user.username,
            type: user.type,
            fullName: user.fullName,
            email: user.email,
            permissions: user.permissions,
            customerCode: user.customerCode,
            plasiyerCode: user.plasiyerCode,
            avatarText: user.avatarText,
            regions: user.regions || [],
            specialCustomers: user.specialCustomers || [],
            restrictions: user.restrictions || {},
            loginTime: new Date().toISOString()
        };
        
        // Hem sessionStorage hem de localStorage'a kaydet
        sessionStorage.setItem(this.CURRENT_USER_KEY, JSON.stringify(userData));
        localStorage.setItem(this.CURRENT_USER_KEY, JSON.stringify(userData));
        
        return userData;
    }

    loadCurrentUser() {
        try {
            // Önce sessionStorage'dan dene
            let userData = sessionStorage.getItem(this.CURRENT_USER_KEY);
            
            if (!userData) {
                // Sonra localStorage'dan dene
                userData = localStorage.getItem(this.CURRENT_USER_KEY);
            }
            
            return userData ? JSON.parse(userData) : null;
        } catch (error) {
            console.error('❌ Oturum verisi okunamadı:', error);
            return null;
        }
    }

    logout() {
        console.log('🚪 Çıkış yapılıyor...');
        
        // SessionStorage'ı temizle
        sessionStorage.removeItem(this.CURRENT_USER_KEY);
        
        // localStorage'daki current user'ı temizle (isteğe bağlı)
        // localStorage.removeItem(this.CURRENT_USER_KEY);
        
        // Çıkış event'ini tetikle
        this.triggerLogoutEvent();
        
        return true;
    }

    checkAdminAuth() {
        const currentUser = this.loadCurrentUser();
        
        if (!currentUser) {
            console.log('❌ Oturum bulunamadı!');
            return false;
        }
        
        const isAdmin = this.ADMIN_TYPES.includes(currentUser.type);
        
        if (!isAdmin) {
            console.log('❌ Admin yetkisi yok:', currentUser.type);
        }
        
        return isAdmin;
    }

    checkPermission(permissionKey) {
        const currentUser = this.loadCurrentUser();
        
        if (!currentUser) {
            return false;
        }
        
        // Admin'ler her şeye erişebilir
        if (this.ADMIN_TYPES.includes(currentUser.type)) {
            return true;
        }
        
        // Plasiyer veya müşteri için izin kontrolü
        return currentUser.permissions?.[permissionKey] || false;
    }

    // ====================================================
    // ⚙️ YARDIMCI FONKSİYONLAR
    // ====================================================
    getDefaultPermissions(userType) {
        const basePermissions = {
            dashboard: true,
            products: true,
            customers: false,
            orders: true,
            inventory: false,
            sales: false,
            settings: false,
            userManagement: false,
            reports: false,
            systemAdmin: false
        };
        
        switch(userType) {
            case 'admin':
                return {
                    ...basePermissions,
                    customers: true,
                    inventory: true,
                    sales: true,
                    settings: true,
                    userManagement: true,
                    reports: true,
                    systemAdmin: true
                };
                
            case 'plasiyer':
                return {
                    ...basePermissions,
                    customers: true,
                    inventory: true,
                    reports: true
                };
                
            case 'musteri':
                return {
                    ...basePermissions,
                    customers: false,
                    inventory: false,
                    reports: false
                };
                
            default:
                return basePermissions;
        }
    }

    triggerUsersUpdatedEvent() {
        const event = new CustomEvent('systemUsersUpdated', {
            detail: { timestamp: new Date().toISOString() }
        });
        window.dispatchEvent(event);
    }

    triggerLogoutEvent() {
        const event = new CustomEvent('systemUserLoggedOut', {
            detail: { timestamp: new Date().toISOString() }
        });
        window.dispatchEvent(event);
    }

    setupEventListeners() {
        // Sayfa kapanırken otomatik senkronizasyon
        window.addEventListener('beforeunload', () => {
            this.autoSyncIfNeeded();
        });
        
        // Diğer tablardaki değişiklikleri dinle
        window.addEventListener('storage', (event) => {
            if (event.key === this.STORAGE_KEY) {
                console.log('🔄 Diğer sekmeden kullanıcı güncellemesi algılandı');
                this.triggerUsersUpdatedEvent();
            }
        });
    }

    autoSyncIfNeeded() {
        const lastSync = localStorage.getItem(this.LAST_SYNC_KEY);
        const now = Date.now();
        
        if (!lastSync || (now - parseInt(lastSync)) > this.SYNC_INTERVAL * 2) {
            // Arka planda senkronizasyon yap
            this.syncWithBackend().catch(console.error);
        }
    }

    // ====================================================
    // 📊 BADGE ve NOTIFICATION YÖNETİMİ
    // ====================================================
    async updateBadgeCounts() {
        try {
            // Admin panel badge'leri için istatistikler
            const stats = this.getStats();
            
            // Müşteri sayısı badge'i (sadece backend müşterileri)
            const backendCustomers = this.getAllUsers().filter(u => 
                u.type === 'musteri' && u.isFromBackend
            ).length;
            
            // API'den güncel sipariş sayısını al
            let orderCount = 0;
            try {
                const response = await fetch('/api/logo/data?action=orders&limit=1');
                if (response.ok) {
                    const data = await response.json();
                    if (data.success) {
                        orderCount = data.total || 0;
                    }
                }
            } catch (error) {
                console.log('⚠️ Sipariş sayısı alınamadı:', error.message);
                orderCount = stats.total; // Fallback
            }
            
            // Badge değerlerini event ile yayınla
            const badgeEvent = new CustomEvent('badgeCountsUpdated', {
                detail: {
                    customers: backendCustomers,
                    orders: orderCount,
                    totalUsers: stats.total,
                    timestamp: new Date().toISOString()
                }
            });
            window.dispatchEvent(badgeEvent);
            
            return {
                customers: backendCustomers,
                orders: orderCount,
                totalUsers: stats.total
            };
            
        } catch (error) {
            console.error('❌ Badge güncelleme hatası:', error);
            return { customers: 0, orders: 0, totalUsers: 0 };
        }
    }
}

// ====================================================
// 🌍 GLOBAL INSTANCE ve FONKSİYONLAR
// ====================================================

// Global SystemUserManager instance'ı oluştur
let systemUserManagerInstance = null;

function getSystemUserManager() {
    if (!systemUserManagerInstance) {
        systemUserManagerInstance = new SystemUserManager();
    }
    return systemUserManagerInstance;
}

// Global helper fonksiyonları
window.SystemUserManager = SystemUserManager;
window.getSystemUserManager = getSystemUserManager;

// Otomatik badge güncellemesi (her 30 saniyede bir)
function startAutoBadgeUpdates() {
    const manager = getSystemUserManager();
    
    // İlk güncelleme
    setTimeout(() => manager.updateBadgeCounts(), 2000);
    
    // Periyodik güncelleme
    setInterval(() => {
        manager.updateBadgeCounts();
    }, 30000); // 30 saniye
}

// Sayfa yüklendiğinde otomatik başlat
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 common.js - DOM yüklendi, SystemUserManager hazır');
    
    // Otomatik badge güncellemelerini başlat
    startAutoBadgeUpdates();
    
    // Global error handler
    window.addEventListener('error', (e) => {
        console.error('Global hata (common.js):', e.error);
    });
});

// ====================================================
// ✅ İNİT MESAJI
// ====================================================
console.log('✅ common.js yüklendi! SystemUserManager kullanıma hazır.');
console.log('🔧 Kullanım: const manager = getSystemUserManager();');
console.log('👤 Örnek: manager.getAllUsers(), manager.login(), manager.checkAdminAuth()');

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        SystemUserManager,
        getSystemUserManager
    };
}