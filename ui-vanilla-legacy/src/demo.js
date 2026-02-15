export const demos = {
  "Simple Inheritance": [
    '<{cat} --> animal>.',
    '<{lion} --> cat>.',
    '<lion --> animal>?',
    '10',
    '<{tiger} --> cat>.',
    '<tiger --> animal>?',
    '10'
  ],
  "Compound Terms": [
    '<(cat & black) --> entity>.',
    '<(dog & white) --> entity>.',
    '<{fluffy} --> (cat & white)>.',
    '<{fluffy} --> cat>?',
    '10'
  ],
  "Conditional Statements": [
    '<(a & b) ==> c>.',
    '<a & b>.',
    '<c>?',
    '10'
  ],
  "Variable Reasoning": [
    '<?x --> animal>.',
    '<?x --> (mammal & pet)>?',
    '<{cat} --> mammal>.',
    '<{cat} --> pet>.',
    '10'
  ],
  "Truth Values": [
    '<cat --> animal>. %1.0;0.9%',
    '<bird --> flyer>. %0.8;0.7%',
    '<{tweety} --> bird>?',
    '10'
  ],
  "Basic Demo": [
    '<a --> b>.',
    '<b --> c>.',
    '<a --> c>?',
    '20'
  ]
};
