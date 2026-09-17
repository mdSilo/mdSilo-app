import { Schema } from "prosemirror-model";
import type { MarkdownParser } from "prosemirror-markdown";
import ExtensionManager from "./core/ExtensionManager";
import render from "./components/renderToHtml";

// nodes
import Doc from "./nodes/Doc";
import Text from "./nodes/Text";
import Blockquote from "./nodes/Blockquote";
import BulletList from "./nodes/BulletList";
import CodeBlock from "./nodes/CodeBlock";
import CodeFence from "./nodes/CodeFence";
import CheckboxList from "./nodes/CheckboxList";
import CheckboxItem from "./nodes/CheckboxItem";
import HardBreak from "./nodes/HardBreak";
import Heading from "./nodes/Heading";
import HorizontalRule from "./nodes/HorizontalRule";
import ListItem from "./nodes/ListItem";
import OrderedList from "./nodes/OrderedList";
import Paragraph from "./nodes/Paragraph";
import Table from "./nodes/Table";
import TableCell from "./nodes/TableCell";
import TableHeadCell from "./nodes/TableHeadCell";
import TableRow from "./nodes/TableRow";
import Math from "./nodes/Math";
import MathDisplay from "./nodes/MathDisplay";

// marks
import Bold from "./marks/Bold";
import Code from "./marks/Code";
import Highlight from "./marks/Highlight";
import Italic from "./marks/Italic";
import Sub from "./marks/Sub";
import Sup from "./marks/Sup";
import Link from "./marks/Link";
import WikiLink from "./marks/WikiLink";
import Hashtag from "./marks/Hashtag";
import Strikethrough from "./marks/Strikethrough";
import TemplatePlaceholder from "./marks/Placeholder";
import Underline from "./marks/Underline";

// react nodes
import Embed from "./components/reactnodes/Embed";
import Image from "./components/reactnodes/Image";
import Notice from "./components/reactnodes/Notice";
import Itemcard from "./components/reactnodes/Itemcard";

const extensions = new ExtensionManager([
  new Doc(),
  new Text(),
  new HardBreak(),
  new Paragraph(),
  new Blockquote(),
  new BulletList(),
  new CodeBlock(),
  new CodeFence(),
  new CheckboxList(),
  new CheckboxItem(),
  new ListItem(),
  new Heading(),
  new HorizontalRule(),
  //new Table(),
  //new TableCell(),
  //new TableHeadCell(),
  //new TableRow(),
  //new Math(),
  //new MathDisplay(),
  new Bold(),
  new Code(),
  new Highlight(),
  new Italic(),
  new Sub(),
  new Sup(),
  new Link(),
  new WikiLink(), // FIXME: why wikilink's type parsed as link?
  new Hashtag(),
  new Strikethrough(),
  new TemplatePlaceholder(),
  new Underline(),
  new OrderedList(),
  new Embed(),
  new Notice(),
  new Image(),
  new Itemcard(),
]);

export const schema = new Schema({
  nodes: extensions.nodes,
  marks: extensions.marks,
});

export const parser = extensions.parser({
  schema,
  plugins: extensions.rulePlugins,
});

export const serializer = extensions.serializer();

export const renderToHtml = (markdown: string): string =>
  render(markdown, extensions.rulePlugins);
