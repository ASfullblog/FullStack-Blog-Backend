/**
 * 邮件服务模块
 * 功能：提供邮件发送功能，支持 SMTP 配置
 */
import nodemailer from 'nodemailer'
import type { Transporter, SendMailOptions } from 'nodemailer'

// 邮件传输器实例
let transporter: Transporter | null = null

/**
 * 获取邮件传输器
 * 功能：初始化并返回 nodemailer 传输器
 * @returns Transporter 邮件传输器
 */
export const getTransporter = (): Transporter => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      },
      tls: {
        rejectUnauthorized: false
      }
    })
  }

  return transporter
}

/**
 * 验证邮件配置
 * 功能：验证 SMTP 配置是否正确
 * @returns 是否验证成功
 */
export const verifyEmailConfig = async (): Promise<boolean> => {
  try {
    const transport = getTransporter()
    await transport.verify()
    console.log('邮件服务配置验证成功')
    return true
  } catch (error) {
    console.error('邮件服务配置验证失败:', error)
    return false
  }
}

/**
 * 发送邮件
 * 功能：发送普通文本邮件
 * @param to 收件人邮箱
 * @param subject 邮件主题
 * @param text 邮件正文（纯文本）
 * @returns 发送结果
 */
export const sendEmail = async (
  to: string,
  subject: string,
  text: string
): Promise<boolean> => {
  try {
    const transport = getTransporter()

    const mailOptions: SendMailOptions = {
      from: `"${process.env.SMTP_FROM_NAME || 'FullStack Blog'}" <${process.env.SMTP_USER}>`,
      to,
      subject,
      text
    }

    const info = await transport.sendMail(mailOptions)
    console.log('邮件发送成功:', info.messageId)
    return true
  } catch (error) {
    console.error('邮件发送失败:', error)
    return false
  }
}

/**
 * 发送 HTML 邮件
 * 功能：发送 HTML 格式的邮件
 * @param to 收件人邮箱
 * @param subject 邮件主题
 * @param html 邮件正文（HTML）
 * @returns 发送结果
 */
export const sendHtmlEmail = async (
  to: string,
  subject: string,
  html: string
): Promise<boolean> => {
  try {
    const transport = getTransporter()

    const mailOptions: SendMailOptions = {
      from: `"${process.env.SMTP_FROM_NAME || 'FullStack Blog'}" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html
    }

    const info = await transport.sendMail(mailOptions)
    console.log('HTML 邮件发送成功:', info.messageId)
    return true
  } catch (error) {
    console.error('HTML 邮件发送失败:', error)
    return false
  }
}

/**
 * 发送验证码邮件
 * 功能：发送包含验证码的邮件
 * @param to 收件人邮箱
 * @param code 验证码
 * @param purpose 验证码用途
 * @returns 发送结果
 */
export const sendVerificationCode = async (
  to: string,
  code: string,
  purpose: 'register' | 'reset-password' | 'bind-email' = 'register'
): Promise<boolean> => {
  const purposeText = {
    register: '注册账号',
    'reset-password': '重置密码',
    'bind-email': '绑定邮箱'
  }

  const subject = `【FullStack Blog】${purposeText[purpose]}验证码`

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #333;">FullStack Blog</h2>
      <p style="font-size: 16px; color: #666;">您好！</p>
      <p style="font-size: 16px; color: #666;">您正在进行<strong>${purposeText[purpose]}</strong>操作，验证码为：</p>
      <div style="background: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px;">
        <span style="font-size: 32px; font-weight: bold; color: #4a90d9; letter-spacing: 8px;">${code}</span>
      </div>
      <p style="font-size: 14px; color: #999;">验证码有效期为 10 分钟，请勿泄露给他人。</p>
      <p style="font-size: 14px; color: #999;">如非本人操作，请忽略此邮件。</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
      <p style="font-size: 12px; color: #ccc;">此邮件由系统自动发送，请勿回复。</p>
    </div>
  `

  return await sendHtmlEmail(to, subject, html)
}

/**
 * 发送评论通知邮件
 * 功能：当文章收到新评论时通知作者
 * @param to 作者邮箱
 * @param articleTitle 文章标题
 * @param commenter 评论者名称
 * @param commentContent 评论内容
 * @param articleUrl 文章链接
 * @returns 发送结果
 */
export const sendCommentNotification = async (
  to: string,
  articleTitle: string,
  commenter: string,
  commentContent: string,
  articleUrl: string
): Promise<boolean> => {
  const subject = `【FullStack Blog】您的文章收到新评论`

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #333;">FullStack Blog</h2>
      <p style="font-size: 16px; color: #666;">您好！</p>
      <p style="font-size: 16px; color: #666;">您的文章 <strong>《${articleTitle}》</strong> 收到了新评论：</p>
      <div style="background: #f9f9f9; padding: 15px; margin: 20px 0; border-left: 4px solid #4a90d9; border-radius: 4px;">
        <p style="margin: 0 0 10px 0; font-weight: bold; color: #333;">${commenter}：</p>
        <p style="margin: 0; color: #666; line-height: 1.6;">${commentContent}</p>
      </div>
      <p style="text-align: center; margin: 30px 0;">
        <a href="${articleUrl}" style="background: #4a90d9; color: white; padding: 12px 30px; text-decoration: none; border-radius: 4px; display: inline-block;">查看评论</a>
      </p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
      <p style="font-size: 12px; color: #ccc;">此邮件由系统自动发送，请勿回复。</p>
    </div>
  `

  return await sendHtmlEmail(to, subject, html)
}

/**
 * 发送欢迎邮件
 * 功能：用户注册成功后发送欢迎邮件
 * @param to 用户邮箱
 * @param username 用户名
 * @returns 发送结果
 */
export const sendWelcomeEmail = async (
  to: string,
  username: string
): Promise<boolean> => {
  const subject = '【FullStack Blog】欢迎加入我们！'

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #333;">FullStack Blog</h2>
      <p style="font-size: 16px; color: #666;">亲爱的 ${username}，您好！</p>
      <p style="font-size: 16px; color: #666;">欢迎加入 FullStack Blog！您的账号已成功创建。</p>
      <p style="font-size: 16px; color: #666;">在这里，您可以：</p>
      <ul style="color: #666; line-height: 1.8;">
        <li>阅读优质的技术文章</li>
        <li>分享您的知识和经验</li>
        <li>与其他开发者交流互动</li>
        <li>体验有趣的小游戏</li>
      </ul>
      <p style="text-align: center; margin: 30px 0;">
        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}" style="background: #4a90d9; color: white; padding: 12px 30px; text-decoration: none; border-radius: 4px; display: inline-block;">开始探索</a>
      </p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
      <p style="font-size: 12px; color: #ccc;">此邮件由系统自动发送，请勿回复。</p>
    </div>
  `

  return await sendHtmlEmail(to, subject, html)
}
