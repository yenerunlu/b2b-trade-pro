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

async function checkResults() {
    try {
        await sql.connect(config);
        
        // Grup sayısı
        const groups = await sql.query`SELECT COUNT(*) as count FROM dbo.b2b_item_groups`;
        console.log(`📊 Grup Sayısı: ${groups.recordset[0].count}`);
        
        // Grup üyesi sayısı
        const members = await sql.query`SELECT COUNT(*) as count FROM dbo.b2b_group_members`;
        console.log(`👥 Grup Üyesi Sayısı: ${members.recordset[0].count}`);
        
        // Log kayıtları
        const logs = await sql.query`SELECT * FROM dbo.b2b_grouping_log ORDER BY id DESC`;
        console.log(`📝 Log Kayıtları: ${logs.recordset.length}`);
        
        if (logs.recordset.length > 0) {
            console.log('\n📋 Son Log Kaydı:');
            const lastLog = logs.recordset[0];
            console.log(`   ID: ${lastLog.id}`);
            console.log(`   Tarih: ${lastLog.run_date}`);
            console.log(`   Tip: ${lastLog.run_type}`);
            console.log(`   Durum: ${lastLog.status}`);
            console.log(`   İşlenen: ${lastLog.total_items_processed}`);
            console.log(`   Gruplar: ${lastLog.groups_created}`);
            console.log(`   Süre: ${lastLog.duration_seconds}s`);
        }
        
        // İlk 5 grubu göster
        const topGroups = await sql.query`
            SELECT TOP 5 
                group_id, 
                char_index, 
                item_count,
                sample_item_code
            FROM dbo.b2b_item_groups 
            ORDER BY created_at DESC
        `;
        
        if (topGroups.recordset.length > 0) {
            console.log('\n🏷️  İlk 5 Grup:');
            topGroups.recordset.forEach((group, i) => {
                console.log(`   ${i+1}. ${group.group_id} - ${group.char_index} (${group.item_count} üye)`);
            });
        }
        
    } catch (error) {
        console.error('❌ Hata:', error.message);
    } finally {
        await sql.close();
    }
}

checkResults();
