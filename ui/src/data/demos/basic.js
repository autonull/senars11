export const basicDemos = {
    "Solar System": {
        "description": "A hierarchical view of celestial bodies.",
        "concepts": [
            { "term": "Sun", "priority": 0.99, "type": "concept" },
            { "term": "Planet", "priority": 0.90, "type": "concept" },
            { "term": "Earth", "priority": 0.95, "type": "concept" },
            { "term": "Mars", "priority": 0.90, "type": "concept" },
            { "term": "Jupiter", "priority": 0.92, "type": "concept" },
            { "term": "Moon", "priority": 0.85, "type": "concept" },
            { "term": "Phobos", "priority": 0.80, "type": "concept" },
            { "term": "Deimos", "priority": 0.80, "type": "concept" },
            { "term": "Europa", "priority": 0.85, "type": "concept" },
            { "term": "Io", "priority": 0.85, "type": "concept" },
            { "term": "Ganymede", "priority": 0.85, "type": "concept" },
            { "term": "Star", "priority": 0.95, "type": "concept" }
        ],
        "relationships": [
            ["Sun", "Star", "inheritance"],
            ["Earth", "Planet", "inheritance"],
            ["Mars", "Planet", "inheritance"],
            ["Jupiter", "Planet", "inheritance"],
            ["Earth", "Sun", "implication"],
            ["Moon", "Earth", "implication"],
            ["Phobos", "Mars", "implication"],
            ["Deimos", "Mars", "implication"],
            ["Europa", "Jupiter", "implication"],
            ["Io", "Jupiter", "implication"],
            ["Ganymede", "Jupiter", "implication"]
        ]
    },
    "Logic Chain": {
        "description": "Classic syllogistic reasoning structure.",
        "concepts": [
            { "term": "Socrates", "priority": 0.95, "type": "concept" },
            { "term": "Human", "priority": 0.90, "type": "concept" },
            { "term": "Mortal", "priority": 0.85, "type": "concept" },
            { "term": "Living_Thing", "priority": 0.80, "type": "concept" }
        ],
        "relationships": [
            ["Socrates", "Human", "inheritance"],
            ["Human", "Mortal", "inheritance"],
            ["Mortal", "Living_Thing", "inheritance"],
            ["Socrates", "Mortal", "implication"]
        ]
    },
    "Stress Test": {
        "description": "High volume of random nodes to test the Bag limit.",
        "concepts": [],
        "relationships": []
    },
    "Complex Interaction": {
        "description": "Simulated reasoning session via Narsese script.",
        "concepts": [],
        "relationships": [],
        "script": [
            "<cat --> animal>.",
            "<animal --> living>.",
            "<dog --> animal>.",
            "(-->, cat, meow).",
            "<cat --> ?x>?",
            "<tiger --> cat>.",
            "<tiger --> ?x>?"
        ]
    }
};
