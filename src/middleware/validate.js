import { ZodError } from 'zod'

/**
 * Middleware factory: validate req.body với Zod schema
 * Dùng: router.post('/path', validate(MySchema), handler)
 */
export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      const errors = result.error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message
      }))
      return res.status(422).json({ error: 'Dữ liệu không hợp lệ', errors })
    }
    req.body = result.data  // dùng data đã được parse + coerce
    next()
  }
}

/**
 * Middleware factory: validate req.query với Zod schema
 */
export function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query)
    if (!result.success) {
      const errors = result.error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message
      }))
      return res.status(422).json({ error: 'Query không hợp lệ', errors })
    }
    req.query = result.data
    next()
  }
}
