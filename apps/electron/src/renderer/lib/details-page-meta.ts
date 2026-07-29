/**
 * Static metadata exported by settings detail pages.
 *
 * The runtime navigation source of truth is NavigationContext + route-parser;
 * this type deliberately carries no registry or route behaviour.
 */
export interface DetailsPageMeta {
  navigator: 'settings'
  slug: string
}
