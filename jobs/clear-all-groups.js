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

async function clearAll() {
    try {
        await sql.connect(config);
        
        console.log('🧹 Tüm grup verileri temizleniyor...');
        
        // Önce foreign key constraint'i disable et (geçici)
        await sql.query`ALTER TABLE dbo.b2b_group_members NOCHECK CONSTRAINT ALL`;
        
        // Grup üyelerini sil
        const deleteMembers = await sql.query`DELETE FROM dbo.b2b_group_members`;
        console.log(`🗑️ ${deleteMembers.rowsAffected} grup üyesi silindi.`);
        
        // Grupları sil
        const deleteGroups = await sql.query`DELETE FROM dbo.b2b_item_groups`;
        console.log(`🗑️ ${deleteGroups.rowsAffected} grup silindi.`);
        
        // Log'u temizle
        const deleteLogs = await sql.query`DELETE FROM dbo.b2b_grouping_log`;
        console.log(`🗑️ ${deleteLogs.rowsAffected} log kaydı silindi.`);
        
        // Constraint'leri tekrar enable et
        await sql.query`ALTER TABLE dbo.b2b_group_members CHECK CONSTRAINT ALL`;
        
        console.log('✅ Tüm veriler temizlendi!');
        
    } catch (error) {
        console.error('❌ Hata:', error.message);
    } finally {
        await sql.close();
    }
}

clearAll();
