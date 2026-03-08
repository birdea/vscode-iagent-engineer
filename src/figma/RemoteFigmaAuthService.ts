import * as vscode from 'vscode';
import { SECRET_KEYS } from '../constants';
import { ValidationError } from '../errors';
import { Logger } from '../logger/Logger';
import { RemoteAuthSession } from '../types';

export class RemoteFigmaAuthService {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  async getSession(): Promise<RemoteAuthSession | null> {
    const raw = await this.secrets.get(SECRET_KEYS.REMOTE_FIGMA_AUTH);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw) as RemoteAuthSession;
      if (!parsed.accessToken) {
        return null;
      }
      return parsed;
    } catch {
      Logger.warn('figma', 'Failed to parse saved remote auth session — clearing it');
      await this.clearSession();
      return null;
    }
  }

  async saveSession(session: RemoteAuthSession): Promise<void> {
    await this.secrets.store(SECRET_KEYS.REMOTE_FIGMA_AUTH, JSON.stringify(session));
  }

  async clearSession(): Promise<void> {
    await this.secrets.delete(SECRET_KEYS.REMOTE_FIGMA_AUTH);
  }

  async hasUsableAccessToken(): Promise<boolean> {
    const session = await this.getSession();
    if (!session?.accessToken) return false;
    if (!session.expiresAt) return true;
    return session.expiresAt > Date.now();
  }

  buildCallbackUri(extensionId: string): vscode.Uri {
    return vscode.Uri.parse(`${vscode.env.uriScheme}://${extensionId}/figma-remote-auth`);
  }

  async buildAuthUrl(authUrl: string, extensionId: string): Promise<string> {
    const url = new URL(authUrl);
    if (!url.searchParams.has('vscode_redirect_uri')) {
      url.searchParams.set('vscode_redirect_uri', this.buildCallbackUri(extensionId).toString());
    }

    return url.toString();
  }

  async handleCallbackUri(uri: vscode.Uri): Promise<RemoteAuthSession> {
    const queryParams = new URLSearchParams(uri.query || '');
    const fragmentParams = new URLSearchParams((uri.fragment || '').replace(/^#/, ''));
    const getParam = (name: string) => queryParams.get(name) || fragmentParams.get(name);

    const accessToken = getParam('access_token');
    if (!accessToken) {
      throw new ValidationError('Remote auth callback did not include access_token');
    }

    const refreshToken = getParam('refresh_token') || undefined;
    const expiresInRaw = getParam('expires_in');
    const expiresIn = expiresInRaw ? Number(expiresInRaw) : undefined;
    const expiresAt =
      expiresIn && Number.isFinite(expiresIn) ? Date.now() + expiresIn * 1000 : undefined;

    const session: RemoteAuthSession = {
      accessToken,
      refreshToken,
      expiresAt,
    };
    await this.saveSession(session);
    Logger.success('figma', 'Remote auth session stored');
    return session;
  }
}
