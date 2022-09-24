/* eslint-disable @typescript-eslint/no-explicit-any */
import { Remarkable } from 'remarkable';

function extractLinks(tokens: any[]) {
  const result: any[] = [];
  let href: any;
  let parts: any;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    switch (token.type) {
      case "link_open":
        href = token.href;
        parts = [];
        break;
      case "text":
        if (parts) {
          parts.push(token.content)
        }
        break;
      case "link_close":
        result.push({
          href: href,
          name: parts.join('')
        });
        parts = null;
        break;
    }
  }
  return result;
}

function extractText(tokens: any[]) {
  const result: any[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.type === "text" && token.content) {
      result.push(token.content);
    } else if (token.type === "softbreak") {
      break;
    }
  }
  return result.join('');
}

function autoCollapse(node: any, offset: any) {
  node.depth -= offset;
  if (node.children && node.children.length === 1 && node.children[0].autoCollapse) {
    node.children = node.children[0].children;
    offset += 1;
  }
  if (node.children) {
    node.children = node.children.map((child: any) => {
      if (child.autoCollapse && child.children && child.children.length === 1) {
        return autoCollapse(child.children[0], offset + 1);
      }
      return autoCollapse(child, offset)
    });
  }
  if (node.autoCollapse) {
    delete node.autoCollapse;
  }
  return node;
}

export function parse(text: string, options: any) {
  options = options || {};
  const parseLists: boolean = options.lists !== false;
  const parseLinks = Boolean(options.links);

  const md = new Remarkable();
  md.block.ruler.enable([
    'deflist'
  ]);

  const tokens = md.parse(text, {});
  let headings: any[] = [];
  let depth = 0;
  for (let i = 0; i < tokens.length; i += 1) {
    if (tokens[i].type === 'heading_open') {
      // @ts-expect-error type
      depth = tokens[i].hLevel;
      headings.push({
        depth: depth,
        // @ts-expect-error type
        line: tokens[i].lines[0],
        // @ts-expect-error type
        name: tokens[i+1].content || ''
      });
      i += 1;
    } else if (tokens[i].type === 'inline') {
      if (parseLinks) {
        headings = headings.concat(
          // @ts-expect-error type
          extractLinks(tokens[i].children).map((x) => {
            x.depth = depth + 1;
            // @ts-expect-error type
            x.line = tokens[i].lines[0];
            return x;
          })
        );
      }
    } else if (parseLists) {
      switch (tokens[i].type) {
        case 'bullet_list_open':
        case 'dl_open':
        case 'ordered_list_open':
          headings.push({
            depth: depth + 1,
            // @ts-expect-error type
            line: tokens[i].lines[0],
            name: '',
            autoCollapse: true
          });
          depth += 2;
          break;
        case 'bullet_list_close':
        case 'dl_close':
        case 'ordered_list_close':
          depth -= 2;
          break;
        case 'list_item_open': {
          const heading: any = {
            depth: depth,
            // @ts-expect-error type
            line: tokens[i].lines[0],
          };
          if (tokens[i+1].type === "list_item_close") {
            heading.name = "";
            i += 1;
          } else {
            // @ts-expect-error type
            heading.name = extractText(tokens[i+2].children || []);

            if (parseLinks) {
              // @ts-expect-error type
              const childLink = parse(tokens[i+2].content || '', options)[0];
              if (childLink) {
                heading.href = childLink.href;
              }
            }
            i += 2;
          }
          headings.push(heading);
          break;
        }
        case 'dt_open':
          headings.push({
            depth: depth,
            // @ts-expect-error type
            line: tokens[i].lines[0],
            // @ts-expect-error type
            name: tokens[i+1].content || ''
          });
          i += 1;
          break;
      }
    }
  }

  return headings;
}

export function transform(headings: any[]) {
  let root = {
    name: 'root',
    depth: 0,
    children: [] as any[],
  };
  let node = root;
  const stack: any[] = [];
  let tmp: any;

  headings.forEach((h) => {
    while (h.depth < node.depth + 1) {
      node = stack.pop();
    }

    while (h.depth > node.depth + 1) {
      if (!node.children || node.children.length === 0) {
        tmp = {
          name: '',
          depth: node.depth + 1
        };
        node.children = node.children || [];
        node.children.push(tmp);
      }
      stack.push(node);
      node = node.children[node.children.length-1];
    }

    node.children = node.children || [];
    node.children.push(h);
  });

  root = autoCollapse(root, 0);
  if (root.children.length === 1) {
    // there is only one child - it is the title, make it root
    root = root.children[0];
  }

  return root;
}
