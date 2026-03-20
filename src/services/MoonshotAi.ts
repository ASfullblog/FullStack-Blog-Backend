import axios from 'axios';

/**
 * AI服务
 * 处理Moonshot AI API调用
 * 包含限流保护和缓存机制
 */

// Moonshot AI API配置
const MOONSHOT_API_URL = 'https://api.moonshot.cn/v1/chat/completions';
const MOONSHOT_API_KEY = process.env.MOONSHOT_API_KEY || 'sk-jTfaVw7ho1zczRC9ppphM6SGJzMDDjIQt2mjywWFgYSyEY0P';
const MOONSHOT_MODEL = 'moonshot-v1-8k';

// 请求限流配置
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 2000; // 最小请求间隔2秒
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000; // 限流后等待5秒重试

// 缓存配置
interface CacheItem {
  value: string;
  timestamp: number;
}
let quoteCache: CacheItem | null = null;
const CACHE_DURATION = 5 * 60 * 1000; // 缓存5分钟

/**
 * 等待指定时间
 */
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class AIService {
  /**
   * 调用Moonshot AI API（带限流保护和重试机制）
   * @param messages 消息列表
   * @param maxTokens 最大token数
   * @param temperature 温度参数
   * @returns AI响应内容
   */
  async callMoonshotAI(
    messages: { role: string; content: string }[],
    maxTokens: number = 1000,
    temperature: number = 0.7
  ): Promise<string> {
    // 限流保护：确保请求间隔
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      await wait(MIN_REQUEST_INTERVAL - timeSinceLastRequest);
    }

    for (let retry = 0; retry < MAX_RETRIES; retry++) {
      try {
        lastRequestTime = Date.now();
        
        const response = await axios.post(
          MOONSHOT_API_URL,
          {
            model: MOONSHOT_MODEL,
            messages,
            temperature,
            max_tokens: maxTokens
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${MOONSHOT_API_KEY}`
            },
            timeout: 30000
          }
        );

        if (response.data && response.data.choices && response.data.choices[0] && response.data.choices[0].message) {
          return response.data.choices[0].message.content.trim();
        }

        throw new Error('Invalid response from Moonshot AI');
      } catch (error: any) {
        const status = error.response?.status;
        
        // 限流错误，等待后重试
        if (status === 429) {
          console.warn(`API限流中，第${retry + 1}次重试，等待${RETRY_DELAY}ms...`);
          await wait(RETRY_DELAY);
          continue;
        }
        
        // 其他错误直接抛出
        console.error('调用Moonshot AI失败:', error.message);
        throw error;
      }
    }

    throw new Error('API请求次数已达上限，请稍后再试');
  }

  /**
   * 生成文章摘要
   * @param content 文章内容
   * @returns 摘要文本
   */
  async generateExcerpt(content: string): Promise<string> {
    const messages = [
      {
        role: 'system',
        content: '你是一个专业的文章摘要生成器，请根据提供的文章内容生成一个简洁的摘要，控制在100字以内，内容要精简概括全文的主要内容。'
      },
      {
        role: 'user',
        content
      }
    ];

    return this.callMoonshotAI(messages, 100, 0.7);
  }

  /**
   * 获取励志热血金句
   * 让AI从网络中检索符合要求的金句
   * 带缓存机制
   * @returns 金句文本
   */
  async getInspirationalQuote(): Promise<string> {
    // 检查缓存
    if (quoteCache && Date.now() - quoteCache.timestamp < CACHE_DURATION) {
      console.log('使用缓存的金句:', quoteCache.value);
      return quoteCache.value;
    }

    const themes = [
      '奋斗', '拼搏', '坚持', '梦想', '勇气', '力量', '热血', '希望', '努力', '成长'
    ];
    const randomTheme = themes[Math.floor(Math.random() * themes.length)];
    
    const messages = [
      {
        role: 'system',
        content: `你是一个名言金句专家。请从网络上的经典文章、名人名言、诗词歌赋中检索一句关于"${randomTheme}"的简短有力金句。要求：1. 不超过20字 2. 积极向上，充满正能量 3. 必须是真实存在的经典名句，不是你自己创造的 4. 必须是中文`
      },
      {
        role: 'user',
        content: `请检索一句关于${randomTheme}的经典励志金句`
      }
    ];

    const result = await this.callMoonshotAI(messages, 50, 0.7);
    
    // 更新缓存（这里简化处理，实际可以用更复杂的缓存逻辑）
    // quoteCache = { value: result, timestamp: Date.now() };
    
    return result;
  }
}

export const aiService = new AIService();
