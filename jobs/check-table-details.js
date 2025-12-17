const sql = require('mssql');

const config = {
    server: '5.180.186.54',
    database: 'LOGOGO3',
    user: 'sa',
    password: 'Logo12345678',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function checkTableDetails() {
    try {
        console.log('�� Tablo detaylarını kontrol ediyorum...\n');
        
        await sql.connect(config);
        
        // 1. Hangi şemada?
        console.log('1. LG_013_ITEMS tablosunun şeması:');
        try {
            const schema = await sql.query`
                SELECT 
                    TABLE_SCHEMA,
                    TABLE_NAME,
                    TABLE_TYPE
                FROM INFORMATION_SCHEMA.TABLES
                WHERE TABLE_NAME = 'LG_013_ITEMS'
            `;
            
            if (schema.recordset.length > 0) {
                console.log(`   ✅ Şema: ${schema.recordset[0].TABLE_SCHEMA}.${schema.recordset[0].TABLE_NAME}`);
                console.log(`   📋 Tip: ${schema.recordset[0].TABLE_TYPE}`);
            } else {
                console.log('   ❌ INFORMATION_SCHEMA.TABLES\'te bulunamadı');
            }
        } catch (error) {
            console.log(`   ❌ Şema sorgu hatası: ${error.message}`);
        }
        
        // 2. sys.tables'ta var mı?
        console.log('\n2. sys.tables kontrolü:');
        try {
            const sysTables = await sql.query`
                SELECT 
                    schema_name(schema_id) as schema_name,
                    name as table_name,
                    type_desc,
                    create_date
                FROM sys.tables
                WHERE name = 'LG_013_ITEMS'
            `;
            
            if (sysTables.recordset.length > 0) {
                console.log(`   ✅ sys.tables\'ta var: ${sysTables.recordset[0].schema_name}.${sysTables.recordset[0].table_name}`);
                console.log(`   📅 Oluşturulma: ${sysTables.recordset[0].create_date}`);
            } else {
                console.log('   ❌ sys.tables\'ta yok');
            }
        } catch (error) {
            console.log(`   ❌ sys.tables hatası: ${error.message}`);
        }
        
        // 3. VIEW olabilir mi?
        console.log('\n3. VIEW kontrolü:');
        try {
            const views = await sql.query`
                SELECT 
                    schema_name(schema_id) as schema_name,
                    name as view_name,
                    type_desc
                FROM sys.views
                WHERE name LIKE '%ITEMS%'
                ORDER BY name
            `;
            
            if (views.recordset.length > 0) {
                console.log(`   📋 ${views.recordset.length} ITEMS view\'ı bulundu:`);
                views.recordset.forEach(view => {
                    console.log(`      - ${view.schema_name}.${view.view_name} (${view.type_desc})`);
                });
            }
        } catch (error) {
            console.log(`   ❌ VIEW hatası: ${error.message}`);
        }
        
        // 4. Farklı şema ile deneyelim
        console.log('\n4. Farklı şemalarda arama:');
        const schemas = ['dbo', 'LOGISTIC', 'LOGO', 'MAIN', 'PUBLIC'];
        
        for (const schema of schemas) {
            try {
                const test = await sql.query`SELECT COUNT(*) as cnt FROM [${schema}].[LG_013_ITEMS]`;
                console.log(`   ✅ ${schema}.LG_013_ITEMS erişilebilir: ${test.recordset[0].cnt} kayıt`);
                break;
            } catch (error) {
                console.log(`   ❌ ${schema}.LG_013_ITEMS erişilemez: ${error.message}`);
            }
        }
        
        // 5. Tüm tabloları listele (ITEMS içeren)
        console.log('\n5. ITEMS içeren tüm tablolar:');
        try {
            const allItemsTables = await sql.query`
                SELECT 
                    schema_name(t.schema_id) as schema_name,
                    t.name as table_name,
                    t.type_desc,
                    p.rows as row_count
                FROM sys.tables t
                INNER JOIN sys.partitions p ON t.object_id = p.object_id
                WHERE t.name LIKE '%ITEMS%' 
                  AND p.index_id IN (0, 1)
                GROUP BY t.schema_id, t.name, t.type_desc, p.rows
                ORDER BY t.name
            `;
            
            if (allItemsTables.recordset.length > 0) {
                console.log(`   📋 ${allItemsTables.recordset.length} ITEMS tablosu bulundu:`);
                allItemsTables.recordset.forEach(table => {
                    console.log(`      - ${table.schema_name}.${table.table_name} (${table.type_desc}, ${table.row_count} kayıt)`);
                });
            }
        } catch (error) {
            console.log(`   ❌ Tablo listeleme hatası: ${error.message}`);
        }
        
        // 6. Bağlantı ve izin detayları
        console.log('\n6. Bağlantı ve izin detayları:');
        const details = await sql.query`
            SELECT 
                @@SERVERNAME as server_name,
                DB_NAME() as database_name,
                USER_NAME() as user_name,
                SUSER_NAME() as login_name,
                ORIGINAL_LOGIN() as original_login
        `;
        
        const d = details.recordset[0];
        console.log(`   🌐 Sunucu: ${d.server_name}`);
        console.log(`   📁 Veritabanı: ${d.database_name}`);
        console.log(`   👤 Veritabanı Kullanıcısı: ${d.user_name}`);
        console.log(`   🔑 Login: ${d.login_name}`);
        console.log(`   🔐 Original Login: ${d.original_login}`);
        
    } catch (error) {
        console.error('❌ Genel hata:', error.message);
    } finally {
        await sql.close();
    }
}

checkTableDetails();
