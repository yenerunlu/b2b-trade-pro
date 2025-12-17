const sql = require('mssql');

const config = {
    server: '5.180.186.54',
    database: 'LOGOGO3',
    user: 'sa',
    password: 'Logo12345678',
    options: { encrypt: true, trustServerCertificate: true }
};

async function findAdmins() {
    try {
        console.log('🔍 Logo GO3\'te admin kullanıcıları aranıyor...');
        const pool = await sql.connect(config);
        
        // Logo'da kullanıcı tablosunu bulmaya çalış
        const tables = await pool.request().query(`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_NAME LIKE '%USER%' 
               OR TABLE_NAME LIKE '%KULLANICI%'
               OR TABLE_NAME LIKE '%USERS%'
            ORDER BY TABLE_NAME
        `);
        
        console.log('📋 Bulunan tablolar:');
        tables.recordset.forEach(t => console.log('  -', t.TABLE_NAME));
        
        // LG_006_USERS (Logo'nun standart kullanıcı tablosu)
        try {
            const users = await pool.request().query(`
                SELECT TOP 10 CODE, DEFINITION_, ISADMIN, ACTIVE
                FROM LG_006_USERS 
                ORDER BY CODE
            `);
            console.log('\n👥 LG_006_USERS tablosundaki kullanıcılar:');
            users.recordset.forEach(u => {
                console.log(\`  \${u.CODE}: \${u.DEFINITION_} - Admin: \${u.ISADMIN || 0} - Aktif: \${u.ACTIVE || 0}\`);
            });
        } catch (e) {
            console.log('LG_006_USERS tablosu bulunamadı');
        }
        
        // Başka bir olası tablo
        try {
            const users2 = await pool.request().query(`
                SELECT TOP 10 USRNAME, PASSWORD, ISADMIN, ACTIVE
                FROM USERS 
                ORDER BY USRNAME
            `);
            console.log('\n👥 USERS tablosundaki kullanıcılar:');
            users2.recordset.forEach(u => {
                console.log(\`  \${u.USRNAME}: Admin: \${u.ISADMIN || 0} - Aktif: \${u.ACTIVE || 0}\`);
            });
        } catch (e) {
            console.log('USERS tablosu bulunamadı');
        }
        
        await pool.close();
        
    } catch (error) {
        console.error('❌ Hata:', error.message);
    }
}

findAdmins();
