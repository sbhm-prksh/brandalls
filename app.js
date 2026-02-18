const path = require('path');
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { db, initDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

initDb();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  session({
    store: new SQLiteStore({ db: 'sessions.db', dir: __dirname }),
    secret: 'brandall-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 8 }
  })
);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'public/uploads')),
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${safeName}`);
  }
});
const upload = multer({ storage });

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function setFlash(req, type, message) {
  req.session.flash = { type, message };
}

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
});

function requireLogin(req, res, next) {
  if (!req.session.user) {
    setFlash(req, 'error', 'Please log in to continue.');
    return res.redirect('/login');
  }
  next();
}

function requireShop(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'shop') {
    setFlash(req, 'error', 'Shop owner access required.');
    return res.redirect('/');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    setFlash(req, 'error', 'Admin access required.');
    return res.redirect('/');
  }
  next();
}

async function seedAdminAndProducts() {
  const admin = await dbGet('SELECT id FROM users WHERE role = ?', ['admin']);
  if (!admin) {
    const passwordHash = await bcrypt.hash('Admin@123', 10);
    await dbRun(
      `INSERT INTO users (shop_name, owner_name, email, phone, gst, password_hash, role, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'admin', datetime('now'))`,
      ['Brandall HQ', 'System Admin', 'admin@brandall.com', '0000000000', 'GST-ADMIN-000', passwordHash]
    );
  }

  const countRow = await dbGet('SELECT COUNT(*) as count FROM products');
  if (countRow.count === 0) {
    const samples = [
      {
        name: 'Paracetamol 500mg',
        brand: 'MedCare',
        category: 'Analgesic',
        description: 'Pain relief and fever reducer tablets.',
        price: 1.25,
        stock_qty: 5000,
        expiry_date: '2027-06-30'
      },
      {
        name: 'Amoxicillin 250mg',
        brand: 'HealthCore',
        category: 'Antibiotic',
        description: 'Broad-spectrum antibiotic capsules.',
        price: 3.5,
        stock_qty: 2500,
        expiry_date: '2026-12-31'
      },
      {
        name: 'Cetirizine 10mg',
        brand: 'AllerFree',
        category: 'Antihistamine',
        description: 'Allergy relief tablets.',
        price: 2.1,
        stock_qty: 3200,
        expiry_date: '2027-03-31'
      }
    ];

    for (const item of samples) {
      await dbRun(
        `INSERT INTO products (name, brand, category, description, price, stock_qty, expiry_date, image_path, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [
          item.name,
          item.brand,
          item.category,
          item.description,
          item.price,
          item.stock_qty,
          item.expiry_date,
          null
        ]
      );
    }
  }
}

seedAdminAndProducts().catch((err) => console.error('Seed error', err));

app.get('/', (req, res) => {
  res.render('index', { title: 'Brandall Brands' });
});

app.get('/about', (req, res) => {
  res.render('about', { title: 'About - Brandall Brands' });
});

app.get('/services', (req, res) => {
  res.render('services', { title: 'Services - Brandall Brands' });
});

app.get('/contact', (req, res) => {
  res.render('contact', { title: 'Contact - Brandall Brands' });
});

app.post('/contact', async (req, res) => {
  const { name, email, phone, message } = req.body;
  if (!name || !email || !message) {
    setFlash(req, 'error', 'Please fill in all required fields.');
    return res.redirect('/contact');
  }
  await dbRun(
    `INSERT INTO contacts (name, email, phone, message, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))`,
    [name, email, phone || '', message]
  );
  setFlash(req, 'success', 'Thanks! We will reach out shortly.');
  res.redirect('/contact');
});

app.get('/register', (req, res) => {
  res.render('register', { title: 'Register - Brandall Brands' });
});

app.post('/register', async (req, res) => {
  const { shop_name, owner_name, email, phone, gst, password } = req.body;
  if (!shop_name || !owner_name || !email || !phone || !gst || !password) {
    setFlash(req, 'error', 'Please fill in all fields.');
    return res.redirect('/register');
  }
  const existing = await dbGet('SELECT id FROM users WHERE email = ?', [email]);
  if (existing) {
    setFlash(req, 'error', 'Email already registered.');
    return res.redirect('/register');
  }
  const passwordHash = await bcrypt.hash(password, 10);
  await dbRun(
    `INSERT INTO users (shop_name, owner_name, email, phone, gst, password_hash, role, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'shop', datetime('now'))`,
    [shop_name, owner_name, email, phone, gst, passwordHash]
  );
  setFlash(req, 'success', 'Registration successful. Please log in.');
  res.redirect('/login');
});

app.get('/login', (req, res) => {
  res.render('login', { title: 'Login - Brandall Brands' });
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await dbGet('SELECT * FROM users WHERE email = ?', [email]);
  if (!user) {
    setFlash(req, 'error', 'Invalid email or password.');
    return res.redirect('/login');
  }
  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    setFlash(req, 'error', 'Invalid email or password.');
    return res.redirect('/login');
  }
  req.session.user = {
    id: user.id,
    shop_name: user.shop_name,
    owner_name: user.owner_name,
    email: user.email,
    role: user.role
  };
  res.redirect(user.role === 'admin' ? '/admin' : '/medicines');
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

app.get('/medicines', async (req, res) => {
  const search = req.query.search ? `%${req.query.search.trim()}%` : null;
  const products = search
    ? await dbAll(
        `SELECT * FROM products WHERE name LIKE ? OR brand LIKE ? OR category LIKE ? ORDER BY created_at DESC`,
        [search, search, search]
      )
    : await dbAll(`SELECT * FROM products ORDER BY created_at DESC`);
  res.render('medicines', { title: 'Medicines - Brandall Brands', products, search: req.query.search || '' });
});

app.post('/cart/add', requireShop, async (req, res) => {
  const productId = parseInt(req.body.product_id, 10);
  const quantity = parseInt(req.body.quantity || '1', 10);
  const product = await dbGet('SELECT * FROM products WHERE id = ?', [productId]);
  if (!product) {
    setFlash(req, 'error', 'Product not found.');
    return res.redirect('/medicines');
  }
  const cart = req.session.cart || { items: [] };
  const existing = cart.items.find((item) => item.productId === productId);
  if (existing) {
    existing.quantity += quantity;
  } else {
    cart.items.push({ productId, quantity });
  }
  req.session.cart = cart;
  setFlash(req, 'success', 'Added to cart.');
  res.redirect('/medicines');
});

app.get('/cart', requireShop, async (req, res) => {
  const cart = req.session.cart || { items: [] };
  const productIds = cart.items.map((item) => item.productId);
  let products = [];
  if (productIds.length > 0) {
    const placeholders = productIds.map(() => '?').join(',');
    products = await dbAll(`SELECT * FROM products WHERE id IN (${placeholders})`, productIds);
  }
  const detailedItems = cart.items.map((item) => {
    const product = products.find((p) => p.id === item.productId);
    const price = product ? product.price : 0;
    return {
      product,
      quantity: item.quantity,
      lineTotal: price * item.quantity
    };
  });
  const total = detailedItems.reduce((sum, item) => sum + item.lineTotal, 0);
  res.render('cart', { title: 'Your Cart', items: detailedItems, total });
});

app.post('/cart/update', requireShop, (req, res) => {
  const updates = Array.isArray(req.body.quantity)
    ? req.body.quantity
    : [req.body.quantity];
  const productIds = Array.isArray(req.body.product_id)
    ? req.body.product_id
    : [req.body.product_id];

  const cart = { items: [] };
  for (let i = 0; i < productIds.length; i += 1) {
    const productId = parseInt(productIds[i], 10);
    const quantity = parseInt(updates[i], 10);
    if (quantity > 0) {
      cart.items.push({ productId, quantity });
    }
  }
  req.session.cart = cart;
  setFlash(req, 'success', 'Cart updated.');
  res.redirect('/cart');
});

app.post('/orders/place', requireShop, async (req, res) => {
  const cart = req.session.cart || { items: [] };
  if (!cart.items.length) {
    setFlash(req, 'error', 'Your cart is empty.');
    return res.redirect('/cart');
  }

  const productIds = cart.items.map((item) => item.productId);
  const placeholders = productIds.map(() => '?').join(',');
  const products = await dbAll(`SELECT * FROM products WHERE id IN (${placeholders})`, productIds);

  const items = cart.items.map((item) => {
    const product = products.find((p) => p.id === item.productId);
    return {
      product,
      quantity: item.quantity,
      lineTotal: product ? product.price * item.quantity : 0
    };
  });

  const total = items.reduce((sum, item) => sum + item.lineTotal, 0);

  const orderResult = await dbRun(
    `INSERT INTO orders (user_id, total_price, status, created_at)
     VALUES (?, ?, 'Pending', datetime('now'))`,
    [req.session.user.id, total]
  );

  const orderId = orderResult.lastID;

  for (const item of items) {
    if (!item.product) continue;
    await dbRun(
      `INSERT INTO order_items (order_id, product_id, quantity, price)
       VALUES (?, ?, ?, ?)`,
      [orderId, item.product.id, item.quantity, item.product.price]
    );
    await dbRun(`UPDATE products SET stock_qty = stock_qty - ? WHERE id = ?`, [
      item.quantity,
      item.product.id
    ]);
  }

  req.session.cart = { items: [] };

  console.log('Order notification email (mock):', {
    orderId,
    shop: req.session.user.shop_name,
    email: req.session.user.email,
    total
  });

  res.render('order_success', {
    title: 'Order Placed',
    orderId,
    items,
    total,
    whatsappLink: buildWhatsAppLink(orderId, items, total)
  });
});

app.get('/account', requireShop, (req, res) => {
  res.render('account', { title: 'My Account' });
});

app.get('/orders', requireShop, async (req, res) => {
  const orders = await dbAll(
    `SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC`,
    [req.session.user.id]
  );
  res.render('orders', { title: 'My Orders', orders });
});

app.get('/orders/:id', requireShop, async (req, res) => {
  const order = await dbGet(
    `SELECT * FROM orders WHERE id = ? AND user_id = ?`,
    [req.params.id, req.session.user.id]
  );
  if (!order) {
    setFlash(req, 'error', 'Order not found.');
    return res.redirect('/orders');
  }
  const items = await dbAll(
    `SELECT order_items.*, products.name FROM order_items
     JOIN products ON order_items.product_id = products.id
     WHERE order_items.order_id = ?`,
    [req.params.id]
  );
  const whatsappLink = buildWhatsAppLink(order.id, items.map((item) => ({
    product: { name: item.name },
    quantity: item.quantity
  })), order.total_price);
  res.render('order_detail', { title: `Order #${order.id}`, order, items, whatsappLink });
});

function buildWhatsAppLink(orderId, items, total) {
  const summaryLines = items
    .filter((item) => item.product)
    .map((item) => `${item.product.name} x${item.quantity}`);
  const message = `Brandall Brands Order #${orderId}\n${summaryLines.join('\n')}\nTotal: ${total.toFixed(2)}`;
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

app.get('/admin', requireAdmin, async (req, res) => {
  const userCount = await dbGet('SELECT COUNT(*) as count FROM users WHERE role = ?', ['shop']);
  const orderCount = await dbGet('SELECT COUNT(*) as count FROM orders');
  const productCount = await dbGet('SELECT COUNT(*) as count FROM products');
  res.render('admin/dashboard', {
    title: 'Admin Dashboard',
    stats: {
      users: userCount.count,
      orders: orderCount.count,
      products: productCount.count
    }
  });
});

app.get('/admin/products', requireAdmin, async (req, res) => {
  const products = await dbAll('SELECT * FROM products ORDER BY created_at DESC');
  res.render('admin/products', { title: 'Manage Products', products });
});

app.get('/admin/products/new', requireAdmin, (req, res) => {
  res.render('admin/product_form', { title: 'Add Product', product: null });
});

app.post('/admin/products/new', requireAdmin, upload.single('image'), async (req, res) => {
  const { name, brand, category, description, price, stock_qty, expiry_date } = req.body;
  const imagePath = req.file ? `/uploads/${req.file.filename}` : null;
  await dbRun(
    `INSERT INTO products (name, brand, category, description, price, stock_qty, expiry_date, image_path, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [name, brand, category, description, parseFloat(price), parseInt(stock_qty, 10), expiry_date, imagePath]
  );
  setFlash(req, 'success', 'Product added.');
  res.redirect('/admin/products');
});

app.get('/admin/products/:id/edit', requireAdmin, async (req, res) => {
  const product = await dbGet('SELECT * FROM products WHERE id = ?', [req.params.id]);
  if (!product) {
    setFlash(req, 'error', 'Product not found.');
    return res.redirect('/admin/products');
  }
  res.render('admin/product_form', { title: 'Edit Product', product });
});

app.post('/admin/products/:id/edit', requireAdmin, upload.single('image'), async (req, res) => {
  const { name, brand, category, description, price, stock_qty, expiry_date, current_image } = req.body;
  const imagePath = req.file ? `/uploads/${req.file.filename}` : current_image || null;
  await dbRun(
    `UPDATE products SET name = ?, brand = ?, category = ?, description = ?, price = ?, stock_qty = ?, expiry_date = ?, image_path = ?
     WHERE id = ?`,
    [
      name,
      brand,
      category,
      description,
      parseFloat(price),
      parseInt(stock_qty, 10),
      expiry_date,
      imagePath,
      req.params.id
    ]
  );
  setFlash(req, 'success', 'Product updated.');
  res.redirect('/admin/products');
});

app.post('/admin/products/:id/delete', requireAdmin, async (req, res) => {
  await dbRun('DELETE FROM products WHERE id = ?', [req.params.id]);
  setFlash(req, 'success', 'Product deleted.');
  res.redirect('/admin/products');
});

app.get('/admin/orders', requireAdmin, async (req, res) => {
  const orders = await dbAll(
    `SELECT orders.*, users.shop_name, users.email FROM orders
     JOIN users ON orders.user_id = users.id
     ORDER BY orders.created_at DESC`
  );
  res.render('admin/orders', { title: 'Manage Orders', orders });
});

app.get('/admin/orders/:id', requireAdmin, async (req, res) => {
  const order = await dbGet(
    `SELECT orders.*, users.shop_name, users.email FROM orders
     JOIN users ON orders.user_id = users.id
     WHERE orders.id = ?`,
    [req.params.id]
  );
  if (!order) {
    setFlash(req, 'error', 'Order not found.');
    return res.redirect('/admin/orders');
  }
  const items = await dbAll(
    `SELECT order_items.*, products.name FROM order_items
     JOIN products ON order_items.product_id = products.id
     WHERE order_items.order_id = ?`,
    [req.params.id]
  );
  res.render('admin/order_detail', {
    title: `Order #${order.id}`,
    order,
    items,
    whatsappLink: buildWhatsAppLink(order.id, items.map((item) => ({
      product: { name: item.name },
      quantity: item.quantity
    })), order.total_price)
  });
});

app.post('/admin/orders/:id/status', requireAdmin, async (req, res) => {
  const { status } = req.body;
  await dbRun('UPDATE orders SET status = ? WHERE id = ?', [status, req.params.id]);
  setFlash(req, 'success', 'Order status updated.');
  res.redirect(`/admin/orders/${req.params.id}`);
});

app.get('/admin/users', requireAdmin, async (req, res) => {
  const users = await dbAll(
    `SELECT id, shop_name, owner_name, email, phone, gst, created_at FROM users WHERE role = 'shop'
     ORDER BY created_at DESC`
  );
  res.render('admin/users', { title: 'Registered Shops', users });
});

app.get('/admin/messages', requireAdmin, async (req, res) => {
  const messages = await dbAll(
    `SELECT * FROM contacts ORDER BY created_at DESC`
  );
  res.render('admin/messages', { title: 'Contact Messages', messages });
});

app.listen(PORT, () => {
  console.log(`Brandall Brands MVP running on http://localhost:${PORT}`);
});
