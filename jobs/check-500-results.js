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

async function check500Results() {
    try {
        console.log('🔍 500 Kayıt Sonuçları Kontrolü...\n');
        
        await sql.connect(config);
        
        // İstatistikler
        const stats = await sql.query`
            SELECT 
                COUNT(*) as total_groups,
                SUM(item_count) as total_members,
                AVG(item_count) as avg_group_size,
                MAX(item_count) as max_group_size
            FROM b2b_item_groups 
            WHERE is_active = 1
        `;
        
        const s = stats.recordset[0];
        console.log('📊 GRUP İSTATİSTİKLERİ:');
        console.log(`   🏷️  Toplam Grup: ${s.total_groups}`);
        console.log(`   👥 Toplam Üye: ${s.total_members}`);
        console.log(`   📈 Ortalama Grup Büyüklüğü: ${s.avg_group_size?.toFixed(2) || 0}`);
        console.log(`   🎯 En Büyük Grup: ${s.max_group_size || 0} üye`);
        
        // Grup büyüklük dağılımı
        console.log('\n📈 GRUP BÜYÜKLÜK DAĞILIMI:');
        const distribution = await sql.query`
            SELECT 
                item_count as group_size,
                COUNT(*) as count
            FROM b2b_item_groups
            WHERE is_active = 1
            GROUP BY item_count
            HAVING COUNT(*) > 0
            ORDER BY item_count
        `;
        
        distribution.recordset.forEach(row => {
            console.log(`   ${row.group_size} üyeli: ${row.count} grup`);
        });
        
        // Aynı OEM koduna sahip gruplar
        console.log('\n🔗 AYNI OEM KODLU GRUPLAR:');
        const oemGroups = await sql.query`
            SELECT 
                SUBSTRING(original_codes_json, 1, 100) as sample_codes,
                item_count,
                group_id
            FROM b2b_item_groups
            WHERE is_active = 1 
              AND original_codes_json LIKE '%1213%'  -- OEM kodları genelde 1213 ile başlar
              AND item_count > 1
            ORDER BY item_count DESC
            LIMIT 5
        `;
        
        if (oemGroups.recordset.length > 0) {
            console.log('   🏷️  Aynı OEM kodunu paylaşan gruplar:');
            oemGroups.recordset.forEach(group => {
                console.log(`   - ${group.group_id}: ${group.item_count} üye`);
                console.log(`     Kodlar: ${group.sample_codes.substring(0, 60)}...`);
            });
        }
        
        // Son log
        console.log('\n📝 SON ÇALIŞTIRMA:');
        const lastLog = await sql.query`
            SELECT *
            FROM b2b_grouping_log 
            ORDER BY id DESC 
            LIMIT 1
        `;
        
        if (lastLog.recordset.length > 0) {
            const log = lastLog.recordset[0];
            console.log(`   ID: ${log.id}, Tip: ${log.run_type}`);
            console.log(`   İşlenen: ${log.total_items_processed}, Grup: ${log.groups_created}`);
            console.log(`   Süre: ${log.duration_seconds}s, Durum: ${log.status}`);
        }
        
    } catch (error) {
        console.error('❌ Hata:', error.message);
    } finally {
        await sql.close();
    }
}

check500Results();
