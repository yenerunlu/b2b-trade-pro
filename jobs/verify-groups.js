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

async function verifyGroups() {
    try {
        console.log('🔍 GRUPLAMA VERİLERİ KONTROLÜ\n');
        
        await sql.connect(config);
        
        // 1. Genel istatistikler
        const stats = await sql.query`
            SELECT 
                COUNT(*) as total_groups,
                SUM(item_count) as total_members,
                AVG(item_count) as avg_group_size,
                MAX(item_count) as max_group_size,
                SUM(CASE WHEN item_count > 1 THEN 1 ELSE 0 END) as multi_item_groups
            FROM b2b_item_groups 
            WHERE is_active = 1
        `;
        
        const s = stats.recordset[0];
        console.log('📊 GENEL İSTATİSTİKLER:');
        console.log(`   🏷️  Toplam Grup: ${s.total_groups}`);
        console.log(`   👥 Toplam Üye: ${s.total_members}`);
        console.log(`   📈 Ortalama Grup Büyüklüğü: ${s.avg_group_size?.toFixed(2) || 0}`);
        console.log(`   🎯 En Büyük Grup: ${s.max_group_size || 0} üye`);
        console.log(`   🤝 Çoklu Üyeli Grup: ${s.multi_item_groups}`);
        
        // 2. Grup büyüklük dağılımı
        console.log('\n📈 GRUP BÜYÜKLÜK DAĞILIMI:');
        const distribution = await sql.query`
            SELECT 
                item_count as group_size,
                COUNT(*) as group_count
            FROM b2b_item_groups
            WHERE is_active = 1
            GROUP BY item_count
            ORDER BY item_count DESC
        `;
        
        distribution.recordset.forEach(row => {
            console.log(`   ${row.group_size} üyeli: ${row.group_count} grup`);
        });
        
        // 3. Smart search için örnek gruplar
        console.log('\n🎯 SMART SEARCH TEST GRUPLARI:');
        const testGroups = await sql.query`
            SELECT TOP 10 
                g.group_id,
                g.hash_key as oem_code,
                g.item_count,
                g.sample_item_code,
                g.sample_manufacturer,
                g.char_index,
                COUNT(m.id) as member_count
            FROM b2b_item_groups g
            LEFT JOIN b2b_group_members m ON g.group_id = m.group_id
            WHERE g.is_active = 1 AND g.item_count > 1
            GROUP BY g.group_id, g.hash_key, g.item_count, g.sample_item_code, 
                     g.sample_manufacturer, g.char_index
            ORDER BY g.item_count DESC
        `;
        
        if (testGroups.recordset.length > 0) {
            console.log('   Aşağıdaki arama terimleriyle test yapın:\n');
            
            testGroups.recordset.forEach((group, i) => {
                console.log(`${i+1}. 🔍 "${group.oem_code}"`);
                console.log(`   Grup ID: ${group.group_id}`);
                console.log(`   Üye Sayısı: ${group.member_count}/${group.item_count}`);
                console.log(`   Örnek: ${group.sample_item_code} (${group.sample_manufacturer})`);
                console.log(`   Karakter Index: ${group.char_index.substring(0, 30)}...`);
                console.log(`   Test için:`);
                console.log(`     - OEM kodu: "${group.oem_code}"`);
                console.log(`     - Malzeme kodu: "${group.sample_item_code}"`);
                console.log(`     - Karakter: "${group.char_index.substring(0, 8)}"`);
                console.log('');
            });
            
            console.log('🎯 SMART SEARCH BEKLENEN DAVRANIŞ:');
            console.log('   1. OEM kodu ile arama → Grubu ve tüm üyelerini göster');
            console.log('   2. Malzeme kodu ile arama → Aynı grubu göster');
            console.log('   3. Karakter arama → Karakter index\'i eşleşen grupları göster');
        }
        
        // 4. Log kayıtları
        console.log('\n📝 SON ÇALIŞTIRMA LOG\'LARI:');
        const logs = await sql.query`
            SELECT TOP 3 
                id,
                run_type,
                status,
                total_items_processed,
                groups_created,
                duration_seconds,
                error_message
            FROM b2b_grouping_log
            ORDER BY id DESC
        `;
        
        logs.recordset.forEach(log => {
            console.log(`   ID ${log.id}: ${log.run_type} - ${log.status}`);
            console.log(`     İşlenen: ${log.total_items_processed}, Grup: ${log.groups_created}`);
            if (log.duration_seconds) {
                console.log(`     Süre: ${log.duration_seconds}s`);
            }
            if (log.error_message) {
                console.log(`     ❌ Hata: ${log.error_message.substring(0, 80)}...`);
            }
            console.log('');
        });
        
        console.log('✅ SMART SEARCH SİSTEMİ HAZIR!');
        console.log('   API: POST /api/b2b/products/smart-search');
        console.log('   Headers: Content-Type: application/json');
        console.log('            x-user-data-base64: base64_encoded_user_data');
        
    } catch (error) {
        console.error('❌ Hata:', error.message);
    } finally {
        await sql.close();
    }
}

verifyGroups();
