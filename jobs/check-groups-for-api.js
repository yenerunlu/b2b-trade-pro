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

async function checkGroupsForAPI() {
    try {
        console.log('🔍 API İÇİN GRUP VERİLERİ KONTROLÜ\n');
        
        await sql.connect(config);
        
        // 1. API'nin arayacağı formatı kontrol et
        console.log('1. 📊 Gruplama İstatistikleri:');
        const stats = await sql.query`
            SELECT 
                COUNT(*) as total_groups,
                SUM(item_count) as total_members,
                SUM(CASE WHEN item_count > 1 THEN 1 ELSE 0 END) as multi_item_groups,
                AVG(item_count) as avg_size
            FROM b2b_item_groups 
            WHERE is_active = 1
        `;
        
        const s = stats.recordset[0];
        console.log(`   🏷️  Toplam Grup: ${s.total_groups}`);
        console.log(`   👥 Toplam Üye: ${s.total_members}`);
        console.log(`   🤝 Çoklu Üyeli Grup: ${s.multi_item_groups}`);
        console.log(`   📈 Ortalama: ${s.avg_size?.toFixed(2) || 0}`);
        
        // 2. Örnek gruplar (API testi için)
        console.log('\n2. 🧪 API Testi için Örnek Gruplar:');
        const sampleGroups = await sql.query`
            SELECT TOP 10 
                g.group_id,
                g.hash_key as oem_code,
                g.item_count,
                g.char_index,
                g.sample_item_code,
                STRING_AGG(m.item_code, ', ') as member_codes
            FROM b2b_item_groups g
            LEFT JOIN b2b_group_members m ON g.group_id = m.group_id
            WHERE g.is_active = 1
            GROUP BY g.group_id, g.hash_key, g.item_count, g.char_index, g.sample_item_code
            ORDER BY g.item_count DESC, g.created_at DESC
        `;
        
        console.log('   Aşağıdaki terimlerle API testi yapabilirsiniz:\n');
        
        sampleGroups.recordset.forEach((group, i) => {
            console.log(`${i+1}. 🔍 "${group.char_index?.substring(0, 30) || group.oem_code}"`);
            console.log(`   Grup ID: ${group.group_id}`);
            console.log(`   OEM Kodu: ${group.oem_code || 'YOK'}`);
            console.log(`   Üye Sayısı: ${group.item_count}`);
            console.log(`   Örnek Malzeme: ${group.sample_item_code}`);
            
            if (group.member_codes) {
                const codes = group.member_codes.split(', ').slice(0, 3);
                console.log(`   Üyeler: ${codes.join(', ')}${group.item_count > 3 ? '...' : ''}`);
            }
            console.log('');
        });
        
        // 3. Smart Search için özel test senaryoları
        console.log('3. 🎯 SMART SEARCH TEST SENARYOLARI:');
        
        // a) Tam malzeme kodu
        console.log('\n   a) Tam Malzeme Kodu:');
        const exactMatch = await sql.query`
            SELECT TOP 3 
                m.item_code,
                g.group_id,
                g.item_count
            FROM b2b_group_members m
            INNER JOIN b2b_item_groups g ON m.group_id = g.group_id
            WHERE m.item_code LIKE '%2215%'
            ORDER BY g.item_count DESC
        `;
        
        if (exactMatch.recordset.length > 0) {
            exactMatch.recordset.forEach(row => {
                console.log(`      - "${row.item_code}" → ${row.group_id} (${row.item_count} üye)`);
            });
        }
        
        // b) OEM kodu
        console.log('\n   b) OEM Kodu:');
        const oemTest = await sql.query`
            SELECT DISTINCT TOP 3 
                g.hash_key as oem_code,
                g.group_id,
                g.item_count
            FROM b2b_item_groups g
            WHERE g.hash_key LIKE '1213%'
            ORDER BY g.item_count DESC
        `;
        
        if (oemTest.recordset.length > 0) {
            oemTest.recordset.forEach(row => {
                console.log(`      - "${row.oem_code}" → ${row.group_id} (${row.row_count || row.item_count} üye)`);
            });
        }
        
        // c) Karakter arama
        console.log('\n   c) Karakter Arama:');
        const charTest = await sql.query`
            SELECT TOP 3 
                g.char_index,
                g.group_id,
                g.item_count
            FROM b2b_item_groups g
            WHERE g.char_index LIKE '%BOBIN%'
               OR g.char_index LIKE '%BOSCH%'
            ORDER BY g.item_count DESC
        `;
        
        if (charTest.recordset.length > 0) {
            charTest.recordset.forEach(row => {
                console.log(`      - "${row.char_index.substring(0, 30)}..." → ${row.group_id} (${row.item_count} üye)`);
            });
        }
        
        console.log('\n✅ API testleri için hazır! Yukarıdaki terimlerle smart search testi yapın.');
        
    } catch (error) {
        console.error('❌ Hata:', error.message);
    } finally {
        await sql.close();
    }
}

checkGroupsForAPI();
