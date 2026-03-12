import * as assert from 'assert';
import { toFriendlyApiKeyError } from '../../src/webview/ui/utils/errorUtils';

suite('ErrorUtils', () => {
  test('maps missing API key errors', () => {
    const message = toFriendlyApiKeyError(
      'ko',
      'No API key set for gemini agent',
      'agent.error.noApiKey',
      'agent.error.auth',
      'agent.error.generic',
    );

    assert.ok(message.includes('API 키'));
  });

  test('maps invalid API key format errors', () => {
    const message = toFriendlyApiKeyError(
      'ko',
      'Invalid API key format for gemini',
      'agent.error.noApiKey',
      'agent.error.auth',
      'agent.error.generic',
    );

    assert.ok(message.includes('형식'));
  });

  test('maps authentication and permission errors', () => {
    const httpMessage = toFriendlyApiKeyError(
      'ko',
      'HTTP 401 Unauthorized',
      'agent.error.noApiKey',
      'agent.error.auth',
      'agent.error.generic',
    );
    const permissionMessage = toFriendlyApiKeyError(
      'ko',
      'PERMISSION_DENIED by upstream',
      'agent.error.noApiKey',
      'agent.error.auth',
      'agent.error.generic',
    );

    assert.ok(httpMessage.includes('인증'));
    assert.ok(permissionMessage.includes('인증'));
  });

  test('falls back to generic error copy', () => {
    const message = toFriendlyApiKeyError(
      'ko',
      'something else happened',
      'agent.error.noApiKey',
      'agent.error.auth',
      'agent.error.generic',
    );

    assert.ok(message.includes('처리하지 못했습니다'));
  });
});
