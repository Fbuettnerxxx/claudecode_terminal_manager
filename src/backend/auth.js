const crypto = require('crypto');

function generateToken() {
  return crypto.randomBytes(24).toString('hex');
}

function createTokenMiddleware(requiredToken) {
  return (req, res, next) => {
    if (!requiredToken) return next(); // Tailscale mode: no auth needed
    const provided = req.query?.token || new URL(req.url, 'http://localhost').searchParams.get('token');
    if (provided === requiredToken) return next();
    res.status(401).send('Unauthorized: invalid or missing token');
  };
}

function verifyWsToken(requiredToken, url) {
  if (!requiredToken) return true;
  const params = new URL(url, 'http://localhost').searchParams;
  return params.get('token') === requiredToken;
}

module.exports = { createTokenMiddleware, verifyWsToken, generateToken };
