const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');

// Load environment variables
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Security configuration
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'warmdelights_admin';
const ADMIN_PASSWORD = 'SecurePass@2025!'; // Default password
const JWT_SECRET = process.env.JWT_SECRET || 'warmdelights-secret-key-2025';

// **🌍 GLOBAL SERVER STORAGE CLASS**
class GlobalImageStorage {
    constructor() {
        this.uploadDir = path.join(__dirname, 'uploads');
        this.dataFile = path.join(__dirname, 'global_gallery.json');
        this.images = [];
        this.analyticsEvents = [];
        this.init();
    }

    init() {
        // Ensure uploads directory exists
        this.ensureUploadsDir();

        // Load persistent data
        this.loadGalleryData();

        console.log(`✅ Global Storage initialized with ${this.images.length} images`);
        console.log(`📊 Loaded ${this.analyticsEvents.length} analytics events`);
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
                console.log('✅ Gallery data loaded from disk');
            }
        } catch (error) {
            console.error('❌ Error loading gallery data:', error);
            this.images = [];
            this.analyticsEvents = [];
        }
    }

    saveGalleryData() {
        try {
            const data = {
                images: this.images,
                analytics: this.analyticsEvents.slice(-5000), // Keep last 5000 events
                lastUpdated: new Date().toISOString()
            };
            fs.writeFileSync(this.dataFile, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('❌ Error saving gallery data:', error);
        }
    }

    // **🖼️ IMAGE MANAGEMENT**
    addImage(imageData) {
        const image = {
            id: Date.now() + Math.floor(Math.random() * 1000),
            filename: imageData.filename,
            originalName: imageData.originalName,
            uploadedBy: imageData.uploadedBy,
            size: imageData.size,
            mimeType: imageData.mimeType,
            uploadedAt: new Date().toISOString(),
            views: 0,
            isPublic: true,
            url: `/uploads/${imageData.filename}`,
            alt: `Warm Delights - ${imageData.originalName}`,
            tags: []
        };

        this.images.push(image);
        this.saveGalleryData();

        console.log(`✅ Image added to global storage: ${image.filename}`);
        return image;
    }

    removeImage(imageId) {
        const imageIndex = this.images.findIndex(img => img.id == imageId);
        if (imageIndex === -1) return null;

        const [removedImage] = this.images.splice(imageIndex, 1);
        this.saveGalleryData();

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

// **🖼️ ENHANCED STATIC FILE SERVING**
app.use('/uploads', express.static(globalStorage.uploadDir, {
    maxAge: '1y', // Cache for 1 year
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
        // Set proper content type for images
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

        // Enable cross-origin access for images
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year cache
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
        files: 5
    },
    fileFilter: fileFilter
});

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
        const isValidPassword = password === ADMIN_PASSWORD;

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

        // Generate JWT token
        const token = jwt.sign({
            username: username,
            isAdmin: true
        }, JWT_SECRET, { expiresIn: '2h' });

        // Track successful login
        globalStorage.trackEvent('admin_login_success', {
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
app.post('/api/admin/gallery/upload', authMiddleware, upload.array('images', 5), (req, res) => {
    console.log('📸 Admin gallery upload to global storage');

    if (!req.files || req.files.length === 0) {
        return res.status(400).json({
            error: 'No files uploaded',
            message: 'Please select image files'
        });
    }

    try {
        const uploadedImages = [];

        // Process each uploaded file
        for (const file of req.files) {
            // Add to global storage
            const imageData = globalStorage.addImage({
                filename: file.filename,
                originalName: file.originalname,
                uploadedBy: req.admin.username,
                size: file.size,
                mimeType: file.mimetype
            });

            uploadedImages.push(imageData);

            // Track successful upload
            globalStorage.trackEvent('admin_upload_success', {
                filename: file.filename,
                size: file.size
            });

            console.log('✅ Image uploaded to global storage:', imageData.filename);
        }

        res.json({
            success: true,
            message: `${uploadedImages.length} image(s) uploaded to global storage!`,
            images: uploadedImages
        });

    } catch (error) {
        console.error('❌ Upload error:', error);
        res.status(500).json({
            error: 'Upload failed',
            message: 'Could not upload images to global storage'
        });
    }
});

// **🖼️ PUBLIC GALLERY FROM GLOBAL STORAGE**
app.get('/api/images', (req, res) => {
    try {
        const images = globalStorage.getPublicImages();
        
        const imageData = images.map(img => ({
            id: img.id,
            filename: img.filename,
            name: img.originalName,
            url: img.url,
            alt: img.alt,
            views: img.views,
            uploadedAt: img.uploadedAt,
            size: img.size
        }));

        // Track gallery view
        globalStorage.trackEvent('gallery_viewed', {
            ip: req.ip,
            imagesCount: imageData.length
        });

        console.log(`🌍 Global gallery served: ${imageData.length} images`);

        res.json(imageData);

    } catch (error) {
        console.error('❌ Gallery error:', error);
        res.status(500).json({ error: 'Failed to load gallery from global storage' });
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
        globalStorage.trackEvent('admin_analytics_viewed', {});

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

// **💚 HEALTH CHECK**
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        globalStorage: {
            images: globalStorage.images.length,
            events: globalStorage.analyticsEvents.length
        }
    });
});

// **🚨 GLOBAL ERROR HANDLER**
app.use((error, req, res, next) => {
    console.error('🚨 Global error:', error);

    // Track error
    globalStorage.trackEvent('server_error', {
        error: error.message,
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

// **🚀 START SERVER WITH GLOBAL STORAGE**
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Warm Delights Global Storage Server v3.0.0 running on port ${PORT}`);
    console.log(`🌍 Global storage with ${globalStorage.images.length} images`);
    console.log(`📊 Analytics events: ${globalStorage.analyticsEvents.length}`);
    console.log(`📁 Storage location: ${globalStorage.uploadDir}`);
    console.log(`🚀 Features: Global Storage, Universal Access, Analytics`);
}).on('error', (error) => {
    console.error('Server error:', error);
});

// **🛑 GRACEFUL SHUTDOWN**
process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully');

    // Save all data before shutdown
    globalStorage.saveGalleryData();

    server.close(() => {
        console.log('Process terminated gracefully');
    });
});

process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down gracefully');

    // Save all data before shutdown
    globalStorage.saveGalleryData();

    server.close(() => {
        console.log('Process terminated gracefully');
    });
});

module.exports = app;