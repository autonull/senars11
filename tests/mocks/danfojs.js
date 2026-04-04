class MockDataFrame {
    constructor(data) { this._data = data || []; }
    get values() { return Array.isArray(this._data) ? this._data : []; }
    get columns() { return this._data?.length > 0 ? Object.keys(this._data[0]) : []; }
    async toCSV() { return ''; }
    async toTensor() { return []; }
    head(n = 5) { return this._data.slice(0, n); }
    tail(n = 5) { return this._data.slice(-n); }
    get shape() { return [this._data.length, this.columns.length]; }
}

export const DataFrame = MockDataFrame;
export default { DataFrame: MockDataFrame };
