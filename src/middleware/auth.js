import jwt from 'jsonwebtoken'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production'

export function signToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '30d' })
}

export async function authenticate(req, res, next) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Chưa đăng nhập' })
  }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET)
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: { carrier: { include: { vehicles: true } } }
    })
    if (!user) return res.status(401).json({ error: 'Tài khoản không tồn tại' })
    req.user = user
    next()
  } catch {
    return res.status(401).json({ error: 'Token không hợp lệ' })
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Không có quyền truy cập' })
    }
    next()
  }
}
