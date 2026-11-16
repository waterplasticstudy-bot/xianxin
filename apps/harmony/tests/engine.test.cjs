'use strict';
// Host verification of the exact ArkTS-compatible source. The VM below loads
// trusted transpiled engine code only; student C is handled by its parser/AST.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require(process.env.LEARNING_TYPESCRIPT || 'D:/Program Files/Huawei/DevEco Studio/sdk/default/openharmony/ets/build-tools/ets-loader/node_modules/typescript/lib/typescript.js');
const sourcePath = path.join(__dirname, '../entry/src/main/ets/engine/LearningC.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const built = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, strict: true }, reportDiagnostics: true });
const errors = (built.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error);
assert.equal(errors.length, 0, errors.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n'));
const sandbox = { exports: {} };
vm.runInNewContext(built.outputText, sandbox, { timeout: 5000, filename: 'LearningC.js' });
const LearningC = sandbox.exports.LearningC;
const curriculumPath = process.env.LEARNING_CURRICULUM || 'D:/STM32-Learning/LearningStudio/content/curriculum.json';
const curriculum = JSON.parse(fs.readFileSync(curriculumPath, 'utf8'));
const exercises = curriculum.exercises.filter(e => e.type === 'code');
let count = 0;
let checks = 0;
for (const exercise of exercises) {
  for (const test of exercise.tests) {
    const result = LearningC.run(exercise.solution, test.input);
    assert.equal(result.status, 'ok', `${exercise.id}: ${result.diagnostic}`);
    assert.equal(result.output, test.expected, `${exercise.id}, input=${JSON.stringify(test.input)}`);
    assert.ok(result.steps > 0);
    count++;
  }
}
assert.equal(exercises.length, 14);
assert.equal(count, 44);
function run(code, expected, input = '') {
  const result = LearningC.run(code, input);
  assert.equal(result.status, 'ok', result.diagnostic + '\n' + code);
  assert.equal(result.output, expected, code);
  checks++;
  return result;
}
function reject(code, status, diagnostic, input = '') {
  const result = LearningC.run(code, input);
  assert.equal(result.status, status, JSON.stringify(result) + '\n' + code);
  if (diagnostic) assert.match(result.diagnostic, diagnostic);
  checks++;
  return result;
}
run('int main(void){int x=5; printf("%d %d\\n",x/2,x%2); return 0;}', '2 1\n');
run('int main(void){int x=-5; printf("%d %d\\n",x/2,x%2); return 0;}', '-2 -1\n');
run('int main(void){int x=7; if(0 && (1/0))x=9; if(1 || (1/0))x+=2; printf("%d",x);}', '9');
run('int main(void){int i=0,j=0; for(i=0,j=1;i<5;i++,j+=2){if(i==2)continue; if(i==4)break;} printf("%d %d",i,j);}', '4 9');
run('int main(void){int i=0,s=0; while(i<4){++i;if(i==2)continue;s+=i;} do{s++;}while(0); printf("%d",s);}', '9');
run('int main(void){int n=0; printf("%d", n?1/0:42);}', '42');
run('int square(int x){return x*x;} int main(void){int x=3;printf("%d %d",square(x+1),x);}', '16 3');
run('int f(int n){if(n<2)return 1;return n*f(n-1);} int main(void){printf("%d",f(6));}', '720');
run('int global=4; int add(int x){global+=x;return global;} int main(void){int global=100;printf("%d %d",add(3),global);}', '7 100');
run('int main(void){int x=1;{int x=2;printf("%d ",x);}printf("%d",x);}', '2 1');
run('int sum(int a[],int n){int total=0;for(int i=0;i<n;i++)total+=a[i];return total;}int main(void){int a[4]={2,3,4};printf("%d",sum(a,4));}', '9');
run('int main(void){int a[3]={10,20,30};int *p=a;printf("%d ",*p++);*p+=2;printf("%d %d",a[1],*(p+1));}', '10 22 30');
run('int main(void){int x=4;int *p=&x;int **q=&p;**q=11;printf("%d",x);}', '11');
run('int main(void){int *p=0;printf("%d %d",p==0,p!=0);}', '1 0');
run('int main(void){int a[3]={1,2,3};int *end=a+3;printf("%d",end-a);}', '3');
run('int main(void){char word[8]="hi";printf("%s %u",word,strlen(word));}', 'hi 2');
run('int main(void){printf("你好，STM32！\\n");}', '你好，STM32！\n');
run('int main(void){unsigned int n=1u<<31;printf("%u %u %u",n,n>>31,4294967295u+1u);}', '2147483648 1 0');
run('int main(void){unsigned int n=0xFFFFFFFFu;printf("%08X %u",n,n*3u);}', 'FFFFFFFF 4294967293');
run('int main(void){int a=3;int before=a++;int after=++a;printf("%d %d %d",before,after,a);}', '3 5 5');
run('int main(void){int a[3]={1,2,3};int i=0;a[i++]+=5;printf("%d %d",a[0],i);}', '6 1');
run('int main(void){int a,b;char word[4];printf("%d ",scanf("%d %d %3s",&a,&b,word));printf("%d %s",a+b,word);}', '3 0 abc', '-2 2 abcdef');
run('int main(void){int a;printf("%d",scanf("%d",&a));}', '-1');
run('int main(void){int a;printf("%d",scanf("%d",&a));}', '0', 'oops');
run('int main(void){char c;scanf("%c",&c);putchar(c);puts("!");}', 'A!\n', 'A');
run('int main(void){printf("%+05d|%-5s|%.3s|%#x|%%",12,"C","abcd",31);}', '+0012|C    |abc|0x1f|%');
run('int main(void){printf("%d",-2147483648);}', '-2147483648');
reject('int main(void){printf("x") return 0;}', 'compile_error', /应为/);
reject('int main(void){int a[2];a[2]=7;}', 'runtime_error', /越界/);
reject('int main(void){int a[2];a[-1]=7;}', 'runtime_error', /越界/);
reject('int main(void){int *p=0;*p=7;}', 'runtime_error', /空指针/);
reject('int main(void){int *p;{int x=3;p=&x;}printf("%d",*p);}', 'runtime_error', /作用域/);
reject('int main(void){int x;printf("%d",x);}', 'runtime_error', /未初始化/);
reject('int main(void){int a[3]={1,2,3};int *p=a+3;printf("%d",*p);}', 'runtime_error', /越界/);
reject('int main(void){char *p="hello";p[0]=65;}', 'runtime_error', /字符串常量/);
reject('int main(void){char a[3];scanf("%s",a);}', 'runtime_error', /越界/, 'ABCD');
reject('int main(void){int a;scanf("%u",&a);}', 'runtime_error', /类型不匹配/, '12');
reject('int main(void){printf("%d",4/0);}', 'runtime_error', /除数/);
reject('int main(void){printf("%d",1<<32);}', 'runtime_error', /移位/);
reject('int main(void){printf("%d",2147483647+1);}', 'runtime_error', /溢出/);
reject('int main(void){printf("%d",1<<31);}', 'runtime_error', /溢出/);
reject('int main(void){while(1){}}', 'timeout', /200000/);
reject('int main(void){for(;;);}', 'timeout', /200000/);
reject('int f(void){return f();}int main(void){return f();}', 'runtime_error', /深度|嵌套/);
reject('int main(void){while(1)printf("abcdefghijklmnop");}', 'runtime_error', /输出/);
reject('int main(void){int a[5000];}', 'unsupported', /4096/);
reject('int main(void){int a[4096],b[4096],c[4096],d[4096],e[4096],f[4096],g[4096],h[4096],i[1];}', 'runtime_error', /内存上限/);
reject('#include <stdlib.h>\nint main(void){system("anything");}', 'unsupported', /有限函数/);
reject('int main(void){system("anything");}', 'unsupported', /系统/);
reject('int main(void){int *p=malloc(4);}', 'unsupported', /动态内存/);
reject('int main(void){double x=2.5;}', 'unsupported', /double|浮点/);
reject('#define X 3\nint main(void){return 0;}', 'unsupported', /宏/);
reject('int main(void){int n=5;int a[n];}', 'unsupported', /变长数组/);
reject('int main(void){printf("%n",0);}', 'unsupported', /printf/);
reject('int main(void){break;}', 'compile_error', /循环内/);
reject('int main(void){return 2;}', 'runtime_error', /退出码 2/);
reject('int main(void){printf("x);}', 'compile_error', /结束引号/);
reject('int main(void){/*', 'compile_error', /注释/);
reject('int main(void){int x=1;int x=2;}', 'compile_error', /重复声明/);
reject('int f(int x){int x=2;return x;}int main(void){return f(1);}', 'compile_error', /重复声明/);
reject('int main(void){printf("%d",2147483648);}', 'unsupported', /范围/);
reject('int main(void){getchar();}', 'unsupported', /ASCII/, '汉');
reject('int main(void){printf("\\xFF");}', 'unsupported', /ASCII/);
reject('int main(void){printf("%c",255);}', 'unsupported', /ASCII/);
reject('int main(void){printf("%d",missing);}', 'compile_error', /未声明/);
reject('int other(void){return 0;}', 'compile_error', /main/);
reject('x'.repeat(65537), 'unsupported', /代码长度/);
reject('int main(void){' + '{'.repeat(100) + ';' + '}'.repeat(100) + '}', 'unsupported', /嵌套/);
// Errors and mutations cannot leak into later independent runs/test cases.
run('int main(void){printf("clean");}', 'clean');
console.log(JSON.stringify({ status: 'passed', curriculumExercises: exercises.length, curriculumCases: count, additionalChecks: checks, source: sourcePath }, null, 2));
