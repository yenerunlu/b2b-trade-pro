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

async function createRealGroups() {
    console.log('🎯 GERÇEK GRUPLAMA BAŞLIYOR (OEM Kodlarına Göre)...\n');
    
    try {
        // 1. LOGOGO3 bağlantısı
        console.log('1. LOGOGO3 bağlantısı...');
        const logoPool = await new sql.ConnectionPool(logoConfig).connect();
        
        // 2. Aynı OEM koduna sahip malzemeleri bul
        console.log('2. Aynı OEM kodlu malzemeler bulunuyor...');
        const query = `
            SELECT 
                LTRIM(RTRIM(PRODUCERCODE)) as oem_code,
                COUNT(*) as item_count,
                MIN(LOGICALREF) as first_ref,
                MIN(CODE) as sample_code,
                MIN(NAME) as sample_name,
                MIN(STGRPCODE) as manufacturer,
                STRING_AGG(CONVERT(NVARCHAR(MAX), LOGICALREF), ',') WITHIN GROUP (ORDER BY LOGICALREF) as logicalrefs,
                STRING_AGG(CONVERT(NVARCHAR(MAX), CODE), ',') WITHIN GROUP (ORDER BY LOGICALREF) as codes
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
        
        const oemGroups = await logoPool.request().query(query);
        console.log(`✅ ${oemGroups.recordset.length} OEM kodu birden fazla malzemeye sahip`);
        
        if (oemGroups.recordset.length === 0) {
            console.log('⚠️ Gruplanacak OEM bulunamadı!');
            return;
        }
        
        // 3. İlk 20 grup için işlem yap
        const groupsToProcess = oemGroups.recordset.slice(0, 20);
        
        // 4. B2B_TRADE_PRO bağlantısı
        console.log('3. B2B_TRADE_PRO bağlantısı...');
        const b2bPool = await new sql.ConnectionPool(b2bConfig).connect();
        
        // 5. Log kaydı
        const logResult = await b2bPool.request()
            .query(`
                INSERT INTO b2b_grouping_log 
                (run_date, run_type, status, started_at)
                VALUES (CAST(GETDATE() AS DATE), 'OEM_GROUPING', 'RUNNING', GETDATE());
                SELECT SCOPE_IDENTITY() as log_id;
            `);
        
        const logId = logResult.recordset[0].log_id;
        
        // 6. Grupları oluştur
        let groupsCreated = 0;
        let membersSaved = 0;
        
        console.log(`\n4. ${groupsToProcess.length} grup oluşturuluyor...`);
        
        for (const group of groupsToProcess) {
            try {
                const oemCode = group.oem_code;
                const itemCount = group.item_count;
                const logicalrefs = group.logicalrefs.split(',');
                const codes = group.codes.split(',');
                
                // Group ID oluştur
                const cleanOEM = oemCode.replace(/[^A-Z0-9]/g, '').toUpperCase();
                const groupId = `OEM_${cleanOEM.substring(0, 10)}_${crypto.createHash('md5').update(oemCode).digest('hex').substring(0, 4).toUpperCase()}`;
                
                // Normalize edilmiş kodlar
                const normalizedCodes = codes.map(code => code.replace(/[^A-Z0-9]/g, '')).join('');
                const charIndex = cleanOEM;
                
                // Grubu kaydet veya güncelle
                await b2bPool.request()
                    .input('group_id', sql.VarChar(50), groupId)
                    .input('hash_key', sql.VarChar(100), oemCode)
                    .input('normalized_codes', sql.NVarChar(1000), normalizedCodes)
                    .input('original_codes_json', sql.NVarChar(sql.MAX), JSON.stringify(codes))
                    .input('char_index', sql.NVarChar(1000), charIndex)
                    .input('item_count', sql.Int, itemCount)
                    .input('sample_item_code', sql.VarChar(50), group.sample_code)
                    .input('sample_manufacturer', sql.VarChar(50), group.manufacturer || 'BILINMIYOR')
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
                for (let i = 0; i < logicalrefs.length; i++) {
                    const logicalref = parseInt(logicalrefs[i]);
                    const code = codes[i];
                    
                    await b2bPool.request()
                        .input('group_id', sql.VarChar(50), groupId)
                        .input('logo_logicalref', sql.Int, logicalref)
                        .input('item_code', sql.VarChar(50), code)
                        .input('manufacturer_code', sql.VarChar(50), group.manufacturer || 'BILINMIYOR')
                        .input('normalized_item_code', sql.VarChar(100), code.replace(/[^A-Z0-9]/g, ''))
                        .input('char_index_item', sql.VarChar(255), `${code} ${oemCode}`.substring(0, 250))
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
                
                groupsCreated++;
                
                // İlerleme
                console.log(`   ✅ ${groupsCreated}. ${groupId}: ${itemCount} üye (${oemCode})`);
                
            } catch (error) {
                console.log(`   ❌ Hata: ${error.message.substring(0, 60)}...`);
            }
        }
        
        // 7. Log'u güncelle
        await b2bPool.request()
            .input('log_id', sql.Int, logId)
            .input('status', sql.VarChar(20), 'SUCCESS')
            .input('completed_at', sql.DateTime, new Date())
            .input('groups_created', sql.Int, groupsCreated)
            .input('total_items_processed', sql.Int, membersSaved)
            .query(`
                UPDATE b2b_grouping_log
                SET status = @status,
                    completed_at = @completed_at,
                    groups_created = @groups_created,
                    total_items_processed = @total_items_processed
                WHERE id = @log_id
            `);
        
        // 8. SONUÇ
        console.log('\n' + '='.repeat(60));
        console.log('🎉 GERÇEK GRUPLAMA TAMAMLANDI!');
        console.log('='.repeat(60));
        console.log(`📊 SONUÇLAR:`);
        console.log(`   🏷️  Oluşturulan Grup: ${groupsCreated}`);
        console.log(`   👥 Kaydedilen Üye: ${membersSaved}`);
        console.log(`   📝 Log ID: ${logId}`);
        
        // 9. Örnekleri göster
        console.log('\n🏷️  OLUŞTURULAN GRUP ÖRNEKLERİ:');
        const exampleGroups = await b2bPool.request().query(`
            SELECT TOP 5 
                g.group_id,
                g.hash_key as oem_code,
                g.item_count,
                g.sample_item_code,
                g.sample_manufacturer
            FROM b2b_item_groups g
            WHERE g.item_count > 1
            ORDER BY g.item_count DESC
        `);
        
        if (exampleGroups.recordset.length > 0) {
            exampleGroups.recordset.forEach((g, i) => {
                console.log(`${i+1}. ${g.group_id}`);
                console.log(`   OEM: ${g.oem_code}`);
                console.log(`   Üye: ${g.item_count} adet`);
                console.log(`   Örnek: ${g.sample_item_code} (${g.sample_manufacturer})`);
            });
            
            console.log('\n🎯 SMART SEARCH TESTİ İÇİN:');
            exampleGroups.recordset.forEach((g, i) => {
                console.log(`   Test ${i+1}: Arama terimi "${g.oem_code}" veya "${g.sample_item_code}"`);
            });
        }
        
        console.log('\n✅ Şimdi API ile smart search testi yapabilirsiniz!');
        
    } catch (error) {
        console.error('❌ Kritik hata:', error.message);
    }
}

createRealGroups();
