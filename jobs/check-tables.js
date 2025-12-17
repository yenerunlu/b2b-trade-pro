const sql = require('mssql');

const config = {
    server: '5.180.186.54',
    database: 'B2B_TRADE_PRO',
    user: 'sa',
    password: 'Logo12345678',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function checkTables() {
    try {
        console.log('🔌 B2B_TRADE_PRO veritabanına bağlanılıyor...');
        await sql.connect(config);
        
        // Tabloları kontrol et
        const result = await sql.query`
            SELECT 
                TABLE_SCHEMA,
                TABLE_NAME,
                TABLE_TYPE
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_NAME LIKE 'b2b_%'
            ORDER BY TABLE_NAME
        `;
        
        console.log('\n📊 B2B Tabloları:');
        result.recordset.forEach(row => {
            console.log(`   ${row.TABLE_SCHEMA}.${row.TABLE_NAME} (${row.TABLE_TYPE})`);
        });
        
        // B2B_TRADE_PRO'da tablo yoksa, dbo şemasında mı?
        if (result.recordset.length === 0) {
            console.log('\n⚠️ B2B_% tabloları bulunamadı! dbo şemasında mı?');
            
            const dboResult = await sql.query`
                SELECT name FROM sys.tables 
                WHERE name LIKE 'b2b_%'
                ORDER BY name
            `;
            
            console.log('\n🔍 sys.tables kontrolü:');
            dboResult.recordset.forEach(row => {
                console.log(`   ${row.name}`);
            });
        }
        
        // Veritabanı adını kontrol et
        const dbResult = await sql.query`SELECT DB_NAME() as CurrentDB`;
        console.log(`\n📁 Mevcut Veritabanı: ${dbResult.recordset[0].CurrentDB}`);
        
        // Bağlantı detayları
        const configResult = await sql.query`
            SELECT 
                @@SERVERNAME as ServerName,
                DB_NAME() as DatabaseName,
                USER_NAME() as UserName
        `;
        
        console.log('\n🔗 Bağlantı Bilgileri:');
        console.log(`   Sunucu: ${configResult.recordset[0].ServerName}`);
        console.log(`   Veritabanı: ${configResult.recordset[0].DatabaseName}`);
        console.log(`   Kullanıcı: ${configResult.recordset[0].UserName}`);
        
    } catch (error) {
        console.error('❌ Hata:', error.message);
    } finally {
        await sql.close();
    }
}

checkTables();
