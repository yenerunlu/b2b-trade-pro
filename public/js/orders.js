// SİPARİŞ YÖNETİM SİSTEMİ
class OrdersManager {
    constructor() {
        this.selectedItems = [];
        this.orderHistory = this.getOrderHistory();
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.renderCart();
        this.renderOrderHistory();
        this.updateHeaderCartCount();
    }

    // Geçmiş sipariş verileri
    getOrderHistory() {
        return [
            {
                id: 1,
                orderNumber: "ORD-2024-001",
                date: "2024-01-15",
                status: "completed",
                total: 4850.50,
                items: [
                    { id: 1, name: "VW UST TABLA Q7 2010 U TABLA SOL-SAG", code: "A-1038", quantity: 2, price: 1999.00 },
                    { id: 2, name: "BMW FREN BALATASI X5 2015 ÖN FREN SİSTEMİ", code: "B-2047", quantity: 1, price: 1572.50 }
                ],
                paymentMethod: "Kredi Kartı",
                shippingAddress: "İkitelli Organize Sanayi Bölgesi, No:15, İstanbul",
                note: "Acil teslimat gerekiyor.",
                timeline: [
                    { date: "2024-01-15 10:30", status: "Sipariş Alındı" },
                    { date: "2024-01-15 11:45", status: "Ödeme Onaylandı" },
                    { date: "2024-01-16 09:15", status: "Hazırlanıyor" },
                    { date: "2024-01-16 14:20", status: "Kargoya Verildi" },
                    { date: "2024-01-18 11:00", status: "Teslim Edildi" }
                ]
            },
            {
                id: 2,
                orderNumber: "ORD-2024-002",
                date: "2024-01-12",
                status: "processing",
                total: 3200.75,
                items: [
                    { id: 3, name: "MERCEDES BUJI SETI C180 2018 4'LÜ BUJI TAKIMI", code: "C-3056", quantity: 4, price: 456.00 },
                    { id: 4, name: "AUDI YAĞ FİLTRESİ A4 2020 MOTOR YAĞ FİLTRESİ", code: "D-4012", quantity: 3, price: 281.60 }
                ],
                paymentMethod: "Havale",
                shippingAddress: "Bostancı Mahallesi, No:25, İstanbul",
                note: "",
                timeline: [
                    { date: "2024-01-12 14:20", status: "Sipariş Alındı" },
                    { date: "2024-01-12 15:45", status: "Ödeme Bekleniyor" },
                    { date: "2024-01-13 10:30", status: "Ödeme Onaylandı" },
                    { date: "2024-01-15 08:15", status: "Hazırlanıyor" }
                ]
            },
            {
                id: 3,
                orderNumber: "ORD-2024-003",
                date: "2024-01-10",
                status: "pending",
                total: 3430.00,
                items: [
                    { id: 5, name: "TOYOTA AKÜ COROLLA 2019 12V 60AH AKÜ", code: "E-5078", quantity: 1, price: 1150.00 },
                    { id: 6, name: "HONDA FAR LAMBASI CIVIC 2021 ÖN SOL FAR", code: "F-6093", quantity: 1, price: 2280.00 }
                ],
                paymentMethod: "Kredi Kartı",
                shippingAddress: "Merkez Depo, No:8, İstanbul",
                note: "Stok durumu kontrol edilsin.",
                timeline: [
                    { date: "2024-01-10 09:15", status: "Sipariş Alındı" },
                    { date: "2024-01-10 10:30", status: "Ödeme Onaylandı" }
                ]
            }
        ];
    }

    // EVENT LISTENER'LAR
    setupEventListeners() {
        // Tümünü seç event listener
        document.getElementById('select-all').addEventListener('change', (e) => {
            this.handleSelectAll(e);
        });
        
        // Seçtiklerimi sil butonu
        document.getElementById('delete-selected').addEventListener('click', () => {
            this.deleteSelectedItems();
        });
        
        // Sipariş gönder butonu
        document.getElementById('send-order-btn').addEventListener('click', () => {
            this.sendOrder();
        });
        
        // Hemen öde butonu
        document.getElementById('pay-now-btn').addEventListener('click', () => {
            this.payNow();
        });
        
        // Filtre event listeners
        document.getElementById('date-filter').addEventListener('change', (e) => {
            this.handleDateFilterChange(e);
        });
        
        document.getElementById('custom-date').addEventListener('change', () => {
            this.renderOrderHistory();
        });
        
        document.getElementById('status-filter').addEventListener('change', () => {
            this.renderOrderHistory();
        });
        
        // Modal event listeners
        document.getElementById('close-modal').addEventListener('click', () => {
            this.closeOrderModal();
        });
        
        document.getElementById('order-detail-modal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('order-detail-modal')) {
                this.closeOrderModal();
            }
        });
    }

    // SEPET İŞLEMLERİ
    renderCart() {
        const cart = App.cart;
        const cartList = document.getElementById('cart-list');
        
        if (cart.length === 0) {
            cartList.innerHTML = this.getEmptyCartHTML();
            this.updateSummary();
            return;
        }

        cartList.innerHTML = '';
        
        cart.forEach((item, index) => {
            const cartItem = document.createElement('div');
            cartItem.className = `cart-item ${this.selectedItems.includes(item.id) ? 'selected' : ''}`;
            cartItem.innerHTML = this.getCartItemHTML(item, index);
            cartList.appendChild(cartItem);
        });

        this.addCartItemEventListeners();
        this.updateSummary();
    }

    getEmptyCartHTML() {
        return `
            <div class="empty-cart">
                <i class="fas fa-shopping-cart"></i>
                <h3>Sepetiniz Boş</h3>
                <p>Sepetinizde henüz ürün bulunmamaktadır.</p>
                <a href="dashboard.html" class="continue-shopping">
                    <i class="fas fa-arrow-left"></i> Alışverişe Devam Et
                </a>
            </div>
        `;
    }

    getCartItemHTML(item, index) {
        return `
            <div class="item-checkbox">
                <input type="checkbox" id="item-${index}" ${this.selectedItems.includes(item.id) ? 'checked' : ''} data-id="${item.id}">
            </div>
            <div class="item-image">${item.image}</div>
            <div class="item-details">
                <h3 class="item-name">${item.name}</h3>
                <div class="item-code">${item.code} | OEM: ${item.oem}</div>
                <div class="item-manufacturer">${item.manufacturer}</div>
                <div class="item-price">₺${item.cost.toFixed(2)}</div>
            </div>
            <div class="item-actions">
                <div class="quantity-control">
                    <button class="quantity-btn minus" data-id="${item.id}">-</button>
                    <input type="number" class="quantity-input" value="${item.quantity}" min="1" max="${item.stock}" data-id="${item.id}">
                    <button class="quantity-btn plus" data-id="${item.id}">+</button>
                </div>
                <div class="item-total">₺${(item.cost * item.quantity).toFixed(2)}</div>
                <button class="remove-btn" data-id="${item.id}">
                    <i class="fas fa-trash"></i> Sil
                </button>
            </div>
        `;
    }

    addCartItemEventListeners() {
        // Checkbox event listeners
        document.querySelectorAll('.item-checkbox input').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                this.handleItemSelection(e);
            });
        });

        // Quantity buttons
        document.querySelectorAll('.quantity-btn.minus').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const itemId = parseInt(e.target.dataset.id);
                this.updateQuantity(itemId, -1);
            });
        });

        document.querySelectorAll('.quantity-btn.plus').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const itemId = parseInt(e.target.dataset.id);
                this.updateQuantity(itemId, 1);
            });
        });

        // Quantity inputs
        document.querySelectorAll('.quantity-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const itemId = parseInt(e.target.dataset.id);
                const newQuantity = parseInt(e.target.value) || 1;
                this.setQuantity(itemId, newQuantity);
            });
        });

        // Remove buttons
        document.querySelectorAll('.remove-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const itemId = parseInt(e.target.dataset.id);
                this.removeFromCart(itemId);
            });
        });
    }

    // SEPET FONKSİYONLARI
    handleSelectAll(e) {
        if (e.target.checked) {
            this.selectedItems = App.cart.map(item => item.id);
        } else {
            this.selectedItems = [];
        }
        this.renderCart();
    }

    handleItemSelection(e) {
        const itemId = parseInt(e.target.dataset.id);
        if (e.target.checked) {
            if (!this.selectedItems.includes(itemId)) {
                this.selectedItems.push(itemId);
            }
        } else {
            this.selectedItems = this.selectedItems.filter(id => id !== itemId);
        }
        this.updateItemSelection();
        this.updateSummary();
    }

    updateQuantity(itemId, change) {
        const item = App.cart.find(item => item.id === itemId);
        if (item) {
            const newQuantity = item.quantity + change;
            if (newQuantity >= 1 && newQuantity <= item.stock) {
                item.quantity = newQuantity;
                App.saveCartData();
                this.renderCart();
            }
        }
    }

    setQuantity(itemId, quantity) {
        const item = App.cart.find(item => item.id === itemId);
        if (item && quantity >= 1 && quantity <= item.stock) {
            item.quantity = quantity;
            App.saveCartData();
            this.renderCart();
        }
    }

    removeFromCart(itemId) {
        App.cart = App.cart.filter(item => item.id !== itemId);
        this.selectedItems = this.selectedItems.filter(id => id !== itemId);
        App.saveCartData();
        this.renderCart();
        this.updateHeaderCartCount();
        App.showNotification('Ürün sepetten kaldırıldı!', 'info');
    }

    deleteSelectedItems() {
        if (this.selectedItems.length === 0) {
            App.showNotification('Lütfen silmek istediğiniz ürünleri seçin!', 'warning');
            return;
        }

        App.cart = App.cart.filter(item => !this.selectedItems.includes(item.id));
        this.selectedItems = [];
        App.saveCartData();
        this.renderCart();
        this.updateHeaderCartCount();
        App.showNotification('Seçili ürünler sepetten kaldırıldı!', 'info');
    }

    updateItemSelection() {
        document.querySelectorAll('.cart-item').forEach(item => {
            const checkbox = item.querySelector('input[type="checkbox"]');
            if (checkbox && checkbox.checked) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });
        
        // Tümünü seç checkbox'ını güncelle
        const allChecked = App.cart.length > 0 && this.selectedItems.length === App.cart.length;
        document.getElementById('select-all').checked = allChecked;
        document.getElementById('select-all').indeterminate = this.selectedItems.length > 0 && this.selectedItems.length < App.cart.length;
    }

    updateSummary() {
        let subtotal = 0;
        
        // Sadece seçili ürünleri hesapla
        const selectedCartItems = App.cart.filter(item => this.selectedItems.includes(item.id));
        
        selectedCartItems.forEach(item => {
            subtotal += item.cost * item.quantity;
        });
        
        const tax = subtotal * 0.18;
        const discount = subtotal * 0.03; // %3 indirim
        const total = subtotal + tax;
        const payNowTotal = total - discount;
        
        document.getElementById('subtotal').textContent = App.formatCurrency(subtotal);
        document.getElementById('tax').textContent = App.formatCurrency(tax);
        document.getElementById('discount').textContent = `-${App.formatCurrency(discount)}`;
        document.getElementById('total').textContent = App.formatCurrency(total);
        document.getElementById('pay-now-total').textContent = App.formatCurrency(payNowTotal);
    }

    updateHeaderCartCount() {
        App.updateCartUI();
    }

    // SİPARİŞ İŞLEMLERİ
    sendOrder() {
        if (this.selectedItems.length === 0) {
            App.showNotification('Lütfen sipariş etmek istediğiniz ürünleri seçin!', 'warning');
            return;
        }
        
        const orderNote = document.getElementById('order-note').value;
        const selectedProducts = App.cart.filter(item => this.selectedItems.includes(item.id));
        
        // API'ye gönderilecek sipariş verisi
        const orderData = {
            customerCode: App.currentUser?.kod || 'S6064',
            items: selectedProducts.map(item => ({
                productId: item.id,
                productCode: item.code,
                quantity: item.quantity,
                unitPrice: item.cost
            })),
            note: orderNote,
            total: this.calculateTotal(),
            paymentType: 'invoice'
        };
        
        // API isteği burada yapılacak
        console.log('Sipariş Gönderildi:', orderData);
        
        // Başarılı sipariş sonrası
        App.showNotification('Siparişiniz başarıyla gönderildi!', 'success');
        
        // Sepetten seçili ürünleri kaldır
        App.cart = App.cart.filter(item => !this.selectedItems.includes(item.id));
        this.selectedItems = [];
        App.saveCartData();
        this.renderCart();
        this.updateHeaderCartCount();
        
        // Not alanını temizle
        document.getElementById('order-note').value = '';
    }

    payNow() {
        if (this.selectedItems.length === 0) {
            App.showNotification('Lütfen ödemek istediğiniz ürünleri seçin!', 'warning');
            return;
        }
        
        const orderNote = document.getElementById('order-note').value;
        const selectedProducts = App.cart.filter(item => this.selectedItems.includes(item.id));
        
        // API'ye gönderilecek ödeme verisi
        const paymentData = {
            customerCode: App.currentUser?.kod || 'S6064',
            items: selectedProducts.map(item => ({
                productId: item.id,
                productCode: item.code,
                quantity: item.quantity,
                unitPrice: item.cost
            })),
            note: orderNote,
            total: this.calculatePayNowTotal(),
            paymentType: 'credit_card',
            discount: this.calculateDiscount()
        };
        
        // API isteği burada yapılacak
        console.log('Ödeme İşlemi:', paymentData);
        
        // Başarılı ödeme sonrası
        App.showNotification('Ödemeniz başarıyla tamamlandı!', 'success');
        
        // Sepetten seçili ürünleri kaldır
        App.cart = App.cart.filter(item => !this.selectedItems.includes(item.id));
        this.selectedItems = [];
        App.saveCartData();
        this.renderCart();
        this.updateHeaderCartCount();
        
        // Not alanını temizle
        document.getElementById('order-note').value = '';
    }

    calculateTotal() {
        let subtotal = 0;
        const selectedCartItems = App.cart.filter(item => this.selectedItems.includes(item.id));
        
        selectedCartItems.forEach(item => {
            subtotal += item.cost * item.quantity;
        });
        
        const tax = subtotal * 0.18;
        return subtotal + tax;
    }

    calculatePayNowTotal() {
        const total = this.calculateTotal();
        const discount = total * 0.03;
        return total - discount;
    }

    calculateDiscount() {
        const total = this.calculateTotal();
        return total * 0.03;
    }

    // GEÇMİŞ SİPARİŞLER
    renderOrderHistory() {
        const historyList = document.getElementById('history-list');
        
        const filteredOrders = this.filterOrders();
        
        if (filteredOrders.length === 0) {
            historyList.innerHTML = this.getEmptyOrderHistoryHTML();
            return;
        }
        
        historyList.innerHTML = '';
        
        filteredOrders.forEach(order => {
            const orderItem = document.createElement('div');
            orderItem.className = 'order-history-item';
            orderItem.dataset.orderId = order.id;
            orderItem.innerHTML = this.getOrderHistoryItemHTML(order);
            historyList.appendChild(orderItem);
        });
        
        this.addOrderHistoryEventListeners();
    }

    getEmptyOrderHistoryHTML() {
        return `
            <div class="empty-cart">
                <i class="fas fa-clipboard-list"></i>
                <h3>Sipariş Bulunamadı</h3>
                <p>Seçtiğiniz kriterlere uygun sipariş bulunamadı.</p>
            </div>
        `;
    }

    getOrderHistoryItemHTML(order) {
        const statusClass = `status-${order.status}`;
        const statusText = this.getStatusText(order.status);
        const statusCompactClass = `status-${order.status}-compact`;
        
        return `
            <div class="order-status-indicator ${statusClass}"></div>
            <div class="order-main-info">
                <div class="order-header-compact">
                    <div>
                        <div class="order-number">${order.orderNumber}</div>
                        <div class="order-date">${this.formatDate(order.date)}</div>
                    </div>
                    <span class="order-status-compact ${statusCompactClass}">${statusText}</span>
                </div>
                <div class="order-details-compact">
                    <div class="order-detail-compact">
                        <span class="detail-label-compact">Ürün Sayısı</span>
                        <span class="detail-value-compact">${order.items.length}</span>
                    </div>
                    <div class="order-detail-compact">
                        <span class="detail-label-compact">Ödeme</span>
                        <span class="detail-value-compact">${order.paymentMethod}</span>
                    </div>
                    <div class="order-detail-compact">
                        <span class="detail-label-compact">Teslimat</span>
                        <span class="detail-value-compact">${order.shippingAddress.split(',')[0]}</span>
                    </div>
                </div>
            </div>
            <div class="order-total-compact">
                <div class="total-amount">${App.formatCurrency(order.total)}</div>
                <div class="total-label">Toplam Tutar</div>
            </div>
            <div class="order-arrow">
                <i class="fas fa-chevron-right"></i>
            </div>
        `;
    }

    addOrderHistoryEventListeners() {
        document.querySelectorAll('.order-history-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const orderId = parseInt(item.dataset.orderId);
                this.showOrderDetails(orderId);
            });
        });
    }

    filterOrders() {
        const dateFilterValue = document.getElementById('date-filter').value;
        const statusFilterValue = document.getElementById('status-filter').value;
        const customDateValue = document.getElementById('custom-date').value;
        
        let filtered = [...this.orderHistory];
        
        // Tarih filtresi
        if (dateFilterValue !== 'all') {
            const now = new Date();
            filtered = filtered.filter(order => {
                const orderDate = new Date(order.date);
                
                switch (dateFilterValue) {
                    case 'today':
                        return orderDate.toDateString() === now.toDateString();
                    case 'week':
                        const weekAgo = new Date(now);
                        weekAgo.setDate(now.getDate() - 7);
                        return orderDate >= weekAgo;
                    case 'month':
                        const monthAgo = new Date(now);
                        monthAgo.setMonth(now.getMonth() - 1);
                        return orderDate >= monthAgo;
                    case 'custom':
                        if (customDateValue) {
                            return orderDate.toDateString() === new Date(customDateValue).toDateString();
                        }
                        return true;
                    default:
                        return true;
                }
            });
        }
        
        // Durum filtresi
        if (statusFilterValue !== 'all') {
            filtered = filtered.filter(order => order.status === statusFilterValue);
        }
        
        // Yeniden eskiye sırala
        return filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    handleDateFilterChange(e) {
        if (e.target.value === 'custom') {
            document.getElementById('custom-date').style.display = 'block';
        } else {
            document.getElementById('custom-date').style.display = 'none';
        }
        this.renderOrderHistory();
    }

    getStatusText(status) {
        const statusMap = {
            'completed': 'Tamamlandı',
            'pending': 'Beklemede',
            'processing': 'İşleniyor',
            'cancelled': 'İptal Edildi'
        };
        return statusMap[status] || status;
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('tr-TR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    // SİPARİŞ DETAYLARI
    showOrderDetails(orderId) {
        const order = this.orderHistory.find(o => o.id === orderId);
        if (!order) return;
        
        document.getElementById('modal-order-number').textContent = order.orderNumber;
        document.getElementById('modal-body').innerHTML = this.getOrderDetailHTML(order);
        document.getElementById('order-detail-modal').style.display = 'flex';
    }

    getOrderDetailHTML(order) {
        const statusClass = `status-${order.status}`;
        const statusText = this.getStatusText(order.status);
        
        return `
            <div class="order-summary-details">
                <div class="order-detail">
                    <span class="detail-label">Sipariş Tarihi</span>
                    <span class="detail-value">${this.formatDate(order.date)}</span>
                </div>
                <div class="order-detail">
                    <span class="detail-label">Sipariş Durumu</span>
                    <span class="detail-value ${statusClass}">${statusText}</span>
                </div>
                <div class="order-detail">
                    <span class="detail-label">Toplam Tutar</span>
                    <span class="detail-value">${App.formatCurrency(order.total)}</span>
                </div>
                <div class="order-detail">
                    <span class="detail-label">Ödeme Yöntemi</span>
                    <span class="detail-value">${order.paymentMethod}</span>
                </div>
            </div>
            
            <div class="order-items">
                <h3 class="items-title">Sipariş Kalemleri</h3>
                ${order.items.map(item => this.getOrderItemHTML(item)).join('')}
            </div>
            
            ${order.note ? `
            <div class="order-note">
                <label class="note-label">Sipariş Notu</label>
                <div class="note-textarea" style="background: var(--bg-secondary); cursor: not-allowed;">${order.note}</div>
            </div>
            ` : ''}
            
            <div class="order-timeline">
                <h3 class="timeline-title">Sipariş Süreci</h3>
                <div class="timeline">
                    ${order.timeline.map((step, index) => this.getTimelineStepHTML(step, index)).join('')}
                </div>
            </div>
        `;
    }

    getOrderItemHTML(item) {
        return `
            <div class="order-item">
                <div class="item-image-small">📷</div>
                <div class="item-details-small">
                    <div class="item-name-small">${item.name}</div>
                    <div class="item-code-small">${item.code}</div>
                    <div class="item-quantity-price">
                        <span class="item-quantity">${item.quantity} adet</span>
                        <span class="item-price-small">${App.formatCurrency(item.price * item.quantity)}</span>
                    </div>
                </div>
            </div>
        `;
    }

    getTimelineStepHTML(step, index) {
        return `
            <div class="timeline-item">
                <div class="timeline-dot"></div>
                <div class="timeline-content">
                    <div class="timeline-date">${step.date}</div>
                    <div class="timeline-status">${step.status}</div>
                </div>
            </div>
        `;
    }

    closeOrderModal() {
        document.getElementById('order-detail-modal').style.display = 'none';
    }
}

// SAYFA YÜKLENDİĞİNDE
document.addEventListener('DOMContentLoaded', function() {
    // Orders manager'ı başlat
    window.ordersManager = new OrdersManager();
    
    console.log('Orders manager başlatıldı');
});