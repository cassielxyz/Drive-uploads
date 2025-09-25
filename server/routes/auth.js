import express from 'express';
import jwt from 'jsonwebtoken';
import { google } from 'googleapis';
import winston from 'winston';

const router = express.Router();
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.Console()]
});

// JWT secret (in production, use a secure secret)
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Google OAuth2 configuration
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/auth/google/callback'
);

// Generate JWT token
const generateToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
};

// Verify JWT token
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Google OAuth2 login
router.get('/google', (req, res) => {
  const scopes = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile'
  ];
  
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent'
  });
  
  res.json({ authUrl });
});

// Google OAuth2 callback
router.get('/google/callback', async (req, res) => {
  try {
    const { code } = req.query;
    
    if (!code) {
      return res.status(400).json({ error: 'Authorization code not provided' });
    }
    
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    
    // Get user info
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data } = await oauth2.userinfo.get();
    
    // Generate JWT token
    const token = generateToken({
      userId: data.id,
      email: data.email,
      name: data.name,
      picture: data.picture,
      googleTokens: tokens
    });
    
    logger.info('User authenticated', { userId: data.id, email: data.email });
    
    res.json({
      token,
      user: {
        id: data.id,
        email: data.email,
        name: data.name,
        picture: data.picture
      }
    });
    
  } catch (error) {
    logger.error('Google OAuth2 callback error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// Refresh Google tokens
router.post('/google/refresh', async (req, res) => {
  try {
    const { refreshToken, clientId, clientSecret } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token not provided' });
    }
    
    oauth2Client.setCredentials({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret
    });
    
    const { credentials } = await oauth2Client.refreshAccessToken();
    
    res.json({
      accessToken: credentials.access_token,
      refreshToken: credentials.refresh_token || refreshToken
    });
    
  } catch (error) {
    logger.error('Token refresh error:', error);
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

// Verify token endpoint
router.get('/verify', verifyToken, (req, res) => {
  res.json({
    valid: true,
    user: req.user
  });
});

// Logout (client-side token removal)
router.post('/logout', (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

export default router;