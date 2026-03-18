const { SessionStore } = require('../src/backend/sessions.js');

describe('SessionStore', () => {
  let store;

  beforeEach(() => {
    store = new SessionStore({ staleTimeoutMs: 100 }); // short timeout for tests
  });

  afterEach(() => store.destroy());

  test('applyEvent pre-tool sets state to working', () => {
    store.applyEvent({ sessionId: 'abc', state: 'working', lastToolName: 'Edit', cwd: '/tmp', updatedAt: new Date().toISOString() });
    expect(store.get('abc').state).toBe('working');
    expect(store.get('abc').lastToolName).toBe('Edit');
  });

  test('applyEvent stop sets state to waiting', () => {
    store.applyEvent({ sessionId: 'abc', state: 'waiting', cwd: '/tmp', updatedAt: new Date().toISOString() });
    expect(store.get('abc').state).toBe('waiting');
  });

  test('bootstrap creates session in bootstrapping state', () => {
    store.bootstrap({ sessionId: 'xyz', label: 'My Project', cwd: '/tmp/proj' });
    expect(store.get('xyz').state).toBe('bootstrapping');
    expect(store.get('xyz').label).toBe('My Project');
  });

  test('getAll returns all sessions as array', () => {
    store.bootstrap({ sessionId: 'a', label: 'A', cwd: '/a' });
    store.applyEvent({ sessionId: 'b', state: 'working', cwd: '/b', updatedAt: new Date().toISOString() });
    expect(store.getAll()).toHaveLength(2);
  });

  test('session becomes unknown after stale timeout', (done) => {
    store.applyEvent({ sessionId: 'abc', state: 'working', cwd: '/tmp', updatedAt: new Date().toISOString() });
    setTimeout(() => {
      expect(store.get('abc').state).toBe('unknown');
      done();
    }, 150);
  });

  test('stale timer resets when new working event arrives', (done) => {
    store.applyEvent({ sessionId: 'abc', state: 'working', cwd: '/tmp', updatedAt: new Date().toISOString() });
    setTimeout(() => {
      store.applyEvent({ sessionId: 'abc', state: 'working', cwd: '/tmp', updatedAt: new Date().toISOString() });
      setTimeout(() => {
        expect(store.get('abc').state).toBe('unknown');
        done();
      }, 150);
    }, 50);
  });

  test('emits change event when session updates', (done) => {
    store.on('change', (session) => {
      expect(session.sessionId).toBe('abc');
      done();
    });
    store.applyEvent({ sessionId: 'abc', state: 'waiting', cwd: '/tmp', updatedAt: new Date().toISOString() });
  });
});
