export function errorHandler(err, req, res, next) {
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}`, err)

  // Prisma errors
  if (err.code === 'P2002') {
    const field = err.meta?.target?.join(', ') || 'dữ liệu'
    return res.status(409).json({ error: `${field} đã tồn tại` })
  }
  if (err.code === 'P2025') {
    return res.status(404).json({ error: 'Không tìm thấy dữ liệu' })
  }
  if (err.code === 'P2003') {
    return res.status(400).json({ error: 'Dữ liệu liên kết không hợp lệ' })
  }

  // JWT errors (nếu chưa xử lý ở middleware auth)
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'Token không hợp lệ' })
  }
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại' })
  }

  // JSON parse error
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body không phải JSON hợp lệ' })
  }

  res.status(500).json({ error: 'Lỗi server, vui lòng thử lại sau' })
}
