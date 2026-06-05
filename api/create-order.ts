import type { VercelRequest, VercelResponse } from '@vercel/node'
import Razorpay from 'razorpay'

// Initialize Razorpay client with environment variables
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID || '',
  key_secret: process.env.RAZORPAY_KEY_SECRET || '',
})

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  )

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { planType, userId } = req.body

  if (!planType || !userId) {
    return res.status(400).json({ error: 'planType and userId are required' })
  }

  // Determine amount in paise (1 INR = 100 paise)
  let amount = 0
  if (planType === 'monthly') {
    amount = 31 * 100
  } else if (planType === 'annual') {
    amount = 365 * 100
  } else {
    return res.status(400).json({ error: 'Invalid planType. Must be monthly or annual.' })
  }

  try {
    const options = {
      amount,
      currency: 'INR',
      receipt: `receipt_${userId.slice(0, 8)}_${Date.now()}`,
      notes: {
        userId,
        planType,
      },
    }

    const order = await razorpay.orders.create(options)
    
    return res.status(200).json({
      id: order.id,
      amount: order.amount,
      currency: order.currency,
    })
  } catch (error: any) {
    console.error('Error creating Razorpay order:', error)
    return res.status(500).json({ error: error.message || 'Failed to create Razorpay order' })
  }
}
