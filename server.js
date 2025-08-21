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

// Add this RIGHT AFTER your existing CORS setup (around line 50)
// Enhanced CORS for static file serving
app.use('/uploads', (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Cross-Origin-Resource-Policy', 'cross-origin');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    next();
});

// Your existing uploads static serving (keep this)
app.use('/uploads', express.static(uploadDir, {
    maxAge: '1y',
    etag: true,
    lastModified: true,
    setHeaders: (res, path) => {
        if (path.endsWith('.jpg') || path.endsWith('.jpeg')) {
            res.set('Content-Type', 'image/jpeg');
        } else if (path.endsWith('.png')) {
            res.set('Content-Type', 'image/png');
        } else if (path.endsWith('.webp')) {
            res.set('Content-Type', 'image/webp');
        }
        
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    }
}));



app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Create uploads directory
const uploadDir = path.join(__dirname, 'uploads');

function ensureUploadsDir() {
    try {
        if (fs.existsSync(uploadDir)) {
            const stats = fs.statSync(uploadDir);
            if (stats.isFile()) {
                fs.unlinkSync(uploadDir);
            } else if (stats.isDirectory()) {
                return;
            }
        }
        
        fs.mkdirSync(uploadDir, { recursive: true });
        console.log('✅ Uploads directory created:', uploadDir);
        
    } catch (error) {
        console.error('❌ Error creating uploads directory:', error);
        throw error;
    }
}

ensureUploadsDir();

// Enhanced static file serving with better headers
app.use('/uploads', express.static(uploadDir, {
    maxAge: '1y', // Cache for 1 year
    etag: true,
    lastModified: true,
    setHeaders: (res, path) => {
        // Set proper content type for images
        if (path.endsWith('.jpg') || path.endsWith('.jpeg')) {
            res.set('Content-Type', 'image/jpeg');
        } else if (path.endsWith('.png')) {
            res.set('Content-Type', 'image/png');
        } else if (path.endsWith('.webp')) {
            res.set('Content-Type', 'image/webp');
        }
        
        // Enable cross-origin access for images
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    }
}));

// Enhanced Multer configuration with better file handling
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        ensureUploadsDir();
        cb(null, uploadDir);
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

// Enhanced file filter with better validation
const fileFilter = (req, file, cb) => {
    // Accept images only
    const allowedMimeTypes = [
        'image/jpeg',
        'image/jpg', 
        'image/png',
        'image/webp',
        'image/gif'
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

// Data storage (In production, use database)
let orders = [];
let orderIdCounter = 1;
let galleryImages = [];
let analyticsEvents = [];
let adminSessions = new Map();

// Email transporter
let transporter = null;
try {
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
        transporter = nodemailer.createTransporter({
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

// Authentication middleware
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
        if (!adminSessions.has(decoded.sessionId)) {
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

// Admin login endpoint
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
            // Log failed attempt
            console.log(`❌ Failed admin login attempt from IP: ${req.ip}`);
            
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Create session
        const sessionId = `session_${Date.now()}_${Math.random().toString(36)}`;
        const loginTime = new Date();
        
        adminSessions.set(sessionId, {
            username: username,
            loginTime: loginTime,
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });

        // Generate JWT token
        const token = jwt.sign({
            username: username,
            isAdmin: true,
            sessionId: sessionId,
            loginTime: loginTime
        }, JWT_SECRET, { expiresIn: '2h' });

        console.log(`✅ Admin login successful for: ${username}`);
        
        // Track login event
        analyticsEvents.push({
            type: 'admin_login',
            timestamp: new Date().toISOString(),
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            sessionId: sessionId
        });

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

// Admin logout endpoint
app.post('/api/admin/logout', authMiddleware, (req, res) => {
    try {
        const sessionId = req.admin.sessionId;
        
        if (adminSessions.has(sessionId)) {
            adminSessions.delete(sessionId);
            
            // Track logout event
            analyticsEvents.push({
                type: 'admin_logout',
                timestamp: new Date().toISOString(),
                sessionId: sessionId
            });
            
            console.log(`✅ Admin logout successful for session: ${sessionId}`);
        }

        res.json({
            success: true,
            message: 'Logout successful'
        });

    } catch (error) {
        console.error('❌ Admin logout error:', error);
        res.status(500).json({
            success: false,
            message: 'Logout failed'
        });
    }
});

// Analytics tracking endpoint
app.post('/api/analytics/track', (req, res) => {
    try {
        const { eventType, data } = req.body;
        
        if (!eventType) {
            return res.status(400).json({
                success: false,
                message: 'Event type is required'
            });
        }

        const event = {
            type: eventType,
            data: data || {},
            timestamp: new Date().toISOString(),
            ip: req.ip,
            userAgent: req.get('User-Agent')
        };

        analyticsEvents.push(event);
        
        // Keep only last 10000 events
        if (analyticsEvents.length > 10000) {
            analyticsEvents = analyticsEvents.slice(-10000);
        }

        res.json({
            success: true,
            message: 'Event tracked successfully'
        });

    } catch (error) {
        console.error('❌ Analytics tracking error:', error);
        res.status(500).json({
            success: false,
            message: 'Event tracking failed'
        });
    }
});

// Get analytics data (protected)
app.get('/api/admin/analytics', authMiddleware, (req, res) => {
    try {
        const today = new Date().toDateString();
        
        const stats = {
            totalVisitors: analyticsEvents.filter(e => e.type === 'page_visit').length,
            todayVisitors: analyticsEvents.filter(e => 
                e.type === 'page_visit' && 
                new Date(e.timestamp).toDateString() === today
            ).length,
            cartAdditions: analyticsEvents.filter(e => e.type === 'cart_add').length,
            whatsappOrders: analyticsEvents.filter(e => e.type === 'whatsapp_order').length,
            chatInteractions: analyticsEvents.filter(e => e.type === 'chat_message').length,
            contactSubmissions: analyticsEvents.filter(e => e.type === 'contact_submit').length,
            customOrders: analyticsEvents.filter(e => e.type === 'custom_order').length,
            adminLogins: analyticsEvents.filter(e => e.type === 'admin_login').length,
            imageUploads: analyticsEvents.filter(e => e.type === 'admin_upload_success').length,
            imageViews: analyticsEvents.filter(e => e.type === 'image_view').length
        };
        
        // Track analytics view
        analyticsEvents.push({
            type: 'admin_analytics_viewed',
            timestamp: new Date().toISOString(),
            sessionId: req.admin.sessionId
        });

        res.json({
            success: true,
            stats: stats,
            totalEvents: analyticsEvents.length
        });

    } catch (error) {
        console.error('❌ Analytics fetch error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch analytics'
        });
    }
});

// Get recent events (protected)
app.get('/api/admin/events', authMiddleware, (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const recentEvents = analyticsEvents.slice(-limit).reverse();

        res.json({
            success: true,
            events: recentEvents,
            totalEvents: analyticsEvents.length
        });

    } catch (error) {
        console.error('❌ Events fetch error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch events'
        });
    }
});

// Root route
app.get('/', (req, res) => {
    res.json({
        status: 'OK',
        message: 'Warm Delights Backend is running!',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        features: ['Analytics', 'Admin Auth', 'Responsive Images', 'Contact Forms'],
        uploadDir: uploadDir,
        uploadsExists: fs.existsSync(uploadDir),
        uploadsIsDirectory: fs.existsSync(uploadDir) ? fs.statSync(uploadDir).isDirectory() : false
    });
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        activeSessions: adminSessions.size,
        totalImages: galleryImages.length
    });
});

// Menu API
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

// Enhanced gallery upload (protected) with better error handling and metadata
app.post('/api/admin/gallery/upload', authMiddleware, (req, res) => {
    console.log('📸 Admin gallery upload endpoint hit');
    
    try {
        ensureUploadsDir();
    } catch (error) {
        console.error('❌ Upload directory error:', error);
        return res.status(500).json({
            error: 'Server configuration error',
            message: 'Upload directory could not be created'
        });
    }
    
    upload.single('image')(req, res, function(err) {
        if (err) {
            console.error('❌ Multer error:', err);
            
            // Track failed upload
            analyticsEvents.push({
                type: 'admin_upload_failed',
                timestamp: new Date().toISOString(),
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
                return res.status(400).json({
                    error: 'Upload error',
                    message: err.message
                });
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

        // Enhanced image data with responsive support
        const imageData = {
            id: Date.now(),
            filename: req.file.filename,
            originalName: req.file.originalname,
            url: `/uploads/${req.file.filename}`,
            mimetype: req.file.mimetype,
            size: req.file.size,
            dimensions: null, // Could be added with image processing library
            alt: `Warm Delights ${req.file.originalname.split('.')[0]}`,
            uploadedAt: new Date(),
            uploadedBy: req.admin.username,
            isPublic: true,
            tags: [], // Could be expanded for categorization
            views: 0
        };

        galleryImages.push(imageData);

        // Track successful upload
        analyticsEvents.push({
            type: 'admin_upload_success',
            timestamp: new Date().toISOString(),
            sessionId: req.admin.sessionId,
            filename: req.file.filename,
            size: req.file.size,
            mimetype: req.file.mimetype
        });

        console.log('✅ Admin uploaded image:', imageData.filename);

        res.json({
            success: true,
            message: 'Image uploaded successfully',
            image: imageData
        });
    });
});

// Enhanced gallery images endpoint (public) with pagination and filtering
app.get('/api/gallery', (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        
        // Filter only public images and sort by upload date (newest first)
        const publicImages = galleryImages
            .filter(img => img.isPublic)
            .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
            
        const paginatedImages = publicImages.slice(startIndex, endIndex);
        
        // Return optimized image data for frontend
        const imageData = paginatedImages.map(img => ({
            id: img.id,
            filename: img.filename,
            url: img.url,
            alt: img.alt,
            size: img.size,
            uploadedAt: img.uploadedAt,
            views: img.views
        }));

        // Track gallery view
        analyticsEvents.push({
            type: 'gallery_viewed',
            timestamp: new Date().toISOString(),
            ip: req.ip,
            imagesCount: imageData.length
        });

        console.log(`🖼️ Gallery API called, returning ${imageData.length} images (page ${page})`);
        
        res.json({
            images: imageData,
            pagination: {
                current: page,
                total: Math.ceil(publicImages.length / limit),
                hasNext: endIndex < publicImages.length,
                hasPrev: page > 1,
                totalImages: publicImages.length
            }
        });
        
    } catch (error) {
        console.error('❌ Gallery error:', error);
        res.status(500).json({ error: 'Failed to load gallery' });
    }
});

// Simple images endpoint for backwards compatibility
app.get('/api/images', (req, res) => {
    try {
        const imageFilenames = galleryImages
            .filter(img => img.isPublic)
            .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
            .map(img => img.filename);

        console.log(`🖼️ Images API called, returning ${imageFilenames.length} filenames`);
        res.json(imageFilenames);
        
    } catch (error) {
        console.error('❌ Images error:', error);
        res.status(500).json({ error: 'Failed to load images' });
    }
});

// Track image views
app.get('/api/images/:filename/view', (req, res) => {
    try {
        const filename = req.params.filename;
        const image = galleryImages.find(img => img.filename === filename);
        
        if (image) {
            image.views = (image.views || 0) + 1;
            
            // Track image view
            analyticsEvents.push({
                type: 'image_view',
                timestamp: new Date().toISOString(),
                filename: filename,
                imageId: image.id,
                ip: req.ip
            });
        }
        
        res.json({ success: true, views: image ? image.views : 0 });
        
    } catch (error) {
        console.error('❌ Image view tracking error:', error);
        res.status(500).json({ error: 'View tracking failed' });
    }
});

// Enhanced delete image (protected) with better cleanup
app.delete('/api/admin/gallery/:id', authMiddleware, (req, res) => {
    try {
        const imageId = parseInt(req.params.id);
        const imageIndex = galleryImages.findIndex(img => img.id === imageId);

        if (imageIndex === -1) {
            return res.status(404).json({ 
                error: 'Image not found',
                message: 'The requested image does not exist'
            });
        }

        const image = galleryImages[imageIndex];
        const filePath = path.join(uploadDir, image.filename);

        // Delete file from filesystem
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log('✅ File deleted from filesystem:', image.filename);
            } else {
                console.log('⚠️ File not found on filesystem:', image.filename);
            }
        } catch (fileError) {
            console.error('❌ File deletion error:', fileError);
        }

        // Remove from array
        galleryImages.splice(imageIndex, 1);

        // Track deletion
        analyticsEvents.push({
            type: 'admin_image_deleted',
            timestamp: new Date().toISOString(),
            sessionId: req.admin.sessionId,
            imageId: imageId,
            filename: image.filename,
            originalName: image.originalName
        });

        console.log('✅ Admin deleted image:', image.filename);

        res.json({
            success: true,
            message: 'Image deleted successfully',
            deletedImage: {
                id: imageId,
                filename: image.filename,
                originalName: image.originalName
            }
        });
        
    } catch (error) {
        console.error('❌ Delete error:', error);
        res.status(500).json({ 
            error: 'Delete failed',
            message: 'Could not delete image'
        });
    }
});

// Orders API
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
        
        const order = {
            id: orderIdCounter++,
            customerName,
            email,
            phone,
            items: parsedItems,
            specialInstructions,
            deliveryDate,
            deliveryAddress,
            referenceImage: req.file ? req.file.filename : null,
            status: 'pending',
            totalAmount: parsedItems.reduce((total, item) => total + (item.price * item.quantity), 0),
            createdAt: new Date()
        };

        orders.push(order);

        // Track order
        analyticsEvents.push({
            type: 'order_placed',
            timestamp: new Date().toISOString(),
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
            message: 'Order placed successfully!',
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

// Get orders (protected)
app.get('/api/admin/orders', authMiddleware, (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const recentOrders = orders.slice(-limit).reverse();

        // Track order view
        analyticsEvents.push({
            type: 'admin_orders_viewed',
            timestamp: new Date().toISOString(),
            sessionId: req.admin.sessionId
        });

        res.json({
            success: true,
            orders: recentOrders,
            totalOrders: orders.length
        });

    } catch (error) {
        console.error('❌ Orders fetch error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch orders'
        });
    }
});

app.get('/api/orders/:orderId', (req, res) => {
    try {
        const orderId = parseInt(req.params.orderId.replace('WD', ''));
        const order = orders.find(o => o.id === orderId);

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        res.json({
            success: true,
            order: {
                id: `WD${order.id.toString().padStart(4, '0')}`,
                status: order.status,
                customerName: order.customerName,
                items: order.items,
                totalAmount: order.totalAmount,
                deliveryDate: order.deliveryDate,
                createdAt: order.createdAt
            }
        });
    } catch (error) {
        console.error('Get order error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve order'
        });
    }
});

// Contact form API
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
        analyticsEvents.push({
            type: 'contact_submit',
            timestamp: new Date().toISOString(),
            name: name,
            email: email
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
            message: 'Message sent successfully!'
        });
    } catch (error) {
        console.error('Contact form error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send message'
        });
    }
});

// Enhanced placeholder image generator with better styling
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
        res.send(svg);
    } catch (error) {
        console.error('Placeholder error:', error);
        res.status(500).send('Error generating placeholder');
    }
});

// Global error handler
app.use((error, req, res, next) => {
    console.error('🚨 Global error:', error);
    
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

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({ 
        error: 'Route not found',
        message: `The route ${req.originalUrl} does not exist`
    });
});

// Cleanup expired sessions (every 30 minutes)
setInterval(() => {
    const now = new Date();
    const expiredSessions = []; 
    
    adminSessions.forEach((session, sessionId) => {
        const timeDiff = now - new Date(session.loginTime);
        const hoursDiff = timeDiff / (1000 * 60 * 60);
        
        if (hoursDiff > 2) { // 2 hour expiry
            expiredSessions.push(sessionId);
        }
    });
    
    expiredSessions.forEach(sessionId => {
        adminSessions.delete(sessionId);
        console.log(`🗑️ Cleaned up expired session: ${sessionId}`);
    });
    
}, 30 * 60 * 1000); // Every 30 minutes

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Warm Delights Backend v2.0.0 running on port ${PORT}`);
    console.log(`📁 Upload directory: ${uploadDir}`);
    console.log(`🖼️ Gallery images: ${galleryImages.length}`);
    console.log(`🔐 Admin authentication enabled`);
    console.log(`📊 Analytics tracking enabled`);
    console.log(`📱 Responsive image support enabled`);
    console.log(`🚀 Features: Admin Auth, Responsive Images, Analytics, Email`);
}).on('error', (error) => {
    console.error('Server error:', error);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully');
    server.close(() => {
        console.log('Process terminated');
    });
});

module.exports = app;
