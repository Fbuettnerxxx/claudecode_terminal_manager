const CCM_HOOK_MARKER = '_ccm';

const EVENT_ARG = { PreToolUse: 'pre-tool', PostToolUse: 'post-tool', Stop: 'stop' };

function buildHookEntry(hookBin, event) {
  const eventArg = EVENT_ARG[event] || event.toLowerCase();
  return {
    [CCM_HOOK_MARKER]: true,
    matcher: '*',
    hooks: [{
      type: 'command',
      command: `${hookBin} ${eventArg} "$CLAUDE_SESSION_ID" "$CLAUDE_TOOL_NAME"`,
    }],
  };
}

function registerHooks(settings, hookBin) {
  const result = JSON.parse(JSON.stringify(settings)); // deep clone
  result.hooks = result.hooks || {};

  for (const event of ['PreToolUse', 'PostToolUse', 'Stop']) {
    result.hooks[event] = result.hooks[event] || [];
    const alreadyRegistered = result.hooks[event].some(e => e[CCM_HOOK_MARKER]);
    if (!alreadyRegistered) {
      result.hooks[event].push(buildHookEntry(hookBin, event));
    }
  }
  return result;
}

function deregisterHooks(settings) {
  const result = JSON.parse(JSON.stringify(settings));
  if (!result.hooks) return result;

  for (const event of Object.keys(result.hooks)) {
    result.hooks[event] = result.hooks[event].filter(e => !e[CCM_HOOK_MARKER]);
    if (result.hooks[event].length === 0) delete result.hooks[event];
  }
  if (Object.keys(result.hooks).length === 0) delete result.hooks;
  return result;
}

module.exports = { registerHooks, deregisterHooks, CCM_HOOK_MARKER };
