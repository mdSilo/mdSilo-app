import React from "react";
import { EmbedDescriptor } from "../types";

export type EmbedProps = {
  isSelected: boolean;
  isEditable: boolean;
  embed: EmbedDescriptor;
  attrs: {
    href: string;
    matches: RegExpMatchArray;
  };
};

export type FrameProps = EmbedProps & {
  src: string;
  title?: string;
  width?: string;
  height?: string;
  allow?: string;
};

export class Frame extends React.Component<FrameProps> {
  render() {
    const { isSelected, src, title, width="100%", height="420" } = this.props;

    return (
      <iframe
        className={isSelected ? "ProseMirror-selectednode" : ""}
        width={width} 
        height={height}
        src={src}
        title={title}
        allowFullScreen
      />
    );
  }
}

export class Airtable extends React.Component<EmbedProps> {
  render() {
    const { matches } = this.props.attrs;
    const shareId = matches[1];
    return (
      <Frame
        {...this.props}
        src={`https://airtable.com/embed/${shareId}`}
        title={`Airtable (${shareId})`}
      />
    );
  }
}

export class Codepen extends React.Component<EmbedProps> {
  render() {
    const normalizedUrl = this.props.attrs.href.replace(/\/pen\//, "/embed/");
    return <Frame {...this.props} src={normalizedUrl} title="Codepen Embed" />;
  }
}

export class Figma extends React.Component<EmbedProps> {
  render() {
    return (
      <Frame
        {...this.props}
        src={`https://www.figma.com/embed?embed_host=outline&url=${this.props.attrs.href}`}
        title="Figma Embed"
      />
    );
  }
}

export class Spotify extends React.Component<EmbedProps> {
  get pathname() {
    try {
      const parsed = new URL(this.props.attrs.href);
      return parsed.pathname;
    } catch (err) {
      return "";
    }
  }

  render() {
    const normalizedPath = this.pathname.replace(/^\/embed/, "/");
    let height: number;

    if (normalizedPath.includes("episode") || normalizedPath.includes("show")) {
      height = 232;
    } else if (normalizedPath.includes("track")) {
      height = 80;
    } else {
      height = 380;
    }

    return (
      <Frame
        {...this.props}
        width="100%"
        height={`${height}px`}
        src={`https://open.spotify.com/embed${normalizedPath}`}
        title="Spotify Embed"
        allow="encrypted-media"
      />
    );
  }
}

export class Trello extends React.Component<EmbedProps> {
  render() {
    const { matches } = this.props.attrs;
    const objectId = matches[2];

    if (matches[1] === "c") {
      return (
        <Frame
          {...this.props}
          width="316px"
          height="158px"
          src={`https://trello.com/embed/card?id=${objectId}`}
          title={`Trello Card (${objectId})`}
        />
      );
    }

    return (
      <Frame
        {...this.props}
        width="248px"
        height="185px"
        src={`https://trello.com/embed/board?id=${objectId}`}
        title={`Trello Board (${objectId})`}
      />
    );
  }
}

export class Youtube extends React.Component<EmbedProps> {
  render() {
    const { matches } = this.props.attrs;
    const videoId = matches[1];
    return (
      <Frame
        {...this.props}
        src={`https://www.youtube.com/embed/${videoId}?modestbranding=1`}
        title={`YouTube (${videoId})`}
      />
    );
  }
}

export class ItemCard extends React.Component<EmbedProps> {
  render() {
    return (
      <Frame
        {...this.props}
        src={`${this.props.attrs.href}`}
        title="ItemCard"
      />
    );
  }
}
