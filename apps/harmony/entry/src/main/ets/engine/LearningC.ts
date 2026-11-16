/* 手机 C 学习解释器：有界、离线的 C 教学子集。不是 GCC，也不执行宿主代码。
 * All student pointers refer to checked managed cells, never host addresses.
 */
export class CRunResult {
  status: string = 'ok';
  output: string = '';
  diagnostic: string = '';
  steps: number = 0;
}

class CToken {
  kind: string;
  text: string;
  line: number;
  col: number;
  constructor(kind: string = '', text: string = '', line: number = 1, col: number = 1) {
    this.kind = kind; this.text = text; this.line = line; this.col = col;
  }
}

class CFailure extends Error {
  status: string;
  constructor(status: string, message: string, token: CToken) {
    super('第 ' + token.line + ' 行，第 ' + token.col + ' 列：' + message);
    this.status = status;
  }
}

function fail(status: string, message: string, token: CToken): never {
  throw new CFailure(status, message, token);
}

class CType {
  base: string = 'int';
  unsigned: boolean = false;
  pointers: number = 0;
  array: number = -1;
  copy(): CType {
    const t = new CType();
    t.base = this.base; t.unsigned = this.unsigned; t.pointers = this.pointers; t.array = this.array;
    return t;
  }
  element(): CType {
    const t = this.copy();
    if (t.array >= 0) t.array = -1;
    else t.pointers--;
    return t;
  }
  pointer(): CType {
    const t = this.copy(); t.array = -1; t.pointers++; return t;
  }
}

class CNode {
  kind: string;
  token: CToken;
  text: string = '';
  type: CType = new CType();
  children: CNode[] = [];
  constructor(kind: string = 'empty', token: CToken = new CToken()) {
    this.kind = kind; this.token = token;
  }
}

class CParameter {
  name: string;
  type: CType;
  token: CToken;
  constructor(name: string, type: CType, token: CToken) { this.name = name; this.type = type; this.token = token; }
}

class CFunction {
  name: string = '';
  type: CType = new CType();
  token: CToken = new CToken();
  parameters: CParameter[] = [];
  body: CNode = new CNode();
  defined: boolean = false;
}

class CProgram {
  globals: CNode[] = [];
  functions: CFunction[] = [];
}

class CLexer {
  source: string;
  pos: number = 0;
  line: number = 1;
  col: number = 1;
  lineHasToken: boolean = false;
  tokens: CToken[] = [];
  constructor(source: string) { this.source = source; }
  current(offset: number = 0): string { return this.source.charAt(this.pos + offset); }
  advance(): string {
    const ch = this.source.charAt(this.pos++);
    if (ch === '\n') { this.line++; this.col = 1; this.lineHasToken = false; }
    else this.col++;
    return ch;
  }
  letter(ch: string): boolean { return ch.length === 1 && ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_'); }
  digit(ch: string): boolean { return ch.length === 1 && ch >= '0' && ch <= '9'; }
  hex(ch: string): boolean { return this.digit(ch) || (ch >= 'a' && ch <= 'f' && ch.length === 1) || (ch >= 'A' && ch <= 'F' && ch.length === 1); }
  escape(start: CToken): string {
    if (this.pos >= this.source.length) fail('compile_error', '字符串转义未结束。', start);
    const ch = this.advance();
    switch (ch) {
      case 'n': return '\n'; case 'r': return '\r'; case 't': return '\t';
      case 'b': return '\b'; case 'f': return '\f'; case 'v': return '\v';
      case 'a': return String.fromCharCode(7);
      case '\\': return '\\'; case '"': return '"'; case "'": return "'"; case '?': return '?';
      case 'x': {
        let digits = '';
        while (this.hex(this.current())) digits += this.advance();
        if (digits.length === 0 || digits.length > 2) fail('unsupported', '十六进制字符转义必须为 1 至 2 位。', start);
        const n = parseInt(digits, 16);
        if (n > 127) fail('unsupported', '数值字符转义目前仅支持 ASCII 范围；中文字符串请直接输入文字。', start);
        return String.fromCharCode(n);
      }
      default:
        if (ch >= '0' && ch <= '7') {
          let digits = ch;
          while (digits.length < 3 && this.current() >= '0' && this.current() <= '7' && this.current().length > 0) digits += this.advance();
          const n = parseInt(digits, 8);
          if (n > 127) fail('unsupported', '数值字符转义目前仅支持 ASCII 范围；中文字符串请直接输入文字。', start);
          return String.fromCharCode(n);
        }
        fail('compile_error', '不认识的转义：\\' + ch, start);
    }
  }
  tokenize(): CToken[] {
    if (this.source.length > 65536) fail('unsupported', '代码长度上限为 65536 个字符。', new CToken());
    while (this.pos < this.source.length) {
      const ch = this.current();
      if (' \t\r\n\v\f'.indexOf(ch) >= 0) { this.advance(); continue; }
      const start = new CToken('', '', this.line, this.col);
      if (ch === '/' && this.current(1) === '/') {
        while (this.pos < this.source.length && this.current() !== '\n') this.advance();
        continue;
      }
      if (ch === '/' && this.current(1) === '*') {
        this.advance(); this.advance();
        while (this.pos < this.source.length && !(this.current() === '*' && this.current(1) === '/')) this.advance();
        if (this.pos >= this.source.length) fail('compile_error', '块注释缺少 */。', start);
        this.advance(); this.advance(); continue;
      }
      if (ch === '#') {
        if (this.lineHasToken) fail('compile_error', '# 指令必须位于行首。', start);
        this.advance(); let directive = '';
        while (this.pos < this.source.length && this.current() !== '\n') directive += this.advance();
        directive = directive.trim();
        if (!directive.startsWith('include')) fail('unsupported', '目前只支持 #include <stdio.h> 和 <string.h>，不支持宏或条件编译。', start);
        const header = directive.substring(7).trim();
        if (header !== '<stdio.h>' && header !== '"stdio.h"' && header !== '<string.h>' && header !== '"string.h"') fail('unsupported', '此学习解释器仅提供 stdio.h 与 string.h 的有限函数。', start);
        continue;
      }
      this.lineHasToken = true;
      if (this.letter(ch)) {
        start.kind = 'id';
        while (this.letter(this.current()) || this.digit(this.current())) start.text += this.advance();
      } else if (this.digit(ch)) {
        start.kind = 'number';
        while (this.letter(this.current()) || this.digit(this.current()) || this.current() === '.') start.text += this.advance();
        if (!/^(0[xX][0-9a-fA-F]+|0[0-7]*|[1-9][0-9]*)[uU]?$/.test(start.text)) fail('unsupported', '只支持十进制、八进制、十六进制 32 位整数及 u 后缀；不支持浮点数或 long。', start);
      } else if (ch === '"' || ch === "'") {
        const quote = this.advance(); start.kind = quote === '"' ? 'string' : 'char';
        while (this.pos < this.source.length && this.current() !== quote) {
          const c = this.advance();
          if (c === '\n' || c === '\r') fail('compile_error', '字符串或字符不能跨行。', start);
          start.text += c === '\\' ? this.escape(start) : c;
          if (start.text.length > 4096) fail('unsupported', '单个字符串最多 4096 个字符。', start);
        }
        if (this.pos >= this.source.length) fail('compile_error', '字符串或字符缺少结束引号。', start);
        this.advance();
        if (start.kind === 'char' && start.text.length !== 1) fail('compile_error', '字符常量必须包含一个字符。', start);
      } else {
        start.kind = 'symbol';
        const three = this.source.substring(this.pos, this.pos + 3);
        const two = this.source.substring(this.pos, this.pos + 2);
        if (three === '<<=' || three === '>>=') { start.text = three; this.advance(); this.advance(); this.advance(); }
        else if (['++', '--', '+=', '-=', '*=', '/=', '%=', '==', '!=', '<=', '>=', '&&', '||', '<<', '>>', '&=', '|=', '^=', '->'].indexOf(two) >= 0) { start.text = two; this.advance(); this.advance(); }
        else if ('{}()[];,+-*/%&|^~!=<>?:'.indexOf(ch) >= 0) start.text = this.advance();
        else fail('unsupported', '无法识别的字符：' + ch, start);
      }
      this.tokens.push(start);
      if (this.tokens.length > 16000) fail('unsupported', '代码过长：最多 16000 个词法单元。', start);
    }
    this.tokens.push(new CToken('eof', '', this.line, this.col));
    return this.tokens;
  }
}

class CParser {
  tokens: CToken[];
  pos: number = 0;
  depth: number = 0;
  loopDepth: number = 0;
  constructor(tokens: CToken[]) { this.tokens = tokens; }
  peek(offset: number = 0): CToken { return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)]; }
  is(text: string): boolean { const t = this.peek(); return (t.kind === 'id' || t.kind === 'symbol') && t.text === text; }
  take(text: string): boolean { if (this.is(text)) { this.pos++; return true; } return false; }
  expect(text: string): CToken {
    const t = this.peek();
    if (!this.take(text)) fail('compile_error', '应为“' + text + '”，实际为“' + (t.text || '文件结束') + '”。', t);
    return t;
  }
  name(): CToken {
    const t = this.peek();
    if (t.kind !== 'id' || ['if', 'else', 'for', 'while', 'do', 'return', 'break', 'continue', 'int', 'char', 'void', 'unsigned', 'signed'].indexOf(t.text) >= 0) fail('compile_error', '此处需要变量或函数名称。', t);
    this.pos++; return t;
  }
  typeStart(): boolean { return this.peek().kind === 'id' && ['int', 'char', 'void', 'unsigned', 'signed'].indexOf(this.peek().text) >= 0; }
  rejectKeyword(): void {
    if (this.peek().kind === 'id' && ['struct', 'union', 'enum', 'typedef', 'float', 'double', 'long', 'short', 'const', 'volatile', 'static', 'extern', 'register', 'auto', 'switch', 'case', 'default', 'goto', 'sizeof', '_Bool'].indexOf(this.peek().text) >= 0) fail('unsupported', '当前教学子集暂不支持 ' + this.peek().text + '。', this.peek());
  }
  parseType(): CType {
    this.rejectKeyword(); const type = new CType(); let sign = false;
    if (this.take('unsigned')) { type.unsigned = true; sign = true; }
    else if (this.take('signed')) sign = true;
    if (this.take('int')) type.base = 'int';
    else if (this.take('char')) type.base = 'char';
    else if (this.take('void')) { if (sign) fail('compile_error', 'void 不能使用 signed 或 unsigned。', this.peek()); type.base = 'void'; }
    else if (!sign) fail('compile_error', '此处需要 int、unsigned int、char 或 void 类型。', this.peek());
    return type;
  }
  declarator(base: CType, parameter: boolean = false): CNode {
    const type = base.copy();
    while (this.take('*')) { type.pointers++; if (type.pointers > 4) fail('unsupported', '指针层数最多为 4。', this.peek()); }
    const t = this.name(); const node = new CNode('decl', t); node.text = t.text;
    if (this.take('[')) {
      if (parameter && this.take(']')) type.pointers++;
      else {
        const size = this.peek();
        if (size.kind !== 'number' || !/^[0-9]+$/.test(size.text)) fail('unsupported', '数组长度必须为正整数字面量，不支持变长数组。', size);
        this.pos++; const length = parseInt(size.text, 10);
        if (length < 1 || length > 4096) fail('unsupported', '单个数组长度范围为 1 至 4096。', size);
        this.expect(']'); if (parameter) type.pointers++; else type.array = length;
      }
      if (this.is('[')) fail('unsupported', '当前只支持一维数组。', this.peek());
    }
    if (type.base === 'void' && type.pointers === 0) fail('compile_error', '变量不能是 void 类型。', t);
    node.type = type; return node;
  }
  declarationAfter(first: CNode, base: CType): CNode {
    const group = new CNode('decls', first.token); let item = first;
    while (true) {
      if (this.take('=')) {
        if (this.take('{')) {
          const init = new CNode('initlist', item.token);
          if (!this.take('}')) {
            do { init.children.push(this.expression(2)); } while (this.take(',') && !this.is('}'));
            this.expect('}');
          }
          item.children.push(init);
        } else item.children.push(this.expression(2));
      }
      group.children.push(item);
      if (!this.take(',')) break;
      item = this.declarator(base);
    }
    this.expect(';'); return group;
  }
  parse(): CProgram {
    const program = new CProgram();
    while (this.peek().kind !== 'eof') {
      const base = this.parseType();
      let pointerCount = 0;
      while (this.take('*')) pointerCount++;
      const name = this.name();
      if (this.take('(')) {
        if (pointerCount > 4) fail('unsupported', '指针层数最多为 4。', name);
        const fn = new CFunction(); fn.name = name.text; fn.token = name; fn.type = base.copy(); fn.type.pointers = pointerCount;
        if (this.is('void') && this.peek(1).text === ')') { this.pos++; this.expect(')'); }
        else if (!this.take(')')) {
          do {
            const pt = this.parseType();
            const param = this.declarator(pt, true);
            if (fn.parameters.some((p: CParameter): boolean => p.name === param.text)) fail('compile_error', '参数名称重复：' + param.text, param.token);
            fn.parameters.push(new CParameter(param.text, param.type, param.token));
            if (fn.parameters.length > 16) fail('unsupported', '函数最多接收 16 个参数。', param.token);
          } while (this.take(','));
          this.expect(')');
        }
        if (!this.take(';')) { fn.defined = true; fn.body = this.block(); }
        const previous = program.functions.find((f: CFunction): boolean => f.name === fn.name && f.defined);
        if (previous !== undefined && fn.defined) fail('compile_error', '函数重复定义：' + fn.name, fn.token);
        program.functions.push(fn);
        if (program.functions.length > 64) fail('unsupported', '最多支持 64 个函数声明。', name);
      } else {
        this.pos--;
        for (let i = 0; i < pointerCount; i++) this.pos--;
        const first = this.declarator(base);
        program.globals.push(this.declarationAfter(first, base));
      }
    }
    return program;
  }
  block(): CNode {
    const node = new CNode('block', this.expect('{'));
    while (!this.take('}')) {
      if (this.peek().kind === 'eof') fail('compile_error', '代码块缺少 }。', this.peek());
      node.children.push(this.statement());
    }
    return node;
  }
  statement(): CNode {
    this.depth++;
    if (this.depth > 96) fail('unsupported', '语法嵌套层数超过 96。', this.peek());
    try { return this.statementInner(); } finally { this.depth--; }
  }
  statementInner(): CNode {
    const t = this.peek(); this.rejectKeyword();
    if (this.is('{')) return this.block();
    if (this.take(';')) return new CNode('empty', t);
    if (this.take('if')) {
      const n = new CNode('if', t); this.expect('('); n.children.push(this.expression()); this.expect(')');
      n.children.push(this.statement()); if (this.take('else')) n.children.push(this.statement()); return n;
    }
    if (this.take('while')) {
      const n = new CNode('while', t); this.expect('('); n.children.push(this.expression()); this.expect(')');
      this.loopDepth++; n.children.push(this.statement()); this.loopDepth--; return n;
    }
    if (this.take('do')) {
      const n = new CNode('do', t); this.loopDepth++; n.children.push(this.statement()); this.loopDepth--;
      this.expect('while'); this.expect('('); n.children.push(this.expression()); this.expect(')'); this.expect(';'); return n;
    }
    if (this.take('for')) {
      const n = new CNode('for', t); this.expect('(');
      if (this.take(';')) n.children.push(new CNode());
      else if (this.typeStart()) { const ty = this.parseType(); n.children.push(this.declarationAfter(this.declarator(ty), ty)); }
      else { const init = new CNode('exprstmt', this.peek()); init.children.push(this.expression()); this.expect(';'); n.children.push(init); }
      if (this.take(';')) n.children.push(new CNode());
      else { n.children.push(this.expression()); this.expect(';'); }
      if (this.take(')')) n.children.push(new CNode());
      else { n.children.push(this.expression()); this.expect(')'); }
      this.loopDepth++; n.children.push(this.statement()); this.loopDepth--; return n;
    }
    if (this.take('return')) {
      const n = new CNode('return', t); if (!this.is(';')) n.children.push(this.expression()); this.expect(';'); return n;
    }
    if (this.take('break') || this.take('continue')) {
      if (this.loopDepth === 0) fail('compile_error', t.text + ' 只能在循环内使用。', t);
      this.expect(';'); return new CNode(t.text, t);
    }
    if (this.typeStart()) { const type = this.parseType(); return this.declarationAfter(this.declarator(type), type); }
    const n = new CNode('exprstmt', t); n.children.push(this.expression()); this.expect(';'); return n;
  }
  precedence(op: string): number {
    switch (op) {
      case ',': return 1;
      case '=': case '+=': case '-=': case '*=': case '/=': case '%=': case '&=': case '|=': case '^=': case '<<=': case '>>=': return 2;
      case '?': return 3; case '||': return 4; case '&&': return 5; case '|': return 6; case '^': return 7; case '&': return 8;
      case '==': case '!=': return 9; case '<': case '>': case '<=': case '>=': return 10;
      case '<<': case '>>': return 11; case '+': case '-': return 12; case '*': case '/': case '%': return 13;
      default: return 0;
    }
  }
  expression(minimum: number = 1): CNode {
    this.depth++;
    if (this.depth > 96) fail('unsupported', '表达式嵌套层数超过 96。', this.peek());
    try {
      let left = this.prefix();
      while (true) {
        const t = this.peek(); const p = t.kind === 'symbol' ? this.precedence(t.text) : 0;
        if (p < minimum || p === 0) break;
        this.pos++;
        const node = new CNode(t.text === '?' ? 'conditional' : 'binary', t); node.text = t.text; node.children.push(left);
        if (t.text === '?') { node.children.push(this.expression()); this.expect(':'); node.children.push(this.expression(3)); }
        else node.children.push(this.expression(p === 2 ? p : p + 1));
        left = node;
      }
      return left;
    } finally { this.depth--; }
  }
  prefix(): CNode {
    const t = this.peek(); this.rejectKeyword();
    if (t.kind === 'symbol' && ['+', '-', '!', '~', '++', '--', '&', '*'].indexOf(t.text) >= 0) {
      this.pos++; const n = new CNode('unary', t); n.text = t.text;
      this.depth++; if (this.depth > 96) fail('unsupported', '一元表达式嵌套过深。', t);
      n.children.push(this.prefix()); this.depth--; return n;
    }
    let n: CNode;
    if (this.take('(')) {
      if (this.typeStart()) fail('unsupported', '当前不支持显式类型转换。', this.peek());
      n = this.expression(); this.expect(')');
    } else if (t.kind === 'number' || t.kind === 'char' || t.kind === 'string' || t.kind === 'id') {
      this.pos++; n = new CNode(t.kind, t); n.text = t.text;
      while (n.kind === 'string' && this.peek().kind === 'string') { n.text += this.peek().text; this.pos++; }
    } else fail('compile_error', '此处需要表达式，实际为“' + (t.text || '文件结束') + '”。', t);
    while (true) {
      const tok = this.peek();
      if (this.take('[')) { const a = new CNode('index', tok); a.children.push(n, this.expression()); this.expect(']'); n = a; }
      else if (this.take('(')) {
        if (n.kind !== 'id') fail('unsupported', '不支持函数指针调用。', tok);
        const a = new CNode('call', n.token); a.text = n.text;
        if (!this.take(')')) { do { a.children.push(this.expression(2)); } while (this.take(',')); this.expect(')'); }
        if (a.children.length > 32) fail('unsupported', '一次调用最多传入 32 个参数。', tok);
        n = a;
      } else if (this.take('++') || this.take('--')) { const a = new CNode('postfix', tok); a.text = tok.text; a.children.push(n); n = a; }
      else { if (this.is('->')) fail('unsupported', '不支持结构体或成员访问。', tok); break; }
    }
    return n;
  }
}

class CBlock {
  type: CType;
  values: CValue[] = [];
  live: boolean = true;
  readonly: boolean = false;
  constructor(type: CType) { this.type = type; }
}
class CRef {
  block: CBlock;
  index: number;
  type: CType;
  constructor(block: CBlock, index: number, type: CType) { this.block = block; this.index = index; this.type = type; }
}
class CValue {
  type: CType = new CType();
  number: number = 0;
  reference: CRef | undefined = undefined;
  initialized: boolean = true;
  copy(): CValue { const v = new CValue(); v.type = this.type.copy(); v.number = this.number; v.reference = this.reference; v.initialized = this.initialized; return v; }
}
class CBinding {
  type: CType;
  reference: CRef;
  constructor(type: CType, reference: CRef) { this.type = type; this.reference = reference; }
}
class CScope {
  bindings: Map<string, CBinding> = new Map<string, CBinding>();
  blocks: CBlock[] = [];
}
class CFrame {
  scopes: CScope[] = [];
}
class CFlow {
  kind: string = 'normal';
  value: CValue = new CValue();
  hasValue: boolean = false;
}

class CInterpreter {
  program: CProgram;
  input: string;
  inputPos: number = 0;
  output: string = '';
  steps: number = 0;
  evalDepth: number = 0;
  global: CScope = new CScope();
  frames: CFrame[] = [];
  liveCells: number = 0;
  strings: Map<string, CValue> = new Map<string, CValue>();
  constructor(program: CProgram, input: string) { this.program = program; this.input = input; }
  tick(token: CToken): void { this.steps++; if (this.steps > 200000) fail('timeout', '执行超过 200000 步；请检查循环退出条件或递归。', token); }
  integer(n: number, unsigned: boolean = false): CValue { const v = new CValue(); v.number = n; v.type.unsigned = unsigned; return v; }
  truth(v: CValue): boolean { return v.type.pointers > 0 ? v.reference !== undefined : v.number !== 0; }
  numeric(v: CValue, token: CToken): number {
    if (v.type.pointers > 0 || v.type.base === 'void') fail('runtime_error', '此运算需要整数。', token);
    return v.number;
  }
  compatible(a: CType, b: CType): boolean { return a.base === b.base && a.unsigned === b.unsigned && a.pointers === b.pointers; }
  check(ref: CRef, token: CToken, write: boolean = false): void {
    if (!ref.block.live) fail('runtime_error', '指针指向已经离开作用域的变量。', token);
    if (ref.index < 0 || ref.index >= ref.block.values.length || !Number.isInteger(ref.index)) fail('runtime_error', '数组或指针访问越界，下标为 ' + ref.index + '，容量为 ' + ref.block.values.length + '。', token);
    if (write && ref.block.readonly) fail('runtime_error', '不能修改字符串常量。', token);
  }
  read(ref: CRef, token: CToken): CValue {
    this.check(ref, token); const v = ref.block.values[ref.index];
    if (!v.initialized) fail('runtime_error', '读取了尚未初始化的变量或数组元素。', token);
    return v.copy();
  }
  convert(value: CValue, type: CType, token: CToken): CValue {
    const v = value.copy();
    if (type.pointers > 0) {
      if (value.type.pointers === 0) {
        if (value.number !== 0 || value.type.base === 'void') fail('runtime_error', '只有整数常量 0 可作为空指针；不支持整数地址转换。', token);
        v.reference = undefined;
      } else if (!this.compatible(type, value.type)) fail('runtime_error', '指针类型不匹配。', token);
    } else {
      const n = this.numeric(value, token);
      if (type.base === 'void') { v.number = 0; }
      else if (type.base === 'char') { const byte = n & 255; v.number = type.unsigned || byte < 128 ? byte : byte - 256; }
      else v.number = type.unsigned ? n >>> 0 : n | 0;
    }
    v.type = type.copy(); v.initialized = true; return v;
  }
  write(ref: CRef, value: CValue, token: CToken): CValue {
    this.check(ref, token, true); const v = this.convert(value, ref.type, token); ref.block.values[ref.index] = v; return v.copy();
  }
  scope(): CScope {
    if (this.frames.length === 0) return this.global;
    const scopes = this.frames[this.frames.length - 1].scopes; return scopes[scopes.length - 1];
  }
  enter(): void { this.frames[this.frames.length - 1].scopes.push(new CScope()); }
  leave(): void {
    const scopes = this.frames[this.frames.length - 1].scopes; const s = scopes[scopes.length - 1];
    for (const block of s.blocks) { block.live = false; this.liveCells -= block.values.length; }
    scopes.pop();
  }
  lookup(name: string, token: CToken): CBinding {
    if (this.frames.length > 0) {
      const scopes = this.frames[this.frames.length - 1].scopes;
      for (let i = scopes.length - 1; i >= 0; i--) { const b = scopes[i].bindings.get(name); if (b !== undefined) return b; }
    }
    const b = this.global.bindings.get(name); if (b !== undefined) return b;
    fail('compile_error', '变量未声明：' + name, token);
  }
  allocate(type: CType, length: number, initialized: boolean, token: CToken): CBlock {
    if (this.liveCells + length > 32768) fail('runtime_error', '解释器内存上限为 32768 个数据单元。', token);
    const block = new CBlock(type.copy());
    for (let i = 0; i < length; i++) { const v = new CValue(); v.type = type.copy(); v.initialized = initialized; block.values.push(v); }
    this.liveCells += length; return block;
  }
  bytes(text: string): number[] {
    const out: number[] = [];
    for (let i = 0; i < text.length; i++) {
      let cp = text.charCodeAt(i);
      if (cp >= 0xD800 && cp <= 0xDBFF && i + 1 < text.length) { const lo = text.charCodeAt(i + 1); if (lo >= 0xDC00 && lo <= 0xDFFF) { cp = 0x10000 + (cp - 0xD800) * 1024 + lo - 0xDC00; i++; } }
      if (cp < 128) out.push(cp);
      else if (cp < 2048) out.push(192 | (cp >> 6), 128 | (cp & 63));
      else if (cp < 65536) out.push(224 | (cp >> 12), 128 | ((cp >> 6) & 63), 128 | (cp & 63));
      else out.push(240 | (cp >> 18), 128 | ((cp >> 12) & 63), 128 | ((cp >> 6) & 63), 128 | (cp & 63));
    }
    return out;
  }
  decode(bytes: number[]): string {
    let result = '';
    for (let i = 0; i < bytes.length; i++) {
      let cp = bytes[i];
      if (cp >= 192 && cp < 224 && i + 1 < bytes.length) cp = ((cp & 31) << 6) | (bytes[++i] & 63);
      else if (cp >= 224 && cp < 240 && i + 2 < bytes.length) { cp = ((cp & 15) << 12) | ((bytes[i + 1] & 63) << 6) | (bytes[i + 2] & 63); i += 2; }
      else if (cp >= 240 && cp < 248 && i + 3 < bytes.length) { cp = ((cp & 7) << 18) | ((bytes[i + 1] & 63) << 12) | ((bytes[i + 2] & 63) << 6) | (bytes[i + 3] & 63); i += 3; }
      if (cp <= 65535) result += String.fromCharCode(cp);
      else { cp -= 65536; result += String.fromCharCode(0xD800 + (cp >> 10), 0xDC00 + (cp & 1023)); }
    }
    return result;
  }
  stringValue(text: string, token: CToken): CValue {
    const cached = this.strings.get(text); if (cached !== undefined) return cached.copy();
    const bytes = this.bytes(text); bytes.push(0);
    const type = new CType(); type.base = 'char';
    const block = this.allocate(type, bytes.length, true, token); block.readonly = true;
    for (let i = 0; i < bytes.length; i++) block.values[i] = this.convert(this.integer(bytes[i]), type, token);
    const v = new CValue(); v.type = type.pointer(); v.reference = new CRef(block, 0, type);
    this.strings.set(text, v); return v.copy();
  }
  cstring(v: CValue, token: CToken): string {
    if (v.type.pointers !== 1 || v.type.base !== 'char' || v.reference === undefined) fail('runtime_error', '此参数需要有效的 char * 字符串。', token);
    const ref = v.reference; const bytes: number[] = [];
    for (let i = ref.index; ; i++) {
      this.tick(token); const n = this.read(new CRef(ref.block, i, ref.type), token).number & 255;
      if (n === 0) break; bytes.push(n);
      if (bytes.length > 16384) fail('runtime_error', '字符串过长或没有结束标记。', token);
    }
    return this.decode(bytes);
  }
  lvalue(node: CNode): CRef {
    this.tick(node.token);
    if (node.kind === 'id') {
      const b = this.lookup(node.text, node.token);
      if (b.type.array >= 0) fail('runtime_error', '不能整体赋值数组或获取数组整体的地址；请使用数组名或元素。', node.token);
      return b.reference;
    }
    if (node.kind === 'unary' && node.text === '*') {
      const v = this.evaluate(node.children[0]);
      if (v.type.pointers === 0 || v.reference === undefined) fail('runtime_error', '不能解引用空指针或非指针。', node.token);
      this.check(v.reference, node.token); return v.reference;
    }
    if (node.kind === 'index') {
      const ptr = this.evaluate(node.children[0]); const index = this.numeric(this.evaluate(node.children[1]), node.token);
      if (ptr.type.pointers === 0 || ptr.reference === undefined) fail('runtime_error', '下标操作需要有效的数组或指针。', node.token);
      const r = new CRef(ptr.reference.block, ptr.reference.index + index, ptr.reference.type); this.check(r, node.token); return r;
    }
    fail('runtime_error', '赋值或取地址的目标必须是变量、数组元素或指针解引用。', node.token);
  }
  evaluate(node: CNode): CValue {
    this.tick(node.token); this.evalDepth++;
    if (this.evalDepth > 192) fail('runtime_error', '表达式或函数调用嵌套过深。', node.token);
    try { return this.evaluateInner(node); } finally { this.evalDepth--; }
  }
  evaluateInner(node: CNode): CValue {
    switch (node.kind) {
      case 'number': {
        const suffix = node.text.endsWith('u') || node.text.endsWith('U'); const text = suffix ? node.text.substring(0, node.text.length - 1) : node.text;
        const radix = text.startsWith('0x') || text.startsWith('0X') ? 16 : text.length > 1 && text.startsWith('0') ? 8 : 10;
        const n = parseInt(text, radix);
        if (n > 4294967295) fail('unsupported', '整数字面量超出 32 位范围。', node.token);
        if (!suffix && radix === 10 && n > 2147483647) fail('unsupported', '十进制常量超出 int 范围，请使用 u 后缀。', node.token);
        return this.integer(n, suffix || (radix !== 10 && n > 2147483647));
      }
      case 'char': {
        if (node.text.charCodeAt(0) > 127) fail('unsupported', '字符常量仅支持 ASCII 字符；中文请使用双引号字符串。', node.token);
        return this.integer(node.text.charCodeAt(0));
      }
      case 'string': return this.stringValue(node.text, node.token);
      case 'id': {
        if (node.text === 'NULL') { const v = new CValue(); return v; }
        if (node.text === 'EOF') return this.integer(-1);
        const b = this.lookup(node.text, node.token);
        if (b.type.array >= 0) { const v = new CValue(); v.type = b.type.pointer(); v.reference = b.reference; return v; }
        return this.read(b.reference, node.token);
      }
      case 'index': return this.read(this.lvalue(node), node.token);
      case 'call': {
        const values: CValue[] = []; for (const child of node.children) values.push(this.evaluate(child));
        return this.call(node.text, values, node.token);
      }
      case 'conditional': return this.evaluate(this.truth(this.evaluate(node.children[0])) ? node.children[1] : node.children[2]);
      case 'postfix': case 'unary': {
        const op = node.text;
        if (op === '-' && node.children[0].kind === 'number' && node.children[0].text === '2147483648') return this.integer(-2147483648);
        if (op === '&') { const r = this.lvalue(node.children[0]); const v = new CValue(); v.type = r.type.pointer(); v.reference = r; return v; }
        if (op === '*') return this.read(this.lvalue(node), node.token);
        if (op === '++' || op === '--') {
          const r = this.lvalue(node.children[0]); const before = this.read(r, node.token);
          const after = this.write(r, this.binary(op === '++' ? '+' : '-', before, this.integer(1), node.token), node.token);
          return node.kind === 'postfix' ? before : after;
        }
        const v = this.evaluate(node.children[0]);
        if (op === '!') return this.integer(this.truth(v) ? 0 : 1);
        const n = this.numeric(v, node.token); const u = v.type.base === 'int' && v.type.unsigned;
        if (op === '+') return this.integer(n, u);
        if (op === '~') return this.integer(u ? (~n) >>> 0 : ~n, u);
        if (op === '-') {
          if (!u && -n > 2147483647) fail('runtime_error', '有符号整数溢出。', node.token);
          return this.integer(u ? (-n) >>> 0 : -n, u);
        }
        break;
      }
      case 'binary': {
        const op = node.text;
        if (op === '=') return this.write(this.lvalue(node.children[0]), this.evaluate(node.children[1]), node.token);
        if (['+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>='].indexOf(op) >= 0) {
          const r = this.lvalue(node.children[0]); const before = this.read(r, node.token); const rhs = this.evaluate(node.children[1]);
          return this.write(r, this.binary(op.substring(0, op.length - 1), before, rhs, node.token), node.token);
        }
        const left = this.evaluate(node.children[0]);
        if (op === '&&' && !this.truth(left)) return this.integer(0);
        if (op === '||' && this.truth(left)) return this.integer(1);
        const right = this.evaluate(node.children[1]);
        if (op === ',') return right;
        if (op === '&&' || op === '||') return this.integer(this.truth(right) ? 1 : 0);
        return this.binary(op, left, right, node.token);
      }
    }
    fail('unsupported', '不支持的表达式。', node.token);
  }
  binary(op: string, left: CValue, right: CValue, token: CToken): CValue {
    if (left.type.pointers > 0 || right.type.pointers > 0) {
      if (op === '==' || op === '!=') {
        if (left.type.pointers === 0 && left.number !== 0) fail('runtime_error', '指针只能和兼容指针或 0 比较。', token);
        if (right.type.pointers === 0 && right.number !== 0) fail('runtime_error', '指针只能和兼容指针或 0 比较。', token);
        const l = left.reference; const r = right.reference;
        const equal = l === undefined ? r === undefined : r !== undefined && l.block === r.block && l.index === r.index;
        return this.integer((op === '==' ? equal : !equal) ? 1 : 0);
      }
      let ptr = left; let amount = right;
      if (op === '+' && left.type.pointers === 0) { ptr = right; amount = left; }
      if ((op === '+' || op === '-') && ptr.type.pointers > 0 && amount.type.pointers === 0) {
        if (ptr.reference === undefined) fail('runtime_error', '空指针不能参与指针运算。', token);
        const ref = ptr.reference; if (!ref.block.live) fail('runtime_error', '指针已经失效。', token);
        const index = ref.index + (op === '+' ? 1 : -1) * this.numeric(amount, token);
        if (index < 0 || index > ref.block.values.length) fail('runtime_error', '指针运算超出所属数组范围。', token);
        const v = ptr.copy(); v.reference = new CRef(ref.block, index, ref.type); return v;
      }
      if (op === '-' && left.reference !== undefined && right.reference !== undefined && left.reference.block === right.reference.block) return this.integer(left.reference.index - right.reference.index);
      fail('unsupported', '不支持该指针运算。', token);
    }
    const lu = left.type.base === 'int' && left.type.unsigned; const ru = right.type.base === 'int' && right.type.unsigned;
    const unsigned = op === '<<' || op === '>>' ? lu : lu || ru;
    let a = this.numeric(left, token); let b = this.numeric(right, token);
    if (unsigned && op !== '<<' && op !== '>>') { a = a >>> 0; b = b >>> 0; }
    let result = 0;
    switch (op) {
      case '+': result = a + b; break; case '-': result = a - b; break;
      case '*': result = unsigned ? Math.imul(a, b) >>> 0 : a * b; break;
      case '/': case '%':
        if (b === 0) fail('runtime_error', '除数不能为 0。', token);
        if (!unsigned && a === -2147483648 && b === -1) fail('runtime_error', '有符号整数除法溢出。', token);
        result = op === '/' ? Math.trunc(a / b) : a % b; break;
      case '<<': case '>>':
        if (b < 0 || b > 31 || !Number.isInteger(b)) fail('runtime_error', '32 位整数的移位位数必须为 0 至 31。', token);
        if (op === '>>') result = unsigned ? a >>> b : a >> b;
        else if (unsigned) result = (a << b) >>> 0;
        else { if (a < 0) fail('runtime_error', '不支持对负的有符号整数左移。', token); result = a * Math.pow(2, b); }
        break;
      case '&': result = a & b; break; case '|': result = a | b; break; case '^': result = a ^ b; break;
      case '==': return this.integer(a === b ? 1 : 0); case '!=': return this.integer(a !== b ? 1 : 0);
      case '<': return this.integer(a < b ? 1 : 0); case '>': return this.integer(a > b ? 1 : 0);
      case '<=': return this.integer(a <= b ? 1 : 0); case '>=': return this.integer(a >= b ? 1 : 0);
      default: fail('unsupported', '不支持的运算符：' + op, token);
    }
    if (unsigned) return this.integer(result >>> 0, true);
    if (!Number.isFinite(result) || result < -2147483648 || result > 2147483647) fail('runtime_error', '有符号 32 位整数溢出。', token);
    return this.integer(result);
  }
  declare(node: CNode): void {
    const scope = this.scope();
    if (scope.bindings.has(node.text)) fail('compile_error', '当前作用域重复声明：' + node.text, node.token);
    const element = node.type.array >= 0 ? node.type.element() : node.type.copy();
    const length = node.type.array >= 0 ? node.type.array : 1;
    const block = this.allocate(element, length, scope === this.global, node.token); scope.blocks.push(block);
    const ref = new CRef(block, 0, element); scope.bindings.set(node.text, new CBinding(node.type, ref));
    if (node.children.length === 0) return;
    const init = node.children[0];
    if (node.type.array < 0) {
      if (init.kind === 'initlist') {
        if (init.children.length !== 1) fail('compile_error', '标量初始化需要一个值。', init.token);
        this.write(ref, this.evaluate(init.children[0]), init.token);
      } else this.write(ref, this.evaluate(init), init.token);
      return;
    }
    for (let i = 0; i < length; i++) this.write(new CRef(block, i, element), this.integer(0), node.token);
    if (init.kind === 'initlist') {
      if (init.children.length > length) fail('compile_error', '数组初始化元素过多。', init.token);
      for (let i = 0; i < init.children.length; i++) this.write(new CRef(block, i, element), this.evaluate(init.children[i]), init.token);
    } else if (init.kind === 'string' && element.base === 'char' && element.pointers === 0) {
      const bytes = this.bytes(init.text);
      if (bytes.length > length) fail('compile_error', '字符串初始化超过数组容量。', init.token);
      for (let i = 0; i < bytes.length; i++) this.write(new CRef(block, i, element), this.integer(bytes[i]), init.token);
    } else fail('unsupported', '数组只能由花括号列表或字符字符串初始化。', init.token);
  }
  execute(node: CNode): CFlow {
    this.tick(node.token);
    const normal = new CFlow();
    switch (node.kind) {
      case 'empty': return normal;
      case 'exprstmt': this.evaluate(node.children[0]); return normal;
      case 'decls': for (const d of node.children) this.declare(d); return normal;
      case 'block':
        this.enter();
        try { for (const child of node.children) { const flow = this.execute(child); if (flow.kind !== 'normal') return flow; } }
        finally { this.leave(); }
        return normal;
      case 'if':
        if (this.truth(this.evaluate(node.children[0]))) return this.execute(node.children[1]);
        return node.children.length > 2 ? this.execute(node.children[2]) : normal;
      case 'return':
        normal.kind = 'return'; normal.hasValue = node.children.length > 0;
        if (normal.hasValue) normal.value = this.evaluate(node.children[0]);
        return normal;
      case 'break': case 'continue': normal.kind = node.kind; return normal;
      case 'for':
        this.enter();
        try {
          this.execute(node.children[0]);
          while (node.children[1].kind === 'empty' || this.truth(this.evaluate(node.children[1]))) {
            this.tick(node.token); const flow = this.execute(node.children[3]);
            if (flow.kind === 'return') return flow; if (flow.kind === 'break') break;
            if (node.children[2].kind !== 'empty') this.evaluate(node.children[2]);
          }
        } finally { this.leave(); }
        return normal;
      case 'while':
        while (this.truth(this.evaluate(node.children[0]))) {
          this.tick(node.token); const flow = this.execute(node.children[1]);
          if (flow.kind === 'return') return flow; if (flow.kind === 'break') break;
        }
        return normal;
      case 'do':
        do {
          this.tick(node.token); const flow = this.execute(node.children[0]);
          if (flow.kind === 'return') return flow; if (flow.kind === 'break') break;
        } while (this.truth(this.evaluate(node.children[1])));
        return normal;
    }
    fail('unsupported', '不支持的语句。', node.token);
  }
  append(text: string, token: CToken): void {
    if (this.output.length + text.length > 32768) fail('runtime_error', '输出超过 32768 个字符，请检查输出循环。', token);
    this.output += text;
  }
  argument(args: CValue[], index: number, token: CToken): CValue {
    if (index >= args.length) fail('runtime_error', '函数实参不足。', token);
    return args[index];
  }
  printf(args: CValue[], token: CToken): CValue {
    const format = this.cstring(this.argument(args, 0, token), token); let index = 1; let output = '';
    for (let i = 0; i < format.length; i++) {
      this.tick(token); const ch = format.charAt(i);
      if (ch !== '%') { output += ch; continue; }
      i++; if (format.charAt(i) === '%') { output += '%'; continue; }
      let flags = '';
      while (i < format.length && '-+ 0#'.indexOf(format.charAt(i)) >= 0) flags += format.charAt(i++);
      let widthText = '';
      while (i < format.length && format.charAt(i) >= '0' && format.charAt(i) <= '9') widthText += format.charAt(i++);
      const width = widthText.length > 0 ? parseInt(widthText, 10) : 0;
      if (width > 256) fail('unsupported', '输出格式宽度最多为 256。', token);
      let precision = -1;
      if (format.charAt(i) === '.') {
        i++; let p = '';
        while (i < format.length && format.charAt(i) >= '0' && format.charAt(i) <= '9') p += format.charAt(i++);
        precision = p.length > 0 ? parseInt(p, 10) : 0;
        if (precision > 256) fail('unsupported', '输出精度最多为 256。', token);
      }
      const spec = format.charAt(i);
      if (['d', 'i', 'u', 'x', 'X', 'o', 'c', 's'].indexOf(spec) < 0) fail('unsupported', 'printf 暂不支持格式 %' + spec + '；支持 d、u、x、o、c、s 和 %% 。', token);
      const value = this.argument(args, index++, token); let text = ''; let prefix = '';
      if (spec === 's') { text = this.cstring(value, token); if (precision >= 0) text = text.substring(0, precision); }
      else if (spec === 'c') {
        const ch = this.numeric(value, token) & 255;
        if (ch > 127) fail('unsupported', '%c 输出仅支持 ASCII 字符；UTF-8 文本请使用 %s。', token);
        text = String.fromCharCode(ch);
      }
      else {
        const signed = spec === 'd' || spec === 'i'; const num = signed ? this.numeric(value, token) | 0 : this.numeric(value, token) >>> 0;
        const radix = spec === 'x' || spec === 'X' ? 16 : spec === 'o' ? 8 : 10;
        text = Math.abs(num).toString(radix);
        if (spec === 'X') text = text.toUpperCase();
        if (precision === 0 && num === 0) text = '';
        while (text.length < precision) text = '0' + text;
        if (num < 0) prefix = '-'; else if (signed && flags.indexOf('+') >= 0) prefix = '+'; else if (signed && flags.indexOf(' ') >= 0) prefix = ' ';
        if (flags.indexOf('#') >= 0 && num !== 0) { if (spec === 'x') prefix = '0x'; else if (spec === 'X') prefix = '0X'; else if (spec === 'o' && !text.startsWith('0')) prefix = '0'; }
      }
      const left = flags.indexOf('-') >= 0; const zero = flags.indexOf('0') >= 0 && !left && precision < 0 && spec !== 's' && spec !== 'c';
      let padding = ''; while (padding.length + prefix.length + text.length < width) padding += zero ? '0' : ' ';
      output += left ? prefix + text + padding : zero ? prefix + padding + text : padding + prefix + text;
      if (output.length > 32768) fail('runtime_error', '单次输出超过上限。', token);
    }
    this.append(output, token); return this.integer(this.bytes(output).length);
  }
  whitespace(ch: string): boolean { return ch.length > 0 && ' \t\r\n\v\f'.indexOf(ch) >= 0; }
  scanf(args: CValue[], token: CToken): CValue {
    const format = this.cstring(this.argument(args, 0, token), token); let arg = 1; let count = 0;
    for (let i = 0; i < format.length; i++) {
      this.tick(token); const ch = format.charAt(i);
      if (this.whitespace(ch)) { while (this.whitespace(this.input.charAt(this.inputPos))) this.inputPos++; continue; }
      if (ch !== '%') {
        if (this.input.charAt(this.inputPos) !== ch) return this.integer(count === 0 && this.inputPos >= this.input.length ? -1 : count);
        this.inputPos++; continue;
      }
      i++;
      if (format.charAt(i) === '%') { if (this.input.charAt(this.inputPos) !== '%') return this.integer(count); this.inputPos++; continue; }
      const suppress = format.charAt(i) === '*'; if (suppress) i++;
      let widthText = '';
      while (i < format.length && format.charAt(i) >= '0' && format.charAt(i) <= '9') widthText += format.charAt(i++);
      const spec = format.charAt(i); const width = widthText.length > 0 ? parseInt(widthText, 10) : spec === 'c' ? 1 : 16384;
      if (width < 1 || width > 16384) fail('unsupported', 'scanf 读取宽度必须为 1 至 16384。', token);
      if (['d', 'u', 'c', 's'].indexOf(spec) < 0) fail('unsupported', 'scanf 目前支持 %d、%u、%c、%s 和读取宽度。', token);
      if (spec !== 'c') while (this.whitespace(this.input.charAt(this.inputPos))) this.inputPos++;
      if (this.inputPos >= this.input.length) return this.integer(count === 0 ? -1 : count);
      let raw = '';
      if (spec === 'd' || spec === 'u') {
        let p = this.inputPos;
        if (this.input.charAt(p) === '-' || this.input.charAt(p) === '+') raw += this.input.charAt(p++);
        let digits = 0;
        while (raw.length < width && this.input.charAt(p).length > 0 && this.input.charAt(p) >= '0' && this.input.charAt(p) <= '9') { raw += this.input.charAt(p++); digits++; }
        if (digits === 0) return this.integer(count);
        this.inputPos = p;
      } else {
        while (raw.length < width && this.inputPos < this.input.length && (spec === 'c' || !this.whitespace(this.input.charAt(this.inputPos)))) raw += this.input.charAt(this.inputPos++);
        if (raw.length === 0) return this.integer(count);
      }
      if (suppress) continue;
      const target = this.argument(args, arg++, token);
      if (target.type.pointers !== 1 || target.reference === undefined) fail('runtime_error', 'scanf 需要有效的目标地址，请检查 &。', token);
      const ref = target.reference;
      if (spec === 'd' || spec === 'u') {
        if (ref.type.base !== 'int' || ref.type.pointers !== 0 || ref.type.unsigned !== (spec === 'u')) fail('runtime_error', 'scanf 格式与目标整数类型不匹配。', token);
        const n = parseInt(raw, 10);
        if (!Number.isFinite(n) || n < -2147483648 || n > (spec === 'u' ? 4294967295 : 2147483647)) fail('runtime_error', '输入整数超出目标类型范围。', token);
        this.write(ref, this.integer(n, spec === 'u'), token);
      } else {
        if (ref.type.base !== 'char' || ref.type.pointers !== 0) fail('runtime_error', 'scanf 字符格式需要 char 数组或地址。', token);
        const bytes = this.bytes(raw); if (spec === 's') bytes.push(0);
        for (let j = 0; j < bytes.length; j++) this.check(new CRef(ref.block, ref.index + j, ref.type), token, true);
        for (let j = 0; j < bytes.length; j++) this.write(new CRef(ref.block, ref.index + j, ref.type), this.integer(bytes[j]), token);
      }
      count++;
    }
    return this.integer(count);
  }
  call(name: string, args: CValue[], token: CToken): CValue {
    this.tick(token);
    if (name === 'printf') return this.printf(args, token);
    if (name === 'scanf') return this.scanf(args, token);
    if (name === 'puts' || name === 'strlen' || name === 'putchar') {
      if (args.length !== 1) fail('runtime_error', name + ' 需要一个参数。', token);
      if (name === 'putchar') {
        const n = this.numeric(args[0], token) & 255;
        if (n > 127) fail('unsupported', 'putchar 输出仅支持 ASCII 字符。', token);
        this.append(String.fromCharCode(n), token); return this.integer(n);
      }
      const str = this.cstring(args[0], token);
      if (name === 'strlen') return this.integer(this.bytes(str).length, true);
      this.append(str + '\n', token); return this.integer(0);
    }
    if (name === 'getchar') {
      if (args.length !== 0) fail('runtime_error', 'getchar 不接收参数。', token);
      return this.integer(this.inputPos >= this.input.length ? -1 : this.input.charCodeAt(this.inputPos++));
    }
    const fn = this.program.functions.find((f: CFunction): boolean => f.name === name && f.defined);
    if (fn === undefined) fail('unsupported', '未定义或当前子集不支持的函数：' + name + '。不提供文件、系统、网络或动态内存接口。', token);
    if (args.length !== fn.parameters.length) fail('compile_error', name + ' 需要 ' + fn.parameters.length + ' 个参数。', token);
    if (this.frames.length >= 48) fail('runtime_error', '函数调用深度超过 48，请检查递归。', token);
    const frame = new CFrame(); frame.scopes.push(new CScope()); this.frames.push(frame);
    try {
      for (let i = 0; i < args.length; i++) {
        const p = fn.parameters[i]; const block = this.allocate(p.type, 1, true, token); this.scope().blocks.push(block);
        const ref = new CRef(block, 0, p.type); this.scope().bindings.set(p.name, new CBinding(p.type, ref)); this.write(ref, args[i], token);
      }
      // Function parameters and the outer function body share one C scope.
      let flow = new CFlow();
      for (const child of fn.body.children) { flow = this.execute(child); if (flow.kind !== 'normal') break; }
      if (fn.type.base === 'void' && fn.type.pointers === 0) {
        if (flow.hasValue) fail('compile_error', 'void 函数不能返回值。', fn.token);
        const v = new CValue(); v.type.base = 'void'; return v;
      }
      if (flow.kind !== 'return' || !flow.hasValue) {
        if (name === 'main' && !flow.hasValue) return this.integer(0);
        fail('runtime_error', '非 void 函数没有返回值：' + name, fn.token);
      }
      return this.convert(flow.value, fn.type, token);
    } finally { while (frame.scopes.length > 0) this.leave(); this.frames.pop(); }
  }
  run(): void {
    if (this.input.length > 16384) fail('unsupported', '测试输入最多 16384 个字符。', new CToken());
    for (let i = 0; i < this.input.length; i++) {
      if (this.input.charCodeAt(i) > 127) fail('unsupported', '当前 scanf/getchar 教学输入只支持 ASCII 字符；源代码字符串支持 UTF-8 中文。', new CToken());
    }
    for (const node of this.program.globals) this.execute(node);
    const main = this.program.functions.find((f: CFunction): boolean => f.name === 'main' && f.defined);
    if (main === undefined) fail('compile_error', '缺少 main 函数。', new CToken());
    if (main.parameters.length !== 0) fail('unsupported', '请使用 int main(void)，当前不提供命令行参数。', main.token);
    const result = this.call('main', [], main.token);
    if (result.number !== 0) fail('runtime_error', '程序返回非零退出码 ' + result.number + '。', main.token);
  }
}

export class LearningC {
  static run(code: string, input: string): CRunResult {
    const result = new CRunResult(); let interpreter: CInterpreter | undefined = undefined;
    try {
      const tokens = new CLexer(code).tokenize();
      const program = new CParser(tokens).parse();
      interpreter = new CInterpreter(program, input); interpreter.run();
    } catch (error) {
      if (error instanceof CFailure) { result.status = error.status; result.diagnostic = error.message; }
      else if (error instanceof Error) { result.status = 'runtime_error'; result.diagnostic = '解释器无法完成本次运行：' + error.message; }
      else { result.status = 'runtime_error'; result.diagnostic = '解释器遇到无法处理的错误。'; }
    }
    if (interpreter !== undefined) { result.output = interpreter.output; result.steps = interpreter.steps; }
    return result;
  }
}
