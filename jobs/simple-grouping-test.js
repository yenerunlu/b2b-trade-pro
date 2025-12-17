const sql = require('mssql');

// SADECE B2B_TRADE_PRO bağlantısı
const config = {
    server: '5.180.186.54',
    database: 'B2B_TRADE_PRO',
    user: 'sa',
    password: 'Logo12345678',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        connectionTimeout: 30000,
        requestTimeout: 30000
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

async function simpleTest() {
    const startTime = Date.now();
    
    try {
        console.log('🚀 Basit gruplama testi başlatılıyor...\n');
        
        // 1. Bağlan
        console.log('1. Veritabanına bağlanılıyor...');
        const pool = await sql.connect(config);
        console.log('   ✅ Bağlantı başarılı');
        
        // 2. Log oluştur
        console.log('\n2. Log kaydı oluşturuluyor...');
        const logResult = await pool.request()
            .input('run_date', sql.Date, new Date())
            .input('run_type', sql.VarChar(20), 'TEST')
            .input('status', sql.VarChar(20), 'RUNNING')
            .input('started_at', sql.DateTime, new Date())
            .query(`
                INSERT INTO dbo.b2b_grouping_log 
                (run_date, run_type, status, started_at)
                VALUES (@run_date, @run_type, @status, @started_at);
                SELECT SCOPE_IDENTITY() as log_id;
            `);
        
        const logId = logResult.recordset[0].log_id;
        console.log(`   ✅ Log ID: ${logId}`);
        
        // 3. LOGOGO3'ten test verisi çek
        console.log('\n3. LOGOGO3\'ten test verisi çekiliyor...');
        
        const logoConfig = {
            ...config,
            database: 'LOGOGO3'
        };
        
        const logoPool = await sql.connect(logoConfig);
        const itemsResult = await logoPool.request()
            .input('limit', sql.Int, 10)
            .query(`
                SELECT TOP (@limit)
                    LOGICALREF,
                    CODE,
                    NAME,
                    PRODUCERCODE,
                    STGRPCODE
                FROM LG_013_ITEMS
                WHERE ACTIVE = 0 AND CARDTYPE = 12
                ORDER BY LOGICALREF
            `);
        
        console.log(`   ✅ ${itemsResult.recordset.length} test kaydı alındı`);
        
        // 4. Basit gruplama yap
        console.log('\n4. Basit gruplama yapılıyor...');
        
        // Test grupları oluştur
        const testGroups = [
            {
                group_id: 'GRP_TEST_1',
                hash_key: 'HASH1',
                normalized_codes: 'TEST1',
                original_codes_json: '["TEST1"]',
                char_index: 'TEST1',
                item_count: 1
            },
            {
                group_id: 'GRP_TEST_2', 
                hash_key: 'HASH2',
                normalized_codes: 'TEST2',
                original_codes_json: '["TEST2"]',
                char_index: 'TEST2',
                item_count: 1
            }
        ];
        
        // B2B_TRADE_PRO'a geri bağlan
        await sql.connect(config);
        
        // Transaction BAŞLATMA (sorun burada olabilir)
        console.log('   ℹ️ Transaction başlatılıyor...');
        const transaction = new sql.Transaction(pool);
        await transaction.begin();
        
        try {
            // Grupları ekle
            for (const group of testGroups) {
                await transaction.request()
                    .input('group_id', sql.VarChar(20), group.group_id)
                    .input('hash_key', sql.VarChar(64), group.hash_key)
                    .input('normalized_codes', sql.NVarChar(1000), group.normalized_codes)
                    .input('original_codes_json', sql.NVarChar(sql.MAX), group.original_codes_json)
                    .input('char_index', sql.NVarChar(1000), group.char_index)
                    .input('item_count', sql.Int, group.item_count)
                    .query(`
                        INSERT INTO dbo.b2b_item_groups 
                        (group_id, hash_key, normalized_codes, original_codes_json, char_index, item_count)
                        VALUES (@group_id, @hash_key, @normalized_codes, @original_codes_json, @char_index, @item_count)
                    `);
                
                console.log(`   ➕ ${group.group_id} eklendi`);
            }
            
            // Commit et
            await transaction.commit();
            console.log('   ✅ Transaction commit edildi');
            
        } catch (txError) {
            // Rollback
            await transaction.rollback();
            console.log('   ❌ Transaction rollback edildi:', txError.message);
            throw txError;
        }
        
        // 5. Log'u güncelle
        console.log('\n5. Log güncelleniyor...');
        const duration = Math.round((Date.now() - startTime) / 1000);
        
        await pool.request()
            .input('log_id', sql.Int, logId)
            .input('status', sql.VarChar(20), 'SUCCESS')
            .input('completed_at', sql.DateTime, new Date())
            .input('duration_seconds', sql.Int, duration)
            .input('total_items_processed', sql.Int, itemsResult.recordset.length)
            .input('groups_created', sql.Int, testGroups.length)
            .query(`
                UPDATE dbo.b2b_grouping_log
                SET 
                    status = @status,
                    completed_at = @completed_at,
                    duration_seconds = @duration_seconds,
                    total_items_processed = @total_items_processed,
                    groups_created = @groups_created
                WHERE id = @log_id
            `);
        
        console.log('   ✅ Log güncellendi');
        
        // 6. Sonuçları göster
        console.log('\n6. Sonuçları kontrol et...');
        const finalCheck = await pool.request()
            .query(`
                SELECT 
                    (SELECT COUNT(*) FROM dbo.b2b_item_groups) as group_count,
                    (SELECT COUNT(*) FROM dbo.b2b_group_members) as member_count,
                    (SELECT status FROM dbo.b2b_grouping_log WHERE id = ${logId}) as log_status
            `);
        
        console.log(`\n🎉 TEST TAMAMLANDI!`);
        console.log(`   📊 Grup Sayısı: ${finalCheck.recordset[0].group_count}`);
        console.log(`   👥 Üye Sayısı: ${finalCheck.recordset[0].member_count}`);
        console.log(`   📝 Log Durumu: ${finalCheck.recordset[0].log_status}`);
        console.log(`   ⏱️  Toplam Süre: ${duration} saniye`);
        
    } catch (error) {
        console.error('\n❌ TEST HATASI:', error.message);
        console.error('Stack:', error.stack);
        
        // Transaction hatası detayı
        if (error.message.includes('transaction')) {
            console.error('\n💡 İPUCU: Transaction isolation level sorunu olabilir.');
            console.error('   Try: SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
        }
        
    } finally {
        await sql.close();
        console.log('\n🔌 Bağlantılar kapatıldı');
    }
}

simpleTest();
