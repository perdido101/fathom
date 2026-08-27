import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  PageOrientation,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx';
import { ANATOMY, COLOURS, SECTIONS, TYPE_SCALE, type Plate } from './guide-content';

/**
 * `npm run guide:docx` — the screen guide as a Word document.
 *
 * Same content as the HTML page and the PDF printed from it: all three read
 * `guide-content.ts`, so a plate added or a callout rewritten lands in every
 * format at once. What differs is only what each format can do.
 *
 * The one real difference is the callouts. In the HTML they are absolutely
 * positioned markers floating over the screenshot, and Word has no equivalent
 * — so this build embeds the *composited* figures that `guide-pdf.mjs`
 * captures out of the rendered page, pins already burned in. That keeps a
 * pin in the same place in all three formats rather than re-deriving it.
 *
 * Fonts are deliberately not the dossier's: Bricolage Grotesque and Source
 * Serif 4 are embedded in the HTML as data URIs, which a .docx cannot do
 * without shipping the files. Arial and Georgia are on every machine that
 * will open this, and a document that silently falls back to Times is worse
 * than one that chose a plain face on purpose.
 */

// --- page geometry ---------------------------------------------------------

/** A4 portrait in DXA; docx-js swaps these itself for landscape. */
const A4 = { width: 11906, height: 16838 };
const MARGIN = 720; // half an inch
/** Usable width, in DXA, for tables that must sum to it exactly. */
const CONTENT = A4.height - MARGIN * 2;

const INK = '0E2A44';
const SOFT = '4E6A85';
const FAINT = '7D95AC';
const GOLD = 'B7790A';
const REMOVED = 'B4472F';
const ARRIVED = '1F7A4C';
const RULE = 'D6DFE8';
const PANEL = 'F4F8FC';

const DISPLAY = 'Arial';
const BODY = 'Georgia';
const MONO = 'Consolas';

// --- helpers ---------------------------------------------------------------

/** Width and height of a PNG or JPEG, read out of the file header. */
function imageSize(path: string): { w: number; h: number } {
  const buf = readFileSync(path);
  if (buf.length > 24 && buf.toString('latin1', 1, 4) === 'PNG') {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  // JPEG: walk the segment chain to the first start-of-frame.
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return { w: 1920, h: 1080 };
}

/** An image scaled to a target width in inches, aspect preserved. */
function picture(path: string, inches: number): ImageRun {
  const { w, h } = imageSize(path);
  const width = Math.round(inches * 96);
  return new ImageRun({
    type: path.endsWith('.png') ? 'png' : 'jpg',
    data: readFileSync(path),
    transformation: { width, height: Math.round((width * h) / w) },
  });
}

function text(
  content: string,
  opts: {
    size?: number;
    bold?: boolean;
    italics?: boolean;
    color?: string;
    font?: string;
    caps?: boolean;
    strike?: boolean;
  } = {},
): TextRun {
  return new TextRun({
    text: content,
    size: (opts.size ?? 10) * 2, // docx sizes are half-points
    bold: opts.bold,
    italics: opts.italics,
    color: opts.color ?? INK,
    font: opts.font ?? BODY,
    allCaps: opts.caps,
    strike: opts.strike,
  });
}

/**
 * `newPage` starts the block on a fresh sheet.
 *
 * A `PageBreak` inside its own paragraph also works, but it *is* a paragraph,
 * and Word will not orphan a table row from the block that follows it — which
 * silently cost the last legend row on every twelve-callout plate. A
 * page-break-before property occupies no space at all.
 */
function para(
  runs: TextRun[],
  opts: {
    spacing?: number;
    before?: number;
    align?: (typeof AlignmentType)[keyof typeof AlignmentType];
    newPage?: boolean;
    line?: number;
  } = {},
): Paragraph {
  return new Paragraph({
    children: runs,
    alignment: opts.align,
    pageBreakBefore: opts.newPage,
    spacing: { after: opts.spacing ?? 120, before: opts.before ?? 0, line: opts.line ?? 264 },
  });
}

/** A small all-caps kicker, the guide's recurring label shape. */
function kicker(content: string, color = GOLD, newPage = false): Paragraph {
  return para([text(content, { size: 8, bold: true, color, font: DISPLAY, caps: true })], {
    spacing: 60,
    newPage,
  });
}

function cell(children: Paragraph[], width: number, opts: { shade?: string } = {}): TableCell {
  return new TableCell({
    children,
    width: { size: width, type: WidthType.DXA },
    margins: { top: 60, bottom: 60, left: 110, right: 110 },
    verticalAlign: VerticalAlign.TOP,
    shading: opts.shade
      ? { type: ShadingType.CLEAR, fill: opts.shade, color: 'auto' }
      : undefined,
  });
}

const NO_BORDERS = {
  top: { style: BorderStyle.NONE, size: 0, color: 'auto' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'auto' },
  left: { style: BorderStyle.NONE, size: 0, color: 'auto' },
  right: { style: BorderStyle.NONE, size: 0, color: 'auto' },
  insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'auto' },
  insideVertical: { style: BorderStyle.NONE, size: 0, color: 'auto' },
};

const HAIRLINE = {
  ...NO_BORDERS,
  insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: RULE },
};

/** A paragraph that draws a rule under itself, instead of a one-row table. */
function rule(): Paragraph {
  return new Paragraph({
    children: [],
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: INK } },
    spacing: { after: 240, before: 120 },
  });
}

// --- the pieces ------------------------------------------------------------

const plateCount = SECTIONS.reduce((n, s) => n + s.plates.length, 0);
const pinCount = SECTIONS.reduce(
  (n, s) => n + s.plates.reduce((m, p) => m + (p.pins?.length ?? 0), 0),
  0,
);

/**
 * The composited figure for a plate — pins already drawn in.
 *
 * `guide-pdf.mjs` writes these while it prints the PDF, which is why the
 * `guide` script runs the two in that order. Running this build alone on a
 * clean checkout falls back to the bare capture: fewer numbers on the page,
 * but never a missing plate.
 */
function figureFor(plate: Plate): string | null {
  const composited = `sim-out/pins/plate-${plate.num}.png`;
  if (existsSync(composited)) return composited;
  const plain = `screens/web/${plate.file}.jpg`;
  return existsSync(plain) ? plain : null;
}

function titlePage(): (Paragraph | Table)[] {
  return [
    para([text('Shadow Armada · build 6 · captured at 1920×1080', {
      size: 9, bold: true, color: GOLD, font: DISPLAY, caps: true,
    })], { spacing: 400 }),
    new Paragraph({
      children: [text('Every screen,', { size: 40, bold: true, font: DISPLAY })],
      spacing: { after: 0, line: 640 },
    }),
    new Paragraph({
      children: [
        text('and what ', { size: 40, bold: true, font: DISPLAY }),
        text('every part of it', { size: 40, bold: true, italics: true, color: SOFT, font: DISPLAY }),
        text(' is for.', { size: 40, bold: true, font: DISPLAY }),
      ],
      spacing: { after: 340, line: 640 },
    }),
    para([
      text(
        `A hidden-information naval duel wagered on Solana, documented plate by plate: ${plateCount} screens photographed from the running game, with ${pinCount} callouts naming what each element is, what it does, and why it was built that way.`,
        { size: 12, color: SOFT },
      ),
    ], { spacing: 320 }),
    rule(),
    new Table({
      columnWidths: [CONTENT / 4, CONTENT / 4, CONTENT / 4, CONTENT / 4],
      width: { size: CONTENT, type: WidthType.DXA },
      borders: NO_BORDERS,
      rows: [
        new TableRow({
          children: [
            [String(plateCount), 'Plates'],
            [String(pinCount), 'Callouts'],
            [String(SECTIONS.length), 'Chapters'],
            ['1920×1080', 'Capture'],
          ].map(([big, label]) =>
            cell(
              [
                para([text(big, { size: 20, bold: true, font: DISPLAY })], { spacing: 40 }),
                para([text(label, { size: 8, bold: true, color: FAINT, font: DISPLAY, caps: true })]),
              ],
              CONTENT / 4,
            ),
          ),
        }),
      ],
    }),
  ];
}

function primer(): (Paragraph | Table)[] {
  const half = Math.floor(CONTENT / 2);
  const swatchRows: TableRow[] = [];
  for (let i = 0; i < COLOURS.length; i += 2) {
    swatchRows.push(
      new TableRow({
        children: [COLOURS[i], COLOURS[i + 1]].filter(Boolean).map(([hex, name, use]) =>
          cell(
            [
              para([
                text('■ ', { size: 12, color: hex.replace('#', ''), font: DISPLAY }),
                text(name, { size: 10, bold: true, font: DISPLAY }),
              ], { spacing: 40 }),
              para([text(use, { size: 8.5, color: SOFT })]),
            ],
            half,
          ),
        ),
      }),
    );
  }

  const scaleRows: TableRow[] = [];
  for (let i = 0; i < TYPE_SCALE.length; i += 2) {
    scaleRows.push(
      new TableRow({
        children: [TYPE_SCALE[i], TYPE_SCALE[i + 1]].filter(Boolean).map(([px, use]) =>
          cell(
            [
              para([
                text(`${px}  `, { size: 12, bold: true, color: GOLD, font: DISPLAY }),
                text(use, { size: 8.5, color: SOFT }),
              ]),
            ],
            half,
          ),
        ),
      }),
    );
  }

  return [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [text('Reading the screens', { size: 22, bold: true, font: DISPLAY })],
      pageBreakBefore: true,
      spacing: { after: 160 },
    }),
    para([
      text(
        'A palette, a type scale and six conventions carry every plate that follows. Learn these and the rest of the document explains itself.',
        { size: 11, color: SOFT },
      ),
    ], { spacing: 240 }),
    new Table({
      columnWidths: [half, half],
      width: { size: CONTENT, type: WidthType.DXA },
      borders: HAIRLINE,
      rows: swatchRows,
    }),
    para([], { spacing: 240 }),
    kicker('The type scale'),
    para([
      text(
        'Eight steps, defined once as tokens. Every text element in the game maps to one of them and nothing invents a ninth.',
        { size: 9.5, color: SOFT },
      ),
    ], { spacing: 160 }),
    new Table({
      columnWidths: [half, half],
      width: { size: CONTENT, type: WidthType.DXA },
      borders: HAIRLINE,
      rows: scaleRows,
    }),
    ...ANATOMY.flatMap((a, i) => [
      para([text(a.h, { size: 12, bold: true, font: DISPLAY })], {
        spacing: 60,
        before: 160,
        newPage: i === 0,
      }),
      para([text(a.p, { size: 10, color: SOFT })], { spacing: 160 }),
    ]),
  ];
}

function legendTable(plate: Plate): Table | null {
  const pins = plate.pins ?? [];
  if (!pins.length) return null;
  const cols = 3;
  const colWidth = Math.floor(CONTENT / cols);
  const rows: TableRow[] = [];
  for (let i = 0; i < pins.length; i += cols) {
    const slice = pins.slice(i, i + cols);
    rows.push(
      new TableRow({
        // A callout that breaks in half across a page break is a callout
        // nobody reads. Rows stay whole.
        cantSplit: true,
        children: Array.from({ length: cols }, (_, k) => {
          const pin = slice[k];
          if (!pin) return cell([para([])], colWidth);
          return cell(
            [
              para([
                text(`${i + k + 1}  `, { size: 10, bold: true, color: GOLD, font: DISPLAY }),
                text(pin.label, { size: 9, bold: true, font: DISPLAY }),
              ], { spacing: 30 }),
              para([text(pin.text, { size: 8, color: SOFT })], { spacing: 30, line: 190 }),
            ],
            colWidth,
          );
        }),
      }),
    );
  }
  return new Table({
    columnWidths: Array.from({ length: cols }, () => colWidth),
    width: { size: CONTENT, type: WidthType.DXA },
    borders: HAIRLINE,
    rows,
  });
}

function spreadPlate(plate: Plate): (Paragraph | Table)[] {
  const s = plate.spread!;
  const half = Math.floor(CONTENT / 2);
  return [
    kicker('The restraint pass', REMOVED, true),
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [text(plate.name, { size: 16, bold: true, font: DISPLAY })],
      spacing: { after: 80 },
    }),
    para([text(plate.thesis, { size: 10.5, color: SOFT })], { spacing: 110 }),
    new Table({
      columnWidths: [half, half],
      width: { size: CONTENT, type: WidthType.DXA },
      borders: NO_BORDERS,
      rows: [
        new TableRow({
          cantSplit: true,
          children: [
            [s.before, 'Before · Build 5'],
            [s.after, 'After · Build 6'],
          ].map(([path, caption]) =>
            cell(
              [
                new Paragraph({ children: [picture(path, 3.75)], spacing: { after: 50 } }),
                para([text(caption, { size: 8, bold: true, color: FAINT, font: DISPLAY, caps: true })]),
              ],
              half,
            ),
          ),
        }),
      ],
    }),
    para([], { spacing: 80 }),
    new Table({
      columnWidths: [Math.floor(CONTENT * 0.6), CONTENT - Math.floor(CONTENT * 0.6)],
      width: { size: CONTENT, type: WidthType.DXA },
      borders: NO_BORDERS,
      rows: [
        new TableRow({
          children: [
            cell(
              [
                kicker(`Removed — ${s.gone.length}`, REMOVED),
                ...s.gone.flatMap(([h, p]) => [
                  para([
                    text('−  ', { size: 10, bold: true, color: REMOVED, font: DISPLAY }),
                    text(h, { size: 8.5, bold: true, font: DISPLAY }),
                  ], { spacing: 20 }),
                  para([text(p, { size: 7.5, color: SOFT })], { spacing: 70, line: 180 }),
                ]),
              ],
              Math.floor(CONTENT * 0.6),
            ),
            cell(
              [
                kicker(`Arrived — ${s.arrived.length}`, ARRIVED),
                ...s.arrived.flatMap(([h, p]) => [
                  para([
                    text('+  ', { size: 10, bold: true, color: ARRIVED, font: DISPLAY }),
                    text(h, { size: 8.5, bold: true, font: DISPLAY }),
                  ], { spacing: 20 }),
                  para([text(p, { size: 7.5, color: SOFT })], { spacing: 70, line: 180 }),
                ]),
              ],
              CONTENT - Math.floor(CONTENT * 0.6),
              { shade: PANEL },
            ),
          ],
        }),
      ],
    }),
  ];
}

function platePages(plate: Plate): (Paragraph | Table)[] {
  if (plate.spread) return spreadPlate(plate);

  const pins = plate.pins ?? [];
  const fig = figureFor(plate);
  const head: TextRun[] = [
    text(`Plate ${plate.num}`, { size: 8, bold: true, color: GOLD, font: MONO, caps: true }),
  ];
  // Only where the count actually moved: "4 4 callouts" reads as a typo
  // rather than as a result.
  if (plate.was !== undefined && plate.was !== pins.length) {
    head.push(text('   ', { size: 8 }));
    head.push(text(String(plate.was), { size: 8, color: FAINT, font: MONO, strike: true }));
    head.push(text(` ${pins.length} callouts`, { size: 8, bold: true, color: GOLD, font: MONO }));
  }

  const out: (Paragraph | Table)[] = [
    para(head, { spacing: 60, newPage: true }),
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [text(plate.name, { size: 16, bold: true, font: DISPLAY })],
      spacing: { after: 60 },
    }),
    para([text(plate.thesis, { size: 10.5, color: SOFT })], { spacing: 100 }),
  ];

  if (fig) {
    out.push(
      new Paragraph({
        children: [picture(fig, pins.length ? 4.85 : 6.4)],
        alignment: AlignmentType.CENTER,
        spacing: { after: 110 },
      }),
    );
  }

  const legend = legendTable(plate);
  if (legend) out.push(legend);

  if (plate.notes?.length) {
    out.push(
      ...plate.notes.map(
        (n) =>
          new Paragraph({
            children: [text(n, { size: 9.5, color: SOFT })],
            numbering: { reference: 'guide-bullets', level: 0 },
            spacing: { after: 110, line: 264 },
          }),
      ),
    );
  }

  return out;
}

// --- assemble --------------------------------------------------------------

const body: (Paragraph | Table)[] = [...titlePage(), ...primer()];

for (const section of SECTIONS) {
  body.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [text(section.title, { size: 26, bold: true, font: DISPLAY })],
      pageBreakBefore: true,
      spacing: { after: 140 },
    }),
    para([text(section.standfirst, { size: 11, color: SOFT })], { spacing: 180 }),
    new Paragraph({
      children: [text(section.journey, { size: 10.5, italics: true })],
      border: { left: { style: BorderStyle.SINGLE, size: 18, color: GOLD, space: 12 } },
      indent: { left: 200 },
      spacing: { after: 260, line: 264 },
    }),
  );
  for (const plate of section.plates) body.push(...platePages(plate));
}

body.push(
  rule(),
  para([
    text('How these were made. ', { size: 9.5, bold: true }),
    text(
      'Every plate is a real screenshot taken by `npm run screens`, which drives a browser through the actual game — queueing, drafting, deploying, planning rounds, settling — and photographs what is on screen. Nothing here is a mock-up of a screen that does not exist. The callout numbers are composited from the same rendered page the HTML and PDF versions use, so a pin sits in the same place in all three.',
      { size: 9.5, color: SOFT },
    ),
  ]),
  para([text(`Shadow Armada · devnet only · ${plateCount} plates`, { size: 8.5, color: FAINT, font: MONO })]),
);

const doc = new Document({
  creator: 'Shadow Armada',
  title: 'Shadow Armada — Screen Guide',
  description: `All ${plateCount} screens at 1920×1080, with ${pinCount} callouts.`,
  numbering: {
    config: [
      {
        reference: 'guide-bullets',
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: '—',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 340, hanging: 220 } } },
          },
        ],
      },
    ],
  },
  styles: {
    default: {
      document: { run: { font: BODY, size: 20, color: INK } },
    },
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: A4.width, height: A4.height, orientation: PageOrientation.LANDSCAPE },
          margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
        },
      },
      children: body,
    },
  ],
});

const out = 'Shadow-Armada-Screen-Guide.docx';
const buffer = await Packer.toBuffer(doc);
writeFileSync(out, buffer);
console.log(
  `wrote ${out} — ${(buffer.length / 1024 / 1024).toFixed(1)} MB, ${plateCount} plates, ${pinCount} callouts`,
);
