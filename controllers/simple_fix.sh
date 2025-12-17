#!/bin/bash
# Her zaman yeni connection aç
sed -i '/async getB2BConnection() {/,/^    }/c\
    async getB2BConnection() {\
        try {\
            console.log(\"🔗 B2B_TRADE_PRO bağlanıyor...\");\
            const pool = await sql.connect(this.b2bConfig);\
            console.log(\"✅ B2B bağlantısı başarılı\");\
            return pool;\
        } catch (error) {\
            console.error(\"❌ B2B bağlantı hatası:\", error);\
            throw error;\
        }\
    }
' b2bAdminController.js
