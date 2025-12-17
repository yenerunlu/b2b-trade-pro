#!/bin/bash
# Pool'u her seferinde yeni oluştur
sed -i '/async getB2BConnection() {/,/^    }/c\
    async getB2BConnection() {\
        try {\
            console.log(\"🔗 B2B bağlantısı yeniden oluşturuluyor...\");\
            console.log(\"📋 Config:\", JSON.stringify(this.b2bConfig));\
            \
            // Her seferinde yeni pool oluştur\
            if (this.b2bPool) {\
                try {\
                    await this.b2bPool.close();\
                    console.log(\"♻️  Eski pool kapatıldı\");\
                } catch (closeError) {\
                    console.log(\"⚠️  Pool kapatma hatası:\", closeError.message);\
                }\
                this.b2bPool = null;\
            }\
            \
            this.b2bPool = await sql.connect(this.b2bConfig);\
            console.log(\"✅ Yeni B2B pool oluşturuldu\");\
            \
            // Hangi database\'de olduğumuzu kontrol et\
            const dbResult = await this.b2bPool.request().query(\"SELECT DB_NAME() as db\");\
            console.log(\"📍 Mevcut Database:\", dbResult.recordset[0].db);\
            \
            return this.b2bPool;\
        } catch (error) {\
            console.error(\"❌ B2B veritabanı bağlantı hatası:\", error.message);\
            console.error(\"Config:\", this.b2bConfig);\
            throw error;\
        }\
    }
' b2bAdminController.js
