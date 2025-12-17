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

// Normalizasyon fonksiyonu (karakter bazlı arama için)
function normalizeForSearch(input) {
    if (!input) return '';
    
    const turkishMap = {
        'İ': 'I', 'ı': 'I', 'Ğ': 'G', 'ğ': 'G',
        'Ü': 'U', 'ü': 'U', 'Ş': 'S', 'ş': 'S',
        'Ö': 'O', 'ö': 'O', 'Ç': 'C', 'ç': 'C'
    };
    
    let result = input.toString();
    
    Object.keys(turkishMap).forEach(key => {
        const regex = new RegExp(key, 'g');
        result = result.replace(regex, turkishMap[key]);
    });
    
    result = result.toUpperCase();
    result = result.replace(/[^A-Z0-9]/g, '');
    
    return result;
}

async function runRealGrouping() {
    console.log('🎯 GERÇEK OEM GRUPLAMA SİSTEMİ BAŞLIYOR...\n');
    
    try {
        // 1. LOGOGO3 bağlantısı
        console.log('1. 🔌 LOGOGO3 bağlantısı...');
        const logoPool = await new sql.ConnectionPool(logoConfig).connect();
        
        // 2. EN ÇOK TEKRAR EDEN OEM KODLARINI BUL
        console.log('\n2. 🔍 EN ÇOK TEKRAR EDEN OEM KODLARI ARANIYOR...');
        
        const topOEMQuery = `
            SELECT TOP 100
                LTRIM(RTRIM(PRODUCERCODE)) as oem_code,
                COUNT(*) as malzeme_sayisi,
                MIN(CODE) as ornek_kod,
                MIN(NAME) as ornek_isim,
                MIN(STGRPCODE) as ornek_uretici
            FROM LG_013_ITEMS
            WHERE ACTIVE = 0 
              AND CARDTYPE = 1
              AND PRODUCERCODE IS NOT NULL
              AND LTRIM(RTRIM(PRODUCERCODE)) != ''
              AND LEN(LTRIM(RTRIM(PRODUCERCODE))) >= 3
            GROUP BY LTRIM(RTRIM(PRODUCERCODE))
            HAVING COUNT(*) > 1
            ORDER BY COUNT(*) DESC
        `;
        
        const topOEMs = await logoPool.request().query(topOEMQuery);
        console.log(`   ✅ ${topOEMs.recordset.length} OEM kodu birden fazla malzemeye sahip`);
        
        if (topOEMs.recordset.length === 0) {
            console.log('⚠️ Gruplanacak OEM bulunamadı!');
            return;
        }
        
        // İlk 20 OEM'i göster
        console.log('\n   📋 İLK 20 OEM KODU:');
        topOEMs.recordset.slice(0, 20).forEach((oem, i) => {
            console.log(`   ${i+1}. ${oem.oem_code} → ${oem.malzeme_sayisi} malzeme (${oem.ornek_kod})`);
        });
        
        // 3. B2B_TRADE_PRO bağlantısı
        console.log('\n3. 🔌 B2B_TRADE_PRO bağlantısı...');
        const b2bPool = await new sql.ConnectionPool(b2bConfig).connect();
        
        // 4. Log kaydı
        console.log('\n4. �� Log kaydı oluşturuluyor...');
        const logResult = await b2bPool.request().query(`
            INSERT INTO b2b_grouping_log 
            (run_date, run_type, status, started_at)
            VALUES (CAST(GETDATE() AS DATE), 'REAL_OEM_GROUPING', 'RUNNING', GETDATE());
            SELECT SCOPE_IDENTITY() as log_id;
        `);
        
        const logId = logResult.recordset[0].log_id;
        console.log(`   ✅ Log ID: ${logId}`);
        
        // 5. HER OEM İÇİN GRUP OLUŞTUR
        console.log('\n5. 🤝 OEM KODLARI İÇİN GRUP OLUŞTURULUYOR...');
        let groupsCreated = 0;
        let totalMembers = 0;
        
        for (const oem of topOEMs.recordset.slice(0, 50)) { // İlk 50 OEM ile sınırlı
            try {
                const oemCode = oem.oem_code;
                const itemCount = oem.malzeme_sayisi;
                
                // Bu OEM koduna sahip tüm malzemeleri getir
                const itemsQuery = `
                    SELECT 
                        LOGICALREF,
                        CODE,
                        NAME,
                        STGRPCODE
                    FROM LG_013_ITEMS
                    WHERE ACTIVE = 0 
                      AND CARDTYPE = 1
                      AND LTRIM(RTRIM(PRODUCERCODE)) = '${oemCode.replace(/'/g, "''")}'
                    ORDER BY CODE
                `;
                
                const items = await logoPool.request().query(itemsQuery);
                
                if (items.recordset.length < 2) continue; // Tek üyeli grupları atla
                
                // Group ID oluştur
                const cleanOEM = normalizeForSearch(oemCode);
                const groupId = `OEM_${cleanOEM.substring(0, 10)}_${crypto.createHash('md5').update(oemCode).digest('hex').substring(0, 4).toUpperCase()}`;
                
                // Kod kümesi (tüm malzeme kodları)
                const allCodes = items.recordset.map(item => normalizeForSearch(item.CODE));
                const charIndex = cleanOEM; // Karakter index'i OEM kodu
                
                // Grup kaydı oluştur veya güncelle
                await b2bPool.request()
                    .input('group_id', sql.VarChar(50), groupId)
                    .input('hash_key', sql.VarChar(100), oemCode)
                    .input('normalized_codes', sql.NVarChar(1000), allCodes.join(''))
                    .input('original_codes_json', sql.NVarChar(sql.MAX), JSON.stringify(allCodes))
                    .input('char_index', sql.NVarChar(1000), charIndex)
                    .input('item_count', sql.Int, items.recordset.length)
                    .input('sample_item_code', sql.VarChar(50), items.recordset[0].CODE)
                    .input('sample_manufacturer', sql.VarChar(50), items.recordset[0].STGRPCODE || 'BILINMIYOR')
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
                
                // Eski üyeleri sil
                await b2bPool.request()
                    .input('group_id', sql.VarChar(50), groupId)
                    .query(`DELETE FROM b2b_group_members WHERE group_id = @group_id`);
                
                // Yeni üyeleri ekle
                for (const item of items.recordset) {
                    await b2bPool.request()
                        .input('group_id', sql.VarChar(50), groupId)
                        .input('logo_logicalref', sql.Int, item.LOGICALREF)
                        .input('item_code', sql.VarChar(50), item.CODE)
                        .input('manufacturer_code', sql.VarChar(50), item.STGRPCODE || 'BILINMIYOR')
                        .input('normalized_item_code', sql.VarChar(100), normalizeForSearch(item.CODE))
                        .input('char_index_item', sql.VarChar(255), normalizeForSearch(item.CODE + ' ' + item.NAME).substring(0, 250))
                        .query(`
                            INSERT INTO b2b_group_members 
                            (group_id, logo_logicalref, item_code, manufacturer_code, 
                             normalized_item_code, char_index_item, match_score, added_at)
                            VALUES (@group_id, @logo_logicalref, @item_code, @manufacturer_code,
                                    @normalized_item_code, @char_index_item, 1.0, GETDATE())
                        `);
                    
                    totalMembers++;
                }
                
                groupsCreated++;
                
                // Her 5 grupta bir ilerleme göster
                if (groupsCreated % 5 === 0) {
                    console.log(`   ✅ ${groupsCreated}. ${groupId}: ${items.recordset.length} üye (${oemCode})`);
                }
                
            } catch (error) {
                console.log(`   ⚠️ OEM ${oem.oem_code} işlenemedi: ${error.message.substring(0, 60)}...`);
            }
        }
        
        // 6. Log'u güncelle
        await b2bPool.request()
            .input('log_id', sql.Int, logId)
            .input('status', sql.VarChar(20), 'SUCCESS')
            .input('completed_at', sql.DateTime, new Date())
            .input('groups_created', sql.Int, groupsCreated)
            .input('total_items_processed', sql.Int, totalMembers)
            .query(`
                UPDATE b2b_grouping_log
                SET status = @status,
                    completed_at = @completed_at,
                    groups_created = @groups_created,
                    total_items_processed = @total_items_processed
                WHERE id = @log_id
            `);
        
        // 7. SONUÇLARI GÖSTER
        console.log('\n' + '='.repeat(60));
        console.log('🎉 GERÇEK OEM GRUPLAMA TAMAMLANDI!');
        console.log('='.repeat(60));
        console.log(`📊 İSTATİSTİKLER:`);
        console.log(`   🔍 İncelenen OEM: ${topOEMs.recordset.length}`);
        console.log(`   🏷️  Oluşturulan Grup: ${groupsCreated}`);
        console.log(`   👥 Kaydedilen Üye: ${totalMembers}`);
        console.log(`   📝 Log ID: ${logId}`);
        
        // 8. ÖRNEK GRUPLARI GÖSTER
        console.log('\n🏷️  OLUŞTURULAN GRUP ÖRNEKLERİ:');
        const exampleQuery = `
            SELECT TOP 10 
                g.group_id,
                g.hash_key as oem_code,
                g.item_count,
                g.sample_item_code,
                g.sample_manufacturer,
                g.char_index
            FROM b2b_item_groups g
            WHERE g.is_active = 1 AND g.item_count > 1
            ORDER BY g.item_count DESC, g.created_at DESC
        `;
        
        const examples = await b2bPool.request().query(exampleQuery);
        
        if (examples.recordset.length > 0) {
            examples.recordset.forEach((group, i) => {
                console.log(`${i+1}. ${group.group_id}`);
                console.log(`   OEM: ${group.oem_code}`);
                console.log(`   Üye: ${group.item_count} adet`);
                console.log(`   Örnek: ${group.sample_item_code} (${group.sample_manufacturer})`);
                console.log(`   Karakter Index: ${group.char_index.substring(0, 30)}...`);
            });
            
            console.log('\n🎯 SMART SEARCH TEST ÖNERİLERİ:');
            console.log('   Aşağıdaki arama terimleriyle test yapın:');
            examples.recordset.slice(0, 5).forEach((group, i) => {
                console.log(`   ${i+1}. "${group.oem_code}" (OEM kodu)`);
                console.log(`      Veya: "${group.sample_item_code}" (malzeme kodu)`);
            });
        } else {
            console.log('⚠️ Henüz çoklu üyeli grup yok');
        }
        
        console.log('\n✅ Şimdi SMART SEARCH API testi yapabilirsiniz!');
        
    } catch (error) {
        console.error('❌ KRİTİK HATA:', error.message);
    }
}

// Çalıştır
runRealGrouping();
