import catalog from '../../../shared/characters.json';

export const characters = catalog.map((item) => ({
  ...item,
  url: `/characters/${item.id}.gltf`,
}));

export const defaultCharacter = characters[0].id;
export const characterUrl = (id?: string | null) =>
  characters.find((item) => item.id === id)?.url || characters[0].url;
