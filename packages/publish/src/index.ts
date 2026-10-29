/**
 * The static site of a workspace: the notes of the folders chosen, with
 * their backlinks, a graph, tags, the annotations of books and the issues,
 * as plain HTML with no dependency. The app gathers the input (src/publish)
 * and writes or pushes the files; this package knows no app nor disk.
 */
export { buildSite, publishedNotes } from './site';
export { frontMatter, stripFrontMatter } from './render';
export { slug, relHref } from './paths';
export * from './types';
