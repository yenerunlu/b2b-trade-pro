// admin/js/admin-dashboard.js - ADMIN DASHBOARD İŞLEVLERİ

class AdminDashboard {
    constructor() {
        this.currentData = {
            stats: {},
            activities: [],
            charts: {}
        };
        
        this.init();
    }

    async init() {
        // Sayfa koruması - sadece admin erişebilir
        if (!b2bUtils.protectPage(['admin'])) return;

        await this.loadDashboardData();
        this.setupEventListeners();
        this.setupCharts();
        this.updateDashboardTitle();
        
        console.log('Admin Dashboard initialized');
    }

    // Dashboard verilerini yükle
    async loadDashboardData() {
        try {
            b2bUtils.showLoading('Dashboard verileri yükleniyor...');

            // API'den gerçek verileri çek
            const dashboardData = await this.fetchDashboardData();
            
            this.currentData = dashboardData;
            
            // UI'ı güncelle
            this.updateStatsCards(dashboardData.stats);
            this.updateRecentActivities(dashboardData.activities);
            this.updateQuickActions(dashboardData.quickActions);
            
            b2bUtils.showNotification('Dashboard verileri güncellendi', 'success');
            
        } catch (error) {
            console.error('Dashboard veri yükleme hatası:', error);
            b2bUtils.showNotification('Veriler yüklenirken hata oluştu', 'error');
            
            // Fallback: Mock data göster
            this.showMockData();
        } finally {
            b2bUtils.hideLoading();
        }
    }

    // API'den dashboard verilerini çek
    async fetchDashboardData() {
        try {
            // Gerçek API endpoint'i kullanılacak
            const apiUrl = B2BConfig.getApiUrl('admin.dashboard');
            const response = await fetch(apiUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${b2bUtils.getStorage(B2BConfig.storage.token)}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }

            return await response.json();
            
        } catch (error) {
            console.warn('API bağlantı hatası, mock data kullanılıyor:', error);
            return this.getMockDashboardData();
        }
    }

    // Mock dashboard verileri
    getMockDashboardData() {
        const currentDate = new Date();
        const lastMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
        
        return {
            stats: {
                totalCustomers: {
                    value: 1247,
                    change: 12.5,
                    trend: 'positive',
                    icon: '👥',
                    title: 'Toplam Müşteri'
                },
                todayOrders: {
                    value: 56,
                    change: 8.3,
                    trend: 'positive',
                    icon: '📦',
                    title: 'Bugünkü Sipariş'
                },
                totalRevenue: {
                    value: 284500,
                    change: 15.2,
                    trend: 'positive',
                    icon: '💰',
                    title: 'Toplam Ciro'
                },
                activeProducts: {
                    value: 892,
                    change: -2.1,
                    trend: 'negative',
                    icon: '📊',
                    title: 'Aktif Ürün'
                },
                pendingOrders: {
                    value: 23,
                    change: 5.0,
                    trend: 'positive',
                    icon: '⏳',
                    title: 'Bekleyen Sipariş'
                },
                lowStock: {
                    value: 15,
                    change: 25.0,
                    trend: 'negative',
                    icon: '⚠️',
                    title: 'Düşük Stok'
                }
            },
            activities: [
                {
                    id: 1,
                    type: 'success',
                    icon: '✅',
                    title: 'Yeni kullanıcı kaydı:',
                    description: 'Ahmet Yılmaz',
                    time: new Date(Date.now() - 10 * 60 * 1000), // 10 dakika önce
                    user: 'Ahmet Yılmaz'
                },
                {
                    id: 2,
                    type: 'success',
                    icon: '✅',
                    title: 'Stok güncellendi:',
                    description: 'URUN001 (+50 adet)',
                    time: new Date(Date.now() - 25 * 60 * 1000), // 25 dakika önce
                    product: 'URUN001'
                },
                {
                    id: 3,
                    type: 'success',
                    icon: '✅',
                    title: 'Sipariş tamamlandı:',
                    description: '#SIP-2024-0012',
                    time: new Date(Date.now() - 60 * 60 * 1000), // 1 saat önce
                    order: '#SIP-2024-0012'
                },
                {
                    id: 4,
                    type: 'warning',
                    icon: '⚠️',
                    title: 'Düşük stok uyarısı:',
                    description: 'URUN005 (3 adet kaldı)',
                    time: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 saat önce
                    product: 'URUN005'
                },
                {
                    id: 5,
                    type: 'info',
                    icon: 'ℹ️',
                    title: 'Sistem yedeklemesi:',
                    description: 'Otomatik yedekleme tamamlandı',
                    time: new Date(Date.now() - 4 * 60 * 60 * 1000), // 4 saat önce
                    system: true
                }
            ],
            quickActions: [
                {
                    id: 'add-product',
                    icon: '📦',
                    title: 'Yeni Ürün Ekle',
                    description: 'Yeni ürün oluştur',
                    url: '/admin/products.html?action=add'
                },
                {
                    id: 'add-user',
                    icon: '👤',
                    title: 'Kullanıcı Oluştur',
                    description: 'Yeni kullanıcı ekle',
                    url: '/admin/users.html?action=add'
                },
                {
                    id: 'update-stock',
                    icon: '📊',
                    title: 'Stok Güncelle',
                    description: 'Stokları yönet',
                    url: '/admin/products.html?action=stock'
                },
                {
                    id: 'generate-report',
                    icon: '📈',
                    title: 'Rapor Al',
                    description: 'Detaylı rapor oluştur',
                    url: '/admin/reports.html'
                },
                {
                    id: 'system-settings',
                    icon: '⚙️',
                    title: 'Sistem Ayarları',
                    description: 'Genel ayarları yönet',
                    url: '/admin/settings.html'
                },
                {
                    id: 'view-analytics',
                    icon: '📊',
                    title: 'Analizleri Gör',
                    description: 'Detaylı analiz raporu',
                    url: '/admin/analytics.html'
                }
            ],
            charts: {
                revenue: {
                    labels: ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz'],
                    datasets: [
                        {
                            label: 'Ciro (Bin TL)',
                            data: [120, 150, 180, 200, 240, 284],
                            borderColor: '#2563eb',
                            backgroundColor: 'rgba(37, 99, 235, 0.1)'
                        }
                    ]
                },
                orders: {
                    labels: ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'],
                    datasets: [
                        {
                            label: 'Sipariş Sayısı',
                            data: [45, 52, 38, 61, 55, 48, 32],
                            borderColor: '#16a34a',
                            backgroundColor: 'rgba(22, 163, 74, 0.1)'
                        }
                    ]
                }
            }
        };
    }

    // Mock data göster (API hatası durumunda)
    showMockData() {
        const mockData = this.getMockDashboardData();
        this.updateStatsCards(mockData.stats);
        this.updateRecentActivities(mockData.activities);
        this.updateQuickActions(mockData.quickActions);
    }

    // İstatistik kartlarını güncelle
    updateStatsCards(stats) {
        const statsGrid = document.querySelector('.admin-stats-grid');
        if (!statsGrid) return;

        statsGrid.innerHTML = Object.values(stats).map(stat => `
            <div class="admin-stat-card ${stat.trend === 'negative' ? 'error' : 'success'}">
                <div class="admin-stat-header">
                    <div class="admin-stat-icon">
                        ${stat.icon}
                    </div>
                    <div class="admin-stat-trend ${stat.trend === 'negative' ? 'negative' : ''}">
                        ${stat.trend === 'positive' ? '↗' : '↘'} ${Math.abs(stat.change)}%
                    </div>
                </div>
                <div class="admin-stat-content">
                    <h3>${stat.title}</h3>
                    <div class="admin-stat-value">
                        ${stat.title.includes('Ciro') ? '₺' : ''}${this.formatStatValue(stat.value, stat.title)}
                    </div>
                    <div class="admin-stat-change">
                        Son aya göre ${stat.trend === 'positive' ? 'artış' : 'düşüş'}
                    </div>
                </div>
            </div>
        `).join('');
    }

    // Stat değerlerini formatla
    formatStatValue(value, title) {
        if (title.includes('Ciro')) {
            return (value / 1000).toFixed(0) + 'K';
        }
        return value.toLocaleString('tr-TR');
    }

    // Son aktiviteleri güncelle
    updateRecentActivities(activities) {
        const activityList = document.querySelector('.admin-activity-list');
        if (!activityList) return;

        if (activities.length === 0) {
            activityList.innerHTML = `
                <div class="admin-empty-state">
                    <div class="admin-empty-icon">📝</div>
                    <h3 class="admin-empty-title">Henüz aktivite yok</h3>
                    <p class="admin-empty-description">Sistem aktiviteleri burada görünecek</p>
                </div>
            `;
            return;
        }

        activityList.innerHTML = activities.map(activity => `
            <div class="admin-activity-item" data-activity-id="${activity.id}">
                <div class="admin-activity-icon admin-activity-${activity.type}">
                    ${activity.icon}
                </div>
                <div class="admin-activity-content">
                    <p>
                        <strong>${activity.title}</strong> ${activity.description}
                    </p>
                    <div class="admin-activity-time">
                        ${this.formatActivityTime(activity.time)}
                    </div>
                </div>
            </div>
        `).join('');
    }

    // Aktivite zamanını formatla
    formatActivityTime(time) {
        const now = new Date();
        const activityTime = new Date(time);
        const diffInMinutes = Math.floor((now - activityTime) / (1000 * 60));
        
        if (diffInMinutes < 1) return 'Şimdi';
        if (diffInMinutes < 60) return `${diffInMinutes} dakika önce`;
        if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)} saat önce`;
        
        return b2bUtils.formatDate(time, 'DD.MM.YYYY HH:mm');
    }

    // Hızlı işlemleri güncelle
    updateQuickActions(actions) {
        const actionsGrid = document.querySelector('.admin-actions-grid');
        if (!actionsGrid) return;

        actionsGrid.innerHTML = actions.map(action => `
            <a href="${action.url}" class="admin-action-card" data-action="${action.id}">
                <div class="admin-action-icon">${action.icon}</div>
                <h4>${action.title}</h4>
                <p>${action.description}</p>
            </a>
        `).join('');
    }

    // Event listener'ları kur
    setupEventListeners() {
        // Refresh butonu
        const refreshBtn = document.getElementById('refreshDashboard');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.refreshDashboard();
            });
        }

        // Hızlı işlem tıklamaları
        document.addEventListener('click', (e) => {
            const actionCard = e.target.closest('.admin-action-card');
            if (actionCard) {
                e.preventDefault();
                this.handleQuickAction(actionCard);
            }
        });

        // Aktivite item tıklamaları
        document.addEventListener('click', (e) => {
            const activityItem = e.target.closest('.admin-activity-item');
            if (activityItem) {
                this.handleActivityClick(activityItem);
            }
        });

        // Sayfa yenileme
        document.addEventListener('keydown', (e) => {
            if (e.key === 'F5' || (e.ctrlKey && e.key === 'r')) {
                e.preventDefault();
                this.refreshDashboard();
            }
        });

        // Online/offline durum takibi
        window.addEventListener('online', () => {
            this.handleOnlineStatus();
        });

        window.addEventListener('offline', () => {
            this.handleOfflineStatus();
        });

        // Config değişikliklerini dinle
        window.addEventListener('b2bConfigChanged', (event) => {
            this.handleConfigChange(event.detail.config);
        });
    }

    // Dashboard'u yenile
    async refreshDashboard() {
        b2bUtils.showNotification('Dashboard yenileniyor...', 'info', 2000);
        await this.loadDashboardData();
    }

    // Hızlı işlem tıklama
    handleQuickAction(actionCard) {
        const actionId = actionCard.getAttribute('data-action');
        const actionUrl = actionCard.getAttribute('href');
        
        // Analytics tracking
        this.trackAction(`quick_action_${actionId}`);
        
        // Yönlendirme
        setTimeout(() => {
            window.location.href = actionUrl;
        }, 300);
    }

    // Aktivite tıklama
    handleActivityClick(activityItem) {
        const activityId = activityItem.getAttribute('data-activity-id');
        const activity = this.currentData.activities.find(a => a.id == activityId);
        
        if (!activity) return;

        // Aktivite tipine göre action
        if (activity.order) {
            // Sipariş detayına git
            window.location.href = `/admin/orders.html?order=${activity.order}`;
        } else if (activity.product) {
            // Ürün detayına git
            window.location.href = `/admin/products.html?product=${activity.product}`;
        } else if (activity.user) {
            // Kullanıcı detayına git
            window.location.href = `/admin/users.html?user=${activity.user}`;
        }
    }

    // Online durum
    handleOnlineStatus() {
        b2bUtils.showNotification('İnternet bağlantısı yeniden sağlandı', 'success');
        this.refreshDashboard();
    }

    // Offline durum
    handleOfflineStatus() {
        b2bUtils.showNotification('İnternet bağlantısı kesildi', 'warning');
    }

    // Config değişikliği
    handleConfigChange(config) {
        console.log('Config değişikliği algılandı:', config);
        // Gerekirse dashboard'u yeniden yükle
        if (config.settings?.display?.language) {
            this.updateDashboardTitle();
        }
    }

    // Dashboard başlığını güncelle
    updateDashboardTitle() {
        const pageTitle = document.querySelector('.admin-page-title');
        if (pageTitle) {
            pageTitle.textContent = `${B2BConfig.system.companyName} - Dashboard`;
        }
        document.title = `Dashboard - ${B2BConfig.system.companyName}`;
    }

    // Charts'ı kur (gerçek uygulamada Chart.js vs. kullanılacak)
    setupCharts() {
        // Chart.js veya başka bir chart kütüphanesi entegrasyonu burada yapılacak
        console.log('Charts initialized - Chart library integration ready');
        
        // Örnek chart container'ları oluştur
        this.createChartPlaceholders();
    }

    // Chart placeholder'ları oluştur
    createChartPlaceholders() {
        const chartSection = document.querySelector('.admin-chart-section');
        if (!chartSection) return;

        chartSection.innerHTML = `
            <div class="admin-chart-container">
                <div class="admin-chart-header">
                    <h3 class="admin-chart-title">Aylık Ciro Trendi</h3>
                    <div class="admin-chart-actions">
                        <button class="admin-btn-icon" onclick="adminDashboard.exportChart('revenue')">
                            📊
                        </button>
                    </div>
                </div>
                <div class="admin-chart-content" id="revenueChart">
                    <div style="display: flex; justify-content: center; align-items: center; height: 100%; color: #6b7280;">
                        <div style="text-align: center;">
                            <div style="font-size: 3rem; margin-bottom: 1rem;">📈</div>
                            <p>Chart.js entegrasyonu hazır</p>
                            <small>Veriler gerçek zamanlı yüklenecek</small>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="admin-chart-container">
                <div class="admin-chart-header">
                    <h3 class="admin-chart-title">Haftalık Siparişler</h3>
                    <div class="admin-chart-actions">
                        <button class="admin-btn-icon" onclick="adminDashboard.exportChart('orders')">
                            📊
                        </button>
                    </div>
                </div>
                <div class="admin-chart-content" id="ordersChart">
                    <div style="display: flex; justify-content: center; align-items: center; height: 100%; color: #6b7280;">
                        <div style="text-align: center;">
                            <div style="font-size: 3rem; margin-bottom: 1rem;">📊</div>
                            <p>Chart.js entegrasyonu hazır</p>
                            <small>Veriler gerçek zamanlı yüklenecek</small>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // Chart export
    exportChart(chartType) {
        b2bUtils.showNotification(`${chartType} chart'ı dışa aktarılıyor...`, 'info');
        // Chart export işlevi buraya eklenecek
    }

    // Action tracking
    trackAction(actionName) {
        // Analytics tracking kodu buraya eklenecek
        console.log('Action tracked:', actionName);
    }

    // Real-time updates (gerçek uygulamada WebSocket vs. kullanılacak)
    startRealTimeUpdates() {
        // Her 30 saniyede bir verileri güncelle
        this.updateInterval = setInterval(() => {
            this.loadDashboardData();
        }, 30000);
    }

    // Real-time updates'i durdur
    stopRealTimeUpdates() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
    }

    // Dashboard'u temizle (component destroy)
    destroy() {
        this.stopRealTimeUpdates();
        
        // Event listener'ları temizle
        const refreshBtn = document.getElementById('refreshDashboard');
        if (refreshBtn) {
            refreshBtn.replaceWith(refreshBtn.cloneNode(true));
        }
    }
}

// Global instance oluştur
let adminDashboard;

// Sayfa yüklendiğinde başlat
document.addEventListener('DOMContentLoaded', function() {
    adminDashboard = new AdminDashboard();
    
    // Real-time updates başlat
    setTimeout(() => {
        adminDashboard.startRealTimeUpdates();
    }, 5000);
});

// Sayfadan ayrılırken temizle
window.addEventListener('beforeunload', function() {
    if (adminDashboard) {
        adminDashboard.destroy();
    }
});

// Global erişim için
window.AdminDashboard = AdminDashboard;
window.adminDashboard = adminDashboard;