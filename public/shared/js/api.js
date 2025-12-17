// public/shared/js/api.js
class B2BApi {
    constructor() {
        this.baseURL = B2BConfig.api.baseURL;
        this.timeout = B2BConfig.api.timeout || 30000;
        this.retryAttempts = B2BConfig.api.retryAttempts || 3;
        this.token = localStorage.getItem(B2BConfig.storage.token);
    }

    // Headers oluşturma
    getHeaders(contentType = 'application/json') {
        const headers = {
            'Content-Type': contentType
        };

        // Token varsa header'a ekle
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        return headers;
    }

    // Request wrapper
    async request(endpointKey, options = {}) {
        const url = B2BConfig.getApiUrl(endpointKey);
        
        if (!url) {
            throw new Error(`Invalid endpoint: ${endpointKey}`);
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const config = {
            ...options,
            headers: this.getHeaders(options.contentType),
            signal: controller.signal
        };

        try {
            const response = await fetch(url, config);
            clearTimeout(timeoutId);

            // Token expired veya unauthorized
            if (response.status === 401) {
                await this.handleUnauthorized();
                // Retry with new token
                return this.request(endpointKey, options);
            }

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();

        } catch (error) {
            clearTimeout(timeoutId);
            
            if (error.name === 'AbortError') {
                throw new Error('Request timeout');
            }
            
            throw error;
        }
    }

    // Unauthorized handling
    async handleUnauthorized() {
        try {
            const refreshToken = localStorage.getItem('b2b_refresh_token');
            if (!refreshToken) {
                this.redirectToLogin();
                return;
            }

            const response = await fetch(B2BConfig.getApiUrl('auth.refresh'), {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({ refreshToken })
            });

            if (response.ok) {
                const data = await response.json();
                this.setToken(data.accessToken);
                localStorage.setItem('b2b_refresh_token', data.refreshToken);
            } else {
                this.redirectToLogin();
            }
        } catch (error) {
            this.redirectToLogin();
        }
    }

    // Login redirect
    redirectToLogin() {
        localStorage.clear();
        window.location.href = '/login.html';
    }

    // Token management
    setToken(token) {
        this.token = token;
        localStorage.setItem(B2BConfig.storage.token, token);
    }

    removeToken() {
        this.token = null;
        localStorage.removeItem(B2BConfig.storage.token);
        localStorage.removeItem('b2b_refresh_token');
    }

    // HTTP Methods
    async get(endpointKey, params = {}) {
        const queryString = new URLSearchParams(params).toString();
        const url = B2BConfig.getApiUrl(endpointKey);
        const urlWithParams = queryString ? `${url}?${queryString}` : url;
        
        return this.request(urlWithParams, {
            method: 'GET'
        });
    }

    async post(endpointKey, data = {}) {
        return this.request(endpointKey, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    async put(endpointKey, data = {}) {
        return this.request(endpointKey, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }

    async patch(endpointKey, data = {}) {
        return this.request(endpointKey, {
            method: 'PATCH',
            body: JSON.stringify(data)
        });
    }

    async delete(endpointKey) {
        return this.request(endpointKey, {
            method: 'DELETE'
        });
    }

    // File upload
    async upload(endpointKey, formData) {
        return this.request(endpointKey, {
            method: 'POST',
            body: formData,
            contentType: null // Let browser set Content-Type
        });
    }

    // 🔥 DÜZELTİLMİŞ LOGIN METODU
    async login(credentials) {
        try {
            // ⚠️ DÜZELTME: Doğrudan fetch kullan, this.post() DEĞİL!
            const response = await fetch(`${this.baseURL}/api/auth/login`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify(credentials)
            });

            const data = await response.json();
            
            if (data.success && data.data) {
                // Token'ı kaydet (API response formatına göre)
                const token = data.data.accessToken || data.data.token || data.token;
                if (token) {
                    this.setToken(token);
                }
                
                // User data'yı kaydet
                localStorage.setItem(B2BConfig.storage.userData, JSON.stringify(data.data.user || data.data));
                localStorage.setItem(B2BConfig.storage.userType, data.data.user?.type || data.redirect);
                
                // Refresh token varsa kaydet
                if (data.data.refreshToken) {
                    localStorage.setItem('b2b_refresh_token', data.data.refreshToken);
                }
                
                console.log('Login successful:', data);
            }
            
            return data;
            
        } catch (error) {
            console.error('Login error:', error);
            throw new Error('Login request failed: ' + error.message);
        }
    }

    async logout() {
        try {
            await this.post('auth.logout');
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            this.removeToken();
            localStorage.removeItem(B2BConfig.storage.userData);
            localStorage.removeItem(B2BConfig.storage.userType);
            this.redirectToLogin();
        }
    }

    // User Methods
    async getCurrentUser() {
        const userData = localStorage.getItem(B2BConfig.storage.userData);
        return userData ? JSON.parse(userData) : null;
    }

    async updateProfile(userData) {
        const userType = localStorage.getItem(B2BConfig.storage.userType);
        let endpoint;
        
        switch (userType) {
            case 'admin':
                endpoint = 'admin.users';
                break;
            case 'sales':
                endpoint = 'sales.profile';
                break;
            case 'customer':
                endpoint = 'customer.profile';
                break;
            default:
                throw new Error('Invalid user type');
        }

        return this.put(endpoint, userData);
    }

    // Dashboard Methods
    async getDashboardData(userType) {
        switch (userType) {
            case 'admin':
                return this.get('admin.dashboard');
            case 'sales':
                return this.get('sales.dashboard');
            case 'customer':
                return this.get('customer.dashboard');
            default:
                throw new Error('Invalid user type for dashboard');
        }
    }

    // Utility Methods
    async checkAuth() {
        if (!this.token) {
            this.redirectToLogin();
            return false;
        }

        try {
            const user = await this.getCurrentUser();
            return !!user;
        } catch (error) {
            this.redirectToLogin();
            return false;
        }
    }

    // Batch requests
    async batch(requests) {
        const results = [];
        
        for (const request of requests) {
            try {
                const result = await this.request(request.endpoint, request.options);
                results.push({ success: true, data: result });
            } catch (error) {
                results.push({ success: false, error: error.message });
            }
        }
        
        return results;
    }

    // Health check
    async healthCheck() {
        try {
            const response = await fetch(`${this.baseURL}/health`, {
                method: 'GET',
                headers: this.getHeaders()
            });
            return response.ok;
        } catch (error) {
            return false;
        }
    }
}

// Global instance oluştur
const b2bApi = new B2BApi();

// Global erişim için
window.b2bApi = b2bApi;
window.B2BApi = B2BApi;

console.log('B2B API initialized');

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { B2BApi, b2bApi };
}