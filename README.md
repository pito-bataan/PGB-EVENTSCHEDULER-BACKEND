# PGB Event Scheduler - Backend API

## 🎯 Node.js Backend API for .gov.ph Deployment

This is the separated backend repository for the PGB Event Scheduler system.

## 🚀 Quick Start

### Development
```bash
npm install
npm run dev
```

### Production
```bash
npm install
npm run build
npm start
```

### Docker Deployment
```bash
docker build -t pgb-backend .
docker run -p 5000:5000 pgb-backend
```

## 🔧 Environment Variables

Create `.env` file:
```env
MONGODB_URI=mongodb+srv://your-mongo-uri
JWT_SECRET=your-secure-jwt-secret
NODE_ENV=production
PORT=5000
FRONTEND_URL=https://pgb-events.gov.ph
```

## 📁 Project Structure
```
├── routes/        # API endpoints
├── models/        # Database models
├── middleware/    # Authentication & validation
├── services/      # Business logic
└── uploads/       # File storage
```

## 🏗️ For IT Department (Coolify Deployment)

1. **Service Type**: Docker
2. **Port**: 5000
3. **Domain**: api-pgb-events.gov.ph
4. **Database**: MongoDB (provide connection string)
5. **Environment Variables**: See .env.example

## 📊 Health Check
- Endpoint: `/api/health`
- Expected Response: `{"success": true, "database": "connected"}`

## 📞 Support
Contact development team for technical issues.
