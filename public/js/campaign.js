// Kampanya Sepeti JavaScript Modülü
console.log('Campaign.js yüklendi');

class CampaignCartManager {
    constructor() {
        console.log('CampaignCartManager başlatılıyor');
        this.campaignProducts = [];
        this.filteredProducts = [];
        this.currentFilters = {
            manufacturer: '',
            vehicleBrand: '',
            searchTerm: '',
            campaignType: ''
        };
        this.init();
    }
    
    init() {
        console.log('CampaignCartManager init çağrıldı');
        this.loadCampaignProducts();
        this.setupEventListeners();
        this.renderCampaignProducts();
        this.updateHeaderCounts();
    }
    
    loadCampaignProducts() {
        console.log('Kampanya ürünleri yükleniyor');
        // Kampanya ürünleri verisi
        this.campaignProducts = [
            {
                id: 101,
                code: "K-1038",
                name: "BMW FREN BALATASI X5 2020 ÖN FREN SİSTEMİ",
                fullName: "BMW FREN BALATASI X5 2020 ÖN FREN SİSTEMİ Orijinal Kampanyalı Ürün",
                manufacturer: "Bosch",
                vehicleBrand: "BMW",
                oem: "BOS1038",
                description: "Özel kampanya fırsatı! BMW X5 2020 model için ön fren balatası.",
                discount: "%25",
                originalPrice: 2200.00,
                campaignPrice: 1650.00,
                stock: 3,
                category: "parts",
                image: "📷",
                minOrder: 1,
                status: "Kampanya",
                locations: {
                    merkez: 1,
                    ikitelli: 1,
                    bostanci: 1
                },
                isLowStock: true,
                isCampaign: true,
                campaignType: "discount",
                confirmed: false,
                confirmedQuantity: 0
            },
            {
                id: 102,
                code: "K-2047",
                name: "MERCEDES BUJI SETI C180 2021 4'LÜ BUJI TAKIMI",
                fullName: "MERCEDES BUJI SETI C180 2021 4'LÜ BUJI TAKIMI Özel Kampanya",
                manufacturer: "NGK",
                vehicleBrand: "Mercedes",
                oem: "NGK2047",
                description: "Mercedes C180 2021 model için özel buji seti kampanyası.",
                discount: "%15",
                originalPrice: 650.00,
                campaignPrice: 552.50,
                stock: 8,
                category: "parts",
                image: "📷",
                minOrder: 1,
                status: "Kampanya",
                locations: {
                    merkez: 3,
                    ikitelli: 2,
                    bostanci: 3
                },
                isLowStock: false,
                isCampaign: true,
                campaignType: "discount",
                confirmed: false,
                confirmedQuantity: 0
            },
            {
                id: 103,
                code: "K-3056",
                name: "AUDI YAĞ FİLTRESİ A4 2021 MOTOR YAĞ FİLTRESİ",
                fullName: "AUDI YAĞ FİLTRESİ A4 2021 MOTOR YAĞ FİLTRESİ Kampanyalı",
                manufacturer: "Mann-Filter",
                vehicleBrand: "Audi",
                oem: "MAN3056",
                description: "Audi A4 2021 model için motor yağ filtresi kampanyası.",
                discount: "%20",
                originalPrice: 450.00,
                campaignPrice: 360.00,
                stock: 2,
                category: "parts",
                image: "📷",
                minOrder: 1,
                status: "Kampanya",
                locations: {
                    merkez: 1,
                    ikitelli: 0,
                    bostanci: 1
                },
                isLowStock: true,
                isCampaign: true,
                campaignType: "limited",
                confirmed: false,
                confirmedQuantity: 0
            },
            {
                id: 104,
                code: "K-4012",
                name: "VOLKSWAGEN FAR LAMBASI GOLF 2022 ÖN SOL FAR",
                fullName: "VOLKSWAGEN FAR LAMBASI GOLF 2022 ÖN SOL FAR Kampanyalı",
                manufacturer: "Hella",
                vehicleBrand: "Volkswagen",
                oem: "HEL4012",
                description: "Volkswagen Golf 2022 model için ön sol far kampanyası.",
                discount: "%30",
                originalPrice: 3200.00,
                campaignPrice: 2240.00,
                stock: 5,
                category: "parts",
                image: "📷",
                minOrder: 1,
                status: "Kampanya",
                locations: {
                    merkez: 2,
                    ikitelli: 2,
                    bostanci: 1
                },
                isLowStock: false,
                isCampaign: true,
                campaignType: "discount",
                confirmed: false,
                confirmedQuantity: 0
            },
            {
                id: 105,
                code: "K-5078",
                name: "FORD DİREKSİYON KUTUSU FOCUS 2020 DİREKSİYON SİSTEMİ",
                fullName: "FORD DİREKSİYON KUTUSU FOCUS 2020 DİREKSİYON SİSTEMİ Kampanyalı",
                manufacturer: "ZF",
                vehicleBrand: "Ford",
                oem: "ZF5078",
                description: "Ford Focus 2020 model için direksiyon kutusu kampanyası.",
                discount: "%18",
                originalPrice: 4800.00,
                campaignPrice: 3936.00,
                stock: 1,
                category: "parts",
                image: "📷",
                minOrder: 1,
                status: "Kampanya",
                locations: {
                    merkez: 1,
                    ikitelli: 0,
                    bostanci: 0
                },
                isLowStock: true,
                isCampaign: true,
                campaignType: "limited",
                confirmed: false,
                confirmedQuantity: 0
            }
        ];
        
        this.filteredProducts = [...this.campaignProducts];
        console.log('Kampanya ürünleri yüklendi:', this.campaignProducts.length);
    }
    
    setupEventListeners() {
        console.log('Event listeners kuruluyor');
        
        // Filtreleme event listeners
        const applyFiltersBtn = document.getElementById('apply-filters');
        const clearFiltersBtn = document.getElementById('clear-filters');
        
        if (applyFiltersBtn) {
            applyFiltersBtn.addEventListener('click', () => {
                console.log('Filtrele butonuna tıklandı');
                this.applyFilters();
            });
        }
        
        if (clearFiltersBtn) {
            clearFiltersBtn.addEventListener('click', () => {
                console.log('Temizle butonuna tıklandı');
                this.clearFilters();
            });
        }
        
        // Buton event listeners
        const sendToCartBtn = document.getElementById('send-to-cart');
        const sendOrderBtn = document.getElementById('send-order');
        const payNowBtn = document.getElementById('pay-now');
        
        if (sendToCartBtn) {
            sendToCartBtn.addEventListener('click', () => {
                console.log('Sepete Gönder butonuna tıklandı');
                this.sendToCart();
            });
        }
        
        if (sendOrderBtn) {
            sendOrderBtn.addEventListener('click', () => {
                console.log('Siparişi Gönder butonuna tıklandı');
                this.sendOrder();
            });
        }
        
        if (payNowBtn) {
            payNowBtn.addEventListener('click', () => {
                console.log('Hemen Öde butonuna tıklandı');
                this.payNow();
            });
        }

        // Logout butonu
        const logoutBtn = document.querySelector('.sidebar-logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (confirm('Çıkış yapmak istediğinizden emin misiniz?')) {
                    this.logout();
                }
            });
        }
    }
    
    applyFilters() {
        console.log('Filtreler uygulanıyor');
        const manufacturer = document.getElementById('manufacturer-filter').value;
        const vehicleBrand = document.getElementById('vehicle-brand-filter').value;
        const searchTerm = document.getElementById('product-search').value.toLowerCase();
        const campaignType = document.getElementById('campaign-type-filter').value;
        
        this.currentFilters = {
            manufacturer,
            vehicleBrand,
            searchTerm,
            campaignType
        };
        
        this.filteredProducts = this.campaignProducts.filter(product => {
            // Üretici filtresi
            if (this.currentFilters.manufacturer && product.manufacturer.toLowerCase() !== this.currentFilters.manufacturer) {
                return false;
            }
            
            // Araç markası filtresi
            if (this.currentFilters.vehicleBrand && product.vehicleBrand.toLowerCase() !== this.currentFilters.vehicleBrand) {
                return false;
            }
            
            // Arama filtresi
            if (this.currentFilters.searchTerm && 
                !product.name.toLowerCase().includes(this.currentFilters.searchTerm) &&
                !product.code.toLowerCase().includes(this.currentFilters.searchTerm) &&
                !product.oem.toLowerCase().includes(this.currentFilters.searchTerm)) {
                return false;
            }
            
            // Kampanya türü filtresi
            if (this.currentFilters.campaignType) {
                if (this.currentFilters.campaignType === 'discount' && product.discount === '%0') {
                    return false;
                }
                if (this.currentFilters.campaignType === 'limited' && !product.isLowStock) {
                    return false;
                }
                if (this.currentFilters.campaignType === 'new' && product.campaignType !== 'new') {
                    return false;
                }
            }
            
            return true;
        });
        
        this.renderCampaignProducts();
    }
    
    clearFilters() {
        console.log('Filtreler temizleniyor');
        document.getElementById('manufacturer-filter').value = '';
        document.getElementById('vehicle-brand-filter').value = '';
        document.getElementById('product-search').value = '';
        document.getElementById('campaign-type-filter').value = '';
        
        this.currentFilters = {
            manufacturer: '',
            vehicleBrand: '',
            searchTerm: '',
            campaignType: ''
        };
        
        this.filteredProducts = [...this.campaignProducts];
        this.renderCampaignProducts();
    }
    
    renderCampaignProducts() {
        console.log('Kampanya ürünleri render ediliyor');
        const campaignList = document.getElementById('campaign-list');
        const resultsCount = document.getElementById('results-count');
        
        if (!campaignList) {
            console.error('campaign-list elementi bulunamadı!');
            return;
        }
        
        console.log('Toplam ürün:', this.filteredProducts.length);
        
        if (this.filteredProducts.length === 0) {
            campaignList.innerHTML = `
                <div class="empty-campaign">
                    <i class="fas fa-tags"></i>
                    <h3>Kampanya Ürünü Bulunamadı</h3>
                    <p>Seçtiğiniz filtrelerle eşleşen kampanya ürünü bulunamadı.</p>
                    <button class="btn btn-primary" id="reset-filters">
                        <i class="fas fa-redo"></i> Filtreleri Sıfırla
                    </button>
                </div>
            `;
            
            const resetBtn = document.getElementById('reset-filters');
            if (resetBtn) {
                resetBtn.addEventListener('click', () => {
                    this.clearFilters();
                });
            }
            
            this.updateSummary();
            return;
        }
        
        let html = '';
        this.filteredProducts.forEach((product, index) => {
            const totalStock = product.locations.merkez + product.locations.ikitelli + product.locations.bostanci;
            
            const buttonText = product.confirmed ? 
                `${product.confirmedQuantity} Adet Onaylandı` : 
                'Onayla';
            const buttonClass = product.confirmed ? 
                'confirm-btn confirmed' : 
                'confirm-btn';
            
            html += `
                <div class="campaign-item ${product.isLowStock ? 'low-stock' : ''} ${product.isCampaign ? 'campaign-product' : ''}">
                    <div class="item-badges">
                        ${product.isLowStock ? `
                            <div class="campaign-badge campaign-badge-danger">
                                <i class="fas fa-exclamation-triangle"></i>
                                ${totalStock <= 1 ? 'SON 1 ÜRÜN!' : totalStock <= 3 ? `SON ${totalStock} ÜRÜN!` : 'AZ STOK'}
                            </div>
                        ` : ''}
                        ${product.isCampaign ? `
                            <div class="campaign-badge campaign-badge-success">
                                <i class="fas fa-bolt"></i> KAMPANYA
                            </div>
                        ` : ''}
                    </div>
                    <div class="item-image">${product.image}</div>
                    <div class="item-details">
                        <h3 class="item-name">${product.name}</h3>
                        <div class="item-code">${product.code} | OEM: ${product.oem}</div>
                        <div class="item-manufacturer">${product.manufacturer}</div>
                        <div class="item-description">${product.description}</div>
                        <div class="price-info">
                            <span class="original-price">₺${product.originalPrice.toFixed(2)}</span>
                            <span class="campaign-price">₺${product.campaignPrice.toFixed(2)}</span>
                            <div class="discount-badge">${product.discount} İNDİRİM</div>
                        </div>
                    </div>
                    <div class="item-actions">
                        <div class="quantity-control">
                            <button class="quantity-btn minus" data-id="${product.id}">-</button>
                            <input type="number" class="quantity-input" value="${product.confirmed ? product.confirmedQuantity : 1}" min="1" max="${totalStock}" data-id="${product.id}">
                            <button class="quantity-btn plus" data-id="${product.id}">+</button>
                        </div>
                        <button class="${buttonClass}" data-id="${product.id}">
                            <i class="fas ${product.confirmed ? 'fa-check' : 'fa-thumbs-up'}"></i> ${buttonText}
                        </button>
                    </div>
                </div>
            `;
        });
        
        campaignList.innerHTML = html;
        
        // Event listeners ekle
        this.addProductEventListeners();
        
        // Sonuç sayısını güncelle
        if (resultsCount) {
            resultsCount.textContent = `${this.filteredProducts.length} kampanya ürünü bulundu`;
        }
        
        this.updateSummary();
        console.log('Kampanya ürünleri render edildi');
    }
    
    addProductEventListeners() {
        console.log('Product event listeners ekleniyor');
        
        // Miktar butonları
        document.querySelectorAll('.quantity-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const productId = parseInt(e.target.dataset.id);
                const isMinus = e.target.classList.contains('minus');
                this.updateQuantity(productId, isMinus ? -1 : 1);
            });
        });
        
        // Miktar input değişiklikleri
        document.querySelectorAll('.quantity-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const productId = parseInt(e.target.dataset.id);
                const newQuantity = parseInt(e.target.value) || 1;
                this.setQuantity(productId, newQuantity);
            });
        });
        
        // Onaylama butonları
        document.querySelectorAll('.confirm-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const productId = parseInt(e.target.dataset.id);
                const quantityInput = e.currentTarget.parentElement.querySelector('.quantity-input');
                const quantity = parseInt(quantityInput.value) || 1;
                this.confirmProduct(productId, quantity);
            });
        });
    }
    
    updateQuantity(productId, change) {
        console.log('Miktar güncelleniyor:', productId, change);
        const product = this.campaignProducts.find(p => p.id === productId);
        if (product) {
            const input = document.querySelector(`.quantity-input[data-id="${productId}"]`);
            if (input) {
                const newQuantity = parseInt(input.value) + change;
                const totalStock = product.locations.merkez + product.locations.ikitelli + product.locations.bostanci;
                
                if (newQuantity >= 1 && newQuantity <= totalStock) {
                    input.value = newQuantity;
                    if (product.confirmed) {
                        product.confirmedQuantity = newQuantity;
                    }
                }
            }
        }
        this.updateSummary();
    }
    
    setQuantity(productId, quantity) {
        const product = this.campaignProducts.find(p => p.id === productId);
        if (product) {
            const totalStock = product.locations.merkez + product.locations.ikitelli + product.locations.bostanci;
            if (quantity >= 1 && quantity <= totalStock) {
                if (product.confirmed) {
                    product.confirmedQuantity = quantity;
                }
            } else {
                this.renderCampaignProducts();
            }
        }
        this.updateSummary();
    }
    
    confirmProduct(productId, quantity = 1) {
        console.log('Ürün onaylanıyor:', productId);
        const product = this.campaignProducts.find(p => p.id === productId);
        
        if (!product) return;
        
        const totalStock = product.locations.merkez + product.locations.ikitelli + product.locations.bostanci;
        
        if (quantity > totalStock) {
            this.showNotification(`Stokta sadece ${totalStock} adet bulunmaktadır.`);
            return;
        }
        
        // Onay durumunu değiştir
        product.confirmed = !product.confirmed;
        
        if (product.confirmed) {
            product.confirmedQuantity = quantity;
            this.showNotification(`${product.name} (${quantity} adet) onaylandı!`);
        } else {
            product.confirmedQuantity = 0;
            this.showNotification(`${product.name} onayı kaldırıldı!`);
        }
        
        this.renderCampaignProducts();
        this.updateHeaderCounts();
    }
    
    sendToCart() {
        console.log('Sepete gönderiliyor');
        const confirmedProducts = this.campaignProducts.filter(product => product.confirmed);
        
        if (confirmedProducts.length === 0) {
            this.showNotification('Lütfen önce kampanya ürünlerini onaylayın!');
            return;
        }
        
        // Burada gerçek sepete ekleme işlemi yapılacak
        confirmedProducts.forEach(product => {
            console.log('Sepete ekleniyor:', product.name, product.confirmedQuantity);
        });
        
        this.showNotification('Onaylanan kampanya ürünleri sepete gönderildi!');
    }
    
    sendOrder() {
        console.log('Sipariş gönderiliyor');
        const confirmedProducts = this.campaignProducts.filter(product => product.confirmed);
        
        if (confirmedProducts.length === 0) {
            this.showNotification('Lütfen önce kampanya ürünlerini onaylayın!');
            return;
        }
        
        const orderNote = document.getElementById('order-note').value;
        
        // API'ye gönderilecek sipariş verisi
        const orderData = {
            customerCode: 'S6064',
            items: confirmedProducts.map(product => ({
                productId: product.id,
                productCode: product.code,
                quantity: product.confirmedQuantity,
                unitPrice: product.campaignPrice,
                isCampaign: true
            })),
            note: orderNote,
            total: this.calculateTotal(),
            paymentType: 'invoice'
        };
        
        console.log('Kampanya Siparişi Gönderildi:', orderData);
        this.showNotification('Kampanya siparişiniz başarıyla gönderildi!');
        
        // Not alanını temizle
        document.getElementById('order-note').value = '';
        
        // Onayları sıfırla
        this.resetConfirmations();
    }
    
    payNow() {
        console.log('Hemen ödeme yapılıyor');
        const confirmedProducts = this.campaignProducts.filter(product => product.confirmed);
        
        if (confirmedProducts.length === 0) {
            this.showNotification('Lütfen önce kampanya ürünlerini onaylayın!');
            return;
        }
        
        const orderNote = document.getElementById('order-note').value;
        
        // API'ye gönderilecek ödeme verisi
        const paymentData = {
            customerCode: 'S6064',
            items: confirmedProducts.map(product => ({
                productId: product.id,
                productCode: product.code,
                quantity: product.confirmedQuantity,
                unitPrice: product.campaignPrice,
                isCampaign: true
            })),
            note: orderNote,
            total: this.calculatePayNowTotal(),
            paymentType: 'credit_card',
            discount: this.calculateDiscount()
        };
        
        console.log('Kampanya Ödeme İşlemi:', paymentData);
        this.showNotification('Kampanya ödemeniz başarıyla tamamlandı!');
        
        // Not alanını temizle
        document.getElementById('order-note').value = '';
        
        // Onayları sıfırla
        this.resetConfirmations();
    }
    
    resetConfirmations() {
        this.campaignProducts.forEach(product => {
            product.confirmed = false;
            product.confirmedQuantity = 0;
        });
        this.renderCampaignProducts();
        this.updateHeaderCounts();
    }
    
    calculateTotal() {
        let subtotal = 0;
        let campaignDiscount = 0;
        
        const confirmedProducts = this.campaignProducts.filter(product => product.confirmed);
        
        confirmedProducts.forEach(product => {
            subtotal += product.originalPrice * product.confirmedQuantity;
            campaignDiscount += (product.originalPrice - product.campaignPrice) * product.confirmedQuantity;
        });
        
        const tax = subtotal * 0.18;
        return subtotal + tax - campaignDiscount;
    }
    
    calculatePayNowTotal() {
        const total = this.calculateTotal();
        const paymentDiscount = total * 0.03;
        return total - paymentDiscount;
    }
    
    calculateDiscount() {
        const total = this.calculateTotal();
        return total * 0.03;
    }
    
    updateSummary() {
        console.log('Özet güncelleniyor');
        let subtotal = 0;
        let campaignDiscount = 0;
        
        const confirmedProducts = this.campaignProducts.filter(product => product.confirmed);
        
        confirmedProducts.forEach(product => {
            subtotal += product.originalPrice * product.confirmedQuantity;
            campaignDiscount += (product.originalPrice - product.campaignPrice) * product.confirmedQuantity;
        });
        
        const tax = subtotal * 0.18;
        const paymentDiscount = subtotal * 0.03;
        const total = subtotal + tax - campaignDiscount;
        const payNowTotal = total - paymentDiscount;
        
        // Elementleri güncelle
        const elements = {
            'subtotal': `₺${subtotal.toFixed(2)}`,
            'tax': `₺${tax.toFixed(2)}`,
            'campaign-discount': `-₺${campaignDiscount.toFixed(2)}`,
            'payment-discount': `-₺${paymentDiscount.toFixed(2)}`,
            'total': `₺${total.toFixed(2)}`,
            'pay-now-total': `₺${payNowTotal.toFixed(2)}`
        };
        
        Object.keys(elements).forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = elements[id];
            }
        });
    }
    
    updateHeaderCounts() {
        console.log('Header sayıları güncelleniyor');
        const confirmedCampaigns = this.campaignProducts.filter(product => product.confirmed).length;
        
        const campaignCountElement = document.getElementById('header-campaign-count');
        const sidebarCampaignCount = document.getElementById('sidebar-campaign-count');
        
        if (campaignCountElement) {
            campaignCountElement.textContent = confirmedCampaigns;
        }
        if (sidebarCampaignCount) {
            sidebarCampaignCount.textContent = confirmedCampaigns;
        }
    }
    
    showNotification(message) {
        console.log('Bildirim:', message);
        
        // Bildirim elementi yoksa alert göster
        const notification = document.getElementById('notification');
        const notificationText = document.getElementById('notification-text');
        
        if (!notification || !notificationText) {
            alert(message);
            return;
        }
        
        // Bildirim göster
        notificationText.textContent = message;
        notification.style.display = 'flex';
        
        // 3 saniye sonra kapat
        setTimeout(() => {
            notification.style.display = 'none';
        }, 3000);
    }
    
    logout() {
        localStorage.removeItem('currentUser');
        localStorage.removeItem('userRole');
        localStorage.removeItem('cart');
        localStorage.removeItem('campaignCart');
        window.location.href = 'login.html';
    }
}

// Sayfa yüklendiğinde CampaignCartManager'ı başlat
console.log('DOMContentLoaded bekleniyor');
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOMContentLoaded tetiklendi');
    new CampaignCartManager();
});