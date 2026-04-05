import { Logger } from '@senars/core';

export class WebSearchTool {
    constructor(config = {}) {
        this.config = config;
        this.provider = config.provider || 'mock';
        this.apiKey = config.apiKey;
        this.cx = config.cx;
    }

    async search(query) {
        Logger.info(`[WebSearch] Searching for: ${query} (Provider: ${this.provider})`);
        try {
            switch (this.provider) {
                case 'google': return await this._searchGoogle(query);
                case 'duckduckgo': return await this._searchDuckDuckGo(query);
                case 'mock':
                default: return this._searchMock(query);
            }
        } catch (error) {
            Logger.error('[WebSearch] Error:', error);
            if (this.provider !== 'mock') {
                Logger.warn('[WebSearch] Falling back to mock results due to error.');
                return this._searchMock(query);
            }
            return { error: error.message };
        }
    }

    async _searchGoogle(query) {
        if (!this.apiKey || !this.cx) {
            Logger.warn('[WebSearch] Google Search keys missing. Falling back to mock.');
            return this._searchMock(query);
        }
        const url = `https://www.googleapis.com/customsearch/v1?key=${this.apiKey}&cx=${this.cx}&q=${encodeURIComponent(query)}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Google Search API failed with status ${response.status}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        return (data.items || []).map(item => ({ title: item.title, link: item.link, snippet: item.snippet }));
    }

    async _searchDuckDuckGo(query) {
        Logger.warn('[WebSearch] DuckDuckGo provider not fully implemented. Using mock.');
        return this._searchMock(query);
    }

    _searchMock(query) {
        return [
            { title: `Mock Result for ${query}`, link: `http://example.com/search?q=${encodeURIComponent(query)}`, snippet: `This is a simulated search result for the query "${query}". In a real environment, this would be fetched from a search engine.` },
            { title: `Wikipedia: ${query}`, link: `https://en.wikipedia.org/wiki/${encodeURIComponent(query)}`, snippet: `Encyclopedia article about ${query}.` }
        ];
    }
}
