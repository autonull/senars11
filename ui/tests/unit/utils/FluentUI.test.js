import { describe, expect, test, jest } from '@jest/globals';
import { FluentUI, $ } from '../../../src/utils/FluentUI.js';

describe('FluentUI', () => {
    test('should create a new element', () => {
        const fluent = new FluentUI('div');
        expect(fluent.element.tagName).toBe('DIV');
    });

    test('should set attributes via constructor', () => {
        const fluent = $('input', { type: 'text', value: 'hello' });
        expect(fluent.element.getAttribute('type')).toBe('text');
        expect(fluent.element.value).toBe('hello');
    });

    test('should set ID and class', () => {
        const fluent = $('div').id('my-id').class('class1', 'class2');
        expect(fluent.element.id).toBe('my-id');
        expect(fluent.element.className).toBe('class1 class2');
    });

    test('should set styles', () => {
        const fluent = $('div').style({ color: 'red', fontSize: '12px' });
        expect(fluent.element.style.color).toBe('red');
        expect(fluent.element.style.fontSize).toBe('12px');
    });

    test('should add event listeners', () => {
        const handler = jest.fn();
        const fluent = $('button').on('click', handler);
        fluent.element.click();
        expect(handler).toHaveBeenCalled();
    });

    test('should append children', () => {
        const fluent = $('div').child($('span').text('hello'));
        expect(fluent.element.children.length).toBe(1);
        expect(fluent.element.children[0].tagName).toBe('SPAN');
        expect(fluent.element.children[0].textContent).toBe('hello');
    });

    test('should handle conditional children', () => {
        const fluent = $('ul')
            .childIf(true, $('li').text('item 1'))
            .childIf(false, $('li').text('item 2'));
        expect(fluent.element.children.length).toBe(1);
        expect(fluent.element.children[0].textContent).toBe('item 1');
    });
});
