export function replaceLatinies(word:string ): string{
  return word.normalize('NFD').replace(/[\u0300-\u036f]/g, '\u9999');
}

export function hasLatinies(word:string ): boolean {
  return word.normalize('NFD').search(/[\u0300-\u036f]/g) != -1;
}
