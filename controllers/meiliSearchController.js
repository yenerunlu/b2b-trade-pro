const meiliSearchService = require('../services/meiliSearchService');

class MeiliSearchController {
    async autocomplete(req, res) {
        try {
            const { query, q, limit = 15 } = req.body || {};
            const term = (query || q || '').toString();

            const hits = await meiliSearchService.autocomplete(term, { limit });

            res.json({
                success: true,
                query: term,
                count: hits.length,
                hits
            });
        } catch (error) {
            console.error('❌ Meili autocomplete error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async search(req, res) {
        try {
            const { query, q, limit = 50, offset = 0 } = req.body || {};
            const term = (query || q || '').toString();

            const result = await meiliSearchService.search(term, { limit, offset });

            const estimatedTotalHits =
                (result && result.estimatedTotalHits !== undefined)
                    ? result.estimatedTotalHits
                    : (result && result.nbHits !== undefined)
                        ? result.nbHits
                        : 0;

            res.json({
                success: true,
                query: term,
                count: (result.hits || []).length,
                estimated_total_hits: estimatedTotalHits,
                hits: result.hits || [],
                offset: (result && result.offset !== undefined) ? result.offset : offset,
                limit: (result && result.limit !== undefined) ? result.limit : limit
            });
        } catch (error) {
            console.error('❌ Meili search error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async reindex(req, res) {
        try {
            const { batchSize = 5000 } = req.body || {};
            const result = await meiliSearchService.reindexAll({ batchSize: parseInt(batchSize, 10) || 5000 });
            res.json({ success: true, result });
        } catch (error) {
            console.error('❌ Meili reindex error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }
}

module.exports = new MeiliSearchController();
