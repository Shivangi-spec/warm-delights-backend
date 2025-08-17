// Warm Delights Backend - Stable Version

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Ensure uploads folder exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
app.use('/uploads', express.static(uploadDir));

// Multer config for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname.replace(/\s/g, '_')}`;
    cb(null, uniqueName);
  }
});
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed!'), false);
  }
});

// In-memory storage for demo
let orders = [];
let orderIdCounter = 1;
let galleryImages = [];

// Set up Nodemailer if environment variables are present
let transporter = null;
if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
}

// Health check route
app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// MENU endpoint
app.get('/api/menu', (req, res) => {
  const menuItems = [
    { id: 1, name: 'Vanilla Cake', category: 'Cakes', price: 450, description: 'Classic soft, moist eggless vanilla cake', customizable: true, eggless: true },
    { id: 2, name: 'Chocolate Cake', category: 'Cakes', price: 500, description: 'Rich, decadent eggless chocolate cake', customizable: true, eggless: true },
    { id: 3, name: 'Strawberry Cake', category: 'Cakes', price: 550, description: 'Fresh strawberry eggless cake', customizable: true, eggless: true },
    { id: 4, name: 'Butterscotch Cake', category: 'Cakes', price: 550, description: 'Butterscotch delight with caramel flavoring', customizable: true, eggless: true },
    { id: 5, name: 'Peanut Butter Cookies', category: 'Cookies', price: 50, description: 'Crunchy eggless peanut butter cookies', priceUnit: 'pc', eggless: true, customizable: false },
    { id: 6, name: 'Chocolate Cookies', category: 'Cookies', price: 40, description: 'Soft eggless chocolate cookies', priceUnit: 'pc', eggless: true, customizable: false },
    { id: 7, name: 'Almond Cookies', category: 'Cookies', price: 45, description: 'Crunchy almond cookies', priceUnit: 'pc', eggless: true, customizable: false },
    { id: 8, name: 'Butter Cream Cookies', category: 'Cookies', price: 30, description: 'Smooth butter cream cookies', priceUnit: 'pc', eggless: true, customizable: false },
    { id: 9, name: 'Chocolate Cupcakes', category: 'Cupcakes', price: 40, description: 'Moist chocolate cupcakes with frosting', priceUnit: 'pc', eggless: true, customizable: true },
    { id: 10, name: 'Whole Wheat Banana Muffins', category: 'Cupcakes', price: 35, description: 'Healthy whole wheat banana muffins', priceUnit: 'pc', eggless: true, customizable: false },
    { id: 11, name: 'Cheesecake Cupcakes', category: 'Cupcakes', price: 55, description: 'Creamy cheesecake cupcakes', priceUnit: 'pc', eggless: true, customizable: true }
  ];
  res.json(menuItems);
});

// Place an order (demo)
app.post('/api/orders', upload.single('referenceImage'), async (req, res) => {
  try {
    const { customerName, email, phone, items, specialInstructions, deliveryDate, deliveryAddress } = req.body;
    const parsedItems = JSON.parse(items);
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

    if (transporter) {
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Order Confirmation - Warm Delights',
        html: `
          <h2>Thank you for your order!</h2>
          <p>Dear ${customerName},</p>
          <p>We've received your order and will begin preparing it soon.</p>
          <h3>Order Details:</h3>
          <p><strong>Order ID:</strong> WD${order.id.toString().padStart(4, '0')}</p>
          <p><strong>Delivery Date:</strong> ${deliveryDate}</p>
          <p><strong>Total Amount:</strong> ₹${order.totalAmount}</p>
          <h4>Items:</h4>
          <ul>
            ${parsedItems.map(item => `<li>${item.quantity}x ${item.name} - ₹${item.price * item.quantity}</li>`).join('')}
          </ul>
          <p>We'll contact you if we need any clarification on your order.</p>
          <p>Thank you for choosing Warm Delights!</p>
        `
      };
      await transporter.sendMail(mailOptions);
    }
    res.status(201).json({ success: true, message: 'Order placed successfully!', orderId: `WD${order.id.toString().padStart(4, '0')}` });
  } catch (error) {
    console.error('Error placing order:', error);
    res.status(500).json({ success: false, message: 'Failed to place order. Please try again.' });
  }
});

// Get order status
app.get('/api/orders/:orderId', (req, res) => {
  const orderId = parseInt(req.params.orderId.replace('WD', ''));
  const order = orders.find(o => o.id === orderId);
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
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
});

// Contact form
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, phone, message } = req.body;
    if (!name || !email || !message) {
      return res.status(400).json({ success: false, message: 'Name, email and message are required' });
    }
    if (transporter) {
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
    }
    res.json({ success: true, message: 'Message sent successfully!' });
  } catch (error) {
    console.error('Contact form error:', error);
    res.status(500).json({ success: false, message: 'Failed to send message. Please try again.' });
  }
});

// Gallery upload
app.post('/api/gallery/upload', upload.single('image'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const imageData = {
      id: Date.now(),
      filename: req.file.filename,
      originalName: req.file.originalname,
      url: `/uploads/${req.file.filename}`,
      uploadedAt: new Date()
    };
    galleryImages.push(imageData);
    res.json({ message: 'Image uploaded successfully', image: imageData });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Gallery get
app.get('/api/gallery', (req, res) => {
  try {
    res.json(galleryImages);
  } catch (error) {
    console.error('Gallery error:', error);
    res.status(500).json({ error: 'Failed to load gallery' });
  }
});

// Gallery delete
app.delete('/api/gallery/:id', (req, res) => {
  try {
    const imageId = parseInt(req.params.id);
    const imageIndex = galleryImages.findIndex(img => img.id === imageId);
    if (imageIndex === -1) return res.status(404).json({ error: 'Image not found' });
    const image = galleryImages[imageIndex];
    const filePath = path.join(uploadDir, image.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    galleryImages.splice(imageIndex, 1);
    res.json({ message: 'Image deleted successfully' });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Delete failed' });
  }
});

// Menu placeholder image for demo
app.get('/api/placeholder/:width/:height', (req, res) => {
  try {
    const { width, height } = req.params;
    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#e8a5b7"/>
        <text x="50%" y="50%" font-family="Arial" font-size="16" fill="#4a2e38" text-anchor="middle" dy=".3em">
          Warm Delights
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
  console.error('Global error handler:', error);
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File too large' });
  }
  res.status(500).json({ error: 'Something went wrong' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
