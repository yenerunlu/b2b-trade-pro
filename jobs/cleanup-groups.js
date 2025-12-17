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

async function cleanup() {
    try {
        console.log('🧹 GRUPLAMA VERİLERİ TEMİZLENİYOR...\n');
        
        await sql.connect(config);
        
        // 1. Üyeleri sil
        console.log('1. Grup üyeleri siliniyor...');
        const deleteMembers = await sql.query`DELETE FROM b2b_group_members`;
        console.log(`   🗑️ ${deleteMembers.rowsAffected} üye silindi`);
        
        // 2. Grupları sil
        console.log('\n2. Gruplar siliniyor...');
        const deleteGroups = await sql.query`DELETE FROM b2b_item_groups`;
        console.log(`   🗑️ ${deleteGroups.rowsAffected} grup silindi`);
        
        // 3. Log'ları temizle (test log'ları)
        console.log('\n3. Test log\'ları siliniyor...');
        const deleteLogs = await sql.query`DELETE FROM b2b_grouping_log WHERE run_type IN ('TEST', 'OEM_GROUPING')`;
        console.log(`   🗑️ ${deleteLogs.rowsAffected} log silindi`);
        
        console.log('\n✅ TEMİZLİK TAMAMLANDI!');
        
    } catch (error) {
        console.error('❌ Hata:', error.message);
    } finally {
        await sql.close();
    }
}

cleanup();
