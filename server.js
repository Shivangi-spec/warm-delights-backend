const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');

// Load environment variables safely
try {
    require('dotenv').config();
} catch (error) {
    console.log('dotenv not available, using environment variables directly');
}

const app = express();
const PORT = process.env.PORT || 5000;

// Security configuration
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'warmdelights_admin';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || bcrypt.hashSync('SecurePass@2025!', 10);
const JWT_SECRET = process.env.JWT_SECRET || 'warmdelights-secret-key-2025';

// Rate limiting for authentication
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Too many login attempts, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

// Enhanced CORS configuration
app.use(cors({
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST', 'DELETE', 'PUT', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Access-Control-Allow-Origin'],
    optionsSuccessStatus: 200
}));

app.options('*', cors());

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Create uploads directory
const uploadDir = path.join(__dirname, 'uploads');

function ensureUploadsDir() {
    try {
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
            console.log('✅ Uploads directory created:', uploadDir);
        }
    } catch (error) {
        console.error('❌ Error creating uploads directory:', error);
        throw error;
    }
}
ensureUploadsDir();

// Static file serving with headers
app.use('/uploads', express.static(uploadDir, {
    maxAge: '1y',
    etag: true,
    lastModified: true,
    setHeaders: (res, filepath) => {
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Cross-Origin-Resource-Policy', 'cross-origin');
        res.set('Cross-Origin-Embedder-Policy', 'unsafe-none');
    }
}));

// Multer config
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        ensureUploadsDir();
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const random = Math.round(Math.random() * 1E9);
        const extension = path.extname(file.originalname).toLowerCase();
        const baseName = path.basename(file.originalname, extension);
        const safeName = baseName.replace(/[^a-zA-Z0-9]/g, '_');
        cb(null, `${timestamp}-${random}-${safeName}${extension}`);
    }
});
const fileFilter = (req, file, cb) => {
    const allowed = ['image/jpeg','image/jpg','image/png','image/webp','image/gif'];
    if (allowed.includes(file.mimetype.toLowerCase())) cb(null, true);
    else cb(new Error(`Invalid file type: ${file.mimetype}`), false);
};
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter
});

// Data stores
let orders = [];
let orderIdCounter = 1;
let galleryImages = [];
let analyticsEvents = [];
let adminSessions = new Map();

// Email transporter
let transporter = null;
try {
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
        transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });
    }
} catch (error) {
    console.log('Email setup failed, continuing without email');
}

// Middleware
function authMiddleware(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!decoded.isAdmin || !adminSessions.has(decoded.sessionId)) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        req.admin = decoded;
        next();
    } catch {
        return res.status(401).json({ error: 'Invalid token' });
    }
}

// ----------------- AUTH -----------------
app.post('/api/admin/login', authLimiter, async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, message: 'Missing credentials' });

    const isValidUsername = username === ADMIN_USERNAME;
    const isValidPassword = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
    if (!isValidUsername || !isValidPassword) return res.status(401).json({ success: false, message: 'Invalid credentials' });

    const sessionId = `session_${Date.now()}_${Math.random().toString(36)}`;
    adminSessions.set(sessionId, { username, loginTime: new Date() });

    const token = jwt.sign({ username, isAdmin: true, sessionId }, JWT_SECRET, { expiresIn: '2h' });
    res.json({ success: true, token, expiresIn: '2h' });
});

app.post('/api/admin/logout', authMiddleware, (req, res) => {
    adminSessions.delete(req.admin.sessionId);
    res.json({ success: true, message: 'Logout successful' });
});

// ----------------- GALLERY -----------------
// Upload image (Admin only)
app.post('/api/admin/gallery/upload', authMiddleware, (req, res) => {
    upload.single('image')(req, res, function(err) {
        if (err || !req.file) return res.status(400).json({ error: err?.message || 'No file uploaded' });

        const imageData = {
            id: Date.now(),
            filename: req.file.filename,
            originalName: req.file.originalname,
            url: `/uploads/${req.file.filename}`,
            uploadedAt: new Date(),
            uploadedBy: req.admin.username,
            isPublic: true,
            views: 0
        };
        galleryImages.push(imageData);
        res.json({ success: true, image: imageData });
    });
});

// Get gallery (Public)
app.get('/api/gallery', (req, res) => {
    const images = galleryImages
        .filter(img => img.isPublic)
        .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
    res.json({ images });
});

// Delete image (Admin only)
app.delete('/api/admin/gallery/:id', authMiddleware, (req, res) => {
    const id = parseInt(req.params.id);
    const index = galleryImages.findIndex(img => img.id === id);
    if (index === -1) return res.status(404).json({ error: 'Image not found' });

    const image = galleryImages[index];
    const filepath = path.join(uploadDir, image.filename);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);

    galleryImages.splice(index, 1);
    res.json({ success: true, message: 'Image deleted' });
});

// ----------------- ORDERS -----------------
app.post('/api/orders', upload.single('referenceImage'), (req, res) => {
    const { customerName, email, phone, items } = req.body;
    if (!customerName || !email || !phone) return res.status(400).json({ success: false, message: 'Missing fields' });

    const parsedItems = typeof items === 'string' ? JSON.parse(items) : [];
    const order = {
        id: orderIdCounter++,
        customerName,
        email,
        phone,
        items: parsedItems,
        createdAt: new Date()
    };
    orders.push(order);
    res.status(201).json({ success: true, orderId: `WD${order.id.toString().padStart(4, '0')}` });
});

// ----------------- CONTACT -----------------
app.post('/api/contact', async (req, res) => {
    const { name, email, message } = req.body;
    if (!name || !email || !message) return res.status(400).json({ success: false, message: 'Missing fields' });

    res.json({ success: true, message: 'Message received!' });
});

// ----------------- HEALTH -----------------
app.get('/', (req, res) => res.json({ status: 'OK', images: galleryImages.length }));
app.get('/health', (req, res) => res.json({ status: 'healthy', uptime: process.uptime() }));

// ----------------- SERVER -----------------
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Warm Delights Backend running on port ${PORT}`);
});

module.exports = app;
