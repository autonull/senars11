// Narsese Grammar for Peggy Parser v38
start
  = _ content:(Task / Term) _ { return content; }

Task "task"
  = term:Term punc:Punctuation truth:TruthValue? {
      return {
        term: term,
        punctuation: punc,
        truthValue: truth,
        taskType: punc === '?' ? 'QUESTION' : (punc === '!' ? 'GOAL' : 'BELIEF')
      };
    }

Punctuation
  = _ punc:[.!?] { return punc; }

TruthValue
  = _ "%" _ f:Float _ ";" _ c:Float _ "%" {
      if (f < 0 || f > 1 || c < 0 || c > 1) {
        error(`Truth values out of range: frequency=${f} (0-1), confidence=${c} (0-1)`);
      }
      return { frequency: f, confidence: c };
    }
  / _ "%" _ f:Float _ "%" {
      if (f < 0 || f > 1) {
        error(`Frequency value out of range: ${f} (should be 0-1)`);
      }
      return { frequency: f, confidence: 0.9 };
    }

Term "term"
  = Statement
  / CompoundTerm
  / Set
  / Variable
  / AtomicTerm

CompoundTerm
  = "(" _ op:Operator _ ","? _ components:TermList _ ")" {
      return options.termFactory.create({ operator: op, components: components });
    }
  / operator:AtomicTerm "(" _ components:TermList? _ ")" {
      return options.termFactory.create({ operator: operator.name, components: components || [] });
    }
  / "(" _ components:TermList? _ ")" {
      return options.termFactory.create({ operator: ',', components: components || [] });
    }

Statement
  = AngleBracketStatement
  / ParenthesizedStatement

AngleBracketStatement
  = "<" _ subject:Term _ op:InfixOperator _ predicate:Term _ ">" {
      return options.termFactory.create({ operator: op.trim(), components: [subject, predicate] });
    }

ParenthesizedStatement
  = "(" _ subject:Term _ op:InfixOperator _ predicate:Term _ ")" {
      return options.termFactory.create({ operator: op.trim(), components: [subject, predicate] });
    }

Operator
  = op:("-->" / "<->" / "==>" / "<=>" / "=/>" / "=|" / "=/=" / "=" / "&&" / "||" / "&|" / "&/" / "&," / "|," / "-->," / "<->," / "==>," / "<=>,") { return op.endsWith(',') ? op.slice(0, -1) : op; }

InfixOperator
  = op:("-->" / "<->" / "==>" / "<=>" / "=/>" / "=|" / "=/=" / "=" / "&&" / "||" / "&|" / "&/") { return op; }

Set
  = "{" _ components:TermList? _ "}" { return options.termFactory.create({ operator: '{}', components: components || [] }); }
  / "[" _ components:TermList? _ "]" { return options.termFactory.create({ operator: '[]', components: components || [] }); }

TermList
  = head:Term tail:(_ "," _ Term)* {
      const terms = [head];
      if (tail) {
        for (const t of tail) {
          terms.push(t[3]);
        }
      }
      return terms;
    }

AtomicTerm "atomic term"
  = chars:$([^(){}<>.,!%?; \t\n\r=&/|>-]+) { return options.termFactory.create(chars); }

Variable "variable"
  = varName:$([?$#*][^(){}<>.,!%?; \t\n\r=&/|>-]*) { return options.termFactory.create(varName); }

Float "float"
  = val:$("-"? [0-9]+ ("." [0-9]+)?) { return parseFloat(val); }

_ "whitespace"
  = [ \t\n\r]*
