import type { CSSProperties, ReactElement } from 'react';
import { ICON_PATHS } from './icons';

/**
 * One glyph from the icon set.
 *
 * The paths are stored without their original background and drawn in
 * `currentColor`, so every icon takes the colour of whatever it sits in. That
 * is the whole trick behind making a borrowed set look deliberate: the shapes
 * come from game-icons.net, the palette is entirely ours, and nothing on
 * screen is a colour that was not chosen in `theme.css`.
 *
 * Attribution is required by the licence and lives on the Credits screen.
 */
export function Icon({
  name,
  size = 20,
  title,
  style,
  className,
}: {
  name: string;
  size?: number;
  title?: string;
  style?: CSSProperties;
  className?: string;
}): ReactElement | null {
  const paths = ICON_PATHS[name];
  if (!paths) return null;
  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={className}
      style={{ display: 'block', flex: 'none', ...style }}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {paths.map((d, i) => (
        <path key={i} d={d} fill="currentColor" />
      ))}
    </svg>
  );
}

export function hasIcon(name: string): boolean {
  return ICON_PATHS[name] !== undefined;
}
