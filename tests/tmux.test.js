const { buildNewWindowCmd, buildSendKeysCmd, buildListWindowsCmd } = require('../src/backend/tmux.js');

describe('tmux command builders', () => {
  test('buildNewWindowCmd returns correct tmux command', () => {
    const cmd = buildNewWindowCmd({ sessionName: 'ccm', windowName: 'api-agent', cwd: '/tmp/proj' });
    expect(cmd).toContain('tmux new-window');
    expect(cmd).toContain('-n "api-agent"');
    expect(cmd).toContain('-c "/tmp/proj"');
  });

  test('buildSendKeysCmd returns correct tmux command', () => {
    const cmd = buildSendKeysCmd({ sessionName: 'ccm', windowName: 'api-agent', text: 'hello world' });
    expect(cmd).toContain('tmux send-keys');
    expect(cmd).toContain('ccm:api-agent');
    expect(cmd).toContain('"hello world"');
    expect(cmd).toContain('Enter');
  });

  test('buildListWindowsCmd returns list-windows command', () => {
    const cmd = buildListWindowsCmd('ccm');
    expect(cmd).toContain('tmux list-windows');
    expect(cmd).toContain('-t ccm');
  });
});
