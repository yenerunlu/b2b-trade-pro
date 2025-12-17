// /home/yunlu/b2b-app/jobs/cleanup-test-data.js
// Test amaçlı oluşturulan grup verilerini temizler (GRP_TEST* ve isteğe bağlı olarak küçük gruplar)

const sql = require('mssql');
const { b2bConfig } = require('../config/database');

async function cleanupTestData() {
  try {
    console.log('🧹 Test grup verileri temizleniyor...');
    const pool = await sql.connect(b2bConfig);

    // 1) Önce üyeleri sil
    const deleteMembersResult = await pool.request()
      .query(`
        DELETE FROM b2b_group_members
        WHERE group_id LIKE 'GRP_TEST%'
      `);

    console.log(`🗑️ Silinen grup üyesi sayısı: ${deleteMembersResult.rowsAffected?.[0] ?? 0}`);

    // 2) Sonra grup kayıtlarını sil
    const deleteGroupsResult = await pool.request()
      .query(`
        DELETE FROM b2b_item_groups
        WHERE group_id LIKE 'GRP_TEST%'
      `);

    console.log(`🗑️ Silinen grup sayısı: ${deleteGroupsResult.rowsAffected?.[0] ?? 0}`);

    console.log('✅ Test grup verileri temizlendi.');
    await sql.close();
  } catch (error) {
    console.error('❌ Test verisi temizleme hatası:', error);
    try { await sql.close(); } catch (_) {}
    process.exit(1);
  }
}

if (require.main === module) {
  cleanupTestData().then(() => {
    process.exit(0);
  });
}

module.exports = { cleanupTestData };
