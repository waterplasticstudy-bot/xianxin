import { TrainingCodeTest, TrainingLevel, TrainingQuestion, TrainingRecipe, TrainingSkill, TrainingTemplate } from './TrainingModels';

export const TRAINING_BASE_VARIANTS: number = 12;
export const TRAINING_MAX_RECIPE_SEED: number = 9999;
export const TRAINING_BANK_SIZE: number = 288;

const TEMPLATES: TrainingTemplate[] = [
  { id: 'c-output-line', title: '第一行输出', level: 1, skillId: 'output', type: 'code', variantCount: 12, parameterized: true },
  { id: 'c-arith-add', title: '整数加法', level: 1, skillId: 'variables', type: 'code', variantCount: 12, parameterized: true },
  { id: 'c-arith-scale', title: '整数倍数', level: 1, skillId: 'variables', type: 'code', variantCount: 12, parameterized: true },
  { id: 'c-divmod', title: '商与余数', level: 2, skillId: 'variables', type: 'code', variantCount: 12, parameterized: true },
  { id: 'c-branch-threshold', title: '阈值判断', level: 1, skillId: 'branches', type: 'code', variantCount: 12, parameterized: true },
  { id: 'c-branch-clamp', title: '下限保护', level: 2, skillId: 'branches', type: 'code', variantCount: 12, parameterized: true },
  { id: 'c-parity-trace', title: '读懂奇偶分支', level: 1, skillId: 'branches', type: 'quiz', variantCount: 12, parameterized: true },
  { id: 'c-loop-weighted-sum', title: '循环累加', level: 2, skillId: 'loops', type: 'code', variantCount: 12, parameterized: true },
  { id: 'c-loop-multiples', title: '数一数倍数', level: 2, skillId: 'loops', type: 'code', variantCount: 12, parameterized: true },
  { id: 'c-loop-sequence', title: '逐行输出数列', level: 1, skillId: 'loops', type: 'code', variantCount: 12, parameterized: true },
  { id: 'c-array-sum-offset', title: '数组求和与偏移', level: 2, skillId: 'arrays', type: 'code', variantCount: 12, parameterized: true },
  { id: 'c-array-count-threshold', title: '数组条件计数', level: 2, skillId: 'arrays', type: 'code', variantCount: 12, parameterized: true },
  { id: 'c-array-index', title: '数组从零编号', level: 1, skillId: 'arrays', type: 'code', variantCount: 12, parameterized: true },
  { id: 'c-function-affine', title: '带参数的计算函数', level: 2, skillId: 'functions', type: 'code', variantCount: 12, parameterized: true },
  { id: 'c-function-distance', title: '距离函数', level: 2, skillId: 'functions', type: 'code', variantCount: 12, parameterized: true },
  { id: 'c-function-filtered-sum', title: '函数与循环配合', level: 3, skillId: 'functions', type: 'code', variantCount: 12, parameterized: true },
  { id: 'c-array-reverse-offset', title: '倒序处理数组', level: 3, skillId: 'arrays', type: 'code', variantCount: 12, parameterized: true },
  { id: 'c-nested-grid', title: '两层循环计数', level: 3, skillId: 'loops', type: 'code', variantCount: 12, parameterized: true },
  { id: 'c-branch-bands', title: '三个区间', level: 3, skillId: 'branches', type: 'code', variantCount: 12, parameterized: true },
  { id: 'c-digit-sum-offset', title: '拆分十进制数位', level: 3, skillId: 'loops', type: 'code', variantCount: 12, parameterized: true },
  { id: 'c-output-precedence', title: '预测运算输出', level: 1, skillId: 'output', type: 'quiz', variantCount: 12, parameterized: true },
  { id: 'c-loop-boundary-trace', title: '循环边界多一次', level: 2, skillId: 'loops', type: 'quiz', variantCount: 12, parameterized: true },
  { id: 'stm32-foundations', title: '认识单片机', level: 1, skillId: 'stm32', type: 'quiz', variantCount: 12, parameterized: false },
  { id: 'stm32-applied', title: '理解外设与验证', level: 2, skillId: 'stm32', type: 'quiz', variantCount: 12, parameterized: false }
];

export function getTrainingTemplates(): TrainingTemplate[] {
  return JSON.parse(JSON.stringify(TEMPLATES)) as TrainingTemplate[];
}
export function getTrainingSkills(): TrainingSkill[] {
  return [
    { id: 'output', title: '输出与读代码', description: '从 printf 开始，看清表达式的结果。', levels: [1] },
    { id: 'variables', title: '变量与运算', description: '整数输入、运算、整除和余数。', levels: [1, 2] },
    { id: 'branches', title: '条件分支', description: '从一个条件到多个边界。', levels: [1, 2, 3] },
    { id: 'loops', title: '循环', description: '数列、累加、计数与两层循环。', levels: [1, 2, 3] },
    { id: 'arrays', title: '数组', description: '下标、遍历与倒序处理。', levels: [1, 2, 3] },
    { id: 'functions', title: '函数', description: '把计算分成能单独理解的步骤。', levels: [2, 3] },
    { id: 'stm32', title: 'STM32 入门概念', description: '没有开发板也可先理解原理；概念答对不算硬件验证。', levels: [1, 2] }
  ];
}

function checkedRecipe(recipe: TrainingRecipe): TrainingTemplate {
  if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe)) throw new Error('变式必须是 JSON 对象。');
  const keys = Object.keys(recipe);
  if (keys.length !== 2 || !keys.includes('templateId') || !keys.includes('seed')) throw new Error('变式只允许 templateId 和 seed 两个字段。');
  if (typeof recipe.templateId !== 'string' || typeof recipe.seed !== 'number' || !Number.isInteger(recipe.seed) || recipe.seed < 0 || recipe.seed > TRAINING_MAX_RECIPE_SEED) throw new Error('变式 seed 必须是 0–9999 的整数。');
  const template = TEMPLATES.find((item: TrainingTemplate) => item.id === recipe.templateId);
  if (!template) throw new Error('未知的可信题型模板。');
  return template;
}
export function validateRecipe(rawJSON: string): TrainingRecipe {
  if (typeof rawJSON !== 'string' || rawJSON.length < 2 || rawJSON.length > 2048) throw new Error('变式 JSON 长度不合法。');
  let recipe: TrainingRecipe;
  try { recipe = JSON.parse(rawJSON) as TrainingRecipe; } catch (_) { throw new Error('变式必须是完整 JSON，不含代码围栏或说明文字。'); }
  checkedRecipe(recipe);
  return { templateId: recipe.templateId, seed: recipe.seed };
}
export function getTrainingQuestion(id: string): TrainingQuestion | undefined {
  if (typeof id !== 'string' || id.length > 90) return undefined;
  const pieces = id.split(':');
  if (pieces.length !== 3 || pieces[0] !== 'tr' || !/^(0|[1-9][0-9]{0,3})$/.test(pieces[2])) return undefined;
  const seed = Number(pieces[2]);
  if (!TEMPLATES.some((item: TrainingTemplate) => item.id === pieces[1])) return undefined;
  return generate({ templateId: pieces[1], seed: seed });
}

function program(body: string): string { return '#include <stdio.h>\nint main(void) {\n' + body + '\n  return 0;\n}\n'; }
function test(input: string, expected: string): TrainingCodeTest { return { input: input, expected: expected }; }
function integerTests(values: number[], calculate: (value: number) => string): TrainingCodeTest[] {
  return values.map((value: number) => test(value.toString() + '\n', calculate(value) + '\n'));
}
function quiz(q: TrainingQuestion, prompt: string, correct: string, wrong: string[], explanation: string): void {
  const choices = [correct, ...wrong];
  const shift = q.seed % 4;
  q.prompt = prompt;
  q.choices = choices.slice(shift).concat(choices.slice(0, shift));
  q.answer = (4 - shift) % 4;
  q.explanation = explanation;
  q.hints = ['先找题目中给出的条件，再逐项排除与条件不符的说法。'];
}

interface Concept { prompt: string; correct: string; wrong: string[]; explanation: string; }
const FOUNDATIONS: Concept[] = [
  { prompt: 'STM32 单片机最接近下面哪一种设备？', correct: '把处理器、存储器和多种外设集成在芯片中的微控制器', wrong: ['只能存文件的 U 盘', '只能放大电压的运算放大器', '必须接互联网才能计算的云服务器'], explanation: '微控制器可以在本地执行固件，并通过 GPIO、定时器等外设与电路交互。' },
  { prompt: '正常断电后，已经烧录的程序通常存放在 STM32 的哪种片内存储器中？', correct: 'Flash', wrong: ['一般运行时使用的 SRAM', 'CPU 的普通通用寄存器', '调试终端的输入框'], explanation: 'Flash 是非易失存储器；普通 SRAM 和 CPU 寄存器不用于断电保存固件。' },
  { prompt: '程序运行时，普通局部变量的数据通常需要哪类可读写存储空间？', correct: 'RAM（并可能被编译器放入寄存器）', wrong: ['只能写一次的熔丝', '必须写入外部 SD 卡', '必须存在云端账号里'], explanation: '变量的具体位置由编译器和链接配置决定；运行时的可变数据通常使用 RAM 或寄存器。' },
  { prompt: 'GPIO 这个名称主要指什么？', correct: '通用输入输出引脚', wrong: ['图形处理器的显示分辨率', '一种网络域名', '只有读取功能的程序存储器'], explanation: 'GPIO 可按芯片能力配置为输入、输出或复用功能；不能把所有引脚都当成随意可用的电源。' },
  { prompt: '直接驱动一个普通指示 LED 时，串联限流电阻的主要作用是什么？', correct: '限制 LED 和引脚电流', wrong: ['把所有 GPIO 自动变成 5 V 耐受', '使程序自动烧录成功', '让 LED 正负极可以任意接'], explanation: '实际阻值需要结合供电、LED 压降和允许电流计算，并检查引脚驱动能力。' },
  { prompt: 'UART 接收端要正确接收发送端的数据，通常需要先匹配什么？', correct: '波特率、数据位、校验和停止位等串口格式', wrong: ['电脑桌面壁纸', '源代码文件的创建日期', '编辑器字体大小'], explanation: '两端帧格式和电平还要兼容；匹配格式只是通信所需条件之一。' },
  { prompt: 'ADC 的基本作用是什么？', correct: '把允许范围内的模拟电压量化为数字值', wrong: ['把任何电压都安全降到 3.3 V', '自动给电池充电', '替代所有数字输入引脚'], explanation: 'ADC 输入有量程和电气限制；超出允许范围可能损坏芯片，ADC 不是保护电路。' },
  { prompt: 'PWM 常用来描述哪种信号？', correct: '周期性脉冲信号，可改变高电平所占比例', wrong: ['幅值可以任意升高的恒定直流电压', '只能通过 Wi-Fi 发送的文本', '一种永远不变的存储地址'], explanation: '占空比是一个周期中有效电平持续时间的比例；定时器常用于产生 PWM。' },
  { prompt: '中断的基本意义是什么？', correct: '事件发生时让处理器转去执行相应处理，再继续原任务', wrong: ['每个中断都会永久清空 Flash', '只有程序出错时才会发生中断', '中断发生后处理器必须断电'], explanation: '中断可响应定时器、串口等事件；处理函数应尽量短，并正确处理事件标志。' },
  { prompt: '开始使用 STM32 某个外设前，为什么经常要使能它的时钟？', correct: '该外设需要时钟才能按配置工作', wrong: ['为了设置手机显示的当前时间', '为了把所有引脚拉成高电平', '为了自动增加芯片的存储容量'], explanation: '外设时钟门控可减少功耗；具体使能方式需查芯片手册或对应 HAL 接口。' },
  { prompt: 'HAL 库在 STM32 开发中的主要用途是什么？', correct: '用封装接口操作芯片外设，减少直接寄存器操作的工作', wrong: ['保证错误接线绝不会损坏硬件', '让任意芯片拥有完全相同的引脚', '证明程序已经通过真实硬件测试'], explanation: 'HAL 简化软件接口，但不能代替电路设计、数据手册和硬件验证。' },
  { prompt: '没有开发板时，C 代码编译或模拟练习成功，能说明什么？', correct: '说明相应软件检查通过，不能据此证明接线和真实外设正常', wrong: ['说明所有 GPIO 电压已实测正确', '说明 LED 已在实物上闪烁', '说明串口线一定连接正确'], explanation: '编译、解释器执行、下载、接线和实物测量是不同的验证环节。' }
];
const APPLIED: Concept[] = [
  { prompt: '题设：某 LED 接成低电平点亮。GPIO 输出 0 时会怎样？仅按此题接线判断。', correct: 'LED 点亮', wrong: ['LED 必定熄灭', 'LED 必定闪烁', 'GPIO 自动改成输入'], explanation: '题目已定义有效电平为低电平；其他板卡的 LED 接法可能不同，不能照搬。' },
  { prompt: '题设：定时器计数时钟为 1000 Hz，从 0 数到 ARR=9（含9）后更新，其他模式忽略。更新周期是多少？', correct: '10 ms', wrong: ['9 ms', '1 ms', '1000 ms'], explanation: '一次更新包含 ARR+1=10 个计数周期，每个周期 1 ms，因此为 10 ms。' },
  { prompt: '题设：定时器计数时钟为 2000 Hz，向上计数 0..19 后更新。更新频率是多少？', correct: '100 Hz', wrong: ['2000 Hz', '20 Hz', '约 105.26 Hz'], explanation: '周期包含20个计数：2000÷20=100 Hz。这里已给出计数时钟，不再另除预分频。' },
  { prompt: '题设：PWM 一个周期10 ms，其中高电平3 ms。高电平占空比是多少？', correct: '30%', wrong: ['3%', '70%', '300%'], explanation: '高电平占空比=3÷10×100%=30%。' },
  { prompt: '题设：UART 采用8N1，每字符1起始位、8数据位、1停止位，无间隔，波特率1000。发送10字符至少占线多久？', correct: '100 ms', wrong: ['10 ms', '80 ms', '1000 ms'], explanation: '每字符10位，10字符共100位；100位÷1000位/秒=0.1秒。忽略软件等待。' },
  { prompt: '一个无符号12位 ADC 的数字输出码范围是多少？', correct: '0..4095', wrong: ['0..4096', '-2048..2047', '1..4096'], explanation: '12位有2^12=4096种编码，从0开始的最大值为4095。电压换算还需参考电压等条件。' },
  { prompt: '标准开漏方式的 I²C 总线需要如何产生高电平？', correct: '由合适的上拉电阻拉高，器件通常负责拉低', wrong: ['把每个器件的输出都固定强推高电平', '将 SDA 和 SCL 短接', '不接任何上拉且保证总能可靠通信'], explanation: '开漏输出释放总线时，上拉电阻使线回到高电平；阻值需结合电压、电容和时序选择。' },
  { prompt: '在需要快速响应的中断处理函数中，哪种做法通常更合适？', correct: '记录状态或缓存数据，尽快返回，把较长工作交给主循环', wrong: ['长时间阻塞等待用户输入', '无条件进入无限循环', '每次中断都重刷整片Flash'], explanation: '长时间占用中断可能影响其他事件和实时性；还要按外设要求处理标志与数据。' },
  { prompt: '用兼容电平的 USB-UART 转换器连接开发板时，除 TX/RX 对应外通常还需什么？', correct: '连接共同参考地，并核对电压等级', wrong: ['把 TX 与 GND 直接短接', '忽略转换器输出电压', '只把两端 TX 互连就保证通信'], explanation: '常见 UART 是相对地的单端信号；必须核对引脚、电平与供电，不可随意互接电源。' },
  { prompt: 'STM32 用 SWD 调试时，下面哪组信号最直接相关？', correct: 'SWDIO、SWCLK 和参考地（另按工具要求连接参考电压等）', wrong: ['只需 LED 的两个引脚', '只需 SDA 和 SCL', '只需音频左右声道'], explanation: 'SWDIO传数据，SWCLK提供时钟；具体连接需按开发板与调试器文档确认。' },
  { prompt: '机械按键一次按下时，软件却检测到多个快速边沿。最常见的处理思路是什么？', correct: '考虑触点抖动，使用适当的软件或硬件消抖', wrong: ['立刻认定芯片型号错误', '把输入直接接到超过允许值的电压', '每个边沿都必然代表一次独立按下'], explanation: '机械触点可能在很短时间内反复接通断开；消抖方案应结合响应速度与电路要求。' },
  { prompt: '题设：某引脚未确认5 V耐受，而开发板逻辑电压3.3 V。接入5 V输出信号前应怎样做？', correct: '先查该引脚电气规格，必要时使用合适的电平转换', wrong: ['因为是STM32所以所有引脚都可接5 V', '直接连接后看是否冒烟', '仅修改C变量类型就能保护引脚'], explanation: '不同型号、不同引脚的耐压规则可能不同；软件类型不能改变引脚电气极限。' }
];

export function generate(recipe: TrainingRecipe): TrainingQuestion {
  const t = checkedRecipe(recipe);
  const seed = recipe.seed;
  // Parameters are bounded independently of the recipe range. The base 12 seeds
  // are distinct; larger seeds extend numerical variants with possible collisions.
  const p = 1 + seed % 97;
  const factor = 2 + seed % 29;
  const offset = seed % 41 - 5;
  const threshold = 10 + seed % 71;
  const divisor = 2 + seed % 23;
  const q: TrainingQuestion = {
    id: 'tr:' + t.id + ':' + seed.toString(), templateId: t.id, seed: seed,
    title: t.title, prompt: '', level: t.level, skillId: t.skillId, type: t.type,
    choices: [], answer: -1, starter: '', solution: '', tests: [], hints: [], explanation: ''
  };
  if (t.id === 'c-output-line') {
    const label = 'STM32 step ' + p.toString();
    q.prompt = '不读取输入。输出一行：' + label + '。大小写和空格按题目保留，行末输出换行。';
    q.solution = program('  printf("' + label + '\\n");');
    q.tests = [test('', label + '\n')];
    q.hints = ['printf 的文本放在双引号内。', '字符串中的 \\n 表示换行。'];
    q.explanation = '字符串按原样输出，数字也是这段固定文本的一部分。';
  } else if (t.id === 'c-arith-add' || t.id === 'c-arith-scale') {
    const add = t.id === 'c-arith-add';
    const operand = add ? p : factor;
    q.prompt = '读入一个整数 n（-100≤n≤100），输出 n ' + (add ? '+ ' : '× ') + operand.toString() + ' 的结果，再换行。';
    q.solution = program('  int n;\n  scanf("%d", &n);\n  printf("%d\\n", n ' + (add ? '+' : '*') + ' ' + operand.toString() + ');');
    q.tests = integerTests([-100, -1, 0, 1, 100], (n: number) => (add ? n + operand : n * operand).toString());
    q.hints = ['先声明 int n，再用 scanf("%d", &n) 读入。', '用 %d 输出整数表达式的结果。'];
    q.explanation = '输入范围保证结果处于 int 的安全范围；乘法在 C 中写成 *。';
  } else if (t.id === 'c-divmod') {
    q.prompt = '读入整数 n（0≤n≤200），计算 n 除以 ' + divisor.toString() + ' 的整数商和余数。同一行先输出商，再输出一个空格和余数，最后换行。';
    q.solution = program('  int n;\n  scanf("%d", &n);\n  printf("%d %d\\n", n / ' + divisor.toString() + ', n % ' + divisor.toString() + ');');
    q.tests = integerTests([0, divisor - 1, divisor, divisor + 1, 200], (n: number) => Math.floor(n / divisor).toString() + ' ' + (n % divisor).toString());
    q.hints = ['两个整数做 / 运算得到整数商。', '% 运算得到余数；本题输入非负、除数为正。'];
    q.explanation = 'n = 商×除数+余数，且0≤余数<除数。';
  } else if (t.id === 'c-branch-threshold' || t.id === 'c-branch-clamp') {
    const clamp = t.id === 'c-branch-clamp';
    const bound = clamp ? offset : threshold;
    q.prompt = clamp ? '读入整数 n（-100≤n≤100）。若 n 小于 ' + bound.toString() + '，输出 ' + bound.toString() + '；否则输出 n。最后换行。' : '读入整数 n（-100≤n≤100）。n 小于 ' + bound.toString() + ' 时输出 LOW，否则输出 HIGH。输出单词后换行。';
    q.solution = program('  int n;\n  scanf("%d", &n);\n  if (n < ' + bound.toString() + ') ' + (clamp ? 'printf("%d\\n", ' + bound.toString() + ');\n  else printf("%d\\n", n);' : 'printf("LOW\\n");\n  else printf("HIGH\\n");'));
    q.tests = integerTests([-100, bound - 1, bound, bound + 1, 100], (n: number) => clamp ? Math.max(n, bound).toString() : (n < bound ? 'LOW' : 'HIGH'));
    q.hints = ['注意“小于”不包含边界本身。', '用 if (...) ... else ... 覆盖两种情况。'];
    q.explanation = '测试覆盖边界两侧和恰好等于边界，避免把 < 写成 <=。';
  } else if (t.id === 'c-parity-trace') {
    const n = 7 + seed % 193;
    quiz(q, '执行下面代码，会输出哪个单词？\nint n = ' + n.toString() + ';\nif (n % 2 == 0) printf("EVEN");\nelse printf("ODD");', n % 2 === 0 ? 'EVEN' : 'ODD', [n % 2 === 0 ? 'ODD' : 'EVEN', 'EVENODD', '不输出任何内容'], n.toString() + ' 除以2的余数是 ' + (n % 2).toString() + '，if/else 只执行其中一个分支。');
  } else if (t.id === 'c-loop-weighted-sum') {
    q.prompt = '读入整数 n（0≤n≤20）。计算 ' + factor.toString() + '×1 + ' + factor.toString() + '×2 + … + ' + factor.toString() + '×n，输出总和并换行。n=0 时总和为0。建议使用循环。';
    q.solution = program('  int n, sum = 0;\n  scanf("%d", &n);\n  for (int i = 1; i <= n; i++) sum += ' + factor.toString() + ' * i;\n  printf("%d\\n", sum);');
    q.tests = integerTests([0, 1, 2, 7, 20], (n: number) => (factor * n * (n + 1) / 2).toString());
    q.hints = ['把累加器初始化为0。', '循环变量从1到n，包含n；n=0时循环一次也不执行。'];
    q.explanation = '每轮只加入当前项，不要把循环变量和总和混为一谈。判分检查输出，不限制使用等价公式。';
  } else if (t.id === 'c-loop-multiples' || t.id === 'c-function-filtered-sum') {
    const sum = t.id === 'c-function-filtered-sum';
    q.prompt = '读入整数 n（0≤n≤100）。在闭区间[1,n]内，' + (sum ? '求所有' : '统计') + divisor.toString() + '的倍数' + (sum ? '之和' : '的个数') + '，输出结果并换行。n=0时结果为0。' + (sum ? '建议把计算封装成函数，再由 main 调用。' : '建议先用循环和余数判断理解过程。');
    const loop = '  int result = 0;\n  for (int i = 1; i <= n; i++) if (i % ' + divisor.toString() + ' == 0) result += ' + (sum ? 'i' : '1') + ';';
    q.solution = sum ? '#include <stdio.h>\nint calculate(int n) {\n' + loop + '\n  return result;\n}\nint main(void) { int n; scanf("%d", &n); printf("%d\\n", calculate(n)); return 0; }\n' : program('  int n;\n  scanf("%d", &n);\n' + loop + '\n  printf("%d\\n", result);');
    q.tests = integerTests([0, divisor - 1, divisor, 2 * divisor + 1, 100], (n: number) => { const k = Math.floor(n / divisor); return (sum ? divisor * k * (k + 1) / 2 : k).toString(); });
    q.hints = ['i % ' + divisor.toString() + ' == 0 表示整除。', sum ? '满足条件时加上i，不是只加1。' : '每找到一个符合条件的数，计数器加1。'];
    q.explanation = '范围从1开始且包含n，空范围结果为0。函数是组织代码的建议，运行判分以输入输出为准。';
  } else if (t.id === 'c-loop-sequence') {
    const step = 1 + Math.floor(seed / 7) % 9;
    q.prompt = '读入整数 n（0≤n≤8）。从 ' + p.toString() + ' 开始，每次增加 ' + step.toString() + '，依次输出前 n 项，每项独占一行。n=0 时不输出内容。';
    q.solution = program('  int n; scanf("%d", &n);\n  for (int i = 0; i < n; i++) printf("%d\\n", ' + p.toString() + ' + i * ' + step.toString() + ');');
    q.tests = [0, 1, 2, 8].map((n: number) => { let output = ''; for (let i = 0; i < n; i++) output += (p + i * step).toString() + '\n'; return test(n.toString(), output); });
    q.hints = ['第0项就是起始值。', '第i项=起始值+i×步长，i从0到n-1。'];
    q.explanation = '循环执行n次，不是n+1次；每个数字后输出换行。';
  } else if (t.id === 'c-array-index') {
    const values = [p, 2 * p + 1, -p, p - 3];
    const declaration = 'int a[4] = {' + values.join(', ') + '};';
    q.prompt = '已知数组 ' + declaration + ' 读入下标 i（0≤i≤3），输出 a[i] 并换行。下标从0开始。';
    q.solution = program('  ' + declaration + '\n  int i; scanf("%d", &i);\n  printf("%d\\n", a[i]);');
    q.tests = integerTests([0, 1, 2, 3], (n: number) => values[n].toString());
    q.hints = ['4个元素的合法下标是0、1、2、3。', '不要把第i个（自然语言编号）与下标i混淆。'];
    q.explanation = '本题输入保证下标合法；真实程序遇到不可信下标还需先验证范围。';
  } else if (t.id === 'c-array-sum-offset' || t.id === 'c-array-count-threshold' || t.id === 'c-array-reverse-offset') {
    const count = t.id === 'c-array-count-threshold';
    const reverse = t.id === 'c-array-reverse-offset';
    const size = count ? 5 : 4;
    q.prompt = '读入 ' + size.toString() + ' 个整数（每个在-100..100，用空白分隔）。' + (count ? '统计其中严格大于 ' + offset.toString() + ' 的元素个数，输出个数并换行。' : reverse ? '按输入的相反顺序输出，每个元素先加上 ' + offset.toString() + '，每个结果独占一行。' : '每个元素分别加上 ' + offset.toString() + '，再求这4个新值的总和，输出总和并换行。');
    const read = '  int a[' + size.toString() + '];\n  for (int i = 0; i < ' + size.toString() + '; i++) scanf("%d", &a[i]);';
    q.solution = program(read + (reverse ? '\n  for (int i = 3; i >= 0; i--) printf("%d\\n", a[i] + (' + offset.toString() + '));' : '\n  int result = 0;\n  for (int i = 0; i < ' + size.toString() + '; i++) ' + (count ? 'if (a[i] > ' + offset.toString() + ') result++;' : 'result += a[i] + (' + offset.toString() + ');') + '\n  printf("%d\\n", result);'));
    const inputs: number[][] = count ? [[0, 0, 0, 0, 0], [-100, 100, offset, offset - 1, offset + 1], [100, 100, 100, 100, 100], [-100, -100, -100, -100, -100]] : [[0, 0, 0, 0], [-100, 100, -1, 1], [2, 2, 2, 2], [4, 3, 2, 1]];
    q.tests = inputs.map((values: number[]) => { const result = count ? values.filter((v: number) => v > offset).length.toString() + '\n' : reverse ? values.slice().reverse().map((v: number) => (v + offset).toString() + '\n').join('') : values.reduce((a: number, b: number) => a + b + offset, 0).toString() + '\n'; return test(values.join(' '), result); });
    q.hints = ['用循环读入数组，scanf 的目标是 &a[i]。', reverse ? '最后一个元素的下标是3，倒序循环从3到0。' : count ? '“严格大于”不包含等于。' : '4个元素各加一次偏移，总偏移就是4倍偏移。'];
    q.explanation = '数组大小固定，测试包括零、负数、重复值及边界；注意下标始终在有效范围内。';
  } else if (t.id === 'c-function-affine' || t.id === 'c-function-distance') {
    const distance = t.id === 'c-function-distance';
    q.prompt = '读入整数 x（-100≤x≤100），' + (distance ? '计算 x 与 ' + offset.toString() + ' 的绝对距离 |x-(' + offset.toString() + ')|。' : '计算 ' + factor.toString() + '×x+(' + offset.toString() + ')。') + '输出结果并换行。建议写一个 int transform(int x) 函数，再由 main 调用。';
    const body = distance ? '  int d = x - (' + offset.toString() + ');\n  if (d < 0) return -d;\n  return d;' : '  return ' + factor.toString() + ' * x + (' + offset.toString() + ');';
    q.solution = '#include <stdio.h>\nint transform(int x) {\n' + body + '\n}\nint main(void) { int x; scanf("%d", &x); printf("%d\\n", transform(x)); return 0; }\n';
    q.starter = '#include <stdio.h>\nint transform(int x) {\n  // 在这里完成计算\n  return 0;\n}\nint main(void) { int x; scanf("%d", &x); printf("%d\\n", transform(x)); return 0; }\n';
    q.tests = integerTests([-100, offset - 1, offset, offset + 1, 100], (x: number) => (distance ? Math.abs(x - offset) : factor * x + offset).toString());
    q.hints = ['函数参数x接收调用时传入的值。', distance ? '先算差，负数取相反数，非负数直接返回。' : '用return返回计算结果，main负责打印。'];
    q.explanation = 'return提供函数的结果。判分检查实际输入输出，函数封装是练习建议，不是假称检查了代码结构。';
  } else if (t.id === 'c-nested-grid') {
    q.prompt = '读入行数 r 和列数 c（均为0..6）。格子编号为1≤i≤r、1≤j≤c。统计满足 (i+j) 能被 ' + divisor.toString() + ' 整除的格子个数，输出个数并换行。任一维为0时结果为0。';
    q.solution = program('  int r, c, count = 0; scanf("%d %d", &r, &c);\n  for (int i = 1; i <= r; i++) {\n    for (int j = 1; j <= c; j++) if ((i + j) % ' + divisor.toString() + ' == 0) count++;\n  }\n  printf("%d\\n", count);');
    const dimensions: number[][] = [[0, 6], [6, 0], [1, 1], [3, 4], [6, 6]];
    q.tests = dimensions.map((dims: number[]) => { let count = 0; for (let i = 1; i <= dims[0]; i++) for (let j = 1; j <= dims[1]; j++) if ((i + j) % divisor === 0) count++; return test(dims.join(' '), count.toString() + '\n'); });
    q.hints = ['外层循环枚举行，内层循环枚举列。', '每个格子最多计数一次；编号从1开始。'];
    q.explanation = '最多检查36个格子，循环有明确上界；不要把行号与列号的乘积误作和。';
  } else if (t.id === 'c-branch-bands') {
    const upper = threshold + 10 + Math.floor(seed / 71) % 7;
    q.prompt = '读入整数 n（-100≤n≤100）。n<' + threshold.toString() + ' 输出 LOW；' + threshold.toString() + '≤n<' + upper.toString() + ' 输出 MID；n≥' + upper.toString() + ' 输出 HIGH。输出单词后换行。';
    q.solution = program('  int n; scanf("%d", &n);\n  if (n < ' + threshold.toString() + ') printf("LOW\\n");\n  else if (n < ' + upper.toString() + ') printf("MID\\n");\n  else printf("HIGH\\n");');
    q.tests = integerTests([-100, threshold - 1, threshold, upper - 1, upper, 100], (n: number) => n < threshold ? 'LOW' : n < upper ? 'MID' : 'HIGH');
    q.hints = ['用if/else if/else让三个区间互不重叠。', '先判断低区间后，第二个分支不必再重复检查下限。'];
    q.explanation = '两条边界都有恰好等于的测试，程序每次只应输出一个单词。';
  } else if (t.id === 'c-digit-sum-offset') {
    q.prompt = '读入非负整数 n（0≤n≤9999）。把它的十进制各位数字相加，再加上 ' + p.toString() + '，输出结果并换行。n=0时各位之和为0。';
    q.solution = program('  int n, sum = 0; scanf("%d", &n);\n  while (n > 0) { sum += n % 10; n = n / 10; }\n  printf("%d\\n", sum + ' + p.toString() + ');');
    q.tests = integerTests([0, 7, 10, 1002, 9999], (n: number) => (n.toString().split('').reduce((a: number, b: string) => a + Number(b), 0) + p).toString());
    q.hints = ['n%10得到末位，n/10的整数商去掉末位。', '每轮都更新n，否则循环不会接近退出条件。'];
    q.explanation = 'n最多4位，循环次数有界；偏移只在最后加一次。';
  } else if (t.id === 'c-output-precedence') {
    const a = p + 1;
    const b = p + 2;
    quiz(q, '下列代码会输出哪个整数？\nint a = ' + a.toString() + ', b = ' + b.toString() + ';\nprintf("%d", a + b * 2);', (a + 2 * b).toString(), [((a + b) * 2).toString(), (a + b).toString(), (a * b + 1).toString()], '乘法优先于加法：先算b×2，再加a。题目没有改变优先级的括号。');
  } else if (t.id === 'c-loop-boundary-trace') {
    const n = p;
    quiz(q, '下列代码输出多少？\nint count = 0;\nfor (int i = 0; i <= ' + n.toString() + '; i++) count++;\nprintf("%d", count);', (n + 1).toString(), [n.toString(), (n + 2).toString(), (2 * n + 3).toString()], '从0到' + n.toString() + '且包含两个端点，共' + (n + 1).toString() + '个整数，所以循环执行这么多次。');
  } else {
    const concepts = t.id === 'stm32-foundations' ? FOUNDATIONS : APPLIED;
    const concept = concepts[seed % concepts.length];
    quiz(q, concept.prompt, concept.correct, concept.wrong, concept.explanation);
    q.hints = ['这是概念题，不要求已经拥有开发板。', '只使用题目给出的条件；真实接线必须查对应型号和板卡文档。'];
  }
  if (q.type === 'code' && q.starter.length === 0) q.starter = program('  // 在这里读取输入并完成题目\n');
  return q;
}

export function getTrainingBank(): TrainingQuestion[] {
  const bank: TrainingQuestion[] = [];
  for (const template of TEMPLATES) for (let seed = 0; seed < TRAINING_BASE_VARIANTS; seed++) bank.push(generate({ templateId: template.id, seed: seed }));
  return bank;
}
