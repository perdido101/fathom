import { art, type ArtProps } from './registry';

/**
 * Render any asset by id. Nothing in the UI reaches into the registry
 * directly, so swapping art stays a registry-only change.
 *
 * An unknown id renders nothing rather than an empty rectangle — a missing
 * asset should be invisible, never a grey box pretending to be art.
 */
export function Art(props: ArtProps) {
  const Component = art(props.id);
  if (!Component) return null;
  return <Component {...props} />;
}
