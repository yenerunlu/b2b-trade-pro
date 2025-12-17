// Profil yönetimi modülü
class ProfilePage {
    static init() {
        this.setupEventListeners();
        this.setupTabs();
        this.loadProfileData();
    }

    static setupEventListeners() {
        // Profil formu
        const profileForm = document.getElementById('profile-form');
        if (profileForm) {
            profileForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveProfile();
            });
        }

        // Adres ekleme butonu
        const addAddressBtn = document.getElementById('add-address-btn');
        if (addAddressBtn) {
            addAddressBtn.addEventListener('click', () => {
                this.addNewAddress();
            });
        }

        // Adres kartları
        this.setupAddressCards();

        // Switch butonları
        this.setupSwitches();
    }

    static setupTabs() {
        const tabButtons = document.querySelectorAll('.tab-button');
        const tabContents = document.querySelectorAll('.tab-content');

        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const tabId = button.getAttribute('data-tab');
                
                // Tüm tab butonlarını ve içeriklerini deaktif et
                tabButtons.forEach(btn => btn.classList.remove('active'));
                tabContents.forEach(content => content.classList.remove('active'));
                
                // Seçilen tab'ı aktif et
                button.classList.add('active');
                document.getElementById(`${tabId}-tab`).classList.add('active');
            });
        });
    }

    static setupAddressCards() {
        const addressCards = document.querySelectorAll('.address-card');
        
        addressCards.forEach(card => {
            card.addEventListener('click', (e) => {
                // Silme veya düzenleme butonuna tıklanmadıysa
                if (!e.target.closest('.address-actions')) {
                    this.selectAddress(card);
                }
            });

            // Düzenleme butonları
            const editBtn = card.querySelector('.btn-secondary');
            if (editBtn) {
                editBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.editAddress(card);
                });
            }

            // Silme butonları
            const deleteBtn = card.querySelector('.btn-danger');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.deleteAddress(card);
                });
            }
        });
    }

    static setupSwitches() {
        const switches = document.querySelectorAll('.switch input');
        
        switches.forEach(switchInput => {
            switchInput.addEventListener('change', (e) => {
                const setting = e.target.closest('.notification-item') || e.target.closest('.security-item');
                if (setting) {
                    this.saveNotificationSetting(setting, e.target.checked);
                }
            });
        });
    }

    static loadProfileData() {
        // Profil verilerini localStorage'dan veya API'den yükle
        const profileData = AppUtils.getStorage('profileData') || {
            name: 'Ahmet Yılmaz',
            email: 'ahmet.yilmaz@firma.com',
            phone: '+90 532 123 45 67',
            company: 'Yılmaz Otomotiv Ltd. Şti.',
            taxOffice: 'İstanbul Vergi Dairesi',
            taxNumber: '1234567890'
        };

        // Form alanlarını doldur
        this.populateForm(profileData);
    }

    static populateForm(data) {
        const form = document.getElementById('profile-form');
        if (!form) return;

        const fields = {
            'input[type="text"]:nth-of-type(1)': data.name.split(' ')[0], // Ad
            'input[type="text"]:nth-of-type(2)': data.name.split(' ')[1], // Soyad
            'input[type="email"]': data.email,
            'input[type="tel"]': data.phone,
            'input[type="text"]:nth-of-type(3)': data.company,
            'input[type="text"]:nth-of-type(4)': data.taxOffice,
            'input[type="text"]:nth-of-type(5)': data.taxNumber
        };

        Object.entries(fields).forEach(([selector, value]) => {
            const input = form.querySelector(selector);
            if (input && value) {
                input.value = value;
            }
        });
    }

    static saveProfile() {
        const form = document.getElementById('profile-form');
        if (!form) return;

        const formData = new FormData(form);
        const profileData = {
            name: `${formData.get('input[type="text"]:nth-of-type(1)')} ${formData.get('input[type="text"]:nth-of-type(2)')}`,
            email: formData.get('input[type="email"]'),
            phone: formData.get('input[type="tel"]'),
            company: formData.get('input[type="text"]:nth-of-type(3)'),
            taxOffice: formData.get('input[type="text"]:nth-of-type(4)'),
            taxNumber: formData.get('input[type="text"]:nth-of-type(5)')
        };

        // localStorage'a kaydet (gerçek uygulamada API'ye gönder)
        AppUtils.setStorage('profileData', profileData);

        AppUtils.showNotification('Profil bilgileriniz başarıyla güncellendi!', 'success');
        
        // Profil kartını güncelle
        this.updateProfileCard(profileData);
    }

    static updateProfileCard(data) {
        const profileName = document.querySelector('.profile-name');
        const userNames = document.querySelectorAll('.user-name');
        
        if (profileName) {
            profileName.textContent = data.name;
        }
        
        userNames.forEach(element => {
            element.textContent = data.name;
        });
    }

    static selectAddress(card) {
        // Tüm adres kartlarındaki seçimi kaldır
        document.querySelectorAll('.address-card').forEach(addrCard => {
            addrCard.classList.remove('selected');
        });
        
        // Seçili adresi işaretle
        card.classList.add('selected');
        
        AppUtils.showNotification('Varsayılan adres olarak ayarlandı!', 'success');
    }

    static editAddress(card) {
        const addressTitle = card.querySelector('.address-title').textContent;
        AppUtils.showNotification(`${addressTitle} adresi düzenleniyor...`, 'info');
        
        // Burada modal açılabilir veya düzenleme formu gösterilebilir
        console.log('Adres düzenleme:', addressTitle);
    }

    static deleteAddress(card) {
        const addressTitle = card.querySelector('.address-title').textContent;
        
        if (confirm(`${addressTitle} adresini silmek istediğinizden emin misiniz?`)) {
            card.style.opacity = '0.5';
            card.style.pointerEvents = 'none';
            
            setTimeout(() => {
                card.remove();
                AppUtils.showNotification('Adres başarıyla silindi!', 'success');
            }, 500);
        }
    }

    static addNewAddress() {
        AppUtils.showNotification('Yeni adres ekleme formu açılıyor...', 'info');
        
        // Burada yeni adres ekleme modal'ı açılabilir
        console.log('Yeni adres ekleme');
        
        // Örnek yeni adres ekleme
        setTimeout(() => {
            const newAddress = {
                title: 'Yeni Depo',
                type: 'Teslimat Adresi',
                details: `Yeni Depo Adresi\nDemo Sokak No:10\nİstanbul\nTel: +90 212 999 88 77`
            };
            
            this.createAddressCard(newAddress);
        }, 1000);
    }

    static createAddressCard(addressData) {
        const addressList = document.querySelector('.address-list');
        if (!addressList) return;

        const addressCard = document.createElement('div');
        addressCard.className = 'address-card';
        addressCard.innerHTML = `
            <div class="address-header">
                <div>
                    <div class="address-title">${addressData.title}</div>
                    <span class="address-type">${addressData.type}</span>
                </div>
                <div class="address-actions">
                    <button class="btn btn-secondary btn-small">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-danger btn-small">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="address-details">${addressData.details}</div>
        `;

        addressList.appendChild(addressCard);
        this.setupAddressCards(); // Yeni kart için event listener'ları tekrar kur
        AppUtils.showNotification('Yeni adres başarıyla eklendi!', 'success');
    }

    static saveNotificationSetting(settingElement, isEnabled) {
        const title = settingElement.querySelector('.notification-title, .security-title');
        const settingName = title ? title.textContent : 'Bilinmeyen Ayar';
        
        console.log(`${settingName} ${isEnabled ? 'aktif' : 'pasif'} edildi`);
        
        // Burada ayar localStorage'a veya API'ye kaydedilebilir
        const settings = AppUtils.getStorage('notificationSettings') || {};
        settings[settingName] = isEnabled;
        AppUtils.setStorage('notificationSettings', settings);
        
        AppUtils.showNotification(
            `${settingName} ${isEnabled ? 'aktif' : 'pasif'} edildi!`,
            isEnabled ? 'success' : 'info'
        );
    }

    static changePassword() {
        // Şifre değiştirme işlemleri
        AppUtils.showNotification('Şifre değiştirme formu açılıyor...', 'info');
        console.log('Şifre değiştirme işlemi');
    }

    static manageSessions() {
        // Oturum yönetimi
        AppUtils.showNotification('Oturum yönetimi sayfası açılıyor...', 'info');
        console.log('Oturum yönetimi');
    }
}