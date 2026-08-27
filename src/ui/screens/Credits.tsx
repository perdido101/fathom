import type { ReactElement } from 'react';
import { useStore } from '../../state/store';
import { ICON_CREDITS, ICON_LICENCE, ICON_LICENCE_URL, ICON_RETRIEVED } from '../art/icons';
import { Icon } from '../art/Icon';

/**
 * Credits.
 *
 * The icon set is CC BY, which permits commercial use and requires
 * attribution. That is a licence condition, not a courtesy, so this screen is
 * part of shipping rather than a nice-to-have — and it is generated from the
 * same table that fetched the files, so it cannot fall out of step with what
 * is actually in the build.
 */
export function Credits(): ReactElement {
  const go = useStore((s) => s.go);
  const byAuthor = new Map<string, typeof ICON_CREDITS>();
  for (const c of ICON_CREDITS) {
    const list = byAuthor.get(c.author) ?? [];
    list.push(c);
    byAuthor.set(c.author, list);
  }

  return (
    <div className="screen">
      <h2>Credits</h2>

      <div className="panel col" style={{ gap: 6 }}>
        <strong style={{ fontSize: 'var(--fs-fine)' }}>Icons — game-icons.net</strong>
        <p style={{ fontSize: 'var(--fs-fine)' }}>
          {ICON_CREDITS.length} icons by {[...byAuthor.keys()].join(' and ')}, used under{' '}
          {ICON_LICENCE} and recoloured to this game&rsquo;s palette. Retrieved {ICON_RETRIEVED}.
        </p>
        <span style={{ wordBreak: 'break-all', fontSize: 'var(--fs-fine)', fontWeight: 700 }}>
          {ICON_LICENCE_URL}
        </span>
      </div>

      {[...byAuthor.entries()].map(([author, icons]) => (
        <div key={author} className="col" style={{ gap: 6 }}>
          <h3>
            {author} — {icons.length} icons
          </h3>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))',
              gap: 6,
            }}
          >
            {icons.map((c) => (
              <div
                key={c.slot}
                className="col"
                style={{ gap: 2, alignItems: 'center', padding: 4 }}
                title={`${c.name} by ${c.author}`}
              >
                <Icon name={c.slot} size={22} style={{ color: 'var(--ink-dim)' }} />
                <span style={{ fontSize: 'var(--fs-fine)', color: 'var(--ink-faint)', textAlign: 'center' }}>
                  {c.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="panel col" style={{ gap: 6 }}>
        <strong style={{ fontSize: 'var(--fs-fine)' }}>Everything else</strong>
        <p style={{ fontSize: 'var(--fs-fine)' }}>
          Ship hulls, board tiles, card frames, the wordmark and every visual effect are drawn
          procedurally in this repository. Type is Baloo 2, Nunito and JetBrains Mono, all under
          the SIL Open Font License, served from Google Fonts. No audio ships yet.
        </p>
        <p style={{ fontSize: 'var(--fs-fine)' }}>
          No Epic Games asset, model, texture, font or sound is used or referenced anywhere in this
          project.
        </p>
      </div>

      <div className="spacer" />
      <button className="btn ghost" onClick={() => go('settings')}>
        back
      </button>
    </div>
  );
}
