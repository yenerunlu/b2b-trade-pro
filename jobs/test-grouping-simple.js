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

// Normalizasyon fonksiyonu (karakter bazlı)
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

// Kod kümesi çıkar
function extractCodeSet(item) {
    const codes = new Set();
    
    // 1. Malzeme kodu
    if (item.CODE) {
        codes.add(normalizeForSearch(item.CODE));
    }
    
    // 2. OEM kodu
    if (item.PRODUCERCODE) {
        codes.add(normalizeForSearch(item.PRODUCERCODE));
    }
    
    // 3. Üretici kodu
    if (item.STGRPCODE) {
        codes.add(normalizeForSearch(item.STGRPCODE));
    }
    
    // 4. NAME alanlarından kod çıkar (basit regex)
    const description = `${item.NAME || ''} ${item.NAME2 || ''}`;
    const codePatterns = description.match(/[A-Z0-9][A-Z0-9\-\/\.]{2,15}[A-Z0-9]/g) || [];
    
    codePatterns.forEach(code => {
        codes.add(normalizeForSearch(code));
    });
    
    return Array.from(codes);
}

// Karakter index oluştur
function createCharIndex(codesArray) {
    return codesArray.join('');
}

async function runTestGrouping(limit = 1000) {
    console.log('🧪 TEST GRUPLAMA BAŞLIYOR...\n');
    console.log(`🎯 Hedef: ${limit} kayıt\n`);
    
    try {
        // 1. LOGOGO3 bağlantısı
        console.log('1. 🔌 LOGOGO3 bağlantısı...');
        const logoPool = await new sql.ConnectionPool(logoConfig).connect();
        console.log('   ✅ Bağlantı başarılı');
        
        // 2. Veri çek (test için sınırlı)
        console.log(`\n2. 📥 ${limit} kayıt çekiliyor...`);
        const items = await logoPool.request().query(`
            SELECT TOP ${limit} 
                LOGICALREF,
                CODE,
                NAME,
                NAME2,
                NAME3,
                NAME4,
                PRODUCERCODE,
                STGRPCODE
            FROM LG_013_ITEMS
            WHERE ACTIVE = 0 AND CARDTYPE = 1
            ORDER BY LOGICALREF
        `);
        
        console.log(`   ✅ ${items.recordset.length} kayıt çekildi`);
        
        // 3. B2B_TRADE_PRO bağlantısı
        console.log('\n3. 🔌 B2B_TRADE_PRO bağlantısı...');
        const b2bPool = await new sql.ConnectionPool(b2bConfig).connect();
        console.log('   ✅ Bağlantı başarılı');
        
        // 4. Log kaydı
        console.log('\n4. 📝 Log kaydı oluşturuluyor...');
        const logResult = await b2bPool.request().query(`
            INSERT INTO b2b_grouping_log 
            (run_date, status, started_at)
            VALUES (CAST(GETDATE() AS DATE), 'TEST_RUNNING', GETDATE());
            SELECT SCOPE_IDENTITY() as log_id;
        `);
        
        const logId = logResult.recordset[0].log_id;
        console.log(`   ✅ Log ID: ${logId}`);
        
        // 5. Gruplama işlemi
        console.log('\n5. 🔍 Kod kümeleri çıkarılıyor...');
        const groups = new Map();
        
        for (const item of items.recordset) {
            const codeSet = extractCodeSet(item);
            
            if (codeSet.length === 0) continue;
            
            // Hash oluştur
            const sortedCodes = [...codeSet].sort();
            const combined = sortedCodes.join('');
            const hash = crypto.createHash('md5').update(combined).digest('hex').substring(0, 8);
            
            if (!groups.has(hash)) {
                groups.set(hash, {
                    hash_key: hash,
                    group_id: `GRP_${hash.toUpperCase()}`,
                    normalized_codes: createCharIndex(sortedCodes),
                    original_codes_json: JSON.stringify(sortedCodes),
                    char_index: createCharIndex(sortedCodes),
                    items: []
                });
            }
            
            groups.get(hash).items.push({
                logo_logicalref: item.LOGICALREF,
                item_code: item.CODE,
                manufacturer_code: item.STGRPCODE,
                normalized_item_code: normalizeForSearch(item.CODE),
                char_index_item: createCharIndex([normalizeForSearch(item.CODE)])
            });
        }
        
        console.log(`   ✅ ${groups.size} grup oluşturuldu`);
        
        // 6. Veritabanına kaydet
        console.log('\n6. 💾 Veritabanına kaydediliyor...');
        
        for (const [hash, group] of groups) {
            if (group.items.length === 0) continue;
            
            try {
                // Grup kaydı
                await b2bPool.request()
                    .input('group_id', sql.VarChar(20), group.group_id)
                    .input('hash_key', sql.VarChar(64), group.hash_key)
                    .input('normalized_codes', sql.NVarChar(1000), group.normalized_codes)
                    .input('original_codes_json', sql.NVarChar(sql.MAX), group.original_codes_json)
                    .input('char_index', sql.NVarChar(1000), group.char_index)
                    .input('item_count', sql.Int, group.items.length)
                    .input('sample_item_code', sql.VarChar(50), group.items[0].item_code)
                    .input('sample_manufacturer', sql.VarChar(50), group.items[0].manufacturer_code || 'BILINMIYOR')
                    .query(`
                        INSERT INTO b2b_item_groups 
                        (group_id, hash_key, normalized_codes, original_codes_json, char_index, 
                         item_count, sample_item_code, sample_manufacturer, is_active, created_at, updated_at)
                        VALUES (@group_id, @hash_key, @normalized_codes, @original_codes_json, @char_index,
                                @item_count, @sample_item_code, @sample_manufacturer, 1, GETDATE(), GETDATE())
                    `);
                
                // Üyeleri kaydet
                for (const item of group.items) {
                    await b2bPool.request()
                        .input('group_id', sql.VarChar(20), group.group_id)
                        .input('logo_logicalref', sql.Int, item.logo_logicalref)
                        .input('item_code', sql.VarChar(50), item.item_code)
                        .input('manufacturer_code', sql.VarChar(50), item.manufacturer_code)
                        .input('normalized_item_code', sql.VarChar(100), item.normalized_item_code)
                        .input('char_index_item', sql.VarChar(255), item.char_index_item)
                        .query(`
                            INSERT INTO b2b_group_members 
                            (group_id, logo_logicalref, item_code, manufacturer_code, 
                             normalized_item_code, char_index_item, match_score, added_at)
                            VALUES (@group_id, @logo_logicalref, @item_code, @manufacturer_code,
                                    @normalized_item_code, @char_index_item, 1.0, GETDATE())
                        `);
                }
                
            } catch (error) {
                console.log(`   ⚠️ ${group.group_id} kaydedilemedi: ${error.message.substring(0, 60)}`);
            }
        }
        
        // 7. Log'u güncelle
        await b2bPool.request()
            .input('log_id', sql.Int, logId)
            .input('status', sql.VarChar(20), 'SUCCESS')
            .input('completed_at', sql.DateTime, new Date())
            .query(`
                UPDATE b2b_grouping_log
                SET status = @status,
                    completed_at = @completed_at
                WHERE id = @log_id
            `);
        
        // 8. SONUÇ
        console.log('\n' + '='.repeat(60));
        console.log('🎉 TEST GRUPLAMA TAMAMLANDI!');
        console.log('='.repeat(60));
        console.log(`📊 İSTATİSTİKLER:`);
        console.log(`   �� İşlenen Kayıt: ${items.recordset.length}`);
        console.log(`   🏷️  Oluşturulan Grup: ${groups.size}`);
        console.log(`   📝 Log ID: ${logId}`);
        
        // Örnek gruplar
        console.log('\n🏷️  ÖRNEK GRUPLAR:');
        const exampleGroups = Array.from(groups.values()).slice(0, 5);
        exampleGroups.forEach((group, i) => {
            console.log(`${i+1}. ${group.group_id}`);
            console.log(`   Kodlar: ${group.original_codes_json.substring(0, 60)}...`);
            console.log(`   Üye Sayısı: ${group.items.length}`);
            console.log(`   Karakter Index: ${group.char_index.substring(0, 40)}...`);
        });
        
        console.log('\n✅ TEST BAŞARIYLA TAMAMLANDI!');
        
    } catch (error) {
        console.error('❌ TEST HATASI:', error.message);
    }
}

// Çalıştır (ilk 1000 kayıt ile test)
runTestGrouping(1000);
