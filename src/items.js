// Item database.  icon = anim name in the sprite manifest.

export const ITEMS = {
  dagger:     { name: 'Dagger', icon: 'item_dagger', type: 'weapon', atk: 1, price: 10,
                desc: 'A rusty starter blade. +1 ATK' },
  sword:      { name: 'Iron Sword', icon: 'item_sword', type: 'weapon', atk: 3, price: 60,
                desc: 'Solid smith work. +3 ATK' },
  greatsword: { name: 'Ember Blade', icon: 'item_greatsword', type: 'weapon', atk: 6, price: 150,
                desc: 'Gold-edged masterpiece. +6 ATK' },
  leather:    { name: 'Leather Vest', icon: 'item_armor_leather', type: 'armor', def: 1, price: 40,
                desc: 'Better than a shirt. +1 DEF' },
  chain:      { name: 'Chain Mail', icon: 'item_armor_chain', type: 'armor', def: 3, price: 100,
                desc: 'Rings of iron. +3 DEF' },
  plate:      { name: 'Plate Armor', icon: 'item_armor_plate', type: 'armor', def: 6, price: 220,
                desc: 'Fit for a knight. +6 DEF' },
  potion:     { name: 'Potion', icon: 'item_potion', type: 'potion', heal: 6, price: 15,
                desc: 'Restores 6 HP.', stack: true },
  potion_big: { name: 'Big Potion', icon: 'item_potion_big', type: 'potion', heal: 99, price: 40,
                desc: 'Restores all HP.', stack: true },
  knife:      { name: 'Throwing Knife', icon: 'item_knife', type: 'throw', dmg: 4, price: 8,
                desc: 'Flung at whatever you are facing. 4 damage at range.', stack: true },
  bomb:       { name: 'Black Powder Bomb', icon: 'item_bomb', type: 'throw', dmg: 9, price: 30,
                desc: 'Lobbed, then bursts. Heavy damage in a wide circle.', stack: true },
  antidote:   { name: 'Antidote', icon: 'item_antidote', type: 'cure', price: 18,
                desc: 'Purges venom and shrugs off the next dose.', stack: true },
  draught:    { name: 'Swift Draught', icon: 'item_draught', type: 'buff', price: 25,
                desc: 'Half again as fast for eight seconds.', stack: true },
  shard:      { name: 'Grim Shard', icon: 'item_shard', type: 'junk', price: 35,
                desc: 'The hard little core an elite leaves behind. Smiths want them.', stack: true },
  gel:        { name: 'Slime Gel', icon: 'item_gel', type: 'junk', price: 4,
                desc: 'Wobbly. The kid in Ashvale wants these.', stack: true },
  bone:       { name: 'Old Bone', icon: 'item_bone', type: 'junk', price: 6,
                desc: 'Dry skeleton bone. The sage needs three.', stack: true },
  letter:     { name: 'Sealed Letter', icon: 'item_letter', type: 'quest',
                desc: "Elder Rowan's letter for Sage Mira in Ashvale." },
  herb:       { name: 'Moonherb', icon: 'item_herb', type: 'quest', stack: true,
                desc: 'Silver-green sprigs from the deep forest.' },
  key:        { name: 'Bone Key', icon: 'item_key', type: 'quest',
                desc: 'Opens the barred gate in the Old Crypt.' },
  amulet:     { name: 'Ember Amulet', icon: 'item_amulet', type: 'quest',
                desc: 'The lost amulet of Emberdale, warm to the touch.' },
};

const SELL_RATIO = 0.4;

export function sellPrice(id) {
  const it = ITEMS[id];
  return it.price ? Math.max(1, Math.floor(it.price * SELL_RATIO)) : 0;
}
