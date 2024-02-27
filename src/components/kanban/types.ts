export type Id = string | number;

export type Column = {
  id: Id;
  title: string;
};

export type Card = {
  id: Id;
  columnId: Id;
  content: string;
  noteIds?: string[];
  items?: CardItem[]
};

export type CardItem = {
  name: string;
  uri: string[];
  category: string; // book, podcast, video, ... 
};

export type KanbanData = {
  columns: Column[];
  cards: Card[];
};
