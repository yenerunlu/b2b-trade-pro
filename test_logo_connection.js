const sql = require('mssql');
const config = {
    server: '5.180.186.54',
    database: 'LOGOGO3',
    user: 'sa',
    password: 'Logo12345678',
    options: { encrypt: true, trustServerCertificate: true }
};

async function test() {
    try {
        console.log('🔗 Logo GO3 test...');
        const pool = await sql.connect(config);
        const result = await pool.request().query('SELECT TOP 1 CODE FROM LG_013_ITEMS');
        console.log('✅ Logo bağlantısı OK. Ürün:', result.recordset[0]?.CODE);
        await pool.close();
    } catch (error) {
        console.error('❌ Logo bağlantı hatası:', error.message);
    }
}
test();
