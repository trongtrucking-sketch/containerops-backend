import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

export async function sendNotification({ userId, type, title, body, refId }) {
  return prisma.notification.create({
    data: { userId, type, title, body, refId }
  })
}
