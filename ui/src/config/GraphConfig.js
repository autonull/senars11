/**
 * Graph configuration constants and styles
 */
export const GraphConfig = {
  DEFAULT_NODE_WEIGHT: 50,
  TASK_NODE_WEIGHT: 30,
  QUESTION_NODE_WEIGHT: 40,
  
  GRAPH_COLORS: {
    NODE_COLOR: '#4ec9b0',
    CONCEPT_COLOR: '#4ec9b0',
    TASK_COLOR: '#ff8c00',
    QUESTION_COLOR: '#9d68f0',
    EDGE_COLOR: '#dcdcdc'
  },
  
  getGraphStyle() {
    const { CONCEPT_COLOR, TASK_COLOR, QUESTION_COLOR, EDGE_COLOR, NODE_COLOR } = this.GRAPH_COLORS;

    return [
      {
        selector: 'node',
        style: {
          'background-color': NODE_COLOR,
          'label': 'data(label)',
          'text-valign': 'center',
          'text-halign': 'center',
          'color': '#ffffff',
          'font-size': '12px',
          'width': 'mapData(weight, 0, 100, 20, 80)',
          'height': 'mapData(weight, 0, 100, 20, 80)'
        }
      },
      {
        selector: 'edge',
        style: {
          'width': 2,
          'line-color': EDGE_COLOR,
          'target-arrow-color': EDGE_COLOR,
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier'
        }
      },
      {
        selector: 'node[type = "concept"]',
        style: {
          'background-color': CONCEPT_COLOR
        }
      },
      {
        selector: 'node[type = "task"]',
        style: {
          'background-color': TASK_COLOR
        }
      },
      {
        selector: 'node[type = "question"]',
        style: {
          'background-color': QUESTION_COLOR
        }
      }
    ];
  },
  
  getGraphLayout() {
    return { name: 'cose' };
  }
};