import { t, UiLocale } from '../../../i18n';

export function toFriendlyApiKeyError(
  locale: UiLocale,
  message: string,
  noKeyMsgKey: string,
  authMsgKey: string,
  genericMsgKey: string,
): string {
  if (message.includes('No API key')) {
    return t(locale, noKeyMsgKey);
  }
  if (message.includes('Invalid API key format')) {
    return t(locale, 'agent.error.invalidKeyFormat');
  }
  if (
    message.includes('HTTP 401') ||
    message.includes('permission') ||
    message.includes('PERMISSION_DENIED')
  ) {
    return t(locale, authMsgKey);
  }
  return t(locale, genericMsgKey);
}
