import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticate, requireRole } from '../middleware/auth.js'
import { validate, validateQuery } from '../middleware/validate.js'
import { createOrderLimiter } from '../middleware/rateLimiter.js'
import { CreateOrderSchema, MarketplaceQuerySchema } from '../schemas/index.js'

const router = Router()
const prisma = new PrismaClient()

// ── GET /api/orders/marketplace ───────────────────────────────────────────────
router.get(
  '/marketplace',
  authenticate,
  requireRole('CARRIER'),
  validateQuery(MarketplaceQuerySchema),
  async (req, res) => {
    const {
      fromLocation, toLocation, containerType,
      minWeight, maxWeight, fromDate, toDate,
      page, limit
    } = req.query

    const where = {
      status: 'OPEN',
      NOT: { matches: { some: { carrierId: req.user.carrier.id } } }
    }

    if (fromLocation) where.fromLocation = { contains: fromLocation, mode: 'insensitive' }
    if (toLocation)   where.toLocation   = { contains: toLocation,   mode: 'insensitive' }
    if (containerType) where.containerType = containerType
    if (minWeight || maxWeight) {
      where.weightTon = {}
      if (minWeight) where.weightTon.gte = minWeight
      if (maxWeight) where.weightTon.lte = maxWeight
    }
    if (fromDate || toDate) {
      where.pickupAt = {}
      if (fromDate) where.pickupAt.gte = new Date(fromDate)
      if (toDate)   where.pickupAt.lte = new Date(toDate)
    }

    const [total, orders] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        include: {
          shipper: { select: { name: true, companyName: true } },
          _count:  { select: { matches: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip:  (page - 1) * limit,
        take:  limit
      })
    ])

    // Ẩn contact — chỉ lộ sau khi match confirmed
    const sanitized = orders.map(({ contactPhone, contactZalo, ...o }) => o)
    res.json({ orders: sanitized, total, page, limit })
  }
)

// ── GET /api/orders/mine ──────────────────────────────────────────────────────
router.get('/mine', authenticate, requireRole('SHIPPER'), async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { shipperId: req.user.id },
    include: {
      matches: {
        include: {
          carrier: {
            include: {
              user: { select: { name: true, companyName: true, phone: true } }
            }
          }
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  })
  res.json({ orders })
})

// ── POST /api/orders ──────────────────────────────────────────────────────────
router.post(
  '/',
  authenticate,
  requireRole('SHIPPER'),
  createOrderLimiter,
  validate(CreateOrderSchema),
  async (req, res) => {
    const {
      fromLocation, fromLat, fromLng,
      toLocation, toLat, toLng,
      containerType, weightTon, cargoType, cargoDesc,
      pickupAt, deliverBy, priceOffer,
      contactPhone, contactZalo
    } = req.body

    const order = await prisma.order.create({
      data: {
        shipperId: req.user.id,
        fromLocation, fromLat, fromLng,
        toLocation, toLat, toLng,
        containerType, weightTon,
        cargoType, cargoDesc,
        pickupAt: new Date(pickupAt),
        deliverBy: deliverBy ? new Date(deliverBy) : null,
        priceOffer: priceOffer ?? null,
        contactPhone, contactZalo
      }
    })
    res.status(201).json({ order })
  }
)

// ── GET /api/orders/:id ───────────────────────────────────────────────────────
router.get('/:id', authenticate, async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: {
      shipper: { select: { name: true, companyName: true } },
      matches: {
        where: { status: 'CONFIRMED' },
        select: { carrierId: true }
      }
    }
  })
  if (!order) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' })

  const isShipper = order.shipperId === req.user.id
  const isConfirmedCarrier = order.matches.some(m => m.carrierId === req.user.carrier?.id)

  if (!isShipper && !isConfirmedCarrier) {
    const { contactPhone, contactZalo, ...safe } = order
    return res.json({ order: safe })
  }
  res.json({ order })
})

// ── PATCH /api/orders/:id/cancel ──────────────────────────────────────────────
router.patch('/:id/cancel', authenticate, requireRole('SHIPPER'), async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id }
  })
  if (!order) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' })
  if (order.shipperId !== req.user.id) return res.status(403).json({ error: 'Không có quyền' })
  if (['COMPLETED', 'CANCELLED'].includes(order.status)) {
    return res.status(400).json({ error: 'Đơn hàng không thể huỷ ở trạng thái hiện tại' })
  }

  const updated = await prisma.order.update({
    where: { id: req.params.id },
    data: { status: 'CANCELLED' }
  })
  res.json({ order: updated })
})

export const ordersRouter = router
