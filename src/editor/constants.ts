import { Descendant } from 'slate';
import { ElementType } from 'editor/slate';
import { createNodeId } from './plugins/withNodeId';

export const getDefaultEditorValue = (): Descendant[] => [
  { id: createNodeId(), type: ElementType.Paragraph, children: [{ text: '' }] },
];

export const getIndexDemoEditorValue = (): Descendant[] => [
  { id: "ea3c58df-ba42-4c24-9d59-409eacd15b76", type: ElementType.Paragraph, children: [{text:"A Knowledge Silo equipped with WYSIWYG Editor and Markdown support, runs entirely in web browser and has Local File System Access ability; it thus functions the same as a native app."}] },
  { id: "f0a0eff2-ee22-4d75-aef6-2b763799a8e8", type: ElementType.Paragraph, children: [{text:"Free and Open Source. No registration or installation is required."}] },
  { id: "e363b22d-bcce-4852-8430-ab81d526499e", type: ElementType.Paragraph, children: [{text:"Try Live Demo to see more and start writing..."}] },
];
