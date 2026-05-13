# Canteen Dashboard

A comprehensive web application for managing canteen purchases, tracking expenses, and analyzing spending patterns. Built with modern web technologies for small to medium-sized organizations.

## Features

- **Purchase Tracking**: Record and manage daily purchases with OCR invoice scanning
- **Analytics Dashboard**: Visual insights with charts and KPIs
- **Master Data Management (MDM)**: Centralized item catalog with alias resolution
- **Budget Management**: Set and monitor spending budgets by category
- **User Management**: Role-based access (Admin/Staff)
- **Export & Reports**: Generate reports and export data
- **Responsive Design**: Works on desktop and mobile devices

## Tech Stack

- **Frontend**: Vanilla JavaScript, HTML5, CSS3, Chart.js
- **Backend**: Node.js, Express.js, SQLite
- **OCR**: Tesseract.js for invoice scanning
- **Build**: Vite
- **Testing**: Vitest
- **Deployment**: Docker & Docker Compose

## Quick Start

### Prerequisites
- Node.js 20+
- Docker & Docker Compose (for production)

### Development Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd canteen-dashboard
   ```

2. **Install dependencies**
   ```bash
   npm install
   cd server && npm install && cd ..
   ```

3. **Start development servers**
   ```bash
   # Terminal 1: Frontend
   npm run dev

   # Terminal 2: Backend
   cd server && node index.js
   ```

4. **Open in browser**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:3001

### Production Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed deployment instructions.

## Configuration

### Environment Variables

Create `server/.env` file:

```env
PORT=3001
JWT_SECRET=<strong-random-secret>
ALLOWED_ORIGINS=http://localhost:5173,http://your-domain.com

# Optional: Email alerts for price spikes
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
ALERT_EMAIL_TO=manager@company.com

# Default passwords (change immediately after first login)
DEFAULT_ADMIN_PASSWORD=changeMe123!
DEFAULT_STAFF_PASSWORD=changeMe123!
```

## Testing

```bash
# Run all tests
npm test

# Run tests with UI
npm run test:ui
```

## Project Structure

```
canteen-dashboard/
├── js/                    # Frontend JavaScript modules
│   ├── pages/            # Page components
│   ├── api.js            # API client
│   ├── app.js            # Main app logic
│   └── ...
├── css/                  # Stylesheets
├── server/               # Backend Node.js application
│   ├── db.js            # Database setup and models
│   ├── index.js         # Express server
│   └── tests/           # Backend tests
├── public/               # Static assets
├── dist/                 # Built frontend (generated)
├── Dockerfile            # Container definition
├── docker-compose.yml    # Multi-container setup
└── nginx.conf           # Nginx configuration
```

## Security Notes

- Default passwords are seeded on first run - **change them immediately**
- JWT tokens expire in 8 hours
- Rate limiting protects against brute force attacks
- CORS configured for allowed origins only

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## License

ISC License