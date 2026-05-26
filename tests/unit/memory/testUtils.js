import {Concept, Task, TermFactory} from '@senars/nar';

export const tf = new TermFactory();

export const createAtom = (name) => tf.atomic(name);

export const createTask = (term, priority = 0.5, frequency = 0.9, confidence = 0.8) => new Task({
    term,
    budget: {priority},
    truth: {frequency, confidence}
});

export const createConcept = (term, config = Concept.DEFAULT_CONFIG) => new Concept(term, config);

export const createInheritance = (subject, predicate) => tf.inheritance(
    typeof subject === 'string' ? createAtom(subject) : subject,
    typeof predicate === 'string' ? createAtom(predicate) : predicate
);

export const createSimilarity = (t1, t2) => tf.similarity(
    typeof t1 === 'string' ? createAtom(t1) : t1,
    typeof t2 === 'string' ? createAtom(t2) : t2
);

export const createImplication = (antecedent, consequent) => tf.implication(
    typeof antecedent === 'string' ? createAtom(antecedent) : antecedent,
    typeof consequent === 'string' ? createAtom(consequent) : consequent
);

export const createConjunction = (...terms) => tf.conjunction(
    ...terms.map(t => typeof t === 'string' ? createAtom(t) : t)
);
