import React from "react";
import type { Meta } from "@storybook/react-webpack5";
import DefaultEditor from "./index";
import { Props } from "..";

const meta: Meta<typeof DefaultEditor> = {
  title: "<editor>",
  component: DefaultEditor,
};

export default meta;

export const Example = (props: Props) => {
  return (
    <div style={{ padding: "1em 2em" }}>
      <DefaultEditor defaultValue={defaultValue} />
    </div>
  );
};

const defaultValue = `# Welcome

## Text 

A mind silo for storing read, ideas, thought, knowledge with powerful reading and writing tools. built with React and Tauri. It is free and open source.

Just an easy to use **Markdown** editor with \`slash commands\`. 

https://github.com/ 

## Math: 

Inline $\\frac{x^2}{2}$

**Math Block** 

\
$$
\\mathcal{L}(V \\otimes W, Z) \\cong \\big\\{ \\substack{\\text{bilinear maps}\\\\{V \\times W \\rightarrow Z}} \\big\\}
$$


## Mark   

This is **bold** word, and it is _italic_ or ~~strikethrough~~ or __underline__, 
also can be ==highlighted==. We can include some \`inline code\`.

Here is a   
!!placeholder!!

and [a link to an URL](http://www.mdsilo.com). or [dummy text link to a doc](/doc/reference) or [Word link to nothing](doc ny) or [dummy text](#Tips) 

We can try ##hashtag1## double or try #hashtag2# single.   

And wikilink [[This is a wikilink]] more [[another one wikilink | Title Text]] 

[#Hola](#Hola)

## Quoteblock 

> Quotes are another way to callout text within a larger document
> They are often used to incorrectly attribute words to historical figures

## Lists

- An
- Unordered
- List

and also

1. An
1. Ordered
1. List

## Checklist

- [x] done
- [ ] todo

## Table

| Editor | Rank | React | Collaborative |
|----|----|----|---:|
| Prosemirror | A | No | Yes |
| Slate | B | Yes | No |
| CKEdit | C | No | Yes | 


## Code

\`\`\`rust
fn main() {
  println!("Hello, world!");
}
\`\`\`

highlight

\`\`\`javascript
function main() {
  console.log("Hello World");
}
\`\`\`

not in list

\`\`\`dart
int timesTwo(int x) {
  return x * 2;
}
\`\`\` 

## Mermaid Chart

\`\`\`mermaid
flowchart TD
        A(["Start"])
        A --> B{"Decision"}
        B --> C["Option A"]
        B --> D["Option B"]
\`\`\`

## Notices

There are three types of editable notice blocks that can be used to callout information:

some issue to tackle

## Image

![hello](https://images.unsplash.com/photo-1755529582689-7a158b8f9183)

`;

export const ReadOnly = (props: Props) => {
  return (
    <div style={{ padding: "1em 2em" }}>
      <DefaultEditor
        defaultValue={readonlyValue}
        readOnly={true}
        readOnlyWriteCheckboxes={true}
      />
    </div>
  );
};

const readonlyValue = `# Read Only  
The content of this editor cannot be edited:  

[a link](http://www.mdsilo.com) 

[dummy text](/doc/reference) 

A read-only editor with the exception that checkboxes remain toggleable: 

- [x] done
- [ ] todo
  
`;

export const RTL = (props: Props) => {
  return (
    <div style={{ padding: "1em 2em" }}>
      <DefaultEditor defaultValue={ltrValue} dir={"rtl"} />
    </div>
  );
};

const ltrValue = `# خوش آمدید

متن نمونه برای نمایش پشتیبانی از زبان‌های RTL نظیر فارسی، عربی، عبری و ...

- [x] آیتم اول
- [ ] آیتم دوم`;
