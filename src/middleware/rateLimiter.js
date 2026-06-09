import rateLimit from 'express-rate-limit'

// ─── Helper tạo rate limiter ──────────────────────────────────────────────────
function limiter({ windowMs, max, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ error: message })
  })
}

// ─── Các tầng rate limit ──────────────────────────────────────────────────────

// Toàn bộ API: 300 req / 15 phút / IP
export const globalLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: 'Quá nhiều yêu cầu, vui lòng thử lại sau 15 phút'
})

// Auth (login / register): 10 lần / 15 phút / IP — chống brute force
export const authLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Quá nhiều lần đăng nhập thất bại, vui lòng thử lại sau 15 phút'
})

// Gửi OTP: 3 lần / 10 phút / IP — chống spam SMS
export const otpSendLimiter = limiter({
  windowMs: 10 * 60 * 1000,
  max: 3,
  message: 'Đã gửi OTP quá nhiều lần. Vui lòng đợi 10 phút'
})

// Verify OTP: 5 lần / 10 phút / IP — chống brute force mã OTP
export const otpVerifyLimiter = limiter({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: 'Nhập sai OTP quá nhiều lần. Vui lòng yêu cầu mã mới'
})

// Tạo đơn hàng: 30 đơn / giờ / user
export const createOrderLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: 'Bạn đã tạo quá nhiều đơn hàng trong 1 giờ'
})

// Gửi match request: 50 request / giờ / user
export const createMatchLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  max: 50,
  message: 'Bạn đã gửi quá nhiều yêu cầu nhận đơn trong 1 giờ'
})
