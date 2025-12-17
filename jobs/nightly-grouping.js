const sql = require('mssql');
const crypto = require('crypto');

const logoConfig = {
    server: '5.180.186.54',
    database: 'LOGOGO3',
    user: 'sa',
    password: 'Logo12345678',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

const b2bConfig = {
    server: '5.180.186.54',
    database: 'B2B_TRADE_PRO',
    user: 'sa',
    password: 'Logo12345678',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function runNightlyGrouping() {
    console.log('🌙 GEÇE GRUPLAMA SİSTEMİ BAŞLIYOR...\n');
    console.log('⏰ ' + new Date().toLocaleString('tr-TR'));
    console.log('='.repeat(60));
    
    const startTime = Date.now();
    let logId = null;
    
    try {
        // 1. B2B_TRADE_PRO bağlantısı
        console.log('1. 🔌 B2B_TRADE_PRO bağlantısı...');
        const b2bPool = await new sql.ConnectionPool(b2bConfig).connect();
        
        // 2. Log kaydı
        console.log('\n2. 📝 Log kaydı oluşturuluyor...');
        const logResult = await b2bPool.request().query(`
            INSERT INTO b2b_grouping_log 
            (run_date, run_type, status, started_at)
            VALUES (CAST(GETDATE() AS DATE), 'NIGHTLY_FULL', 'RUNNING', GETDATE());
            SELECT SCOPE_IDENTITY() as log_id;
        `);
        
        logId = logResult.recordset[0].log_id;
        console.log(`   ✅ Log ID: ${logId}`);
        
        // 3. LOGOGO3 bağlantısı
        console.log('\n3. 🔌 LOGOGO3 bağlantısı...');
        const logoPool = await new sql.ConnectionPool(logoConfig).connect();
        
        // 4. TÜM aktif malzemeleri çek (sınırlı - test için 5000)
        console.log('\n4. 📥 Tüm aktif malzemeler çekiliyor...');
        const allItems = await logoPool.request().query(`
            SELECT TOP 5000
                LOGICALREF,
                CODE,
                NAME,
                NAME2,
                PRODUCERCODE,
                STGRPCODE
            FROM LG_013_ITEMS
            WHERE ACTIVE = 0 AND CARDTYPE = 1
            ORDER BY LOGICALREF
        `);
        
        console.log(`   ✅ ${allItems.recordset.length} aktif malzeme çekildi`);
        
        // 5. OEM kodlarına göre grupla
        console.log('\n5. 🤝 OEM KODLARINA GÖRE GRUPLAMA...');
        
        // 5.1. OEM kodlarını grupla
        const oemMap = new Map();
        
        allItems.recordset.forEach(item => {
            if (!item.PRODUCERCODE || item.PRODUCERCODE.trim() === '') return;
            
            const cleanOEM = item.PRODUCERCODE.trim();
            
            if (!oemMap.has(cleanOEM)) {
                oemMap.set(cleanOEM, {
                    oem_code: cleanOEM,
                    items: [],
                    manufacturers: new Set()
                });
            }
            
            oemMap.get(cleanOEM).items.push({
                logicalref: item.LOGICALREF,
                code: item.CODE,
                name: item.NAME,
                manufacturer: item.STGRPCODE
            });
            
            if (item.STGRPCODE) {
                oemMap.get(cleanOEM).manufacturers.add(item.STGRPCODE);
            }
        });
        
        console.log(`   ✅ ${oemMap.size} farklı OEM kodu bulundu`);
        
        // 5.2. Çoklu üyeli OEM'leri filtrele
        const multiOEMs = Array.from(oemMap.values()).filter(oem => oem.items.length > 1);
        console.log(`   ✅ ${multiOEMs.length} OEM kodu birden fazla malzemeye sahip`);
        
        // 6. Grupları oluştur ve kaydet
        console.log('\n6. 💾 GRUPLAR OLUŞTURULUYOR VE KAYDEDİLİYOR...');
        
        let groupsCreated = 0;
        let membersSaved = 0;
        
        for (const oem of multiOEMs) {
            try {
                // Group ID oluştur
                const cleanOEM = oem.oem_code.replace(/[^A-Z0-9]/g, '').toUpperCase();
                const groupId = `OEM_${cleanOEM.substring(0, 10)}_${crypto.createHash('md5').update(oem.oem_code).digest('hex').substring(0, 4).toUpperCase()}`;
                
                // Karakter index (OEM kodu normalize edilmiş)
                const charIndex = cleanOEM;
                
                // Tüm malzeme kodları
                const allCodes = oem.items.map(item => item.code.replace(/[^A-Z0-9]/g, '').toUpperCase());
                const normalizedCodes = allCodes.join('');
                
                // Grubu kaydet
                await b2bPool.request()
                    .input('group_id', sql.VarChar(50), groupId)
                    .input('hash_key', sql.VarChar(100), oem.oem_code)
                    .input('normalized_codes', sql.NVarChar(1000), normalizedCodes)
                    .input('original_codes_json', sql.NVarChar(sql.MAX), JSON.stringify(allCodes))
                    .input('char_index', sql.NVarChar(1000), charIndex)
                    .input('item_count', sql.Int, oem.items.length)
                    .input('sample_item_code', sql.VarChar(50), oem.items[0].code)
                    .input('sample_manufacturer', sql.VarChar(50), oem.items[0].manufacturer || 'BILINMIYOR')
                    .query(`
                        MERGE b2b_item_groups AS target
                        USING (SELECT @group_id as group_id) AS source
                        ON target.group_id = source.group_id
                        WHEN MATCHED THEN
                            UPDATE SET 
                                item_count = @item_count,
                                normalized_codes = @normalized_codes,
                                original_codes_json = @original_codes_json,
                                char_index = @char_index,
                                sample_item_code = @sample_item_code,
                                sample_manufacturer = @sample_manufacturer,
                                updated_at = GETDATE()
                        WHEN NOT MATCHED THEN
                            INSERT (group_id, hash_key, normalized_codes, original_codes_json, char_index, 
                                    item_count, sample_item_code, sample_manufacturer, is_active, created_at, updated_at)
                            VALUES (@group_id, @hash_key, @normalized_codes, @original_codes_json, @char_index,
                                    @item_count, @sample_item_code, @sample_manufacturer, 1, GETDATE(), GETDATE());
                    `);
                
                // Eski üyeleri temizle
                await b2bPool.request()
                    .input('group_id', sql.VarChar(50), groupId)
                    .query(`DELETE FROM b2b_group_members WHERE group_id = @group_id`);
                
                // Yeni üyeleri ekle
                for (const item of oem.items) {
                    await b2bPool.request()
                        .input('group_id', sql.VarChar(50), groupId)
                        .input('logo_logicalref', sql.Int, item.logicalref)
                        .input('item_code', sql.VarChar(50), item.code)
                        .input('manufacturer_code', sql.VarChar(50), item.manufacturer || 'BILINMIYOR')
                        .input('normalized_item_code', sql.VarChar(100), item.code.replace(/[^A-Z0-9]/g, '').toUpperCase())
                        .input('char_index_item', sql.VarChar(255), `${item.code.replace(/[^A-Z0-9]/g, '').toUpperCase()} ${item.name.substring(0, 30)}`.substring(0, 250))
                        .query(`
                            INSERT INTO b2b_group_members 
                            (group_id, logo_logicalref, item_code, manufacturer_code, 
                             normalized_item_code, char_index_item, match_score, added_at)
                            VALUES (@group_id, @logo_logicalref, @item_code, @manufacturer_code,
                                    @normalized_item_code, @char_index_item, 1.0, GETDATE())
                        `);
                    
                    membersSaved++;
                }
                
                groupsCreated++;
                
                // Her 10 grupta bir ilerleme
                if (groupsCreated % 10 === 0) {
                    console.log(`   ✅ ${groupsCreated} grup kaydedildi...`);
                }
                
            } catch (error) {
                console.log(`   ⚠️ OEM ${oem.oem_code} işlenemedi: ${error.message.substring(0, 60)}...`);
            }
        }
        
        // 7. Log'u güncelle
        const durationSeconds = Math.round((Date.now() - startTime) / 1000);
        
        await b2bPool.request()
            .input('log_id', sql.Int, logId)
            .input('status', sql.VarChar(20), 'SUCCESS')
            .input('completed_at', sql.DateTime, new Date())
            .input('duration_seconds', sql.Int, durationSeconds)
            .input('groups_created', sql.Int, groupsCreated)
            .input('total_items_processed', sql.Int, membersSaved)
            .query(`
                UPDATE b2b_grouping_log
                SET status = @status,
                    completed_at = @completed_at,
                    duration_seconds = @duration_seconds,
                    groups_created = @groups_created,
                    total_items_processed = @total_items_processed
                WHERE id = @log_id
            `);
        
        // 8. SONUÇ
        console.log('\n' + '='.repeat(60));
        console.log('🌙 GEÇE GRUPLAMA TAMAMLANDI!');
        console.log('='.repeat(60));
        console.log(`📊 İSTATİSTİKLER:`);
        console.log(`   ⏱️  Toplam Süre: ${durationSeconds} saniye`);
        console.log(`   🔍 Taranan Kayıt: ${allItems.recordset.length}`);
        console.log(`   🏷️  Oluşturulan Grup: ${groupsCreated}`);
        console.log(`   👥 Kaydedilen Üye: ${membersSaved}`);
        console.log(`   📝 Log ID: ${logId}`);
        
        // 9. Örnek gruplar
        console.log('\n🏷️  EN BÜYÜK 5 GRUP:');
        const topGroups = await b2bPool.request().query(`
            SELECT TOP 5 
                g.group_id,
                g.hash_key as oem_code,
                g.item_count,
                g.sample_item_code,
                g.sample_manufacturer
            FROM b2b_item_groups g
            WHERE g.is_active = 1
            ORDER BY g.item_count DESC, g.created_at DESC
        `);
        
        topGroups.recordset.forEach((group, i) => {
            console.log(`${i+1}. ${group.group_id}`);
            console.log(`   OEM: ${group.oem_code}`);
            console.log(`   Üye: ${group.item_count} adet`);
            console.log(`   Örnek: ${group.sample_item_code} (${group.sample_manufacturer})`);
        });
        
        console.log('\n✅ GEÇE GRUPLAMA SİSTEMİ HAZIR!');
        console.log('   SMART SEARCH API test edilebilir.');
        
    } catch (error) {
        console.error('\n❌ KRİTİK HATA:', error.message);
        
        // Hata durumunda log'u güncelle
        if (logId) {
            try {
                const b2bPool = await new sql.ConnectionPool(b2bConfig).connect();
                await b2bPool.request()
                    .input('log_id', sql.Int, logId)
                    .input('status', sql.VarChar(20), 'FAILED')
                    .input('completed_at', sql.DateTime, new Date())
                    .input('error_message', sql.NVarChar(sql.MAX), error.message)
                    .query(`
                        UPDATE b2b_grouping_log
                        SET status = @status,
                            completed_at = @completed_at,
                            error_message = @error_message
                        WHERE id = @log_id
                    `);
            } catch (logError) {
                console.error('Log güncelleme hatası:', logError.message);
            }
        }
    }
}

// Çalıştır
runNightlyGrouping();
