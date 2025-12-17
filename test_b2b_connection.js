const sql = require('mssql');
const config = {
    server: '5.180.186.54',
    database: 'B2B_TRADE_PRO',
    user: 'sa',
    password: 'Logo12345678',
    options: { encrypt: true, trustServerCertificate: true }
};

async function test() {
    try {
        console.log('🔗 B2B_TRADE_PRO test...');
        const pool = await sql.connect(config);
        
        // Database
        const db = await pool.request().query('SELECT DB_NAME() as db');
        console.log('📍 Database:', db.recordset[0].db);
        
        // Tablolar
        const tables = await pool.request().query(`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_TYPE = 'BASE TABLE'
            ORDER BY TABLE_NAME
        `);
        console.log('📋 Tablolar:');
        tables.recordset.forEach(t => console.log('  -', t.TABLE_NAME));
        
        // b2b_default_settings
        const settings = await pool.request().query('SELECT TOP 3 * FROM b2b_default_settings');
        console.log('⚙️  Ayarlar:');
        settings.recordset.forEach(s => console.log(`  ${s.setting_key}: ${s.setting_value}`));
        
        await pool.close();
        console.log('✅ B2B bağlantısı OK');
    } catch (error) {
        console.error('❌ B2B bağlantı hatası:', error.message);
    }
}
test();
