# Brandall Brands MVP

MVP website for the pharmaceutical wholesaler **Brandall Brands**. Includes a public marketing site, shop-owner registration/login, online ordering, and an admin dashboard to manage products and orders.

## Features
- Public pages: Home, About, Services, Contact
- Shop owner registration and login
- Medicines catalog with search
- Cart and order placement
- Admin dashboard
  - Manage products (add/edit/delete + image upload)
  - View orders and update status (Pending/Confirmed/Dispatched)
  - View registered shops
- WhatsApp message link for order summaries
- Mock email notification logged to server console

## Tech Stack
- Node.js + Express
- SQLite (local database)
- EJS templates

## Setup
1. Install dependencies:

```bash
npm install
```

2. Start the server:

```bash
npm start
```

3. Open the app:

```
http://localhost:3000
```

## Admin Account (Seeded)
- Email: `admin@brandall.com`
- Password: `Admin@123`

## Sample Medicines
Three sample medicines are seeded on first run:
- Paracetamol 500mg
- Amoxicillin 250mg
- Cetirizine 10mg

## Notes
- Database file: `brandall.db`
- Uploads folder: `public/uploads`
- Email notifications are logged to the console (no SMTP setup in this MVP).

## Basic VPS Deployment
- Install Node.js 18+
- Copy project to server
- Run `npm install`
- Run `npm start`
- (Optional) Use a process manager like `pm2` and configure Nginx reverse proxy
