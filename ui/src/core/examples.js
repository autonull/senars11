/**
 * @file examples.js
 * @description Examples demonstrating the new metaprogramming infrastructure
 * 
 * Shows how to use reactive state, dependency injection, event bus,
 * decorators, and fluent builders to create components with minimal boilerplate.
 */

import {
    ReactiveState,
    ServiceContainer,
    EventBus,
    $, button, div, h2, p,
    ComponentGenerator
} from './index.js';

// ============================================
// Example 1: Reactive State
// ============================================

function example1_ReactiveState() {
    console.log('=== Example 1: Reactive State ===');

    // Create reactive state
    const state = new ReactiveState({
        count: 0,
        name: 'Test'
    });

    // Watch for changes
    state.watch('count', (newVal, oldVal) => {
        console.log(`Count changed: ${oldVal} → ${newVal}`);
    });

    // Computed properties with automatic dependency tracking
    state.computed('message', function () {
        return `${this.name} count: ${this.count}`;
    });

    state.watch('message', (newVal) => {
        console.log(`Message updated: ${newVal}`);
    });

    // Trigger updates
    state.count = 5;  // Logs: Count changed: 0 → 5, Message updated: Test count: 5
    state.name = 'Demo'; // Logs: Message updated: Demo count: 5

    // Batch updates
    state.batch(() => {
        state.count = 10;
        state.name = 'Batch';
    }); // Only triggers once at the end
}

// ============================================
// Example 2: Service Container
// ============================================

function example2_ServiceContainer() {
    console.log('=== Example 2: Dependency Injection ===');

    const container = ServiceContainer.instance;

    // Define services
    class Logger {
        log(message) {
            console.log(`[Logger] ${message}`);
        }
    }

    class DataService {
        constructor(logger) {
            this.logger = logger;
        }

        fetchData() {
            this.logger.log('Fetching data...');
            return { data: 'example' };
        }
    }

    // Register services
    container.register('logger', Logger, { lifecycle: 'singleton' });
    container.register('dataService', DataService, {
        lifecycle: 'singleton',
        dependencies: ['logger']
    });

    // Resolve with automatic DI
    const dataService = container.resolve('dataService');
    dataService.fetchData(); // Logs: [Logger] Fetching data...
}

// ============================================
// Example 3: Event Bus
// ============================================

function example3_EventBus() {
    console.log('=== Example 3: Event Bus ===');

    const bus = EventBus.instance;

    // Subscribe to specific events
    bus.on('user:login', (data) => {
        console.log('User logged in:', data.username);
    });

    // Wildcard subscriptions
    bus.on('user:*', (data, event) => {
        console.log(`User event occurred: ${event}`);
    });

    // Middleware
    bus.use((event, payload, next) => {
        console.log(`[Middleware] Event: ${event}`);
        next();
    });

    // Emit events
    bus.emit('user:login', { username: 'alice' });
    // Logs:
    // [Middleware] Event: user:login  
    // User event occurred: user:login
    // User logged in: alice
}

// ============================================
// Example 4: Fluent Component Builder
// ============================================

function example4_ComponentBuilder() {
    console.log('=== Example 4: Component Builder ===');

    // Build UI programmatically
    const counterApp = div()
        .class('counter-app')
        .child(
            h2('Counter Demo'),
            div()
                .class('counter-display')
                .id('count-display')
                .text('Count: 0'),
            button('Increment')
                .class('btn', 'btn-primary')
                .on('click', () => {
                    const display = document.getElementById('count-display');
                    const count = parseInt(display.textContent.split(': ')[1]) + 1;
                    display.textContent = `Count: ${count}`;
                })
        )
        .build();

    console.log('Built counter app element:', counterApp);
    // Can mount: document.body.appendChild(counterApp);
}

// ============================================
// Example 5: Component Generator
// ============================================

function example5_ComponentGenerator() {
    console.log('=== Example 5: Component Generator ===');

    // Generate a widget with one line
    const StatsWidget = ComponentGenerator.widget('stats', function (data) {
        this.element.innerHTML = `
            <div class="stat">
                <span class="label">${data.label}</span>
                <span class="value">${data.value}</span>
            </div>
        `;
    });

    // Use the generated widget
    const container = document.createElement('div');
    const widget = new StatsWidget(container);
    widget.initialize();
    widget.update({ label: 'Users', value: 42 });

    console.log('Generated widget:', widget);
}

// ============================================
// Example 6: Complete Component with All Patterns
// ============================================

class TodoApp {
    constructor(container) {
        this.container = container;
        this.state = new ReactiveState({
            todos: [],
            filter: 'all'
        });

        // Computed filtered todos
        this.state.computed('filteredTodos', function () {
            if (this.filter === 'all') return this.todos;
            if (this.filter === 'active') return this.todos.filter(t => !t.done);
            if (this.filter === 'completed') return this.todos.filter(t => t.done);
        });

        // Watch for changes and re-render
        this.state.watch('filteredTodos', () => this.renderTodos());
    }

    initialize() {
        // Build UI with fluent builder
        this.element = div()
            .class('todo-app')
            .child(
                h2('Todo List'),
                div()
                    .class('add-todo')
                    .child(
                        this.input = $('input')
                            .attr('placeholder', 'Add todo...')
                            .on('keypress', (e) => {
                                if (e.key === 'Enter') this.addTodo();
                            })
                            .build(),
                        button('Add')
                            .on('click', () => this.addTodo())
                    ),
                this.todoList = div().class('todo-list').build(),
                div()
                    .class('filters')
                    .child(
                        button('All').on('click', () => this.setFilter('all')),
                        button('Active').on('click', () => this.setFilter('active')),
                        button('Completed').on('click', () => this.setFilter('completed'))
                    )
            )
            .mount(this.container);
    }

    addTodo() {
        const text = this.input.value.trim();
        if (!text) return;

        this.state.todos = [
            ...this.state.todos,
            { id: Date.now(), text, done: false }
        ];

        this.input.value = '';
    }

    toggleTodo(id) {
        this.state.todos = this.state.todos.map(todo =>
            todo.id === id ? { ...todo, done: !todo.done } : todo
        );
    }

    setFilter(filter) {
        this.state.filter = filter;
    }

    renderTodos() {
        this.todoList.innerHTML = '';

        this.state.filteredTodos.forEach(todo => {
            const todoEl = div()
                .class('todo-item', todo.done ? 'done' : '')
                .child(
                    $('input')
                        .attr('type', 'checkbox')
                        .apply(b => {
                            if (todo.done) b.attr('checked', 'checked');
                        })
                        .on('change', () => this.toggleTodo(todo.id)),
                    $('span').text(todo.text)
                )
                .build();

            this.todoList.appendChild(todoEl);
        });
    }
}

// ============================================
// Run Examples
// ============================================

export function runExamples() {
    example1_ReactiveState();
    console.log('');

    example2_ServiceContainer();
    console.log('');

    example3_EventBus();
    console.log('');

    example4_ComponentBuilder();
    console.log('');

    example5_ComponentGenerator();
    console.log('');

    console.log('=== Example 6: Complete Todo App ===');
    console.log('Todo app ready - mount to container to use');
    // const app = new TodoApp(document.getElementById('app'));
    // app.initialize();
}

// Export for use in demos
export { TodoApp };
