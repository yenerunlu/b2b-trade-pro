const sql = require('mssql');

async function test() {
    try {
        console.log('🔗 B2B_TRADE_PRO bağlanıyor...');
        
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
        
        const pool = await sql.connect(config);
        console.log('✅ Bağlantı başarılı');
        
        // Basit sorgu - tablo sayısını al
        const result = await pool.request().query(`
            SELECT COUNT(*) as table_count 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_TYPE = 'BASE TABLE'
        `);
        
        console.log(`📊 Toplam tablo sayısı: ${result.recordset[0].table_count}`);
        
        // Tablo isimlerini al
        const tables = await pool.request().query(`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_TYPE = 'BASE TABLE'
            ORDER BY TABLE_NAME
        `);
        
        console.log('\n📋 Tablo Listesi:');
        tables.recordset.forEach((row, i) => {
            console.log(`${i+1}. ${row.TABLE_NAME}`);
        });
        
        await pool.close();
        
    } catch (error) {
        console.error('❌ Hata:', error.message);
    }
}

test();
