const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

// ============================================================
// 🔥 CORS - Allow all origins
// ============================================================
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// ============================================================
// 📁 ORDERS FILE
// ============================================================
const ORDERS_FILE = path.join(__dirname, 'orders.json');

function loadOrders() {
    try {
        if (fs.existsSync(ORDERS_FILE)) {
            const data = fs.readFileSync(ORDERS_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Error loading orders:', error);
    }
    return [];
}

function saveOrders(orders) {
    try {
        fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving orders:', error);
        return false;
    }
}

// ============================================================
// 🏠 ROOT ENDPOINT
// ============================================================
app.get('/', (req, res) => {
    res.json({
        name: 'UT Halal Gyro Backend',
        status: 'running',
        version: '1.0.0',
        endpoints: {
            root: '/',
            health: '/api/health',
            payment: '/api/initiate-payment',
            orders: '/api/orders?password=admin123',
            webhook: '/api/webhook'
        }
    });
});

// ============================================================
// ❤️ HEALTH CHECK - FIXED
// ============================================================
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        message: '✅ UT Halal Gyro Backend is running!'
    });
});

// ============================================================
// 💳 PAYMENT ENDPOINT
// ============================================================
app.post('/api/initiate-payment', async (req, res) => {
    try {
        console.log('📥 Payment request received:', req.body);

        const { method, total, items, customerName, customerEmail, customerPhone } = req.body;

        // Validation
        if (!method) {
            return res.status(400).json({ 
                success: false, 
                error: 'Payment method is required' 
            });
        }

        if (!total || total <= 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid total amount' 
            });
        }

        if (!items || items.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Cart is empty' 
            });
        }

        // Generate transaction ID
        const transactionId = `TX${Date.now().toString().slice(-8)}${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

        // Create order
        const order = {
            transactionId,
            method,
            total,
            items,
            customerName: customerName || 'Guest',
            customerEmail: customerEmail || 'guest@example.com',
            customerPhone: customerPhone || 'Not provided',
            timestamp: new Date().toISOString(),
            status: 'pending'
        };

        // Save order
        let orders = loadOrders();
        orders.push(order);
        saveOrders(orders);

        console.log(`✅ Order saved: ${transactionId} | ${method} | $${total}`);

        // Payment URLs
        const paymentUrls = {
            moonpay: process.env.MOONPAY_ENV === 'sandbox' ? 'https://sandbox.moonpay.com' : 'https://api.moonpay.com',
            transak: process.env.TRANSAK_ENV === 'sandbox' ? 'https://sandbox-api.transak.com' : 'https://api.transak.com',
            alchemypay: process.env.ALCHEMYPAY_ENV === 'sandbox' ? 'https://sandbox.alchemypay.com' : 'https://api.alchemypay.com',
            banxa: process.env.BANXA_ENV === 'sandbox' ? 'https://sandbox.banxa.com' : 'https://api.banxa.com',
            mercuryo: process.env.MERCURYO_ENV === 'sandbox' ? 'https://sandbox.mercuryo.io' : 'https://api.mercuryo.io',
            wert: process.env.WERT_ENV === 'sandbox' ? 'https://sandbox.wert.io' : 'https://api.wert.io',
            ramp: process.env.RAMP_ENV === 'sandbox' ? 'https://sandbox.ramp.com' : 'https://api.ramp.com',
            card: 'https://api.stripe.com'
        };

        const apiKeys = {
            moonpay: process.env.MOONPAY_API_KEY || 'pk_test_moonpay',
            transak: process.env.TRANSAK_API_KEY || 'pk_test_transak',
            alchemypay: process.env.ALCHEMYPAY_API_KEY || 'pk_test_alchemypay',
            banxa: process.env.BANXA_API_KEY || 'pk_test_banxa',
            mercuryo: process.env.MERCURYO_API_KEY || 'pk_test_mercuryo',
            wert: process.env.WERT_API_KEY || 'pk_test_wert',
            ramp: process.env.RAMP_API_KEY || 'pk_test_ramp',
            card: process.env.STRIPE_SECRET_KEY || 'sk_test_stripe'
        };

        const baseUrl = paymentUrls[method];
        const apiKey = apiKeys[method];

        if (!baseUrl) {
            return res.status(400).json({ 
                success: false, 
                error: `Unsupported payment method: ${method}` 
            });
        }

        // Return success response
        res.json({
            success: true,
            transactionId: transactionId,
            paymentMethod: method,
            paymentUrl: `${baseUrl}/v1/payments?apiKey=${apiKey}&amount=${total}&currency=USD&orderId=${transactionId}`,
            order: { 
                total, 
                items, 
                customerName: customerName || 'Guest' 
            }
        });

    } catch (error) {
        console.error('❌ Payment error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message || 'Internal server error' 
        });
    }
});

// ============================================================
// 📊 ADMIN - GET ALL ORDERS
// ============================================================
app.get('/api/orders', (req, res) => {
    const password = req.query.password;
    
    if (password !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    const orders = loadOrders();
    const totalRevenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
    const methodCounts = {};
    orders.forEach(o => { methodCounts[o.method] = (methodCounts[o.method] || 0) + 1; });

    res.json({
        success: true,
        stats: {
            totalOrders: orders.length,
            totalRevenue,
            methodCounts
        },
        orders: orders.reverse()
    });
});

// ============================================================
// 🔄 WEBHOOK
// ============================================================
app.post('/api/webhook', express.raw({ type: 'application/json' }), (req, res) => {
    try {
        const data = JSON.parse(req.body.toString());
        console.log('[Webhook] Received:', data);
        res.json({ success: true });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// 🚀 START SERVER
// ============================================================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔═══════════════════════════════════════════════╗
║   🚀 UT Halal Gyro Server Started!            ║
╠═══════════════════════════════════════════════╣
║   📡 Port: ${PORT}                                ║
║   🔗 URL: https://ut-halal-gyro.onrender.com   ║
║   ❤️ Health: /api/health                       ║
║   💳 Payment: /api/initiate-payment            ║
║   📊 Admin: /api/orders?password=admin123     ║
╚═══════════════════════════════════════════════╝
    `);
});
