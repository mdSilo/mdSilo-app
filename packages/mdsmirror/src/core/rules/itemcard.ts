import MarkdownIt, { Token } from "markdown-it";
import isUrl from "../queries/isUrl";

function isParagraph(token: Token) {
  return token.type === "paragraph_open";
}

function isInline(token: Token) {
  return token.type === "inline";
}

function isLinkOpen(token: Token) {
  return token.type === "link_open";
}

function isLinkClose(token: Token) {
  return token.type === "link_close";
}

// check if turn markdown [](url) to itemcard
function isItemcard(token: Token) {
  const href = token.attrGet("href");
  const reg = /^https:\/\/mdsilo\.com\/item\/(.+)$/gmi;
  return href && reg.test(href || '');
}

export default function linksToItemcards(md: MarkdownIt) {
  md.core.ruler.after("breaks", "itemcards", (state) => {
    const tokens = state.tokens;
    let insideLink;

    for (let i = 0; i < tokens.length - 1; i++) {
      // once we find an inline token look through it's children for links
      if (isInline(tokens[i]) && isParagraph(tokens[i - 1])) {
        const tokenChildren = tokens[i].children || [];

        for (let j = 0; j < tokenChildren.length - 1; j++) {
          const current = tokenChildren[j];
          if (!current) {
            continue;
          }

          if (isLinkOpen(current)) {
            insideLink = current;
            continue;
          }

          if (isLinkClose(current)) {
            insideLink = null;
            continue;
          }

          // of hey, we found a link – lets check to see if it should be
          // converted to a itemcard
          if (insideLink && isItemcard(insideLink)) {
            const { content } = current;

            // convert to itemcard token
            const token = new state.Token("itemcard", "a", 0);
            token.attrSet("href", insideLink.attrGet("href") || "");

            const parts = content.split("|");
            if (parts.length < 3) {
              continue;
            }
            const cover = parts.pop() || "";
            const info = parts.pop() || "";
            const title = parts.pop() || content;
            token.attrSet("cover", isUrl(cover) ? cover : "");
            token.attrSet("title", title);
            token.attrSet("info", info);

            // delete the inline link – this makes the assumption that the
            // itemcard is the only thing in the para.
            tokens.splice(i - 1, 3, token);
            insideLink = null;
            break;
          }
        }
      }
    }

    return false;
  });
}
