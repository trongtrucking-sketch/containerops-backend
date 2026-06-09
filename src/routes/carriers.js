import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticate, requireRole } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { AddVehicleSchema } from '../schemas/index.js'

const router = Router()
const prisma = new PrismaClient()

// GET /api/carriers/profile
router.get('/profile', authenticate, requireRole('CARRIER'), async (req, res) => {
  const carrier = await prisma.carrier.findUnique({
    where: { userId: req.user.id },
    include: {
      vehicles: true,
      user: { select: { name: true, companyName: true, phone: true, phoneVerified: true, zaloId: true, email: true } }
    }
  })
  res.json({ carrier })
})

// PATCH /api/carriers/profile — cập nhật thông tin công ty
router.patch('/profile', authenticate, requireRole('CARRIER'), async (req, res) => {
  const { name, companyName, zaloId } = req.body
  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: {
      ...(name        ? { name }        : {}),
      ...(companyName ? { companyName } : {}),
      ...(zaloId      ? { zaloId }      : {})
    },
    select: { name: true, companyName: true, zaloId: true, phone: true, phoneVerified: true }
  })
  res.json({ user })
})

// POST /api/carriers/vehicles — thêm xe
router.post(
  '/vehicles',
  authenticate,
  requireRole('CARRIER'),
  validate(AddVehicleSchema),
  async (req, res) => {
    const { plateNumber, containerType, maxWeight } = req.body

    // Kiểm tra biển số trùng
    const exists = await prisma.vehicle.findUnique({ where: { plateNumber } })
    if (exists) return res.status(409).json({ error: 'Biển số xe đã tồn tại trong hệ thống' })

    const vehicle = await prisma.vehicle.create({
      data: { carrierId: req.user.carrier.id, plateNumber, containerType, maxWeight }
    })
    res.status(201).json({ vehicle })
  }
)

// PATCH /api/carriers/vehicles/:id — cập nhật trạng thái xe
router.patch('/vehicles/:id', authenticate, requireRole('CARRIER'), async (req, res) => {
  const { available } = req.body
  if (typeof available !== 'boolean') {
    return res.status(422).json({ error: 'available phải là boolean' })
  }
  const vehicle = await prisma.vehicle.findUnique({ where: { id: req.params.id } })
  if (!vehicle) return res.status(404).json({ error: 'Không tìm thấy xe' })
  if (vehicle.carrierId !== req.user.carrier.id) return res.status(403).json({ error: 'Không có quyền' })

  const updated = await prisma.vehicle.update({
    where: { id: req.params.id },
    data: { available }
  })
  res.json({ vehicle: updated })
})

// DELETE /api/carriers/vehicles/:id — xoá xe
router.delete('/vehicles/:id', authenticate, requireRole('CARRIER'), async (req, res) => {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: req.params.id } })
  if (!vehicle) return res.status(404).json({ error: 'Không tìm thấy xe' })
  if (vehicle.carrierId !== req.user.carrier.id) return res.status(403).json({ error: 'Không có quyền' })

  await prisma.vehicle.delete({ where: { id: req.params.id } })
  res.json({ ok: true })
})

export const carriersRouter = router
