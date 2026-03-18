import { ReactiveState } from '../core/ReactiveState.js';
import { Component } from './Component.js';
import { FluentUI } from '../utils/FluentUI.js';

export class AgentChat extends Component {
    constructor(container) {
        super(container);
        this.state = new ReactiveState({
            messages: [],
            inputText: ''
        });

        this.state.watch('messages', () => this.renderMessages());
    }

    initialize() {
        this.render();
        this.addMessage('agent', 'Hello! I am a simple agent. How can I help you?');
    }

    addMessage(role, text) {
        this.state.messages = [...this.state.messages, { role, text, time: new Date() }];
    }

    sendMessage() {
        const text = this.inputEl.value.trim();
        if (!text) return;

        this.addMessage('user', text);
        this.inputEl.value = '';

        // Simulate agent response
        setTimeout(() => {
            this.addMessage('agent', `I received: "${text}". This is a simulated response.`);
        }, 1000);
    }

    render() {
        if (!this.container) return;

        const ui = FluentUI.create(this.container)
            .clear()
            .class('chat-container');

        // Messages Area
        ui.child(
            FluentUI.create('div')
                .class('messages')
                .id('messages-list')
        );

        // Input Area
        const inputArea = FluentUI.create('div').class('input-area').mount(ui);

        this.inputEl = FluentUI.create('input')
            .attr({ placeholder: 'Type a message...' })
            .on('keydown', (e) => {
                if (e.key === 'Enter') this.sendMessage();
            })
            .mount(inputArea)
            .dom;

        FluentUI.create('button')
            .text('Send')
            .on('click', () => this.sendMessage())
            .mount(inputArea);

        this.messagesList = this.container.querySelector('#messages-list');
        this.renderMessages();
    }

    renderMessages() {
        if (!this.messagesList) return;

        const container = FluentUI.create(this.messagesList).clear();

        this.state.messages.forEach(msg => {
            container.child(
                FluentUI.create('div')
                    .class('message', msg.role)
                    .text(`${msg.role === 'agent' ? '🤖' : '👤'} ${msg.text}`)
            );
        });

        this.messagesList.scrollTop = this.messagesList.scrollHeight;
    }
}
