const fs = require('fs');
const path = require('path');
const os = require('os');

// We test the core writeEvent function in isolation
const { writeEvent } = require('../src/hook/index.js');

describe('ccm-hook writeEvent', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('writes state file with correct fields', () => {
    writeEvent({ sessionId: 'abc123', event: 'pre-tool', toolName: 'Edit', sessionsDir: tmpDir });
    const data = JSON.parse(fs.readFileSync(path.join(tmpDir, 'abc123.json'), 'utf8'));
    expect(data.sessionId).toBe('abc123');
    expect(data.state).toBe('working');
    expect(data.lastToolName).toBe('Edit');
    expect(data.cwd).toBeTruthy(); // cwd is written
    expect(data.updatedAt).toBeTruthy();
  });

  test('stop event sets state to waiting', () => {
    writeEvent({ sessionId: 'abc123', event: 'stop', sessionsDir: tmpDir });
    const data = JSON.parse(fs.readFileSync(path.join(tmpDir, 'abc123.json'), 'utf8'));
    expect(data.state).toBe('waiting');
  });

  test('post-tool event updates lastToolName but keeps working state', () => {
    writeEvent({ sessionId: 'abc123', event: 'pre-tool', toolName: 'Read', sessionsDir: tmpDir });
    writeEvent({ sessionId: 'abc123', event: 'post-tool', toolName: 'Read', sessionsDir: tmpDir });
    const data = JSON.parse(fs.readFileSync(path.join(tmpDir, 'abc123.json'), 'utf8'));
    expect(data.state).toBe('working');
    expect(data.lastToolName).toBe('Read');
  });

  test('creates sessions dir if missing', () => {
    const nestedDir = path.join(tmpDir, 'sessions');
    writeEvent({ sessionId: 'abc123', event: 'stop', sessionsDir: nestedDir });
    expect(fs.existsSync(path.join(nestedDir, 'abc123.json'))).toBe(true);
  });

  test('falls back to synthetic ID when sessionId is empty', () => {
    writeEvent({ sessionId: '', event: 'stop', sessionsDir: tmpDir });
    const files = fs.readdirSync(tmpDir);
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/\.json$/);
  });
});
