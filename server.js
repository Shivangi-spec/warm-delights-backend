const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Load environment variables safely
try {
    require('dotenv').config();
} catch (error) {
    console.log('dotenv not available, using environment variables directly');
}

const app = express();
const PORT = process.env.PORT || 5000;

// Enhanced CORS configuration
app.use(cors({
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST', 'DELETE', 'PUT', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Access-Control-Allow-Origin'],
    optionsSuccessStatus: 200
}));

// Add preflight handling
app.options('*', cors());

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// **FIXED: Create uploads directory with proper error handling**
const uploadDir = path.join(__dirname, 'uploads');
console.log('🗂️ Upload directory path:', uploadDir);

// Function to ensure uploads directory exists
function ensureUploadsDir() {
    try {
        // Check if uploads exists as a file (this causes ENOTDIR)
        if (fs.existsSync(uploadDir)) {
            const stats = fs.statSync(uploadDir);
            if (stats.isFile()) {
                console.log('❌ "uploads" exists as a FILE, removing it...');
                fs.unlinkSync(uploadDir); // Remove the file
            } else if (stats.isDirectory()) {
                console.log('✅ Uploads directory already exists');
                return;
            }
        }
        
        // Create the directory
        fs.mkdirSync(uploadDir, { recursive: true });
        console.log('✅ Uploads directory created:', uploadDir);
        
        // Verify it was created successfully
        if (fs.existsSync(uploadDir) && fs.statSync(uploadDir).isDirectory()) {
            console.log('✅ Directory verification successful');
        } else {
            throw new Error('Directory creation verification failed');
        }
        
    } catch (error) {
        console.error('❌ Error creating uploads directory:', error);
        throw error;
    }
}

// **ENSURE UPLOADS DIRECTORY EXISTS BEFORE STARTING**
ensureUploadsDir();

// Serve static files
app.use('/uploads', express.static(uploadDir));

// **FIXED MULTER CONFIGURATION**
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        console.log('📁 Multer destination called');
        
        // Double-check directory exists before each upload
        try {
            ensureUploadsDir();
            console.log('📁 Using destination:', uploadDir);
            cb(null, uploadDir);
        } catch (error) {
            console.error('❌ Destination error:', error);
            cb(error);
        }
    },
    filename: function (req, file, cb) {
        // Create safe filename without special characters
        const timestamp = Date.now();
        const random = Math.round(Math.random() * 1E9);
        const extension = path.extname(file.originalname);
        const safeName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
        const uniqueName = `${timestamp}-${random}-${safeName}`;
        
        console.log('📝 Generated filename:', uniqueName);
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    limits: { 
        fileSize: 10 * 1024 * 1024, // 10MB limit
        files: 1 
    },
    fileFilter: function (req, file, cb) {
        console.log('🔍 File filter check:', {
            fieldname: file.fieldname,
            originalname: file.originalname,
            mimetype: file.mimetype
        });
        
        if (file.mimetype.startsWith('image/')) {
            console.log('✅ File type accepted');
            cb(null, true);
        } else {
            console.log('❌ File type rejected');
            cb(new Error(`Invalid file type: ${file.mimetype}. Only images are allowed.`), false);
        }
    }
});

// Data storage
let orders = [];
let orderIdCounter = 1;
let galleryImages = [];

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

// Root route
app.get('/', (req, res) => {
    res.json({
        status: 'OK',
        message: 'Warm Delights Backend is running!',
        timestamp: new Date().toISOString(),
        uploadDir: uploadDir,
        uploadsExists: fs.existsSync(uploadDir),
        uploadsIsDirectory: fs.existsSync(uploadDir) ? fs.statSync(uploadDir).isDirectory() : false
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'healthy' });
});

// Menu API
app.get('/api/menu', (req, res) => {
    console.log('📋 Menu API called');
    
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
                image: '/api/placeholder/300/200'
            },
            {
                id: 5,
                name: 'Peanut Butter Cookies',
                category: 'Cookies',
                price: 50,
                description: 'Crunchy eggless peanut butter cookies with rich nutty flavor',
                customizable: false,
                priceUnit: 'pc',
                eggless: true,
                image: '/api/placeholder/300/200'
            },
            {
                id: 6,
                name: 'Chocolate Cookies',
                category: 'Cookies',
                price: 40,
                description: 'Soft eggless chocolate cookies loaded with chocolate chips',
                customizable: false,
                priceUnit: 'pc',
                eggless: true,
                image: '/api/placeholder/300/200'
            },
            {
                id: 7,
                name: 'Almond Cookies',
                category: 'Cookies',
                price: 45,
                description: 'Crunchy almond cookies with real almond pieces',
                customizable: false,
                priceUnit: 'pc',
                eggless: true,
                image: '/api/placeholder/300/200'
            },
            {
                id: 8,
                name: 'Butter Cream Cookies',
                category: 'Cookies',
                price: 30,
                description: 'Smooth butter cream cookies that melt in your mouth',
                customizable: false,
                priceUnit: 'pc',
                eggless: true,
                image: '/api/placeholder/300/200'
            },
            {
                id: 9,
                name: 'Chocolate Cupcakes',
                category: 'Cupcakes',
                price: 40,
                description: 'Moist chocolate cupcakes with creamy frosting',
                customizable: true,
                priceUnit: 'pc',
                eggless: true,
                image: '/api/placeholder/300/200'
            },
            {
                id: 10,
                name: 'Whole Wheat Banana Muffins',
                category: 'Cupcakes',
                price: 35,
                description: 'Healthy whole wheat banana muffins with real banana chunks',
                customizable: false,
                priceUnit: 'pc',
                eggless: true,
                image: '/api/placeholder/300/200'
            },
            {
                id: 11,
                name: 'Cheesecake Cupcakes',
                category: 'Cupcakes',
                price: 55,
                description: 'Creamy cheesecake cupcakes with graham cracker base',
                customizable: true,
                priceUnit: 'pc',
                eggless: true,
                image: '/api/placeholder/300/200'
            }
        ];

        res.json(menuItems);
    } catch (error) {
        console.error('❌ Menu error:', error);
        res.status(500).json({ error: 'Failed to load menu' });
    }
});

// **FIXED GALLERY UPLOAD API**
app.post('/api/gallery/upload', (req, res) => {
    console.log('📸 Gallery upload endpoint hit');
    
    // Ensure uploads directory exists before processing
    try {
        ensureUploadsDir();
    } catch (error) {
        console.error('❌ Upload directory error:', error);
        return res.status(500).json({
            error: 'Server configuration error',
            message: 'Upload directory could not be created'
        });
    }
    
    // Process upload
    upload.single('image')(req, res, function(err) {
        if (err) {
            console.error('❌ Multer error:', err);
            
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

        console.log('✅ File uploaded:', {
            filename: req.file.filename,
            path: req.file.path,
            size: req.file.size
        });

        const imageData = {
            id: Date.now(),
            filename: req.file.filename,
            originalName: req.file.originalname,
            url: `/uploads/${req.file.filename}`,
            mimetype: req.file.mimetype,
            size: req.file.size,
            uploadedAt: new Date()
        };

        galleryImages.push(imageData);

        res.json({
            success: true,
            message: 'Image uploaded successfully',
            image: imageData
        });
    });
});

// Get gallery images
app.get('/api/gallery', (req, res) => {
    console.log('🖼️ Gallery API called, returning', galleryImages.length, 'images');
    res.json(galleryImages);
});

// Delete image
app.delete('/api/gallery/:id', (req, res) => {
    try {
        const imageId = parseInt(req.params.id);
        const imageIndex = galleryImages.findIndex(img => img.id === imageId);

        if (imageIndex === -1) {
            return res.status(404).json({ error: 'Image not found' });
        }

        const image = galleryImages[imageIndex];
        const filePath = path.join(uploadDir, image.filename);

        // Delete file from filesystem
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log('✅ File deleted from filesystem');
            }
        } catch (fileError) {
            console.error('❌ File deletion error:', fileError);
        }

        // Remove from array
        galleryImages.splice(imageIndex, 1);

        res.json({
            success: true,
            message: 'Image deleted successfully'
        });
    } catch (error) {
        console.error('❌ Delete error:', error);
        res.status(500).json({ error: 'Delete failed' });
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

// Placeholder image generator
app.get('/api/placeholder/:width/:height', (req, res) => {
    try {
        const { width, height } = req.params;
        const svg = `
            <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
                <rect width="${width}" height="${height}" fill="#f4c2c2"/>
                <text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="#d67b8a" font-family="Arial" font-size="20">
                    🧁 Warm Delights
                </text>
            </svg>
        `;
        
        res.setHeader('Content-Type', 'image/svg+xml');
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
    res.status(404).json({ error: 'Route not found' });
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Warm Delights Backend running on port ${PORT}`);
    console.log(`📁 Upload directory: ${uploadDir}`);
    console.log(`📂 Directory exists: ${fs.existsSync(uploadDir)}`);
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
