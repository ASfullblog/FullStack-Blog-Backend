import axios from 'axios';
import { aiService } from './MoonshotAi';

/**
 * 语录服务
 * 处理AI API调用和敏感词校验
 */

// 第三方API地址（备用）
const THIRD_PARTY_API = 'https://uapis.cn/api/v1/saying';

// 敏感词列表
const SENSITIVE_WORDS = [
  '反动', '色情', '暴力', '赌博', '毒品', '恐怖',
  '极端', '歧视', '侮辱', '诽谤', '谣言', '诈骗',
  '政治', '政府', '共产党', '法轮功', '台独', '疆独',
  '藏独', '黑客', '攻击', '杀人', '自杀', '死亡'
];

// 默认语录（当API不可用时使用）
const DEFAULT_QUOTES = [
  { id: 1, text: '生活不是等待风暴过去，而是学会在雨中翩翩起舞。', textEn: 'Life is not about waiting for the storm to pass, but learning to dance in the rain.', author: '维维安·格林', authorEn: 'Vivian Greene', category: '生活' },
  { id: 2, text: '未经审视的人生不值得过。', textEn: 'The unexamined life is not worth living.', author: '苏格拉底', authorEn: 'Socrates', category: '哲学' },
  { id: 3, text: '世界上只有一种真正的英雄主义，那就是认清生活的真相后依然热爱生活。', textEn: 'There is only one heroism in the world: to see the world as it is and to love it.', author: '罗曼·罗兰', authorEn: 'Romain Rolland', category: '生活' },
  { id: 4, text: '你若盛开，清风自来。', textEn: 'If you bloom, the breeze will come naturally.', author: '三毛', authorEn: 'Sanmao', category: '成长' },
  { id: 5, text: '星光不问赶路人，时光不负有心人。', textEn: 'The stars do not ask the traveler, time does not fail the dedicated.', author: '大冰', authorEn: 'Da Bing', category: '奋斗' }
];

/**
 * 检查文本是否包含敏感词
 * @param text 要检查的文本
 * @returns 是否包含敏感词
 */
const containsSensitiveWords = (text: string): boolean => {
  if (!text) return false;
  const lowerText = text.toLowerCase();
  return SENSITIVE_WORDS.some(word => lowerText.includes(word.toLowerCase()));
};

/**
 * 从AI API获取一条励志金句
 * @returns 金句文本
 */
const fetchFromAI = async (): Promise<string> => {
  try {
    // 调用Moonshot AI获取励志金句
    const text = await aiService.getInspirationalQuote();
    return text;
  } catch (error) {
    console.error('调用AI API失败:', error);
    throw error;
  }
};

/**
 * 从第三方API获取一条语录（备用方案）
 * @returns 语录文本
 */
const fetchFromThirdParty = async (): Promise<string> => {
  try {
    const response = await axios.get(THIRD_PARTY_API, {
      timeout: 5000,
      headers: {
        'Accept': 'application/json'
      }
    });

    if (response.data && response.data.text) {
      return response.data.text;
    }

    throw new Error('Invalid response from third party API');
  } catch (error) {
    console.error('调用第三方API失败:', error);
    throw error;
  }
};

/**
 * 生成英文翻译（简化版，实际项目中可以使用翻译API）
 * @param text 中文文本
 * @returns 英文文本
 */
const generateEnglishText = (text: string): string => {
  // 这里简化处理，返回空字符串或固定文本
  // 实际项目中可以调用翻译API
  return '';
};

/**
 * 提取文本中的作者信息
 * @param text 金句文本
 * @returns 作者信息对象
 */
const extractAuthorFromText = (text: string): { cn: string, en: string } => {
  // 匹配各种格式的作者信息：——作者、 —— 作者、——《典籍》
  console.log('提取作者信息，文本:', text);
  const authorMatch = text.match(/\s*——\s*([^\n]+)/);
  if (authorMatch && authorMatch[1]) {
    const author = authorMatch[1].trim();
    console.log('匹配到作者:', author);
    // 映射常见作者到英文
    const authorMap: Record<string, string> = {
      '杨澜': 'Yang Lan',
      '马云': 'Jack Ma',
      '雷锋': 'Lei Feng',
      '李嘉诚': 'Li Ka-shing',
      '容国团': 'Rong Guotuan',
      '鲁迅': 'Lu Xun',
      '华罗庚': 'Hua Luogeng',
      '习近平': 'Xi Jinping',
      '陶行知': 'Tao Xingzhi',
      '毛泽东': 'Mao Zedong',
      '李开先': 'Li Kaixian',
      '《左传》': 'Zuo Zhuan',
      '《荀子·劝学》': 'Xunzi·Encouraging Learning',
      '《汉书·枚乘传》': 'Han Shu·Mei Cheng Zhuan',
      '《警世贤文》': 'Jing Shi Xian Wen',
      '《周易》': 'Zhou Yi',
      '《论语》': 'Analects'
    };
    return {
      cn: author,
      en: authorMap[author] || 'Famous Person'
    };
  }
  console.log('未匹配到作者');
  // 未找到作者时使用默认值
  return {
    cn: '佚名',
    en: 'Anonymous'
  };
};

/**
 * 生成作者信息（简化版）
 * @returns 作者信息
 */
const generateAuthor = () => {
  const authors = [
    { cn: '佚名', en: 'Anonymous' },
    { cn: '古人', en: 'Ancient' },
    { cn: '智者', en: 'Wise Man' }
  ];
  return authors[Math.floor(Math.random() * authors.length)];
};

export class QuotesService {
  /**
   * 获取随机语录
   * 带敏感词校验和自动重试
   * @param maxRetries 最大重试次数
   * @returns 语录对象
   */
  async getRandomQuote(maxRetries: number = 3): Promise<any> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        // 优先调用AI API获取励志金句
        const text = await fetchFromAI();

        // 检查是否包含敏感词
        if (!containsSensitiveWords(text)) {
          // 提取作者信息
          const authorInfo = extractAuthorFromText(text);
          return {
            id: Date.now(),
            text: text,
            textEn: generateEnglishText(text),
            author: authorInfo.cn,
            authorEn: authorInfo.en,
            category: '名言'
          };
        }

        console.log(`第 ${i + 1} 次获取到敏感词，重新获取...`);
      } catch (error) {
        console.error(`第 ${i + 1} 次获取失败，尝试备用API:`, error);
        // AI失败时使用备用第三方API
        try {
          const text = await fetchFromThirdParty();
          if (!containsSensitiveWords(text)) {
            const author = generateAuthor();
            return {
              id: Date.now(),
              text: text,
              textEn: generateEnglishText(text),
              author: author.cn,
              authorEn: author.en,
              category: '名言'
            };
          }
        } catch (backupError) {
          console.error('备用API也失败:', backupError);
        }
      }
    }

    // 重试次数用完，返回默认语录
    console.log('使用默认语录');
    const randomIndex = Math.floor(Math.random() * DEFAULT_QUOTES.length);
    return DEFAULT_QUOTES[randomIndex];
  }

  /**
   * 获取多条语录
   * @param limit 数量
   * @returns 语录数组
   */
  async getQuotes(limit: number = 5): Promise<any[]> {
    const quotes = [];
    const promises = [];

    // 并行调用API获取语录，提高响应速度
    for (let i = 0; i < limit; i++) {
      promises.push(this.getRandomQuote(1));
    }

    try {
      const results = await Promise.all(promises);
      quotes.push(...results);
    } catch (error) {
      console.error(`批量获取语录失败:`, error);
    }

    // 如果获取的语录数量不够，使用默认语录补充
    if (quotes.length < limit) {
      const defaultQuotes = [...DEFAULT_QUOTES];
      while (quotes.length < limit && defaultQuotes.length > 0) {
        const randomIndex = Math.floor(Math.random() * defaultQuotes.length);
        const quote = defaultQuotes.splice(randomIndex, 1)[0];
        quotes.push({
          ...quote,
          id: Date.now() + quotes.length
        });
      }
    }

    return quotes;
  }
}

export const quotesService = new QuotesService();
