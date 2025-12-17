const sql = require('mssql');
const crypto = require('crypto');

const logoConfig = {
    server: '5.180.186.54',
    database: 'LOGOGO3',
    user: 'sa',
    password: 'Logo12345678',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        requestTimeout: 300000
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

// Normalizasyon fonksiyonu
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

// Hash oluşturma
function createHash(codesArray) {
    const sorted = [...codesArray].sort();
    const combined = sorted.join('');
    return crypto.createHash('md5').update(combined).digest('hex').substring(0, 8);
}

// Kod kümesi çıkarma
function extractCodeSet(item) {
    const codes = new Set();
    
    // 1. Malzeme kodu (anahtar)
    if (item.CODE) {
        const normalizedCode = normalizeForSearch(item.CODE);
        if (normalizedCode.length >= 2) {
            codes.add(normalizedCode);
        }
    }
    
    // 2. OEM kodu (en önemlisi)
    if (item.PRODUCERCODE && item.PRODUCERCODE.trim() !== '') {
        const normalizedOEM = normalizeForSearch(item.PRODUCERCODE);
        if (normalizedOEM.length >= 3) { // OEM kodları genelde 3+ karakter
            codes.add(normalizedOEM);
        }
    }
    
    // 3. Açıklama alanlarından kod çıkar
    const description = `${item.NAME || ''} ${item.NAME2 || ''} ${item.NAME3 || ''} ${item.NAME4 || ''}`;
    
    // Klasik kod pattern'leri: harf+rakam kombinasyonları
    const codePatterns = [
        // "B-350", "BW4052" gibi
        /[A-Z][A-Z0-9]*\-[A-Z0-9]+/g,
        /[A-Z]{2,}\d{3,}/g,
        /\b\d{3}[A-Z]+\d*\b/g,
        /\b[A-Z]+\d{3,}\b/g
    ];
    
    codePatterns.forEach(pattern => {
        const matches = description.match(pattern) || [];
        matches.forEach(match => {
            const normalized = normalizeForSearch(match);
            if (normalized.length >= 3) {
                codes.add(normalized);
            }
        });
    });
    
    // 4. Üretici kodu
    if (item.STGRPCODE && item.STGRPCODE.trim() !== '') {
        const normalizedManufacturer = normalizeForSearch(item.STGRPCODE);
        if (normalizedManufacturer.length >= 2) {
            codes.add(normalizedManufacturer);
        }
    }
    
    return Array.from(codes);
}

// Ana gruplama fonksiyonu
async function runGrouping(limit = 100) {
    const startTime = Date.now();
    let logId = null;
    
    console.log('='.repeat(70));
    console.log('🚀 B2B TRADE PRO - AKILLI MALZEME GRUPLAMA SİSTEMİ');
    console.log('='.repeat(70));
    console.log(`📅 Tarih: ${new Date().toLocaleString('tr-TR')}`);
    console.log(`🎯 Hedef: İlk ${limit} aktif malzeme`);
    console.log(`🗃️  Kaynak: LOGOGO3.dbo.LG_013_ITEMS (ACTIVE = 0)`);
    console.log(`💾 Hedef: B2B_TRADE_PRO.dbo.b2b_item_groups`);
    console.log('='.repeat(70));
    
    try {
        // 1. B2B_TRADE_PRO bağlantısı
        console.log('\n🔌 [1/6] B2B_TRADE_PRO bağlantısı...');
        const b2bPool = await sql.connect(b2bConfig);
        console.log('   ✅ Bağlantı başarılı');
        
        // 2. Log kaydı oluştur
        console.log('\n�� [2/6] Gruplama log kaydı oluşturuluyor...');
        const logResult = await b2bPool.request()
            .query(`
                INSERT INTO b2b_grouping_log 
                (run_date, run_type, status, started_at)
                VALUES (CAST(GETDATE() AS DATE), 'TEST', 'RUNNING', GETDATE());
                SELECT SCOPE_IDENTITY() as log_id;
            `);
        
        logId = logResult.recordset[0].log_id;
        console.log(`   ✅ Log ID: ${logId}`);
        
        // 3. LOGOGO3 bağlantısı
        console.log('\n🔌 [3/6] LOGOGO3 bağlantısı...');
        const logoPool = await sql.connect(logoConfig);
        console.log('   ✅ Bağlantı başarılı');
        
        // 4. Aktif malzemeleri çek
        console.log(`\n📥 [4/6] Aktif malzemeler çekiliyor (${limit} adet)...`);
        const query = `
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
            WHERE ACTIVE = 0 
              AND CARDTYPE = 12
            ORDER BY LOGICALREF
        `;
        
        const itemsResult = await logoPool.request().query(query);
        const items = itemsResult.recordset;
        console.log(`   ✅ ${items.length} aktif malzeme çekildi`);
        
        if (items.length === 0) {
            throw new Error('Aktif malzeme bulunamadı! (ACTIVE = 0)');
        }
        
        // 5. Gruplama işlemi
        console.log('\n🔍 [5/6] Kod kümeleri çıkarılıyor ve gruplanıyor...');
        const groups = new Map(); // hash -> group data
        const itemToGroup = new Map(); // logicalref -> group_id
        
        let processed = 0;
        for (const item of items) {
            // Kod kümesini çıkar
            const codeSet = extractCodeSet(item);
            
            if (codeSet.length === 0) {
                // Kod kümesi yoksa, sadece malzeme kodunu kullan
                const defaultCode = normalizeForSearch(item.CODE);
                if (defaultCode.length >= 2) {
                    codeSet.push(defaultCode);
                } else {
                    processed++;
                    continue;
                }
            }
            
            // Hash oluştur
            const hash = createHash(codeSet);
            const groupId = `GRP_${hash.toUpperCase()}`;
            
            // Grubu bul veya oluştur
            if (!groups.has(hash)) {
                groups.set(hash, {
                    group_id: groupId,
                    hash_key: hash,
                    normalized_codes: codeSet.join(''),
                    original_codes_json: JSON.stringify(codeSet),
                    char_index: normalizeForSearch(codeSet.join('')),
                    item_count: 0,
                    items: []
                });
            }
            
            const group = groups.get(hash);
            
            // Malzemeyi gruba ekle
            group.items.push({
                logo_logicalref: item.LOGICALREF,
                item_code: item.CODE,
                manufacturer_code: item.STGRPCODE,
                normalized_item_code: normalizeForSearch(item.CODE),
                char_index_item: normalizeForSearch(item.CODE + ' ' + (item.NAME || ''))
            });
            
            group.item_count++;
            itemToGroup.set(item.LOGICALREF, groupId);
            processed++;
            
            // İlerleme göstergesi
            if (processed % 20 === 0) {
                console.log(`   ⏳ ${processed}/${items.length} işlendi, ${groups.size} grup oluştu`);
            }
        }
        
        console.log(`\n✅ Gruplama tamamlandı: ${groups.size} grup oluşturuldu`);
        
        // 6. B2B_TRADE_PRO'a kaydet
        console.log('\n💾 [6/6] Veritabanına kaydediliyor...');
        
        // Grupları kaydet
        let groupsSaved = 0;
        let membersSaved = 0;
        
        for (const [hash, group] of groups) {
            try {
                // Grup kaydı
                await b2bPool.request()
                    .input('group_id', sql.VarChar(20), group.group_id)
                    .input('hash_key', sql.VarChar(64), group.hash_key)
                    .input('normalized_codes', sql.NVarChar(1000), group.normalized_codes)
                    .input('original_codes_json', sql.NVarChar(sql.MAX), group.original_codes_json)
                    .input('char_index', sql.NVarChar(1000), group.char_index)
                    .input('item_count', sql.Int, group.item_count)
                    .input('sample_item_code', sql.VarChar(50), group.items[0]?.item_code || '')
                    .input('sample_manufacturer', sql.VarChar(50), group.items[0]?.manufacturer_code || '')
                    .input('is_active', sql.Bit, 1)
                    .query(`
                        INSERT INTO b2b_item_groups 
                        (group_id, hash_key, normalized_codes, original_codes_json, char_index, 
                         item_count, sample_item_code, sample_manufacturer, is_active, created_at, updated_at)
                        VALUES (@group_id, @hash_key, @normalized_codes, @original_codes_json, @char_index,
                                @item_count, @sample_item_code, @sample_manufacturer, @is_active, GETDATE(), GETDATE())
                    `);
                
                groupsSaved++;
                
                // Grup üyelerini kaydet
                for (const item of group.items) {
                    await b2bPool.request()
                        .input('group_id', sql.VarChar(20), group.group_id)
                        .input('logo_logicalref', sql.Int, item.logo_logicalref)
                        .input('item_code', sql.VarChar(50), item.item_code)
                        .input('manufacturer_code', sql.VarChar(50), item.manufacturer_code)
                        .input('normalized_item_code', sql.VarChar(100), item.normalized_item_code)
                        .input('char_index_item', sql.VarChar(255), item.char_index_item)
                        .input('match_score', sql.Float, 1.0)
                        .query(`
                            INSERT INTO b2b_group_members 
                            (group_id, logo_logicalref, item_code, manufacturer_code, 
                             normalized_item_code, char_index_item, match_score, added_at)
                            VALUES (@group_id, @logo_logicalref, @item_code, @manufacturer_code,
                                    @normalized_item_code, @char_index_item, @match_score, GETDATE())
                        `);
                    
                    membersSaved++;
                }
                
            } catch (insertError) {
                console.log(`   ⚠️ ${group.group_id} kaydedilemedi: ${insertError.message}`);
                // Devam et
            }
        }
        
        // Log'u güncelle
        const duration = Math.round((Date.now() - startTime) / 1000);
        
        await b2bPool.request()
            .input('log_id', sql.Int, logId)
            .input('status', sql.VarChar(20), 'SUCCESS')
            .input('completed_at', sql.DateTime, new Date())
            .input('duration_seconds', sql.Int, duration)
            .input('total_items_processed', sql.Int, items.length)
            .input('groups_created', sql.Int, groupsSaved)
            .query(`
                UPDATE b2b_grouping_log
                SET 
                    status = @status,
                    completed_at = @completed_at,
                    duration_seconds = @duration_seconds,
                    total_items_processed = @total_items_processed,
                    groups_created = @groups_created
                WHERE id = @log_id
            `);
        
        // SONUÇLARI GÖSTER
        console.log('\n' + '='.repeat(70));
        console.log('🎉 GRUPLAMA BAŞARIYLA TAMAMLANDI!');
        console.log('='.repeat(70));
        console.log('📊 İSTATİSTİKLER:');
        console.log(`   ⏱️  Toplam Süre: ${duration} saniye`);
        console.log(`   📥 İşlenen Malzeme: ${items.length}`);
        console.log(`   🏷️  Oluşturulan Grup: ${groupsSaved}/${groups.size}`);
        console.log(`   👥 Kaydedilen Üye: ${membersSaved}`);
        console.log(`   📝 Log ID: ${logId}`);
        
        // Örnek grupları göster
        console.log('\n🏷️  ÖRNEK GRUPLAR:');
        const sampleGroups = await b2bPool.request()
            .query(`
                SELECT TOP 5 
                    group_id, char_index, item_count, sample_item_code, sample_manufacturer
                FROM b2b_item_groups 
                WHERE is_active = 1
                ORDER BY created_at DESC
            `);
        
        if (sampleGroups.recordset.length > 0) {
            sampleGroups.recordset.forEach((group, i) => {
                console.log(`${i+1}. ${group.group_id}`);
                console.log(`   Kod: ${group.char_index}`);
                console.log(`   Üye: ${group.item_count} adet`);
                console.log(`   Örnek: ${group.sample_item_code} (${group.sample_manufacturer})`);
            });
        }
        
        console.log('\n' + '='.repeat(70));
        console.log('✅ SİSTEM HAZIR! Şimdi API testi yapabilirsiniz.');
        console.log('='.repeat(70));
        
        return {
            success: true,
            items: items.length,
            groups: groupsSaved,
            members: membersSaved,
            duration: duration,
            logId: logId
        };
        
    } catch (error) {
        console.error('\n❌ GRUPLAMA HATASI:', error.message);
        
        // Hata durumunda log'u güncelle
        if (logId) {
            try {
                const b2bPool = await sql.connect(b2bConfig);
                await b2bPool.request()
                    .input('log_id', sql.Int, logId)
                    .input('status', sql.VarChar(20), 'FAILED')
                    .input('completed_at', sql.DateTime, new Date())
                    .input('error_message', sql.NVarChar(sql.MAX), error.message)
                    .query(`
                        UPDATE b2b_grouping_log
                        SET 
                            status = @status,
                            completed_at = @completed_at,
                            error_message = @error_message
                        WHERE id = @log_id
                    `);
                console.log('📝 Hata log\'a kaydedildi');
            } catch (logError) {
                console.error('Log güncelleme hatası:', logError.message);
            }
        }
        
        throw error;
        
    } finally {
        try {
            await sql.close();
            console.log('\n🔌 Bağlantılar kapatıldı');
        } catch (closeError) {
            // Ignore
        }
    }
}

// Script'i çalıştır
const limit = process.argv[2] ? parseInt(process.argv[2]) : 100;

runGrouping(limit)
    .then(() => {
        console.log('\n✨ Gruplama script\'i başarıyla tamamlandı.');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n💥 Gruplama script\'i hata ile sonlandı.');
        process.exit(1);
    });
