import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { sendOtp, verifyOtp, normalizePhone } from '../services/otp.js'
import { authenticate } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { otpSendLimiter, otpVerifyLimiter } from '../middleware/rateLimiter.js'
import { SendOtpSchema, VerifyOtpSchema } from '../schemas/index.js'

const router = Router()
const prisma = new PrismaClient()

// ── POST /api/otp/send ────────────────────────────────────────────────────────
// Gửi OTP đến số điện thoại (user đã login hoặc chưa)
router.post(
  '/send',
  otpSendLimiter,
  validate(SendOtpSchema),
  async (req, res) => {
    const { phone } = req.body

    try {
      const result = await sendOtp(phone)
      // Dev: trả về code để test dễ, production không trả
      res.json({
        message: `Đã gửi mã OTP đến ${phone}`,
        ...(result.dev ? { _devCode: result.code } : {})
      })
    } catch (err) {
      console.error('OTP send error:', err)
      res.status(500).json({ error: 'Không thể gửi SMS, vui lòng thử lại' })
    }
  }
)

// ── POST /api/otp/verify ──────────────────────────────────────────────────────
// Xác minh OTP → đánh dấu số điện thoại đã verified trong DB
router.post(
  '/verify',
  otpVerifyLimiter,
  authenticate,              // phải đăng nhập mới verify được
  validate(VerifyOtpSchema),
  async (req, res) => {
    const { phone, code } = req.body

    const result = verifyOtp(phone, code)
    if (!result.ok) {
      return res.status(400).json({ error: result.error })
    }

    // Lưu phone đã xác minh vào user
    const normalized = normalizePhone(phone)
    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        phone: normalized,
        phoneVerified: true   // cần thêm field này vào schema (xem migration bên dưới)
      }
    })

    res.json({ message: 'Xác minh số điện thoại thành công!' })
  }
)

// ── POST /api/otp/verify-anonymous ───────────────────────────────────────────
// Dùng khi verify SĐT trước khi đăng ký (chưa có tài khoản)
// Trả về một "phone token" tạm thời để dùng trong bước register
router.post(
  '/verify-anonymous',
  otpVerifyLimiter,
  validate(VerifyOtpSchema),
  (req, res) => {
    const { phone, code } = req.body
    const result = verifyOtp(phone, code)
    if (!result.ok) {
      return res.status(400).json({ error: result.error })
    }
    // Lưu phone đã verified vào session tạm (đơn giản: trả về phone để FE dùng)
    // Production: có thể sign JWT ngắn hạn để chắc chắn hơn
    res.json({
      message: 'Số điện thoại hợp lệ',
      verifiedPhone: normalizePhone(phone)
    })
  }
)

export const otpRouter = router
