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
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');

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
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'warmdelights_admin_token_2025';

// **🌍 GLOBAL SERVER STORAGE CLASS**
class GlobalImageStorage {
    constructor() {
        this.uploadDir = path.join(__dirname, 'uploads');
        this.dataFile = path.join(__dirname, 'global_gallery.json');
        this.sessionFile = path.join(__dirname, 'session_cache.json');
        this.images = [];
        this.sessionCache = new Map();
        this.adminSessions = new Map();
        this.analyticsEvents = [];
        this.orders = [];
        this.orderIdCounter = 1;
        this.init();
    }

    init() {
        // Ensure uploads directory exists
        this.ensureUploadsDir();

        // Load persistent data
        this.loadGalleryData();
        this.loadSessionData();

        console.log(`✅ Global Storage initialized with ${this.images.length} images`);
        console.log(`📊 Loaded ${this.analyticsEvents.length} analytics events`);
        console.log(`🛒 Loaded ${this.orders.length} orders`);
    }

    ensureUploadsDir() {
        try {
            if (!fs.existsSync(this.uploadDir)) {
                fs.mkdirSync(this.uploadDir, { recursive: true });
                console.log('✅ Global uploads directory created:', this.uploadDir);
            }
        } catch (error) {
            console.error('❌ Error creating uploads directory:', error);
            throw error;
        }
    }

    // **💾 PERSISTENT GALLERY STORAGE**
    loadGalleryData() {
        try {
            if (fs.existsSync(this.dataFile)) {
                const data = fs.readFileSync(this.dataFile, 'utf8');
                const parsed = JSON.parse(data);
                this.images = parsed.images || [];
                this.analyticsEvents = parsed.analytics || [];
                this.orders = parsed.orders || [];
                this.orderIdCounter = parsed.orderIdCounter || 1;
                console.log('✅ Gallery data loaded from disk');
            }
        } catch (error) {
            console.error('❌ Error loading gallery data:', error);
            this.images = [];
            this.analyticsEvents = [];
            this.orders = [];
        }
    }

    saveGalleryData() {
        try {
            const data = {
                images: this.images,
                analytics: this.analyticsEvents.slice(-5000), // Keep last 5000 events
                orders: this.orders,
                orderIdCounter: this.orderIdCounter,
                lastUpdated: new Date().toISOString()
            };
            fs.writeFileSync(this.dataFile, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('❌ Error saving gallery data:', error);
        }
    }

    // **🔄 SESSION CACHE MANAGEMENT**
    loadSessionData() {
        try {
            if (fs.existsSync(this.sessionFile)) {
                const data = fs.readFileSync(this.sessionFile, 'utf8');
                const parsed = JSON.parse(data);
                // Convert to Map
                Object.entries(parsed).forEach(([key, value]) => {
                    this.sessionCache.set(key, value);
                });
                console.log('✅ Session cache loaded');
            }
        } catch (error) {
            console.error('❌ Error loading session data:', error);
        }
    }

    saveSessionData() {
        try {
            const data = Object.fromEntries(this.sessionCache);
            fs.writeFileSync(this.sessionFile, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('❌ Error saving session data:', error);
        }
    }

    // **🖼️ IMAGE MANAGEMENT**
    addImage(imageData) {
        const baseUrl = process.env.BASE_URL || 'https://warm-delights-backend-production.up.railway.app';
        const image = {
            id: Date.now(),
            filename: imageData.filename,
            originalName: imageData.originalName,
            uploadedBy: imageData.uploadedBy,
            size: imageData.size,
            mimeType: imageData.mimeType,
            uploadedAt: new Date().toISOString(),
            views: 0,
            isPublic: true,
            url: `${baseUrl}/uploads/${imageData.filename}`,  // Full URL here
            alt: `Warm Delights - ${imageData.originalName}`,
            tags: []
        };
        this.images.push(image);
        this.saveGalleryData();
        // Update session cache
        this.updateSessionCache('gallery', this.getPublicImages());
        console.log(`✅ Image added to global storage: ${image.filename}`);
        return image;
    }

    removeImage(imageId) {
        const imageIndex = this.images.findIndex(img => img.id === imageId);
        if (imageIndex === -1) return null;

        const [removedImage] = this.images.splice(imageIndex, 1);
        this.saveGalleryData();

        // Update session cache
        this.updateSessionCache('gallery', this.getPublicImages());

        console.log(`✅ Image removed from global storage: ${removedImage.filename}`);
        return removedImage;
    }

    getPublicImages() {
        return this.images
            .filter(img => img.isPublic)
            .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
    }

    incrementImageViews(filename) {
        const image = this.images.find(img => img.filename === filename);
        if (image) {
            image.views = (image.views || 0) + 1;
            this.saveGalleryData();
            return image.views;
        }
        return 0;
    }

    // **📊 ANALYTICS MANAGEMENT**
    trackEvent(eventType, data = {}) {
        const event = {
            id: Date.now(),
            type: eventType,
            data: data,
            timestamp: new Date().toISOString(),
            ip: data.ip || 'unknown'
        };

        this.analyticsEvents.push(event);

        // Keep only last 10000 events in memory
        if (this.analyticsEvents.length > 10000) {
            this.analyticsEvents = this.analyticsEvents.slice(-10000);
        }

        this.saveGalleryData();
        return event;
    }

    getAnalyticsStats() {
        const today = new Date().toDateString();

        return {
            totalVisitors: this.analyticsEvents.filter(e => e.type === 'page_visit').length,
            todayVisitors: this.analyticsEvents.filter(e =>
                e.type === 'page_visit' &&
                new Date(e.timestamp).toDateString() === today
            ).length,
            cartAdditions: this.analyticsEvents.filter(e => e.type === 'cart_add').length,
            whatsappOrders: this.analyticsEvents.filter(e => e.type === 'whatsapp_order').length,
            contactSubmissions: this.analyticsEvents.filter(e => e.type === 'contact_submit').length,
            imageUploads: this.analyticsEvents.filter(e => e.type === 'admin_upload_success').length,
            imageViews: this.analyticsEvents.filter(e => e.type === 'image_view').length,
            totalEvents: this.analyticsEvents.length
        };
    }

    // **🛒 ORDER MANAGEMENT**
    addOrder(orderData) {
        const order = {
            id: this.orderIdCounter++,
            ...orderData,
            status: 'pending',
            createdAt: new Date().toISOString()
        };

        this.orders.push(order);
        this.saveGalleryData();

        return order;
    }

    getOrders(limit = 50) {
        return this.orders.slice(-limit).reverse();
    }

    // **🔄 SESSION CACHE METHODS**
    updateSessionCache(key, value) {
        this.sessionCache.set(key, {
            data: value,
            timestamp: Date.now(),
            expires: Date.now() + (15 * 60 * 1000) // 15 minutes
        });
        this.saveSessionData();
    }

    getFromSessionCache(key) {
        const cached = this.sessionCache.get(key);
        if (cached && cached.expires > Date.now()) {
            return cached.data;
        }
        this.sessionCache.delete(key);
        return null;
    }

    clearExpiredSessions() {
        const now = Date.now();
        let cleared = 0;

        for (const [key, value] of this.sessionCache.entries()) {
            if (value.expires < now) {
                this.sessionCache.delete(key);
                cleared++;
            }
        }

        if (cleared > 0) {
            console.log(`🗑️ Cleared ${cleared} expired session cache entries`);
            this.saveSessionData();
        }
    }

    // **👤 ADMIN SESSION MANAGEMENT**
    createAdminSession(username, loginData) {
        const sessionId = `session_${Date.now()}_${Math.random().toString(36)}`;

        this.adminSessions.set(sessionId, {
            username: username,
            loginTime: new Date(),
            ...loginData
        });

        return sessionId;
    }

    validateAdminSession(sessionId) {
        return this.adminSessions.has(sessionId);
    }

    removeAdminSession(sessionId) {
        return this.adminSessions.delete(sessionId);
    }
}

// **🌍 INITIALIZE GLOBAL STORAGE**
const globalStorage = new GlobalImageStorage();

// Rate limiting for authentication
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // limit each IP to 5 requests per windowMs
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
app.use(helmet()); // Security headers
app.use(compression()); // Gzip compression
app.use(morgan('combined')); // Request logging

// **🖼️ ENHANCED STATIC FILE SERVING**
app.use('/uploads', express.static(globalStorage.uploadDir, {
    maxAge: '1y',
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp'
        };
        if (mimeTypes[ext]) {
            res.setHeader('Content-Type', mimeTypes[ext]);
        }
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
        res.setHeader('Cache-Control', 'public, max-age=31536000');
    }
}));

// Alternative static serving routes
app.use('/api/uploads', express.static(globalStorage.uploadDir, {
    setHeaders: (res, path) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    }
}));

app.use('/images', express.static(globalStorage.uploadDir, {
    setHeaders: (res, path) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    }
}));

// **📤 MULTER CONFIGURATION**
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, globalStorage.uploadDir);
    },
    filename: function (req, file, cb) {
        const timestamp = Date.now();
        const random = Math.round(Math.random() * 1E9);
        const extension = path.extname(file.originalname).toLowerCase();
        const baseName = path.basename(file.originalname, extension);
        const safeName = baseName.replace(/[^a-zA-Z0-9]/g, '_');
        const uniqueName = `${timestamp}-${random}-${safeName}${extension}`;
        cb(null, uniqueName);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedMimeTypes = [
        'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'
    ];

    if (allowedMimeTypes.includes(file.mimetype.toLowerCase())) {
        cb(null, true);
    } else {
        cb(new Error(`Invalid file type: ${file.mimetype}. Only JPEG, PNG, WebP, and GIF images are allowed.`), false);
    }
};

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
        files: 1
    },
    fileFilter: fileFilter
});

// Email transporter (keep existing)
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
    console.log('Email setup failed, continuing without email functionality');
}

// **🔐 AUTHENTICATION MIDDLEWARE**
function authMiddleware(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Missing or invalid authorization header'
            });
        }

        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, JWT_SECRET);

        if (!decoded.isAdmin) {
            return res.status(403).json({
                error: 'Forbidden',
                message: 'Admin access required'
            });
        }

        // Check if session is still valid
        if (!globalStorage.validateAdminSession(decoded.sessionId)) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Session expired'
            });
        }

        req.admin = decoded;
        next();
    } catch (error) {
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Invalid token'
        });
    }
}

// **🔑 ADMIN LOGIN WITH GLOBAL STORAGE**
app.post('/api/admin/login', authLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Username and password are required'
            });
        }

        // Verify credentials
        const isValidUsername = username === ADMIN_USERNAME;
        const isValidPassword = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);

        if (!isValidUsername || !isValidPassword) {
            // Track failed attempt
            globalStorage.trackEvent('admin_login_failed', {
                ip: req.ip,
                userAgent: req.get('User-Agent')
            });

            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Create session in global storage
        const sessionId = globalStorage.createAdminSession(username, {
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });

        // Generate JWT token
        const token = jwt.sign({
            username: username,
            isAdmin: true,
            sessionId: sessionId
        }, JWT_SECRET, { expiresIn: '2h' });

        // Track successful login
        globalStorage.trackEvent('admin_login_success', {
            sessionId: sessionId,
            ip: req.ip
        });

        console.log(`✅ Admin login successful: ${username}`);

        res.json({
            success: true,
            message: 'Login successful',
            token: token,
            expiresIn: '2h'
        });

    } catch (error) {
        console.error('❌ Admin login error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// **📤 IMAGE UPLOAD TO GLOBAL STORAGE**
app.post('/api/admin/gallery/upload', authMiddleware, (req, res) => {
    console.log('📸 Admin gallery upload to global storage');

    upload.single('image')(req, res, function (err) {
        if (err) {
            console.error('❌ Upload error:', err);

            globalStorage.trackEvent('admin_upload_failed', {
                sessionId: req.admin.sessionId,
                error: err.message
            });

            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(400).json({
                        error: 'File too large',
                        message: 'File size must be less than 10MB'
                    });
                }
            }

            return res.status(400).json({
                error: 'Upload failed',
                message: err.message
            });
        }

        if (!req.file) {
            return res.status(400).json({
                error: 'No file uploaded',
                message: 'Please select an image file'
            });
        }

        // **💾 ADD TO GLOBAL STORAGE**
        const imageData = globalStorage.addImage({
            filename: req.file.filename,
            originalName: req.file.originalname,
            uploadedBy: req.admin.username,
            size: req.file.size,
            mimeType: req.file.mimetype
        });

        // Track successful upload
        globalStorage.trackEvent('admin_upload_success', {
            sessionId: req.admin.sessionId,
            filename: req.file.filename,
            size: req.file.size
        });

        console.log('✅ Image uploaded to global storage:', imageData.filename);

        res.json({
            success: true,
            message: 'Image uploaded to global storage!',
            image: imageData
        });
    });
});

// **🖼️ PUBLIC GALLERY FROM GLOBAL STORAGE**
app.get('/api/gallery', (req, res) => {
    try {
        // Try to get from session cache first
        let images = globalStorage.getFromSessionCache('gallery');

        if (!images) {
            // If not cached, get from storage and cache it
            images = globalStorage.getPublicImages();
            globalStorage.updateSessionCache('gallery', images);
            console.log('🔄 Gallery loaded from global storage and cached');
        } else {
            console.log('⚡ Gallery served from session cache');
        }

        const imageData = images.map(img => ({
            id: img.id,
            filename: img.filename,
            url: img.url,
            alt: img.alt,
            views: img.views,
            uploadedAt: img.uploadedAt
        }));

        // Track gallery view
        globalStorage.trackEvent('gallery_viewed', {
            ip: req.ip,
            imagesCount: imageData.length,
            source: images === globalStorage.getFromSessionCache('gallery') ? 'cache' : 'storage'
        });

        console.log(`🌍 Global gallery served: ${imageData.length} images`);

        res.json({
            success: true,
            images: imageData,
            totalImages: imageData.length,
            source: 'global-storage',
            cached: images === globalStorage.getFromSessionCache('gallery')
        });

    } catch (error) {
        console.error('❌ Gallery error:', error);
        res.status(500).json({ error: 'Failed to load gallery from global storage' });
    }
});

// **📱 SIMPLE IMAGES ENDPOINT**
app.get('/api/images', (req, res) => {
    try {
        const images = globalStorage.getPublicImages();
        const filenames = images.map(img => img.filename);

        console.log(`📱 Images API served: ${filenames.length} filenames from global storage`);
        res.json(filenames);

    } catch (error) {
        console.error('❌ Images error:', error);
        res.status(500).json({ error: 'Failed to load images from global storage' });
    }
});

// **👁️ TRACK IMAGE VIEWS IN GLOBAL STORAGE**
app.post('/api/images/:filename/view', (req, res) => {
    try {
        const filename = req.params.filename;
        const views = globalStorage.incrementImageViews(filename);

        globalStorage.trackEvent('image_view', {
            filename: filename,
            ip: req.ip,
            views: views
        });

        res.json({ success: true, views: views });

    } catch (error) {
        console.error('❌ Image view tracking error:', error);
        res.status(500).json({ error: 'View tracking failed' });
    }
});

// **🗑️ DELETE FROM GLOBAL STORAGE**
app.delete('/api/admin/gallery/:id', authMiddleware, (req, res) => {
    try {
        const imageId = parseInt(req.params.id);
        const removedImage = globalStorage.removeImage(imageId);

        if (!removedImage) {
            return res.status(404).json({
                error: 'Image not found',
                message: 'The requested image does not exist in global storage'
            });
        }

        // Delete file from filesystem
        const filePath = path.join(globalStorage.uploadDir, removedImage.filename);
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log('✅ File deleted from filesystem:', removedImage.filename);
            }
        } catch (fileError) {
            console.error('❌ File deletion error:', fileError);
        }

        // Track deletion
        globalStorage.trackEvent('admin_image_deleted', {
            sessionId: req.admin.sessionId,
            imageId: imageId,
            filename: removedImage.filename
        });

        console.log('✅ Image deleted from global storage:', removedImage.filename);

        res.json({
            success: true,
            message: 'Image deleted from global storage',
            deletedImage: {
                id: imageId,
                filename: removedImage.filename
            }
        });

    } catch (error) {
        console.error('❌ Delete error:', error);
        res.status(500).json({
            error: 'Delete failed',
            message: 'Could not delete image from global storage'
        });
    }
});

// **📊 ANALYTICS FROM GLOBAL STORAGE**
app.get('/api/admin/analytics', authMiddleware, (req, res) => {
    try {
        const stats = globalStorage.getAnalyticsStats();

        // Track analytics view
        globalStorage.trackEvent('admin_analytics_viewed', {
            sessionId: req.admin.sessionId
        });

        res.json({
            success: true,
            stats: stats,
            source: 'global-storage'
        });

    } catch (error) {
        console.error('❌ Analytics fetch error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch analytics from global storage'
        });
    }
});

// **📝 ANALYTICS TRACKING**
app.post('/api/analytics/track', (req, res) => {
    try {
        const { eventType, data } = req.body;

        if (!eventType) {
            return res.status(400).json({
                success: false,
                message: 'Event type is required'
            });
        }

        const event = globalStorage.trackEvent(eventType, {
            ...data,
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });

        res.json({
            success: true,
            message: 'Event tracked in global storage',
            eventId: event.id
        });

    } catch (error) {
        console.error('❌ Analytics tracking error:', error);
        res.status(500).json({
            success: false,
            message: 'Event tracking failed'
        });
    }
});

// **🛒 ORDERS WITH GLOBAL STORAGE**
app.post('/api/orders', upload.single('referenceImage'), async (req, res) => {
    try {
        const { customerName, email, phone, items, specialInstructions, deliveryDate, deliveryAddress } = req.body;

        if (!customerName || !email || !phone) {
            return res.status(400).json({
                success: false,
                message: 'Name, email, and phone are required'
            });
        }

        const parsedItems = typeof items === 'string' ? JSON.parse(items) : items || [];

        const orderData = {
            customerName,
            email,
            phone,
            items: parsedItems,
            specialInstructions,
            deliveryDate,
            deliveryAddress,
            referenceImage: req.file ? req.file.filename : null,
            totalAmount: parsedItems.reduce((total, item) => total + (item.price * item.quantity), 0)
        };

        const order = globalStorage.addOrder(orderData);

        // Track order in analytics
        globalStorage.trackEvent('order_placed', {
            orderId: order.id,
            totalAmount: order.totalAmount,
            itemCount: parsedItems.length
        });

        // Send email if available
        if (transporter) {
            try {
                const mailOptions = {
                    from: process.env.EMAIL_USER,
                    to: email,
                    subject: 'Order Confirmation - Warm Delights',
                    html: `
                        <h2>Dear ${customerName},</h2>
                        <p>We've received your order and will begin preparing it soon.</p>
                        <p><strong>Order ID:</strong> WD${order.id.toString().padStart(4, '0')}</p>
                        <p><strong>Delivery Date:</strong> ${deliveryDate}</p>
                        <p><strong>Total Amount:</strong> ₹${order.totalAmount}</p>
                        <p>Thank you for choosing Warm Delights!</p>
                    `
                };
                await transporter.sendMail(mailOptions);
            } catch (emailError) {
                console.error('Email error:', emailError);
            }
        }

        res.status(201).json({
            success: true,
            message: 'Order placed and stored in global storage!',
            orderId: `WD${order.id.toString().padStart(4, '0')}`
        });

    } catch (error) {
        console.error('Order error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to place order'
        });
    }
});

// **📋 GET ORDERS FROM GLOBAL STORAGE**
app.get('/api/admin/orders', authMiddleware, (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const orders = globalStorage.getOrders(limit);

        // Track order view
        globalStorage.trackEvent('admin_orders_viewed', {
            sessionId: req.admin.sessionId,
            ordersCount: orders.length
        });

        res.json({
            success: true,
            orders: orders,
            totalOrders: globalStorage.orders.length,
            source: 'global-storage'
        });

    } catch (error) {
        console.error('❌ Orders fetch error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch orders from global storage'
        });
    }
});

// **📞 CONTACT FORM WITH GLOBAL STORAGE**
app.post('/api/contact', async (req, res) => {
    try {
        const { name, email, phone, message } = req.body;

        if (!name || !email || !message) {
            return res.status(400).json({
                success: false,
                message: 'Name, email, and message are required'
            });
        }

        // Track contact submission
        globalStorage.trackEvent('contact_submit', {
            name: name,
            email: email,
            ip: req.ip
        });

        if (transporter) {
            try {
                const mailOptions = {
                    from: process.env.EMAIL_USER,
                    to: process.env.EMAIL_USER,
                    subject: 'New Contact Form Submission - Warm Delights',
                    html: `
                        <h3>New Contact Form Submission</h3>
                        <p><strong>Name:</strong> ${name}</p>
                        <p><strong>Email:</strong> ${email}</p>
                        <p><strong>Phone:</strong> ${phone || 'Not provided'}</p>
                        <p><strong>Message:</strong></p>
                        <p>${message}</p>
                    `
                };
                await transporter.sendMail(mailOptions);
            } catch (emailError) {
                console.error('Contact email error:', emailError);
            }
        }

        res.json({
            success: true,
            message: 'Message sent and tracked in global storage!'
        });
    } catch (error) {
        console.error('Contact form error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send message'
        });
    }
});

// **📊 MENU API**
app.get('/api/menu', (req, res) => {
    try {
        const menuItems = [
            {
                id: 1,
                name: 'Vanilla Cake',
                category: 'Cakes',
                price: 450.00,
                description: 'Classic soft, moist eggless vanilla cake perfect for any celebration',
                customizable: true,
                eggless: true,
                minOrder: 1,
                minOrderText: 'Minimum 1 cake',
                image: '/api/placeholder/300/200'
            },
            {
                id: 2,
                name: 'Chocolate Cake',
                category: 'Cakes',
                price: 500.00,
                description: 'Rich, decadent eggless chocolate cake that melts in your mouth',
                customizable: true,
                eggless: true,
                minOrder: 1,
                minOrderText: 'Minimum 1 cake',
                image: '/api/placeholder/300/200'
            },
            {
                id: 3,
                name: 'Strawberry Cake',
                category: 'Cakes',
                price: 550.00,
                description: 'Fresh strawberry eggless cake with real fruit flavoring',
                customizable: true,
                eggless: true,
                minOrder: 1,
                minOrderText: 'Minimum 1 cake',
                image: '/api/placeholder/300/200'
            },
            {
                id: 4,
                name: 'Butterscotch Cake',
                category: 'Cakes',
                price: 550.00,
                description: 'Butterscotch delight with caramel flavoring, light and sweet',
                customizable: true,
                eggless: true,
                minOrder: 1,
                minOrderText: 'Minimum 1 cake',
                image: '/api/placeholder/300/200'
            },
            {
                id: 5,
                name: 'Peanut Butter Cookies',
                category: 'Cookies',
                price: 200,
                description: 'Crunchy eggless peanut butter cookies with rich nutty flavor (250g box)',
                customizable: false,
                priceUnit: '/box',
                eggless: true,
                minOrder: 1,
                minOrderText: 'Minimum 1 box (250g)',
                image: '/api/placeholder/300/200'
            },
            {
                id: 6,
                name: 'Chocolate Cookies',
                category: 'Cookies',
                price: 180,
                description: 'Soft eggless chocolate cookies loaded with chocolate chips (250g box)',
                customizable: false,
                priceUnit: '/box',
                eggless: true,
                minOrder: 1,
                minOrderText: 'Minimum 1 box (250g)',
                image: '/api/placeholder/300/200'
            },
            {
                id: 7,
                name: 'Almond Cookies',
                category: 'Cookies',
                price: 190,
                description: 'Crunchy almond cookies with real almond pieces (250g box)',
                customizable: false,
                priceUnit: '/box',
                eggless: true,
                minOrder: 1,
                minOrderText: 'Minimum 1 box (250g)',
                image: '/api/placeholder/300/200'
            },
            {
                id: 8,
                name: 'Butter Cream Cookies',
                category: 'Cookies',
                price: 160,
                description: 'Smooth butter cream cookies that melt in your mouth (250g box)',
                customizable: false,
                priceUnit: '/box',
                eggless: true,
                minOrder: 1,
                minOrderText: 'Minimum 1 box (250g)',
                image: '/api/placeholder/300/200'
            },
            {
                id: 9,
                name: 'Chocolate Cupcakes',
                category: 'Cupcakes',
                price: 40,
                description: 'Moist chocolate cupcakes with creamy frosting',
                customizable: true,
                priceUnit: '/piece',
                eggless: true,
                minOrder: 4,
                minOrderText: 'Minimum 4 pieces',
                image: '/api/placeholder/300/200'
            },
            {
                id: 10,
                name: 'Whole Wheat Banana Muffins',
                category: 'Cupcakes',
                price: 35,
                description: 'Healthy whole wheat banana muffins with real banana chunks',
                customizable: false,
                priceUnit: '/piece',
                eggless: true,
                minOrder: 4,
                minOrderText: 'Minimum 4 pieces',
                image: '/api/placeholder/300/200'
            },
            {
                id: 11,
                name: 'Cheesecake Cupcakes',
                category: 'Cupcakes',
                price: 55,
                description: 'Creamy cheesecake cupcakes with graham cracker base',
                customizable: true,
                priceUnit: '/piece',
                eggless: true,
                minOrder: 4,
                minOrderText: 'Minimum 4 pieces',
                image: '/api/placeholder/300/200'
            }
        ];

        res.json(menuItems);
    } catch (error) {
        console.error('❌ Menu error:', error);
        res.status(500).json({ error: 'Failed to load menu' });
    }
});

// **🖼️ ENHANCED PLACEHOLDER GENERATOR**
app.get('/api/placeholder/:width/:height', (req, res) => {
    try {
        const { width, height } = req.params;
        const text = req.query.text || '🧁 Warm Delights';

        const svg = `
            <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <pattern id="grain" patternUnits="userSpaceOnUse" width="100" height="100">
                        <rect width="100" height="100" fill="#f4c2c2"/>
                        <circle cx="25" cy="25" r="2" fill="#f0a8a8" opacity="0.3"/>
                        <circle cx="75" cy="75" r="1.5" fill="#f0a8a8" opacity="0.2"/>
                    </pattern>
                </defs>
                <rect width="${width}" height="${height}" fill="url(#grain)"/>
                <text x="50%" y="50%" text-anchor="middle" dy=".3em" 
                      fill="#d67b8a" font-family="Arial, sans-serif" 
                      font-size="${Math.min(width, height) / 10}" font-weight="bold">
                    ${text}
                </text>
            </svg>
        `;

        res.setHeader('Content-Type', 'image/svg+xml');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.send(svg);
    } catch (error) {
        console.error('Placeholder error:', error);
        res.status(500).send('Error generating placeholder');
    }
});

// **🏠 ROOT ROUTE WITH GLOBAL STORAGE INFO**
app.get('/', (req, res) => {
    const stats = globalStorage.getAnalyticsStats();

    res.json({
        status: 'OK',
        message: 'Warm Delights Global Storage Server',
        timestamp: new Date().toISOString(),
        version: '3.0.0',
        features: [
            'Global Server Storage',
            'Session Cache',
            'Universal Image Access',
            'Persistent Analytics',
            'Order Management',
            'Admin Authentication'
        ],
        storage: {
            totalImages: globalStorage.images.length,
            publicImages: globalStorage.getPublicImages().length,
            totalOrders: globalStorage.orders.length,
            totalEvents: stats.totalEvents,
            sessionCacheSize: globalStorage.sessionCache.size,
            activeAdminSessions: globalStorage.adminSessions.size
        },
        uploadDir: globalStorage.uploadDir,
        dataFiles: {
            gallery: fs.existsSync(globalStorage.dataFile),
            sessions: fs.existsSync(globalStorage.sessionFile)
        }
    });
});

// **💚 HEALTH CHECK**
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        globalStorage: {
            images: globalStorage.images.length,
            orders: globalStorage.orders.length,
            sessions: globalStorage.adminSessions.size,
            cache: globalStorage.sessionCache.size
        }
    });
});

// **🚨 GLOBAL ERROR HANDLER**
app.use((error, req, res, next) => {
    console.error('🚨 Global error:', error);

    // Track error
    globalStorage.trackEvent('server_error', {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method,
        ip: req.ip
    });

    if (error instanceof multer.MulterError) {
        return res.status(400).json({
            error: 'File upload error',
            message: error.message
        });
    }

    res.status(500).json({
        error: 'Internal server error',
        message: 'Something went wrong'
    });
});

// **🔍 404 HANDLER**
app.use('*', (req, res) => {
    globalStorage.trackEvent('route_not_found', {
        url: req.originalUrl,
        method: req.method,
        ip: req.ip
    });

    res.status(404).json({
        error: 'Route not found',
        message: `The route ${req.originalUrl} does not exist`
    });
});

// **🧹 CLEANUP TASKS**
setInterval(() => {
    // Clean expired sessions
    globalStorage.clearExpiredSessions();

    // Clean expired admin sessions
    const now = new Date();
    let expiredAdminSessions = [];

    globalStorage.adminSessions.forEach((session, sessionId) => {
        const timeDiff = now - new Date(session.loginTime);
        const hoursDiff = timeDiff / (1000 * 60 * 60);

        if (hoursDiff > 2) { // 2 hour expiry
            expiredAdminSessions.push(sessionId);
        }
    });

    expiredAdminSessions.forEach(sessionId => {
        globalStorage.adminSessions.delete(sessionId);
        console.log(`🗑️ Cleaned up expired admin session: ${sessionId}`);
    });

}, 30 * 60 * 1000); // Every 30 minutes

// **🚀 START SERVER WITH GLOBAL STORAGE**
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Warm Delights Global Storage Server v3.0.0 running on port ${PORT}`);
    console.log(`🌍 Global storage with ${globalStorage.images.length} images`);
    console.log(`📊 Analytics events: ${globalStorage.analyticsEvents.length}`);
    console.log(`🛒 Orders stored: ${globalStorage.orders.length}`);
    console.log(`🔄 Session cache entries: ${globalStorage.sessionCache.size}`);
    console.log(`📁 Storage location: ${globalStorage.uploadDir}`);
    console.log(`💾 Data persistence: ${fs.existsSync(globalStorage.dataFile) ? 'Enabled' : 'Disabled'}`);
    console.log(`🚀 Features: Global Storage, Session Cache, Universal Access, Analytics`);
}).on('error', (error) => {
    console.error('Server error:', error);
});

// **🛑 GRACEFUL SHUTDOWN**
process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully');

    // Save all data before shutdown
    globalStorage.saveGalleryData();
    globalStorage.saveSessionData();

    server.close(() => {
        console.log('Process terminated gracefully');
    });
});

process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down gracefully');

    // Save all data before shutdown
    globalStorage.saveGalleryData();
    globalStorage.saveSessionData();

    server.close(() => {
        console.log('Process terminated gracefully');
    });
});

module.exports = app;
