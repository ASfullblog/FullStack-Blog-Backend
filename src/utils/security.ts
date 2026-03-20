/**
 * 安全工具类
 * 提供敏感词过滤和XSS防护功能
 */

// 敏感词列表（可以根据需要扩展）
const SENSITIVE_WORDS = [
  // 政治敏感词示例（实际使用时需要完整的敏感词库）
  '反动', '暴乱', '恐怖主义', '分裂', '独裁',
  // 色情相关
  '色情', '淫秽', '嫖娼', '卖淫', '强奸',
  // 暴力相关
  '杀人', '放火', '爆炸', '枪击', '炸弹',
  // 诈骗相关
  '诈骗', '传销', '洗钱', '赌博', '毒品',
  // 广告垃圾
  '加微信', '加QQ', '联系方式', '点击查看', '免费领'
];

// 敏感词替换符
const REPLACEMENT = '*';

/**
 * 敏感词过滤
 * @param content 原始内容
 * @returns 过滤后的内容
 */
export function filterSensitiveWords(content: string): string {
  if (!content || typeof content !== 'string') {
    return content;
  }

  let filteredContent = content;
  
  SENSITIVE_WORDS.forEach(word => {
    // 使用正则表达式全局替换，忽略大小写
    const regex = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    filteredContent = filteredContent.replace(regex, REPLACEMENT.repeat(word.length));
  });

  return filteredContent;
}

/**
 * 检查是否包含敏感词
 * @param content 原始内容
 * @returns 是否包含敏感词
 */
export function containsSensitiveWords(content: string): boolean {
  if (!content || typeof content !== 'string') {
    return false;
  }

  return SENSITIVE_WORDS.some(word => {
    const regex = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    return regex.test(content);
  });
}

/**
 * 获取内容中的敏感词列表
 * @param content 原始内容
 * @returns 敏感词数组
 */
export function getSensitiveWords(content: string): string[] {
  if (!content || typeof content !== 'string') {
    return [];
  }

  const found: string[] = [];
  SENSITIVE_WORDS.forEach(word => {
    const regex = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    if (regex.test(content) && !found.includes(word)) {
      found.push(word);
    }
  });

  return found;
}

/**
 * XSS防护 - 转义HTML特殊字符
 * @param content 原始内容
 * @returns 转义后的内容
 */
export function escapeHtml(content: string): string {
  if (!content || typeof content !== 'string') {
    return content;
  }

  const htmlEscapes: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;'
  };

  return content.replace(/[&<>"'`=/]/g, (char) => htmlEscapes[char] || char);
}

/**
 * XSS防护 - 清理HTML标签
 * @param content 原始内容
 * @returns 清理后的纯文本
 */
export function stripHtml(content: string): string {
  if (!content || typeof content !== 'string') {
    return content;
  }

  // 移除所有HTML标签
  return content.replace(/<[^>]*>/g, '');
}

/**
 * 完整的评论内容处理
 * 1. 清理HTML标签
 * 2. 转义特殊字符
 * 3. 敏感词过滤
 * @param content 原始内容
 * @returns 处理后的安全内容
 */
export function sanitizeComment(content: string): string {
  if (!content || typeof content !== 'string') {
    return '';
  }

  // 第一步：清理HTML标签
  let safeContent = stripHtml(content);
  
  // 第二步：转义特殊字符
  safeContent = escapeHtml(safeContent);
  
  // 第三步：敏感词过滤
  safeContent = filterSensitiveWords(safeContent);

  return safeContent;
}

/**
 * 验证评论内容
 * @param content 评论内容
 * @returns 验证结果
 */
export function validateComment(content: string): { valid: boolean; message?: string } {
  if (!content || typeof content !== 'string') {
    return { valid: false, message: '评论内容不能为空' };
  }

  const trimmed = content.trim();
  
  if (trimmed.length === 0) {
    return { valid: false, message: '评论内容不能为空' };
  }

  if (trimmed.length > 500) {
    return { valid: false, message: '评论内容不能超过500个字符' };
  }

  // 检查是否包含敏感词
  const sensitiveWords = getSensitiveWords(trimmed);
  if (sensitiveWords.length > 0) {
    return { 
      valid: false, 
      message: `评论包含敏感词：${sensitiveWords.join('、')}，请修改后重试` 
    };
  }

  return { valid: true };
}

/**
 * 检测潜在的XSS攻击
 * @param content 原始内容
 * @returns 是否包含潜在的XSS代码
 */
export function detectXSS(content: string): boolean {
  if (!content || typeof content !== 'string') {
    return false;
  }

  // XSS攻击模式
  const xssPatterns = [
    /<script[^>]*>[\s\S]*?<\/script>/i,
    /<iframe[^>]*>[\s\S]*?<\/iframe>/i,
    /<object[^>]*>[\s\S]*?<\/object>/i,
    /<embed[^>]*>/i,
    /javascript:/i,
    /on\w+\s*=/i,  // onclick, onload等事件处理器
    /<[^>]+\s+on\w+\s*=/i,
    /data:text\/html/i,
    /<svg[^>]*>[\s\S]*?<\/svg>/i,
    /<math[^>]*>[\s\S]*?<\/math>/i,
    /expression\s*\(/i,  // CSS expression
    /url\s*\(\s*['"]*javascript:/i
  ];

  return xssPatterns.some(pattern => pattern.test(content));
}

/**
 * 安全处理 - 用于输出到页面的内容
 * 比sanitizeComment更宽松，保留换行和空格
 * @param content 原始内容
 * @returns 处理后的安全内容
 */
export function safeOutput(content: string): string {
  if (!content || typeof content !== 'string') {
    return '';
  }

  // 转义HTML
  let safe = escapeHtml(content);
  
  // 保留换行符
  safe = safe.replace(/\n/g, '<br>');
  
  return safe;
}
