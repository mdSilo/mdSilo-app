import React from "react";
import { EmbedDescriptor } from "../types";
import { Airtable, Codepen, Figma, ItemCard, Spotify, Trello, Youtube } from "./Frame";
import { TbBook, TbBrandAirtable, TbBrandCodepen, TbBrandFigma, TbBrandSpotify, TbBrandYoutube, TbLetterT } from "react-icons/tb";

const AirtableRegex = new RegExp("https://airtable.com/(?:embed/)?(shr.*)$");
const BilibiliRegex = /(?:https?:\/\/)?(www\.bilibili\.com)\/video\/([\w\d]+)?(\?\S+)?/i;
const CodepenRegex = new RegExp("^https://codepen.io/(.*?)/(pen|embed)/(.*)$");
const FigmaRegex = new RegExp(
  "https://([w.-]+\\.)?figma\\.com/(file|proto)/([0-9a-zA-Z]{22,128})(?:/.*)?$"
);
const SpotifyRegex = new RegExp("https?://open\\.spotify\\.com/(.*)$");
const TrelloRegex = /^https:\/\/trello\.com\/(c|b)\/([^/]*)(.*)?$/;
const YouTubeRegex = /(?:https?:\/\/)?(?:www\.)?youtu\.?be(?:\.com)?\/?.*(?:watch|embed)?(?:.*v=|v\/|\/)([a-zA-Z0-9_-]{11})$/i;
// itemcard of mdsilo as a embed object
const itemRegex = new RegExp("^https://mdsilo.com/embed/item/(.+)$");

export const embeds: EmbedDescriptor[] = [
  {
    title: "Airtable",
    keywords: "spreadsheet",
    defaultHidden: true,
    icon: () => (<TbBrandAirtable size={20} />),
    matcher: (url: string) =>  url.match(AirtableRegex) || false,
    component: Airtable,
  },
  {
    title: "Codepen",
    keywords: "code editor",
    defaultHidden: true,
    icon: () => (<TbBrandCodepen size={20} />),
    matcher: (url: string) =>  url.match(CodepenRegex) || false,
    component: Codepen,
  },
  {
    title: "Figma",
    keywords: "design",
    defaultHidden: true,
    icon: () => (<TbBrandFigma size={20} />),
    matcher: (url: string) =>  url.match(FigmaRegex) || false,
    component: Figma,
  },
  {
    title: "Spotify",
    keywords: "music streaming",
    defaultHidden: true,
    icon: () => (<TbBrandSpotify size={20} />),
    matcher: (url: string) =>  url.match(SpotifyRegex) || false,
    component: Spotify,
  },
  {
    title: "Trello",
    keywords: "music streaming",
    defaultHidden: true,
    icon: () => (<TbLetterT size={20} />),
    matcher: (url: string) =>  url.match(TrelloRegex) || false,
    component: Trello,
  },
  {
    title: "YouTube",
    keywords: "youtube video google",
    defaultHidden: true,
    icon: () => (<TbBrandYoutube size={20} />),
    matcher: (url: string) =>  url.match(YouTubeRegex) || false,
    component: Youtube,
  },
  {
    title: "ItemCard",
    keywords: "book documentary",
    defaultHidden: true,
    icon: () => (<TbBook size={20} />),
    matcher: (url: string) =>  url.match(itemRegex) || false,
    component: ItemCard,
  },
];

