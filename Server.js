const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ============================================================
// 📁 ORDERS FILE (JSON Database)
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
// 📧 EMAIL SETUP
// ============================================================
let transporter = null;
if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });
    console.log('✅ Email notifications ENABLED');
}

// ============================================================
// 📧 SEND EMAIL
// ============================================================
async function sendOrderEmail(order) {
    if (!transporter) return false;

    const { transactionId, method, total, items, customerName, customerEmail, customerPhone, timestamp, status } = order;

    const methodIcons = {
        moonpay: '🌙', transak: '🔄', alchemypay: '⚗️', banxa: '🏦',
        mercuryo: '⚡', wert: '🪙', ramp: '🚀', card: '💳'
    };
    const icon = methodIcons[method] || '💳';

    const itemsText = items.map(i => `${i.name} x ${i.qty} = $${(i.price * i.qty).toFixed(2)}`).join('\n');

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: process.env.NOTIFICATION_EMAIL || process.env.EMAIL_USER,
        subject: `🆕 New Order! ${transactionId}`,
        text: `
╔═══════════════════════════════════════════════╗
║          🆕 NEW ORDER RECEIVED               ║
╚═══════════════════════════════════════════════╝

🔑 Transaction: ${transactionId}
${icon} Method: ${method.toUpperCase()}
💰 Total: $${total.toFixed(2)}
📊 Status: ${status || 'PENDING'}

👤 Customer: ${customerName || 'Guest'}
📧 Email: ${customerEmail || 'Not provided'}
📞 Phone: ${customerPhone || 'Not provided'}

📦 Items:
${itemsText}

📍 UT Halal Gyro · 17731 Kessler Dr, Pflugerville, TX
📞 +1 804-410-4022
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`📧 Email sent: ${transactionId}`);
        return true;
    } catch (error) {
        console.error('Email error:', error);
        return false;
    }
}

// ============================================================
// 💳 PAYMENT ENDPOINT
// ============================================================
app.post('/api/initiate-payment', async (req, res) => {
    try {
        const { method, total, items, customerName, customerEmail, customerPhone } = req.body;

        if (!method || !total || !items || items.length === 0) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        const transactionId = `TX${Date.now().toString().slice(-8)}${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

        const order = {
            transactionId,
            method,
            total,
            items,
            customerName: customerName || 'Guest',
            customerEmail: customerEmail || 'guest@example.com',
            customerPhone: customerPhone || 'Not provided',
            timestamp: new Date().toISOString(),
            status: 'pending',
            paymentDetails: null,
            webhookReceived: false
        };

        let orders = loadOrders();
        orders.push(order);
        saveOrders(orders);

        console.log(`✅ Order saved: ${transactionId} | ${method} | $${total} | ${customerName || 'Guest'}`);

        await sendOrderEmail(order);

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
            return res.status(400).json({ success: false, error: 'Unsupported payment method' });
        }

        res.json({
            success: true,
            transactionId: transactionId,
            paymentMethod: method,
            paymentUrl: `${baseUrl}/v1/payments?apiKey=${apiKey}&amount=${total}&currency=USD&orderId=${transactionId}`,
            order: { total, items, customerName: customerName || 'Guest' }
        });

    } catch (error) {
        console.error('❌ Payment error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 📊 GET ALL ORDERS (Admin)
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
    const statusCounts = {};
    orders.forEach(o => { statusCounts[o.status] = (statusCounts[o.status] || 0) + 1; });

    res.json({
        success: true,
        stats: {
            totalOrders: orders.length,
            totalRevenue,
            methodCounts,
            statusCounts
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

        const transactionId = data.transactionId || data.orderId || data.id || data.reference;
        
        if (transactionId) {
            let orders = loadOrders();
            const orderIndex = orders.findIndex(o => o.transactionId === transactionId);
            
            if (orderIndex !== -1) {
                orders[orderIndex].status = 'completed';
                orders[orderIndex].paymentDetails = data;
                orders[orderIndex].completedAt = new Date().toISOString();
                saveOrders(orders);
                console.log(`✅ Order ${transactionId} marked as COMPLETED`);
                sendOrderEmail({ ...orders[orderIndex], status: 'completed' });
            }
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// 🚀 START
// ============================================================
app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════╗
║   🚀 UT Halal Gyro Server Started!            ║
╠═══════════════════════════════════════════════╣
║   📡 Port: ${PORT}                                ║
║   📧 Email: ${process.env.EMAIL_USER ? '✅ ENABLED' : '❌ DISABLED'}    ║
║   📊 Orders: ${loadOrders().length} total           ║
║   🔑 Admin: ?password=${process.env.ADMIN_PASSWORD || 'admin123'} ║
╚═══════════════════════════════════════════════╝
    `);
});
