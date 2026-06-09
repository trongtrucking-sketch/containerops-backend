import { z } from 'zod'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const phoneVN = z
  .string()
  .trim()
  .regex(/^(0|\+84)(3[2-9]|5[6-9]|7[06-9]|8[0-9]|9[0-9])\d{7}$/, {
    message: 'Số điện thoại Việt Nam không hợp lệ (VD: 0901234567)'
  })

const password = z
  .string()
  .min(8, 'Mật khẩu tối thiểu 8 ký tự')
  .regex(/[A-Z]/, 'Phải có ít nhất 1 chữ hoa')
  .regex(/[0-9]/, 'Phải có ít nhất 1 chữ số')

const containerType = z.enum(['TWENTY_FT', 'FORTY_FT', 'FORTY_HC'], {
  errorMap: () => ({ message: 'Loại container không hợp lệ' })
})

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const RegisterSchema = z.object({
  email: z.string().trim().email('Email không hợp lệ').toLowerCase(),
  password,
  name: z.string().trim().min(2, 'Tên tối thiểu 2 ký tự').max(100),
  companyName: z.string().trim().max(150).optional(),
  phone: phoneVN,
  zaloId: z.string().trim().max(50).optional(),
  role: z.enum(['SHIPPER', 'CARRIER'], {
    errorMap: () => ({ message: 'Role phải là SHIPPER hoặc CARRIER' })
  })
})

export const LoginSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(1, 'Vui lòng nhập mật khẩu')
})

// ─── OTP ──────────────────────────────────────────────────────────────────────

export const SendOtpSchema = z.object({
  phone: phoneVN
})

export const VerifyOtpSchema = z.object({
  phone: phoneVN,
  code: z.string().trim().length(6, 'Mã OTP gồm 6 chữ số').regex(/^\d{6}$/, 'Mã OTP chỉ gồm chữ số')
})

// ─── Orders ───────────────────────────────────────────────────────────────────

export const CreateOrderSchema = z.object({
  fromLocation: z.string().trim().min(3, 'Điểm đi tối thiểu 3 ký tự').max(200),
  fromLat: z.number().min(-90).max(90).optional(),
  fromLng: z.number().min(-180).max(180).optional(),
  toLocation: z.string().trim().min(3, 'Điểm đến tối thiểu 3 ký tự').max(200),
  toLat: z.number().min(-90).max(90).optional(),
  toLng: z.number().min(-180).max(180).optional(),
  containerType,
  weightTon: z.number().positive('Trọng tải phải > 0').max(40, 'Trọng tải tối đa 40 tấn'),
  cargoType: z.string().trim().min(2).max(100),
  cargoDesc: z.string().trim().max(500).optional(),
  pickupAt: z.string().datetime({ message: 'Thời gian không hợp lệ (ISO 8601)' }),
  deliverBy: z.string().datetime().optional(),
  priceOffer: z.number().positive().max(100_000_000).optional(),
  contactPhone: phoneVN,
  contactZalo: z.string().trim().max(50).optional()
}).refine(
  data => !data.deliverBy || new Date(data.deliverBy) > new Date(data.pickupAt),
  { message: 'Thời gian giao hàng phải sau thời gian lấy hàng', path: ['deliverBy'] }
)

export const MarketplaceQuerySchema = z.object({
  fromLocation: z.string().trim().max(200).optional(),
  toLocation:   z.string().trim().max(200).optional(),
  containerType: containerType.optional(),
  minWeight: z.coerce.number().positive().optional(),
  maxWeight: z.coerce.number().positive().optional(),
  fromDate: z.string().datetime().optional(),
  toDate:   z.string().datetime().optional(),
  page:  z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20)
}).refine(
  data => !data.minWeight || !data.maxWeight || data.minWeight <= data.maxWeight,
  { message: 'minWeight phải <= maxWeight', path: ['minWeight'] }
)

// ─── Matches ──────────────────────────────────────────────────────────────────

export const CreateMatchSchema = z.object({
  orderId: z.string().cuid('ID đơn hàng không hợp lệ'),
  returnOrderId: z.string().cuid().optional(),
  priceOffer: z.number().positive('Giá đề xuất phải > 0').max(100_000_000).optional(),
  note: z.string().trim().max(500).optional()
})

// ─── Vehicles ─────────────────────────────────────────────────────────────────

export const AddVehicleSchema = z.object({
  plateNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[0-9]{2}[A-Z]{1,2}-[0-9]{4,5}$/, 'Biển số không đúng định dạng (VD: 51C-12345)'),
  containerType,
  maxWeight: z.number().positive().max(40)
})
