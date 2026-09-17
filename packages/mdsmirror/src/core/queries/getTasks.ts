import { Node } from "prosemirror-model";

export type Task = {
  text: string;
  completed: boolean;
};

/**
 * Iterates through the document to find all of the checklist items
 *
 * @param doc Prosemirror document node
 * @returns Array<Task>
 */
export function getTasks(doc: Node): Task[] {
  const tasks: Task[] = [];

  doc.descendants((node) => {
    if (!node.isBlock) {
      return false;
    }

    if (node.type.name === "checkbox_list") {
      node.content.forEach((listItem) => {
        let text = "";

        listItem.forEach((contentNode) => {
          if (contentNode.type.name === "paragraph") {
            text += contentNode.textContent;
          }
        });

        tasks.push({
          text,
          completed: listItem.attrs.checked,
        });
      });
    }

    return true;
  });

  return tasks;
}

const CHECKBOX_REGEX = /\[(X|\s|_|-)\]\s(.*)?/gi;

export function getTaskStatus(text: string) {
  const matches = [...text.matchAll(CHECKBOX_REGEX)];
  const total = matches.length;

  if (!total) {
    return {
      completed: 0,
      total: 0,
    };
  } else {
    const notCompleted = matches.reduce(
      (accumulator, match) =>
        match[1] === " " ? accumulator + 1 : accumulator,
      0
    );
    return {
      completed: total - notCompleted,
      total,
    };
  }
}
