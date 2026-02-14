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
                    componentName: 'replComponent',
                    title: 'REPL',
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
                            componentName: 'replComponent',
                            title: 'REPL',
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
                        componentName: 'replComponent',
                        title: 'CONSOLE',
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
                    componentName: 'replComponent',
                    title: 'REPL',
                    width: 70,
                    isClosable: false
                }
            ]
        }
    }
};
