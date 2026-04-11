/**
 * SemanticZoom manages detail levels based on zoom scale.
 */
export class SemanticZoom {
    constructor(graphSystem) {
        this.graph = graphSystem;
        this.currentLevel = 'overview';

        // Thresholds
        this.levels = {
            overview: { min: 0, max: 0.8 },
            component: { min: 0.8, max: 2.0 },
            detail: { min: 2.0, max: 10.0 }
        };

        this._setupListener();
    }

    _setupListener() {
        this.graph.on('viewport', (data) => {
            this._checkZoomLevel(data.zoom);
        });
    }

    _checkZoomLevel(zoom) {
        let newLevel = this.currentLevel;

        if (zoom < this.levels.overview.max) {
            newLevel = 'overview';
        } else if (zoom < this.levels.component.max) {
            newLevel = 'component';
        } else {
            newLevel = 'detail';
        }

        if (newLevel !== this.currentLevel) {
            const oldLevel = this.currentLevel;
            this.currentLevel = newLevel;
            this.graph.emit('zoomLevelChange', {
                level: newLevel,
                oldLevel,
                zoom
            });
            this._updateStyles(newLevel);
        }
    }

    _updateStyles(level) {
        const {cy} = this.graph;
        if (!cy) {return;}

        // Note: SeNARS styles are complex and managed by Config.js.
        // Overriding them simply here might break the look.
        // Instead of overriding, we might just add classes to the container or nodes?
        // Or we can rely on data attributes that stylesheet uses.

        // However, for ZUI effect, we want to hide details in overview.

        cy.batch(() => {
            if (level === 'overview') {
                cy.nodes().removeClass('detail-mode component-mode').addClass('overview-mode');
                // Force label visibility off in overview if not handled by CSS
                // cy.nodes().style({ 'label': '' });
            } else if (level === 'component') {
                cy.nodes().removeClass('overview-mode detail-mode').addClass('component-mode');
                // cy.nodes().style({ 'label': 'data(label)', 'font-size': '10px' });
            } else {
                cy.nodes().removeClass('overview-mode component-mode').addClass('detail-mode');
                // cy.nodes().style({ 'label': 'data(label)', 'font-size': '12px' });
            }
        });
    }
}
