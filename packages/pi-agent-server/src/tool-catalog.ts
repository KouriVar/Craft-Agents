export type ProxyToolScope = 'session' | 'pool' | 'legacy';

export interface CatalogToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolCatalogUpdate {
  changed: boolean;
  requiresRebuild: boolean;
  activeNames: string[];
}

function definitionsEqual(a: CatalogToolDef | undefined, b: CatalogToolDef): boolean {
  return a !== undefined && JSON.stringify(a) === JSON.stringify(b);
}

export class ProxyToolCatalog {
  private readonly definitions = new Map<string, CatalogToolDef>();
  private readonly scopes = new Map<ProxyToolScope, Set<string>>();

  replaceScope(
    scope: ProxyToolScope,
    incoming: CatalogToolDef[],
    registeredNames: ReadonlySet<string> = new Set(),
  ): ToolCatalogUpdate {
    const previousNames = this.scopes.get(scope) ?? new Set<string>();
    const nextNames = new Set(incoming.map(tool => tool.name));
    let changed = previousNames.size !== nextNames.size
      || [...previousNames].some(name => !nextNames.has(name));
    let requiresRebuild = false;

    for (const definition of incoming) {
      const previous = this.definitions.get(definition.name);
      if (!definitionsEqual(previous, definition)) {
        changed = true;
        if (registeredNames.size > 0 && (!registeredNames.has(definition.name) || previous !== undefined)) {
          requiresRebuild = true;
        }
        this.definitions.set(definition.name, definition);
      }
    }

    this.scopes.set(scope, nextNames);
    return { changed, requiresRebuild, activeNames: this.getActiveNames() };
  }

  getDefinitions(): CatalogToolDef[] {
    return [...this.definitions.values()];
  }

  getDefinitionNames(): Set<string> {
    return new Set(this.definitions.keys());
  }

  getActiveNames(): string[] {
    const active = new Set<string>();
    for (const names of this.scopes.values()) {
      for (const name of names) active.add(name);
    }
    return [...active];
  }
}
