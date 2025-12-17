// ÜRÜN YÖNETİM SİSTEMİ
class ProductManager {
    constructor() {
        this.products = [];
        this.filteredProducts = [];
        this.currentView = 'list';
        this.currentFilters = {
            search: '',
            manufacturer: '',
            vehicle: '',
            category: ''
        };
        this.init();
    }

    init() {
        this.loadSampleProducts();
        this.setupEventListeners();
        this.renderProducts();
    }

    // ÖRNEK ÜRÜN VERİLERİ
    loadSampleProducts() {
        this.products = [
            {
                id: 1,
                code: "A-1038",
                name: "VW UST TABLA Q7 2010 U TABLA SOL-SAG",
                fullName: "VW UST TABLA Q7 2010 U TABLA SOL-SAG Orijinal Yedek Parça",
                manufacturer: "Teknorot",
                oem: "VWA1038",
                discount: "%10",
                listPrice: 2450.00,
                cost: 1999.00,
                stock: 35,
                category: "tools",
                image: "📷",
                minOrder: 1,
                status: "Mevcut",
                locations: {
                    merkez: 15,
                    ikitelli: 8,
                    bostanci: 12
                },
                isCampaign: false
            },
            {
                id: 2,
                code: "B-2047",
                name: "BMW FREN BALATASI X5 2015 ÖN FREN SİSTEMİ",
                fullName: "BMW FREN BALATASI X5 2015 ÖN FREN SİSTEMİ Orijinal Parça",
                manufacturer: "Bosch",
                oem: "BOS2047",
                discount: "%15",
                listPrice: 1850.00,
                cost: 1572.50,
                stock: 22,
                category: "parts",
                image: "📷",
                minOrder: 1,
                status: "Mevcut",
                locations: {
                    merkez: 10,
                    ikitelli: 6,
                    bostanci: 6
                },
                isCampaign: false
            },
            {
                id: 3,
                code: "C-3056",
                name: "MERCEDES BUJI SETI C180 2018 4'LÜ BUJI TAKIMI",
                fullName: "MERCEDES BUJI SETI C180 2018 4'LÜ BUJI TAKIMI Orijinal",
                manufacturer: "NGK",
                oem: "NGK3056",
                discount: "%5",
                listPrice: 480.00,
                cost: 456.00,
                stock: 8,
                category: "parts",
                image: "📷",
                minOrder: 1,
                status: "Mevcut",
                locations: {
                    merkez: 3,
                    ikitelli: 2,
                    bostanci: 3
                },
                isCampaign: true
            },
            {
                id: 4,
                code: "D-4012",
                name: "AUDI YAĞ FİLTRESİ A4 2020 MOTOR YAĞ FİLTRESİ",
                fullName: "AUDI YAĞ FİLTRESİ A4 2020 MOTOR YAĞ FİLTRESİ Orijinal",
                manufacturer: "Mann-Filter",
                oem: "MAN4012",
                discount: "%12",
                listPrice: 320.00,
                cost: 281.60,
                stock: 45,
                category: "parts",
                image: "📷",
                minOrder: 1,
                status: "Mevcut",
                locations: {
                    merkez: 20,
                    ikitelli: 15,
                    bostanci: 10
                },
                isCampaign: false
            },
            {
                id: 5,
                code: "E-5078",
                name: "TOYOTA AKÜ COROLLA 2019 12V 60AH AKÜ",
                fullName: "TOYOTA AKÜ COROLLA 2019 12V 60AH AKÜ Orijinal",
                manufacturer: "Varta",
                oem: "VAR5078",
                discount: "%8",
                listPrice: 1250.00,
                cost: 1150.00,
                stock: 15,
                category: "parts",
                image: "📷",
                minOrder: 1,
                status: "Mevcut",
                locations: {
                    merkez: 7,
                    ikitelli: 4,
                    bostanci: 4
                },
                isCampaign: false
            },
            {
                id: 6,
                code: "F-6093",
                name: "HONDA FAR LAMBASI CIVIC 2021 ÖN SOL FAR",
                fullName: "HONDA FAR LAMBASI CIVIC 2021 ÖN SOL FAR Orijinal",
                manufacturer: "Hella",
                oem: "HEL6093",
                discount: "%20",
                listPrice: 2850.00,
                cost: 2280.00,
                stock: 5,
                category: "parts",
                image: "📷",
                minOrder: 1,
                status: "Mevcut",
                locations: {
                    merkez: 2,
                    ikitelli: 1,
                    bostanci: 2
                },
                isCampaign: true
            },
            {
                id: 7,
                code: "G-7014",
                name: "FORD DİREKSİYON KUTUSU FOCUS 2017 DİREKSİYON SİSTEMİ",
                fullName: "FORD DİREKSİYON KUTUSU FOCUS 2017 DİREKSİYON SİSTEMİ Orijinal",
                manufacturer: "ZF",
                oem: "ZF7014",
                discount: "%18",
                listPrice: 4200.00,
                cost: 3444.00,
                stock: 3,
                category: "parts",
                image: "📷",
                minOrder: 1,
                status: "Mevcut",
                locations: {
                    merkez: 1,
                    ikitelli: 1,
                    bostanci: 1
                },
                isCampaign: false
            }
        ];
        
        this.filteredProducts = [...this.products];
    }

    // EVENT LISTENER'LAR
    setupEventListeners() {
        // Arama formu
        const searchForm = document.getElementById('search-form');
        if (searchForm) {
            searchForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleSearch();
            });
        }

        // Arama input'u (real-time search)
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.addEventListener('input', App.debounce(() => {
                this.handleSearch();
            }, 300));
        }

        // Filtreler
        const manufacturerFilter = document.getElementById('manufacturer-filter');
        const vehicleFilter = document.getElementById('vehicle-filter');
        
        if (manufacturerFilter) {
            manufacturerFilter.addEventListener('change', () => {
                this.handleFilter();
            });
        }
        
        if (vehicleFilter) {
            vehicleFilter.addEventListener('change', () => {
                this.handleFilter();
            });
        }

        // Görünüm değiştirme
        const viewButtons = document.querySelectorAll('.view-btn');
        viewButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const view = e.currentTarget.dataset.view;
                this.setView(view);
            });
        });

        // Sepete ekleme event'leri delegation ile
        document.addEventListener('click', (e) => {
            if (e.target.closest('.add-to-cart-table')) {
                const button = e.target.closest('.add-to-cart-table');
                const productId = parseInt(button.dataset.id);
                const quantityInput = button.parentElement.querySelector('.quantity-input');
                const quantity = parseInt(quantityInput.value) || 1;
                this.addToCart(productId, quantity, false);
            }
            
            if (e.target.closest('.add-to-cart')) {
                const button = e.target.closest('.add-to-cart');
                const productId = parseInt(button.dataset.id);
                const quantityInput = button.parentElement.querySelector('.quantity-input');
                const quantity = parseInt(quantityInput.value) || 1;
                this.addToCart(productId, quantity, false);
            }
        });
    }

    // ARAMA İŞLEMLERİ
    handleSearch() {
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            this.currentFilters.search = searchInput.value.toLowerCase();
            this.applyFilters();
        }
    }

    handleFilter() {
        const manufacturerFilter = document.getElementById('manufacturer-filter');
        const vehicleFilter = document.getElementById('vehicle-filter');
        
        if (manufacturerFilter) {
            this.currentFilters.manufacturer = manufacturerFilter.value;
        }
        if (vehicleFilter) {
            this.currentFilters.vehicle = vehicleFilter.value;
        }
        
        this.applyFilters();
    }

    applyFilters() {
        this.filteredProducts = this.products.filter(product => {
            // Arama filtresi
            if (this.currentFilters.search) {
                const searchTerm = this.currentFilters.search;
                const searchableText = `
                    ${product.code} 
                    ${product.name} 
                    ${product.oem} 
                    ${product.manufacturer}
                `.toLowerCase();
                
                if (!searchableText.includes(searchTerm)) {
                    return false;
                }
            }

            // Üretici filtresi
            if (this.currentFilters.manufacturer && 
                product.manufacturer.toLowerCase() !== this.currentFilters.manufacturer) {
                return false;
            }

            // Araç modeli filtresi (basit implementasyon)
            if (this.currentFilters.vehicle && 
                !product.name.toLowerCase().includes(this.currentFilters.vehicle)) {
                return false;
            }

            return true;
        });

        this.renderProducts();
    }

    // GÖRÜNÜM DEĞİŞTİRME
    setView(view) {
        this.currentView = view;
        
        // Aktif butonu güncelle
        const viewButtons = document.querySelectorAll('.view-btn');
        viewButtons.forEach(btn => {
            if (btn.dataset.view === view) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Görünümleri göster/gizle
        const productsTable = document.getElementById('products-table');
        const productsGrid = document.getElementById('products-grid');
        
        if (view === 'grid') {
            if (productsTable) productsTable.style.display = 'none';
            if (productsGrid) productsGrid.style.display = 'grid';
        } else {
            if (productsTable) productsTable.style.display = 'table';
            if (productsGrid) productsGrid.style.display = 'none';
        }

        this.renderProducts();
    }

    // ÜRÜNLERİ RENDER ETME
    renderProducts() {
        if (this.currentView === 'grid') {
            this.renderProductsGrid();
        } else {
            this.renderProductsTable();
        }
        
        // Sonuç sayısını güncelle
        this.updateResultsCount();
    }

    renderProductsTable() {
        const tbody = document.getElementById('products-table-body');
        if (!tbody) return;

        tbody.innerHTML = '';
        
        this.filteredProducts.forEach(product => {
            const totalStock = product.locations.merkez + product.locations.ikitelli + product.locations.bostanci;
            const stockClass = this.getStockClass(totalStock);
            const rowClass = product.isCampaign ? 'campaign-product-row' : '';
            
            const row = document.createElement('tr');
            row.className = rowClass;
            row.innerHTML = `
                <td class="product-image">${product.image}</td>
                <td class="product-code">${product.code}</td>
                <td class="product-name" data-fullname="${product.fullName}">${product.name}</td>
                <td>${product.oem}</td>
                <td><span class="badge badge-primary">${product.manufacturer}</span></td>
                <td>
                    <div class="stock-info">
                        <div class="stock-location">
                            <span>Merkez:</span>
                            <span>${product.locations.merkez}</span>
                        </div>
                        <div class="stock-location">
                            <span>İkitelli:</span>
                            <span>${product.locations.ikitelli}</span>
                        </div>
                        <div class="stock-location">
                            <span>Bostancı:</span>
                            <span>${product.locations.bostanci}</span>
                        </div>
                        <div class="stock-total ${stockClass}">
                            <span>Toplam:</span>
                            <span>${totalStock}</span>
                        </div>
                    </div>
                </td>
                <td>
                    <div class="price-info">
                        <span class="original-price">
                            <span class="price-amount">${product.listPrice.toFixed(2)}</span>
                            <span class="price-currency">₺</span>
                        </span>
                        <span class="campaign-price">
                            <span class="price-amount">${product.cost.toFixed(2)}</span>
                            <span class="price-currency">₺</span>
                        </span>
                        <div class="badge badge-danger">
                            <span class="discount-label">İskonto:</span> ${product.discount}
                        </div>
                    </div>
                </td>
                <td>
                    <div class="min-order">${product.minOrder}</div>
                </td>
                <td>
                    <span class="badge badge-success">${product.status}</span>
                </td>
                <td>
                    <div class="quantity-control">
                        <input type="number" class="quantity-input" value="1" min="1" max="${totalStock}">
                        <button class="btn btn-success btn-sm add-to-cart-table" data-id="${product.id}">
                            <i class="fas fa-cart-plus"></i>
                        </button>
                    </div>
                </td>
            `;
            
            tbody.appendChild(row);
        });
    }

    renderProductsGrid() {
        const grid = document.getElementById('products-grid');
        if (!grid) return;

        grid.innerHTML = '';
        
        this.filteredProducts.forEach(product => {
            const totalStock = product.locations.merkez + product.locations.ikitelli + product.locations.bostanci;
            const stockClass = this.getStockClass(totalStock);
            const cardClass = product.isCampaign ? 'product-card campaign-product-card' : 'product-card';
            
            const card = document.createElement('div');
            card.className = cardClass;
            card.innerHTML = `
                ${totalStock < 10 ? `<div class="badge badge-warning">Son ${totalStock} Adet</div>` : ''}
                ${product.isCampaign ? `<div class="badge badge-success"><i class="fas fa-bolt"></i> Kampanya</div>` : ''}
                <div class="product-image-card">${product.image}</div>
                <h3 class="product-name-card">${product.name}</h3>
                <div class="product-code-card">${product.code}</div>
                <div class="product-details">
                    <div class="product-detail">
                        <span class="detail-label">OEM</span>
                        <span class="detail-value">${product.oem}</span>
                    </div>
                    <div class="product-detail">
                        <span class="detail-label">Üretici</span>
                        <span class="detail-value">${product.manufacturer}</span>
                    </div>
                    <div class="product-detail">
                        <span class="detail-label">İskonto</span>
                        <span class="detail-value">${product.discount}</span>
                    </div>
                    <div class="product-detail">
                        <span class="detail-label">Fiyat</span>
                        <span class="detail-value">
                            <span class="price-amount">${product.cost.toFixed(2)}</span>
                            <span class="price-currency">₺</span>
                        </span>
                    </div>
                    <div class="product-detail">
                        <span class="detail-label">Merkez</span>
                        <span class="detail-value">${product.locations.merkez}</span>
                    </div>
                    <div class="product-detail">
                        <span class="detail-label">İkitelli</span>
                        <span class="detail-value">${product.locations.ikitelli}</span>
                    </div>
                    <div class="product-detail">
                        <span class="detail-label">Bostancı</span>
                        <span class="detail-value">${product.locations.bostanci}</span>
                    </div>
                </div>
                <div class="product-actions">
                    <div class="quantity-control">
                        <input type="number" class="quantity-input" value="1" min="1" max="${totalStock}">
                    </div>
                    <button class="btn btn-success add-to-cart" data-id="${product.id}">
                        <i class="fas fa-cart-plus"></i> Sepete Ekle
                    </button>
                </div>
            `;
            
            grid.appendChild(card);
        });
    }

    // YARDIMCI FONKSİYONLAR
    getStockClass(totalStock) {
        if (totalStock < 10) return 'stock-low';
        if (totalStock < 20) return 'stock-medium';
        return 'stock-high';
    }

    updateResultsCount() {
        const resultsCount = document.getElementById('results-count');
        if (resultsCount) {
            resultsCount.textContent = `${this.filteredProducts.length} ürün bulundu`;
        }
    }

    // SEPETE EKLEME
    addToCart(productId, quantity = 1, isCampaign = false) {
        const product = this.products.find(p => p.id === productId);
        if (product) {
            const totalStock = product.locations.merkez + product.locations.ikitelli + product.locations.bostanci;
            
            if (quantity > totalStock) {
                App.showNotification(`Stokta sadece ${totalStock} adet bulunuyor!`, 'warning');
                return false;
            }
            
            if (quantity < product.minOrder) {
                App.showNotification(`Minimum sipariş adedi: ${product.minOrder}`, 'warning');
                return false;
            }
            
            App.addToCart(product, quantity, isCampaign);
            return true;
        }
        return false;
    }
}

// SLIDER YÖNETİMİ
class SliderManager {
    constructor() {
        this.currentSlide = 0;
        this.slideCount = 3;
        this.interval = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.startSlider();
    }

    setupEventListeners() {
        const dots = document.querySelectorAll('.slider-dot');
        dots.forEach((dot, index) => {
            dot.addEventListener('click', () => {
                this.goToSlide(index);
            });
        });
    }

    startSlider() {
        this.interval = setInterval(() => {
            this.nextSlide();
        }, 5000);
    }

    nextSlide() {
        this.currentSlide = (this.currentSlide + 1) % this.slideCount;
        this.updateSlider();
    }

    goToSlide(index) {
        this.currentSlide = index;
        this.updateSlider();
        this.resetInterval();
    }

    updateSlider() {
        const slider = document.getElementById('slider');
        const dots = document.querySelectorAll('.slider-dot');
        
        if (slider) {
            slider.style.transform = `translateX(-${this.currentSlide * 100}%)`;
        }
        
        dots.forEach((dot, index) => {
            if (index === this.currentSlide) {
                dot.classList.add('active');
            } else {
                dot.classList.remove('active');
            }
        });
    }

    resetInterval() {
        clearInterval(this.interval);
        this.startSlider();
    }
}

// SAYFA YÜKLENDİĞİNDE
document.addEventListener('DOMContentLoaded', function() {
    // Ürün yöneticisini başlat
    window.productManager = new ProductManager();
    
    // Slider'ı başlat
    window.sliderManager = new SliderManager();
    
    console.log('Product manager başlatıldı');
});