import type { IconType } from 'react-icons';
import { TbBook, TbBook2, TbHtml, TbFileZip, TbNotebook, TbMarkdown } from 'react-icons/tb';
import { FaFilePdf } from 'react-icons/fa';
import { GrGallery } from "react-icons/gr";
import { PiFileTxt } from "react-icons/pi";
import { bookFormatOf, convertibleFormatOf, type BookFormat, type TextFormat } from '../document';

/** The icon of a book format, its color: to tell the books apart in the file tree. */
const BOOK_ICONS: Record<BookFormat, { icon: IconType; color: string }> = {
  EPUB: { icon: TbBook, color: '#86b918' },
  PDF: { icon: FaFilePdf, color: '#dc2626' },
  MOBI: { icon: TbBook2, color: '#ea580c' },
  AZW: { icon: TbBook2, color: '#ea580c' },
  AZW3: { icon: TbBook2, color: '#ea580c' },
  FB2: { icon: TbNotebook, color: '#0d9488' },
  FBZ: { icon: TbNotebook, color: '#0d9488' },
  CBZ: { icon: GrGallery, color: '#db2777' },
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
