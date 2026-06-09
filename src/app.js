import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { json } from 'express'
import { authRouter } from './routes/auth.js'
import { ordersRouter } from './routes/orders.js'
import { matchesRouter } from './routes/matches.js'
import { carriersRouter } from './routes/carriers.js'
import { notificationsRouter } from './routes/notifications.js'
import { otpRouter } from './routes/otp.js'
import { errorHandler } from './middleware/errorHandler.js'
import { globalLimiter } from './middleware/rateLimiter.js'
import { createServer } from 'http'
import { Server } from 'socket.io'

export const app = express()
export const httpServer = createServer(app)

// Socket.io cho realtime notifications
export const io = new Server(httpServer, {
  cors: { origin: process.env.FRONTEND_URL || 'http://localhost:5173' }
})

app.use(helmet())
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }))
app.use(json({ limit: '1mb' }))
app.use(globalLimiter)   // áp dụng cho toàn bộ API

// Routes
app.use('/api/auth',          authRouter)
app.use('/api/otp',           otpRouter)
app.use('/api/orders',        ordersRouter)
app.use('/api/matches',       matchesRouter)
app.use('/api/carriers',      carriersRouter)
app.use('/api/notifications', notificationsRouter)

app.get('/api/health', (_, res) => res.json({ ok: true }))

// Realtime: user join room theo userId
io.on('connection', (socket) => {
  socket.on('join', (userId) => socket.join(`user:${userId}`))
  socket.on('disconnect', () => {})
})

app.use(errorHandler)

const PORT = process.env.PORT || 3001
httpServer.listen(PORT, () => console.log(`Server running on :${PORT}`))
