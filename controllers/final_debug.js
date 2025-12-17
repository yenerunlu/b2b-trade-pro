const sql = require('mssql');

async function debug() {
    console.log('🔍 SON DEBUG...');
    
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
    
    try {
        console.log('🔗 Bağlanıyor...');
        const pool = await sql.connect(config);
        
        // 1. Hangi database'deyiz?
        const dbResult = await pool.request().query('SELECT DB_NAME() as db');
        console.log('📍 Database:', dbResult.recordset[0].db);
        
        // 2. Tüm tablolar
        const tables = await pool.request().query(`
            SELECT 
                TABLE_SCHEMA,
                TABLE_NAME,
                TABLE_CATALOG
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_TYPE = 'BASE TABLE'
            ORDER BY TABLE_NAME
        `);
        
        console.log('\n📋 Tüm Tablolar:');
        tables.recordset.forEach(row => {
            console.log(`   ${row.TABLE_SCHEMA}.${row.TABLE_NAME} (${row.TABLE_CATALOG})`);
        });
        
        // 3. b2b_default_settings var mı?
        console.log('\n🔍 b2b_default_settings aranıyor...');
        const found = tables.recordset.filter(t => 
            t.TABLE_NAME.toLowerCase().includes('default')
        );
        
        if (found.length > 0) {
            console.log('✅ Bulundu:');
            found.forEach(t => {
                console.log(`   Schema: ${t.TABLE_SCHEMA}, Tablo: ${t.TABLE_NAME}`);
            });
            
            // Doğrudan sorgu yap
            const query = `SELECT TOP 3 * FROM ${found[0].TABLE_SCHEMA}.${found[0].TABLE_NAME}`;
            console.log('\n🧪 Sorgu:', query);
            
            try {
                const result = await pool.request().query(query);
                console.log(`✅ Sorgu başarılı: ${result.recordset.length} kayıt`);
                result.recordset.forEach(row => {
                    console.log(`   ${row.setting_key}: ${row.setting_value}`);
                });
            } catch (queryError) {
                console.log('❌ Sorgu hatası:', queryError.message);
            }
        } else {
            console.log('❌ b2b_default_settings BULUNAMADI!');
        }
        
        await pool.close();
        
    } catch (error) {
        console.error('💥 HATA:', error.message);
    }
}

debug();
