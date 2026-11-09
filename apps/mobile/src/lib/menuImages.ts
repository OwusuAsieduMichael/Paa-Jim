import type { ImageSourcePropType } from 'react-native';

// Photos bundled with the app, matched to menu items by name. A menu item's own
// image_url (set later from the dashboard / Supabase Storage) always wins.

export type Photo = { source: ImageSourcePropType; fit: 'cover' | 'contain' };

const food = (source: ImageSourcePropType): Photo => ({ source, fit: 'cover' });
const drink = (source: ImageSourcePropType): Photo => ({ source, fit: 'contain' });

export const PHOTOS = {
  jollofChicken: food(require('../../assets/menu/jollof-chicken.jpg')),
  jollofAssorted: food(require('../../assets/menu/jollof-assorted.jpg')),
  friedRiceChicken: food(require('../../assets/menu/fried-rice-chicken.jpg')),
  friedRiceAssorted: food(require('../../assets/menu/fried-rice-assorted.jpg')),
  riceFishStew: food(require('../../assets/menu/rice-fish-stew.jpg')),
  riceStewPlantain: food(require('../../assets/menu/rice-stew-plantain.jpg')),
  // These can photos have their own coloured backdrop, so they fill the whole tile.
  coke: food(require('../../assets/menu/drink-coke.jpg')),
  fanta: food(require('../../assets/menu/drink-fanta.jpg')),
  sprite: food(require('../../assets/menu/drink-sprite.jpg')),
  pepsi: food(require('../../assets/menu/drink-pepsi.jpg')),
  // These sit on plain white, so they are shown whole on a white tile.
  malt: drink(require('../../assets/menu/drink-malt.jpg')),
  water: drink(require('../../assets/menu/drink-water.jpg')),
} satisfies Record<string, Photo>;

export const COVER = require('../../assets/brand/cover.jpg') as ImageSourcePropType;
/** Home / menu banners, in the order they swipe. */
export const COVERS = [
  { key: 'order', source: COVER, label: 'Paa Jim Fast Food. Order, we deliver. Jollof rice, fried rice, rice and stew, drinks' },
  { key: 'delivery', source: require('../../assets/brand/cover-delivery.jpg') as ImageSourcePropType, label: 'Super fast delivery from Paa Jim, Effiduasi, Ashanti' },
];
export const LOGO = require('../../assets/brand/logo.png') as ImageSourcePropType;

// First match wins, so specific names come before the general ones.
const RULES: [RegExp, Photo][] = [
  [/coke|coca/i, PHOTOS.coke],
  [/fanta/i, PHOTOS.fanta],
  [/sprite/i, PHOTOS.sprite],
  [/pepsi/i, PHOTOS.pepsi],
  [/malt/i, PHOTOS.malt],
  [/water/i, PHOTOS.water],
  [/jollof.*chicken/i, PHOTOS.jollofChicken],
  [/jollof.*fish/i, PHOTOS.jollofChicken],
  [/jollof/i, PHOTOS.jollofAssorted],
  [/fried rice.*chicken/i, PHOTOS.friedRiceChicken],
  [/fried rice/i, PHOTOS.friedRiceAssorted],
  [/plantain|egg/i, PHOTOS.riceStewPlantain],
  [/stew|plain rice/i, PHOTOS.riceFishStew],
];

/** The photo for a menu item (or cart line), if there is one. */
export function photoFor(item: { name: string; imageUrl?: string | null }): Photo | undefined {
  if (item.imageUrl) return { source: { uri: item.imageUrl }, fit: 'cover' };
  return RULES.find(([re]) => re.test(item.name))?.[1];
}
