import { worker, MessageEvents } from '@kit.ArkTS';
import { LearningC } from '../engine/LearningC';
import { PracticeJob, RunSummary, normalizedOutput } from '../core/Models';

const port = worker.workerPort;
port.onmessage = (event: MessageEvents): void => {
  const job = event.data as PracticeJob;
  const summary: RunSummary = {exerciseId:job.exerciseId,status:'passed',diagnostic:'手机 C 学习解释器 · 基础子集；不是 GCC 或硬件验证。',tests:[]};
  for (let index=0;index<job.tests.length;index++) {
    const test=job.tests[index];
    const result=LearningC.run(job.code,test.input);
    const passed=result.status==='ok' && normalizedOutput(result.output)===normalizedOutput(test.expected);
    summary.tests.push({input:test.input,expected:test.expected,actual:result.output,passed:passed});
    if(result.status!=='ok'){summary.status=result.status;summary.diagnostic=result.diagnostic;break;}
    if(!passed)summary.status='wrong_answer';
  }
  port.postMessage(summary);
};
