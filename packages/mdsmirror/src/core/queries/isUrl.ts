export default function isUrl(text: string) {
  if (text.match(/\n/)) {
    return false;
  }

  try {
    const url = new URL(text);
    return url.hostname !== "";
  } catch (err) {
    return false;
  }
}

// external link, internal backlink, hashtag.. 
export function checkLinkType(href: string) {
  if (href.startsWith("http")) {
    return "external";
  } else if (href.startsWith("#")) {
    return "hashtag"
  } else {
    return "internal";
  }
}
