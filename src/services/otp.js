/**
 * OTP Service
 * - Production: Twilio Verify (quốc tế) hoặc ESMS (Vietnam, rẻ hơn)
 * - Development: log OTP ra console, không gửi SMS thật
 *
 * Lưu OTP trong memory (Map) với TTL 5 phút.
 * Khi scale lên nhiều server → đổi sang Redis.
 */

import twilio from 'twilio'

const IS_PROD = process.env.NODE_ENV === 'production'
const SMS_PROVIDER = process.env.SMS_PROVIDER || 'console' // 'twilio' | 'esms' | 'console'

// ─── In-memory OTP store  (key: phone, value: { code, expiresAt, attempts }) ──
const otpStore = new Map()
const OTP_TTL_MS    = 5 * 60 * 1000   // 5 phút
const MAX_ATTEMPTS  = 5                 // sai tối đa 5 lần thì xoá

// ─── Twilio client (lazy init) ────────────────────────────────────────────────
let twilioClient = null
function getTwilio() {
  if (!twilioClient) {
    twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    )
  }
  return twilioClient
}

// ─── Generate OTP ─────────────────────────────────────────────────────────────
function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

// ─── Chuẩn hoá số điện thoại VN về +84xxxxxxxxx ──────────────────────────────
export function normalizePhone(phone) {
  const cleaned = phone.replace(/\s|-/g, '')
  if (cleaned.startsWith('+84')) return cleaned
  if (cleaned.startsWith('84'))  return '+' + cleaned
  if (cleaned.startsWith('0'))   return '+84' + cleaned.slice(1)
  return cleaned
}

// ─── Gửi OTP ─────────────────────────────────────────────────────────────────
export async function sendOtp(phone) {
  const normalized = normalizePhone(phone)
  const code = generateCode()
  const expiresAt = Date.now() + OTP_TTL_MS

  // Lưu vào store
  otpStore.set(normalized, { code, expiresAt, attempts: 0 })

  const message = `[ContainerOps] Ma xac minh cua ban la: ${code}. Het han sau 5 phut. Khong chia se ma nay cho bat ky ai.`

  if (!IS_PROD || SMS_PROVIDER === 'console') {
    // Development: chỉ log ra console
    console.log(`\n📱 OTP [DEV] → ${normalized}: ${code}\n`)
    return { success: true, dev: true, code }
  }

  if (SMS_PROVIDER === 'twilio') {
    await getTwilio().messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: normalized
    })
    return { success: true }
  }

  if (SMS_PROVIDER === 'esms') {
    // ESMS.vn — nhà cung cấp SMS phổ biến ở Vietnam, giá ~500đ/SMS
    const res = await fetch('https://rest.esms.vn/MainService.svc/json/SendMultipleMessage_V4_post_json/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ApiKey:    process.env.ESMS_API_KEY,
        SecretKey: process.env.ESMS_SECRET_KEY,
        Phone:     phone,           // ESMS nhận số dạng 0xxxxxxxxx
        Content:   message,
        SmsType:   '2',             // 2 = tin nhắn thường (brandname cần đăng ký)
        IsUnicode: '0'
      })
    })
    const data = await res.json()
    if (data.CodeResult !== '100') {
      throw new Error(`ESMS error: ${data.ErrorMessage}`)
    }
    return { success: true }
  }

  throw new Error(`SMS_PROVIDER không hợp lệ: ${SMS_PROVIDER}`)
}

// ─── Verify OTP ───────────────────────────────────────────────────────────────
export function verifyOtp(phone, code) {
  const normalized = normalizePhone(phone)
  const entry = otpStore.get(normalized)

  if (!entry) {
    return { ok: false, error: 'Mã OTP không tồn tại hoặc đã hết hạn' }
  }

  if (Date.now() > entry.expiresAt) {
    otpStore.delete(normalized)
    return { ok: false, error: 'Mã OTP đã hết hạn, vui lòng yêu cầu mã mới' }
  }

  entry.attempts++
  if (entry.attempts > MAX_ATTEMPTS) {
    otpStore.delete(normalized)
    return { ok: false, error: 'Nhập sai quá nhiều lần, vui lòng yêu cầu mã mới' }
  }

  if (entry.code !== code.trim()) {
    const remaining = MAX_ATTEMPTS - entry.attempts
    return { ok: false, error: `Mã OTP không đúng. Còn ${remaining} lần thử` }
  }

  // Đúng → xoá khỏi store (single-use)
  otpStore.delete(normalized)
  return { ok: true }
}

// ─── Dọn dẹp OTP hết hạn mỗi 10 phút ────────────────────────────────────────
setInterval(() => {
  const now = Date.now()
  for (const [phone, entry] of otpStore.entries()) {
    if (now > entry.expiresAt) otpStore.delete(phone)
  }
}, 10 * 60 * 1000)
