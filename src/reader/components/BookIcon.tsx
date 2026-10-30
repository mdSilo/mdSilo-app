import type { IconBaseProps, IconType } from 'react-icons';
import { TbHtml, TbFileZip, TbMarkdown } from 'react-icons/tb';
import { FaFilePdf } from 'react-icons/fa';
import { PiFileTxt } from "react-icons/pi";
import { bookFormatOf, convertibleFormatOf, type BookFormat, type TextFormat } from '../document';

/** The official EPUB logo mark, without the wordmark. */
export function EpubIcon({ size = '1em', color = '#85b916', title, ...props }: IconBaseProps) {
  return (
    <svg
      fill={color}
      stroke="currentColor"
      strokeWidth="0"
      viewBox="0 0 401.14 401.14"
      height={size}
      width={size}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {title && <title>{title}</title>}
      <path
        d="M297.63,462.07,171.58,336l126-126,42,42-84.05,84,42,42L423.69,252,313.88,142.17a23,23,0,0,0-32.48,0L103.79,319.78a23,23,0,0,0,0,32.48L281.4,529.86a23,23,0,0,0,32.48,0l177.61-177.6a23,23,0,0,0,0-32.48L465.7,294Z"
        transform="translate(-97.07 -135.44)"
      />
    </svg>
  );
}

/** An original ebook-file icon used for MOBI and AZW formats. */
export function MobiIcon({ size = '1em', color, title, ...props }: IconBaseProps) {
  return (
    <svg
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
      height={size}
      width={size}
      xmlns="http://www.w3.org/2000/svg"
      color={color}
      {...props}
    >
      {title && <title>{title}</title>}
      <path d="M5 2.75h9l5 5v13.5H5z" />
      <path d="M14 3v5h5M8 16v-6l4 4 4-4v6" />
    </svg>
  );
}

/** An original open-book/code icon used for FB2 and FBZ formats. */
export function FictionBookIcon({ size = '1em', color, title, ...props }: IconBaseProps) {
  return (
    <svg
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
      height={size}
      width={size}
      xmlns="http://www.w3.org/2000/svg"
      color={color}
      {...props}
    >
      {title && <title>{title}</title>}
      <path d="M12 7c-2.2-2-5.2-2.5-9-2.5v13c3.8 0 6.8.5 9 2.5 2.2-2 5.2-2.5 9-2.5v-13c-3.8 0-6.8.5-9 2.5Z" />
      <path d="M12 7v13M8.5 10l-2 2 2 2m7-4 2 2-2 2" />
    </svg>
  );
}

/** An original comic-page icon used for CBZ archives. */
export function CbzIcon({ size = '1em', color, title, ...props }: IconBaseProps) {
  return (
    <svg
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
      height={size}
      width={size}
      xmlns="http://www.w3.org/2000/svg"
      color={color}
      {...props}
    >
      {title && <title>{title}</title>}
      <path d="M4 3.5h16v17H4zM12 4v7.5M4.5 12.5h15" />
      <path d="M6.5 6h3v4h-3zm9 0h2.5v4H15.5zM7 15h3v3H7zm8.5 0H18v3h-2.5z" />
    </svg>
  );
}

/** The icon of a book format, its color: to tell the books apart in the file tree. */
const BOOK_ICONS: Record<BookFormat, { icon: IconType; color: string }> = {
  EPUB: { icon: EpubIcon, color: '#85b916' },
  PDF: { icon: FaFilePdf, color: '#dc2626' },
  MOBI: { icon: MobiIcon, color: '#ea580c' },
  AZW: { icon: MobiIcon, color: '#ea580c' },
  AZW3: { icon: MobiIcon, color: '#ea580c' },
  FB2: { icon: FictionBookIcon, color: '#0d9488' },
  FBZ: { icon: FictionBookIcon, color: '#0d9488' },
  CBZ: { icon: CbzIcon, color: '#db2777' },
};

/** The text files read once converted to a book; Markdown is a note. */
const TEXT_ICONS: Partial<Record<TextFormat, { icon: IconType; color: string }>> = {
  TXT: { icon: PiFileTxt, color: '#64748b' },
  HTML: { icon: TbHtml, color: '#c2410c' },
  ZIP: { icon: TbFileZip, color: '#a16207' },
  Markdown: { icon: TbMarkdown, color: '#000000' },
};

/** The icon of a file by its format, if a book (or a text file made a book); else undefined. */
export function bookIconOf(path: string) {
  const book = bookFormatOf(path);
  if (book) return { ...BOOK_ICONS[book], label: book };
  const text = convertibleFormatOf(path);
  const icon = text && TEXT_ICONS[text];
  return icon ? { ...icon, label: text } : undefined;
}

/** The icon of a book file, by its format. */
export default function BookIcon(
  { path, size = 16, className = '' }: { path: string; size?: number; className?: string }
) {
  const found = bookIconOf(path);
  if (!found) return null;
  const { icon: Icon, color, label } = found;
  return <Icon className={`shrink-0 ${className}`} size={size} color={color} aria-label={label} />;
}
