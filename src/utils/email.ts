import nodemailer from 'nodemailer'
import type { SendMailOptions, Transporter } from 'nodemailer'

let transporter: Transporter | null = null

const getTransporter = (): Transporter => {
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

export const sendHtmlEmail = async (
  to: string,
  subject: string,
  html: string
): Promise<boolean> => {
  try {
    const mailOptions: SendMailOptions = {
      from: `"${process.env.SMTP_FROM_NAME || 'FullStack Blog'}" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html
    }

    const info = await getTransporter().sendMail(mailOptions)
    console.log('HTML email sent:', info.messageId)
    return true
  } catch (error) {
    console.error('Failed to send HTML email:', error)
    return false
  }
}
