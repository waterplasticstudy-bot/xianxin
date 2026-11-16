import { http } from '@kit.NetworkKit';
import { AIModel, RequestSettings, Usage } from '../core/Models';

export interface AIMessage { role: string; content: string; }
interface ProviderEffort { supported_levels: string[]; default_level?: string; }
interface ProviderModel { id: string; name?: string; effort?: ProviderEffort; }
interface ModelResponse { data: ProviderModel[]; }
interface Thinking { type: string; }
interface ChatPayload { model: string; messages: AIMessage[]; stream: boolean; max_tokens: number; thinking?: Thinking; reasoning_effort?: string; }
interface ProviderMessage { content?: string; }
interface Choice { message: ProviderMessage; finish_reason?: string; }
interface ProviderUsage { prompt_tokens?: number; completion_tokens?: number; }
interface ChatResponse { choices: Choice[]; usage?: ProviderUsage; }
export interface AIReply { content: string; warning: string; usage: Usage; }

// Only locally authored, exact messages may cross from service failures into UI.
// Substring checks such as "contains HTTP/API Key" would also admit native
// diagnostics containing Authorization headers or other sensitive content.
export function safeAIErrorMessage(message: string, fallback: string): string {
  const allowed: string[] = [
    '请先在设置中配置手机使用的 DeepSeek API Key。',
    'API Key 无效或已失效，请重新设置。',
    'DeepSeek 余额不足，请到官方账户充值。',
    '请求过于频繁，请稍后重试。',
    'DeepSeek 网络连接未能建立，请检查网络后重试。',
    'DeepSeek 网络请求未完成，请检查网络后重试。',
    'DeepSeek 响应格式异常。'
  ];
  if (typeof message === 'string' && (allowed.includes(message) ||
    /^DeepSeek 请求失败（HTTP [1-5][0-9]{2}），请检查模型或稍后重试。$/.test(message))) return message;
  return fallback;
}

export class DeepSeek {
  private async request(path: string, key: string, body: string = ''): Promise<string> {
    if (!key) throw new Error('请先在设置中配置手机使用的 DeepSeek API Key。');
    let client: http.HttpRequest;
    try { client = http.createHttp(); }
    catch (_) { throw new Error('DeepSeek 网络连接未能建立，请检查网络后重试。'); }
    try {
      let response: http.HttpResponse;
      try {
        response = await client.request('https://api.deepseek.com' + path, {
          method: body ? http.RequestMethod.POST : http.RequestMethod.GET,
          header: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key},
          extraData: body, expectDataType: http.HttpDataType.STRING,
          connectTimeout: 15000, readTimeout: body ? 180000 : 15000,
          maxLimit: 2 * 1024 * 1024, maxRedirects: 0, usingProxy: false
        });
      } catch (_) {
        // Native transport diagnostics may contain headers or request content.
        // Never pass their message, stack, or cause to UI state or logs.
        throw new Error('DeepSeek 网络请求未完成，请检查网络后重试。');
      }
      if (response.responseCode !== 200) {
        const status = response.responseCode;
        if (status === 401) throw new Error('API Key 无效或已失效，请重新设置。');
        if (status === 402) throw new Error('DeepSeek 余额不足，请到官方账户充值。');
        if (status === 429) throw new Error('请求过于频繁，请稍后重试。');
        throw new Error('DeepSeek 请求失败（HTTP ' + status.toString() + '），请检查模型或稍后重试。');
      }
      if (typeof response.result !== 'string') throw new Error('DeepSeek 响应格式异常。');
      return response.result;
    } finally {
      // Cleanup errors must not expose native diagnostics or replace a valid
      // response whose usage still needs to be recorded by the caller.
      try { client.destroy(); } catch (_) {}
    }
  }

  async models(key: string): Promise<AIModel[]> {
    const response = JSON.parse(await this.request('/models', key)) as ModelResponse;
    if (!Array.isArray(response.data)) throw new Error('模型列表格式不正确。');
    const result: AIModel[] = [];
    response.data.forEach((entry: ProviderModel) => {
      if (!entry || typeof entry.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,99}$/.test(entry.id)) return;
      let levels: string[] = [];
      if (entry.effort && Array.isArray(entry.effort.supported_levels)) {
        levels = ['low','high','max'].filter((level: string) => entry.effort!.supported_levels.includes(level));
      } else if (!entry.effort && ['deepseek-flash','deepseek-v4-pro'].includes(entry.id)) levels = ['low','high','max'];
      if (!result.some((item: AIModel) => item.id === entry.id)) result.push({id:entry.id,name:typeof entry.name==='string'?entry.name:entry.id,levels:levels});
    });
    if (!result.length) throw new Error('账户没有返回可用模型。');
    return result;
  }

  async chat(key: string, settings: RequestSettings, messages: AIMessage[]): Promise<AIReply> {
    const payload: ChatPayload = {model:settings.model,messages:messages,stream:false,max_tokens:2048};
    if (settings.thinkingSupported !== false) payload.thinking = {type:settings.thinkingMode};
    if (settings.thinkingMode === 'enabled') {
      payload.reasoning_effort = settings.reasoningEffort;
      payload.max_tokens = settings.reasoningEffort === 'max' ? 16384 : settings.reasoningEffort === 'low' ? 4096 : 8192;
    }
    const raw = await this.request('/chat/completions', key, JSON.stringify(payload));
    let response: ChatResponse;
    try { response = JSON.parse(raw) as ChatResponse; }
    catch (_) { return {content:'',usage:{requests:1,inputTokens:0,outputTokens:0},warning:'DeepSeek 响应格式异常，未取得有效回答；仅记录请求次数，token 用量未知。'}; }
    const usage: Usage = {requests:1,inputTokens:this.tokens(response?.usage?.prompt_tokens),outputTokens:this.tokens(response?.usage?.completion_tokens)};
    // A successful HTTP response can consume tokens even without usable content.
    // Return its meter independently, so callers can persist it before rejecting it.
    if (!response || !Array.isArray(response.choices) || !response.choices.length || !response.choices[0]?.message) return {content:'',usage:usage,warning:'DeepSeek 没有返回有效回答，已保留接口返回的用量。'};
    const choice = response.choices[0];
    const text = typeof choice.message.content === 'string' ? choice.message.content : '';
    if (!text.trim()) return {content:'',usage:usage,warning:choice.finish_reason==='length'?'思考达到输出上限，尚未生成最终回答。请降低强度或拆小问题。':'DeepSeek 返回了空回答，请重试。'};
    return {content:text.slice(0,24000),usage:usage,warning:choice.finish_reason==='length'||text.length>24000?'回答达到输出上限，可拆小问题或降低思考强度。':''};
  }
  private tokens(count: number | undefined): number { return typeof count==='number' && Number.isInteger(count) && count>=0 && count<=1e9 ? count : 0; }
}
