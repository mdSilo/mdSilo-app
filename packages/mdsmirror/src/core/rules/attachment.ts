import MarkdownIt, { Token } from "markdown-it";

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

// check if turn markdown [](url) to Attachment
function isAttachment(token: Token) {
  const href = token.attrGet("href");
  const reg = /\.(pdf|docx?|xlsx?|pptx?|xps|odt|ods|odp|pages|numbers|key|zip)$/gmi;
  return href && href.startsWith('./') && reg.test(href || '');
}

export default function linksToAttachments(md: MarkdownIt) {
  md.core.ruler.after("breaks", "attachments", (state) => {
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

          // convert link to a file attachment if it should be
          if (insideLink && isAttachment(insideLink)) {
            const { content } = current;

            // convert to attachment token
            const token = new state.Token("attachment", "a", 0);
            token.attrSet("href", insideLink.attrGet("href") || "");

            const parts = content.split(" ");
            const size = parts.length > 1 ? parts.pop() : '0';
            const title = isNumeric(size) ? parts.join(" ") : content;
            token.attrSet("size", isNumeric(size) ? size || "0" : "0");
            token.attrSet("title", title);

            // delete the inline link – this makes the assumption that the
            // attachment is the only thing in the para.
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

export function isNumeric(value: any): boolean {
  return value && !isNaN(Number(value) - parseFloat(value));
}
