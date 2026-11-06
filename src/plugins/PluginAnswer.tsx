import { create } from "zustand";
import copy from "copy-to-clipboard";
import { BaseModal } from "@/ui/BaseModal";
import { textOf, type SelectionResult } from "./selection";
import { saveImageToAssets } from "./image";
import { PluginImageView } from "./PluginImageView";

/**
 * What a plugin answers, shown in a dialog: of an action on the text selected
 * in the editor (to put after it, or copy), or of a command (to copy). An
 * image has its own buttons (PluginImageView); put in the note, it is saved
 * in `assets/` and inserted as Markdown.
 */
export type PluginAnswer = SelectionResult | { error: string };

/** What to put after the text selected: text, or Markdown (an image) */
export type AnswerInsert = string | { markdown: string };

type Shown = {
  title: string;
  answer: PluginAnswer;
  /** the answer can be put after the text selected */
  canInsert: boolean;
  done: (insert?: AnswerInsert) => void;
};

const useShown = create<{ shown?: Shown }>(() => ({}));

/** Shows the answer; done with what to insert, if chosen. */
export const showAnswer = (
  title: string,
  answer: PluginAnswer,
  canInsert = false,
) =>
  new Promise<AnswerInsert | undefined>((resolve) => {
    useShown.getState().shown?.done();
    useShown.setState({
      shown: {
        title,
        answer,
        canInsert,
        done: (insert) => {
          useShown.setState({ shown: undefined });
          resolve(insert);
        },
      },
    });
  });

/** The dialog of the answers of plugins, once in the app */
export function PluginAnswerModal() {
  const shown = useShown((state) => state.shown);
  if (!shown) return null;
  const { title, answer, canInsert, done } = shown;
  const text = "error" in answer ? answer.error : textOf(answer);
  if ("image" in answer) {
    const { image } = answer;
    return (
      <BaseModal title={title} isOpen handleClose={() => done()}>
        <PluginImageView
          image={image}
          imageClassName="max-h-[60vh]"
          onInsert={
            canInsert
              ? async () => done({ markdown: await saveImageToAssets(image) })
              : undefined
          }
        />
      </BaseModal>
    );
  }
  return (
    <BaseModal title={title} isOpen handleClose={() => done()}>
      <div
        className="overflow-y-auto text-sm max-h-80"
        style={{ contain: "paint" }}
      >
        {"error" in answer ? (
          <p className="text-error">{answer.error}</p>
        ) : "html" in answer ? (
          // sanitized in plugins/selection.ts
          <div dangerouslySetInnerHTML={{ __html: answer.html }} />
        ) : (
          <p className="whitespace-pre-wrap">{text}</p>
        )}
      </div>
      <div className="flex justify-end gap-2 mt-3">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            copy(text, { format: "text/plain" });
            done();
          }}
        >
          Copy
        </button>
        {canInsert ? (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!text}
            onClick={() => done(text)}
          >
            Insert after
          </button>
        ) : null}
      </div>
    </BaseModal>
  );
}
