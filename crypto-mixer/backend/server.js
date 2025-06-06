const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const app = express();

// Middleware
app.use(helmet());
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
}));
app.use(express.json());
app.use(morgan('combined'));

// Routes
app.use('/api/v1/mix', require('./api/routes/mixRoutes'));

const PORT = process.env.API_PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});