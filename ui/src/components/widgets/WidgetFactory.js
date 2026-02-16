import { ChartWidget } from './ChartWidget.js';
import { SimpleGraphWidget } from './SimpleGraphWidget.js';
import { TruthSlider } from './TruthSlider.js';

export class WidgetFactory {
    static REGISTRY = {
        'chart': ChartWidget,
        'graph': SimpleGraphWidget,
        'slider': TruthSlider,
        'ChartWidget': ChartWidget,
        'SimpleGraphWidget': SimpleGraphWidget,
        'TruthSlider': TruthSlider
    };

    static register(type, Class) {
        this.REGISTRY[type] = Class;
    }

    static createWidget(type, container, config = {}) {
        const WidgetClass = this.REGISTRY[type];
        if (!WidgetClass) {
            console.warn(`Widget type '${type}' not found.`);
            return null;
        }
        return new WidgetClass(container, config);
    }
}
