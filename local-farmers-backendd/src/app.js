const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');

const healthRouter = require('./routes/health');
const authRouter = require('./routes/auth');
const vendorRouter = require('./routes/vendor');
const marketsRouter = require('./routes/markets');
const externalRouter = require('./routes/external');
const productsRouter = require('./routes/products');
const { bootstrapData } = require('./lib/bootstrap');

const app = express();

const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((origin) => origin.trim())
  : ['http://localhost:5173'];

app.use(helmet());
app.use(
  cors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  }),
);
app.use(morgan('dev'));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

bootstrapData().catch((error) => {
  console.error('Failed to initialize data files', error);
});

app.get('/', (req, res) => {
  res.json({ message: 'Local Farmers API' });
});

app.use('/health', healthRouter);
app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/vendor', vendorRouter);
app.use('/api/markets', marketsRouter);
app.use('/api/external', externalRouter);
app.use('/api/products', productsRouter);

app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal Server Error' });
});

module.exports = app;
