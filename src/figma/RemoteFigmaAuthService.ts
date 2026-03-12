import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { SECRET_KEYS } from '../constants';
import { ValidationError } from '../errors';
import { Logger } from '../logger/Logger';
import { RemoteAuthSession } from '../types';

interface PendingRemoteAuthState {
  nonce: string;
  callbackUri: string;
  createdAt: number;
}

const REMOTE_AUTH_STATE_TTL_MS = 10 * 60 * 1000;

export class RemoteFigmaAuthService {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  async getSession(): Promise<RemoteAuthSession | null> {
    const raw = await this.secrets.get(SECRET_KEYS.REMOTE_FIGMA_AUTH);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw) as RemoteAuthSession;
      if (!parsed.accessToken) {
        Logger.warn('figma', 'Saved remote auth session is missing an access token — clearing it');
        await this.clearSession();
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

  async clearPendingAuthState(): Promise<void> {
    await this.secrets.delete(SECRET_KEYS.REMOTE_FIGMA_AUTH_PENDING);
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

  private async getPendingAuthState(): Promise<PendingRemoteAuthState | null> {
    const raw = await this.secrets.get(SECRET_KEYS.REMOTE_FIGMA_AUTH_PENDING);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw) as PendingRemoteAuthState;
      if (!parsed.nonce || !parsed.callbackUri || !parsed.createdAt) {
        Logger.warn('figma', 'Saved pending remote auth state is invalid — clearing it');
        await this.clearPendingAuthState();
        return null;
      }
      return parsed;
    } catch {
      Logger.warn('figma', 'Failed to parse pending remote auth state — clearing it');
      await this.clearPendingAuthState();
      return null;
    }
  }

  async buildAuthUrl(authUrl: string, extensionId: string): Promise<string> {
    const url = new URL(authUrl);
    const callbackUri =
      url.searchParams.get('vscode_redirect_uri') || this.buildCallbackUri(extensionId).toString();
    const pendingState: PendingRemoteAuthState = {
      nonce: crypto.randomBytes(16).toString('hex'),
      callbackUri,
      createdAt: Date.now(),
    };

    await this.secrets.store(SECRET_KEYS.REMOTE_FIGMA_AUTH_PENDING, JSON.stringify(pendingState));

    url.searchParams.set('vscode_redirect_uri', callbackUri);
    url.searchParams.set('state', pendingState.nonce);

    return url.toString();
  }

  async handleCallbackUri(uri: vscode.Uri): Promise<RemoteAuthSession> {
    const queryParams = new URLSearchParams(uri.query || '');
    const fragmentParams = new URLSearchParams((uri.fragment || '').replace(/^#/, ''));
    const getParam = (name: string) => queryParams.get(name) || fragmentParams.get(name);

    const state = getParam('state');
    const pendingState = await this.getPendingAuthState();
    if (!pendingState) {
      throw new ValidationError('Remote auth callback did not match an active login attempt');
    }

    if (pendingState.createdAt + REMOTE_AUTH_STATE_TTL_MS < Date.now()) {
      await this.clearPendingAuthState();
      throw new ValidationError('Remote auth callback arrived after the login attempt expired');
    }

    if (uri.toString().split(/[?#]/, 1)[0] !== pendingState.callbackUri) {
      throw new ValidationError('Remote auth callback URI did not match the initiated login flow');
    }

    if (!state || state !== pendingState.nonce) {
      throw new ValidationError(
        'Remote auth callback state did not match the initiated login flow',
      );
    }

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
    await this.clearPendingAuthState();
    Logger.success('figma', 'Remote auth session stored');
    return session;
  }
}
