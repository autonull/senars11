/**
 * WebSearchTool.js - Basic Web Search Tool
 * Provides a simple interface for web search, falling back to a mock if no API key.
 */
import { Logger } from '@senars/core';
import fetch from 'node-fetch';

export class WebSearchTool {
    constructor(config = {}) {
        this.config = config;
        this.provider = config.provider || 'mock'; // 'google', 'duckduckgo', 'mock'
        this.apiKey = config.apiKey;
        this.cx = config.cx; // For Google Custom Search
    }

    async search(query) {
        Logger.info(`[WebSearch] Searching for: ${query} (Provider: ${this.provider})`);

        try {
            switch (this.provider) {
                case 'google':
                    return await this._searchGoogle(query);
                case 'duckduckgo':
                    return await this._searchDuckDuckGo(query); // Placeholder
                case 'mock':
                default:
                    return this._searchMock(query);
            }
        } catch (error) {
            Logger.error('[WebSearch] Error:', error);
            return { error: error.message };
        }
    }

    async _searchGoogle(query) {
        if (!this.apiKey || !this.cx) {
            throw new Error('Google Search requires apiKey and cx (Context ID)');
        }

        const url = `https://www.googleapis.com/customsearch/v1?key=${this.apiKey}&cx=${this.cx}&q=${encodeURIComponent(query)}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            throw new Error(data.error.message);
        }

        return (data.items || []).map(item => ({
            title: item.title,
            link: item.link,
            snippet: item.snippet
        }));
    }

    async _searchDuckDuckGo(query) {
        // Implementing a real DDG scraper is brittle.
        // For now, we'll throw not implemented or fallback to mock.
        Logger.warn('[WebSearch] DuckDuckGo provider not fully implemented. Using mock.');
        return this._searchMock(query);
    }

    _searchMock(query) {
        // Return dummy results for testing/demo
        return [
            {
                title: `Mock Result for ${query}`,
                link: `http://example.com/search?q=${encodeURIComponent(query)}`,
                snippet: `This is a simulated search result for the query "${query}". In a real environment, this would be fetched from a search engine.`
            },
            {
                title: `Wikipedia: ${query}`,
                link: `https://en.wikipedia.org/wiki/${encodeURIComponent(query)}`,
                snippet: `Encyclopedia article about ${query}.`
            }
        ];
    }
}
