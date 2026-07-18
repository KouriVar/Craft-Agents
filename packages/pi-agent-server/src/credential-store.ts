import type { Credential, CredentialInfo, CredentialStore } from '@earendil-works/pi-ai';

/** Process-local serialized credential store for Pi's ModelRuntime. */
export class InMemoryPiCredentialStore implements CredentialStore {
  private readonly credentials = new Map<string, Credential>();
  private readonly mutations = new Map<string, Promise<unknown>>();

  async read(providerId: string): Promise<Credential | undefined> {
    return this.credentials.get(providerId);
  }

  async list(): Promise<readonly CredentialInfo[]> {
    return [...this.credentials].map(([providerId, credential]) => ({
      providerId,
      type: credential.type,
    }));
  }

  async modify(
    providerId: string,
    fn: (current: Credential | undefined) => Promise<Credential | undefined>,
  ): Promise<Credential | undefined> {
    const previous = this.mutations.get(providerId) ?? Promise.resolve();
    const mutation = previous.catch(() => {}).then(async () => {
      const next = await fn(this.credentials.get(providerId));
      if (next !== undefined) this.credentials.set(providerId, next);
      return this.credentials.get(providerId);
    });
    this.mutations.set(providerId, mutation);
    try {
      return await mutation;
    } finally {
      if (this.mutations.get(providerId) === mutation) this.mutations.delete(providerId);
    }
  }

  async delete(providerId: string): Promise<void> {
    const previous = this.mutations.get(providerId) ?? Promise.resolve();
    const mutation = previous.catch(() => {}).then(() => {
      this.credentials.delete(providerId);
    });
    this.mutations.set(providerId, mutation);
    try {
      await mutation;
    } finally {
      if (this.mutations.get(providerId) === mutation) this.mutations.delete(providerId);
    }
  }
}
