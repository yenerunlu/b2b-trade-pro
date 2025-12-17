const sql = require('mssql');

const logoConfig = {
    server: '5.180.186.54',
    database: 'LOGOGO3',
    user: 'sa',
    password: 'Logo12345678',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function checkActiveItems() {
    try {
        console.log('🔍 Aktif malzemeler kontrol ediliyor...\n');
        
        await sql.connect(logoConfig);
        
        // Aktif malzeme sayısı
        const countResult = await sql.query`
            SELECT 
                COUNT(*) as total_count,
                SUM(CASE WHEN ACTIVE = 0 THEN 1 ELSE 0 END) as active_count,
                SUM(CASE WHEN ACTIVE = 1 THEN 1 ELSE 0 END) as inactive_count
            FROM LG_013_ITEMS
            WHERE CARDTYPE = 12
        `;
        
        const total = countResult.recordset[0].total_count;
        const active = countResult.recordset[0].active_count;
        const inactive = countResult.recordset[0].inactive_count;
        
        console.log('📊 MALZEME DURUMU:');
        console.log(`   Toplam: ${total} malzeme`);
        console.log(`   🔵 Aktif (ACTIVE=0): ${active} malzeme`);
        console.log(`   🔴 Pasif (ACTIVE=1): ${inactive} malzeme`);
        console.log(`   📈 Aktif Oranı: ${((active/total)*100).toFixed(1)}%`);
        
        // Aktif malzemelerden örnekler
        console.log('\n🎯 AKTİF MALZEME ÖRNEKLERİ:');
        const samples = await sql.query`
            SELECT TOP 10 
                LOGICALREF,
                CODE,
                NAME,
                PRODUCERCODE,
                STGRPCODE,
                ACTIVE
            FROM LG_013_ITEMS
            WHERE ACTIVE = 0 AND CARDTYPE = 12
            ORDER BY LOGICALREF
        `;
        
        samples.recordset.forEach((item, index) => {
            console.log(`${index+1}. ${item.CODE} - ${item.NAME.substring(0, 40)}...`);
            console.log(`   OEM: ${item.PRODUCERCODE || 'YOK'}, Üretici: ${item.STGRPCODE}, Ref: ${item.LOGICALREF}`);
        });
        
        // Gruplama için uygun olanlar (OEM kodu olanlar)
        console.log('\n🔧 GRUPLAMA İÇİN UYGUN MALZEMELER:');
        const suitable = await sql.query`
            SELECT 
                COUNT(*) as total_with_oem,
                COUNT(DISTINCT PRODUCERCODE) as unique_oem_count,
                COUNT(DISTINCT STGRPCODE) as unique_manufacturer_count
            FROM LG_013_ITEMS
            WHERE ACTIVE = 0 
              AND CARDTYPE = 12
              AND PRODUCERCODE IS NOT NULL 
              AND LTRIM(RTRIM(PRODUCERCODE)) != ''
        `;
        
        console.log(`   📦 OEM kodu olan aktif malzeme: ${suitable.recordset[0].total_with_oem}`);
        console.log(`   🏷️  Benzersiz OEM kodları: ${suitable.recordset[0].unique_oem_count}`);
        console.log(`   🏭 Benzersiz üreticiler: ${suitable.recordset[0].unique_manufacturer_count}`);
        
        // Gruplama potansiyeli yüksek olanlar (aynı OEM koduna sahip olanlar)
        console.log('\n🎯 GRUPLAMA POTANSİYELİ:');
        const groupPotential = await sql.query`
            SELECT 
                PRODUCERCODE,
                COUNT(*) as item_count,
                STRING_AGG(CODE, ', ') as sample_codes
            FROM LG_013_ITEMS
            WHERE ACTIVE = 0 
              AND CARDTYPE = 12
              AND PRODUCERCODE IS NOT NULL 
              AND LTRIM(RTRIM(PRODUCERCODE)) != ''
              AND LEN(PRODUCERCODE) >= 3
            GROUP BY PRODUCERCODE
            HAVING COUNT(*) > 1
            ORDER BY COUNT(*) DESC
        `;
        
        console.log(`   �� Aynı OEM koduna sahip ${groupPotential.recordset.length} grup potansiyeli`);
        
        if (groupPotential.recordset.length > 0) {
            console.log('\n   📋 EN İYİ 5 GRUP POTANSİYELİ:');
            groupPotential.recordset.slice(0, 5).forEach((group, i) => {
                console.log(`   ${i+1}. OEM: ${group.PRODUCERCODE} - ${group.item_count} malzeme`);
                console.log(`      Örnek: ${group.sample_codes.substring(0, 60)}...`);
            });
        }
        
    } catch (error) {
        console.error('❌ Hata:', error.message);
    } finally {
        await sql.close();
    }
}

checkActiveItems();
