const sql = require('mssql');

// Debug script'te çalışan EXACT config
const WORKING_CONFIG = {
    server: '5.180.186.54',
    database: 'B2B_TRADE_PRO',
    user: 'sa',
    password: 'Logo12345678',
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
};

async function testWorkingConfig() {
    console.log('🔗 DEBUG config ile test...');
    try {
        const pool = await sql.connect(WORKING_CONFIG);
        console.log('✅ Bağlantı başarılı');
        
        // 1. Database
        const db = await pool.request().query('SELECT DB_NAME() as db');
        console.log('📍 Database:', db.recordset[0].db);
        
        // 2. Tablolar
        const tables = await pool.request().query(`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_TYPE = 'BASE TABLE'
            AND TABLE_NAME LIKE '%default%'
        `);
        console.log('📋 Tablolar:', tables.recordset.map(t => t.TABLE_NAME).join(', '));
        
        // 3. Sorgu
        const result = await pool.request().query('SELECT TOP 1 * FROM b2b_default_settings');
        console.log('✅ Sorgu başarılı, kayıt:', result.recordset[0]?.setting_key);
        
        await pool.close();
        return true;
    } catch (error) {
        console.error('❌ Hata:', error.message);
        return false;
    }
}

// b2bAdminController.js'deki config ile test
async function testB2BControllerConfig() {
    console.log('\n🔗 b2bAdminController config ile test...');
    
    // b2bAdminController.js'den config'i al (kopyala)
    const B2B_CONTROLLER_CONFIG = {
        server: '5.180.186.54',
        database: 'B2B_TRADE_PRO',
        user: 'sa',
        password: 'Logo12345678',
        options: {
            encrypt: true,
            trustServerCertificate: true
        }
    };
    
    console.log('Config:', JSON.stringify(B2B_CONTROLLER_CONFIG));
    
    try {
        const pool = await sql.connect(B2B_CONTROLLER_CONFIG);
        console.log('✅ Bağlantı başarılı');
        
        const db = await pool.request().query('SELECT DB_NAME() as db');
        console.log('📍 Database:', db.recordset[0].db);
        
        await pool.close();
        return true;
    } catch (error) {
        console.error('❌ Hata:', error.message);
        return false;
    }
}

async function run() {
    console.log('🚨 ACİL DEBUG BAŞLIYOR...\n');
    
    const debugWorks = await testWorkingConfig();
    console.log('\n' + '='*50 + '\n');
    const controllerWorks = await testB2BControllerConfig();
    
    console.log('\n' + '='*50);
    console.log('📊 SONUÇ:');
    console.log(`Debug Config: ${debugWorks ? '✅ ÇALIŞIYOR' : '❌ ÇALIŞMIYOR'}`);
    console.log(`Controller Config: ${controllerWorks ? '✅ ÇALIŞIYOR' : '❌ ÇALIŞMIYOR'}`);
    
    if (debugWorks && !controllerWorks) {
        console.log('\n⚠️  PROBLEM: AYNI CONFIG AMA FARKLI SONUÇ!');
        console.log('Neden:');
        console.log('1. Process cache problemi');
        console.log('2. Connection pool state problemi');
        console.log('3. Node.js module cache problemi');
        
        console.log('\n🎯 ACİL ÇÖZÜM:');
        console.log('1. b2bAdminController.js config\'ini DEBUG config ile DEĞİŞTİR');
        console.log('2. Server\'ı COMPLETELY restart et:');
        console.log('   pm2 delete b2b-trade-pro');
        console.log('   pm2 start server.js --name b2b-trade-pro');
    }
}

run();
