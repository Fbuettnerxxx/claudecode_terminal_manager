const { createTokenMiddleware } = require('../src/backend/auth.js');

function mockReq(token) {
  const url = token ? `/?token=${token}` : '/';
  return { url, query: token ? { token } : {} };
}

const mockRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.send = jest.fn(() => res);
  return res;
};

const next = jest.fn();

describe('token middleware', () => {
  beforeEach(() => next.mockClear());

  test('passes when token matches', () => {
    const mw = createTokenMiddleware('secret123');
    const res = mockRes();
    mw(mockReq('secret123'), res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('blocks when token is wrong', () => {
    const mw = createTokenMiddleware('secret123');
    const res = mockRes();
    mw(mockReq('wrong'), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('blocks when token is missing', () => {
    const mw = createTokenMiddleware('secret123');
    const res = mockRes();
    mw(mockReq(null), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('no-op when token is null (Tailscale mode — no auth required)', () => {
    const mw = createTokenMiddleware(null);
    const res = mockRes();
    mw(mockReq(null), res, next);
    expect(next).toHaveBeenCalled();
  });
});
