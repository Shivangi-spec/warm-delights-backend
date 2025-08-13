console.log('Starting server...');


const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const multer = require('multer');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage: storage });

// In-memory storage for orders (replace with database in production)
let orders = [];
let orderIdCounter = 1;

// Email configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});



// Routes

// Get all menu items
app.get('/api/menu', (req, res) => {
  const menuItems = [
    {
      id: 1,
      name: 'Custom Birthday Cake',
      category: 'Custom Cakes',
      price: 25,
      description: 'Personalized birthday cakes with custom decorations',
      image: '/api/placeholder/300/200',
      customizable: true
    },
    {
      id: 2,
      name: 'Chocolate Chip Cookies',
      category: 'Cookies',
      price: 12,
      description: 'Classic cookies with premium chocolate chips',
      image: '/api/placeholder/300/200',
      customizable: false
    },
    {
      id: 3,
      name: 'Vanilla Cupcakes',
      category: 'Cupcakes',
      price: 18,
      description: 'Fluffy vanilla cupcakes with buttercream frosting',
      image: '/api/placeholder/300/200',
      customizable: true
    },
    {
      id: 4,
      name: 'Wedding Cake',
      category: 'Custom Cakes',
      price: 150,
      description: 'Multi-tier wedding cakes with elegant designs',
      image: '/api/placeholder/300/200',
      customizable: true
    },
    {
      id: 5,
      name: 'Brownies',
      category: 'Specialty Desserts',
      price: 15,
      description: 'Rich, fudgy brownies with optional nuts',
      image: '/api/placeholder/300/200',
      customizable: false
    },
    {
      id: 6,
      name: 'Red Velvet Cake',
      category: 'Custom Cakes',
      price: 30,
      description: 'Classic red velvet with cream cheese frosting',
      image: '/api/placeholder/300/200',
      customizable: true
    }
  ];
  
  res.json(menuItems);
});

// Place an order
app.post('/api/orders', upload.single('referenceImage'), async (req, res) => {
  try {
    const {
      customerName,
      email,
      phone,
      items,
      specialInstructions,
      deliveryDate,
      deliveryAddress
    } = req.body;

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

    // Send confirmation email
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
        <p><strong>Total Amount:</strong> $${order.totalAmount}</p>
        <h4>Items:</h4>
        <ul>
          ${parsedItems.map(item => `<li>${item.quantity}x ${item.name} - $${item.price * item.quantity}</li>`).join('')}
        </ul>
        <p>We'll contact you if we need any clarification on your order.</p>
        <p>Thank you for choosing Warm Delights!</p>
      `
    };

    await transporter.sendMail(mailOptions);

    res.status(201).json({
      success: true,
      message: 'Order placed successfully!',
      orderId: `WD${order.id.toString().padStart(4, '0')}`
    });

  } catch (error) {
    console.error('Error placing order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to place order. Please try again.'
    });
  }
});

// Get order status
app.get('/api/orders/:orderId', (req, res) => {
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
});

// Contact form
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, message } = req.body;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER,
      subject: 'New Contact Form Submission - Warm Delights',
      html: `
        <h3>New Contact Form Submission</h3>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Message:</strong></p>
        <p>${message}</p>
      `
    };

    await transporter.sendMail(mailOptions);

    res.json({
      success: true,
      message: 'Message sent successfully!'
    });

  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message. Please try again.'
    });
  }
});

// Placeholder image endpoint
app.get('/api/placeholder/:width/:height', (req, res) => {
  const { width, height } = req.params;
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#d4c4a8"/>
      <text x="50%" y="50%" font-family="Arial" font-size="16" fill="#8d6e63" text-anchor="middle" dy=".3em">
        ${width}×${height}
      </text>
    </svg>
  `;
  
  res.setHeader('Content-Type', 'image/svg+xml');
  res.send(svg);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
