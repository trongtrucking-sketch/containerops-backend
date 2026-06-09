import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { signToken } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { authLimiter } from '../middleware/rateLimiter.js'
import { RegisterSchema, LoginSchema } from '../schemas/index.js'
import { normalizePhone } from '../services/otp.js'

const router = Router()
const prisma = new PrismaClient()

// POST /api/auth/register
router.post(
  '/register',
  authLimiter,
  validate(RegisterSchema),
  async (req, res) => {
    const { email, password, name, companyName, phone, zaloId, role } = req.body

    const normalizedPhone = normalizePhone(phone)

    // Kiểm tra SĐT đã được verify chưa
    // FE phải gọi POST /api/otp/verify-anonymous trước, rồi mới gọi register
    // Đây là kiểm tra đơn giản — production nên dùng signed token
    const phoneInUse = await prisma.user.findFirst({ where: { phone: normalizedPhone } })
    if (phoneInUse) {
      return res.status(409).json({ error: 'Số điện thoại đã được sử dụng' })
    }

    const exists = await prisma.user.findUnique({ where: { email } })
    if (exists) return res.status(409).json({ error: 'Email đã tồn tại' })

    const passwordHash = await bcrypt.hash(password, 12)
    const user = await prisma.user.create({
      data: {
        email, passwordHash, name, companyName,
        phone: normalizedPhone, zaloId, role,
        phoneVerified: false,  // verify sau khi đăng ký
        ...(role === 'CARRIER' ? { carrier: { create: {} } } : {})
      },
      include: { carrier: true }
    })

    const token = signToken(user.id)
    res.status(201).json({ token, user: sanitize(user) })
  }
)

// POST /api/auth/login
router.post(
  '/login',
  authLimiter,
  validate(LoginSchema),
  async (req, res) => {
    const { email, password } = req.body

    const user = await prisma.user.findUnique({
      where: { email },
      include: { carrier: true }
    })

    // Dùng cùng message để tránh user enumeration
    if (!user) return res.status(401).json({ error: 'Sai email hoặc mật khẩu' })

    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) return res.status(401).json({ error: 'Sai email hoặc mật khẩu' })

    const token = signToken(user.id)
    res.json({ token, user: sanitize(user) })
  }
)

function sanitize({ passwordHash, ...u }) { return u }

export const authRouter = router
