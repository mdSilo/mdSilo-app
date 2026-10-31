import { Node } from "prosemirror-model";
import { Plugin, PluginKey, Transaction } from "prosemirror-state";
import { findBlockNodes } from "prosemirror-utils";
import { Decoration, DecorationSet } from "prosemirror-view";
import { renderSmiles } from "../lib/smiles";

type PluginState = {
  decorationSet: DecorationSet;
  diagramVisibility: Record<string, boolean>;
};

type SaveDiagram = (svg: string, ty: string) => void;

// the libraries are loaded on the first diagram of their kind, once
let mermaidModule: Promise<typeof import("mermaid")> | undefined;
let echartsModule: Promise<typeof import("echarts")> | undefined;
let abcjsModule: Promise<typeof import("abcjs")> | undefined;
const loadMermaid = () => (mermaidModule ??= import("mermaid"));
const loadEcharts = () => (echartsModule ??= import("echarts"));
const loadAbcjs = () => (abcjsModule ??= import("abcjs"));

type StateProps = {
  doc: Node;
  name: string;
  dark: boolean;
  pluginState: PluginState;
  pluginKey: string; // 'mermaid' | 'echats' | 'abcjs' | 'smiles';
  onSave?: SaveDiagram;
};

function getNewState({
  doc,
  name,
  dark,
  pluginState,
  pluginKey,
  onSave,
}: StateProps) {
  const decorations: Decoration[] = [];

  // Find all blocks that represent diagrams
  const blocks: { node: Node; pos: number }[] = findBlockNodes(doc).filter(
    (item) =>
      item.node.type.name === name && item.node.attrs.language === pluginKey
  );

  blocks.forEach((block, idx) => {
    const diagramDecorationPos = block.pos + block.node.nodeSize;
    const existingDecorations = pluginState.decorationSet.find(
      block.pos,
      diagramDecorationPos
    );

    // Attempt to find the existing diagramId from the decoration, or assign
    // a new one if none exists yet.
    let diagramId = existingDecorations[0]?.spec["diagramId"];
    if (diagramId === undefined) {
      diagramId = `${pluginKey}-${Date.now()}-${idx}`;
    }

    // Make the diagram visible by default if it contains source code
    if (pluginState.diagramVisibility[diagramId] === undefined) {
      pluginState.diagramVisibility[diagramId] = !!block.node.textContent;
    }

    const visible = pluginState.diagramVisibility[diagramId] !== false;
    const diagramDecoration = Decoration.widget(
      block.pos + block.node.nodeSize,
      pluginKey === "mermaid"
        ? mermaidWidget(pluginState, diagramId, block, dark, onSave)
        : pluginKey === "echarts"
          ? echartsWidget(pluginState, diagramId, block, dark, onSave)
          : pluginKey === "smiles"
            ? smilesWidget(pluginState, diagramId, block, dark, onSave)
            : abcWidget(pluginState, diagramId, block, dark, onSave),
      {
        diagramId,
        // what the widget is drawn from: keep the drawn diagram while it is
        // the same, instead of drawing all of them again on every edit
        key: `${diagramId}:${visible}:${block.node.textContent}`,
      }
    );

    const attributes = { "data-diagram-id": "" + diagramId };
    if (pluginState.diagramVisibility[diagramId] !== false) {
      attributes["class"] = "code-hidden";
    }

    const diagramIdDecoration = Decoration.node(
      block.pos,
      block.pos + block.node.nodeSize,
      attributes,
      { diagramId }
    );

    decorations.push(diagramDecoration);
    decorations.push(diagramIdDecoration);
  });

  return {
    decorationSet: DecorationSet.create(doc, decorations),
    diagramVisibility: pluginState.diagramVisibility,
  };
}

const mermaidWidget =
  (
    pluginState: PluginState,
    diagramId: string,
    block: any,
    dark: boolean,
    onSave?: SaveDiagram
  ) =>
  () => {
    const mainWrapper = document.createElement("div");
    const diagramWrapper = document.createElement("div");
    diagramWrapper.classList.add("mermaid-diagram-wrapper");
    mainWrapper.append(diagramWrapper);

    if (pluginState.diagramVisibility[diagramId] === false) {
      mainWrapper.classList.add("diagram-hidden");
      return mainWrapper;
    }

    loadMermaid().then((module) => {
      const config: any = {
        startOnLoad: true,
        // the default, explicit: HTML in labels encoded, no click handlers
        securityLevel: "strict",
        htmlLabels: false,
        // no error diagram left in the page: the error is shown below
        suppressErrorRendering: true,
        fontFamily: "inherit",
      };

      if (dark) {
        config.theme = "dark";
        config.themeVariables = { darkMode: true };
      }

      module.default.initialize(config);
      module.default
        .render(`mermaid-diagram-${diagramId}`, block.node.textContent)
        .then(({ svg }) => {
          diagramWrapper.innerHTML = svg;

          if (onSave) {
            const saveDiagramButton = document.createElement("button");
            saveDiagramButton.innerText = "Save Diagram SVG";
            saveDiagramButton.type = "button";
            saveDiagramButton.classList.add("save-diagram-button");
            saveDiagramButton.addEventListener("click", () =>
              onSave(svg, "mermaid")
            );
            mainWrapper.append(saveDiagramButton);
          }
        })
        .catch((error) => {
          console.error(error);
          // mermaid removes its error diagram once render rejects
          diagramWrapper.textContent = `Mermaid: ${error?.message ?? error}`;
        });
    });

    return mainWrapper;
  };

const smilesWidget =
  (
    pluginState: PluginState,
    diagramId: string,
    block: any,
    dark: boolean,
    onSave?: SaveDiagram
  ) =>
  () => {
    const mainWrapper = document.createElement("div");
    const diagramWrapper = document.createElement("div");
    diagramWrapper.classList.add("smiles-diagram-wrapper");
    mainWrapper.append(diagramWrapper);

    if (pluginState.diagramVisibility[diagramId] === false) {
      mainWrapper.classList.add("diagram-hidden");
      return mainWrapper;
    }

    renderSmiles(block.node.textContent, dark)
      .then((svg) => {
        diagramWrapper.innerHTML = svg;

        if (onSave) {
          const saveDiagramButton = document.createElement("button");
          saveDiagramButton.innerText = "Save Structure SVG";
          saveDiagramButton.type = "button";
          saveDiagramButton.classList.add("save-diagram-button");
          // one file: the drawings of all the lines, side by side
          const svgs = [...diagramWrapper.querySelectorAll(":scope > svg")];
          saveDiagramButton.addEventListener("click", () =>
            onSave(svgs.length === 1 ? svg : combineSvgs(svgs), "smiles")
          );
          mainWrapper.append(saveDiagramButton);
        }
      })
      .catch((error) => {
        console.error(error);
        diagramWrapper.textContent = `SMILES: ${error?.message ?? error}`;
      });

    return mainWrapper;
  };

/** Drawings, side by side in one SVG, at the size they are drawn. */
function combineSvgs(svgs: Element[]): string {
  let x = 0;
  let height = 0;
  const parts = svgs.map((svg) => {
    const { style } = svg as SVGSVGElement;
    const w = parseFloat(style.width) || 0;
    const h = parseFloat(style.height) || 0;
    const part = svg.cloneNode(true) as Element;
    part.removeAttribute("style");
    part.setAttribute("x", `${x}`);
    part.setAttribute("width", `${w}`);
    part.setAttribute("height", `${h}`);
    x += w;
    height = Math.max(height, h);
    return part.outerHTML;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${x}" height="${height}" viewBox="0 0 ${x} ${height}">${parts.join("")}</svg>`;
}

const echartsWidget =
  (
    pluginState: PluginState,
    diagramId: string,
    block: any,
    dark: boolean,
    onSave?: SaveDiagram
  ) =>
  () => {
    const mainWrapper = document.createElement("div");
    const diagramWrapper = document.createElement("div");
    diagramWrapper.classList.add("echarts-diagram-wrapper");
    diagramWrapper.setAttribute("id", `echarts-diagram-${diagramId}`);
    mainWrapper.append(diagramWrapper);

    if (pluginState.diagramVisibility[diagramId] === false) {
      mainWrapper.classList.add("diagram-hidden");
      return mainWrapper;
    }

    loadEcharts().then((Echartsjs) => {
      try {
        const text = block.node.textContent;
        const echartsData = JSON.parse(text);
        Echartsjs.init(diagramWrapper, dark ? "dark" : undefined, {
          renderer: "svg",
          height: 600,
        }).setOption(echartsData, true);

        if (onSave) {
          const saveDiagramButton = document.createElement("button");
          saveDiagramButton.innerText = "Save Echarts SVG";
          saveDiagramButton.type = "button";
          saveDiagramButton.classList.add("save-diagram-button");
          const echartsToSave = Echartsjs.init(
            diagramWrapper,
            dark ? "dark" : undefined,
            { renderer: "svg", ssr: true, width: 800, height: 600 }
          );
          echartsToSave.setOption(echartsData, true);
          const svg = echartsToSave.renderToSVGString({ useViewBox: true });
          saveDiagramButton.addEventListener("click", () =>
            onSave(svg || "", "echarts")
          );
          mainWrapper.append(saveDiagramButton);
        }
      } catch (error) {
        console.error(error);
        const errorNode = document.getElementById(
          `echarts-diagram-${diagramId}`
        );
        if (errorNode) {
          diagramWrapper.appendChild(errorNode);
        }
      }
    });

    return mainWrapper;
  };

const abcWidget =
  (
    pluginState: PluginState,
    diagramId: string,
    block: any,
    dark: boolean,
    onSave?: SaveDiagram
  ) =>
  () => {
    const mainWrapper = document.createElement("div");
    const diagramWrapper = document.createElement("div");
    diagramWrapper.classList.add("abcjs-diagram-wrapper");
    diagramWrapper.setAttribute("id", `abcjs-diagram-${diagramId}`);
    mainWrapper.append(diagramWrapper);
    if (pluginState.diagramVisibility[diagramId] === false) {
      mainWrapper.classList.add("diagram-hidden");
      return mainWrapper;
    }

    loadAbcjs().then((ABCJS) => {
      try {
        const text = block.node.textContent;
        const visualObj = ABCJS.renderAbc(diagramWrapper, text, {});

        const audioWrapper = document.createElement("div");
        const audioId = `abcjs-audio-${diagramId}`;
        audioWrapper.setAttribute("id", audioId);
        audioWrapper.classList.add("abcjs-audio-wrapper");
        mainWrapper.append(audioWrapper);

        // add save button
        if (onSave) {
          const saveDiagramButton = document.createElement("button");
          saveDiagramButton.innerText = "Save Music Notation SVG";
          saveDiagramButton.type = "button";
          saveDiagramButton.classList.add("save-diagram-button");
          const svgElement = document.getElementById(
            `abcjs-diagram-${diagramId}`
          )?.firstElementChild;
          if (svgElement) {
            svgElement.setAttribute("xmlns", "http://www.w3.org/2000/svg");
          }
          const svg = svgElement?.outerHTML;
          saveDiagramButton.addEventListener("click", () =>
            onSave(svg || "", "abc")
          );
          mainWrapper.append(saveDiagramButton);
        }

        if (ABCJS.synth.supportsAudio()) {
          const controlOptions = {
            displayPlay: true,
            displayProgress: true,
            displayClock: true,
          };
          const synthControl = new ABCJS.synth.SynthController();
          synthControl.load(`#${audioId}`, null, controlOptions);
          synthControl.disable(true);
          const midiBuffer = new ABCJS.synth.CreateSynth();
          midiBuffer
            .init({
              visualObj: visualObj[0],
              millisecondsPerMeasure: 800,
              options: { pan: [-0.5, 0.5] },
            })
            .then(() => {
              synthControl.setTune(visualObj[0], true).then(() => {
                document
                  .querySelector(".abcjs-inline-audio")
                  ?.classList.remove("disabled");
                // workaroud play btn css issue
                const playBtns = document.querySelectorAll(".abcjs-btn");
                for (const btn of Array.from(playBtns)) {
                  btn.innerHTML = ">|";
                }
              });
            });
        } else {
          console.warn("audio is not supported on this browser");
        }
      } catch (error) {
        console.error(error);
        const errorNode = document.getElementById(`abcjs-diagram-${diagramId}`);
        if (errorNode) {
          diagramWrapper.appendChild(errorNode);
        }
      }
    });

    return mainWrapper;
  };

type PluginProps = {
  pluginKey: string;
  name: string;
  dark: boolean;
  onSave?: SaveDiagram;
};

export default function Diagram({
  pluginKey,
  name,
  dark,
  onSave,
}: PluginProps) {
  let diagramShown = false;

  return new Plugin<PluginState>({
    key: new PluginKey(pluginKey),
    state: {
      init: (_, { doc }) => {
        const pluginState: PluginState = {
          decorationSet: DecorationSet.create(doc, []),
          diagramVisibility: {},
        };
        return pluginState;
      },
      apply: (
        transaction: Transaction,
        pluginState: PluginState,
        oldState,
        state
      ) => {
        const nodeName = state.selection.$head.parent.type.name;
        const previousNodeName = oldState.selection.$head.parent.type.name;
        const codeBlockChanged =
          transaction.docChanged && [nodeName, previousNodeName].includes(name);
        const ySyncEdit = !!transaction.getMeta("y-sync$");
        const diagramMeta = transaction.getMeta(pluginKey);
        const diagramToggled = diagramMeta?.toggleDiagram !== undefined;

        if (diagramToggled) {
          pluginState.diagramVisibility[diagramMeta.toggleDiagram] =
            !pluginState.diagramVisibility[diagramMeta.toggleDiagram];
        }

        if (!diagramShown || codeBlockChanged || diagramToggled || ySyncEdit) {
          diagramShown = true;
          return getNewState({
            doc: transaction.doc,
            name,
            dark,
            pluginState,
            pluginKey,
            onSave,
          });
        }

        return {
          decorationSet: pluginState.decorationSet.map(
            transaction.mapping,
            transaction.doc
          ),
          diagramVisibility: pluginState.diagramVisibility,
        };
      },
    },
    view: (view) => {
      if (!diagramShown) {
        // we don't draw diagrams on code blocks on the first render as part of mounting
        // as it's expensive (relative to the rest of the document). Instead let
        // it render without a diagram and then trigger a defered render of Diagram
        // by updating the plugins metadata
        setTimeout(() => {
          view.dispatch(view.state.tr.setMeta(pluginKey, { loaded: true }));
        }, 10);
      }
      return {};
    },
    props: {
      decorations(state) {
        return this.getState(state)?.decorationSet;
      },
    },
  });
}
