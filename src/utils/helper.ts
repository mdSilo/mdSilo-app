// helper 
//import GPT3Tokenizer from 'gpt3-tokenizer';
// date
//
// string: yyyy-mm-dd  or yyyy-m-d
export const regDateStr = /^([0-9]{4})-(0?[1-9]|1[0-2])-(0?[1-9]|[12][0-9]|3[01])$/;

/** yyyy-m-d */
export function getStrDate(dateStr: string) {
  const date = new Date(dateStr);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

// convert yyyy-mm-dd to date
export function strToDate(str: string) {
  if (!regDateStr.test(str)) return new Date();
  const ymd = str.split("-");
  const date = new Date(Number(ymd[0]), Number(ymd[1]) - 1, Number(ymd[2]));
  return date;
}

export function dateCompare(d1: string | Date, d2: string | Date) {
  return new Date(d1).getTime() - new Date(d2).getTime();
}

export function fmtDatetime(dateStr: string | Date) {
  return new Date(dateStr).toLocaleString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function decodeHTMLEntity(text: string) {
  const dummy = document.createElement("div");
  const txt = text.replace(
    /(&(?!(amp|gt|lt|quot|apos))[^;]+;)/g, // excerpt these html entities
    (a: string) => {
      dummy.innerHTML = a;
      return dummy.textContent || ' '; // real value
    }
  );

  return txt;
}

// device
const SM_BREAKPOINT = 640;

export const isMobile = (breakpoint: number = SM_BREAKPOINT) => {
  const winWidth = window.innerWidth;
  return winWidth <= breakpoint && winWidth !== 0;
};

// str
// 
// case Insensitive
export function ciStringCompare(str1: string, str2: string) {
  return str1.localeCompare(str2, undefined, {
    sensitivity: 'base',
    numeric: true,
  });
}

export function ciStringEqual(str1: string, str2: string) {
  return ciStringCompare(str1, str2) === 0;
}

// shorten a string but must include centre text
export function shortenString(txt: string, centre: string, len = 128) {
  const txtLen = txt.length;
  if (txtLen <= len) {
    return txt.replaceAll(centre, `==${centre}==`);
  }
  
  const idx = txt.indexOf(centre);
  const cenLen = centre.length;
  const step = Math.floor((len - cenLen) / 2);
  const span1 = idx - step; 
  const span2 = idx + cenLen + step;
  const start = Math.max(span1 + Math.min(txtLen - span2, 0), 0);
  const end = Math.min(txtLen, span2 - Math.min(span1, 0));

  return txt.substring(start, end).replaceAll(centre, `==${centre}==`);
}

export const countWords = (str: string) => {
  // special characters such as middle-dot, etc.   
  const str0 = str.replace(/[\u007F-\u00FE]/g, ' ');
  // remove all not ASCII
  // https://en.wikipedia.org/wiki/List_of_Unicode_characters
  const str1 = str0.replace(/[^!-~\d\s]+/gi, ' ')
  // remove characters, number
  const str2 = str0.replace(/[!-~\d\s]+/gi, '')

  const matches1 = str1.match(/[\u00FF-\uFFFF]|\S+/g);
  const matches2 = str2.match(/[\u00FF-\uFFFF]|\S+/g);
  const count1 = matches1 ? matches1.length : 0;
  const count2 = matches2 ? matches2.length : 0;

  const count = count1 + count2;
  return count;
}

// const tokenizer = new GPT3Tokenizer({ type: 'gpt3' });
// export function estimateTokens(str: string): number {
//   const encoded: { bpe: number[]; text: string[] } = tokenizer.encode(str);
//   return encoded.bpe.length;
// }

const ymdNums = (date: string) => {
  const nums =  date.split('-').map(n => Number(n));
  return nums;
};
export function dailyTitleEqual(str1: string, str2: string) {
  if (!regDateStr.test(str1) || !regDateStr.test(str2)) return false;
  return ymdNums(str1).join('') === ymdNums(str2).join('');
}

// url 
// Adapted from https://stackoverflow.com/a/43467144
export const isUrl = (str: string) => {
  let url;

  try {
    url = new URL(str);
  } catch (_) {
    return false;
  }

  return url.protocol === 'http:' || url.protocol === 'https:';
};

export const isSVG = (s: string) => /<\s*svg[^>]*>(.*?)<\/\s*svg>/g.test(s);

export const getFavicon = (url: string) => {
  const hostname = url ? new URL(url).hostname : "";
  return "https://icons.duckduckgo.com/ip3/" + hostname + ".ico";
};
