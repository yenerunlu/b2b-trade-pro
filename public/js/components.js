// Component yükleyici
class ComponentLoader {
    static async loadComponent(componentName, targetElement) {
        try {
            const response = await fetch(`components/${componentName}.html`);
            if (!response.ok) {
                throw new Error(`Component bulunamadı: ${componentName}`);
            }
            
            const html = await response.text();
            const target = document.querySelector(targetElement);
            
            if (target) {
                target.innerHTML = html;
                this.initializeComponent(componentName);
            }
            
            return html;
        } catch (error) {
            console.error(`Component yükleme hatası (${componentName}):`, error);
            return null;
        }
    }

    static initializeComponent(componentName) {
        switch (componentName) {
            case 'header':
                this.initializeHeader();
                break;
            case 'sidebar':
                this.initializeSidebar();
                break;
        }
    }

    static initializeHeader() {
        // Header için özel başlatma kodları
        const cartCount = document.getElementById('header-cart-count');
        const campaignCount = document.getElementById('header-campaign-count');
        
        // Sepet sayılarını güncelle
        if (window.app && window.app.cartManager) {
            const cart = window.app.cartManager.cart;
            const totalItems = cart.reduce((total, item) => total + item.quantity, 0);
            
            if (cartCount) {
                cartCount.textContent = totalItems;
            }
        }
    }

    static initializeSidebar() {
        // Sidebar için özel başlatma kodları
        const currentPage = this.getCurrentPage();
        const navItems = document.querySelectorAll('.nav-item');
        
        // Aktif sayfayı işaretle
        navItems.forEach(item => {
            if (item.getAttribute('data-page') === currentPage) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        // Logout butonu event listener
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (window.app) {
                    window.app.logout();
                }
            });
        }
    }

    static getCurrentPage() {
        const path = window.location.pathname;
        const page = path.split('/').pop().replace('.html', '');
        
        const pageMap = {
            'dashboard': 'dashboard',
            'siparislerim': 'orders',
            'kampanyasepeti': 'campaign',
            'profil': 'profile'
        };
        
        return pageMap[page] || 'dashboard';
    }

    // Tüm component'leri yükle
    static async loadAllComponents() {
        await this.loadComponent('sidebar', '#sidebar-container');
        await this.loadComponent('header', '#header-container');
    }
}

// Component container'larını HTML'e ekle
document.addEventListener('DOMContentLoaded', function() {
    // Component container'larını oluştur
    const appContainer = document.querySelector('.app-container');
    if (appContainer && !document.querySelector('#sidebar-container')) {
        appContainer.innerHTML = `
            <!-- SIDEBAR CONTAINER -->
            <div id="sidebar-container"></div>
            
            <!-- MAIN CONTENT -->
            <main class="main-content">
                <!-- HEADER CONTAINER -->
                <div id="header-container"></div>
                
                <!-- PAGE CONTENT -->
                <div class="page-content" id="page-content">
                    ${appContainer.querySelector('.main-content')?.innerHTML || ''}
                </div>
            </main>
        `;
        
        // Component'leri yükle
        ComponentLoader.loadAllComponents();
    }
});