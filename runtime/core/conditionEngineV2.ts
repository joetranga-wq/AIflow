// runtime/core/conditionEngineV2.ts

export type ComparisonOp = '==' | '!=' | '>' | '<' | '>=' | '<=';
export type LogicalOp = 'AND' | 'OR';

export type ConditionAst =
  | { type: 'literal'; value: any }
  | { type: 'path'; parts: string[] }
  | { type: 'comparison'; op: ComparisonOp; left: ConditionAst; right: ConditionAst }
  | { type: 'logical'; op: LogicalOp; left: ConditionAst; right: ConditionAst }
  | { type: 'not'; expr: ConditionAst }
  | { type: 'call'; fn: 'contains'; args: ConditionAst[] };

type TokenType =
  | 'IDENT'
  | 'STRING'
  | 'NUMBER'
  | 'OP'
  | 'LPAREN'
  | 'RPAREN'
  | 'COMMA'
  | 'EOF';

interface Token {
  type: TokenType;
  value?: string;
}

class Lexer {
  private pos = 0;
  private currentChar: string | undefined;
  private input: string;

  constructor(input: string) {
    this.input = input;
    this.currentChar = input[this.pos];
  }

  private advance(): void {
    this.pos += 1;
    this.currentChar =
      this.pos < this.input.length ? this.input[this.pos] : undefined;
  }

  private skipWhitespace(): void {
    while (this.currentChar && /\s/.test(this.currentChar)) {
      this.advance();
    }
  }

  private readWhile(predicate: (ch: string | undefined) => boolean): string {
    let result = '';
    while (predicate(this.currentChar)) {
      result += this.currentChar;
      this.advance();
    }
    return result;
  }

  private readIdentifier(): string {
    return this.readWhile((ch) => !!ch && /[A-Za-z0-9_\.]/.test(ch));
  }

  private readNumber(): string {
    return this.readWhile((ch) => !!ch && /[0-9\.]/.test(ch));
  }

  private readString(quoteChar: string): string {
    // Strings kunnen zowel single ('...') als double ("...") quoted zijn.
    let result = '';
    this.advance(); // skip opening quote

    while (this.currentChar && this.currentChar !== quoteChar) {
      // simpele escape support: \" of \'
      if (this.currentChar === '\\') {
        this.advance();
        if (!this.currentChar) break;
        result += this.currentChar;
        this.advance();
        continue;
      }
      result += this.currentChar;
      this.advance();
    }

    // sluitende quote (indien aanwezig) overslaan
    if (this.currentChar === quoteChar) {
      this.advance();
    }

    return result;
  }

  next(): Token {
    this.skipWhitespace();

    if (!this.currentChar) {
      return { type: 'EOF' };
    }

    const ch = this.currentChar;

    // Single-char punctuators
    if (ch === '(') {
      this.advance();
      return { type: 'LPAREN' };
    }
    if (ch === ')') {
      this.advance();
      return { type: 'RPAREN' };
    }
    if (ch === ',') {
      this.advance();
      return { type: 'COMMA' };
    }

    // Comparison operators
    if ('=!<>'.includes(ch)) {
      let op = ch;
      this.advance();
      if (this.currentChar === '=') {
        op += '=';
        this.advance();
      }
      return { type: 'OP', value: op };
    }

    // Strings: zowel '...' als "..."
    if (ch === "'" || ch === '"') {
      const strVal = this.readString(ch);
      return { type: 'STRING', value: strVal };
    }

    // Number
    if (isDigit(ch)) {
      const numStr = this.readNumber();
      return { type: 'NUMBER', value: numStr };
    }

    // Identifier
    if (isIdentStart(ch)) {
      const ident = this.readIdentifier();
      return { type: 'IDENT', value: ident };
    }

    throw new Error(
      `Unexpected character in condition: '${ch}' at position ${this.pos}`,
    );
  }
}

function isDigit(ch: string | undefined): boolean {
  return !!ch && ch >= '0' && ch <= '9';
}

function isIdentStart(ch: string | undefined): boolean {
  return !!ch && /[A-Za-z_]/.test(ch);
}

function isIdentContinue(ch: string | undefined): boolean {
  return !!ch && /[A-Za-z0-9_\.]/.test(ch); // allow dots for paths
}

class Parser {
  private current: Token;
  private lexer: Lexer;

  constructor(lexer: Lexer) {
    this.lexer = lexer;
    this.current = this.lexer.next();
  }

  parseExpression(): ConditionAst {
    const expr = this.parseOr();
    this.expect('EOF');
    return expr;
  }

  private parseOr(): ConditionAst {
    let left = this.parseAnd();
    while (this.matchIdent('OR')) {
      const op: LogicalOp = 'OR';
      const right = this.parseAnd();
      left = { type: 'logical', op, left, right };
    }
    return left;
  }

  private parseAnd(): ConditionAst {
    let left = this.parseNot();
    while (this.matchIdent('AND')) {
      const op: LogicalOp = 'AND';
      const right = this.parseNot();
      left = { type: 'logical', op, left, right };
    }
    return left;
  }

  private parseNot(): ConditionAst {
    if (this.matchIdent('NOT')) {
      const expr = this.parseNot();
      return { type: 'not', expr };
    }
    return this.parsePrimary();
  }

  // Wordt gebruikt voor RHS van comparisons
  private parseValue(): ConditionAst {
    return this.parsePrimary();
  }

  private parsePrimary(): ConditionAst {
    const tokenType = this.current.type;

    // ( expr )
    if (tokenType === 'LPAREN') {
      this.consume('LPAREN');
      const expr = this.parseOr();
      this.expect('RPAREN');
      this.consume('RPAREN');
      return expr;
    }

    // identifiers (keywords, function calls, paths, comparisons)
    if (tokenType === 'IDENT') {
      const ident = this.current.value!;

      // keywords
      if (ident.toLowerCase() === 'always') {
        this.consume('IDENT');
        return { type: 'literal', value: true };
      }
      if (ident.toLowerCase() === 'true') {
        this.consume('IDENT');
        return { type: 'literal', value: true };
      }
      if (ident.toLowerCase() === 'false') {
        this.consume('IDENT');
        return { type: 'literal', value: false };
      }

      // function call: contains(...)
      if (ident === 'contains') {
        this.consume('IDENT');
        this.expect('LPAREN');
        this.consume('LPAREN');
        const args: ConditionAst[] = [];
        if (this.current.type !== 'RPAREN') {
          args.push(this.parseOr());
          while (this.current.type === 'COMMA') {
            this.consume('COMMA');
            args.push(this.parseOr());
          }
        }
        this.expect('RPAREN');
        this.consume('RPAREN');
        return { type: 'call', fn: 'contains', args };
      }

      // Otherwise: treat as path or bare identifier
      this.consume('IDENT');
      const parts = ident.split('.');
      const left: ConditionAst = { type: 'path', parts };

      // Maybe followed by comparison operator
      if (this.current.type === 'OP') {
        const op = this.current.value as ComparisonOp;
        this.consume('OP');
        const right = this.parseValue();
        return { type: 'comparison', op, left, right };
      }

      // Bare path (truthy/falsy)
      return left;
    }

    // literals (string / number)
    if (tokenType === 'STRING' || tokenType === 'NUMBER') {
      const valueToken = this.current;
      this.consume(tokenType);
      const litNode = literalFromToken(valueToken);

      // Maybe part of a comparison:
      if (this.current.type === 'OP') {
        const op = this.current.value as ComparisonOp;
        this.consume('OP');
        const right = this.parseValue();
        return { type: 'comparison', op, left: litNode, right };
      }

      return litNode;
    }

    throw new Error(`Unexpected token in expression: ${JSON.stringify(this.current)}`);
  }

  private matchIdent(expected: string): boolean {
    if (
      this.current.type === 'IDENT' &&
      this.current.value?.toUpperCase() === expected.toUpperCase()
    ) {
      this.current = this.lexer.next();
      return true;
    }
    return false;
  }

  private consume(expected: TokenType): void {
    if (this.current.type === expected) {
      this.current = this.lexer.next();
    } else {
      throw new Error(`Expected token ${expected}, got ${this.current.type}`);
    }
  }

  private expect(expected: TokenType): void {
    if (this.current.type !== expected) {
      throw new Error(`Expected token ${expected}, got ${this.current.type}`);
    }
  }
}

function literalFromToken(token: Token): ConditionAst {
  if (token.type === 'STRING') {
    return { type: 'literal', value: token.value ?? '' };
  }
  if (token.type === 'NUMBER') {
    const numValue = token.value !== undefined ? Number(token.value) : NaN;
    if (Number.isNaN(numValue)) {
      throw new Error(`Invalid number literal: ${token.value}`);
    }
    return { type: 'literal', value: numValue };
  }
  throw new Error(`Unexpected token for literal: ${JSON.stringify(token)}`);
}

/**
 * Parse een condition-string naar een AST.
 */
export function parseCondition(input: string): ConditionAst {
  const lexer = new Lexer(input);
  const parser = new Parser(lexer);
  return parser.parseExpression();
}

/**
 * Evaluate de AST gegeven een context object.
 */
export function evaluateConditionAst(ast: ConditionAst, context: any): boolean {
  switch (ast.type) {
    case 'literal':
      return Boolean(ast.value);
    case 'path': {
      const val = resolvePath(context, ast.parts);
      return Boolean(val);
    }
    case 'comparison': {
      const leftVal = resolveNodeValue(ast.left, context);
      const rightVal = resolveNodeValue(ast.right, context);
      return compareValues(ast.op, leftVal, rightVal);
    }
    case 'logical': {
      if (ast.op === 'AND') {
        return (
          evaluateConditionAst(ast.left, context) &&
          evaluateConditionAst(ast.right, context)
        );
      }
      return (
        evaluateConditionAst(ast.left, context) ||
        evaluateConditionAst(ast.right, context)
      );
    }
    case 'not':
      return !evaluateConditionAst(ast.expr, context);
    case 'call': {
      if (ast.fn === 'contains') {
        const [haystackNode, needleNode] = ast.args;
        const haystack = resolveNodeValue(haystackNode, context);
        const needle = resolveNodeValue(needleNode, context);

        if (Array.isArray(haystack)) {
          return haystack.includes(needle);
        }
        if (typeof haystack === 'string') {
          return haystack.includes(String(needle));
        }
        return false;
      }
      throw new Error(`Unknown function: ${ast.fn}`);
    }
    default: {
      const _exhaustive: never = ast;
      return false;
    }
  }
}

/**
 * Convenience: direct een condition-string óf AST evalueren.
 */
export function evaluateExpression(
  condition: string | ConditionAst,
  context: any,
): boolean {
  const ast =
    typeof condition === 'string' ? parseCondition(condition) : condition;
  return evaluateConditionAst(ast, context);
}

/**
 * Resolve a path from the context, e.g. parts = ['user', 'age'] => context.user.age
 */
function resolvePath(obj: any, parts: string[]): any {
  let current = obj;
  for (const p of parts) {
    if (current == null) {
      return undefined;
    }
    current = current[p];
  }
  return current;
}

/**
 * Resolve a node's runtime value given the context.
 */
function resolveNodeValue(node: ConditionAst, context: any): any {
  switch (node.type) {
    case 'literal':
      return node.value;
    case 'path':
      return resolvePath(context, node.parts);
    case 'comparison':
      return evaluateConditionAst(node, context);
    case 'logical':
    case 'not':
    case 'call':
      return evaluateConditionAst(node, context);
    default:
      return undefined;
  }
}

/**
 * Compare two values with the given operator.
 */
function compareValues(op: ComparisonOp, left: any, right: any): boolean {
  const [l, r] = normalizeTypes(left, right);

  switch (op) {
    case '==':
      return l == r;
    case '!=':
      return l != r;
    case '>':
      return l > r;
    case '<':
      return l < r;
    case '>=':
      return l >= r;
    case '<=':
      return l <= r;
  }
}

function normalizeTypes(a: any, b: any): [any, any] {
  // Als beide (potentieel) nummers zijn, vergelijk als nummer
  const aNum = typeof a === 'number' || !isNaN(Number(a));
  const bNum = typeof b === 'number' || !isNaN(Number(b));
  if (aNum && bNum) {
    return [Number(a), Number(b)];
  }
  return [a, b];
}
