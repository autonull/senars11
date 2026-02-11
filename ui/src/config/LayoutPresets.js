export const LayoutPresets = {
    ide: {
        settings: {
            hasHeaders: true,
            constrainDragToContainer: true,
            reorderEnabled: true,
            selectionEnabled: false,
            showPopoutIcon: false,
            showMaximiseIcon: true,
            showCloseIcon: false
        },
        dimensions: {
            borderWidth: 2,
            minItemHeight: 100,
            minItemWidth: 200,
            headerHeight: 24
        },
        root: {
            type: 'row',
            content: [
                {
                    type: 'component',
                    componentName: 'notebookComponent',
                    title: 'NOTEBOOK',
                    width: 70
                },
                {
                    type: 'stack',
                    width: 30,
                    isClosable: true,
                    content: [
                        { type: 'component', componentName: 'graphComponent', title: 'KNOWLEDGE GRAPH', isClosable: true },
                        { type: 'component', componentName: 'memoryComponent', title: 'MEMORY INSPECTOR' },
                        { type: 'component', componentName: 'derivationComponent', title: 'DERIVATION TRACER' },
                        { type: 'component', componentName: 'metricsComponent', title: 'SYSTEM METRICS' },
                        { type: 'component', componentName: 'settingsComponent', title: 'SETTINGS' }
                    ]
                }
            ]
        }
    },
    code: {
        settings: {
            hasHeaders: true,
            constrainDragToContainer: true,
            reorderEnabled: true,
            selectionEnabled: false,
            showPopoutIcon: false,
            showMaximiseIcon: true,
            showCloseIcon: false
        },
        dimensions: {
            borderWidth: 2,
            minItemHeight: 100,
            minItemWidth: 200,
            headerHeight: 24
        },
        root: {
            type: 'row',
            content: [
                {
                    type: 'component',
                    componentName: 'editorComponent',
                    title: 'CODE EDITOR',
                    width: 50,
                    isClosable: false
                },
                {
                    type: 'column',
                    width: 50,
                    content: [
                        {
                            type: 'component',
                            componentName: 'notebookComponent',
                            title: 'OUTPUT / CONSOLE',
                            height: 70,
                            isClosable: false,
                            componentState: { hideInput: true }
                        },
                        {
                            type: 'stack',
                            height: 30,
                            content: [
                                { type: 'component', componentName: 'metricsComponent', title: 'METRICS' },
                                { type: 'component', componentName: 'graphComponent', title: 'GRAPH' }
                            ]
                        }
                    ]
                }
            ]
        }
    },
    canvas: {
        settings: {
            hasHeaders: true,
            constrainDragToContainer: true,
            reorderEnabled: true,
            selectionEnabled: false,
            showPopoutIcon: true,
            showMaximiseIcon: true,
            showCloseIcon: false
        },
        dimensions: {
            borderWidth: 2,
            headerHeight: 24
        },
        root: {
            type: 'column',
            content: [
                {
                    type: 'component',
                    componentName: 'graphComponent',
                    title: 'GRAPH CANVAS',
                    height: 80,
                    componentState: { label: 'Canvas' }
                },
                {
                    type: 'component',
                    componentName: 'notebookComponent',
                    title: 'CONSOLE',
                    height: 20
                }
            ]
        }
    },
    split: {
        settings: {
            hasHeaders: true,
            constrainDragToContainer: true,
            reorderEnabled: true,
            selectionEnabled: false,
            showPopoutIcon: false,
            showMaximiseIcon: true,
            showCloseIcon: false
        },
        root: {
            type: 'row',
            content: [
                {
                    type: 'component',
                    componentName: 'editorComponent',
                    title: 'SOURCE',
                    width: 50
                },
                {
                    type: 'component',
                    componentName: 'notebookComponent',
                    title: 'OUTPUT',
                    width: 50,
                    componentState: { hideInput: true }
                }
            ]
        }
    },
    repl: {
        settings: {
            hasHeaders: true,
            constrainDragToContainer: true,
            reorderEnabled: true,
            selectionEnabled: false,
            showPopoutIcon: true,
            showMaximiseIcon: true,
            showCloseIcon: false
        },
        dimensions: {
            borderWidth: 2,
            headerHeight: 24
        },
        root: {
            type: 'row',
            content: [
                {
                    type: 'stack',
                    width: 100,
                    content: [
                        {
                            type: 'component',
                            componentName: 'notebookComponent',
                            title: 'NOTEBOOK',
                            isClosable: false
                        },
                        {
                            type: 'component',
                            componentName: 'graphComponent',
                            title: 'GRAPH (Hidden)',
                            componentState: { label: 'Graph' }
                        }
                    ]
                }
            ]
        }
    },
    dashboard: {
        settings: {
            hasHeaders: true,
            constrainDragToContainer: true,
            reorderEnabled: true,
            selectionEnabled: false,
            showPopoutIcon: true,
            showMaximiseIcon: true,
            showCloseIcon: false
        },
        dimensions: {
            borderWidth: 2,
            minItemHeight: 10,
            minItemWidth: 10,
            headerHeight: 24
        },
        root: {
            type: 'row',
            content: [{
                type: 'component',
                componentName: 'graphComponent',
                title: 'KNOWLEDGE GRAPH',
                width: 60,
                componentState: { label: 'Graph' }
            }, {
                type: 'stack',
                width: 40,
                content: [
                    {
                        type: 'component',
                        componentName: 'notebookComponent',
                        title: 'NOTEBOOK',
                        isClosable: false
                    },
                    {
                        type: 'component',
                        componentName: 'derivationComponent',
                        title: 'DERIVATION TREE'
                    },
                    {
                        type: 'component',
                        componentName: 'memoryComponent',
                        title: 'MEMORY INSPECTOR'
                    },
                    {
                        type: 'component',
                        componentName: 'metricsComponent',
                        title: 'METRICS'
                    },
                    {
                        type: 'component',
                        componentName: 'settingsComponent',
                        title: 'SETTINGS'
                    }
                ]
            }]
        }
    },
    demo: {
        settings: {
            hasHeaders: true,
            constrainDragToContainer: true,
            reorderEnabled: false,
            selectionEnabled: false,
            popoutWholeStack: false,
            blockedPopoutsThrowError: true,
            closePopoutsOnUnload: true,
            showPopoutIcon: false,
            showMaximiseIcon: true,
            showCloseIcon: true // Allow closing to support minimal view
        },
        dimensions: {
            borderWidth: 2,
            headerHeight: 24
        },
        root: {
            type: 'row',
            content: [
                {
                    type: 'component',
                    componentName: 'examplesComponent',
                    title: 'DEMO LIBRARY',
                    width: 20,
                    isClosable: false
                },
                {
                    type: 'component',
                    componentName: 'notebookComponent',
                    title: 'NOTEBOOK',
                    width: 40,
                    isClosable: false
                },
                {
                    type: 'column',
                    width: 40,
                    isClosable: true,
                    content: [
                        {
                            type: 'component',
                            componentName: 'graphComponent',
                            title: 'KNOWLEDGE GRAPH',
                            height: 70,
                            componentState: { label: 'Graph' },
                            isClosable: true
                        },
                        {
                            type: 'component',
                            componentName: 'metricsComponent',
                            title: 'SYSTEM METRICS',
                            height: 30,
                            isClosable: true
                        }
                    ]
                }
            ]
        }
    },
    demo_minimal: {
        settings: {
            hasHeaders: true,
            constrainDragToContainer: true,
            reorderEnabled: false,
            selectionEnabled: false,
            popoutWholeStack: false,
            blockedPopoutsThrowError: true,
            closePopoutsOnUnload: true,
            showPopoutIcon: false,
            showMaximiseIcon: true,
            showCloseIcon: false
        },
        dimensions: {
            borderWidth: 2,
            headerHeight: 24
        },
        root: {
            type: 'row',
            content: [
                {
                    type: 'component',
                    componentName: 'examplesComponent',
                    title: 'DEMO LIBRARY',
                    width: 30,
                    isClosable: false
                },
                {
                    type: 'component',
                    componentName: 'notebookComponent',
                    title: 'NOTEBOOK',
                    width: 70,
                    isClosable: false
                }
            ]
        }
    }
};
