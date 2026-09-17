import * as React from "react";
import { darkTheme, lightTheme } from "../src/styles/theme";
import MsEditor, { Props } from "../src";

const docSearchResults = [
  {
    title: "Product Roadmap",
    url: "/doc/product-roadmap",
  },
  {
    title: "Finances",
    url: "/doc/finances",
  },
  {
    title: "Security",
    url: "/doc/security",
  },
  {
    title: "Super secret stuff",
    url: "/doc/secret-stuff",
  },
  {
    title: "Supero notes",
    url: "/doc/supero-notes",
  },
  {
    title: "Meeting notes",
    url: "/doc/meeting-notes",
  },
];

class YoutubeEmbed extends React.Component<{
  attrs: any;
  isSelected: boolean;
}> {
  render() {
    const { attrs } = this.props;
    const videoId = attrs.matches[1];

    return (
      <iframe
        className={this.props.isSelected ? "ProseMirror-selectednode" : ""}
        src={`https://www.youtube.com/embed/${videoId}?modestbranding=1`}
      />
    );
  }
}

const embeds = [
  {
    title: "YouTube",
    keywords: "youtube video tube google",
    defaultHidden: true,
    // eslint-disable-next-line react/display-name
    icon: () => (
      <img
        src="https://upload.wikimedia.org/wikipedia/commons/7/75/YouTube_social_white_squircle_%282017%29.svg"
        width={24}
        height={24}
      />
    ),
    matcher: (url: string) => {
      const match = url.match(
        /(?:https?:\/\/)?(?:www\.)?youtu\.?be(?:\.com)?\/?.*(?:watch|embed)?(?:.*v=|v\/|\/)([a-zA-Z0-9_-]{11})$/i
      );
      return match ? match : false;
    },
    component: YoutubeEmbed,
  },
];

export default function Editor(props: Props) {
  const { body } = document;
  if (body)
    body.style.backgroundColor = props.dark
      ? darkTheme.background
      : lightTheme.background;

  return (
    <div style={{ padding: "1em 2em" }}>
      <MsEditor
        onChange={(text, json) => {
          console.log("text: ", text, "JSON: ", json);
          // localStorage.setItem("saved", text);
        }}
        onCreateLink={(title) => {
          console.log("create", title);
          // Delay to simulate time taken for remote API request to complete
          return new Promise((resolve, reject) => {
            setTimeout(() => {
              if (title !== "error") {
                return resolve(
                  `/doc/${encodeURIComponent(title.toLowerCase())}`
                );
              } else {
                reject("500 error");
              }
            }, 1500);
          });
        }}
        onSearchLink={async (term) => {
          console.log("Searched link: ", term);
          // Delay to simulate time taken for remote API request to complete
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve(
                docSearchResults.filter((result) =>
                  result.title.toLowerCase().includes(term.toLowerCase())
                )
              );
            }, Math.random() * 500);
          });
        }}
        onSearchRemote={async (term) => {
          console.log("search text remote:", term);
          // Simulate remote search returning SearchResult[]
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve(
                docSearchResults.filter((result) =>
                  result.title.toLowerCase().includes(term.toLowerCase())
                )
              );
            }, Math.random() * 500);
          });
        }}
        onSearchHashTag={async (term) => {
          console.log("Searched hashtag: ", term);
          // Delay to simulate time taken for remote API request to complete
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve(
                docSearchResults.filter((result) =>
                  result.title.toLowerCase().includes(term.toLowerCase())
                )
              );
            }, Math.random() * 500);
          });
        }}
        onClickHashtag={(txt) => console.log("hashtag text:", txt)}
        onOpenLink={(href) => {
          console.log("open here", href);
          window.open(href, "_blank");
        }}
        embeds={embeds}
        // disables={['image']}
        {...props}
      />
    </div>
  );
}
