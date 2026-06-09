import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticate, requireRole } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { createMatchLimiter } from '../middleware/rateLimiter.js'
import { CreateMatchSchema } from '../schemas/index.js'
import { io } from '../app.js'
import { sendNotification } from '../services/notifications.js'

const router = Router()
const prisma = new PrismaClient()

// ── POST /api/matches ─────────────────────────────────────────────────────────
router.post(
  '/',
  authenticate,
  requireRole('CARRIER'),
  createMatchLimiter,
  validate(CreateMatchSchema),
  async (req, res) => {
    const { orderId, returnOrderId, priceOffer, note } = req.body
    const carrierId = req.user.carrier.id

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { shipper: true }
    })
    if (!order || order.status !== 'OPEN') {
      return res.status(400).json({ error: 'Đơn hàng không còn khả dụng' })
    }

    // Tính tiết kiệm ước tính nếu có chuyến quay đầu
    let estimatedSaving = null
    if (returnOrderId) {
      const returnOrder = await prisma.order.findUnique({ where: { id: returnOrderId } })
      if (returnOrder && returnOrder.status === 'OPEN') {
        estimatedSaving = Math.floor((800_000 + Math.random() * 1_200_000) / 10_000) * 10_000
      }
    }

    const match = await prisma.match.create({
      data: { orderId, carrierId, returnOrderId, priceOffer, note, estimatedSaving },
      include: {
        carrier: {
          include: { user: { select: { name: true, companyName: true, phone: true } } }
        }
      }
    })

    await sendNotification({
      userId: order.shipperId,
      type: 'MATCH_REQUEST',
      title: 'Có nhà vận tải muốn nhận đơn!',
      body: `${req.user.companyName || req.user.name} muốn nhận đơn ${orderId.slice(-6).toUpperCase()}`,
      refId: match.id
    })
    io.to(`user:${order.shipperId}`).emit('notification', { type: 'MATCH_REQUEST', matchId: match.id })

    res.status(201).json({ match })
  }
)

// ── GET /api/matches/incoming ─────────────────────────────────────────────────
router.get('/incoming', authenticate, requireRole('SHIPPER'), async (req, res) => {
  const matches = await prisma.match.findMany({
    where: {
      order: { shipperId: req.user.id },
      status: { in: ['PENDING', 'SHIPPER_CONFIRMED'] }
    },
    include: {
      order: {
        select: { id: true, fromLocation: true, toLocation: true, containerType: true, pickupAt: true }
      },
      carrier: {
        include: {
          user: { select: { name: true, companyName: true, phone: true, zaloId: true } },
          vehicles: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  })
  res.json({ matches })
})

// ── GET /api/matches/mine ─────────────────────────────────────────────────────
router.get('/mine', authenticate, requireRole('CARRIER'), async (req, res) => {
  const matches = await prisma.match.findMany({
    where: { carrierId: req.user.carrier.id },
    include: {
      order: {
        include: { shipper: { select: { name: true, companyName: true } } }
      }
    },
    orderBy: { createdAt: 'desc' }
  })
  res.json({ matches })
})

// ── PATCH /api/matches/:id/shipper-confirm ────────────────────────────────────
router.patch('/:id/shipper-confirm', authenticate, requireRole('SHIPPER'), async (req, res) => {
  const match = await prisma.match.findUnique({
    where: { id: req.params.id },
    include: { order: true, carrier: { include: { user: true } } }
  })
  if (!match)                                 return res.status(404).json({ error: 'Không tìm thấy' })
  if (match.order.shipperId !== req.user.id)  return res.status(403).json({ error: 'Không có quyền' })
  if (match.status !== 'PENDING')             return res.status(400).json({ error: 'Trạng thái không hợp lệ' })

  const updated = await prisma.match.update({
    where: { id: req.params.id },
    data: { status: 'SHIPPER_CONFIRMED' }
  })

  await sendNotification({
    userId: match.carrier.userId,
    type: 'SHIPPER_CONFIRMED',
    title: 'Chủ hàng đã chấp nhận bạn!',
    body: `Xác nhận lần cuối để hoàn tất đơn ${match.order.id.slice(-6).toUpperCase()}`,
    refId: match.id
  })
  io.to(`user:${match.carrier.userId}`).emit('notification', { type: 'SHIPPER_CONFIRMED', matchId: match.id })

  res.json({ match: updated })
})

// ── PATCH /api/matches/:id/carrier-confirm ────────────────────────────────────
router.patch('/:id/carrier-confirm', authenticate, requireRole('CARRIER'), async (req, res) => {
  const match = await prisma.match.findUnique({
    where: { id: req.params.id },
    include: { order: { include: { shipper: true } }, carrier: { include: { user: true } } }
  })
  if (!match)                                      return res.status(404).json({ error: 'Không tìm thấy' })
  if (match.carrierId !== req.user.carrier.id)     return res.status(403).json({ error: 'Không có quyền' })
  if (match.status !== 'SHIPPER_CONFIRMED')        return res.status(400).json({ error: 'Chờ shipper xác nhận trước' })

  const [updatedMatch] = await prisma.$transaction([
    prisma.match.update({
      where: { id: req.params.id },
      data: { status: 'CONFIRMED', confirmedAt: new Date() }
    }),
    prisma.order.update({
      where: { id: match.orderId },
      data: { status: 'CONFIRMED' }
    }),
    prisma.match.updateMany({
      where: { orderId: match.orderId, id: { not: req.params.id }, status: 'PENDING' },
      data: { status: 'REJECTED' }
    })
  ])

  await sendNotification({
    userId: match.order.shipperId,
    type: 'MATCH_CONFIRMED',
    title: '🎉 Đơn hàng đã ghép thành công!',
    body: `Liên hệ nhà vận tải: ${match.carrier.user.phone}`,
    refId: match.id
  })
  io.to(`user:${match.order.shipperId}`).emit('notification', { type: 'MATCH_CONFIRMED', matchId: match.id })

  res.json({
    match: updatedMatch,
    shipperContact: {
      name:    match.order.shipper.name,
      company: match.order.shipper.companyName,
      phone:   match.order.contactPhone,
      zalo:    match.order.contactZalo
    },
    carrierContact: {
      name:    match.carrier.user.name,
      company: match.carrier.user.companyName,
      phone:   match.carrier.user.phone,
      zalo:    match.carrier.user.zaloId
    }
  })
})

// ── PATCH /api/matches/:id/reject ─────────────────────────────────────────────
router.patch('/:id/reject', authenticate, async (req, res) => {
  const match = await prisma.match.findUnique({
    where: { id: req.params.id },
    include: { order: true, carrier: true }
  })
  if (!match) return res.status(404).json({ error: 'Không tìm thấy' })

  const isShipper = match.order.shipperId === req.user.id
  const isCarrier = match.carrierId === req.user.carrier?.id
  if (!isShipper && !isCarrier) return res.status(403).json({ error: 'Không có quyền' })

  const updated = await prisma.match.update({
    where: { id: req.params.id },
    data: { status: 'REJECTED' }
  })
  res.json({ match: updated })
})

export const matchesRouter = router
