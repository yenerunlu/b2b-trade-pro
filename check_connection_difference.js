const sql = require('mssql');

async function check() {
    console.log('🔍 Bağlantı farkını kontrol et...');
    
    // b2bAdminController.js'deki config
    const b2bConfig = {
        server: '5.180.186.54',
        database: 'B2B_TRADE_PRO',
        user: 'sa',
        password: 'Logo12345678',
        options: {
            encrypt: true,
            trustServerCertificate: true
        }
    };
    
    // debug script'teki gibi bağlan
    try {
        console.log('1. b2bAdminController config ile bağlanıyor...');
        const pool1 = await sql.connect(b2bConfig);
        const db1 = await pool1.request().query('SELECT DB_NAME() as db');
        console.log(`   Database: ${db1.recordset[0].db}`);
        
        // Tabloları kontrol et
        const tables1 = await pool1.request().query(`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_TYPE = 'BASE TABLE'
            AND TABLE_NAME LIKE '%default%'
        `);
        console.log(`   default tabloları: ${tables1.recordset.map(t => t.TABLE_NAME).join(', ')}`);
        
        await pool1.close();
        
    } catch (error) {
        console.log(`   ❌ Hata: ${error.message}`);
    }
    
    // Alternatif config dene
    console.log('\n2. Alternatif config (master database)...');
    const altConfig = {
        server: '5.180.186.54',
        database: 'master',  // Master database
        user: 'sa',
        password: 'Logo12345678',
        options: {
            encrypt: true,
            trustServerCertificate: true
        }
    };
    
    try {
        const pool2 = await sql.connect(altConfig);
        const db2 = await pool2.request().query('SELECT DB_NAME() as db');
        console.log(`   Database: ${db2.recordset[0].db}`);
        
        // Tüm database'leri listele
        const dbs = await pool2.request().query(`
            SELECT name 
            FROM sys.databases 
            WHERE name LIKE '%B2B%' OR name LIKE '%TRADE%'
            ORDER BY name
        `);
        
        console.log('   İlgili database\'ler:');
        dbs.recordset.forEach(row => {
            console.log(`     - ${row.name}`);
        });
        
        await pool2.close();
        
    } catch (error) {
        console.log(`   ❌ Hata: ${error.message}`);
    }
}

check();
