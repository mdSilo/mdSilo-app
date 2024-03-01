export type Id = string | number;

export type Column = {
  id: Id;
  title: string;
  hdColor?: string;
  bgColor?: string;
  ftColor?: string;
};

export type Card = {
  id: Id;
  columnId: Id;
  content: string;
  bgColor?: string;
  ftColor?: string;
  items?: CardItem[];
};

export type CardItem = {
  name: string;
  uri: string;
  category: string; // note, book, podcast, video, ... 
};

export type KanbanData = {
  columns: Column[];
  cards: Card[];
  bgColor?: string;
  bgImg?: string;
};

export type Kanbans = Record<string, KanbanData>; // {name: data}
