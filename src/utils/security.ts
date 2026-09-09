const SENSITIVE_WORDS = [
  '反动',
  '暴乱',
  '恐怖主义',
  '分裂',
  '独裁',
  '色情',
  '淫秽',
  '嫖娼',
  '卖淫',
  '强奸',
  '杀人',
  '放火',
  '爆炸',
  '枪击',
  '炸弹',
  '诈骗',
  '传销',
  '洗钱',
  '赌博',
  '毒品',
  '加微信',
  '加我QQ',
  '联系方式',
  '点击查看',
  '免费领取'
]

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const filterSensitiveWords = (content: string): string => {
  let filteredContent = content

  for (const word of SENSITIVE_WORDS) {
    const regex = new RegExp(escapeRegExp(word), 'gi')
    filteredContent = filteredContent.replace(regex, '*'.repeat(word.length))
  }

  return filteredContent
}

const getSensitiveWords = (content: string): string[] =>
  SENSITIVE_WORDS.filter((word) =>
    new RegExp(escapeRegExp(word), 'i').test(content)
  )

const escapeHtml = (content: string): string => {
  const htmlEscapes: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;'
  }

  return content.replace(/[&<>"'`=/]/g, (char) => htmlEscapes[char] || char)
}

const stripHtml = (content: string): string => content.replace(/<[^>]*>/g, '')

export const sanitizeComment = (content: string): string => {
  if (!content || typeof content !== 'string') {
    return ''
  }

  return filterSensitiveWords(escapeHtml(stripHtml(content)))
}

export const validateComment = (
  content: string
): { valid: boolean; message?: string } => {
  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return { valid: false, message: '评论内容不能为空' }
  }

  const trimmed = content.trim()
  if (trimmed.length > 500) {
    return { valid: false, message: '评论内容不能超过500个字符' }
  }

  const sensitiveWords = getSensitiveWords(trimmed)
  if (sensitiveWords.length > 0) {
    return {
      valid: false,
      message: `评论包含敏感词：${sensitiveWords.join('、')}，请修改后重试`
    }
  }

  return { valid: true }
}
