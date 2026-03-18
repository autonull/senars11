import { ChartWidget } from './ChartWidget.js';
import { SimpleGraphWidget } from './SimpleGraphWidget.js';
import { TaskTreeWidget } from './TaskTreeWidget.js';
import { TruthSlider } from './TruthSlider.js';
import { MetricsWidget } from './MetricsWidget.js';
import { DerivationWidget } from './DerivationWidget.js';
import { TimelineWidget } from './TimelineWidget.js';
import { VariableInspector } from './VariableInspector.js';
import { SubNotebook } from './SubNotebook.js';

export class WidgetFactory {
    static REGISTRY = {
        'chart': ChartWidget,
        'graph': SimpleGraphWidget,
        'tree': TaskTreeWidget,
        'slider': TruthSlider,
        'metrics': MetricsWidget,
        'derivation': DerivationWidget,
        'timeline': TimelineWidget,
        'variables': VariableInspector,
        'subnotebook': SubNotebook,
        'ChartWidget': ChartWidget,
        'SimpleGraphWidget': SimpleGraphWidget,
        'GraphWidget': SimpleGraphWidget,
        'TaskTreeWidget': TaskTreeWidget,
        'TruthSlider': TruthSlider,
        'MetricsWidget': MetricsWidget,
        'DerivationWidget': DerivationWidget,
        'TimelineWidget': TimelineWidget,
        'VariableInspector': VariableInspector,
        'SubNotebook': SubNotebook
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
