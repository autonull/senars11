export const EVENTS = {
    CONCEPT_SELECT: 'senars:concept:select',
    NOTEBOOK_ADD_CELL: 'senars:notebook:add-cell',
    NOTEBOOK_CELL_ADDED: 'notebook:cell:added',
    NOTEBOOK_CELL_REMOVED: 'notebook:cell:removed',
    NOTEBOOK_CELL_EXECUTED: 'notebook:cell:executed',
    GRAPH_FILTER: 'senars:graph:filter',
    SETTINGS_UPDATED: 'senars:settings:updated',
    MEMORY_REFRESH: 'senars:memory:refresh'
};

export const COMPONENTS = {
    NOTEBOOK: 'notebookComponent',
    GRAPH: 'graphComponent',
    MEMORY: 'memoryComponent',
    DERIVATION: 'derivationComponent',
    METRICS: 'metricsComponent',
    SETTINGS: 'settingsComponent',
    EXAMPLES: 'examplesComponent',
    EDITOR: 'editorComponent'
};

export const STORAGE_KEYS = {
    SETTINGS: 'senars-ide-settings',
    LAYOUT_PREFIX: 'senars-layout-',
    THEME: 'senars-theme',
    NOTEBOOK_CONTENT: 'senars-notebook-content',
    MESSAGE_FILTERS: 'senars-message-filters-v2',
    REPL_HISTORY: 'senars-repl-history'
};

export const MODES = {
    LOCAL: 'local',
    REMOTE: 'remote'
};
