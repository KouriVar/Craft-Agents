import type { ProviderDriver } from '../driver-types.ts';

/** Codex uses the selected connection through an app-server model-provider override. */
export const codexDriver: ProviderDriver = {
  provider: 'codex',
  buildRuntime: ({ context, resolvedPaths }) => ({
    baseUrl: context.connection?.baseUrl,
    piAuthProvider: context.connection?.piAuthProvider,
    customEndpoint: context.connection?.customEndpoint,
    customModels: context.connection?.models,
    paths: {
      sessionServer: resolvedPaths.sessionServerPath,
      node: resolvedPaths.nodeRuntimePath,
      codexCli: resolvedPaths.codexCliPath,
    },
  }),
};
