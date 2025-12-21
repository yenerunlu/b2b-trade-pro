const { MeiliSearch } = require('meilisearch');
const sql = require('mssql');
const { logoConfig } = require('../config/database');

const DEFAULT_INDEX = 'items';

let indexPromise = null;
let logoPoolPromise = null;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

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

function normalizeQuery(input) {
    const str = (input ?? '').toString();
    if (!str.trim()) {
        return { raw: '', cleaned: '', compact: '', isCodeLike: false };
    }

    const turkishMap = {
        'İ': 'I', 'ı': 'I', 'Ğ': 'G', 'ğ': 'G',
        'Ü': 'U', 'ü': 'U', 'Ş': 'S', 'ş': 'S',
        'Ö': 'O', 'ö': 'O', 'Ç': 'C', 'ç': 'C'
    };

    let t = str;
    Object.keys(turkishMap).forEach(key => {
        const regex = new RegExp(key, 'g');
        t = t.replace(regex, turkishMap[key]);
    });

    t = t.toUpperCase();
    // Noktalama ve özel karakterleri boşluk yap ( - * / ) ( & , . vb )
    t = t.replace(/[^A-Z0-9]+/g, ' ');
    t = t.replace(/\s+/g, ' ').trim();

    const compact = t.replace(/\s+/g, '');

    const hasDigit = /\d/.test(compact);
    const alphaCount = (compact.match(/[A-Z]/g) || []).length;
    const digitCount = (compact.match(/\d/g) || []).length;
    const totalCount = compact.length || 1;
    const digitRatio = digitCount / totalCount;
    const isCodeLike = hasDigit && (digitRatio >= 0.4 || alphaCount <= 3);

    return { raw: str, cleaned: t, compact, isCodeLike };
}

function buildCompactHaystack(hit) {
    const parts = [
        hit?.itemCode,
        hit?.oemCode,
        hit?.name2,
        hit?.name3
    ];

    return parts
        .map(v => normalizeQuery(v).compact)
        .filter(Boolean)
        .join(' ');
}

function getClient() {
    const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
    const host = process.env.MEILI_HOST || (isProd ? 'http://127.0.0.1:7700' : 'http://127.0.0.1:7700');
    const apiKey = process.env.MEILI_API_KEY;
    if (isProd && (!apiKey || !String(apiKey).trim())) {
        throw new Error('MEILI_API_KEY is required in production');
    }
    return new MeiliSearch({ host, apiKey });
}

function getLogoPool() {
    if (logoPoolPromise) return logoPoolPromise;

    logoPoolPromise = (async () => {
        const pool = new sql.ConnectionPool(logoConfig);
        await pool.connect();
        return pool;
    })();

    logoPoolPromise.catch(() => {
        logoPoolPromise = null;
    });

    return logoPoolPromise;
}

async function ensureIndex() {
    if (indexPromise) return indexPromise;

    indexPromise = (async () => {
        const client = getClient();
        const maxAttempts = 8;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                try {
                    await client.getIndex(DEFAULT_INDEX);
                } catch (e) {
                    await client.createIndex(DEFAULT_INDEX, { primaryKey: 'id' });
                }

                const index = client.index(DEFAULT_INDEX);

                await index.updateSettings({
                    searchableAttributes: [
                        'compactTokens',
                        'normalizedItemCode',
                        'itemCode',
                        'normalizedOemCode',
                        'oemCode',
                        'manufacturer',
                        'name',
                        'name2',
                        'name3',
                        'tokens'
                    ],
                    displayedAttributes: [
                        'id',
                        'itemCode',
                        'oemCode',
                        'manufacturer',
                        'name',
                        'name2',
                        'name3',
                        'totalStock'
                    ],
                    filterableAttributes: [
                        'manufacturer'
                    ],
                    sortableAttributes: [
                        'totalStock'
                    ],
                    synonyms: {
                        'AMORTISOR': ['AMORTISÖR'],
                        'AMORTISORU': ['AMORTISÖR'],
                        'FILTRE': ['FILTER'],
                        'BALATA': ['BRAKEPAD']
                    }
                });

                return index;
            } catch (err) {
                const msg = (err && err.message) ? err.message : String(err);
                console.error(`❌ Meili ensureIndex attempt ${attempt}/${maxAttempts} failed:`, msg);

                if (attempt === maxAttempts) {
                    throw err;
                }

                await sleep(Math.min(250 * attempt, 1500));
            }
        }

        throw new Error('Meili ensureIndex failed');
    })();

    indexPromise.catch(() => {
        indexPromise = null;
    });

    return indexPromise;
}

async function fetchItemsFromLogo(limit = 5000, offset = 0) {
    const pool = await getLogoPool();
    const request = pool.request();

    request.input('limit', sql.Int, limit);
    request.input('offset', sql.Int, offset);

    const query = `
        SELECT
            I.LOGICALREF as id,
            I.CODE as itemCode,
            I.NAME as name,
            I.NAME2 as name2,
            I.NAME3 as name3,
            I.PRODUCERCODE as oemCode,
            I.STGRPCODE as manufacturer,
            ISNULL(SUM(CASE WHEN S.INVENNO IN (0,1,2,3) THEN S.ONHAND - S.RESERVED ELSE 0 END), 0) as totalStock
        FROM dbo.LG_013_ITEMS I
        LEFT JOIN LV_013_01_STINVTOT S ON S.STOCKREF = I.LOGICALREF
        WHERE I.ACTIVE = 0
          AND I.CARDTYPE = 1
        GROUP BY I.LOGICALREF, I.CODE, I.NAME, I.NAME2, I.NAME3, I.PRODUCERCODE, I.STGRPCODE
        ORDER BY I.LOGICALREF
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `;

    const result = await request.query(query);
    return result.recordset || [];
}

function toMeiliDoc(row) {
    const itemCode = String(row.itemCode || '').trim();
    const oemCode = String(row.oemCode || '').trim();
    const name = String(row.name || '').trim();
    const name2 = String(row.name2 || '').trim();
    const name3 = String(row.name3 || '').trim();
    const manufacturer = String(row.manufacturer || '').trim();

    const normalizedItemCode = normalizeForSearch(itemCode);
    const normalizedOemCode = normalizeForSearch(oemCode);

    const tokens = [itemCode, oemCode, manufacturer, name, name2, name3]
        .filter(Boolean)
        .join(' ');

    const compactTokens = [itemCode, oemCode, manufacturer, name, name2, name3]
        .map(v => normalizeQuery(v).compact)
        .filter(Boolean)
        .join(' ');

    return {
        id: Number(row.id),
        itemCode,
        oemCode,
        manufacturer,
        name,
        name2,
        name3,
        compactTokens,
        normalizedItemCode,
        normalizedOemCode,
        tokens,
        totalStock: Number(row.totalStock || 0)
    };
}

async function reindexAll({ batchSize = 5000 } = {}) {
    const index = await ensureIndex();

    await index.deleteAllDocuments();

    let offset = 0;
    while (true) {
        const rows = await fetchItemsFromLogo(batchSize, offset);
        if (!rows || rows.length === 0) break;

        const batch = rows.map(toMeiliDoc);
        if (batch.length === 0) break;

        await index.addDocuments(batch);
        offset += batch.length;

        if (batch.length < batchSize) break;
    }

    return { success: true };
}

async function autocomplete(query, { limit = 15 } = {}) {
    const nq = normalizeQuery(query);
    if (!nq.cleaned || nq.cleaned.length < 2) return [];

    const index = await ensureIndex();
    const qForSearch = nq.isCodeLike ? nq.compact : nq.cleaned;

    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 15, 1), 50);
    const candidateLimit = Math.max(safeLimit * 10, 50);

    const resp = await index.search(qForSearch, {
        limit: Math.min(candidateLimit, 500),
        attributesToRetrieve: ['id', 'itemCode', 'oemCode', 'manufacturer', 'name', 'name2', 'name3', 'totalStock'],
    });

    let hits = resp.hits || [];
    if (nq.isCodeLike && nq.compact) {
        hits = hits.filter(h => buildCompactHaystack(h).includes(nq.compact));
    }
    hits.sort((a, b) => Number(b.totalStock || 0) - Number(a.totalStock || 0));
    return hits.slice(0, safeLimit);
}

async function search(query, { limit = 50, offset = 0, matchingStrategy } = {}) {
    const nq = normalizeQuery(query);
    if (!nq.cleaned || nq.cleaned.length < 2) return { hits: [], estimatedTotalHits: 0 };

    const index = await ensureIndex();
    const qForSearch = nq.isCodeLike ? nq.compact : nq.cleaned;

    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);
    const candidateLimit = Math.min(Math.max(safeLimit * 10, 200), 1000);

    const meiliOptions = {};
    if (matchingStrategy === 'all' || matchingStrategy === 'last') {
        meiliOptions.matchingStrategy = matchingStrategy;
    }

    const resp = await index.search(qForSearch, {
        limit: candidateLimit,
        offset: safeOffset,
        attributesToRetrieve: ['id', 'itemCode', 'oemCode', 'manufacturer', 'name', 'name2', 'name3', 'totalStock'],
        ...meiliOptions
    });

    let hits = resp.hits || [];
    if (nq.isCodeLike && nq.compact) {
        hits = hits.filter(h => buildCompactHaystack(h).includes(nq.compact));
    }
    const filteredTotal = hits.length;

    hits.sort((a, b) => Number(b.totalStock || 0) - Number(a.totalStock || 0));
    const paged = hits.slice(0, safeLimit);

    return {
        ...resp,
        hits: paged,
        estimatedTotalHits: filteredTotal,
        nbHits: filteredTotal,
        offset: safeOffset,
        limit: safeLimit
    };
}

module.exports = {
    ensureIndex,
    reindexAll,
    autocomplete,
    search,
    normalizeForSearch,
    normalizeQuery
};
