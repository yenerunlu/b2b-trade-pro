const sql = require('mssql');

const config = {
    server: '5.180.186.54',
    user: 'sa',
    password: 'Logo12345678',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function findLogoTables() {
    try {
        console.log('🔍 LG_013_ITEMS tablosunu arıyorum...\n');
        await sql.connect(config);
        
        // Tüm veritabanlarını listele
        const databases = await sql.query`
            SELECT name 
            FROM sys.databases 
            WHERE name NOT IN ('master', 'tempdb', 'model', 'msdb')
            ORDER BY name
        `;
        
        console.log('📚 Mevcut Veritabanları:');
        for (const db of databases.recordset) {
            console.log(`   📁 ${db.name}`);
            
            // Bu veritabanında LG_013_ITEMS var mı?
            try {
                const tables = await sql.query`
                    USE [${db.name}];
                    SELECT 
                        TABLE_SCHEMA,
                        TABLE_NAME,
                        TABLE_TYPE
                    FROM INFORMATION_SCHEMA.TABLES
                    WHERE TABLE_NAME LIKE '%ITEM%'
                    ORDER BY TABLE_NAME
                `;
                
                if (tables.recordset.length > 0) {
                    console.log(`      📋 Tablolar:`);
                    tables.recordset.forEach(t => {
                        console.log(`         ${t.TABLE_SCHEMA}.${t.TABLE_NAME} (${t.TABLE_TYPE})`);
                    });
                }
            } catch (dbError) {
                console.log(`      ❌ ${db.name} erişilemedi: ${dbError.message}`);
            }
        }
        
        // Mevcut bağlantı bilgilerini göster
        console.log('\n🔗 Mevcut Bağlantı Bilgileri:');
        const info = await sql.query`
            SELECT 
                @@SERVERNAME as ServerName,
                DB_NAME() as CurrentDB,
                USER_NAME() as CurrentUser,
                SUSER_NAME() as LoginName
        `;
        
        console.log(`   Sunucu: ${info.recordset[0].ServerName}`);
        console.log(`   Veritabanı: ${info.recordset[0].CurrentDB}`);
        console.log(`   Kullanıcı: ${info.recordset[0].CurrentUser}`);
        console.log(`   Login: ${info.recordset[0].LoginName}`);
        
    } catch (error) {
        console.error('❌ Hata:', error.message);
    } finally {
        await sql.close();
    }
}

findLogoTables();
