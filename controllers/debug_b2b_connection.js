const sql = require('mssql');

async function debug() {
    try {
        console.log('🐛 DEBUG: B2B Bağlantı Problemi');
        
        // b2bAdminController.js'deki config
        const config = {
            server: '5.180.186.54',
            database: 'B2B_TRADE_PRO',
            user: 'sa',
            password: 'Logo12345678',
            options: {
                encrypt: true,
                trustServerCertificate: true
            }
        };
        
        console.log('📋 Kullanılan Config:');
        console.log('   Server:', config.server);
        console.log('   Database:', config.database);
        console.log('   User:', config.user);
        
        console.log('\n🔗 Bağlanıyor...');
        const pool = await sql.connect(config);
        console.log('✅ Bağlantı başarılı');
        
        // 1. Hangi database'deyiz?
        const dbResult = await pool.request().query('SELECT DB_NAME() as current_db');
        console.log('📍 Mevcut Database:', dbResult.recordset[0].current_db);
        
        // 2. Tabloları kontrol et (tam isimle)
        const tablesResult = await pool.request().query(`
            SELECT 
                TABLE_SCHEMA,
                TABLE_NAME,
                TABLE_CATALOG
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_TYPE = 'BASE TABLE'
            AND TABLE_NAME LIKE '%default%'
            ORDER BY TABLE_NAME
        `);
        
        console.log('\n🔍 default içeren tablolar:');
        tablesResult.recordset.forEach(row => {
            console.log(`   Schema: ${row.TABLE_SCHEMA}, Tablo: ${row.TABLE_NAME}, DB: ${row.TABLE_CATALOG}`);
        });
        
        // 3. Doğrudan sorgu yap
        console.log('\n🧪 Doğrudan sorgu deneyelim:');
        try {
            const directQuery = await pool.request().query('SELECT TOP 1 setting_key FROM b2b_default_settings');
            console.log('✅ Doğrudan sorgu BAŞARILI');
            console.log('   İlk ayar:', directQuery.recordset[0]?.setting_key);
        } catch (directError) {
            console.log('❌ Doğrudan sorgu HATASI:', directError.message);
            
            // Schema ile dene
            console.log('\n🔧 Schema ile deneyelim...');
            try {
                const withSchema = await pool.request().query('SELECT TOP 1 setting_key FROM dbo.b2b_default_settings');
                console.log('✅ dbo.b2b_default_settings BAŞARILI');
            } catch (schemaError) {
                console.log('❌ Schema ile de hata:', schemaError.message);
            }
        }
        
        await pool.close();
        console.log('\n🎯 DEBUG tamamlandı');
        
    } catch (error) {
        console.error('❌ DEBUG hatası:', error.message);
        console.error('Stack:', error.stack);
    }
}

debug();
