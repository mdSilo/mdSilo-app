import { FRAME_BAND, FRAME_INNER, FRAME_OUTER } from '../styles';

type Props = {
  /** the band of the chapter, on the right */
  header: boolean;
  /** the band of the progress, on the left */
  footer: boolean;
};

/**
 * The double border around the text written down the page, as books are
 * printed so (ported from readup): a thick line, a thin one in it, and the
 * bands of the chapter and the progress inside.
 */
export default function DoubleBorder({ header, footer }: Props) {
  const line = { borderColor: 'currentColor' };
  return (
    <div className="absolute inset-0 pointer-events-none opacity-50" data-testid="double-border" aria-hidden>
      <div className="absolute border-2" style={{ ...line, inset: FRAME_OUTER }} />
      <div className="absolute border" style={{ ...line, inset: FRAME_INNER }} />
      {header ? (
        <div
          className="absolute border-l"
          style={{ ...line, top: FRAME_INNER, bottom: FRAME_INNER, right: FRAME_INNER + FRAME_BAND }}
          data-testid="double-border-header"
        />
      ) : null}
      {footer ? (
        <div
          className="absolute border-r"
          style={{ ...line, top: FRAME_INNER, bottom: FRAME_INNER, left: FRAME_INNER + FRAME_BAND }}
          data-testid="double-border-footer"
        />
      ) : null}
    </div>
  );
}
