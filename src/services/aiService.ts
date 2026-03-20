import axios from 'axios';

/**
 * DeepSeek AI服务
 * 处理DeepSeek AI API调用
 * 包含限流保护和缓存机制
 */

// DeepSeek AI API配置
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'sk-1ae080428f934f1ba5dd8a8bea6c2991';
const DEEPSEEK_MODEL = 'deepseek-chat'; // DeepSeek的对话模型，响应快速且准确

// 请求限流配置
let previousRequestTimestamp = 0;
const REQUEST_INTERVAL_MINIMUM = 2000; // 最小请求间隔2秒
const MAXIMUM_RETRIES = 3;
const RETRY_WAIT_DURATION = 5000; // 限流后等待5秒重试

// 缓存配置
interface CachedItem {
  data: string;
  cachedAt: number;
}
let proverbCache: CachedItem | null = null;
const CACHE_EXPIRY_DURATION = 5 * 60 * 1000; // 缓存5分钟

/**
 * 暂停执行指定时间
 */
const delay = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

export class DeepSeekService {
  /**
   * 调用DeepSeek AI API（带限流保护和重试机制）
   * @param conversation 消息列表
   * @param maxResponseTokens 最大token数
   * @param randomness 温度参数
   * @returns AI响应内容
   */
  async callDeepSeekAPI(
    conversation: { role: string; content: string }[],
    maxResponseTokens: number = 1000,
    randomness: number = 0.7
  ): Promise<string> {
    // 限流保护：确保请求间隔
    const currentTime = Date.now();
    const elapsedSinceLastRequest = currentTime - previousRequestTimestamp;
    if (elapsedSinceLastRequest < REQUEST_INTERVAL_MINIMUM) {
      await delay(REQUEST_INTERVAL_MINIMUM - elapsedSinceLastRequest);
    }

    for (let attempt = 0; attempt < MAXIMUM_RETRIES; attempt++) {
      try {
        previousRequestTimestamp = Date.now();
        
        const apiResponse = await axios.post(
          DEEPSEEK_API_URL,
          {
            model: DEEPSEEK_MODEL,
            messages: conversation,
            temperature: randomness,
            max_tokens: maxResponseTokens
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
            },
            timeout: 30000
          }
        );

        if (apiResponse.data && 
            apiResponse.data.choices && 
            apiResponse.data.choices[0] && 
            apiResponse.data.choices[0].message) {
          return apiResponse.data.choices[0].message.content.trim();
        }

        throw new Error('Invalid response from DeepSeek AI');
      } catch (error: any) {
        const httpStatus = error.response?.status;
        
        // 限流错误，等待后重试
        if (httpStatus === 429) {
          console.warn(`DeepSeek API限流中，第${attempt + 1}次重试，等待${RETRY_WAIT_DURATION}ms...`);
          await delay(RETRY_WAIT_DURATION);
          continue;
        }
        
        // 其他错误直接抛出
        console.error('调用DeepSeek AI失败:', error.message);
        throw error;
      }
    }

    throw new Error('DeepSeek API请求次数已达上限，请稍后再试');
  }

  /**
   * 生成文章摘要
   * @param articleContent 文章内容
   * @returns 摘要文本
   */
  async createSummary(articleContent: string): Promise<string> {
    const conversation = [
      {
        role: 'system',
        content: '你是一个专业的文章摘要生成器，请根据提供的文章内容生成一个简洁的摘要，控制在100字以内，内容要精简概括全文的主要内容。'
      },
      {
        role: 'user',
        content: articleContent
      }
    ];

    return this.callDeepSeekAPI(conversation, 100, 0.7);
  }

  /**
   * 获取励志热血金句
   * 让AI从网络中检索符合要求的金句
   * 带缓存机制
   * @returns 金句文本
   */
  async fetchMotivationalProverb(): Promise<string> {
    // 检查缓存
    if (proverbCache && Date.now() - proverbCache.cachedAt < CACHE_EXPIRY_DURATION) {
      console.log('使用缓存的励志金句:', proverbCache.data);
      return proverbCache.data;
    }

    const topicCategories = [
      '奋斗', '拼搏', '坚持', '梦想', '勇气', '力量', '热血', '希望', '努力', '成长'
    ];
    const selectedTopic = topicCategories[Math.floor(Math.random() * topicCategories.length)];
    
    const conversation = [
      {
        role: 'system',
        content: `你是一个名言金句专家。请从网络上的经典文章、名人名言、诗词歌赋中检索5句关于"${selectedTopic}"的简短有力金句。要求：1. 每句不超过20字 2. 积极向上，充满正能量 3. 必须是真实存在的经典名句，不是你自己创造的 4. 必须是中文 5. 格式必须为：金句内容——作者名字 6. 每条金句单独一行 7. 只返回金句和作者，绝对不要添加任何解释或多余内容 8. 不要包含任何引言或开场白 9. 直接返回5条金句，每条一行`
      },
      {
        role: 'user',
        content: `请严格按照格式返回5句关于${selectedTopic}的经典励志金句，每条单独一行，格式为：金句——作者。只返回金句，不要添加任何解释。`
      }
    ];

    const result = await this.callDeepSeekAPI(conversation, 50, 0.7);
    
    // 更新缓存
    proverbCache = { data: result, cachedAt: Date.now() };
    
    return result;
  }
}

export const deepSeekService = new DeepSeekService();