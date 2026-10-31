/** The languages to translate to, offered: the code, the name in the language. */
export const HUMAN_LANGUAGES: [string, string][] = [
  ['en', 'English'], 
  ['zh-CN', '简体中文'], 
  ['zh-TW', '繁體中文'], 
  ['ja', '日本語'], 
  ['ko', '한국어'],
  ['fr', 'Français'], 
  ['de', 'Deutsch'], 
  ['es', 'Español'], 
  ['pt', 'Português'], 
  ['it', 'Italiano'],
  ['ru', 'Русский'], 
  ['ar', 'العربية'],
];

export const CODE_LANGUAGES = [
  'auto', 'bash', 'c', 'cpp', 'csharp', 'css', 'diff', 'go', 'graphql', 
  'ini', 'java', 'javascript', 'json',
  'kotlin', 'less', 'lua', 'makefile', 'markdown', 'objectivec', 
  'perl', 'php', 'python', 'r', 'ruby', 'rust',
  'scss', 'shell', 'sql', 'swift', 'typescript', 'vbnet', 'xml', 'yaml',
] as const;
