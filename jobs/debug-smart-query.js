const sql = require('mssql');
const { b2bConfig } = require('../config/database');

async function run() {
  try {
    const normalizedQuery = '171407153D';
    const limit = 10;

    console.log('🔗 Using b2bConfig:', b2bConfig);

    const pool = await sql.connect(b2bConfig);
    const req = pool.request();
    req.input('normalizedQuery', sql.NVarChar(100), normalizedQuery);
    req.input('limit', sql.Int, limit);

    const result = await req.query(`
      SELECT TOP (@limit)
          g.group_id,
          g.hash_key,
          g.char_index,
          g.normalized_codes,
          g.item_count,
          g.is_active
      FROM B2B_TRADE_PRO.dbo.b2b_item_groups g
      WHERE g.is_active = 1
        AND (
              REPLACE(g.char_index, ' ', '') LIKE @normalizedQuery + '%'
           OR REPLACE(g.hash_key,   ' ', '') LIKE @normalizedQuery + '%'
        )
      ORDER BY g.group_id;
    `);

    console.log('🧪 Rows:', result.recordset.length);
    console.log(result.recordset);
  } catch (e) {
    console.error('❌ Error:', e);
  } finally {
    sql.close();
  }
}

run();
