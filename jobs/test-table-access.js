const sql = require('mssql');

const config = {
    server: '5.180.186.54',
    database: 'LOGOGO3',
    user: 'sa',
    password: 'Logo12345678',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function testAccess() {
    try {
        console.log('🔍 Tablo erişimi test ediliyor...\n');
        
        await sql.connect(config);
        
        // 1. Veritabanı adını kontrol et
        const dbName = await sql.query`SELECT DB_NAME() as db_name`;
        console.log(`📁 Bağlı olduğumuz veritabanı: ${dbName.recordset[0].db_name}`);
        
        // 2. Tablo var mı?
        console.log('\n📋 Tablo kontrolü:');
        try {
            const tableExists = await sql.query`
                SELECT COUNT(*) as table_count 
                FROM INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'LG_013_ITEMS'
            `;
            console.log(`   LG_013_ITEMS tablosu var mı? ${tableExists.recordset[0].table_count > 0 ? '✅ EVET' : '❌ HAYIR'}`);
        } catch (error) {
            console.log(`   ❌ Tablo kontrol hatası: ${error.message}`);
        }
        
        // 3. Basit SELECT deneyelim
        console.log('\n🔍 Basit SELECT testi:');
        try {
            const simpleSelect = await sql.query`SELECT TOP 1 LOGICALREF FROM LG_013_ITEMS`;
            console.log(`   ✅ Basit SELECT çalıştı: ${simpleSelect.recordset.length} kayıt`);
        } catch (error) {
            console.log(`   ❌ SELECT hatası: ${error.message}`);
        }
        
        // 4. WHERE koşulu ile deneyelim
        console.log('\n🔍 WHERE koşulu testi:');
        try {
            const whereSelect = await sql.query`
                SELECT TOP 1 LOGICALREF, CODE, NAME 
                FROM LG_013_ITEMS 
                WHERE ACTIVE = 0
            `;
            console.log(`   ✅ WHERE ile SELECT çalıştı: ${whereSelect.recordset.length} kayıt`);
            if (whereSelect.recordset.length > 0) {
                console.log(`      Örnek: ${whereSelect.recordset[0].CODE} - ${whereSelect.recordset[0].NAME}`);
            }
        } catch (error) {
            console.log(`   ❌ WHERE hatası: ${error.message}`);
        }
        
        // 5. TOP ile deneyelim
        console.log('\n🔍 TOP ile test:');
        try {
            const topSelect = await sql.query`
                SELECT TOP 10 LOGICALREF, CODE, NAME 
                FROM dbo.LG_013_ITEMS 
                WHERE ACTIVE = 0 AND CARDTYPE = 12
            `;
            console.log(`   ✅ TOP ile SELECT çalıştı: ${topSelect.recordset.length} kayıt`);
        } catch (error) {
            console.log(`   ❌ TOP hatası: ${error.message}`);
        }
        
        // 6. Farklı bir sorgu deneyelim - belki CARDTYPE farklıdır
        console.log('\n🔍 CARDTYPE kontrolü:');
        try {
            const cardTypes = await sql.query`
                SELECT DISTINCT CARDTYPE, COUNT(*) as count
                FROM LG_013_ITEMS
                GROUP BY CARDTYPE
                ORDER BY CARDTYPE
            `;
            console.log(`   ✅ CARDTYPE dağılımı:`);
            cardTypes.recordset.forEach(row => {
                console.log(`      CARDTYPE ${row.CARDTYPE}: ${row.count} kayıt`);
            });
        } catch (error) {
            console.log(`   ❌ CARDTYPE hatası: ${error.message}`);
        }
        
        // 7. Sadece SELECT COUNT deneyelim
        console.log('\n🔍 COUNT testi:');
        try {
            const countAll = await sql.query`SELECT COUNT(*) as total FROM LG_013_ITEMS`;
            console.log(`   ✅ Toplam kayıt: ${countAll.recordset[0].total}`);
        } catch (error) {
            console.log(`   ❌ COUNT hatası: ${error.message}`);
        }
        
    } catch (error) {
        console.error('\n❌ Genel hata:', error.message);
        console.error('SQL State:', error.code);
        console.error('Procedure:', error.procName || 'N/A');
    } finally {
        await sql.close();
    }
}

testAccess();
