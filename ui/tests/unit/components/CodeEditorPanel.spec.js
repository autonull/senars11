import { jest } from '@jest/globals';

// Define mock factory
const mockSmartTextareaFactory = () => ({
    SmartTextarea: jest.fn().mockImplementation(() => {
        const textarea = document.createElement('textarea');
        return {
            render: () => {
                const div = document.createElement('div');
                div.appendChild(textarea);
                return div;
            },
            getValue: jest.fn().mockReturnValue('some code'),
            setValue: jest.fn(),
            textarea: textarea
        };
    })
});

// Mock module
jest.unstable_mockModule('../../../src/notebook/SmartTextarea.js', mockSmartTextareaFactory);

// Dynamic imports after mock
const { CodeEditorPanel } = await import('../../../src/components/CodeEditorPanel.js');
const { ReactiveState } = await import('../../../src/core/ReactiveState.js');
const { SmartTextarea } = await import('../../../src/notebook/SmartTextarea.js');

// Mock FluentUI fetch for loadDemos
global.fetch = jest.fn(() =>
  Promise.resolve({
    json: () => Promise.resolve({ children: [] }),
    ok: true,
    text: () => Promise.resolve('demo content')
  })
);

describe('CodeEditorPanel Component', () => {
    let container;
    let panel;
    let mockApp;

    beforeEach(() => {
        // Clear mocks
        jest.clearAllMocks();

        container = document.createElement('div');
        mockApp = {
            components: new Map(),
            commandProcessor: {
                processCommand: jest.fn()
            },
            logger: { log: jest.fn() }
        };
        panel = new CodeEditorPanel(container);
        panel.initialize(mockApp);
    });

    afterEach(() => {
        panel.destroy();
    });

    test('should render correctly', () => {
        expect(container.classList.contains('code-editor-panel')).toBe(true);
        expect(container.querySelector('.editor-toolbar')).toBeTruthy();
        expect(container.querySelector('select')).toBeTruthy();
    });

    test('should update language state when select changes', () => {
        const select = container.querySelector('select'); // The first select is language
        select.value = 'narsese';
        select.dispatchEvent(new Event('change'));

        expect(panel.state.language).toBe('narsese');
    });

    test('should update select when language state changes', () => {
        const select = container.querySelector('select');
        panel.state.language = 'narsese';
        expect(select.value).toBe('narsese');
    });

    test('should update autoRun state when checkbox changes', () => {
        const checkbox = container.querySelector('input[type="checkbox"]');
        checkbox.checked = true;
        checkbox.dispatchEvent(new Event('change'));

        expect(panel.state.autoRun).toBe(true);
    });

    test('should execute code when run button is clicked', () => {
        const runButton = container.querySelector('button.btn-primary');
        runButton.click();

        expect(mockApp.commandProcessor.processCommand).toHaveBeenCalledWith(
            'some code',
            false,
            'metta'
        );
    });

    test('should change language when demo is loaded', async () => {
        global.fetch.mockImplementation((url) => {
             if (url && url.endsWith && url.endsWith('.nars')) {
                 return Promise.resolve({
                     ok: true,
                     text: () => Promise.resolve('nars code')
                 });
             }
             return Promise.resolve({
                 json: () => Promise.resolve({ children: [] }),
                 ok: true
             });
        });

        await panel.onDemoSelect('test.nars');

        expect(panel.state.language).toBe('narsese');
    });
});
