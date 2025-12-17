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

async function cleanBeforeTest() {
    try {
        console.log('🧹 Test öncesi temizlik yapılıyor...\n');
        
        await sql.connect(config);
        
        // Önce foreign key constraint'i devre dışı bırak
        console.log('1. Foreign key constraint\'leri kontrol ediliyor...');
        await sql.query`ALTER TABLE b2b_group_members NOCHECK CONSTRAINT ALL`;
        console.log('   ✅ Constraint\'ler devre dışı');
        
        // Grup üyelerini sil
        console.log('\n2. Grup üyeleri siliniyor...');
        const deleteMembers = await sql.query`DELETE FROM b2b_group_members`;
        console.log(`   🗑️  ${deleteMembers.rowsAffected} grup üyesi silindi`);
        
        // Grupları sil
        console.log('\n3. Gruplar siliniyor...');
        const deleteGroups = await sql.query`DELETE FROM b2b_item_groups`;
        console.log(`   🗑️  ${deleteGroups.rowsAffected} grup silindi`);
        
        // Log'ları temizle (sadece test log'ları)
        console.log('\n4. Test log\'ları siliniyor...');
        const deleteLogs = await sql.query`DELETE FROM b2b_grouping_log WHERE run_type = 'TEST'`;
        console.log(`   🗑️  ${deleteLogs.rowsAffected} test log\'u silindi`);
        
        // Constraint'leri tekrar aktif et
        console.log('\n5. Constraint\'ler aktif ediliyor...');
        await sql.query`ALTER TABLE b2b_group_members CHECK CONSTRAINT ALL`;
        console.log('   ✅ Constraint\'ler aktif');
        
        console.log('\n🎯 TEMİZLİK TAMAMLANDI! Artık test yapabilirsiniz.');
        
    } catch (error) {
        console.error('❌ Temizlik hatası:', error.message);
    } finally {
        await sql.close();
    }
}

cleanBeforeTest();
