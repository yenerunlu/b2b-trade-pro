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

async function checkQuick() {
    try {
        console.log('🔍 Gruplama sonuçları hızlı kontrol...\n');
        
        await sql.connect(config);
        
        // Grup sayısı
        const groups = await sql.query`SELECT COUNT(*) as count FROM b2b_item_groups WHERE is_active = 1`;
        console.log(`🏷️  Aktif Grup Sayısı: ${groups.recordset[0].count}`);
        
        // Üye sayısı
        const members = await sql.query`SELECT COUNT(*) as count FROM b2b_group_members`;
        console.log(`👥 Grup Üye Sayısı: ${members.recordset[0].count}`);
        
        // Son log
        const lastLog = await sql.query`SELECT TOP 1 * FROM b2b_grouping_log ORDER BY id DESC`;
        if (lastLog.recordset.length > 0) {
            const log = lastLog.recordset[0];
            console.log(`\n📝 Son Log:`);
            console.log(`   ID: ${log.id}, Durum: ${log.status}`);
            console.log(`   İşlenen: ${log.total_items_processed}, Gruplar: ${log.groups_created}`);
            console.log(`   Süre: ${log.duration_seconds}s, Tip: ${log.run_type}`);
        }
        
        // Örnek gruplar
        if (groups.recordset[0].count > 0) {
            console.log('\n🏷️  Örnek Gruplar:');
            const sample = await sql.query`
                SELECT TOP 3 
                    g.group_id, 
                    g.char_index, 
                    g.item_count,
                    g.sample_item_code,
                    m.item_code,
                    m.manufacturer_code
                FROM b2b_item_groups g
                LEFT JOIN b2b_group_members m ON g.group_id = m.group_id
                WHERE g.is_active = 1
                ORDER BY g.created_at DESC
            `;
            
            const grouped = {};
            sample.recordset.forEach(row => {
                if (!grouped[row.group_id]) {
                    grouped[row.group_id] = {
                        group_id: row.group_id,
                        char_index: row.char_index,
                        item_count: row.item_count,
                        sample_item_code: row.sample_item_code,
                        items: []
                    };
                }
                if (row.item_code) {
                    grouped[row.group_id].items.push(`${row.item_code} (${row.manufacturer_code})`);
                }
            });
            
            Object.values(grouped).forEach((group, i) => {
                console.log(`${i+1}. ${group.group_id}`);
                console.log(`   Kod: ${group.char_index}`);
                console.log(`   Üye: ${group.item_count} adet`);
                console.log(`   Örnek: ${group.sample_item_code}`);
                if (group.items.length > 0) {
                    console.log(`   İçerik: ${group.items.slice(0, 3).join(', ')}${group.items.length > 3 ? '...' : ''}`);
                }
            });
        }
        
        console.log('\n✅ Kontrol tamamlandı!');
        
    } catch (error) {
        console.error('❌ Hata:', error.message);
    } finally {
        await sql.close();
    }
}

checkQuick();
