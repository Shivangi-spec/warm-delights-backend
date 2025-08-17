// Minimal Warm Delights Backend - Crash-Resistant Version

const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

// Basic middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Basic error handler to prevent crashes
process.on('uncaughtException', (err) => {
  console.log('Uncaught Exception:', err.message);
});

process.on('unhandledRejection', (reason, promise) => {
  console.log('Unhandled Rejection:', reason);
});

// Health check route
app.get('/', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Warm Delights Backend is running!',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// Menu route - simplified
app.get('/api/menu', (req, res) => {
  try {
    const menuItems = [
      // Cakes
      {
        id: 1,
        name: 'Vanilla Cake',
        category: 'Cakes',
        price: 450.00,
        description: 'Classic soft, moist eggless vanilla cake',
        customizable: true,
        eggless: true
      },
      {
        id: 2,
        name: 'Chocolate Cake',
        category: 'Cakes',
        price: 500.00,
        description: 'Rich, decadent eggless chocolate cake',
        customizable: true,
        eggless: true
      },
      {
        id: 3,
        name: 'Strawberry Cake',
        category: 'Cakes',
        price: 550.00,
        description: 'Fresh strawberry eggless cake',
        customizable: true,
        eggless: true
      },
      {
        id: 4,
        name: 'Butterscotch Cake',
        category: 'Cakes',
        price: 550.00,
        description: 'Butterscotch delight with caramel flavoring',
        customizable: true,
        eggless: true
      },
      // Cookies
      {
        id: 5,
        name: 'Peanut Butter Cookies',
        category: 'Cookies',
        price: 50,
        description: 'Crunchy eggless peanut butter cookies',
        customizable: false,
        priceUnit: 'pc',
        eggless: true
      },
      {
        id: 6,
        name: 'Chocolate Cookies',
        category: 'Cookies',
        price: 40,
        description: 'Soft eggless chocolate cookies',
        customizable: false,
        priceUnit: 'pc',
        eggless: true
      },
      {
        id: 7,
        name: 'Almond Cookies',
        category: 'Cookies',
        price: 45,
        description: 'Crunchy almond cookies',
        customizable: false,
        priceUnit: 'pc',
        eggless: true
      },
      {
        id: 8,
        name: 'Butter Cream Cookies',
        category: 'Cookies',
        price: 30,
        description: 'Smooth butter cream cookies',
        customizable: false,
        priceUnit: 'pc',
        eggless: true
      },
      // Cupcakes
      {
        id: 9,
        name: 'Chocolate Cupcakes',
        category: 'Cupcakes',
        price: 40,
        description: 'Moist chocolate cupcakes with frosting',
        customizable: true,
        priceUnit: 'pc',
        eggless: true
      },
      {
        id: 10,
        name: 'Whole Wheat Banana Muffins',
        category: 'Cupcakes',
        price: 35,
        description: 'Healthy whole wheat banana muffins',
        customizable: false,
        priceUnit: 'pc',
        eggless: true
      },
      {
        id: 11,
        name: 'Cheesecake Cupcakes',
        category: 'Cupcakes',
        price: 55,
        description: 'Creamy cheesecake cupcakes',
        customizable: true,
        priceUnit: 'pc',
        eggless: true
      }
    ];
    
    res.json(menuItems);
  } catch (error) {
    console.log('Menu error:', error.message);
    res.status(500).json({ error: 'Menu temporarily unavailable' });
  }
});

// Simple contact route
app.post('/api/contact', (req, res) => {
  try {
    const { name, email, message } = req.body;
    
    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and message are required'
      });
    }
    
    console.log('Contact form submission:', { name, email, message });
    
    res.json({
      success: true,
      message: 'Message received! We will contact you soon.'
    });
  } catch (error) {
    console.log('Contact error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to send message'
    });
  }
});

// Simple gallery route (without file upload for now)
app.get('/api/gallery', (req, res) => {
  try {
    res.json([]);
  } catch (error) {
    console.log('Gallery error:', error.message);
    res.status(500).json({ error: 'Gallery temporarily unavailable' });
  }
});

// Global error handler
app.use((error, req, res, next) => {
  console.log('Global error:', error.message);
  res.status(500).json({ 
    error: 'Something went wrong',
    message: 'Please try again later'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
}).on('error', (error) => {
  console.log('❌ Server error:', error.message);
});
